use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub fn check_idem_key(vault_path: &Path, idem_key: &str) -> Option<Value> {
    if idem_key.is_empty() {
        return None;
    }
    let ledger_path = vault_path.join("00-meta").join(".idem-ledger.ndjson");
    if !ledger_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&ledger_path).ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    const ONE_DAY_MS: u64 = 24 * 60 * 60 * 1000;

    for line in content.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<Value>(trimmed) {
            if entry.get("key").and_then(|v| v.as_str()) == Some(idem_key) {
                if let Some(ts) = entry.get("ts").and_then(|v| v.as_u64()) {
                    if now.saturating_sub(ts) < ONE_DAY_MS {
                        return entry.get("response").cloned();
                    }
                }
                break;
            }
        }
    }
    None
}

pub fn record_idem_key(vault_path: &Path, idem_key: &str, response_data: &Value) {
    if idem_key.is_empty() {
        return;
    }
    let meta_dir = vault_path.join("00-meta");
    let _ = fs::create_dir_all(&meta_dir);
    let ledger_path = meta_dir.join(".idem-ledger.ndjson");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let entry = serde_json::json!({
        "key": idem_key,
        "ts": now,
        "response": response_data,
    });

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ledger_path)
    {
        let mut line = serde_json::to_string(&entry).unwrap_or_default();
        line.push('\n');
        let _ = file.write_all(line.as_bytes());
    }
}
