use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub static BRIDGE_PORT: AtomicU16 = AtomicU16::new(0);

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
                        ("GET", "/api/workspace-info") => {
                            ("200 OK", serde_json::json!({
                                "success": true,
                                "bridge_port": port,
                                "status": "online",
                                "description": "CGLI Agent Studio Bridge"
                            }).to_string())
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

pub fn ensure_cgli_environment(workspace_path: &Path, port: u16) {
    let cgli_dir = workspace_path.join(".cgli");
    let bin_dir = cgli_dir.join("bin");

    let _ = fs::create_dir_all(&bin_dir);

    // Create cgli.cmd for Windows
    let cgli_cmd_path = bin_dir.join("cgli.cmd");
    let cgli_cmd_content = format!(
        r#"@echo off
setlocal enabledelayedexpansion

if "%CGLI_BRIDGE_PORT%"=="" (
    set CGLI_BRIDGE_PORT={port}
)

set CMD=%1
shift

if "%CMD%"=="spawn-subagent" goto spawn_subagent
if "%CMD%"=="create-artifact" goto create_artifact
if "%CMD%"=="create-preview" goto create_preview
if "%CMD%"=="create-diff" goto create_diff
if "%CMD%"=="list-folders" goto list_folders
if "%CMD%"=="folders" goto list_folders
if "%CMD%"=="status" goto status

echo CGLI Canvas CLI Helper
echo Usage:
echo   cgli spawn-subagent --type [claude|agy] --task "Task description" [--role planner|executor]
echo   cgli create-artifact --title "Title" --content "Markdown..."
echo   cgli create-preview --title "Title" --html "HTML..."
echo   cgli create-diff --title "Title" --file path/to/file
echo   cgli list-folders
exit /b 1

:spawn_subagent
set TYPE=agy
set ROLE=executor
set TASK=
:parse_spawn
if "%1"=="" goto do_spawn
if "%1"=="--type" (set TYPE=%2& shift & shift & goto parse_spawn)
if "%1"=="--role" (set ROLE=%2& shift & shift & goto parse_spawn)
if "%1"=="--task" (set TASK=%2& shift & shift & goto parse_spawn)
shift
goto parse_spawn
:do_spawn
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/spawn-subagent -H "Content-Type: application/json" -d "{{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"child_type\":\"%TYPE%\",\"role\":\"%ROLE%\",\"task\":\"%TASK%\"}}"
echo [CGLI] Subagente %TYPE% invocado com sucesso no canvas.
exit /b 0

:create_artifact
set TITLE=Documento de Artefato
set CONTENT=
:parse_art
if "%1"=="" goto do_art
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_art)
if "%1"=="--content" (set CONTENT=%2& shift & shift & goto parse_art)
shift
goto parse_art
:do_art
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-artifact -H "Content-Type: application/json" -d "{{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"content\":\"%CONTENT%\"}}"
echo [CGLI] Nó de artefato criado no canvas.
exit /b 0

:create_preview
set TITLE=Preview Web
set HTML=
:parse_prev
if "%1"=="" goto do_prev
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_prev)
if "%1"=="--html" (set HTML=%2& shift & shift & goto parse_prev)
shift
goto parse_prev
:do_prev
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-preview -H "Content-Type: application/json" -d "{{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"html\":\"%HTML%\"}}"
echo [CGLI] Nó de preview web criado no canvas.
exit /b 0

:create_diff
set TITLE=Alterações de Código
set FILENAME=
:parse_diff
if "%1"=="" goto do_diff
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_diff)
if "%1"=="--file" (set FILENAME=%2& shift & shift & goto parse_diff)
shift
goto parse_diff
:do_diff
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-diff -H "Content-Type: application/json" -d "{{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"filename\":\"%FILENAME%\"}}"
echo [CGLI] Nó de diff criado no canvas.
exit /b 0

:list_folders
curl.exe -s http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/workspace-info
exit /b 0

:status
curl.exe -s http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/status
exit /b 0
"#
    );
    let _ = fs::write(&cgli_cmd_path, cgli_cmd_content);

    // Create cgli (sh script for bash environments)
    let cgli_sh_path = bin_dir.join("cgli");
    let cgli_sh_content = format!(
        r#"#!/usr/bin/env bash
CGLI_BRIDGE_PORT="${{CGLI_BRIDGE_PORT:-{port}}}"
CMD="$1"
shift

case "$CMD" in
  spawn-subagent)
    TYPE="agy"
    ROLE="executor"
    TASK=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --type) TYPE="$2"; shift 2 ;;
        --role) ROLE="$2"; shift 2 ;;
        --task) TASK="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    curl -s -X POST "http://127.0.0.1:${{CGLI_BRIDGE_PORT}}/api/spawn-subagent" \
      -H "Content-Type: application/json" \
      -d "{{\"parent_node_id\":\"${{CGLI_NODE_ID}}\",\"child_type\":\"${{TYPE}}\",\"role\":\"${{ROLE}}\",\"task\":\"${{TASK}}\"}}"
    echo "[CGLI] Subagente ${{TYPE}} invocado com sucesso."
    ;;
  create-artifact)
    TITLE="Artefato"
    CONTENT=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title) TITLE="$2"; shift 2 ;;
        --content) CONTENT="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    curl -s -X POST "http://127.0.0.1:${{CGLI_BRIDGE_PORT}}/api/create-artifact" \
      -H "Content-Type: application/json" \
      -d "{{\"parent_node_id\":\"${{CGLI_NODE_ID}}\",\"title\":\"${{TITLE}}\",\"content\":\"${{CONTENT}}\"}}"
    echo "[CGLI] Nó de artefato criado."
    ;;
  create-preview)
    TITLE="Preview Web"
    HTML=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title) TITLE="$2"; shift 2 ;;
        --html) HTML="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    curl -s -X POST "http://127.0.0.1:${{CGLI_BRIDGE_PORT}}/api/create-preview" \
      -H "Content-Type: application/json" \
      -d "{{\"parent_node_id\":\"${{CGLI_NODE_ID}}\",\"title\":\"${{TITLE}}\",\"html\":\"${{HTML}}\"}}"
    echo "[CGLI] Nó de preview criado."
    ;;
  create-diff)
    TITLE="Diff"
    FILENAME=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title) TITLE="$2"; shift 2 ;;
        --file) FILENAME="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    curl -s -X POST "http://127.0.0.1:${{CGLI_BRIDGE_PORT}}/api/create-diff" \
      -H "Content-Type: application/json" \
      -d "{{\"parent_node_id\":\"${{CGLI_NODE_ID}}\",\"title\":\"${{TITLE}}\",\"filename\":\"${{FILENAME}}\"}}"
    echo "[CGLI] Nó de diff criado."
    ;;
  status)
    curl -s "http://127.0.0.1:${{CGLI_BRIDGE_PORT}}/api/status"
    ;;
  *)
    echo "CGLI Canvas Helper"
    echo "Usage: cgli [spawn-subagent|create-artifact|create-preview|create-diff|status]"
    exit 1
    ;;
esac
"#
    );
    let _ = fs::write(&cgli_sh_path, cgli_sh_content);

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
   ```

3. **Criar Nó de Preview Web (HTML / Sandbox Iframe):**
   ```bash
   cgli create-preview --title "Dashboard Preview" --html "<div><h1>Preview</h1></div>"
   ```

4. **Criar Nó de Diff (Comparação de Código):**
   ```bash
   cgli create-diff --title "Alterações em Auth" --file "src/auth.ts"
   ```

## Ações via Blocos de Texto
Alternativamente, você pode emitir blocos estruturados na sua resposta que o CGLI interceptará:
`<<<CGLI:SPAWN_SUBAGENT {"child_type":"agy","role":"executor","task":"Executar testes"}>>>`
`<<<CGLI:CREATE_ARTIFACT {"title":"Plano de Teste","content":"# Plano\n..."}>>>`
`<<<CGLI:CREATE_PREVIEW {"title":"Preview Botão","html":"<button>Clique</button>"}>>>`
`<<<CGLI:CREATE_DIFF {"title":"Diff Auth","filename":"src/auth.ts"}>>>`
"##;
    let _ = fs::write(&guide_path, guide_content);

    // Ensure CLAUDE.md exists in workspace root so Claude Code automatically loads CGLI instructions
    let claude_md_path = workspace_path.join("CLAUDE.md");
    if !claude_md_path.exists() {
        let _ = fs::write(&claude_md_path, guide_content);
    } else if let Ok(existing) = fs::read_to_string(&claude_md_path) {
        if !existing.contains("CGLI (Canvas Agent Orchestrator)") {
            let combined = format!("{}\n\n{}", existing, guide_content);
            let _ = fs::write(&claude_md_path, combined);
        }
    }

    // Ensure AGY.md exists in workspace root
    let agy_md_path = workspace_path.join("AGY.md");
    if !agy_md_path.exists() {
        let _ = fs::write(&agy_md_path, guide_content);
    }
}
