use std::collections::HashMap;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Frontmatter {
    pub schema: String,
    pub id: String,
    pub rev: u32,
    pub etag: String,
    pub title: String,
    pub created: String,
    pub updated: String,
    pub scope: String,
    pub confidence: f64,
    pub author_agent_id: String,
    pub status: String,
    pub tags: Vec<String>,
    pub canvas_node_id: Option<String>,
    pub links: HashMap<String, Vec<String>>,
    // conflict fields
    pub conflicts_with: Option<String>,
    pub base_rev: Option<u32>,
    pub actual_rev: Option<u32>,
    pub base_etag: Option<String>,
    pub actual_etag: Option<String>,
    pub extra_fields: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedDoc {
    pub frontmatter_raw: Option<String>,
    pub frontmatter: Option<Frontmatter>,
    pub body: String,
}

impl Frontmatter {
    pub fn to_yaml(&self) -> String {
        let mut yaml = String::new();
        yaml.push_str("---\n");
        if !self.schema.is_empty() {
            yaml.push_str(&format!("cgli_schema: {}\n", self.schema));
        }
        if !self.id.is_empty() {
            yaml.push_str(&format!("id: \"{}\"\n", self.id));
        }
        if self.rev > 0 {
            yaml.push_str(&format!("rev: {}\n", self.rev));
        }
        if !self.etag.is_empty() {
            yaml.push_str(&format!("etag: \"{}\"\n", self.etag));
        }
        if !self.title.is_empty() {
            let safe_title = self.title.replace('"', "\\\"");
            yaml.push_str(&format!("title: \"{}\"\n", safe_title));
        }
        if let Some(cw) = &self.conflicts_with {
            yaml.push_str(&format!("conflicts_with: \"{}\"\n", cw));
        }
        if let Some(br) = self.base_rev {
            yaml.push_str(&format!("base_rev: {}\n", br));
        }
        if let Some(ar) = self.actual_rev {
            yaml.push_str(&format!("actual_rev: {}\n", ar));
        }
        if let Some(be) = &self.base_etag {
            yaml.push_str(&format!("base_etag: \"{}\"\n", be));
        }
        if let Some(ae) = &self.actual_etag {
            yaml.push_str(&format!("actual_etag: \"{}\"\n", ae));
        }
        if !self.created.is_empty() {
            yaml.push_str(&format!("created: \"{}\"\n", self.created));
        }
        if !self.updated.is_empty() {
            yaml.push_str(&format!("updated: \"{}\"\n", self.updated));
        }
        if !self.scope.is_empty() {
            yaml.push_str(&format!("scope: \"{}\"\n", self.scope));
        }
        if self.confidence > 0.0 {
            yaml.push_str(&format!("confidence: {}\n", self.confidence));
        }
        if !self.author_agent_id.is_empty() {
            yaml.push_str(&format!("author:\n  agent_id: \"{}\"\n", self.author_agent_id));
        }
        if !self.status.is_empty() {
            yaml.push_str(&format!("status: \"{}\"\n", self.status));
        }

        let tags_formatted: Vec<String> = self.tags.iter().map(|t| format!("\"{}\"", t)).collect();
        yaml.push_str(&format!("tags: [{}]\n", tags_formatted.join(", ")));

        if let Some(node_id) = &self.canvas_node_id {
            yaml.push_str(&format!("canvas:\n  node_id: \"{}\"\n", node_id));
        }

        if !self.links.is_empty() {
            yaml.push_str("links:\n");
            for (rel, targets) in &self.links {
                let targets_formatted: Vec<String> =
                    targets.iter().map(|t| format!("\"{}\"", t)).collect();
                yaml.push_str(&format!("  {}: [{}]\n", rel, targets_formatted.join(", ")));
            }
        } else {
            yaml.push_str("links: {}\n");
        }

        yaml.push_str("---\n\n");
        yaml
    }
}

pub fn parse_frontmatter(content: &str) -> ParsedDoc {
    if !content.starts_with("---") {
        return ParsedDoc {
            frontmatter_raw: None,
            frontmatter: None,
            body: content.to_string(),
        };
    }

    // Look for closing ---
    let rest = &content[3..];
    let end_idx = match rest.find("\n---") {
        Some(idx) => idx,
        None => {
            return ParsedDoc {
                frontmatter_raw: None,
                frontmatter: None,
                body: content.to_string(),
            };
        }
    };

    let fm_text = rest[..end_idx].trim_start_matches('\r').trim_start_matches('\n');
    let after_fm = &rest[end_idx + 4..];
    let body = after_fm.trim_start_matches('\r').trim_start_matches('\n');

    let mut fm = Frontmatter {
        confidence: 0.85,
        status: "active".to_string(),
        rev: 1,
        ..Default::default()
    };

    let mut in_author = false;
    let mut in_canvas = false;
    let mut in_links = false;

    for line in fm_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed == "author:" {
            in_author = true;
            in_canvas = false;
            in_links = false;
            continue;
        } else if trimmed == "canvas:" {
            in_canvas = true;
            in_author = false;
            in_links = false;
            continue;
        } else if trimmed == "links:" {
            in_links = true;
            in_author = false;
            in_canvas = false;
            continue;
        }

        if line.starts_with("  ") {
            if in_author {
                if let Some(val) = extract_string_value(trimmed, "agent_id:") {
                    fm.author_agent_id = val;
                }
            } else if in_canvas {
                if let Some(val) = extract_string_value(trimmed, "node_id:") {
                    fm.canvas_node_id = Some(val);
                }
            } else if in_links {
                if let Some((rel, targets)) = parse_link_rel(trimmed) {
                    fm.links.insert(rel, targets);
                }
            }
            continue;
        }

        in_author = false;
        in_canvas = false;
        in_links = false;

        if let Some(val) = extract_raw_value(trimmed, "cgli_schema:") {
            fm.schema = val;
        } else if let Some(val) = extract_string_value(trimmed, "id:") {
            fm.id = val;
        } else if let Some(val) = extract_string_value(trimmed, "title:") {
            fm.title = val;
        } else if let Some(val) = extract_string_value(trimmed, "created:") {
            fm.created = val;
        } else if let Some(val) = extract_string_value(trimmed, "updated:") {
            fm.updated = val;
        } else if let Some(val) = extract_string_value(trimmed, "etag:") {
            fm.etag = val;
        } else if let Some(val) = extract_string_value(trimmed, "scope:") {
            fm.scope = val;
        } else if let Some(val) = extract_string_value(trimmed, "status:") {
            fm.status = val;
        } else if let Some(val) = extract_string_value(trimmed, "conflicts_with:") {
            fm.conflicts_with = Some(val);
        } else if let Some(val) = extract_string_value(trimmed, "base_etag:") {
            fm.base_etag = Some(val);
        } else if let Some(val) = extract_string_value(trimmed, "actual_etag:") {
            fm.actual_etag = Some(val);
        } else if let Some(val) = extract_raw_value(trimmed, "rev:") {
            if let Ok(r) = val.parse::<u32>() {
                fm.rev = r;
            }
        } else if let Some(val) = extract_raw_value(trimmed, "base_rev:") {
            if let Ok(r) = val.parse::<u32>() {
                fm.base_rev = Some(r);
            }
        } else if let Some(val) = extract_raw_value(trimmed, "actual_rev:") {
            if let Ok(r) = val.parse::<u32>() {
                fm.actual_rev = Some(r);
            }
        } else if let Some(val) = extract_raw_value(trimmed, "confidence:") {
            if let Ok(c) = val.parse::<f64>() {
                fm.confidence = c;
            }
        } else if trimmed.starts_with("tags:") {
            fm.tags = parse_array_field(trimmed);
        }
    }

    ParsedDoc {
        frontmatter_raw: Some(fm_text.to_string()),
        frontmatter: Some(fm),
        body: body.to_string(),
    }
}

fn extract_string_value(line: &str, key: &str) -> Option<String> {
    if !line.starts_with(key) {
        return None;
    }
    let rest = line[key.len()..].trim();
    if (rest.starts_with('"') && rest.ends_with('"')) || (rest.starts_with('\'') && rest.ends_with('\'')) {
        Some(rest[1..rest.len() - 1].replace("\\\"", "\""))
    } else {
        Some(rest.to_string())
    }
}

fn extract_raw_value(line: &str, key: &str) -> Option<String> {
    if !line.starts_with(key) {
        return None;
    }
    let rest = line[key.len()..].trim();
    let unquoted = rest.trim_matches('"').trim_matches('\'');
    Some(unquoted.to_string())
}

fn parse_array_field(line: &str) -> Vec<String> {
    if let Some(start) = line.find('[') {
        if let Some(end) = line.rfind(']') {
            let inner = &line[start + 1..end];
            return inner
                .split(',')
                .map(|s| s.trim().trim_matches('"').trim_matches('\'').trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    Vec::new()
}

fn parse_link_rel(line: &str) -> Option<(String, Vec<String>)> {
    let colon_idx = line.find(':')?;
    let rel = line[..colon_idx].trim().to_string();
    let targets = parse_array_field(&line[colon_idx + 1..]);
    Some((rel, targets))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_serialize_frontmatter() {
        let content = r#"---
cgli_schema: decision/v1
id: "01MUC4ZG8AG93MF5"
rev: 1
etag: "abcdef1234567890"
title: "Adocao do Obsidian como Memoria"
created: "2026-09-22T03:50:46.763Z"
updated: "2026-09-22T03:50:46.763Z"
scope: "project"
author:
  agent_id: "Admin"
status: "active"
tags: ["arquitetura", "obsidian"]
links: {}
---

# Adocao do Obsidian como Memoria

Decidimos adotar o Obsidian.
"#;

        let parsed = parse_frontmatter(content);
        assert!(parsed.frontmatter.is_some());
        let fm = parsed.frontmatter.unwrap();
        assert_eq!(fm.id, "01MUC4ZG8AG93MF5");
        assert_eq!(fm.schema, "decision/v1");
        assert_eq!(fm.title, "Adocao do Obsidian como Memoria");
        assert_eq!(fm.tags, vec!["arquitetura", "obsidian"]);
        assert_eq!(fm.author_agent_id, "Admin");
        assert!(parsed.body.contains("Decidimos adotar o Obsidian."));

        let serialized = fm.to_yaml();
        assert!(serialized.contains("id: \"01MUC4ZG8AG93MF5\""));
        assert!(serialized.contains("title: \"Adocao do Obsidian como Memoria\""));
    }
}
