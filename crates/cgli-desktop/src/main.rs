use cgli_desktop::{
    ensure_cgli_environment, start_bridge_server, AppState, SessionManager, VaultWriterQueue,
};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {

    let (bridge_action_tx, _) = broadcast::channel(128);
    let pty = SessionManager::new(bridge_action_tx.clone());
    let writer = VaultWriterQueue::new();
    let workspace_info = Arc::new(RwLock::new(None));

    let state = AppState {
        pty,
        writer,
        bridge_action_tx,
        workspace_info,
    };

    let preferred_port = std::env::var("CGLI_BRIDGE_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(41732);

    let (port, server_handle) = start_bridge_server(state, preferred_port).await?;

    if let Ok(cwd) = std::env::current_dir() {
        ensure_cgli_environment(&cwd, port);
    }

    log::info!("CGLI Desktop server listening on 127.0.0.1:{}", port);

    server_handle.await?;
    Ok(())
}
