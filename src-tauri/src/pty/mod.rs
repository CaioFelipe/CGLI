pub mod session;

#[allow(unused_imports)]
pub use session::{PtySession, SessionManager};

use tauri::{AppHandle, State};

#[tauri::command]
pub async fn spawn_pty(
    app: AppHandle,
    state: State<'_, SessionManager>,
    session_id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<String, String> {
    state.spawn(&app, session_id, command, args, cwd)
}

#[tauri::command]
pub fn write_pty(
    state: State<'_, SessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.write(&session_id, &data)
}

#[tauri::command]
pub fn resize_pty(
    state: State<'_, SessionManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn kill_pty(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    state.kill(&session_id)
}
