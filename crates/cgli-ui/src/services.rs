//! Async network & IPC services for CGLI (PTY, Bridge Actions, Memory Vault, Attachments).
//! Supports both Tauri v2 IPC and Web / Browser HTTP/SSE mode.

use cgli_core::{BridgeAction, NoteItem, SpawnPtyRequest, WorkspaceFolder};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{EventSource, Headers, MessageEvent, Request, RequestInit, Response, Window};

pub const DEFAULT_BRIDGE_PORT: u16 = 41732;

pub fn is_tauri() -> bool {
    if let Some(win) = web_sys::window() {
        let tauri_internals = js_sys::Reflect::get(&win, &JsValue::from_str("__TAURI_INTERNALS__"))
            .unwrap_or(JsValue::UNDEFINED);
        let tauri = js_sys::Reflect::get(&win, &JsValue::from_str("__TAURI__"))
            .unwrap_or(JsValue::UNDEFINED);
        return !tauri_internals.is_undefined() || !tauri.is_undefined();
    }
    false
}

pub fn get_bridge_base() -> String {
    if let Some(win) = web_sys::window() {
        let location = win.location();
        if let Ok(host) = location.host() {
            if host.starts_with("localhost:") || host.starts_with("127.0.0.1:") {
                // When running via Trunk dev server on :1420, bridge is on :41732
                if !host.contains(&DEFAULT_BRIDGE_PORT.to_string()) {
                    return format!("http://127.0.0.1:{}", DEFAULT_BRIDGE_PORT);
                }
            }
        }
    }
    // Default to bridge host
    format!("http://127.0.0.1:{}", DEFAULT_BRIDGE_PORT)
}

pub async fn http_post_json<T: serde::Serialize, R: serde::de::DeserializeOwned>(
    path: &str,
    payload: &T,
) -> Result<R, String> {
    let win: Window = web_sys::window().ok_or("No global window found")?;
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!("{}{}", get_bridge_base(), path)
    };

    let body_str = serde_json::to_string(payload).map_err(|e| e.to_string())?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_body(&JsValue::from_str(&body_str));

    let headers = Headers::new().map_err(|e| format!("{:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("{:?}", e))?;
    opts.set_headers(&headers);

    let request = Request::new_with_str_and_init(&url, &opts).map_err(|e| format!("{:?}", e))?;

    let resp_val = JsFuture::from(win.fetch_with_request(&request))
        .await
        .map_err(|e| format!("{:?}", e))?;
    let resp: Response = resp_val.dyn_into().map_err(|e| format!("{:?}", e))?;

    if !resp.ok() {
        return Err(format!("HTTP error {}: {}", resp.status(), resp.status_text()));
    }

    let text_val = JsFuture::from(resp.text().map_err(|e| format!("{:?}", e))?)
        .await
        .map_err(|e| format!("{:?}", e))?;
    let text: String = text_val.as_string().unwrap_or_default();

    serde_json::from_str::<R>(&text).map_err(|e| format!("Failed to parse JSON response: {}", e))
}

pub async fn http_get_json<R: serde::de::DeserializeOwned>(path: &str) -> Result<R, String> {
    let win: Window = web_sys::window().ok_or("No global window found")?;
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!("{}{}", get_bridge_base(), path)
    };

    let opts = RequestInit::new();
    opts.set_method("GET");

    let headers = Headers::new().map_err(|e| format!("{:?}", e))?;
    headers
        .set("Accept", "application/json")
        .map_err(|e| format!("{:?}", e))?;
    opts.set_headers(&headers);

    let request = Request::new_with_str_and_init(&url, &opts).map_err(|e| format!("{:?}", e))?;

    let resp_val = JsFuture::from(win.fetch_with_request(&request))
        .await
        .map_err(|e| format!("{:?}", e))?;
    let resp: Response = resp_val.dyn_into().map_err(|e| format!("{:?}", e))?;

    if !resp.ok() {
        return Err(format!("HTTP error {}: {}", resp.status(), resp.status_text()));
    }

    let text_val = JsFuture::from(resp.text().map_err(|e| format!("{:?}", e))?)
        .await
        .map_err(|e| format!("{:?}", e))?;
    let text: String = text_val.as_string().unwrap_or_default();

    serde_json::from_str::<R>(&text).map_err(|e| format!("Failed to parse JSON response: {}", e))
}

pub async fn pty_spawn(
    session_id: &str,
    command: &str,
    args: &[String],
    cwd: Option<&str>,
    env: Option<&HashMap<String, String>>,
) -> Result<String, String> {
    let payload = SpawnPtyRequest {
        session_id: session_id.to_string(),
        command: command.to_string(),
        args: args.to_vec(),
        cwd: cwd.map(|s| s.to_string()),
        env: env.cloned(),
    };

    let resp: serde_json::Value = http_post_json("/api/pty/spawn", &payload).await?;
    if let Some(err) = resp.get("error").and_then(|e| e.as_str()) {
        return Err(err.to_string());
    }
    Ok(session_id.to_string())
}

pub async fn pty_write(session_id: &str, data: &str) -> Result<(), String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "data": data,
    });
    let _: serde_json::Value = http_post_json("/api/pty/write", &payload).await?;
    Ok(())
}

pub async fn pty_resize(session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "cols": cols,
        "rows": rows,
    });
    let _: serde_json::Value = http_post_json("/api/pty/resize", &payload).await?;
    Ok(())
}

pub async fn pty_kill(session_id: &str) -> Result<(), String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
    });
    let _: serde_json::Value = http_post_json("/api/pty/kill", &payload).await?;
    Ok(())
}

pub fn subscribe_pty_stream<F, E>(
    session_id: &str,
    on_output: F,
    on_exit: E,
) -> Result<EventSource, String>
where
    F: Fn(String) + 'static,
    E: Fn() + 'static,
{
    let url = format!(
        "{}/api/pty/stream?sessionId={}",
        get_bridge_base(),
        js_sys::encode_uri_component(session_id)
    );
    let es = EventSource::new(&url).map_err(|e| format!("{:?}", e))?;

    // onmessage handler
    let on_msg_cb = Closure::<dyn FnMut(MessageEvent)>::new(move |e: MessageEvent| {
        if let Some(txt) = e.data().as_string() {
            if let Ok(val) = serde_json::from_str::<String>(&txt) {
                on_output(val);
            } else {
                on_output(txt);
            }
        }
    });
    es.set_onmessage(Some(on_msg_cb.as_ref().unchecked_ref()));
    on_msg_cb.forget();

    // exit event handler
    let on_exit_cb = Closure::<dyn FnMut(MessageEvent)>::new(move |_e: MessageEvent| {
        on_exit();
    });
    let _ = es.add_event_listener_with_callback("exit", on_exit_cb.as_ref().unchecked_ref());
    on_exit_cb.forget();

    Ok(es)
}

pub fn subscribe_bridge_events<F>(on_action: F) -> Result<EventSource, String>
where
    F: Fn(BridgeAction) + 'static,
{
    let url = format!("{}/api/bridge/events", get_bridge_base());
    let es = EventSource::new(&url).map_err(|e| format!("{:?}", e))?;

    let on_msg_cb = Closure::<dyn FnMut(MessageEvent)>::new(move |e: MessageEvent| {
        if let Some(txt) = e.data().as_string() {
            if let Ok(action) = serde_json::from_str::<BridgeAction>(&txt) {
                on_action(action);
            }
        }
    });
    es.set_onmessage(Some(on_msg_cb.as_ref().unchecked_ref()));
    on_msg_cb.forget();

    Ok(es)
}

pub async fn memory_fetch(
    query: Option<&str>,
    scope: Option<&str>,
    note_type: Option<&str>,
) -> Result<Vec<NoteItem>, String> {
    let mut params = Vec::new();
    if let Some(q) = query {
        if !q.is_empty() {
            params.push(format!("q={}", js_sys::encode_uri_component(q)));
        }
    }
    if let Some(s) = scope {
        if !s.is_empty() && s != "all" {
            params.push(format!("scope={}", js_sys::encode_uri_component(s)));
        }
    }
    if let Some(t) = note_type {
        if !t.is_empty() && t != "all" {
            params.push(format!("type={}", js_sys::encode_uri_component(t)));
        }
    }

    let qs = if params.is_empty() {
        "".to_string()
    } else {
        format!("?{}", params.join("&"))
    };

    let path = if query.is_some() && !query.unwrap().is_empty() {
        format!("/api/memory/search{}", qs)
    } else {
        format!("/api/memory/list{}", qs)
    };

    let resp: serde_json::Value = http_get_json(&path).await?;
    let notes_val = if let Some(items) = resp.get("notes") {
        items.clone()
    } else if let Some(items) = resp.get("items") {
        items.clone()
    } else {
        resp
    };

    serde_json::from_value::<Vec<NoteItem>>(notes_val)
        .map_err(|e| format!("Failed to parse notes: {}", e))
}

pub async fn save_attachment(
    project_path: &str,
    filename: &str,
    base64_data: &str,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "projectPath": project_path,
        "filename": filename,
        "base64Data": base64_data,
    });
    let resp: serde_json::Value = http_post_json("/api/media/attachment", &payload).await?;
    let path = resp
        .get("path")
        .and_then(|p| p.as_str())
        .or_else(|| resp.get("filePath").and_then(|p| p.as_str()))
        .unwrap_or_default()
        .to_string();
    Ok(path)
}

pub async fn sync_workspace_info(
    project_name: &str,
    active_folder_id: Option<&str>,
    folders: &[WorkspaceFolder],
) -> Result<(), String> {
    let payload = serde_json::json!({
        "projectName": project_name,
        "activeFolderId": active_folder_id,
        "folders": folders,
    });
    let _: serde_json::Value = http_post_json("/api/update-workspace-info", &payload).await?;
    Ok(())
}
