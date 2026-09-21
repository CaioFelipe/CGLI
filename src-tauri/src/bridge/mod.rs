use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub static BRIDGE_PORT: AtomicU16 = AtomicU16::new(0);
pub static WORKSPACE_INFO: std::sync::Mutex<Option<serde_json::Value>> = std::sync::Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BridgeAction {
    #[serde(default)]
    pub action_type: String, // "spawn_subagent" | "create_artifact" | "create_preview" | "create_diff"
    pub parent_node_id: Option<String>,
    pub child_type: Option<String>,
    pub role: Option<String>,
    pub task: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub html: Option<String>,
    pub filename: Option<String>,
    pub lines: Option<serde_json::Value>,
}

pub fn get_bridge_port() -> u16 {
    BRIDGE_PORT.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn get_cgli_bridge_port() -> u16 {
    get_bridge_port()
}

pub fn start_bridge_server(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Try preferred port 41732 first, fallback to 0 (OS-assigned port)
        let listener = match TcpListener::bind("127.0.0.1:41732").await {
            Ok(l) => l,
            Err(_) => match TcpListener::bind("127.0.0.1:0").await {
                Ok(l) => l,
                Err(e) => {
                    log::error!("Failed to bind CGLI bridge server: {}", e);
                    return;
                }
            },
        };

        let port = match listener.local_addr() {
            Ok(addr) => addr.port(),
            Err(_) => 41732,
        };

        BRIDGE_PORT.store(port, Ordering::SeqCst);
        log::info!("CGLI Bridge HTTP server running on http://127.0.0.1:{}", port);

        loop {
            if let Ok((mut socket, _)) = listener.accept().await {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut buf = [0u8; 16384];
                    let read_bytes = match socket.read(&mut buf).await {
                        Ok(n) if n > 0 => n,
                        _ => return,
                    };

                    let req_str = String::from_utf8_lossy(&buf[..read_bytes]);

                    let mut lines = req_str.lines();
                    let first_line = lines.next().unwrap_or("");
                    let mut parts = first_line.split_whitespace();
                    let method = parts.next().unwrap_or("");
                    let path = parts.next().unwrap_or("");

                    let mut content_length: usize = 0;
                    for header in &mut lines {
                        if header.is_empty() {
                            break;
                        }
                        let lower = header.to_lowercase();
                        if lower.starts_with("content-length:") {
                            if let Some(val) = header.split(':').nth(1) {
                                content_length = val.trim().parse::<usize>().unwrap_or(0);
                            }
                        }
                    }

                    let body_offset = if let Some(idx) = req_str.find("\r\n\r\n") {
                        idx + 4
                    } else if let Some(idx) = req_str.find("\n\n") {
                        idx + 2
                    } else {
                        req_str.len()
                    };

                    let mut body_str = req_str[body_offset..].to_string();

                    while body_str.len() < content_length {
                        let mut more_buf = [0u8; 8192];
                        match socket.read(&mut more_buf).await {
                            Ok(n) if n > 0 => {
                                body_str.push_str(&String::from_utf8_lossy(&more_buf[..n]));
                            }
                            _ => break,
                        }
                    }

                    let (status_code, response_json) = match (method, path) {
                        ("GET", "/api/status") => (
                            "200 OK",
                            serde_json::json!({ "status": "ok", "port": port }).to_string(),
                        ),
                        ("POST", "/api/spawn-subagent") => {
                            if let Ok(mut action) = serde_json::from_str::<BridgeAction>(&body_str) {
                                action.action_type = "spawn_subagent".to_string();
                                let _ = app.emit("cgli-bridge-action", &action);
                                ("200 OK", serde_json::json!({ "success": true, "action": "spawn_subagent" }).to_string())
                            } else {
                                ("400 Bad Request", serde_json::json!({ "error": "Invalid JSON body" }).to_string())
                            }
                        }
                        ("POST", "/api/create-artifact") => {
                            if let Ok(mut action) = serde_json::from_str::<BridgeAction>(&body_str) {
                                action.action_type = "create_artifact".to_string();
                                let _ = app.emit("cgli-bridge-action", &action);
                                ("200 OK", serde_json::json!({ "success": true, "action": "create_artifact" }).to_string())
                            } else {
                                ("400 Bad Request", serde_json::json!({ "error": "Invalid JSON body" }).to_string())
                            }
                        }
                        ("POST", "/api/create-preview") => {
                            if let Ok(mut action) = serde_json::from_str::<BridgeAction>(&body_str) {
                                action.action_type = "create_preview".to_string();
                                let _ = app.emit("cgli-bridge-action", &action);
                                ("200 OK", serde_json::json!({ "success": true, "action": "create_preview" }).to_string())
                            } else {
                                ("400 Bad Request", serde_json::json!({ "error": "Invalid JSON body" }).to_string())
                            }
                        }
                        ("POST", "/api/create-diff") => {
                            if let Ok(mut action) = serde_json::from_str::<BridgeAction>(&body_str) {
                                action.action_type = "create_diff".to_string();
                                let _ = app.emit("cgli-bridge-action", &action);
                                ("200 OK", serde_json::json!({ "success": true, "action": "create_diff" }).to_string())
                            } else {
                                ("400 Bad Request", serde_json::json!({ "error": "Invalid JSON body" }).to_string())
                            }
                        }
                        ("POST", "/api/update-workspace-info") => {
                            if let Ok(info) = serde_json::from_str::<serde_json::Value>(&body_str) {
                                if let Ok(mut lock) = WORKSPACE_INFO.lock() {
                                    *lock = Some(info);
                                }
                                ("200 OK", serde_json::json!({ "success": true }).to_string())
                            } else {
                                ("400 Bad Request", serde_json::json!({ "error": "Invalid JSON" }).to_string())
                            }
                        }
                        ("GET", "/api/workspace-info") => {
                            let mut base = serde_json::json!({
                                "success": true,
                                "bridge_port": port,
                                "status": "online",
                                "description": "CGLI Agent Studio Bridge"
                            });
                            if let Ok(lock) = WORKSPACE_INFO.lock() {
                                if let Some(ref info) = *lock {
                                    if let Some(obj) = info.as_object() {
                                        for (k, v) in obj {
                                            base[k] = v.clone();
                                        }
                                    }
                                }
                            }
                            ("200 OK", base.to_string())
                        }
                        _ => ("404 Not Found", serde_json::json!({ "error": "Endpoint not found" }).to_string()),
                    };

                    let response = format!(
                        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                        status_code,
                        response_json.len(),
                        response_json
                    );

                    let _ = socket.write_all(response.as_bytes()).await;
                    let _ = socket.flush().await;
                });
            }
        }
    });
}

fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    let _ = fs::write(path, content);
}

pub fn ensure_cgli_environment(workspace_path: &Path, port: u16) {
    let cgli_dir = workspace_path.join(".cgli");
    let bin_dir = cgli_dir.join("bin");

    let _ = fs::create_dir_all(&bin_dir);

    // Create cgli.cjs (universal Node.js CLI runner)
    let cgli_js_path = bin_dir.join("cgli.cjs");
    let cgli_js_content = format!(
r#"#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const {{ execSync }} = require('child_process');

const port = process.env.CGLI_BRIDGE_PORT || {port};
const nodeId = process.env.CGLI_NODE_ID || '';
const workspacePath = process.env.CGLI_WORKSPACE_PATH || process.cwd();

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(argsList) {{
  const flags = {{}};
  for (let i = 0; i < argsList.length; i++) {{
    if (argsList[i].startsWith('--')) {{
      const key = argsList[i].slice(2);
      const val = argsList[i + 1] && !argsList[i + 1].startsWith('--') ? argsList[++i] : true;
      flags[key] = val;
    }}
  }}
  return flags;
}}

function post(endpoint, data) {{
  return new Promise((resolve, reject) => {{
    const payload = JSON.stringify(data);
    const req = http.request({{
      hostname: '127.0.0.1',
      port: Number(port),
      path: endpoint,
      method: 'POST',
      headers: {{
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }}
    }}, (res) => {{
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {{
        try {{
          resolve(JSON.parse(body));
        }} catch (_) {{
          resolve({{ raw: body }});
        }}
      }});
    }});
    req.on('error', reject);
    req.write(payload);
    req.end();
  }});
}}

function get(endpoint) {{
  return new Promise((resolve, reject) => {{
    http.get(`http://127.0.0.1:${{port}}${{endpoint}}`, (res) => {{
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {{
        try {{
          resolve(JSON.parse(body));
        }} catch (_) {{
          resolve({{ raw: body }});
        }}
      }});
    }}).on('error', reject);
  }});
}}

async function run() {{
  const flags = parseArgs(args.slice(1));

  switch (command) {{
    case 'spawn-subagent': {{
      const childType = flags.type || 'agy';
      const role = flags.role || (childType === 'claude' ? 'planner' : 'executor');
      const task = flags.task || '';
      try {{
        await post('/api/spawn-subagent', {{
          parent_node_id: nodeId,
          child_type: childType,
          role,
          task
        }});
        console.log(`[CGLI] Subagente ${{childType.toUpperCase()}} invocado com sucesso no canvas.`);
      }} catch (err) {{
        console.error(`[CGLI Erro] Falha ao invocar subagente:`, err.message);
      }}
      break;
    }}

    case 'create-artifact': {{
      const title = flags.title || 'Documento de Artefato';
      let content = flags.content || '';
      if (flags.file) {{
        const filePath = path.resolve(workspacePath, String(flags.file));
        if (fs.existsSync(filePath)) {{
          content = fs.readFileSync(filePath, 'utf8');
        }} else {{
          console.warn(`[CGLI Aviso] Arquivo '${{flags.file}}' não encontrado.`);
        }}
      }}
      try {{
        await post('/api/create-artifact', {{
          parent_node_id: nodeId,
          title,
          content
        }});
        console.log(`[CGLI] Nó de artefato '${{title}}' criado no canvas.`);
      }} catch (err) {{
        console.error(`[CGLI Erro] Falha ao criar artefato:`, err.message);
      }}
      break;
    }}

    case 'create-preview': {{
      const title = flags.title || 'Preview Web';
      let html = flags.html || '';
      if (flags.file) {{
        const filePath = path.resolve(workspacePath, String(flags.file));
        if (fs.existsSync(filePath)) {{
          html = fs.readFileSync(filePath, 'utf8');
        }}
      }}
      try {{
        await post('/api/create-preview', {{
          parent_node_id: nodeId,
          title,
          html
        }});
        console.log(`[CGLI] Nó de preview '${{title}}' criado no canvas.`);
      }} catch (err) {{
        console.error(`[CGLI Erro] Falha ao criar preview:`, err.message);
      }}
      break;
    }}

    case 'create-diff': {{
      const title = flags.title || 'Alterações de Código';
      const filename = flags.file || '';
      let diffContent = flags.content || '';
      if (!diffContent) {{
        try {{
          const target = filename ? `"${{filename}}"` : '';
          diffContent = execSync(`git diff ${{target}}`, {{ cwd: workspacePath, encoding: 'utf8' }});
          if (!diffContent.trim() && filename) {{
            diffContent = execSync(`git diff HEAD ${{target}}`, {{ cwd: workspacePath, encoding: 'utf8' }});
          }}
        }} catch (_) {{}}
      }}
      try {{
        await post('/api/create-diff', {{
          parent_node_id: nodeId,
          title,
          filename: filename || 'diff.patch',
          content: diffContent
        }});
        console.log(`[CGLI] Nó de diff '${{title}}' criado no canvas.`);
      }} catch (err) {{
        console.error(`[CGLI Erro] Falha ao criar diff:`, err.message);
      }}
      break;
    }}

    case 'list-folders':
    case 'folders': {{
      try {{
        const info = await get('/api/workspace-info');
        console.log(`=== CGLI Workspace Info ===`);
        console.log(`Projeto: ${{info.projectName || info.project_name || 'Projeto Atual'}}`);
        console.log(`Diretório deste Nó: ${{workspacePath}}`);
        if (info.folders && Array.isArray(info.folders) && info.folders.length > 0) {{
          console.log(`Pastas do Projeto (${{info.folders.length}}):`);
          info.folders.forEach(f => {{
            console.log(`  • ${{f.name}}: ${{f.path}}`);
          }});
        }} else {{
          console.log(`Pastas do Projeto: ${{workspacePath}}`);
        }}
      }} catch (err) {{
        console.log(`Diretório deste Nó: ${{workspacePath}}`);
      }}
      break;
    }}

    case 'status': {{
      try {{
        const st = await get('/api/status');
        console.log(`[CGLI Status] Bridge ativa na porta ${{st.port || port}}`);
      }} catch (err) {{
        console.error(`[CGLI Erro] Ponte indisponível:`, err.message);
      }}
      break;
    }}

    default: {{
      console.log(`CGLI Canvas CLI Helper
Uso:
  cgli spawn-subagent --type [claude|agy] --task "Descricao" [--role planner|executor]
  cgli create-artifact --title "Titulo" [--content "Markdown" | --file doc.md]
  cgli create-preview --title "Titulo" [--html "HTML" | --file page.html]
  cgli create-diff --title "Titulo" [--file src/arquivo.ts]
  cgli list-folders
  cgli status`);
      break;
    }}
  }}
}}

run();
"#
    );
    write_if_changed(&cgli_js_path, &cgli_js_content);

    // Create cgli.cmd wrapper for Windows
    let cgli_cmd_path = bin_dir.join("cgli.cmd");
    let cgli_cmd_content = "@echo off\r\nnode \"%~dp0\\cgli.cjs\" %*\r\n";
    write_if_changed(&cgli_cmd_path, cgli_cmd_content);

    // Create cgli sh wrapper
    let cgli_sh_path = bin_dir.join("cgli");
    let cgli_sh_content = "#!/usr/bin/env sh\nDIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nnode \"$DIR/cgli.cjs\" \"$@\"\n";
    write_if_changed(&cgli_sh_path, cgli_sh_content);

    // Create .cgli/CGLI_GUIDE.md
    let guide_path = cgli_dir.join("CGLI_GUIDE.md");
    let guide_content = r##"# CGLI (Canvas Agent Orchestrator) - Guia de Interação

Você está executando dentro do ambiente **CGLI**.
Você tem total acesso ao projeto neste diretório e pode criar ou invocar nós diretamente no canvas.

## Comandos do Canvas Disponíveis

Você pode executar o utilitário `cgli` diretamente no terminal:

1. **Invocar Subagente:**
   ```bash
   cgli spawn-subagent --type agy --task "Executar suite de testes e build"
   cgli spawn-subagent --type claude --role planner --task "Planejar arquitetura"
   ```

2. **Criar Nó de Artefato (Plano / Especificação / Documento):**
   ```bash
   cgli create-artifact --title "Plano de Implementação" --content "# Detalhes..."
   # ou a partir de um arquivo:
   cgli create-artifact --title "Plano de Implementação" --file plano.md
   ```

3. **Criar Nó de Preview Web (HTML / Sandbox Iframe):**
   ```bash
   cgli create-preview --title "Dashboard Preview" --html "<div><h1>Preview</h1></div>"
   # ou a partir de um arquivo html:
   cgli create-preview --title "Dashboard Preview" --file index.html
   ```

4. **Criar Nó de Diff (Comparação de Código):**
   ```bash
   cgli create-diff --title "Alterações em Auth" --file "src/auth.ts"
   ```

5. **Identificar Pastas do Workspace:**
   ```bash
   cgli list-folders
   ```

## Ações via Blocos de Texto
Alternativamente, você pode emitir blocos estruturados na sua resposta que o CGLI interceptará:
`<<<CGLI:SPAWN_SUBAGENT {"child_type":"agy","role":"executor","task":"Executar testes"}>>>`
`<<<CGLI:CREATE_ARTIFACT {"title":"Plano de Teste","content":"# Plano\n..."}>>>`
`<<<CGLI:CREATE_PREVIEW {"title":"Preview Botão","html":"<button>Clique</button>"}>>>`
`<<<CGLI:CREATE_DIFF {"title":"Diff Auth","filename":"src/auth.ts"}>>>`
"##;
    write_if_changed(&guide_path, guide_content);

    // Ensure CLAUDE.md exists in workspace root so Claude Code automatically loads CGLI instructions
    let claude_md_path = workspace_path.join("CLAUDE.md");
    if !claude_md_path.exists() {
        write_if_changed(&claude_md_path, guide_content);
    } else if let Ok(existing) = fs::read_to_string(&claude_md_path) {
        if !existing.contains("CGLI (Canvas Agent Orchestrator)") {
            let combined = format!("{}\n\n{}", existing, guide_content);
            write_if_changed(&claude_md_path, &combined);
        }
    }

    // Ensure AGY.md exists in workspace root
    let agy_md_path = workspace_path.join("AGY.md");
    if !agy_md_path.exists() {
        write_if_changed(&agy_md_path, guide_content);
    }
}
