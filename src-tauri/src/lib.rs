mod media;
mod pty;
mod workspace;

use pty::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SessionManager::new())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            // PTY commands
            pty::spawn_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            // Workspace & Skills commands
            workspace::save_workspace,
            workspace::load_workspace,
            workspace::get_skills,
            workspace::save_skill,
            // Media commands
            media::save_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
