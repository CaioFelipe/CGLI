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

                    let (status_code, response_json) = if method == "OPTIONS" {
                        ("204 No Content", String::new())
                    } else if path.starts_with("/api/memory/") {
                        let mut ws_path = std::env::var("CGLI_WORKSPACE_PATH").unwrap_or_default();
                        if ws_path.is_empty() {
                            if let Ok(lock) = WORKSPACE_INFO.lock() {
                                if let Some(ref info) = *lock {
                                    if let Some(p) = info.get("workspacePath").and_then(|v| v.as_str()) {
                                        ws_path = p.to_string();
                                    } else if let Some(p) = info.get("path").and_then(|v| v.as_str()) {
                                        ws_path = p.to_string();
                                    }
                                }
                            }
                        }
                        if ws_path.is_empty() {
                            if let Ok(cur) = std::env::current_dir() {
                                ws_path = cur.to_string_lossy().to_string();
                            }
                        }

                        let script_path = Path::new(&ws_path).join(".cgli").join("bin").join("vaultManager.cjs");
                        let mut cmd = std::process::Command::new("node");
                        if script_path.exists() {
                            cmd.arg(&script_path);
                        } else {
                            cmd.arg(".cgli/bin/vaultManager.cjs");
                        }
                        if !ws_path.is_empty() {
                            cmd.current_dir(&ws_path);
                            cmd.env("CGLI_WORKSPACE_PATH", &ws_path);
                        }

                        cmd.arg("rpc")
                            .arg(method)
                            .arg(path);

                        if method == "POST" || method == "PUT" {
                            cmd.arg(&body_str);
                        }

                        match cmd.output() {
                            Ok(out) => {
                                let out_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                                if out.status.success() && !out_str.is_empty() {
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&out_str) {
                                        if val.get("conflict").and_then(|v| v.as_bool()).unwrap_or(false)
                                            || val.get("statusCode").and_then(|v| v.as_i64()) == Some(409)
                                        {
                                            ("409 Conflict", out_str)
                                        } else {
                                            ("200 OK", out_str)
                                        }
                                    } else {
                                        ("200 OK", out_str)
                                    }
                                } else {
                                    let err_msg = String::from_utf8_lossy(&out.stderr);
                                    let resp = serde_json::json!({
                                        "success": false,
                                        "error": format!("VaultManager RPC erro: {}", err_msg)
                                    }).to_string();
                                    ("500 Internal Server Error", resp)
                                }
                            }
                            Err(e) => {
                                let resp = serde_json::json!({
                                    "success": false,
                                    "error": format!("Falha ao executar Node.js para vaultManager: {}", e)
                                }).to_string();
                                ("500 Internal Server Error", resp)
                            }
                        }
                    } else {
                        match (method, path) {
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
                        }
                    };

                    let response = format!(
                        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{}",
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
    cgli_desktop::ensure_cgli_environment(workspace_path, port);
}
