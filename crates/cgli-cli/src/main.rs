use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{exit, Command};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct HttpError {
    pub message: String,
    pub status_code: u16,
    pub body: Value,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HTTP {}: {}", self.status_code, self.message)
    }
}

pub struct HttpClient {
    pub host: String,
    pub port: u16,
}

impl HttpClient {
    pub fn discover() -> Self {
        let env_port = std::env::var("CGLI_BRIDGE_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok());

        let candidate_ports: Vec<u16> = match env_port {
            Some(p) => vec![p, 41732, 5173],
            None => vec![41732, 5173],
        };

        let candidate_hosts = ["127.0.0.1", "localhost"];

        for &h in &candidate_hosts {
            for &p in &candidate_ports {
                if let Ok(mut stream) = TcpStream::connect_timeout(
                    &format!("{}:{}", h, p)
                        .parse()
                        .unwrap_or_else(|_| "127.0.0.1:41732".parse().unwrap()),
                    Duration::from_millis(350),
                ) {
                    let req = format!(
                        "GET /api/status HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
                        h, p
                    );
                    let _ = stream.write_all(req.as_bytes());
                    let mut buf = [0u8; 128];
                    if let Ok(n) = stream.read(&mut buf) {
                        let response_prefix = String::from_utf8_lossy(&buf[..n]);
                        if response_prefix.contains("200 OK") {
                            return Self {
                                host: h.to_string(),
                                port: p,
                            };
                        }
                    }
                }
            }
        }

        Self {
            host: "127.0.0.1".to_string(),
            port: env_port.unwrap_or(41732),
        }
    }

    pub fn get(&self, endpoint: &str) -> Result<Value, HttpError> {
        self.request("GET", endpoint, None)
    }

    pub fn post(&self, endpoint: &str, body: &Value) -> Result<Value, HttpError> {
        let payload = serde_json::to_string(body).unwrap_or_default();
        self.request("POST", endpoint, Some(&payload))
    }

    fn request(
        &self,
        method: &str,
        endpoint: &str,
        body_payload: Option<&str>,
    ) -> Result<Value, HttpError> {
        let target_addr = format!("{}:{}", self.host, self.port);
        let mut stream = TcpStream::connect_timeout(
            &target_addr
                .parse()
                .unwrap_or_else(|_| "127.0.0.1:41732".parse().unwrap()),
            Duration::from_millis(1500),
        )
        .map_err(|e| HttpError {
            message: e.to_string(),
            status_code: 0,
            body: json!({ "error": e.to_string() }),
        })?;

        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

        let mut req = format!(
            "{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n",
            method, endpoint, target_addr
        );

        if let Some(payload) = body_payload {
            req.push_str("Content-Type: application/json\r\n");
            req.push_str(&format!("Content-Length: {}\r\n\r\n", payload.len()));
            req.push_str(payload);
        } else {
            req.push_str("\r\n");
        }

        stream.write_all(req.as_bytes()).map_err(|e| HttpError {
            message: e.to_string(),
            status_code: 0,
            body: json!({ "error": e.to_string() }),
        })?;

        let mut response_bytes = Vec::new();
        stream
            .read_to_end(&mut response_bytes)
            .map_err(|e| HttpError {
                message: e.to_string(),
                status_code: 0,
                body: json!({ "error": e.to_string() }),
            })?;

        let response_str = String::from_utf8_lossy(&response_bytes);
        let header_end = response_str.find("\r\n\r\n").unwrap_or(0);
        let headers = &response_str[..header_end];
        let body_str = if header_end + 4 <= response_str.len() {
            &response_str[header_end + 4..]
        } else {
            ""
        };

        // Parse status code
        let mut status_code = 200u16;
        if let Some(first_line) = headers.lines().next() {
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(code) = parts[1].parse::<u16>() {
                    status_code = code;
                }
            }
        }

        let parsed_body: Value = serde_json::from_str(body_str)
            .unwrap_or_else(|_| json!({ "raw": body_str.trim() }));

        if status_code >= 400 {
            let err_msg = parsed_body
                .get("error")
                .or_else(|| parsed_body.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or(&format!("HTTP {}", status_code))
                .to_string();

            return Err(HttpError {
                message: err_msg,
                status_code,
                body: parsed_body,
            });
        }

        Ok(parsed_body)
    }
}

/// Spooler da fila outbox (.cgli/vault/00-inbox/.outbox) com política Fail-Loud
/// Enfileira a requisição para processamento seguro e encerra com exit code 1.
pub fn spool_outbox(endpoint: &str, payload: &Value, workspace_path: &Path) -> ! {
    let scope = payload
        .get("scope")
        .and_then(|v| v.as_str())
        .unwrap_or("project");
    let vault_path = cgli_vault::get_vault_path(scope, Some(workspace_path));
    let outbox_dir = vault_path.join("00-inbox").join(".outbox");

    if !outbox_dir.exists() {
        let _ = fs::create_dir_all(&outbox_dir);
    }

    let ulid = cgli_vault::generate_id();
    let outbox_file = outbox_dir.join(format!("{}.json", ulid));

    let now = chrono::Utc::now().to_rfc3339();
    let entry = json!({
        "ulid": ulid,
        "timestamp": now,
        "endpoint": endpoint,
        "body": payload
    });

    if let Ok(serialized) = serde_json::to_string_pretty(&entry) {
        let _ = fs::write(&outbox_file, serialized);
        eprintln!(
            "[CGLI-FAIL-LOUD] Servidor bridge CGLI inacessível. Operação enfileirada com segurança na outbox (.cgli/vault/00-inbox/.outbox/{}.json). Saindo com código 1.",
            ulid
        );
    } else {
        eprintln!(
            "[CGLI-FAIL-LOUD] Servidor bridge CGLI inacessível e falha ao serializar spool outbox."
        );
    }

    exit(1);
}

pub fn execute_memory_write<F>(
    client: &HttpClient,
    endpoint: &str,
    payload: &Value,
    workspace_path: &Path,
    success_callback: F,
) -> Value
where
    F: FnOnce(&Value),
{
    match client.post(endpoint, payload) {
        Ok(res) => {
            if res.get("conflict").and_then(|v| v.as_bool()).unwrap_or(false) {
                let msg = res
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Divergência de revisão");
                eprintln!("[CGLI CONFLITO] Conflito de concorrência detectado: {}", msg);
                if let Some(cf) = res.get("conflictFile").and_then(|v| v.as_str()) {
                    eprintln!("[CGLI CONFLITO] Cópia concorrente preservada em: {}", cf);
                }
                exit(1);
            }
            success_callback(&res);
            res
        }
        Err(err) => {
            if err.status_code == 409 {
                let msg = err
                    .body
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&err.message);
                eprintln!(
                    "[CGLI CONFLITO] Conflito de concorrência detectado (409): {}",
                    msg
                );
                if let Some(cf) = err.body.get("conflictFile").and_then(|v| v.as_str()) {
                    eprintln!("[CGLI CONFLITO] Cópia concorrente preservada em: {}", cf);
                }
                exit(1);
            }

            if err.status_code == 0 {
                spool_outbox(endpoint, payload, workspace_path);
            } else {
                eprintln!("[CGLI Erro HTTP {}] {}", err.status_code, err.message);
                exit(1);
            }
        }
    }
}

pub fn parse_flags(args_list: &[String]) -> (HashMap<String, String>, Vec<String>) {
    let mut flags = HashMap::new();
    let mut positional = Vec::new();

    let boolean_flags: [&str; 6] = ["stdin", "dry-run", "dryrun", "simulate", "update", "generate"];

    let mut i = 0;
    while i < args_list.len() {
        let item = &args_list[i];
        if item.starts_with("--") {
            let without_prefix = &item[2..];
            if let Some(eq_idx) = without_prefix.find('=') {
                let key = &without_prefix[..eq_idx];
                let val = &without_prefix[eq_idx + 1..];
                flags.insert(key.to_string(), val.to_string());
            } else {
                let key = without_prefix;
                if boolean_flags.contains(&key) {
                    flags.insert(key.to_string(), "true".to_string());
                } else if i + 1 < args_list.len() && !args_list[i + 1].starts_with("--") {
                    flags.insert(key.to_string(), args_list[i + 1].clone());
                    i += 1;
                } else {
                    flags.insert(key.to_string(), "true".to_string());
                }
            }
        } else {
            positional.push(item.clone());
        }
        i += 1;
    }

    (flags, positional)
}

fn read_stdin() -> String {
    let mut buf = String::new();
    let _ = std::io::stdin().read_to_string(&mut buf);
    buf
}

fn main() {
    let raw_args: Vec<String> = std::env::args().collect();
    if raw_args.len() < 2 {
        print_usage();
        return;
    }

    let command = &raw_args[1];
    let (flags, positional) = parse_flags(&raw_args[2..]);

    let node_id = std::env::var("CGLI_NODE_ID").unwrap_or_default();
    let workspace_path = std::env::var("CGLI_WORKSPACE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let client = HttpClient::discover();

    match command.as_str() {
        "spawn-subagent" => {
            let child_type = flags.get("type").map(|s| s.as_str()).unwrap_or("agy");
            let role = flags
                .get("role")
                .map(|s| s.as_str())
                .unwrap_or(if child_type == "claude" {
                    "planner"
                } else {
                    "executor"
                });
            let task = flags.get("task").map(|s| s.as_str()).unwrap_or("");

            let payload = json!({
                "parent_node_id": node_id,
                "child_type": child_type,
                "role": role,
                "task": task
            });

            match client.post("/api/spawn-subagent", &payload) {
                Ok(_) => {
                    println!(
                        "[CGLI] Subagente {} invocado com sucesso no canvas.",
                        child_type.to_uppercase()
                    );
                }
                Err(err) => {
                    eprintln!("[CGLI Erro] Falha ao invocar subagente: {}", err.message);
                    exit(1);
                }
            }
        }

        "create-artifact" => {
            let title = flags
                .get("title")
                .map(|s| s.as_str())
                .unwrap_or("Documento de Artefato");
            let mut content = flags.get("content").cloned().unwrap_or_default();

            if flags.contains_key("stdin") {
                content = read_stdin();
            } else if let Some(file_arg) = flags.get("file") {
                let file_path = workspace_path.join(file_arg);
                if file_path.exists() {
                    content = fs::read_to_string(&file_path).unwrap_or_default();
                } else {
                    eprintln!(
                        "[CGLI Erro] Arquivo '{}' não foi encontrado no workspace.",
                        file_arg
                    );
                    exit(1);
                }
            }

            let payload = json!({
                "parent_node_id": node_id,
                "title": title,
                "content": content
            });

            match client.post("/api/create-artifact", &payload) {
                Ok(_) => {
                    println!(
                        "[CGLI] Nó de artefato '{}' criado com sucesso no canvas.",
                        title
                    );
                }
                Err(err) => {
                    eprintln!("[CGLI Erro] Falha ao criar artefato: {}", err.message);
                    exit(1);
                }
            }
        }

        "create-preview" => {
            let title = flags
                .get("title")
                .map(|s| s.as_str())
                .unwrap_or("Preview Web");
            let mut html = flags.get("html").cloned().unwrap_or_default();

            if let Some(file_arg) = flags.get("file") {
                let file_path = workspace_path.join(file_arg);
                if file_path.exists() {
                    html = fs::read_to_string(&file_path).unwrap_or_default();
                }
            }

            let payload = json!({
                "parent_node_id": node_id,
                "title": title,
                "html": html
            });

            match client.post("/api/create-preview", &payload) {
                Ok(_) => {
                    println!("[CGLI] Nó de preview '{}' criado no canvas.", title);
                }
                Err(err) => {
                    eprintln!("[CGLI Erro] Falha ao criar preview: {}", err.message);
                }
            }
        }

        "create-diff" => {
            let title = flags
                .get("title")
                .map(|s| s.as_str())
                .unwrap_or("Alterações de Código");
            let filename = flags.get("file").cloned().unwrap_or_default();
            let mut diff_content = flags.get("content").cloned().unwrap_or_default();

            if diff_content.is_empty() {
                let mut cmd = Command::new("git");
                cmd.arg("diff");
                if !filename.is_empty() {
                    cmd.arg(&filename);
                }
                cmd.current_dir(&workspace_path);
                if let Ok(output) = cmd.output() {
                    diff_content = String::from_utf8_lossy(&output.stdout).to_string();
                }

                if diff_content.trim().is_empty() && !filename.is_empty() {
                    let mut cmd2 = Command::new("git");
                    cmd2.args(["diff", "HEAD", &filename]);
                    cmd2.current_dir(&workspace_path);
                    if let Ok(output) = cmd2.output() {
                        diff_content = String::from_utf8_lossy(&output.stdout).to_string();
                    }
                }
            }

            let payload = json!({
                "parent_node_id": node_id,
                "title": title,
                "filename": if filename.is_empty() { "diff.patch" } else { &filename },
                "content": diff_content
            });

            match client.post("/api/create-diff", &payload) {
                Ok(_) => {
                    println!("[CGLI] Nó de diff '{}' criado no canvas.", title);
                }
                Err(err) => {
                    eprintln!("[CGLI Erro] Falha ao criar diff: {}", err.message);
                }
            }
        }

        "list-folders" | "folders" => {
            match client.get("/api/workspace-info") {
                Ok(info) => {
                    let project_name = info
                        .get("projectName")
                        .or_else(|| info.get("project_name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Projeto Atual");
                    println!("=== CGLI Workspace Info ===");
                    println!("Projeto: {}", project_name);
                    println!("Diretório deste Nó: {}", workspace_path.to_string_lossy());
                    if let Some(folders) = info.get("folders").and_then(|v| v.as_array()) {
                        if !folders.is_empty() {
                            println!("Pastas do Projeto ({}):", folders.len());
                            for f in folders {
                                let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                let path = f.get("path").and_then(|v| v.as_str()).unwrap_or("");
                                println!("  • {}: {}", name, path);
                            }
                        } else {
                            println!("Pastas do Projeto: {}", workspace_path.to_string_lossy());
                        }
                    } else {
                        println!("Pastas do Projeto: {}", workspace_path.to_string_lossy());
                    }
                }
                Err(_) => {
                    println!("Diretório deste Nó: {}", workspace_path.to_string_lossy());
                }
            }
        }

        "status" => {
            match client.get("/api/status") {
                Ok(st) => {
                    let p = st.get("port").and_then(|v| v.as_u64()).unwrap_or(client.port as u64);
                    println!("[CGLI Status] Bridge ativa na porta {}", p);
                }
                Err(err) => {
                    eprintln!("[CGLI Erro] Ponte indisponível: {}", err.message);
                }
            }
        }

        "memory" => {
            let sub = positional.get(0).map(|s| s.as_str()).unwrap_or("");
            let scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("project");

            match sub {
                "write" => {
                    let mut text = flags
                        .get("text")
                        .or_else(|| flags.get("content"))
                        .cloned()
                        .unwrap_or_default();
                    if flags.contains_key("stdin") {
                        text = read_stdin();
                    }
                    if text.is_empty() {
                        eprintln!("[CGLI Erro] O parâmetro --text ou --stdin é obrigatório para registrar uma observação.");
                        exit(1);
                    }

                    let tags = parse_csv_or_vec(flags.get("tags"));
                    let refs = parse_csv_or_vec(flags.get("refs"));
                    let kind = flags
                        .get("kind")
                        .or_else(|| flags.get("type"))
                        .map(|s| s.as_str())
                        .unwrap_or("finding");
                    let confidence = flags
                        .get("confidence")
                        .and_then(|s| s.parse::<f64>().ok())
                        .unwrap_or(0.8);
                    let idem_key = flags
                        .get("idem-key")
                        .or_else(|| flags.get("idemKey"))
                        .cloned();

                    let payload = json!({
                        "scope": scope,
                        "workspacePath": workspace_path.to_string_lossy(),
                        "agentId": if node_id.is_empty() { "agent" } else { &node_id },
                        "content": text,
                        "kind": kind,
                        "tags": tags,
                        "refs": refs,
                        "source": flags.get("source"),
                        "confidence": confidence,
                        "idemKey": idem_key
                    });

                    execute_memory_write(
                        &client,
                        "/api/memory/write",
                        &payload,
                        &workspace_path,
                        |res| {
                            let id_str = res.get("id").and_then(|v| v.as_str()).unwrap_or("OK");
                            println!(
                                "[CGLI Memory] Observação registrada no Vault ({}): {}",
                                scope, id_str
                            );
                        },
                    );
                }

                "note" => {
                    let note_type = flags.get("type").map(|s| s.as_str()).unwrap_or("decision");
                    let title = flags
                        .get("title")
                        .map(|s| s.as_str())
                        .unwrap_or("Nova Decisão");
                    let mut note_content = flags.get("content").cloned().unwrap_or_default();

                    if flags.contains_key("stdin") {
                        note_content = read_stdin();
                    } else if let Some(file_arg) = flags.get("file") {
                        let file_path = workspace_path.join(file_arg);
                        if file_path.exists() {
                            note_content = fs::read_to_string(&file_path).unwrap_or_default();
                        } else {
                            eprintln!("[CGLI Erro] Arquivo '{}' não encontrado.", file_arg);
                            exit(1);
                        }
                    }

                    if note_content.is_empty() {
                        eprintln!(
                            "[CGLI Erro] Forneça o conteúdo da nota via --content, --file ou --stdin."
                        );
                        exit(1);
                    }

                    let tags = parse_csv_or_vec(flags.get("tags"));
                    let confidence = flags
                        .get("confidence")
                        .and_then(|s| s.parse::<f64>().ok())
                        .unwrap_or(0.85);
                    let idem_key = flags
                        .get("idem-key")
                        .or_else(|| flags.get("idemKey"))
                        .cloned();

                    let payload = json!({
                        "scope": scope,
                        "workspacePath": workspace_path.to_string_lossy(),
                        "type": note_type,
                        "title": title,
                        "content": note_content,
                        "author": if node_id.is_empty() { "agent" } else { &node_id },
                        "tags": tags,
                        "confidence": confidence,
                        "nodeId": node_id,
                        "idemKey": idem_key
                    });

                    execute_memory_write(
                        &client,
                        "/api/memory/note",
                        &payload,
                        &workspace_path,
                        |res| {
                            let rel = res
                                .get("relativePath")
                                .or_else(|| res.get("id"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("-");
                            println!(
                                "[CGLI Memory] Nota '{}' criada no Vault ({}): {}",
                                title, scope, rel
                            );
                        },
                    );
                }

                "update" => {
                    let id = flags
                        .get("id")
                        .cloned()
                        .or_else(|| positional.get(1).cloned())
                        .unwrap_or_default();
                    if id.is_empty() {
                        eprintln!("[CGLI Erro] Especifique o ID da nota para atualizar: cgli memory update <id> [--content \"...\" | --file doc.md | --stdin]");
                        exit(1);
                    }

                    let mut note_content = flags.get("content").cloned().unwrap_or_default();
                    if flags.contains_key("stdin") {
                        note_content = read_stdin();
                    } else if let Some(file_arg) = flags.get("file") {
                        let file_path = workspace_path.join(file_arg);
                        if file_path.exists() {
                            note_content = fs::read_to_string(&file_path).unwrap_or_default();
                        } else {
                            eprintln!("[CGLI Erro] Arquivo '{}' não encontrado.", file_arg);
                            exit(1);
                        }
                    }

                    if note_content.is_empty() {
                        eprintln!(
                            "[CGLI Erro] Forneça o novo conteúdo da nota via --content, --file ou --stdin."
                        );
                        exit(1);
                    }

                    let expect_rev = flags
                        .get("expect-rev")
                        .or_else(|| flags.get("rev"))
                        .and_then(|s| s.parse::<u32>().ok());
                    let expect_etag = flags.get("expect-etag").or_else(|| flags.get("etag")).cloned();
                    let idem_key = flags
                        .get("idem-key")
                        .or_else(|| flags.get("idemKey"))
                        .cloned();

                    let payload = json!({
                        "id": id,
                        "content": note_content,
                        "expectRev": expect_rev,
                        "expectEtag": expect_etag,
                        "author": if node_id.is_empty() { "agent" } else { &node_id },
                        "scope": scope,
                        "workspacePath": workspace_path.to_string_lossy(),
                        "idemKey": idem_key
                    });

                    execute_memory_write(
                        &client,
                        "/api/memory/update",
                        &payload,
                        &workspace_path,
                        |res| {
                            let note_title = res.get("title").and_then(|v| v.as_str()).unwrap_or(&id);
                            let rev = res.get("rev").and_then(|v| v.as_u64()).unwrap_or(1);
                            let etag = res.get("etag").and_then(|v| v.as_str()).unwrap_or("-");
                            let rel = res
                                .get("relativePath")
                                .or_else(|| res.get("id"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("-");
                            println!(
                                "[CGLI Memory] Nota '{}' atualizada com sucesso (rev {}, etag {}): {}",
                                note_title, rev, etag, rel
                            );
                        },
                    );
                }

                "append" => {
                    let id = flags
                        .get("id")
                        .cloned()
                        .or_else(|| positional.get(1).cloned())
                        .unwrap_or_default();
                    if id.is_empty() {
                        eprintln!("[CGLI Erro] Especifique o ID da nota: cgli memory append <id> --section \"Título da Seção\" [--content \"...\" | --file doc.md | --stdin]");
                        exit(1);
                    }

                    let section_title = flags
                        .get("section")
                        .or_else(|| flags.get("title"))
                        .map(|s| s.as_str())
                        .unwrap_or("Atualização");

                    let mut append_content = flags.get("content").cloned().unwrap_or_default();
                    if flags.contains_key("stdin") {
                        append_content = read_stdin();
                    } else if let Some(file_arg) = flags.get("file") {
                        let file_path = workspace_path.join(file_arg);
                        if file_path.exists() {
                            append_content = fs::read_to_string(&file_path).unwrap_or_default();
                        } else {
                            eprintln!("[CGLI Erro] Arquivo '{}' não encontrado.", file_arg);
                            exit(1);
                        }
                    }

                    if append_content.is_empty() {
                        eprintln!(
                            "[CGLI Erro] Forneça o conteúdo a anexar via --content, --file ou --stdin."
                        );
                        exit(1);
                    }

                    let idem_key = flags
                        .get("idem-key")
                        .or_else(|| flags.get("idemKey"))
                        .cloned();

                    let payload = json!({
                        "id": id,
                        "sectionTitle": section_title,
                        "content": append_content,
                        "author": if node_id.is_empty() { "agent" } else { &node_id },
                        "scope": scope,
                        "workspacePath": workspace_path.to_string_lossy(),
                        "idemKey": idem_key
                    });

                    execute_memory_write(
                        &client,
                        "/api/memory/append",
                        &payload,
                        &workspace_path,
                        |res| {
                            let note_title = res.get("title").and_then(|v| v.as_str()).unwrap_or(&id);
                            let rev = res.get("rev").and_then(|v| v.as_u64()).unwrap_or(1);
                            let rel = res
                                .get("relativePath")
                                .or_else(|| res.get("id"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("-");
                            println!(
                                "[CGLI Memory] Seção '{}' anexada à nota '{}' (rev {}): {}",
                                section_title, note_title, rev, rel
                            );
                        },
                    );
                }

                "drain-outbox" => {
                    println!("[CGLI Outbox] Processando fila de outbox (.cgli/vault/00-inbox/.outbox)...");
                    let res = client
                        .post("/api/memory/drain-outbox", &json!({ "workspacePath": workspace_path.to_string_lossy() }))
                        .unwrap_or_else(|_| cgli_vault::drain_outbox(Some(&workspace_path)).unwrap_or_default());

                    let processed = res.get("processed").and_then(|v| v.as_u64()).unwrap_or(0);
                    let failed = res.get("failed").and_then(|v| v.as_u64()).unwrap_or(0);
                    println!(
                        "[CGLI Outbox] Concluído: {} operações executadas, {} falhas.",
                        processed, failed
                    );
                    if let Some(messages) = res.get("messages").and_then(|v| v.as_array()) {
                        for m in messages {
                            if let Some(s) = m.as_str() {
                                println!("  • {}", s);
                            }
                        }
                    }
                }

                "list" => {
                    let note_type = flags.get("type").map(|s| s.as_str());
                    let endpoint = format!(
                        "/api/memory/list?scope={}{}",
                        scope,
                        note_type.map(|t| format!("&type={}", t)).unwrap_or_default()
                    );

                    let notes = match client.get(&endpoint) {
                        Ok(res) => res.get("notes").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
                        Err(_) => {
                            let local_notes = cgli_vault::list_notes(scope, Some(&workspace_path), note_type).unwrap_or_default();
                            local_notes.into_iter().map(|n| serde_json::to_value(n).unwrap()).collect()
                        }
                    };

                    println!("=== Notas no Vault ({}) [Total: {}] ===", scope, notes.len());
                    for n in notes {
                        let t = n.get("type").and_then(|v| v.as_str()).unwrap_or("nota");
                        let title = n.get("title").and_then(|v| v.as_str()).unwrap_or("-");
                        let id = n.get("id").and_then(|v| v.as_str()).unwrap_or("-");
                        let rel = n.get("relativePath").and_then(|v| v.as_str()).unwrap_or("-");
                        println!("  • [{}] {} (ID: {}) -> {}", t, title, id, rel);
                    }
                }

                "get" => {
                    let id_or_path = flags
                        .get("id")
                        .or_else(|| flags.get("file"))
                        .cloned()
                        .or_else(|| positional.get(1).cloned())
                        .unwrap_or_default();

                    if id_or_path.is_empty() {
                        eprintln!("[CGLI Erro] Especifique o ID ou caminho da nota: cgli memory get <id>");
                        exit(1);
                    }

                    let endpoint = format!("/api/memory/get?scope={}&id={}", scope, id_or_path);
                    match client.get(&endpoint) {
                        Ok(res) if res.get("success").and_then(|v| v.as_bool()).unwrap_or(false) => {
                            if let Some(content) = res.get("content").and_then(|v| v.as_str()) {
                                println!("{}", content);
                            }
                        }
                        _ => match cgli_vault::get_note(scope, Some(&workspace_path), &id_or_path) {
                            Ok(res) if res.get("success").and_then(|v| v.as_bool()).unwrap_or(false) => {
                                if let Some(content) = res.get("content").and_then(|v| v.as_str()) {
                                    println!("{}", content);
                                }
                            }
                            Ok(res) => {
                                eprintln!(
                                    "[CGLI Erro] {}",
                                    res.get("error").and_then(|v| v.as_str()).unwrap_or("Nota não encontrada")
                                );
                            }
                            Err(e) => eprintln!("[CGLI Erro] {}", e),
                        },
                    }
                }

                "open" => {
                    let file = flags
                        .get("file")
                        .cloned()
                        .or_else(|| positional.get(1).cloned())
                        .unwrap_or_default();

                    let payload = json!({
                        "scope": scope,
                        "workspacePath": workspace_path.to_string_lossy(),
                        "file": file
                    });

                    let _ = client
                        .post("/api/memory/open", &payload)
                        .or_else(|_| cgli_vault::open_in_obsidian(scope, Some(&workspace_path), Some(&file)));

                    println!(
                        "[CGLI Memory] Abrindo Vault ({}) no aplicativo Obsidian...",
                        scope
                    );
                }

                "search" => {
                    let query = flags
                        .get("query")
                        .or_else(|| flags.get("q"))
                        .cloned()
                        .or_else(|| positional.get(1).cloned())
                        .unwrap_or_default();
                    let search_scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("all");
                    let limit = flags
                        .get("limit")
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(15);

                    if query.is_empty() {
                        eprintln!("[CGLI Erro] Especifique o termo de busca: cgli memory search <termo>");
                        exit(1);
                    }

                    let endpoint = format!(
                        "/api/memory/search?q={}&scope={}&limit={}",
                        query, search_scope, limit
                    );

                    let hits = match client.get(&endpoint) {
                        Ok(res) => res.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
                        Err(_) => {
                            let local_hits = cgli_vault::search_notes(&query, search_scope, None, Some(&workspace_path), limit).unwrap_or_default();
                            local_hits.into_iter().map(|h| serde_json::to_value(h).unwrap()).collect()
                        }
                    };

                    println!(
                        "=== Resultados da Busca (\"{}\") [{} encontrados] ===",
                        query,
                        hits.len()
                    );
                    for h in hits {
                        let sc = h.get("scope").and_then(|v| v.as_str()).unwrap_or("-");
                        let t = h.get("type").and_then(|v| v.as_str()).unwrap_or("nota");
                        let title = h.get("title").and_then(|v| v.as_str()).unwrap_or("-");
                        let id = h.get("id").and_then(|v| v.as_str()).unwrap_or("-");
                        println!("  • [{}] [{}] {} (ID: {})", sc, t, title, id);
                        if let Some(snip) = h.get("snippet").and_then(|v| v.as_str()) {
                            if !snip.is_empty() {
                                println!("    > {}", snip);
                            }
                        }
                    }
                }

                "context" => {
                    let task_query = flags
                        .get("for")
                        .or_else(|| flags.get("task"))
                        .or_else(|| flags.get("query"))
                        .cloned()
                        .or_else(|| {
                            if positional.len() > 1 {
                                Some(positional[1..].join(" "))
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default();

                    let context_scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("all");
                    let budget_tokens = flags
                        .get("budget")
                        .or_else(|| flags.get("budget-tokens"))
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(3000);

                    if task_query.is_empty() {
                        eprintln!("[CGLI Erro] Especifique a tarefa para recall de contexto: cgli memory context --for \"tarefa\"");
                        exit(1);
                    }

                    let payload = json!({
                        "query": task_query,
                        "scope": context_scope,
                        "budgetTokens": budget_tokens,
                        "workspacePath": workspace_path.to_string_lossy()
                    });

                    match client.post("/api/memory/context", &payload) {
                        Ok(res) => {
                            if let Some(md) = res.get("markdown").and_then(|v| v.as_str()) {
                                println!("{}", md);
                            }
                        }
                        Err(_) => {
                            if let Ok(pack) = cgli_vault::build_context_pack(
                                &task_query,
                                budget_tokens,
                                context_scope,
                                Some(&workspace_path),
                                false,
                                &[],
                            ) {
                                println!("{}", pack.markdown);
                            }
                        }
                    }
                }

                "doctor" => {
                    let doctor_scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("all");
                    println!(
                        "[CGLI Doctor] Analisando integridade do Vault ({})...",
                        doctor_scope
                    );

                    let report = client
                        .get(&format!("/api/memory/doctor?scope={}", doctor_scope))
                        .unwrap_or_else(|_| {
                            cgli_vault::run_doctor(doctor_scope, Some(&workspace_path))
                                .unwrap_or_default()
                        });

                    let passed = report.get("passed").and_then(|v| v.as_bool()).unwrap_or(true);
                    println!("\n=== Relatório de Saúde da Memória (CGLI Doctor) ===");
                    println!(
                        "Status Geral: {}",
                        if passed { "✅ SAUDÁVEL" } else { "⚠️ ATENÇÃO NECESSÁRIA" }
                    );

                    if let Some(stats) = report.get("stats") {
                        let total_notes = stats.get("totalNotes").and_then(|v| v.as_u64()).unwrap_or(0);
                        let total_journals = stats.get("totalJournals").and_then(|v| v.as_u64()).unwrap_or(0);
                        let storage_bytes = stats.get("storageBytes").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let tokens = stats.get("totalEstimatedTokens").and_then(|v| v.as_u64()).unwrap_or(0);

                        println!("Estatísticas:");
                        println!("  • Total de Notas: {}", total_notes);
                        println!("  • Arquivos de Journal: {}", total_journals);
                        println!("  • Armazenamento: {:.1} KB", storage_bytes / 1024.0);
                        println!("  • Tokens Estimados: ~{}", tokens);
                    }

                    let issues = report.get("issues").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                    if issues.is_empty() {
                        println!("\nNenhum problema encontrado. Todos os schemas e links estão íntegros!");
                    } else {
                        println!("\nApontamentos detectados ({}):", issues.len());
                        for issue in issues {
                            let sev = issue.get("severity").and_then(|v| v.as_str()).unwrap_or("info");
                            let icon = match sev {
                                "error" => "❌",
                                "warning" => "⚠️",
                                _ => "ℹ️",
                            };
                            let sc = issue.get("scope").and_then(|v| v.as_str()).unwrap_or("-");
                            let file = issue.get("file").and_then(|v| v.as_str()).unwrap_or("-");
                            let msg = issue.get("message").and_then(|v| v.as_str()).unwrap_or("");
                            println!("  {} [{}] [{}] {}: {}", icon, sev.to_uppercase(), sc, file, msg);
                            if let Some(sug) = issue.get("suggestion").and_then(|v| v.as_str()) {
                                println!("     Sugestão: {}", sug);
                            }
                        }
                    }
                }

                "compact" => {
                    let compact_scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("project");
                    let dry_run = flags.contains_key("dry-run")
                        || flags.contains_key("dryrun")
                        || flags.contains_key("simulate");
                    let older_than_days = flags
                        .get("older-than")
                        .or_else(|| flags.get("days"))
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(7);

                    println!(
                        "[CGLI Curator] Executando compactação de journals ({}) [olderThan: {}d, dryRun: {}]...",
                        compact_scope, older_than_days, dry_run
                    );

                    let payload = json!({
                        "scope": compact_scope,
                        "dryRun": dry_run,
                        "olderThanDays": older_than_days,
                        "workspacePath": workspace_path.to_string_lossy()
                    });

                    let res = client
                        .post("/api/memory/compact", &payload)
                        .unwrap_or_else(|_| {
                            cgli_vault::compact_journals(
                                compact_scope,
                                dry_run,
                                older_than_days,
                                Some(&workspace_path),
                            )
                            .unwrap_or_default()
                        });

                    println!("\n=== Resultado da Compactação de Journals ===");
                    if let Some(msg) = res.get("message").and_then(|v| v.as_str()) {
                        println!("{}", msg);
                    }
                    if let Some(created) = res.get("createdNotes").and_then(|v| v.as_array()) {
                        for n in created {
                            let title = n.get("title").and_then(|v| v.as_str()).unwrap_or("");
                            let rel = n.get("relativePath").and_then(|v| v.as_str()).unwrap_or("");
                            println!("  • Nova nota gerada: {} -> {}", title, rel);
                        }
                    }
                }

                "moc" => {
                    let moc_scope = flags.get("scope").map(|s| s.as_str()).unwrap_or("project");
                    let update = flags.contains_key("update") || flags.contains_key("generate");

                    println!("[CGLI MOC] Processando Map of Content ({})...", moc_scope);
                    let payload = json!({
                        "scope": moc_scope,
                        "workspacePath": workspace_path.to_string_lossy()
                    });

                    let res = if update {
                        client.post("/api/memory/moc", &payload).unwrap_or_else(|_| {
                            cgli_vault::generate_moc(moc_scope, Some(&workspace_path)).unwrap_or_default()
                        })
                    } else {
                        client.get(&format!("/api/memory/moc?scope={}", moc_scope)).unwrap_or_else(|_| {
                            cgli_vault::generate_moc(moc_scope, Some(&workspace_path)).unwrap_or_default()
                        })
                    };

                    if let Some(content) = res.get("content").and_then(|v| v.as_str()) {
                        println!("{}", content);
                    }
                    if let Some(rel) = res.get("relativePath").and_then(|v| v.as_str()) {
                        println!("\n[Arquivo gerado em: {}]", rel);
                    }
                }

                _ => {
                    print_memory_usage();
                }
            }
        }

        _ => {
            print_usage();
        }
    }
}

fn parse_csv_or_vec(val: Option<&String>) -> Vec<String> {
    match val {
        Some(s) => s
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        None => Vec::new(),
    }
}

fn print_usage() {
    println!(
        r#"CGLI Canvas CLI Helper (Rust 100% Nativo)
Uso:
  cgli spawn-subagent --type [claude|agy] --task "Descricao" [--role planner|executor]
  cgli create-artifact --title "Titulo" [--content "Markdown" | --file doc.md | --stdin]
  cgli create-preview --title "Titulo" [--html "HTML" | --file page.html]
  cgli create-diff --title "Titulo" [--file src/arquivo.ts] [--content "..."]
  cgli memory write [--scope project|global] --text "Observacao" [--tags tag1,tag2]
  cgli memory note [--scope project|global] --type decision --title "ADR..." [--file doc.md | --content "..."]
  cgli memory update <id> --content "Novo conteudo" [--expect-rev 1] [--expect-etag <etag>]
  cgli memory append <id> --section "Nova Secao" --content "Texto"
  cgli memory list [--scope project|global] [--type decision]
  cgli memory get <id_ou_caminho> [--scope project|global]
  cgli memory open [--scope project|global] [--file caminho]
  cgli memory drain-outbox
  cgli list-folders
  cgli status"#
    );
}

fn print_memory_usage() {
    println!(
        r#"CGLI Memory Subcomandos:
  cgli memory write [--scope project|global] --text "Texto" [--tags t1,t2] [--refs "[[link]]"] [--idem-key <key>]
  cgli memory note [--scope project|global] --type [decision|knowledge|learning|rule] --title "Titulo" [--content "..." | --file doc.md] [--idem-key <key>]
  cgli memory update <id> [--content "..." | --file doc.md] [--expect-rev <n>] [--expect-etag <etag>] [--idem-key <key>]
  cgli memory append <id> --section "Titulo" [--content "..." | --file doc.md] [--idem-key <key>]
  cgli memory search <termo> [--scope project|global|all] [--limit 10]
  cgli memory context --for "tarefa" [--budget-tokens 3000] [--scope all|project|global] [--include-journals]
  cgli memory doctor [--scope all|project|global]
  cgli memory compact [--scope project|global] [--older-than 7] [--dry-run]
  cgli memory moc [--scope project|global] [--update]
  cgli memory list [--scope project|global] [--type decision]
  cgli memory get <id_ou_caminho> [--scope project|global]
  cgli memory open [--scope project|global] [--file caminho]
  cgli memory drain-outbox"#
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_flags() {
        let args = vec![
            "--type".to_string(),
            "claude".to_string(),
            "--role=planner".to_string(),
            "--stdin".to_string(),
            "subcommand_pos".to_string(),
        ];
        let (flags, positional) = parse_flags(&args);
        assert_eq!(flags.get("type").unwrap(), "claude");
        assert_eq!(flags.get("role").unwrap(), "planner");
        assert_eq!(flags.get("stdin").unwrap(), "true");
        assert_eq!(positional, vec!["subcommand_pos".to_string()]);
    }
}
