use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::atomic::atomic_write_file;
use crate::frontmatter::{parse_frontmatter, Frontmatter};
use crate::id::generate_id;
use crate::idem::{check_idem_key, record_idem_key};
use crate::paths::{ensure_vault_structure, get_vault_path, slugify};
use crate::security::{calculate_etag, scan_and_sanitize_secrets};

fn get_iso_timestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn get_date_string() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

// -----------------------------------------------------------------------------
// 1. Write Observation (Append-Only Journal)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct WriteObservationParams<'a> {
    pub scope: &'a str,
    pub workspace_path: Option<&'a Path>,
    pub agent_id: &'a str,
    pub agent_type: &'a str,
    pub content: &'a str,
    pub kind: &'a str,
    pub tags: Vec<String>,
    pub refs: Vec<String>,
    pub source: Option<&'a str>,
    pub confidence: f64,
    pub idem_key: Option<&'a str>,
}

pub fn write_observation(params: WriteObservationParams) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(params.scope, params.workspace_path)?;

    if let Some(idem) = params.idem_key {
        if let Some(cached) = check_idem_key(&vault_path, idem) {
            return Ok(cached);
        }
    }

    let date_str = get_date_string();
    let journal_dir = vault_path.join("90-journal").join(&date_str);
    if !journal_dir.exists() {
        fs::create_dir_all(&journal_dir)
            .map_err(|e| format!("Falha ao criar diretório do journal {:?}: {}", journal_dir, e))?;
    }

    let safe_agent_id = slugify(&scan_and_sanitize_secrets(params.agent_id, false)?.text);
    let journal_file = journal_dir.join(format!("{}.md", safe_agent_id));
    let ulid = generate_id();
    let now = Utc::now();
    let time_str = now.format("%H:%M:%S").to_string();

    let mut header = String::new();
    if !journal_file.exists() {
        header = format!(
            "---\ncgli_schema: journal/v1\ndate: \"{}\"\nagent_id: \"{}\"\nagent_type: \"{}\"\nscope: \"{}\"\n---\n\n# Journal do Agente: {} ({})\n\n",
            date_str, params.agent_id, params.agent_type, params.scope, params.agent_id, date_str
        );
    }

    let tags_arr: Vec<String> = params
        .tags
        .iter()
        .map(|t| scan_and_sanitize_secrets(t, false).map(|r| r.text).unwrap_or_else(|_| t.clone()))
        .collect();

    let refs_arr: Vec<String> = params
        .refs
        .iter()
        .map(|r| scan_and_sanitize_secrets(r, false).map(|res| res.text).unwrap_or_else(|_| r.clone()))
        .collect();

    let safe_kind = scan_and_sanitize_secrets(params.kind, false)?.text;
    let safe_source = match params.source {
        Some(s) => Some(scan_and_sanitize_secrets(s, false)?.text),
        None => None,
    };

    let mut meta_parts = vec![
        format!("**tipo:** {}", safe_kind),
        format!("**confiança:** {}", params.confidence),
    ];
    if let Some(src) = &safe_source {
        meta_parts.push(format!("**fonte:** `{}`", src));
    }
    if !tags_arr.is_empty() {
        let tag_strs: Vec<String> = tags_arr.iter().map(|t| format!("#{}", t)).collect();
        meta_parts.push(format!("**tags:** {}", tag_strs.join(" ")));
    }

    let safe_content = scan_and_sanitize_secrets(params.content, false)?.text;

    let mut entry = format!(
        "## {} · {} · {}\n^{}\n{}\n\n{}\n",
        time_str,
        safe_kind,
        ulid,
        ulid,
        meta_parts.join(" · "),
        safe_content.trim()
    );

    if !refs_arr.is_empty() {
        entry.push_str(&format!("\n**refs:** {}\n", refs_arr.join(" · ")));
    }
    entry.push_str("\n---\n\n");

    let full_to_append = format!("{}{}", header, entry);
    // Append to file
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&journal_file)
        .map_err(|e| format!("Falha ao abrir journal {:?}: {}", journal_file, e))?;

    file.write_all(full_to_append.as_bytes())
        .map_err(|e| format!("Falha ao escrever no journal {:?}: {}", journal_file, e))?;

    let rel_path = journal_file
        .strip_prefix(&vault_path)
        .unwrap_or(&journal_file)
        .to_string_lossy()
        .replace('\\', "/");

    let result = json!({
        "success": true,
        "id": ulid,
        "scope": params.scope,
        "file": journal_file.to_string_lossy().to_string(),
        "relativePath": rel_path
    });

    if let Some(idem) = params.idem_key {
        record_idem_key(&vault_path, idem, &result);
    }

    Ok(result)
}

// -----------------------------------------------------------------------------
// 2. Create Note (First-Class Obsidian Document)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct CreateNoteParams<'a> {
    pub scope: &'a str,
    pub workspace_path: Option<&'a Path>,
    pub note_type: &'a str,
    pub title: &'a str,
    pub content: &'a str,
    pub author: &'a str,
    pub tags: Vec<String>,
    pub links: HashMap<String, Vec<String>>,
    pub node_id: Option<&'a str>,
    pub confidence: f64,
    pub idem_key: Option<&'a str>,
}

pub fn create_note(params: CreateNoteParams) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(params.scope, params.workspace_path)?;

    if let Some(idem) = params.idem_key {
        if let Some(cached) = check_idem_key(&vault_path, idem) {
            return Ok(cached);
        }
    }

    let ulid = generate_id();
    let sanitized_title = scan_and_sanitize_secrets(
        if params.title.is_empty() { "Sem título" } else { params.title },
        false,
    )?
    .text;
    let slug = slugify(&sanitized_title);
    let filename = format!("{}--{}--{}.md", ulid, params.note_type, slug);

    let subfolder = match params.note_type {
        "knowledge" => "50-knowledge",
        "learning" => "50-learnings",
        "rule" | "preference" => "30-preferences",
        "task" => "60-tasks",
        "entity" => "70-entities",
        _ if params.scope == "global" && params.note_type == "decision" => "50-learnings",
        _ => "40-decisions",
    };

    let target_dir = vault_path.join(subfolder);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Falha ao criar subpasta {:?}: {}", target_dir, e))?;
    }

    let target_file = target_dir.join(&filename);
    let now = get_iso_timestamp();

    let tags_arr: Vec<String> = params
        .tags
        .iter()
        .map(|t| scan_and_sanitize_secrets(t, false).map(|r| r.text).unwrap_or_else(|_| t.clone()))
        .collect();

    let safe_content = scan_and_sanitize_secrets(params.content, false)?.text;
    let note_body = format!(
        "# {}\n\n{}\n\n---\n*Criado pelo agente {} no CGLI ({})*\n",
        sanitized_title,
        safe_content.trim(),
        params.author,
        params.scope
    );
    let etag = calculate_etag(&note_body);

    let fm = Frontmatter {
        schema: format!("{}/v1", params.note_type),
        id: ulid.clone(),
        rev: 1,
        etag: etag.clone(),
        title: sanitized_title.clone(),
        created: now.clone(),
        updated: now.clone(),
        scope: params.scope.to_string(),
        confidence: params.confidence,
        author_agent_id: params.author.to_string(),
        status: "active".to_string(),
        tags: tags_arr,
        canvas_node_id: params.node_id.map(|s| s.to_string()),
        links: params.links,
        ..Default::default()
    };

    let full_doc = format!("{}{}", fm.to_yaml(), note_body);
    atomic_write_file(&target_file, &full_doc)?;

    let rel_path = target_file
        .strip_prefix(&vault_path)
        .unwrap_or(&target_file)
        .to_string_lossy()
        .replace('\\', "/");

    let result = json!({
        "success": true,
        "id": ulid,
        "title": sanitized_title,
        "type": params.note_type,
        "rev": 1,
        "etag": etag,
        "scope": params.scope,
        "file": target_file.to_string_lossy().to_string(),
        "relativePath": rel_path
    });

    if let Some(idem) = params.idem_key {
        record_idem_key(&vault_path, idem, &result);
    }

    Ok(result)
}

// -----------------------------------------------------------------------------
// 3. List Notes
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub scope: String,
    pub created: String,
    pub updated: String,
    pub rev: u32,
    pub etag: String,
    pub confidence: f64,
    pub status: String,
    pub tags: Vec<String>,
    pub relative_path: String,
    pub full_path: String,
}

pub fn list_notes(
    scope: &str,
    workspace_path: Option<&Path>,
    note_type_filter: Option<&str>,
) -> Result<Vec<NoteSummary>, String> {
    let vault_path = ensure_vault_structure(scope, workspace_path)?;
    let mut results = Vec::new();

    fn scan_dir(
        dir: &Path,
        vault_path: &Path,
        scope: &str,
        filter: Option<&str>,
        out: &mut Vec<NoteSummary>,
    ) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                if !file_name.starts_with('.') && file_name != "00-inbox" {
                    scan_dir(&path, vault_path, scope, filter, out);
                }
            } else if path.is_file() && file_name.ends_with(".md") && file_name != "README.md" {
                if let Ok(raw) = fs::read_to_string(&path) {
                    let parsed = parse_frontmatter(&raw);
                    let rel_path = path
                        .strip_prefix(vault_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");

                    let mut id = String::new();
                    let mut title = file_name.trim_end_matches(".md").to_string();
                    let mut ntype = "note".to_string();
                    let mut created = String::new();
                    let mut updated = String::new();
                    let mut rev = 1;
                    let mut etag = String::new();
                    let mut confidence = 0.85;
                    let mut status = "active".to_string();
                    let mut tags = Vec::new();

                    if let Some(fm) = parsed.frontmatter {
                        if !fm.id.is_empty() {
                            id = fm.id;
                        }
                        if !fm.title.is_empty() {
                            title = fm.title;
                        }
                        if !fm.schema.is_empty() {
                            ntype = fm
                                .schema
                                .split('/')
                                .next()
                                .unwrap_or("note")
                                .to_string();
                        }
                        created = fm.created;
                        updated = fm.updated;
                        rev = fm.rev;
                        etag = fm.etag;
                        confidence = fm.confidence;
                        status = fm.status;
                        tags = fm.tags;
                    }

                    if updated.is_empty() {
                        updated = created.clone();
                    }

                    if filter.is_none() || filter == Some(&ntype) {
                        out.push(NoteSummary {
                            id,
                            title,
                            note_type: ntype,
                            scope: scope.to_string(),
                            created,
                            updated,
                            rev,
                            etag,
                            confidence,
                            status,
                            tags,
                            relative_path: rel_path,
                            full_path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }

    scan_dir(&vault_path, &vault_path, scope, note_type_filter, &mut results);
    Ok(results)
}

// -----------------------------------------------------------------------------
// 4. Get Note
// -----------------------------------------------------------------------------

pub fn get_note(scope: &str, workspace_path: Option<&Path>, id_or_path: &str) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(scope, workspace_path)?;
    let mut target_path: Option<PathBuf> = None;

    let as_path = PathBuf::from(id_or_path);
    if as_path.exists() {
        target_path = Some(as_path);
    } else {
        let all = list_notes(scope, workspace_path, None)?;
        let found = all
            .iter()
            .find(|n| n.id == id_or_path)
            .or_else(|| all.iter().find(|n| n.relative_path == id_or_path))
            .or_else(|| all.iter().find(|n| n.relative_path.contains(id_or_path)));

        if let Some(note) = found {
            target_path = Some(PathBuf::from(&note.full_path));
        }
    }

    match target_path {
        Some(p) if p.exists() => {
            let content = fs::read_to_string(&p)
                .map_err(|e| format!("Falha ao ler nota {:?}: {}", p, e))?;
            let rel_path = p
                .strip_prefix(&vault_path)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            Ok(json!({
                "success": true,
                "file": p.to_string_lossy().to_string(),
                "relativePath": rel_path,
                "content": content
            }))
        }
        _ => Ok(json!({
            "success": false,
            "error": format!("Nota '{}' não encontrada no Vault {}", id_or_path, scope)
        })),
    }
}

// -----------------------------------------------------------------------------
// 5. Update Note (Optimistic Concurrency: Rev + ETag + Conflict Note)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct UpdateNoteParams<'a> {
    pub id: &'a str,
    pub expect_rev: Option<u32>,
    pub expect_etag: Option<&'a str>,
    pub content: &'a str,
    pub file: Option<&'a str>,
    pub author: &'a str,
    pub scope: &'a str,
    pub workspace_path: Option<&'a Path>,
    pub idem_key: Option<&'a str>,
}

pub fn update_note(params: UpdateNoteParams) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(params.scope, params.workspace_path)?;

    if let Some(idem) = params.idem_key {
        if let Some(cached) = check_idem_key(&vault_path, idem) {
            return Ok(cached);
        }
    }

    let all = list_notes(params.scope, params.workspace_path, None)?;
    let note_info = all
        .iter()
        .find(|n| {
            n.id == params.id
                || n.relative_path == params.id
                || params
                    .file
                    .map(|f| n.relative_path.contains(f))
                    .unwrap_or(false)
        })
        .ok_or_else(|| format!("Nota com ID '{}' não encontrada no Vault {}", params.id, params.scope))?;

    let note_path = PathBuf::from(&note_info.full_path);
    let raw_content = fs::read_to_string(&note_path)
        .map_err(|e| format!("Falha ao ler arquivo {:?}: {}", note_path, e))?;

    let parsed = parse_frontmatter(&raw_content);
    let current_rev = parsed.frontmatter.as_ref().map(|f| f.rev).unwrap_or(1);
    let calculated_current_etag = calculate_etag(&parsed.body);
    let current_etag = parsed
        .frontmatter
        .as_ref()
        .map(|f| {
            if f.etag.is_empty() {
                calculated_current_etag.clone()
            } else {
                f.etag.clone()
            }
        })
        .unwrap_or_else(|| calculated_current_etag.clone());

    let rev_mismatch = params
        .expect_rev
        .map(|exp| exp != current_rev)
        .unwrap_or(false);
    let etag_mismatch = params
        .expect_etag
        .map(|exp| !exp.is_empty() && exp != current_etag)
        .unwrap_or(false);

    if rev_mismatch || etag_mismatch {
        let conflict_ulid = generate_id();
        let conflict_filename = format!("{}--conflict-{}.md", note_info.id, conflict_ulid);
        let conflict_dir = note_path
            .parent()
            .ok_or_else(|| "Caminho de diretório inválido".to_string())?;
        let conflict_path = conflict_dir.join(&conflict_filename);

        let now = get_iso_timestamp();
        let safe_content = scan_and_sanitize_secrets(params.content, false)?.text;
        let conflict_fm = format!(
            "---\ncgli_schema: conflict/v1\nid: \"{}\"\nconflicts_with: \"{}\"\nbase_rev: {}\nactual_rev: {}\nbase_etag: \"{}\"\nactual_etag: \"{}\"\ncreated: \"{}\"\nauthor:\n  agent_id: \"{}\"\nstatus: \"conflict\"\n---\n\n# Conflito de Modificação em [[{}]]\n\n> ⚠️ Detectada divergência de revisão (esperada: {}, atual em disco: {}).\n\n### Conteúdo Conflitante Submetido:\n\n{}\n",
            conflict_ulid,
            note_info.id,
            params.expect_rev.unwrap_or(current_rev),
            current_rev,
            params.expect_etag.unwrap_or(""),
            current_etag,
            now,
            params.author,
            note_info.title,
            params.expect_rev.map(|r| r.to_string()).unwrap_or_else(|| "N/A".to_string()),
            current_rev,
            safe_content
        );

        atomic_write_file(&conflict_path, &conflict_fm)?;

        let rel_conflict = conflict_path
            .strip_prefix(&vault_path)
            .unwrap_or(&conflict_path)
            .to_string_lossy()
            .replace('\\', "/");

        let conflict_res = json!({
            "success": false,
            "conflict": true,
            "statusCode": 409,
            "id": note_info.id,
            "conflictId": conflict_ulid,
            "conflictFile": rel_conflict,
            "expectedRev": params.expect_rev,
            "actualRev": current_rev,
            "expectedEtag": params.expect_etag,
            "actualEtag": current_etag,
            "message": format!(
                "Conflito de revisão detectado para a nota '{}'. O conteúdo concorrente foi preservado em '{}' sem perda de dados.",
                note_info.title,
                conflict_path.file_name().unwrap_or_default().to_string_lossy()
            )
        });

        if let Some(idem) = params.idem_key {
            record_idem_key(&vault_path, idem, &conflict_res);
        }
        return Ok(conflict_res);
    }

    let new_rev = current_rev + 1;
    let now = get_iso_timestamp();
    let safe_content = scan_and_sanitize_secrets(params.content, false)?.text;
    let new_etag = calculate_etag(&safe_content);

    let mut fm = parsed.frontmatter.unwrap_or_default();
    fm.rev = new_rev;
    fm.etag = new_etag.clone();
    fm.updated = now;

    let new_doc = format!("{}{}\n", fm.to_yaml(), safe_content.trim());
    atomic_write_file(&note_path, &new_doc)?;

    let rel_path = note_path
        .strip_prefix(&vault_path)
        .unwrap_or(&note_path)
        .to_string_lossy()
        .replace('\\', "/");

    let result = json!({
        "success": true,
        "id": note_info.id,
        "title": note_info.title,
        "rev": new_rev,
        "etag": new_etag,
        "file": note_path.to_string_lossy().to_string(),
        "relativePath": rel_path
    });

    if let Some(idem) = params.idem_key {
        record_idem_key(&vault_path, idem, &result);
    }

    Ok(result)
}

// -----------------------------------------------------------------------------
// 6. Append to Note
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct AppendToNoteParams<'a> {
    pub id: &'a str,
    pub section_title: &'a str,
    pub content: &'a str,
    pub author: &'a str,
    pub scope: &'a str,
    pub workspace_path: Option<&'a Path>,
    pub idem_key: Option<&'a str>,
}

pub fn append_to_note(params: AppendToNoteParams) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(params.scope, params.workspace_path)?;

    if let Some(idem) = params.idem_key {
        if let Some(cached) = check_idem_key(&vault_path, idem) {
            return Ok(cached);
        }
    }

    let all = list_notes(params.scope, params.workspace_path, None)?;
    let note_info = all
        .iter()
        .find(|n| n.id == params.id || n.relative_path == params.id)
        .ok_or_else(|| format!("Nota com ID '{}' não encontrada no Vault {}", params.id, params.scope))?;

    let note_path = PathBuf::from(&note_info.full_path);
    let raw_content = fs::read_to_string(&note_path)
        .map_err(|e| format!("Falha ao ler arquivo {:?}: {}", note_path, e))?;

    let parsed = parse_frontmatter(&raw_content);
    let current_rev = parsed.frontmatter.as_ref().map(|f| f.rev).unwrap_or(1);
    let new_rev = current_rev + 1;
    let now = get_iso_timestamp();

    let safe_section = scan_and_sanitize_secrets(
        if params.section_title.is_empty() { "Nova Seção" } else { params.section_title },
        false,
    )?
    .text;
    let safe_content = scan_and_sanitize_secrets(params.content, false)?.text;

    let appended_body = format!(
        "{}\n\n## {}\n*Adicionado por {} em {}*\n\n{}\n",
        parsed.body.trim(),
        safe_section,
        params.author,
        now,
        safe_content.trim()
    );
    let new_etag = calculate_etag(&appended_body);

    let mut fm = parsed.frontmatter.unwrap_or_default();
    fm.rev = new_rev;
    fm.etag = new_etag.clone();
    fm.updated = now;

    let new_doc = format!("{}{}\n", fm.to_yaml(), appended_body.trim());
    atomic_write_file(&note_path, &new_doc)?;

    let rel_path = note_path
        .strip_prefix(&vault_path)
        .unwrap_or(&note_path)
        .to_string_lossy()
        .replace('\\', "/");

    let result = json!({
        "success": true,
        "id": note_info.id,
        "title": note_info.title,
        "rev": new_rev,
        "etag": new_etag,
        "file": note_path.to_string_lossy().to_string(),
        "relativePath": rel_path
    });

    if let Some(idem) = params.idem_key {
        record_idem_key(&vault_path, idem, &result);
    }

    Ok(result)
}

// -----------------------------------------------------------------------------
// 7. Search Notes (Scoring Relevance + Recency + Confidence)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub scope: String,
    pub created: String,
    pub updated: String,
    pub rev: u32,
    pub etag: String,
    pub confidence: f64,
    pub status: String,
    pub tags: Vec<String>,
    pub relative_path: String,
    pub full_path: String,
    pub score: f64,
    pub snippet: String,
}

pub fn search_notes(
    query: &str,
    scope: &str,
    note_type: Option<&str>,
    workspace_path: Option<&Path>,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let scopes: Vec<&str> = if scope == "all" {
        vec!["project", "global"]
    } else {
        vec![scope]
    };

    let mut all_notes = Vec::new();
    for s in scopes {
        if let Ok(list) = list_notes(s, workspace_path, note_type) {
            all_notes.extend(list);
        }
    }

    let query_terms: Vec<String> = query
        .to_lowercase()
        .split_whitespace()
        .filter(|t| t.len() > 1)
        .map(|t| t.to_string())
        .collect();

    if query_terms.is_empty() {
        let results = all_notes
            .into_iter()
            .take(limit)
            .map(|n| SearchHit {
                id: n.id,
                title: n.title,
                note_type: n.note_type,
                scope: n.scope,
                created: n.created,
                updated: n.updated,
                rev: n.rev,
                etag: n.etag,
                confidence: n.confidence,
                status: n.status,
                tags: n.tags,
                relative_path: n.relative_path,
                full_path: n.full_path,
                score: 1.0,
                snippet: String::new(),
            })
            .collect();
        return Ok(results);
    }

    let now_millis = Utc::now().timestamp_millis();
    let mut scored = Vec::new();

    for note in all_notes {
        if let Ok(raw_content) = fs::read_to_string(&note.full_path) {
            let lower_content = raw_content.to_lowercase();
            let lower_title = note.title.to_lowercase();
            let lower_rel = note.relative_path.to_lowercase();
            let mut score = 0.0;

            for term in &query_terms {
                if lower_title.contains(term) {
                    score += 15.0;
                }
                if lower_rel.contains(term) {
                    score += 8.0;
                }
                let occurrences = lower_content.matches(term).count();
                if occurrences > 0 {
                    score += (occurrences.min(10) as f64) * 2.0;
                }
            }

            if score > 0.0 {
                // Boost por tipo de nota
                match note.note_type.as_str() {
                    "rule" | "preference" => score += 10.0,
                    "decision" => score += 8.0,
                    "knowledge" | "learning" => score += 5.0,
                    "task" | "entity" => score += 2.0,
                    _ => {}
                }

                // Boost por recência
                let time_str = if !note.updated.is_empty() {
                    &note.updated
                } else {
                    &note.created
                };
                if let Ok(dt) = DateTime::parse_from_rfc3339(time_str) {
                    let age_hours = (now_millis - dt.timestamp_millis()) as f64 / (1000.0 * 3600.0);
                    if age_hours <= 24.0 {
                        score += 10.0;
                    } else if age_hours <= 24.0 * 7.0 {
                        score += 5.0;
                    } else if age_hours <= 24.0 * 30.0 {
                        score += 2.0;
                    }
                }

                let conf = if note.confidence > 0.0 {
                    note.confidence
                } else {
                    0.85
                };
                score = (score * conf * 10.0).round() / 10.0;

                let first_term = &query_terms[0];
                let snippet = if let Some(idx) = lower_content.find(first_term) {
                    let start = idx.saturating_sub(60);
                    let end = (idx + 140).min(raw_content.len());
                    let part = raw_content[start..end].replace('\n', " ");
                    let prefix = if start > 0 { "..." } else { "" };
                    let suffix = if end < raw_content.len() { "..." } else { "" };
                    format!("{}{}{}", prefix, part.trim(), suffix)
                } else {
                    let end = 150.min(raw_content.len());
                    format!("{}...", raw_content[..end].replace('\n', " ").trim())
                };

                scored.push(SearchHit {
                    id: note.id,
                    title: note.title,
                    note_type: note.note_type,
                    scope: note.scope,
                    created: note.created,
                    updated: note.updated,
                    rev: note.rev,
                    etag: note.etag,
                    confidence: note.confidence,
                    status: note.status,
                    tags: note.tags,
                    relative_path: note.relative_path,
                    full_path: note.full_path,
                    score,
                    snippet,
                });
            }
        }
    }

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Ok(scored)
}

// -----------------------------------------------------------------------------
// 8. Build Context Pack
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextPackResult {
    pub success: bool,
    pub query: String,
    pub notes_count: usize,
    pub estimated_tokens: usize,
    pub markdown: String,
}

pub fn build_context_pack(
    query: &str,
    budget_tokens: usize,
    scope: &str,
    workspace_path: Option<&Path>,
    include_journals: bool,
    attached_memory_ids: &[String],
) -> Result<ContextPackResult, String> {
    let mut attached_hits = Vec::new();
    let attached_set: HashSet<&str> = attached_memory_ids.iter().map(|s| s.as_str()).collect();

    if !attached_set.is_empty() {
        let scopes = if scope == "all" {
            vec!["project", "global"]
        } else {
            vec![scope]
        };
        for s in scopes {
            if let Ok(notes) = list_notes(s, workspace_path, None) {
                for note in notes {
                    let base_name = Path::new(&note.relative_path)
                        .file_name()
                        .map(|f| f.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if attached_set.contains(note.id.as_str())
                        || attached_set.contains(note.relative_path.as_str())
                        || attached_set.contains(base_name.as_str())
                    {
                        attached_hits.push((note, true));
                    }
                }
            }
        }
    }

    let hits = search_notes(query, scope, None, workspace_path, 10)?;
    let relevant_hits: Vec<_> = hits
        .into_iter()
        .filter(|h| include_journals || h.note_type != "journal")
        .collect();

    let mut combined_hits: Vec<(NoteSummary, bool)> = attached_hits;
    let mut seen_ids: HashSet<String> = combined_hits.iter().map(|(n, _)| n.id.clone()).collect();

    for h in relevant_hits {
        if !seen_ids.contains(&h.id) {
            seen_ids.insert(h.id.clone());
            combined_hits.push((
                NoteSummary {
                    id: h.id,
                    title: h.title,
                    note_type: h.note_type,
                    scope: h.scope,
                    created: h.created,
                    updated: h.updated,
                    rev: h.rev,
                    etag: h.etag,
                    confidence: h.confidence,
                    status: h.status,
                    tags: h.tags,
                    relative_path: h.relative_path,
                    full_path: h.full_path,
                },
                false,
            ));
        }
    }

    if combined_hits.is_empty() {
        return Ok(ContextPackResult {
            success: true,
            query: query.to_string(),
            notes_count: 0,
            estimated_tokens: 0,
            markdown: format!(
                "<!-- CGLI:MEMORY_CONTEXT (Nenhum registro prévio encontrado para \"{}\") -->",
                query
            ),
        });
    }

    let budget_chars = budget_tokens * 4;
    let mut markdown = format!(
        "<!-- CGLI:MEMORY_CONTEXT -->\n# Memória Contextual Relevante do CGLI ({} notas encontradas)\n> Consulta: \"{}\"\n\n",
        combined_hits.len(),
        query
    );

    let mut included_count = 0;
    for (hit, is_pinned) in combined_hits {
        if let Ok(raw) = fs::read_to_string(&hit.full_path) {
            let parsed = parse_frontmatter(&raw);
            let pinned_badge = if is_pinned {
                " 📌 [ANEXADO PELO OPERADOR]"
            } else {
                ""
            };
            let note_block = format!(
                "### [[{}]] ({} · {}){}\n{}\n\n---\n",
                hit.title,
                hit.note_type,
                hit.scope,
                pinned_badge,
                parsed.body.trim()
            );

            if markdown.len() + note_block.len() > budget_chars {
                let snippet_body = if parsed.body.len() > 150 {
                    format!("{}...", &parsed.body[..150].replace('\n', " "))
                } else {
                    parsed.body.replace('\n', " ")
                };
                let snippet_block = format!(
                    "### [[{}]] ({} · {}){}\n> {}\n\n",
                    hit.title, hit.note_type, hit.scope, pinned_badge, snippet_body
                );
                if markdown.len() + snippet_block.len() <= budget_chars {
                    markdown.push_str(&snippet_block);
                    included_count += 1;
                }
                break;
            } else {
                markdown.push_str(&note_block);
                included_count += 1;
            }
        }
    }

    markdown.push_str("<!-- /CGLI:MEMORY_CONTEXT -->\n");
    let tokens = (markdown.len() + 3) / 4;

    Ok(ContextPackResult {
        success: true,
        query: query.to_string(),
        notes_count: included_count,
        estimated_tokens: tokens,
        markdown,
    })
}

// -----------------------------------------------------------------------------
// 9. Generate Context File
// -----------------------------------------------------------------------------

pub fn generate_context_file(
    query: &str,
    node_id: Option<&str>,
    budget_tokens: usize,
    scope: &str,
    workspace_path: Option<&Path>,
    include_journals: bool,
    attached_memory_ids: &[String],
) -> Result<Value, String> {
    let ws = workspace_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let pack = build_context_pack(
        query,
        budget_tokens,
        scope,
        Some(&ws),
        include_journals,
        attached_memory_ids,
    )?;

    if pack.notes_count == 0 {
        return Ok(json!({
            "success": true,
            "hasContext": false,
            "contextFilePath": Value::Null,
            "notesCount": 0,
            "estimatedTokens": 0,
            "message": "Nenhum contexto relevante para salvar."
        }));
    }

    let context_dir = ws.join(".cgli").join("context");
    if !context_dir.exists() {
        let _ = fs::create_dir_all(&context_dir);
    }

    let file_id = match node_id {
        Some(id) => slugify(id),
        None => generate_id(),
    };
    let context_file = context_dir.join(format!("{}.md", file_id));

    let now = get_iso_timestamp();
    let file_header = format!("<!-- CGLI_AGENT_CONTEXT: {} | Gerado em: {} -->\n", file_id, now);
    let full_content = format!("{}{}", file_header, pack.markdown);

    fs::write(&context_file, full_content)
        .map_err(|e| format!("Falha ao escrever arquivo de contexto: {}", e))?;

    let rel_context = context_file
        .strip_prefix(&ws)
        .unwrap_or(&context_file)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(json!({
        "success": true,
        "hasContext": true,
        "contextFilePath": context_file.to_string_lossy().to_string(),
        "relativeContextPath": rel_context,
        "notesCount": pack.notes_count,
        "estimatedTokens": pack.estimated_tokens,
        "query": query
    }))
}

// -----------------------------------------------------------------------------
// 10. Generate Map of Content (MOC)
// -----------------------------------------------------------------------------

pub fn generate_moc(scope: &str, workspace_path: Option<&Path>) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(scope, workspace_path)?;
    let notes = list_notes(scope, workspace_path, None)?;
    let is_global = scope == "global";

    let mut decisions = Vec::new();
    let mut learnings = Vec::new();
    let mut knowledge = Vec::new();
    let mut rules = Vec::new();
    let mut tasks = Vec::new();
    let mut entities = Vec::new();
    let mut journals = Vec::new();
    let mut tag_counts: HashMap<String, usize> = HashMap::new();

    for n in &notes {
        for t in &n.tags {
            *tag_counts.entry(t.clone()).or_insert(0) += 1;
        }

        match n.note_type.as_str() {
            "decision" => decisions.push(n),
            "learning" => learnings.push(n),
            "knowledge" => knowledge.push(n),
            "rule" | "preference" => rules.push(n),
            "task" => tasks.push(n),
            "entity" => entities.push(n),
            "journal" => journals.push(n),
            _ => {}
        }
    }

    let now = get_iso_timestamp();
    let title = if is_global {
        "Map of Content (MOC) - Memória Global do Usuário"
    } else {
        "Map of Content (MOC) - Memória do Projeto"
    };

    let mut doc = format!(
        "---\ncgli_schema: moc/v1\ntitle: \"{}\"\nscope: \"{}\"\nupdated: \"{}\"\ntags: [\"moc\", \"index\", \"cgli\"]\n---\n\n",
        title, scope, now
    );
    doc.push_str(&format!("# 🗺️ {}\n\n", title));
    doc.push_str(&format!(
        "> **Última atualização:** {} · **Total de notas:** {}\n\n",
        now,
        notes.len()
    ));

    doc.push_str("### 📊 Resumo do Cofre\n");
    doc.push_str(&format!(
        "- **Decisões de Arquitetura (ADRs):** {}\n",
        decisions.len()
    ));
    doc.push_str(&format!(
        "- **Conhecimento & Aprendizados:** {}\n",
        knowledge.len() + learnings.len()
    ));
    doc.push_str(&format!(
        "- **Regras & Preferências:** {}\n",
        rules.len()
    ));
    doc.push_str(&format!(
        "- **Tarefas & Entidades:** {}\n",
        tasks.len() + entities.len()
    ));
    doc.push_str(&format!(
        "- **Registros de Journal Diário:** {}\n\n",
        journals.len()
    ));

    if !decisions.is_empty() {
        doc.push_str("## 🏛️ Decisões de Arquitetura (ADRs)\n");
        for d in decisions {
            let tag_str = if !d.tags.is_empty() {
                let tags_joined: Vec<String> = d.tags.iter().map(|t| format!("#{}", t)).collect();
                format!(" `{}`", tags_joined.join(" "))
            } else {
                String::new()
            };
            let date_only = d.created.split('T').next().unwrap_or("");
            doc.push_str(&format!("- [[{}]] — *{}*{}\n", d.title, date_only, tag_str));
        }
        doc.push('\n');
    }

    let knowledge_and_learnings: Vec<&NoteSummary> =
        knowledge.into_iter().chain(learnings.into_iter()).collect();
    if !knowledge_and_learnings.is_empty() {
        doc.push_str("## 🧠 Base de Conhecimento & Aprendizados\n");
        for k in knowledge_and_learnings {
            let tag_str = if !k.tags.is_empty() {
                let tags_joined: Vec<String> = k.tags.iter().map(|t| format!("#{}", t)).collect();
                format!(" `{}`", tags_joined.join(" "))
            } else {
                String::new()
            };
            doc.push_str(&format!("- [[{}]]{}\n", k.title, tag_str));
        }
        doc.push('\n');
    }

    if !rules.is_empty() {
        doc.push_str("## ⚙️ Regras & Convenções de Desenvolvimento\n");
        for r in rules {
            doc.push_str(&format!("- [[{}]]\n", r.title));
        }
        doc.push('\n');
    }

    let tasks_and_entities: Vec<&NoteSummary> =
        tasks.into_iter().chain(entities.into_iter()).collect();
    if !tasks_and_entities.is_empty() {
        doc.push_str("## 📋 Tarefas & Entidades do Sistema\n");
        for item in tasks_and_entities {
            doc.push_str(&format!("- [[{}]] ({})\n", item.title, item.note_type));
        }
        doc.push('\n');
    }

    if !tag_counts.is_empty() {
        doc.push_str("## 🏷️ Nuvem de Tópicos e Tags\n");
        let mut sorted_tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
        sorted_tags.sort_by(|a, b| b.1.cmp(&a.1));
        let tags_formatted: Vec<String> = sorted_tags
            .into_iter()
            .map(|(t, c)| format!("`#{}` ({})", t, c))
            .collect();
        doc.push_str(&tags_formatted.join(" · "));
        doc.push_str("\n\n");
    }

    if !journals.is_empty() {
        doc.push_str("## 📅 Registros Diários Recentes (Journal)\n");
        for j in journals.into_iter().take(10) {
            doc.push_str(&format!("- [[{}]] (`{}`)\n", j.title, j.relative_path));
        }
        doc.push('\n');
    }

    doc.push_str("---\n*Gerado automaticamente pelo CGLI Memory Engine*\n");

    let meta_dir = vault_path.join("00-meta");
    if !meta_dir.exists() {
        let _ = fs::create_dir_all(&meta_dir);
    }
    let moc_path = meta_dir.join("MOC.md");
    atomic_write_file(&moc_path, &doc)?;

    let rel_moc = moc_path
        .strip_prefix(&vault_path)
        .unwrap_or(&moc_path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(json!({
        "success": true,
        "scope": scope,
        "file": moc_path.to_string_lossy().to_string(),
        "relativePath": rel_moc,
        "totalNotes": notes.len(),
        "content": doc
    }))
}

// -----------------------------------------------------------------------------
// 11. Run Doctor (Vault Health Inspection)
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorIssue {
    pub severity: String, // "error" | "warning" | "info"
    pub scope: String,
    pub file: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub passed: bool,
    pub scanned_scopes: Vec<String>,
    pub stats: Value,
    pub issues: Vec<DoctorIssue>,
    pub summary: Value,
}

pub fn run_doctor(scope: &str, workspace_path: Option<&Path>) -> Result<Value, String> {
    let scopes: Vec<&str> = if scope == "all" {
        vec!["project", "global"]
    } else {
        vec![scope]
    };

    let mut issues = Vec::new();
    let mut total_notes = 0;
    let mut total_journals = 0;
    let mut total_estimated_tokens = 0;
    let mut storage_bytes: u64 = 0;

    let mut known_titles_and_filenames = HashSet::new();
    let mut all_notes = Vec::new();

    for s in &scopes {
        let _ = ensure_vault_structure(s, workspace_path)?;
        if let Ok(notes) = list_notes(s, workspace_path, None) {
            for n in notes {
                total_notes += 1;
                if n.note_type == "journal" {
                    total_journals += 1;
                }
                known_titles_and_filenames.insert(n.title.to_lowercase());
                let base = Path::new(&n.full_path)
                    .file_stem()
                    .map(|b| b.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                known_titles_and_filenames.insert(base);
                known_titles_and_filenames.insert(slugify(&n.title));
                all_notes.push(n);
            }
        }
    }

    let wikilink_re = regex::Regex::new(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]").unwrap();

    for note in all_notes {
        let path = Path::new(&note.full_path);
        if let Ok(meta) = fs::metadata(path) {
            storage_bytes += meta.len();
        }

        match fs::read_to_string(path) {
            Ok(raw) => {
                total_estimated_tokens += (raw.len() + 3) / 4;

                // 1. Checa frontmatter
                if !raw.starts_with("---") {
                    issues.push(DoctorIssue {
                        severity: "warning".to_string(),
                        scope: note.scope.clone(),
                        file: note.relative_path.clone(),
                        message: "Nota sem cabeçalho YAML Frontmatter".to_string(),
                        suggestion: Some("Adicione metadata padronizado cgli_schema.".to_string()),
                    });
                } else if !raw[3..].contains("\n---") {
                    issues.push(DoctorIssue {
                        severity: "error".to_string(),
                        scope: note.scope.clone(),
                        file: note.relative_path.clone(),
                        message: "YAML Frontmatter corrompido (delimitador de fechamento ausente)".to_string(),
                        suggestion: Some("Corrija a formatação do delimitador ---".to_string()),
                    });
                }

                // 2. Checa segredos residuais
                if let Ok(secret_check) = scan_and_sanitize_secrets(&raw, false) {
                    if secret_check.has_secrets {
                        issues.push(DoctorIssue {
                            severity: "error".to_string(),
                            scope: note.scope.clone(),
                            file: note.relative_path.clone(),
                            message: format!(
                                "Segredo residual detectado: {}",
                                secret_check.detected.join(", ")
                            ),
                            suggestion: Some("Sanitize a nota executando compactação ou editando para [REDACTED_SECRET].".to_string()),
                        });
                    }
                }

                // 3. Checa wikilinks quebrados
                for cap in wikilink_re.captures_iter(&raw) {
                    if let Some(m) = cap.get(1) {
                        let target = m.as_str().trim().to_lowercase();
                        if !target.is_empty()
                            && !known_titles_and_filenames.contains(&target)
                            && !known_titles_and_filenames.contains(&slugify(&target))
                            && target != "moc"
                            && target != "map of content"
                            && target != note.title.to_lowercase()
                        {
                            issues.push(DoctorIssue {
                                severity: "info".to_string(),
                                scope: note.scope.clone(),
                                file: note.relative_path.clone(),
                                message: format!("Wikilink potencialmente órfão para [[{}]]", m.as_str()),
                                suggestion: Some(format!(
                                    "Crie a nota correspondente para [[{}]] ou remova o link.",
                                    m.as_str()
                                )),
                            });
                        }
                    }
                }

                // 4. Checa conflitos de concorrência pendentes
                if note.full_path.contains("--conflict-")
                    || note.note_type == "conflict"
                    || note.title.contains("Conflito de Modificação")
                {
                    issues.push(DoctorIssue {
                        severity: "warning".to_string(),
                        scope: note.scope.clone(),
                        file: note.relative_path.clone(),
                        message: format!("Conflito de concorrência pendente: {}", note.relative_path),
                        suggestion: Some("Analise o arquivo de conflito e mescle as alterações com a nota original, removendo o arquivo de conflito após resolução.".to_string()),
                    });
                }
            }
            Err(e) => {
                issues.push(DoctorIssue {
                    severity: "error".to_string(),
                    scope: note.scope.clone(),
                    file: note.relative_path.clone(),
                    message: format!("Falha ao ler arquivo: {}", e),
                    suggestion: Some("Verifique permissões de leitura.".to_string()),
                });
            }
        }
    }

    // 5. Checa arquivos na pasta .tmp
    for s in &scopes {
        let vp = get_vault_path(s, workspace_path);
        let tmp_dir = vp.join(".tmp");
        if tmp_dir.exists() {
            if let Ok(entries) = fs::read_dir(&tmp_dir) {
                let count = entries.flatten().count();
                if count > 0 {
                    issues.push(DoctorIssue {
                        severity: "info".to_string(),
                        scope: s.to_string(),
                        file: ".tmp".to_string(),
                        message: format!(
                            "{} arquivos residuais na pasta de staging temporário .tmp",
                            count
                        ),
                        suggestion: Some("Arquivos temporários podem ser limpos com segurança.".to_string()),
                    });
                }
            }
        }
    }

    // 6. Checa fila de spool outbox
    let project_vault = get_vault_path("project", workspace_path);
    let outbox_dir = project_vault.join("00-inbox").join(".outbox");
    if outbox_dir.exists() {
        if let Ok(entries) = fs::read_dir(&outbox_dir) {
            let count = entries
                .flatten()
                .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
                .count();
            if count > 0 {
                issues.push(DoctorIssue {
                    severity: "warning".to_string(),
                    scope: "project".to_string(),
                    file: "00-inbox/.outbox".to_string(),
                    message: format!(
                        "{} requisições pendentes na fila outbox (falha de comunicação com o servidor)",
                        count
                    ),
                    suggestion: Some("Execute cgli memory drain-outbox ou restabeleça a conexão com o servidor ativo.".to_string()),
                });
            }
        }
    }

    let errors_count = issues.iter().filter(|i| i.severity == "error").count();
    let warnings_count = issues.iter().filter(|i| i.severity == "warning").count();
    let infos_count = issues.iter().filter(|i| i.severity == "info").count();

    Ok(json!({
        "passed": errors_count == 0,
        "scannedScopes": scopes,
        "stats": {
            "totalNotes": total_notes,
            "totalJournals": total_journals,
            "totalEstimatedTokens": total_estimated_tokens,
            "storageBytes": storage_bytes
        },
        "issues": issues,
        "summary": {
            "errors": errors_count,
            "warnings": warnings_count,
            "infos": infos_count
        }
    }))
}

// -----------------------------------------------------------------------------
// 12. Compact Journals
// -----------------------------------------------------------------------------

pub fn compact_journals(
    scope: &str,
    dry_run: bool,
    older_than_days: u32,
    workspace_path: Option<&Path>,
) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(scope, workspace_path)?;
    let journal_dir = vault_path.join("90-journal");

    if !journal_dir.exists() {
        return Ok(json!({
            "success": true,
            "scope": scope,
            "dryRun": dry_run,
            "entriesFound": 0,
            "notesCreated": 0,
            "message": "Nenhum journal encontrado para compactar."
        }));
    }

    let ledger_dir = vault_path.join("00-meta");
    let _ = fs::create_dir_all(&ledger_dir);
    let ledger_path = ledger_dir.join(".compacted_ledger.json");

    let mut ledger: Value = if ledger_path.exists() {
        fs::read_to_string(&ledger_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| json!({ "version": 1, "compacted": {} }))
    } else {
        json!({ "version": 1, "compacted": {} })
    };

    let compacted_map = ledger
        .get_mut("compacted")
        .and_then(|v| v.as_object_mut())
        .cloned()
        .unwrap_or_default();

    let entries = fs::read_dir(&journal_dir).map_err(|e| e.to_string())?;
    let mut date_dirs = Vec::new();
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            date_dirs.push(entry.file_name().to_string_lossy().to_string());
        }
    }

    let now_date = Utc::now().date_naive();
    let header_re =
        regex::Regex::new(r"^## (\d{2}:\d{2}:\d{2}) · ([^·\n]+) · ([a-zA-Z0-9]+)").unwrap();
    let tags_re = regex::Regex::new(r"\*\*tags:\*\*([^\n]+)").unwrap();
    let tag_word_re = regex::Regex::new(r"#([a-zA-Z0-9_-]+)").unwrap();

    struct JournalEntry {
        date: String,
        time: String,
        kind: String,
        ulid: String,
        tags: Vec<String>,
        text: String,
        agent: String,
    }

    let mut uncompacted_entries: Vec<JournalEntry> = Vec::new();

    for d in date_dirs {
        if older_than_days > 0 {
            if let Ok(d_date) = chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d") {
                let diff = (now_date - d_date).num_days();
                if diff < older_than_days as i64 {
                    continue;
                }
            }
        }

        let full_date_dir = journal_dir.join(&d);
        if let Ok(files) = fs::read_dir(&full_date_dir) {
            for file_entry in files.flatten() {
                let fpath = file_entry.path();
                if fpath.is_file() && fpath.extension().map(|e| e == "md").unwrap_or(false) {
                    let agent_name = fpath
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "agent".to_string());
                    if let Ok(raw) = fs::read_to_string(&fpath) {
                        for sec in raw.split("\n## ") {
                            let block = if sec.starts_with("## ") {
                                sec.to_string()
                            } else {
                                format!("## {}", sec)
                            };

                            if let Some(cap) = header_re.captures(&block) {
                                let time = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                                let kind = cap
                                    .get(2)
                                    .map(|m| m.as_str().trim())
                                    .unwrap_or("finding")
                                    .to_string();
                                let ulid = cap.get(3).map(|m| m.as_str().trim()).unwrap_or("").to_string();

                                if ulid.is_empty()
                                    || compacted_map.contains_key(&ulid)
                                    || block.contains("<!-- cgli:compacted -->")
                                {
                                    continue;
                                }

                                let mut tags = Vec::new();
                                if let Some(tcap) = tags_re.captures(&block) {
                                    if let Some(m) = tcap.get(1) {
                                        for tw in tag_word_re.captures_iter(m.as_str()) {
                                            if let Some(tag_match) = tw.get(1) {
                                                tags.push(tag_match.as_str().to_string());
                                            }
                                        }
                                    }
                                }

                                let text_lines: Vec<&str> = block
                                    .lines()
                                    .filter(|l| {
                                        !l.starts_with("## ")
                                            && !l.starts_with('^')
                                            && !l.starts_with("**")
                                            && !l.starts_with("---")
                                            && !l.trim().is_empty()
                                    })
                                    .collect();
                                let body_text = text_lines.join("\n").trim().to_string();

                                if !body_text.is_empty() {
                                    uncompacted_entries.push(JournalEntry {
                                        date: d.clone(),
                                        time,
                                        kind,
                                        ulid,
                                        tags,
                                        text: body_text,
                                        agent: agent_name.clone(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if uncompacted_entries.is_empty() {
        return Ok(json!({
            "success": true,
            "scope": scope,
            "dryRun": dry_run,
            "olderThanDays": older_than_days,
            "entriesFound": 0,
            "notesCreated": 0,
            "message": format!(
                "Nenhum journal elegível para compactação (filtro de idade: >= {} dias).",
                older_than_days
            )
        }));
    }

    let entries_found_count = uncompacted_entries.len();
    let mut created_notes = Vec::new();
    if !dry_run {
        let mut grouped: HashMap<String, Vec<JournalEntry>> = HashMap::new();
        for entry in uncompacted_entries {
            grouped.entry(entry.date.clone()).or_default().push(entry);
        }

        let mut ledger_compacted = ledger
            .get("compacted")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        for (entry_date, entries) in grouped {
            let mut all_tags = HashSet::new();
            for e in &entries {
                for t in &e.tags {
                    all_tags.insert(t.clone());
                }
            }
            all_tags.insert("compacted".to_string());

            let mut body = format!(
                "Esta nota foi gerada pela consolidação automática de {} observações do journal diário.\n\n### Observações Consolidadas:\n\n",
                entries.len()
            );
            for e in &entries {
                body.push_str(&format!(
                    "- **[{}]** ({}, agente `{}`): {} (ref: [[{}#^{}]])\n",
                    e.kind, e.time, e.agent, e.text, e.agent, e.ulid
                ));
            }

            let note_res = create_note(CreateNoteParams {
                scope,
                workspace_path,
                note_type: if scope == "global" { "learning" } else { "knowledge" },
                title: &format!("Consolidado de Aprendizados ({})", entry_date),
                content: &body,
                author: "cgli-curator",
                tags: all_tags.into_iter().collect(),
                links: HashMap::new(),
                node_id: None,
                confidence: 0.9,
                idem_key: None,
            })?;

            let created_id = note_res
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            for e in &entries {
                ledger_compacted.insert(
                    e.ulid.clone(),
                    json!({
                        "date": e.date,
                        "compactedAt": get_iso_timestamp(),
                        "consolidatedNoteId": created_id,
                        "agent": e.agent,
                        "kind": e.kind
                    }),
                );
            }

            created_notes.push(note_res);
        }

        ledger["compacted"] = Value::Object(ledger_compacted);
        let serialized_ledger = serde_json::to_string_pretty(&ledger).unwrap_or_default();
        atomic_write_file(&ledger_path, &serialized_ledger)?;
        let _ = generate_moc(scope, workspace_path);
    }

    Ok(json!({
        "success": true,
        "scope": scope,
        "dryRun": dry_run,
        "olderThanDays": older_than_days,
        "entriesFound": entries_found_count,
        "notesCreated": created_notes.len(),
        "createdNotes": created_notes,
        "message": if dry_run {
            format!("Simulação concluída: {} entradas elegíveis para consolidação (>= {} dias).", entries_found_count, older_than_days)
        } else {
            format!("Compactação concluída: {} entradas consolidadas em {} notas de conhecimento permanente.", entries_found_count, created_notes.len())
        }
    }))
}

// -----------------------------------------------------------------------------
// 13. Drain Outbox Spool
// -----------------------------------------------------------------------------

pub fn drain_outbox(workspace_path: Option<&Path>) -> Result<Value, String> {
    let vault_path = get_vault_path("project", workspace_path);
    let outbox_dir = vault_path.join("00-inbox").join(".outbox");

    if !outbox_dir.exists() {
        return Ok(json!({
            "success": true,
            "processed": 0,
            "failed": 0,
            "messages": []
        }));
    }

    let files = fs::read_dir(&outbox_dir).map_err(|e| e.to_string())?;
    let mut processed = 0;
    let mut failed = 0;
    let mut messages = Vec::new();

    for entry in files.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().map(|e| e == "json").unwrap_or(false) {
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            match fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(data) = serde_json::from_str::<Value>(&content) {
                        let endpoint = data.get("endpoint").and_then(|v| v.as_str()).unwrap_or("");
                        let body = data.get("body").cloned().unwrap_or(Value::Null);

                        let res = handle_rpc("POST", endpoint, &body, workspace_path);
                        match res {
                            Ok(r) if r.get("success").and_then(|v| v.as_bool()).unwrap_or(false) || r.get("id").is_some() => {
                                let _ = fs::remove_file(&path);
                                processed += 1;
                                messages.push(format!("Processado com sucesso: {} ({})", file_name, endpoint));
                            }
                            Ok(r) => {
                                failed += 1;
                                let err_msg = r.get("error").or_else(|| r.get("message")).map(|v| v.to_string()).unwrap_or_default();
                                messages.push(format!("Erro ao processar {}: {}", file_name, err_msg));
                            }
                            Err(e) => {
                                failed += 1;
                                messages.push(format!("Falha ao despachar {}: {}", file_name, e));
                            }
                        }
                    } else {
                        failed += 1;
                        messages.push(format!("JSON inválido em {}", file_name));
                    }
                }
                Err(e) => {
                    failed += 1;
                    messages.push(format!("Exceção ao ler {}: {}", file_name, e));
                }
            }
        }
    }

    Ok(json!({
        "success": true,
        "processed": processed,
        "failed": failed,
        "messages": messages
    }))
}

// -----------------------------------------------------------------------------
// 14. Open in Obsidian
// -----------------------------------------------------------------------------

pub fn open_in_obsidian(
    scope: &str,
    workspace_path: Option<&Path>,
    file: Option<&str>,
) -> Result<Value, String> {
    let vault_path = ensure_vault_structure(scope, workspace_path)?;
    let normalized_vault = vault_path.to_string_lossy().replace('\\', "/");

    let uri = match file {
        Some(f) if !f.is_empty() => {
            let target = if Path::new(f).is_absolute() {
                PathBuf::from(f)
            } else {
                vault_path.join(f)
            };
            let normalized_target = target.to_string_lossy().replace('\\', "/");
            format!("obsidian://open?path={}", urlencoding(&normalized_target))
        }
        _ => format!("obsidian://open?path={}", urlencoding(&normalized_vault)),
    };

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", &uri])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&uri).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&uri).spawn();
    }

    Ok(json!({
        "success": true,
        "uri": uri,
        "vaultPath": normalized_vault
    }))
}

fn urlencoding(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

// -----------------------------------------------------------------------------
// 15. RPC Dispatcher (Compatible with HTTP Server and CLI)
// -----------------------------------------------------------------------------

pub fn handle_rpc(
    _method: &str,
    path: &str,
    body: &Value,
    workspace_path: Option<&Path>,
) -> Result<Value, String> {
    let (clean_path, query_params) = parse_url_path_and_query(path);

    let get_param = |k: &str| -> Option<String> {
        query_params
            .get(k)
            .cloned()
            .or_else(|| body.get(k).and_then(|v| v.as_str()).map(|s| s.to_string()))
    };

    let scope = get_param("scope").unwrap_or_else(|| "project".to_string());

    if clean_path.ends_with("/api/memory/write") {
        let content = body
            .get("content")
            .or_else(|| body.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let kind = body
            .get("kind")
            .or_else(|| body.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("finding");
        let agent_id = body
            .get("agentId")
            .or_else(|| body.get("agent_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("agent");
        let agent_type = body
            .get("agentType")
            .or_else(|| body.get("agent_type"))
            .and_then(|v| v.as_str())
            .unwrap_or("claude");
        let confidence = body
            .get("confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.8);
        let tags: Vec<String> = extract_string_array(body, "tags");
        let refs: Vec<String> = extract_string_array(body, "refs");
        let source = body.get("source").and_then(|v| v.as_str());
        let idem_key = body.get("idemKey").or_else(|| body.get("idem-key")).and_then(|v| v.as_str());

        write_observation(WriteObservationParams {
            scope: &scope,
            workspace_path,
            agent_id,
            agent_type,
            content,
            kind,
            tags,
            refs,
            source,
            confidence,
            idem_key,
        })
    } else if clean_path.ends_with("/api/memory/note") {
        let note_type = body.get("type").and_then(|v| v.as_str()).unwrap_or("decision");
        let title = body.get("title").and_then(|v| v.as_str()).unwrap_or("Sem título");
        let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let author = body.get("author").and_then(|v| v.as_str()).unwrap_or("agent");
        let confidence = body.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.85);
        let node_id = body.get("nodeId").and_then(|v| v.as_str());
        let tags: Vec<String> = extract_string_array(body, "tags");
        let idem_key = body.get("idemKey").or_else(|| body.get("idem-key")).and_then(|v| v.as_str());

        create_note(CreateNoteParams {
            scope: &scope,
            workspace_path,
            note_type,
            title,
            content,
            author,
            tags,
            links: HashMap::new(),
            node_id,
            confidence,
            idem_key,
        })
    } else if clean_path.ends_with("/api/memory/update") {
        let id = get_param("id").unwrap_or_default();
        let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let author = body.get("author").and_then(|v| v.as_str()).unwrap_or("agent");
        let file = body.get("file").and_then(|v| v.as_str());
        let expect_rev = body
            .get("expectRev")
            .or_else(|| body.get("expect-rev"))
            .or_else(|| body.get("rev"))
            .and_then(|v| v.as_u64())
            .map(|u| u as u32);
        let expect_etag = body
            .get("expectEtag")
            .or_else(|| body.get("expect-etag"))
            .or_else(|| body.get("etag"))
            .and_then(|v| v.as_str());
        let idem_key = body.get("idemKey").or_else(|| body.get("idem-key")).and_then(|v| v.as_str());

        update_note(UpdateNoteParams {
            id: &id,
            expect_rev,
            expect_etag,
            content,
            file,
            author,
            scope: &scope,
            workspace_path,
            idem_key,
        })
    } else if clean_path.ends_with("/api/memory/append") {
        let id = get_param("id").unwrap_or_default();
        let section = body
            .get("section")
            .or_else(|| body.get("sectionTitle"))
            .or_else(|| body.get("title"))
            .and_then(|v| v.as_str())
            .unwrap_or("Atualização");
        let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let author = body.get("author").and_then(|v| v.as_str()).unwrap_or("agent");
        let idem_key = body.get("idemKey").or_else(|| body.get("idem-key")).and_then(|v| v.as_str());

        append_to_note(AppendToNoteParams {
            id: &id,
            section_title: section,
            content,
            author,
            scope: &scope,
            workspace_path,
            idem_key,
        })
    } else if clean_path.ends_with("/api/memory/list") {
        let note_type = get_param("type");
        let notes = list_notes(&scope, workspace_path, note_type.as_deref())?;
        Ok(json!({ "success": true, "scope": scope, "notes": notes }))
    } else if clean_path.ends_with("/api/memory/get") {
        let id = get_param("id").unwrap_or_default();
        get_note(&scope, workspace_path, &id)
    } else if clean_path.ends_with("/api/memory/search") {
        let query = get_param("q").or_else(|| get_param("query")).unwrap_or_default();
        let search_scope = get_param("scope").unwrap_or_else(|| "all".to_string());
        let limit = get_param("limit")
            .and_then(|l| l.parse::<usize>().ok())
            .unwrap_or(20);
        let hits = search_notes(&query, &search_scope, None, workspace_path, limit)?;
        Ok(json!({ "success": true, "query": query, "results": hits }))
    } else if clean_path.ends_with("/api/memory/context-file") {
        let query = get_param("for")
            .or_else(|| get_param("query"))
            .unwrap_or_default();
        let node_id = get_param("nodeId");
        let budget_tokens = get_param("budgetTokens")
            .and_then(|b| b.parse::<usize>().ok())
            .unwrap_or(3000);
        let search_scope = get_param("scope").unwrap_or_else(|| "all".to_string());
        let include_journals = body
            .get("includeJournals")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let attached: Vec<String> = extract_string_array(body, "attachedMemoryIds");

        generate_context_file(
            &query,
            node_id.as_deref(),
            budget_tokens,
            &search_scope,
            workspace_path,
            include_journals,
            &attached,
        )
    } else if clean_path.ends_with("/api/memory/context") {
        let query = get_param("for")
            .or_else(|| get_param("query"))
            .unwrap_or_default();
        let budget_tokens = get_param("budgetTokens")
            .and_then(|b| b.parse::<usize>().ok())
            .unwrap_or(3000);
        let search_scope = get_param("scope").unwrap_or_else(|| "all".to_string());
        let include_journals = body
            .get("includeJournals")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let attached: Vec<String> = extract_string_array(body, "attachedMemoryIds");

        let pack = build_context_pack(
            &query,
            budget_tokens,
            &search_scope,
            workspace_path,
            include_journals,
            &attached,
        )?;
        Ok(json!(pack))
    } else if clean_path.ends_with("/api/memory/drain-outbox") {
        drain_outbox(workspace_path)
    } else if clean_path.ends_with("/api/memory/doctor") {
        run_doctor(&scope, workspace_path)
    } else if clean_path.ends_with("/api/memory/compact") {
        let dry_run = body.get("dryRun").and_then(|v| v.as_bool()).unwrap_or(false);
        let older_than = body
            .get("olderThanDays")
            .or_else(|| body.get("days"))
            .and_then(|v| v.as_u64())
            .unwrap_or(7) as u32;
        compact_journals(&scope, dry_run, older_than, workspace_path)
    } else if clean_path.ends_with("/api/memory/moc") {
        generate_moc(&scope, workspace_path)
    } else if clean_path.ends_with("/api/memory/open") {
        let file = body.get("file").and_then(|v| v.as_str());
        open_in_obsidian(&scope, workspace_path, file)
    } else {
        Err(format!("Endpoint de memória desconhecido: {}", clean_path))
    }
}

fn parse_url_path_and_query(url_str: &str) -> (String, HashMap<String, String>) {
    let mut map = HashMap::new();
    let (path, query) = match url_str.find('?') {
        Some(idx) => (&url_str[..idx], &url_str[idx + 1..]),
        None => (url_str, ""),
    };

    for pair in query.split('&') {
        if let Some(eq) = pair.find('=') {
            let k = &pair[..eq];
            let v = &pair[eq + 1..];
            map.insert(k.to_string(), v.to_string());
        }
    }
    (path.to_string(), map)
}

fn extract_string_array(body: &Value, key: &str) -> Vec<String> {
    match body.get(key) {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        Some(Value::String(s)) => s
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}
