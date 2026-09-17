use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
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
        if let Ok(path_var) = std::env::var("PATH") {
            let pathext = std::env::var("PATHEXT")
                .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD;.ps1".to_string());
            let extensions: Vec<&str> = pathext.split(';').collect();

            for dir in std::env::split_paths(&path_var) {
                let direct = dir.join(trimmed);
                if direct.is_file() {
                    return direct.to_string_lossy().to_string();
                }
                for ext in &extensions {
                    let ext_clean = ext.trim();
                    let with_ext = if !ext_clean.starts_with('.') {
                        dir.join(format!("{}.{}", trimmed, ext_clean))
                    } else {
                        dir.join(format!("{}{}", trimmed, ext_clean))
                    };
                    if with_ext.is_file() {
                        return with_ext.to_string_lossy().to_string();
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
            sessions.insert(session_id.clone(), session);
        }

        // Spawn background thread to stream PTY output
        let session_id_clone = session_id.clone();
        let app_handle_clone = app_handle.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let event_name = format!("pty-output-{}", session_id_clone);
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        log::info!("PTY session '{}' output stream reached EOF", session_id_clone);
                        let _ = app_handle_clone.emit(&format!("pty-exit-{}", session_id_clone), ());
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
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
        let writer = {
            let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| format!("PTY session '{}' not found", session_id))?;
            session.writer.clone()
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
            Ok(())
        } else {
            Err(format!("PTY session '{}' not found", session_id))
        }
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
    fn test_session_manager_new() {
        let mgr = SessionManager::new();
        assert!(mgr.kill("non_existent").is_err());
        assert!(mgr.write("non_existent", "test").is_err());
        assert!(mgr.resize("non_existent", 80, 24).is_err());
    }
}
