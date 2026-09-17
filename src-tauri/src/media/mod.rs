use std::fs;
use std::path::Path;

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    // Strip data URL scheme prefix if present (e.g. "data:image/png;base64,....")
    let raw = match input.find(',') {
        Some(idx) => &input[idx + 1..],
        None => input,
    };

    let clean: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = clean.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0;

    for &b in bytes {
        if b == b'=' {
            break;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62, // Standard and URL-safe
            b'/' | b'_' => 63,
            _ => return Err(format!("Invalid base64 character: '{}'", b as char)),
        } as u32;

        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }

    Ok(out)
}

#[tauri::command]
pub fn save_attachment(
    project_path: String,
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    let attachments_dir = Path::new(&project_path).join(".cgli").join("attachments");
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
        Path::new(&filename)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "attachment.png".to_string())
    };

    let decoded_bytes = decode_base64(&base64_data)?;
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
}
