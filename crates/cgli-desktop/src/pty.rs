use cgli_core::types::BridgeAction;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
#[cfg(windows)]
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

pub struct PtySession {
    pub id: String,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Box<dyn Child + Send + Sync>,
    pub output_tx: broadcast::Sender<String>,
    pub buffer: Arc<Mutex<Vec<String>>>,
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    bridge_action_tx: broadcast::Sender<BridgeAction>,
}

/// Lowercased command name without a trailing executable extension ("Claude.CMD" -> "claude").
#[cfg(windows)]
fn command_stem(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    for ext in [".exe", ".cmd", ".bat", ".com"] {
        if let Some(stem) = lower.strip_suffix(ext) {
            return stem.to_string();
        }
    }
    lower
}

/// Known install locations of the native executables of AI CLIs, in order of preference.
#[cfg(windows)]
fn known_native_candidates(stem: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    match stem {
        "claude" | "claude-code" => {
            if let Ok(appdata) = std::env::var("APPDATA") {
                candidates.push(
                    Path::new(&appdata)
                        .join("npm")
                        .join("node_modules")
                        .join("@anthropic-ai")
                        .join("claude-code")
                        .join("bin")
                        .join("claude.exe"),
                );
            }
            if let Ok(profile) = std::env::var("USERPROFILE") {
                candidates.push(Path::new(&profile).join(".local").join("bin").join("claude.exe"));
            }
        }
        "agy" => {
            if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
                candidates.push(Path::new(&localappdata).join("agy").join("bin").join("agy.exe"));
            }
        }
        _ => {}
    }
    candidates
}

/// Decodes as much of `pending` as forms complete UTF-8, leaving an incomplete trailing
/// sequence in the buffer for the next read. Invalid bytes become U+FFFD.
pub fn drain_utf8(pending: &mut Vec<u8>) -> String {
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(s) => {
                out.push_str(s);
                pending.clear();
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(&String::from_utf8_lossy(&pending[..valid]));
                match e.error_len() {
                    Some(bad) => {
                        out.push('\u{FFFD}');
                        pending.drain(..valid + bad);
                    }
                    None => {
                        pending.drain(..valid);
                        break;
                    }
                }
            }
        }
    }
    out
}

pub fn resolve_command(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        if cfg!(windows) {
            return "powershell.exe".to_string();
        } else {
            return "sh".to_string();
        }
    }

    let path = Path::new(trimmed);
    if path.is_absolute() || trimmed.contains('/') || trimmed.contains('\\') {
        return trimmed.to_string();
    }

    #[cfg(windows)]
    {
        let stem = command_stem(trimmed);
        if let Some(native) = known_native_candidates(&stem).into_iter().find(|p| p.is_file()) {
            return native.to_string_lossy().to_string();
        }

        if let Ok(path_var) = std::env::var("PATH") {
            let dirs: Vec<PathBuf> = std::env::split_paths(&path_var).collect();

            if trimmed.contains('.') {
                for dir in &dirs {
                    let direct = dir.join(trimmed);
                    if direct.is_file() {
                        return direct.to_string_lossy().to_string();
                    }
                }
            }

            for extensions in [&[".exe", ".com"][..], &[".cmd", ".bat"][..]] {
                for dir in &dirs {
                    for ext in extensions {
                        let with_ext = dir.join(format!("{}{}", trimmed, ext));
                        if with_ext.is_file() {
                            return with_ext.to_string_lossy().to_string();
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join(trimmed);
                if candidate.is_file() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }

    trimmed.to_string()
}

impl SessionManager {
    pub fn new(bridge_action_tx: broadcast::Sender<BridgeAction>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            bridge_action_tx,
        }
    }

    pub fn spawn(
        &self,
        session_id: String,
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
        env: Option<HashMap<String, String>>,
        bridge_port: u16,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY pair: {}", e))?;

        let resolved_cmd = resolve_command(&command);
        log::info!("PTY session '{}': '{}' resolved to '{}'", session_id, command, resolved_cmd);

        #[cfg(windows)]
        let (exec_cmd, final_args) = {
            let lower = resolved_cmd.to_lowercase();
            if lower.ends_with(".cmd") || lower.ends_with(".bat") {
                let mut a = vec!["/c".to_string(), resolved_cmd.clone()];
                a.extend(args);
                ("cmd.exe".to_string(), a)
            } else {
                (resolved_cmd, args)
            }
        };

        #[cfg(not(windows))]
        let (exec_cmd, final_args) = (resolved_cmd, args);

        let mut cmd = CommandBuilder::new(&exec_cmd);
        for arg in final_args {
            cmd.arg(arg);
        }

        if let Some(ref dir) = cwd {
            let trimmed_dir = dir.trim();
            if !trimmed_dir.is_empty() {
                let p = Path::new(trimmed_dir);
                if !p.exists() {
                    let _ = std::fs::create_dir_all(p);
                }
                cmd.cwd(p);

                // Setup .cgli scripts and environment in workspace
                crate::bridge::ensure_cgli_environment(p, bridge_port);

                // Add .cgli/bin to PATH for the child process
                let bin_dir = p.join(".cgli").join("bin");
                if let Ok(current_path) = std::env::var("PATH") {
                    #[cfg(windows)]
                    {
                        let new_path = format!("{};{}", bin_dir.display(), current_path);
                        cmd.env("PATH", &new_path);
                        cmd.env("Path", &new_path);
                    }
                    #[cfg(not(windows))]
                    {
                        let new_path = format!("{}:{}", bin_dir.display(), current_path);
                        cmd.env("PATH", new_path);
                    }
                }

                cmd.env("CGLI_WORKSPACE_PATH", p.display().to_string());
                cmd.env("CGLI_NODE_ID", session_id.replace("pty-", ""));
            }
        }

        if bridge_port > 0 {
            cmd.env("CGLI_BRIDGE_PORT", bridge_port.to_string());
        }

        if let Some(env_vars) = env {
            for (k, v) in env_vars {
                cmd.env(k, v);
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command '{}': {}", exec_cmd, e))?;

        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to obtain PTY writer: {}", e))?;

        let (output_tx, _) = broadcast::channel::<String>(512);
        let buffer = Arc::new(Mutex::new(Vec::new()));

        let session = PtySession {
            id: session_id.clone(),
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            child,
            output_tx: output_tx.clone(),
            buffer: buffer.clone(),
        };

        {
            let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            if let Some(mut old) = sessions.remove(&session_id) {
                let _ = old.child.kill();
            }
            sessions.insert(session_id.clone(), session);
        }

        // Spawn background reader thread
        let session_id_clone = session_id.clone();
        let action_tx_clone = self.bridge_action_tx.clone();
        let output_tx_clone = output_tx.clone();
        let buffer_clone = buffer.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending: Vec<u8> = Vec::new();
            let mut marker_stream_buf = String::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        log::info!("PTY session '{}' output stream reached EOF", session_id_clone);
                        if !pending.is_empty() {
                            let rest = String::from_utf8_lossy(&pending).to_string();
                            if let Ok(mut b) = buffer_clone.lock() {
                                b.push(rest.clone());
                                if b.len() > 200 {
                                    b.remove(0);
                                }
                            }
                            let _ = output_tx_clone.send(rest);
                        }
                        // Emit special sentinel or exit
                        let _ = output_tx_clone.send("__CGLI_EXIT__".to_string());
                        break;
                    }
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        let data = drain_utf8(&mut pending);
                        if data.is_empty() {
                            continue;
                        }

                        // Maintain buffer of last 200 chunks
                        if let Ok(mut b) = buffer_clone.lock() {
                            b.push(data.clone());
                            if b.len() > 200 {
                                b.remove(0);
                            }
                        }

                        // Broadcast to SSE / subscribers
                        let _ = output_tx_clone.send(data.clone());

                        // Stream marker detection with buffer for multi-chunk split markers
                        marker_stream_buf.push_str(&data);
                        while let Some(start) = marker_stream_buf.find("<<<CGLI:") {
                            if let Some(end) = marker_stream_buf[start..].find(">>>") {
                                let marker_content = &marker_stream_buf[start + 8..start + end];
                                let mut parts = marker_content.trim().splitn(2, |c: char| c.is_whitespace());
                                let action_name = parts.next().unwrap_or("").to_lowercase();
                                let json_str = parts.next().unwrap_or("{}");

                                if let Ok(mut action) = serde_json::from_str::<BridgeAction>(json_str) {
                                    action.action_type = action_name;
                                    if action.parent_node_id.is_none() {
                                        action.parent_node_id = Some(session_id_clone.replace("pty-", ""));
                                    }
                                    let _ = action_tx_clone.send(action);
                                }
                                marker_stream_buf.drain(..start + end + 3);
                            } else {
                                // Incomplete marker, wait for next chunk, but trim older text
                                if start > 0 {
                                    marker_stream_buf.drain(..start);
                                }
                                break;
                            }
                        }

                        if marker_stream_buf.len() > 16384 {
                            marker_stream_buf.clear();
                        }
                    }
                    Err(err) => {
                        log::debug!("PTY session '{}' reader ended: {}", session_id_clone, err);
                        let _ = output_tx_clone.send("__CGLI_EXIT__".to_string());
                        break;
                    }
                }
            }
        });

        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut attempts = 0;
        let writer = loop {
            {
                let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
                if let Some(session) = sessions.get(session_id) {
                    break session.writer.clone();
                }
            }
            attempts += 1;
            if attempts > 25 {
                return Err(format!("PTY session '{}' not found after retry", session_id));
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        };

        let mut writer_guard = writer.lock().map_err(|e| e.to_string())?;
        writer_guard
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer_guard
            .flush()
            .map_err(|e| format!("Failed to flush PTY writer: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("PTY session '{}' not found", session_id))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        Ok(())
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut session) = sessions.remove(session_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }

    pub fn subscribe_output(&self, session_id: &str) -> Result<broadcast::Receiver<String>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("PTY session '{}' not found", session_id))?;
        Ok(session.output_tx.subscribe())
    }

    pub fn get_buffer(&self, session_id: &str) -> Result<Vec<String>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("PTY session '{}' not found", session_id))?;
        let buf = session.buffer.lock().map_err(|e| e.to_string())?;
        Ok(buf.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_command_empty() {
        let cmd = resolve_command("");
        #[cfg(windows)]
        assert_eq!(cmd, "powershell.exe");
        #[cfg(not(windows))]
        assert_eq!(cmd, "sh");
    }

    #[test]
    fn test_drain_utf8() {
        let mut pending = vec![b'h', b'e', b'l', b'l', b'o'];
        assert_eq!(drain_utf8(&mut pending), "hello");
        assert!(pending.is_empty());
    }

    #[test]
    fn test_session_manager_new() {
        let (tx, _) = broadcast::channel(16);
        let mgr = SessionManager::new(tx);
        assert!(mgr.kill("non_existent").is_ok());
        assert!(mgr.write("non_existent", "test").is_err());
        assert!(mgr.resize("non_existent", 80, 24).is_err());
        assert!(mgr.get_buffer("non_existent").is_err());
        assert!(mgr.subscribe_output("non_existent").is_err());
    }

    #[test]
    fn test_pty_spawn_and_write() {
        let (tx, _) = broadcast::channel(16);
        let mgr = SessionManager::new(tx);
        #[cfg(not(windows))]
        let cmd = "echo".to_string();
        #[cfg(windows)]
        let cmd = "cmd.exe".to_string();

        let res = mgr.spawn("test_sess".to_string(), cmd, vec!["hello".to_string()], None, None, 0);
        assert!(res.is_ok());
        std::thread::sleep(std::time::Duration::from_millis(200));
        let buf = mgr.get_buffer("test_sess").unwrap();
        assert!(!buf.is_empty());
        let _ = mgr.kill("test_sess");
    }
}
