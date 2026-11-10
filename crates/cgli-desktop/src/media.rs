use std::fs;
use std::path::Path;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    // Strip data URL scheme prefix if present (e.g. "data:image/png;base64,....")
    let raw = match input.find(',') {
        Some(idx) => &input[idx + 1..],
        None => input,
    };

    let clean: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    
    BASE64_STANDARD
        .decode(clean.as_bytes())
        .map_err(|e| format!("Invalid base64 data: {}", e))
}

pub fn save_attachment(
    project_path: &str,
    filename: &str,
    base64_data: &str,
) -> Result<String, String> {
    let attachments_dir = Path::new(project_path).join(".cgli").join("attachments");
    if !attachments_dir.exists() {
        fs::create_dir_all(&attachments_dir)
            .map_err(|e| format!("Failed to create attachments directory '{}': {}", attachments_dir.display(), e))?;
    }

    // Sanitize filename or generate a default one
    let safe_filename = if filename.trim().is_empty() {
        format!(
            "attachment_{}.png",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        )
    } else {
        Path::new(filename)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "attachment.png".to_string())
    };

    let decoded_bytes = decode_base64(base64_data)?;
    let target_path = attachments_dir.join(&safe_filename);

    fs::write(&target_path, &decoded_bytes)
        .map_err(|e| format!("Failed to write attachment to '{}': {}", target_path.display(), e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_base64_simple() {
        let input = "SGVsbG8gV29ybGQ="; // "Hello World"
        let decoded = decode_base64(input).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "Hello World");
    }

    #[test]
    fn test_decode_base64_with_data_url() {
        let input = "data:image/png;base64,SGVsbG8="; // "Hello"
        let decoded = decode_base64(input).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "Hello");
    }

    #[test]
    fn test_decode_base64_invalid() {
        let input = "SGVsbG8!@#";
        assert!(decode_base64(input).is_err());
    }

    #[test]
    fn test_save_attachment() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_media_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let project_path = temp_dir.to_string_lossy().to_string();

        let res = save_attachment(&project_path, "test.png", "SGVsbG8gV29ybGQ=");
        assert!(res.is_ok());
        let saved_path = res.unwrap();
        assert!(Path::new(&saved_path).exists());
        let content = fs::read_to_string(&saved_path).unwrap();
        assert_eq!(content, "Hello World");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
