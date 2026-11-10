use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use cgli_core::types::{BridgeAction, SpawnPtyRequest};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::pty::SessionManager;
use crate::writer::VaultWriterQueue;

pub static BRIDGE_PORT: AtomicU16 = AtomicU16::new(0);

pub fn get_bridge_port() -> u16 {
    BRIDGE_PORT.load(Ordering::SeqCst)
}

#[derive(Clone)]
pub struct AppState {
    pub pty: SessionManager,
    pub writer: VaultWriterQueue,
    pub bridge_action_tx: broadcast::Sender<BridgeAction>,
    pub workspace_info: Arc<tokio::sync::RwLock<Option<serde_json::Value>>>,
}

#[derive(Debug, Deserialize)]
pub struct PtyStreamQuery {
    #[serde(rename = "sessionId", default)]
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct MemoryScopeQuery {
    pub scope: Option<String>,
    pub r#type: Option<String>,
    pub id: Option<String>,
    pub q: Option<String>,
    pub r#for: Option<String>,
    pub limit: Option<usize>,
    pub file: Option<String>,
    #[serde(rename = "workspacePath")]
    pub workspace_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub status: &'static str,
    pub port: u16,
    pub queue_depth: usize,
    pub last_write_ms: u64,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Frontend static assets (100% Rust Leptos WASM + encre-css)
        .route("/", get(handle_index_html))
        .route("/index.html", get(handle_index_html))
        .route("/demo", get(handle_showcase_html))
        .route("/showcase", get(handle_showcase_html))
        .route("/favicon.svg", get(handle_favicon_svg))
        .route("/styles.css", get(handle_styles_css))
        .route("/pkg/:file", get(handle_pkg_file))
        // Status
        .route("/api/status", get(handle_status))
        // Bridge Action endpoints
        .route("/api/spawn-subagent", post(handle_spawn_subagent))
        .route("/api/create-artifact", post(handle_create_artifact))
        .route("/api/create-preview", post(handle_create_preview))
        .route("/api/create-diff", post(handle_create_diff))
        .route("/api/bridge/events", get(handle_bridge_events))
        // Workspace info
        .route("/api/update-workspace-info", post(handle_update_workspace_info))
        .route("/api/workspace-info", get(handle_get_workspace_info))
        // PTY endpoints
        .route("/api/pty/spawn", post(handle_pty_spawn))
        .route("/api/pty/stream", get(handle_pty_stream))
        .route("/api/pty/write", post(handle_pty_write))
        .route("/api/pty/resize", post(handle_pty_resize))
        .route("/api/pty/kill", post(handle_pty_kill))
        // Workspace persistence & skills
        .route("/api/workspace/save", post(handle_workspace_save))
        .route("/api/workspace/load", get(handle_workspace_load))
        .route("/api/skills", get(handle_get_skills).post(handle_save_skill))
        // Media
        .route("/api/media/attachment", post(handle_media_attachment))
        // Memory routes (Mutations via Writer Queue, Reads direct)
        .route("/api/memory/write", post(handle_memory_write))
        .route("/api/memory/note", post(handle_memory_note))
        .route("/api/memory/update", post(handle_memory_update))
        .route("/api/memory/append", post(handle_memory_append))
        .route("/api/memory/context-file", post(handle_memory_context_file))
        .route("/api/memory/drain-outbox", post(handle_memory_drain_outbox).get(handle_memory_drain_outbox))
        .route("/api/memory/compact", post(handle_memory_compact))
        .route("/api/memory/open", post(handle_memory_open))
        .route("/api/memory/context", post(handle_memory_context))
        .route("/api/memory/list", get(handle_memory_list))
        .route("/api/memory/get", get(handle_memory_get))
        .route("/api/memory/search", get(handle_memory_search))
        .route("/api/memory/doctor", get(handle_memory_doctor))
        .route("/api/memory/moc", get(handle_memory_moc).post(handle_memory_moc))
        .layer(cors)
        .with_state(state)
}

// -------------------------------------------------------------
// Frontend Static Asset Handlers
// -------------------------------------------------------------

async fn handle_index_html() -> Response {
    let ws = get_workspace_dir(None);
    let dist_index = ws.join("dist").join("index.html");
    let html = fs::read_to_string(&dist_index).unwrap_or_else(|_| {
        r#"<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CGLI — Canvas Agent Orchestrator (100% Rust)</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <script type="module">
      import init from '/pkg/cgli-ui-app.js';
      init();
    </script>
  </body>
</html>"#
            .to_string()
    });
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
        .into_response()
}

async fn handle_favicon_svg() -> Response {
    let ws = get_workspace_dir(None);
    let svg_path = ws.join("public").join("favicon.svg");
    let svg = fs::read_to_string(&svg_path).unwrap_or_default();
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "image/svg+xml")],
        svg,
    )
        .into_response()
}

async fn handle_showcase_html() -> Response {
    let ws = get_workspace_dir(None);
    let site_index = ws.join("site").join("index.html");
    let html = fs::read_to_string(&site_index).unwrap_or_default();
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
        .into_response()
}

async fn handle_styles_css() -> Response {
    let ws = get_workspace_dir(None);
    let dist_css = ws.join("dist").join("styles.css");
    let css = fs::read_to_string(&dist_css).unwrap_or_default();
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/css; charset=utf-8")],
        css,
    )
        .into_response()
}

async fn handle_pkg_file(axum::extract::Path(file): axum::extract::Path<String>) -> Response {
    if file.contains("..") || file.contains('/') || file.contains('\\') {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let ws = get_workspace_dir(None);
    let file_path = ws.join("dist").join("pkg").join(&file);
    match fs::read(&file_path) {
        Ok(bytes) => {
            let content_type = if file.ends_with(".wasm") {
                "application/wasm"
            } else if file.ends_with(".js") {
                "application/javascript; charset=utf-8"
            } else {
                "application/octet-stream"
            };
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, content_type)],
                bytes,
            )
                .into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}


// -------------------------------------------------------------
// Handlers
// -------------------------------------------------------------

async fn handle_status(State(state): State<AppState>) -> Json<StatusResponse> {
    Json(StatusResponse {
        status: "ok",
        port: get_bridge_port(),
        queue_depth: state.writer.queue_depth(),
        last_write_ms: state.writer.last_write_ms(),
    })
}

async fn handle_spawn_subagent(
    State(state): State<AppState>,
    Json(mut action): Json<BridgeAction>,
) -> Response {
    action.action_type = "spawn_subagent".to_string();
    let _ = state.bridge_action_tx.send(action);
    Json(serde_json::json!({ "success": true, "action": "spawn_subagent" })).into_response()
}

async fn handle_create_artifact(
    State(state): State<AppState>,
    Json(mut action): Json<BridgeAction>,
) -> Response {
    action.action_type = "create_artifact".to_string();
    let _ = state.bridge_action_tx.send(action);
    Json(serde_json::json!({ "success": true, "action": "create_artifact" })).into_response()
}

async fn handle_create_preview(
    State(state): State<AppState>,
    Json(mut action): Json<BridgeAction>,
) -> Response {
    action.action_type = "create_preview".to_string();
    let _ = state.bridge_action_tx.send(action);
    Json(serde_json::json!({ "success": true, "action": "create_preview" })).into_response()
}

async fn handle_create_diff(
    State(state): State<AppState>,
    Json(mut action): Json<BridgeAction>,
) -> Response {
    action.action_type = "create_diff".to_string();
    let _ = state.bridge_action_tx.send(action);
    Json(serde_json::json!({ "success": true, "action": "create_diff" })).into_response()
}

async fn handle_bridge_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.bridge_action_tx.subscribe();

    let stream = async_stream::stream! {
        while let Ok(action) = rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&action) {
                yield Ok(Event::default().data(json_str));
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn handle_update_workspace_info(
    State(state): State<AppState>,
    Json(info): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let mut lock = state.workspace_info.write().await;
    *lock = Some(info);
    Json(serde_json::json!({ "success": true }))
}

async fn handle_get_workspace_info(State(state): State<AppState>) -> Json<serde_json::Value> {
    let port = get_bridge_port();
    let mut base = serde_json::json!({
        "success": true,
        "bridge_port": port,
        "status": "online",
        "description": "CGLI Agent Studio Bridge"
    });

    let lock = state.workspace_info.read().await;
    if let Some(ref info) = *lock {
        if let Some(obj) = info.as_object() {
            for (k, v) in obj {
                base[k] = v.clone();
            }
        }
    }
    Json(base)
}

// -------------------------------------------------------------
// PTY Handlers
// -------------------------------------------------------------

async fn handle_pty_spawn(
    State(state): State<AppState>,
    Json(req): Json<SpawnPtyRequest>,
) -> Response {
    let port = get_bridge_port();
    match state.pty.spawn(
        req.session_id.clone(),
        req.command,
        req.args,
        req.cwd,
        req.env,
        port,
    ) {
        Ok(sid) => Json(serde_json::json!({ "success": true, "sessionId": sid })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_pty_stream(
    State(state): State<AppState>,
    Query(query): Query<PtyStreamQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let session_id = query.session_id;
    let initial_buffer = state.pty.get_buffer(&session_id).unwrap_or_default();
    let rx_opt = state.pty.subscribe_output(&session_id).ok();

    let stream = async_stream::stream! {
        for chunk in initial_buffer {
            yield Ok(Event::default().data(serde_json::to_string(&chunk).unwrap_or_default()));
        }

        if let Some(mut rx) = rx_opt {
            while let Ok(chunk) = rx.recv().await {
                if chunk == "__CGLI_EXIT__" {
                    yield Ok(Event::default().event("exit").data("{}"));
                    break;
                } else {
                    yield Ok(Event::default().data(serde_json::to_string(&chunk).unwrap_or_default()));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(Debug, Deserialize)]
pub struct PtyWriteRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub data: String,
}

async fn handle_pty_write(
    State(state): State<AppState>,
    Json(req): Json<PtyWriteRequest>,
) -> Response {
    match state.pty.write(&req.session_id, &req.data) {
        Ok(_) => Json(serde_json::json!({ "success": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct PtyResizeRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

async fn handle_pty_resize(
    State(state): State<AppState>,
    Json(req): Json<PtyResizeRequest>,
) -> Response {
    match state.pty.resize(&req.session_id, req.cols, req.rows) {
        Ok(_) => Json(serde_json::json!({ "success": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct PtyKillRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

async fn handle_pty_kill(
    State(state): State<AppState>,
    Json(req): Json<PtyKillRequest>,
) -> Json<serde_json::Value> {
    let _ = state.pty.kill(&req.session_id);
    Json(serde_json::json!({ "success": true }))
}

// -------------------------------------------------------------
// Workspace & Skills Handlers
// -------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct WorkspaceSaveRequest {
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub data: serde_json::Value,
}

async fn handle_workspace_save(Json(req): Json<WorkspaceSaveRequest>) -> Response {
    let data_str = serde_json::to_string_pretty(&req.data).unwrap_or_default();
    match crate::workspace::save_workspace(&req.project_path, &data_str) {
        Ok(_) => Json(serde_json::json!({ "success": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceLoadQuery {
    #[serde(rename = "projectPath")]
    pub project_path: String,
}

async fn handle_workspace_load(Query(query): Query<WorkspaceLoadQuery>) -> Response {
    match crate::workspace::load_workspace(&query.project_path) {
        Ok(Some(content)) => {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                Json(serde_json::json!({ "success": true, "data": val })).into_response()
            } else {
                Json(serde_json::json!({ "success": true, "data": content })).into_response()
            }
        }
        Ok(None) => Json(serde_json::json!({ "success": true, "data": null })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_get_skills() -> Response {
    match crate::workspace::get_skills() {
        Ok(skills) => Json(serde_json::json!({ "success": true, "skills": skills })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveSkillRequest {
    pub name: String,
    pub content: String,
}

async fn handle_save_skill(Json(req): Json<SaveSkillRequest>) -> Response {
    match crate::workspace::save_skill(&req.name, &req.content) {
        Ok(path) => Json(serde_json::json!({ "success": true, "path": path })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

// -------------------------------------------------------------
// Media Handlers
// -------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct MediaAttachmentRequest {
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub filename: Option<String>,
    #[serde(rename = "base64Data")]
    pub base64_data: String,
}

async fn handle_media_attachment(Json(req): Json<MediaAttachmentRequest>) -> Response {
    let fname = req.filename.unwrap_or_default();
    match crate::media::save_attachment(&req.project_path, &fname, &req.base64_data) {
        Ok(path) => Json(serde_json::json!({ "success": true, "path": path })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

// -------------------------------------------------------------
// Memory RPC Dispatcher
// -------------------------------------------------------------

fn get_workspace_dir(ws_override: Option<&str>) -> PathBuf {
    if let Some(ws) = ws_override {
        if !ws.is_empty() {
            return PathBuf::from(ws);
        }
    }
    if let Ok(ws) = std::env::var("CGLI_WORKSPACE_PATH") {
        if !ws.is_empty() {
            return PathBuf::from(ws);
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn call_vault_rpc(
    method: &str,
    endpoint: &str,
    body: Option<&serde_json::Value>,
    ws_override: Option<&str>,
) -> Result<serde_json::Value, String> {
    let ws_path = get_workspace_dir(ws_override);
    let empty_body = serde_json::json!({});
    let payload = body.unwrap_or(&empty_body);
    cgli_vault::handle_rpc(method, endpoint, payload, Some(&ws_path))
}

// Memory Mutation Handlers (Routed through Single-Writer Queue)

async fn handle_memory_write(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/write",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_note(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/note",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_update(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/update",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => {
            if val.get("conflict").and_then(|v| v.as_bool()).unwrap_or(false)
                || val.get("statusCode").and_then(|v| v.as_i64()) == Some(409)
            {
                (StatusCode::CONFLICT, Json(val)).into_response()
            } else {
                Json(val).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_append(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/append",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_context_file(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/context-file",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_drain_outbox(
    State(state): State<AppState>,
    body_opt: Option<Json<serde_json::Value>>,
) -> Response {
    let ws_override = body_opt
        .as_ref()
        .and_then(|b| b.0.get("workspacePath").and_then(|v| v.as_str()))
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/drain-outbox",
                None,
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_compact(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let res = state
        .writer
        .execute_write(move || {
            call_vault_rpc(
                "POST",
                "/api/memory/compact",
                Some(&body),
                ws_override.as_deref(),
            )
        })
        .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_open(Json(body): Json<serde_json::Value>) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    match call_vault_rpc(
        "POST",
        "/api/memory/open",
        Some(&body),
        ws_override.as_deref(),
    ) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_context(Json(body): Json<serde_json::Value>) -> Response {
    let ws_override = body
        .get("workspacePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    match call_vault_rpc(
        "POST",
        "/api/memory/context",
        Some(&body),
        ws_override.as_deref(),
    ) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

// Memory Read Handlers (Direct call)

async fn handle_memory_list(Query(query): Query<MemoryScopeQuery>) -> Response {
    let scope = query.scope.unwrap_or_else(|| "project".to_string());
    let mut endpoint = format!("/api/memory/list?scope={}", scope);
    if let Some(t) = query.r#type {
        endpoint.push_str(&format!("&type={}", t));
    }
    match call_vault_rpc("GET", &endpoint, None, query.workspace_path.as_deref()) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_get(Query(query): Query<MemoryScopeQuery>) -> Response {
    let scope = query.scope.unwrap_or_else(|| "project".to_string());
    let id = query.id.unwrap_or_default();
    let endpoint = format!("/api/memory/get?scope={}&id={}", scope, id);
    match call_vault_rpc("GET", &endpoint, None, query.workspace_path.as_deref()) {
        Ok(val) => {
            let success = val.get("success").and_then(|v| v.as_bool()).unwrap_or(true);
            if success {
                Json(val).into_response()
            } else {
                (StatusCode::NOT_FOUND, Json(val)).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_search(Query(query): Query<MemoryScopeQuery>) -> Response {
    let q = query.q.unwrap_or_default();
    let scope = query.scope.unwrap_or_else(|| "all".to_string());
    let limit = query.limit.unwrap_or(20);
    let endpoint = format!("/api/memory/search?q={}&scope={}&limit={}", q, scope, limit);
    match call_vault_rpc("GET", &endpoint, None, query.workspace_path.as_deref()) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_doctor(Query(query): Query<MemoryScopeQuery>) -> Response {
    let scope = query.scope.unwrap_or_else(|| "all".to_string());
    let endpoint = format!("/api/memory/doctor?scope={}", scope);
    match call_vault_rpc("GET", &endpoint, None, query.workspace_path.as_deref()) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

async fn handle_memory_moc(
    Query(query): Query<MemoryScopeQuery>,
    body: Option<Json<serde_json::Value>>,
) -> Response {
    let scope = query.scope.unwrap_or_else(|| "project".to_string());
    let endpoint = format!("/api/memory/moc?scope={}", scope);
    let b = body.as_ref().map(|b| &b.0);
    match call_vault_rpc("GET", &endpoint, b, query.workspace_path.as_deref()) {
        Ok(val) => Json(val).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        )
            .into_response(),
    }
}

// -------------------------------------------------------------
// Environment Setup & Helpers
// -------------------------------------------------------------

fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    let _ = fs::write(path, content);
}

pub fn upsert_managed_block(path: &Path, block_content: &str) {
    let begin_marker = "<!-- CGLI:BEGIN v2 -->";
    let end_marker = "<!-- CGLI:END -->";
    let wrapped = format!("{}\n{}\n{}", begin_marker, block_content.trim(), end_marker);

    if let Ok(existing) = fs::read_to_string(path) {
        if let (Some(start_idx), Some(end_idx)) = (existing.find(begin_marker), existing.find(end_marker)) {
            if end_idx >= start_idx {
                let after = &existing[end_idx + end_marker.len()..];
                let new_content = format!("{}{}{}", &existing[..start_idx], wrapped, after);
                write_if_changed(path, &new_content);
                return;
            }
        }
        let combined = format!("{}\n\n{}", existing.trim_end(), wrapped);
        write_if_changed(path, &combined);
    } else {
        write_if_changed(path, &wrapped);
    }
}

pub fn ensure_cgli_environment(workspace_path: &Path, port: u16) {
    let cgli_dir = workspace_path.join(".cgli");
    let bin_dir = cgli_dir.join("bin");
    let artifacts_dir = cgli_dir.join("artifacts");
    let gemini_dir = workspace_path.join(".gemini");

    let _ = fs::create_dir_all(&bin_dir);
    let _ = fs::create_dir_all(&artifacts_dir);
    let _ = fs::create_dir_all(&gemini_dir);
    let _ = cgli_vault::ensure_vault_structure("project", Some(workspace_path));
    let _ = cgli_vault::ensure_vault_structure("global", Some(workspace_path));

    // Copy compiled native cgli binary if available in target/release or target/debug
    for profile in ["release", "debug"] {
        let candidate_unix = workspace_path.join("target").join(profile).join("cgli");
        if candidate_unix.is_file() {
            let dest = bin_dir.join("cgli-bin");
            let _ = fs::copy(&candidate_unix, &dest);
            break;
        }
        let candidate_win = workspace_path.join("target").join(profile).join("cgli.exe");
        if candidate_win.is_file() {
            let dest = bin_dir.join("cgli.exe");
            let _ = fs::copy(&candidate_win, &dest);
            break;
        }
    }

    // Create cgli.cmd wrapper for Windows (invoking native Rust cgli binary)
    let cgli_cmd_path = bin_dir.join("cgli.cmd");
    let cgli_cmd_content = format!(
        "@echo off\r\nif not defined CGLI_BRIDGE_PORT set CGLI_BRIDGE_PORT={port}\r\nif exist \"%~dp0\\cgli.exe\" (\r\n  \"%~dp0\\cgli.exe\" %*\r\n) else (\r\n  cargo run --quiet --manifest-path \"%~dp0\\..\\..\\Cargo.toml\" --bin cgli -- %*\r\n)\r\n"
    );
    write_if_changed(&cgli_cmd_path, &cgli_cmd_content);

    // Create cgli sh wrapper for Unix (invoking native Rust cgli binary)
    let cgli_sh_path = bin_dir.join("cgli");
    let cgli_sh_content = format!(
        "#!/usr/bin/env sh\nexport CGLI_BRIDGE_PORT=\"${{CGLI_BRIDGE_PORT:-{port}}}\"\nDIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nif [ -x \"$DIR/cgli-bin\" ]; then\n  exec \"$DIR/cgli-bin\" \"$@\"\nelse\n  exec cargo run --quiet --manifest-path \"$DIR/../../Cargo.toml\" --bin cgli -- \"$@\"\nfi\n"
    );
    write_if_changed(&cgli_sh_path, &cgli_sh_content);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&cgli_sh_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&cgli_sh_path, perms);
        }
    }

    // Create .cgli/CGLI_GUIDE.md
    let guide_path = cgli_dir.join("CGLI_GUIDE.md");
    let guide_content = r##"# CGLI (Canvas Agent Orchestrator) — Regras de Execução

Você está executando dentro do ambiente interativo **CGLI** no desktop Tauri.
O canvas do CGLI só exibe planos, especificações, diffs e subagentes que você registrar com o comando `cgli`.

## 📌 REGRA MANDATÓRIA PARA O PAPEL DE PLANEJADOR (PLANNER)
Sempre que concluir um plano de arquitetura, plano de implementação, especificação ou documento técnico:
1. Salve o plano em arquivo markdown na pasta de artefatos: `.cgli/artifacts/<nome-do-plano>.md`
2. Registre-o e publique-o imediatamente no canvas executando no terminal:
   `cgli create-artifact --title "Título do Plano" --file .cgli/artifacts/<nome-do-plano>.md`
   (ou envie diretamente via stdin: `cat plano.md | cgli create-artifact --title "Título do Plano" --stdin`)
3. Após criar o nó no canvas, responda ao usuário no terminal com um breve resumo de 2 a 3 linhas citando o título do plano criado.

## 🛠️ Comandos Disponíveis do Canvas

- **Criar Nó de Artefato (Plano / Especificação / Documento):**
  `cgli create-artifact --title "Título" --file caminho/documento.md`

- **Invocar Subagente Conectado no Canvas:**
  `cgli spawn-subagent --type claude --role planner --task "Descrição da tarefa"`
  `cgli spawn-subagent --type agy --role executor --task "Executar build e testes"`

- **Criar Nó de Diff (Alterações de Código):**
  `cgli create-diff --title "Alterações em Auth" --file "src/auth.ts"`

- **Criar Nó de Preview Web (HTML / Sandbox Iframe):**
  `cgli create-preview --title "Dashboard Preview" --file index.html`

- **Listar Pastas do Workspace:**
  `cgli list-folders`

## 🧠 Memória Compartilhada no Obsidian (Vaults Local e Global)

O CGLI possui memória persistente integrada ao Obsidian dividida em dois níveis:
1. **Vault Local do Projeto (`.cgli/vault/`):** decisões de arquitetura (ADRs), especificações, tarefas e journal de sessões deste repositório.
2. **Vault Global do Usuário (`~/.cgli/vault/`):** aprendizados gerais, preferências do desenvolvedor e convenções universais.

### Comandos de Memória:
- **Registrar observação no journal diário (append-only):**
  `cgli memory write [--scope project|global] --text "Texto da observação" [--tags tag1,tag2]`
- **Registrar decisão (ADR) ou aprendizado formal:**
  `cgli memory note [--scope project|global] --type decision --title "Título" [--content "..." | --file doc.md]`
  `cgli memory note --scope global --type learning --title "Convenção" --content "Conteúdo"`
- **Listar notas de memória salvas:**
  `cgli memory list [--scope project|global] [--type decision]`
- **Consultar conteúdo de uma nota:**
  `cgli memory get <id_ou_nome>`
- **Abrir o Vault no aplicativo Obsidian:**
  `cgli memory open [--scope project|global]`
"##;
    write_if_changed(&guide_path, guide_content);

    // Upsert managed CGLI block across all model instructions files
    upsert_managed_block(&workspace_path.join("CLAUDE.md"), guide_content);
    upsert_managed_block(&workspace_path.join("GEMINI.md"), guide_content);
    upsert_managed_block(&workspace_path.join(".gemini").join("GEMINI.md"), guide_content);
    upsert_managed_block(&workspace_path.join("AGENTS.md"), guide_content);
    upsert_managed_block(&workspace_path.join("AGY.md"), guide_content);

    ensure_frontend_assets(workspace_path);
}

pub fn ensure_frontend_assets(workspace_path: &Path) {
    let dist_dir = workspace_path.join("dist");
    let _ = fs::create_dir_all(dist_dir.join("pkg"));

    // 1. Collect all Rust UI source files for encre-css scanning
    let mut sources = Vec::new();
    for dir in [
        workspace_path.join("crates").join("cgli-ui").join("src"),
        workspace_path.join("crates").join("cgli-pty-vt").join("src"),
    ] {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) == Some("rs") {
                    if let Ok(content) = fs::read_to_string(&p) {
                        sources.push(content);
                    }
                }
            }
        }
    }

    if !sources.is_empty() {
        let mut config = encre_css::Config::default();
        config.theme.dark_mode = encre_css::config::DarkMode::new_class(".dark");
        let source_refs: Vec<&str> = sources.iter().map(|s| s.as_str()).collect();
        let generated_tailwind = encre_css::generate(source_refs.into_iter(), &config);

        let custom_css = fs::read_to_string(workspace_path.join("styles").join("index.css"))
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.trim_start().starts_with("@import") && !l.trim_start().starts_with("@custom-variant"))
            .collect::<Vec<_>>()
            .join("\n");

        let full_css = format!("{}\n\n/* --- CGLI Custom Variables & Base Styles --- */\n{}", generated_tailwind, custom_css);
        write_if_changed(&dist_dir.join("styles.css"), &full_css);
    }

    let index_html = r#"<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CGLI — Canvas Agent Orchestrator (100% Rust)</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <script type="module">
      import init from '/pkg/cgli-ui-app.js';
      init();
    </script>
  </body>
</html>
"#;
    write_if_changed(&dist_dir.join("index.html"), index_html);
}


pub async fn start_bridge_server(
    state: AppState,
    preferred_port: u16,
) -> Result<(u16, tokio::task::JoinHandle<()>), Box<dyn std::error::Error + Send + Sync>> {
    let router = create_router(state);

    let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", preferred_port)).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind("127.0.0.1:0").await?,
    };

    let local_addr = listener.local_addr()?;
    let port = local_addr.port();
    BRIDGE_PORT.store(port, Ordering::SeqCst);
    log::info!("CGLI Axum Bridge running on http://127.0.0.1:{}", port);

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            log::error!("Axum server error: {}", e);
        }
    });

    Ok((port, handle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;
    use axum::http::Request;

    #[tokio::test]
    async fn test_axum_router_status() {
        let (action_tx, _) = broadcast::channel(16);
        let pty = SessionManager::new(action_tx.clone());
        let writer = VaultWriterQueue::new();
        let state = AppState {
            pty,
            writer,
            bridge_action_tx: action_tx,
            workspace_info: Arc::new(tokio::sync::RwLock::new(None)),
        };

        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/status")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_axum_bridge_actions() {
        let (action_tx, mut action_rx) = broadcast::channel(16);
        let pty = SessionManager::new(action_tx.clone());
        let writer = VaultWriterQueue::new();
        let state = AppState {
            pty,
            writer,
            bridge_action_tx: action_tx,
            workspace_info: Arc::new(tokio::sync::RwLock::new(None)),
        };

        let app = create_router(state);

        let payload = serde_json::json!({
            "title": "Novo Plano",
            "content": "# Plano de Teste"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/create-artifact")
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        // Verify action broadcasted
        let received = action_rx.recv().await.unwrap();
        assert_eq!(received.action_type, "create_artifact");
        assert_eq!(received.title.as_deref(), Some("Novo Plano"));
    }

    #[tokio::test]
    async fn test_axum_workspace_save_load() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_axum_ws_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let ws_str = temp_dir.to_string_lossy().to_string();

        let (action_tx, _) = broadcast::channel(16);
        let pty = SessionManager::new(action_tx.clone());
        let writer = VaultWriterQueue::new();
        let state = AppState {
            pty,
            writer,
            bridge_action_tx: action_tx,
            workspace_info: Arc::new(tokio::sync::RwLock::new(None)),
        };

        let app = create_router(state.clone());

        // Save
        let save_payload = serde_json::json!({
            "projectPath": ws_str,
            "data": { "nodes": [], "edges": [] }
        });

        let save_resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/workspace/save")
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(save_payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_resp.status(), StatusCode::OK);

        // Load
        let app2 = create_router(state);
        let load_resp = app2
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/workspace/load?projectPath={}", ws_str))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(load_resp.status(), StatusCode::OK);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

