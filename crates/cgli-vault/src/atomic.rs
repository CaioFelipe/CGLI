use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::id::generate_id;
use crate::security::scan_and_sanitize_secrets;

/// Gravação atômica em disco: sanitiza segredos, escreve em .tmp/<ulid>.part,
/// executa sync_all() físico e renomeia atomicamente com retry/backoff exponencial.
pub fn atomic_write_file(target_path: &Path, content: &str) -> Result<(), String> {
    // Choke point global: valida e sanitiza todo o documento antes de tocar em disco
    let scan = scan_and_sanitize_secrets(content, false)?;
    let safe_content = scan.text;

    let dir = target_path
        .parent()
        .ok_or_else(|| format!("Caminho de destino inválido: {:?}", target_path))?;

    // Determina pasta .tmp do cofre
    let path_str = target_path.to_string_lossy();
    let tmp_dir = if let Some(idx) = path_str.find(".cgli") {
        let vault_dir = &path_str[..idx + 11.min(path_str.len() - idx)]; // aponta para .cgli/vault
        Path::new(vault_dir).join(".tmp")
    } else {
        dir.join(".tmp")
    };

    if !tmp_dir.exists() {
        let _ = fs::create_dir_all(&tmp_dir);
    }

    let tmp_file = tmp_dir.join(format!("{}.part", generate_id()));

    // Escrita com sync_all físico antes do rename para durabilidade real
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp_file)
            .map_err(|e| format!("Falha ao abrir arquivo temporário {:?}: {}", tmp_file, e))?;

        file.write_all(safe_content.as_bytes())
            .map_err(|e| format!("Falha ao escrever em {:?}: {}", tmp_file, e))?;

        file.sync_all()
            .map_err(|e| format!("Falha no sync_all em {:?}: {}", tmp_file, e))?;
    }

    // Troca atômica via rename com backoff exponencial e jitter para contornar travas do Windows / FS
    let mut last_err = None;
    for attempt in 1..=5 {
        match fs::rename(&tmp_file, target_path) {
            Ok(()) => return Ok(()),
            Err(err) => {
                last_err = Some(err);
                let wait_ms = 20 * (1 << (attempt - 1)) + (rand::random::<u64>() % 15);
                thread::sleep(Duration::from_millis(wait_ms));
            }
        }
    }

    let _ = fs::remove_file(&tmp_file);
    Err(format!(
        "Falha ao renomear arquivo temporário para {:?}: {:?}",
        target_path, last_err
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_write() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_test_{}", generate_id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let target = temp_dir.join("sub").join("test.txt");
        fs::create_dir_all(target.parent().unwrap()).unwrap();

        atomic_write_file(&target, "hello atomic world").unwrap();
        let read = fs::read_to_string(&target).unwrap();
        assert_eq!(read, "hello atomic world");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_atomic_write_redacts_secret() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_test_{}", generate_id()));
        fs::create_dir_all(&temp_dir).unwrap();
        let target = temp_dir.join("secret.txt");
        atomic_write_file(&target, "api key: AKIA1234567890ABCDEF").unwrap();
        let read = fs::read_to_string(&target).unwrap();
        assert!(read.contains("[REDACTED_SECRET]"));
        assert!(!read.contains("AKIA"));
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
