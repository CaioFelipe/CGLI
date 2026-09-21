use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
#[cfg(windows)]
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[allow(dead_code)]
pub struct PtySession {
    pub id: String,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Box<dyn Child + Send + Sync>,
}

#[derive(Clone, Default)]
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
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
/// Matching is on the exact command name so unrelated names (e.g. "legacy") never hit a shortcut.
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
/// Reads of the PTY can end in the middle of a multi-byte character (box drawing, spinners),
/// and lossy-decoding each read independently would corrupt those characters.
fn drain_utf8(pending: &mut Vec<u8>) -> String {
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
        // Native PE executables of the known AI CLIs win over their `.cmd` npm shims: running a
        // shim needs `cmd.exe /c`, which adds an extra process between the ConPTY and the CLI.
        let stem = command_stem(trimmed);
        if let Some(native) = known_native_candidates(&stem).into_iter().find(|p| p.is_file()) {
            return native.to_string_lossy().to_string();
        }

        if let Ok(path_var) = std::env::var("PATH") {
            let dirs: Vec<PathBuf> = std::env::split_paths(&path_var).collect();

            // If trimmed already has an extension, check the direct file first
            if trimmed.contains('.') {
                for dir in &dirs {
                    let direct = dir.join(trimmed);
                    if direct.is_file() {
                        return direct.to_string_lossy().to_string();
                    }
                }
            }

            // Real executables anywhere on PATH before batch shims
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
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        app_handle: &AppHandle,
        session_id: String,
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
        env: Option<HashMap<String, String>>,
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
                let port = crate::bridge::get_bridge_port();
                crate::bridge::ensure_cgli_environment(p, port);

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

        let port = crate::bridge::get_bridge_port();
        if port > 0 {
            cmd.env("CGLI_BRIDGE_PORT", port.to_string());
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

        // Drop slave so that master detects EOF when child exits
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to obtain PTY writer: {}", e))?;

        let session = PtySession {
            id: session_id.clone(),
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            child,
        };

        {
            let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            if let Some(mut old) = sessions.remove(&session_id) {
                let _ = old.child.kill();
            }
            sessions.insert(session_id.clone(), session);
        }

        // Spawn background thread to stream PTY output
        let session_id_clone = session_id.clone();
        let app_handle_clone = app_handle.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending: Vec<u8> = Vec::new();
            let event_name = format!("pty-output-{}", session_id_clone);
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        log::info!("PTY session '{}' output stream reached EOF", session_id_clone);
                        if !pending.is_empty() {
                            let rest = String::from_utf8_lossy(&pending).to_string();
                            let _ = app_handle_clone.emit(&event_name, rest);
                        }
                        let _ = app_handle_clone.emit(&format!("pty-exit-{}", session_id_clone), ());
                        break;
                    }
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        let data = drain_utf8(&mut pending);
                        if data.is_empty() {
                            continue;
                        }

                        // Detect stream markers like <<<CGLI:ACTION JSON>>>
                        if data.contains("<<<CGLI:") {
                            if let Some(start) = data.find("<<<CGLI:") {
                                if let Some(end) = data[start..].find(">>>") {
                                    let marker_content = &data[start + 8..start + end];
                                    let mut parts = marker_content.trim().splitn(2, |c: char| c.is_whitespace());
                                    let action_name = parts.next().unwrap_or("").to_lowercase();
                                    let json_str = parts.next().unwrap_or("{}");

                                    if let Ok(mut action) = serde_json::from_str::<crate::bridge::BridgeAction>(json_str) {
                                        action.action_type = action_name;
                                        if action.parent_node_id.is_none() {
                                            action.parent_node_id = Some(session_id_clone.replace("pty-", ""));
                                        }
                                        let _ = app_handle_clone.emit("cgli-bridge-action", &action);
                                    }
                                }
                            }
                        }

                        if let Err(err) = app_handle_clone.emit(&event_name, data) {
                            log::warn!("Failed to emit PTY output for '{}': {}", session_id_clone, err);
                            break;
                        }
                    }
                    Err(err) => {
                        log::debug!("PTY session '{}' reader ended: {}", session_id_clone, err);
                        let _ = app_handle_clone.emit(&format!("pty-exit-{}", session_id_clone), ());
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
    fn test_resolve_command_explicit_path() {
        let path = "C:\\Windows\\System32\\cmd.exe";
        assert_eq!(resolve_command(path), path);
    }

    #[test]
    fn test_drain_utf8_keeps_split_multibyte_char() {
        // "─" is E2 94 80; feed it split across two reads
        let mut pending = vec![b'a', 0xE2, 0x94];
        assert_eq!(drain_utf8(&mut pending), "a");
        assert_eq!(pending, vec![0xE2, 0x94]);

        pending.push(0x80);
        assert_eq!(drain_utf8(&mut pending), "─");
        assert!(pending.is_empty());
    }

    #[test]
    fn test_drain_utf8_replaces_invalid_bytes() {
        let mut pending = vec![b'a', 0xFF, b'b'];
        assert_eq!(drain_utf8(&mut pending), "a\u{FFFD}b");
        assert!(pending.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn test_command_stem_and_shortcuts_match_exact_names_only() {
        assert_eq!(command_stem("Claude.CMD"), "claude");
        assert_eq!(command_stem("agy.exe"), "agy");
        assert!(known_native_candidates("legacy").is_empty());
        assert!(known_native_candidates("my-claude-wrapper").is_empty());
        assert!(!known_native_candidates("claude").is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn test_resolve_command_prefers_native_exe_over_cmd_shim() {
        for name in ["claude", "agy"] {
            let resolved = resolve_command(name).to_lowercase();
            assert!(
                !resolved.ends_with(".cmd") && !resolved.ends_with(".bat"),
                "'{}' resolved to a batch shim: {}",
                name,
                resolved
            );
        }
    }

    #[test]
    fn test_session_manager_new() {
        let mgr = SessionManager::new();
        assert!(mgr.kill("non_existent").is_err());
        assert!(mgr.write("non_existent", "test").is_err());
        assert!(mgr.resize("non_existent", 80, 24).is_err());
    }
}
