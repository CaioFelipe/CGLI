use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecretScanResult {
    pub text: String,
    pub redacted_count: usize,
    pub has_secrets: bool,
    pub detected: Vec<String>,
}

struct SecretPattern {
    name: &'static str,
    regex: Regex,
}

static PATTERNS: OnceLock<Vec<SecretPattern>> = OnceLock::new();

fn get_secret_patterns() -> &'static [SecretPattern] {
    PATTERNS.get_or_init(|| {
        vec![
            SecretPattern {
                name: "Anthropic API Key",
                regex: Regex::new(r"sk-ant-[a-zA-Z0-9_\-]{20,}").unwrap(),
            },
            SecretPattern {
                name: "OpenAI API Key",
                regex: Regex::new(r"sk-(?:proj-|live-|test-)?[a-zA-Z0-9]{20,}").unwrap(),
            },
            SecretPattern {
                name: "Google AI / Gemini Key",
                regex: Regex::new(r"AIzaSy[a-zA-Z0-9_\-]{33}").unwrap(),
            },
            SecretPattern {
                name: "GitHub Token",
                regex: Regex::new(r"(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}").unwrap(),
            },
            SecretPattern {
                name: "AWS Access Key",
                regex: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
            },
            SecretPattern {
                name: "JWT Token",
                regex: Regex::new(r"eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+").unwrap(),
            },
            SecretPattern {
                name: "Private Key",
                regex: Regex::new(r"(?s)-----BEGIN (?:[A-Z0-9 ]+)?PRIVATE KEY-----.*?-----END (?:[A-Z0-9 ]+)?PRIVATE KEY-----").unwrap(),
            },
            SecretPattern {
                name: "Database URI with Password",
                regex: Regex::new(r"(?:postgres|postgresql|mysql|mongodb|redis)://[^\s:]+:[^\s@]+@[^\s/]+").unwrap(),
            },
        ]
    })
}

/// Calcula etag determinístico baseado no hash SHA-256 dos primeiros 16 caracteres hex do corpo markdown (trimmed)
pub fn calculate_etag(body_text: &str) -> String {
    let clean_body = body_text.trim();
    let mut hasher = Sha256::new();
    hasher.update(clean_body.as_bytes());
    let hash = hasher.finalize();
    let hex_str = format!("{:x}", hash);
    hex_str[..16.min(hex_str.len())].to_string()
}

/// Varre e sanitiza potenciais segredos ou credenciais em textos antes de persistir
pub fn scan_and_sanitize_secrets(text: &str, strict: bool) -> Result<SecretScanResult, String> {
    if text.is_empty() {
        return Ok(SecretScanResult {
            text: String::new(),
            redacted_count: 0,
            has_secrets: false,
            detected: Vec::new(),
        });
    }

    let mut sanitized = text.to_string();
    let mut redacted_count = 0;
    let mut detected = Vec::new();

    for pattern in get_secret_patterns() {
        let matches: Vec<_> = pattern.regex.find_iter(&sanitized).collect();
        if !matches.is_empty() {
            if strict {
                return Err(format!(
                    "[SECURITY ALERT] Tentativa de persistência de segredo bloqueada: padrão '{}' detectado.",
                    pattern.name
                ));
            }
            detected.push(pattern.name.to_string());
            redacted_count += matches.len();
            sanitized = pattern.regex.replace_all(&sanitized, "[REDACTED_SECRET]").to_string();
        }
    }

    Ok(SecretScanResult {
        text: sanitized,
        redacted_count,
        has_secrets: redacted_count > 0,
        detected,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_etag() {
        let etag1 = calculate_etag("hello world\n");
        let etag2 = calculate_etag("  hello world  ");
        assert_eq!(etag1, etag2);
        assert_eq!(etag1.len(), 16);
    }

    #[test]
    fn test_scan_and_sanitize_secrets() {
        let text = "My token is ghp_123456789012345678901234567890123456 and sk-ant-api03-abcdefghijklmnop-1234567890";
        let res = scan_and_sanitize_secrets(text, false).unwrap();
        assert!(res.has_secrets);
        assert_eq!(res.redacted_count, 2);
        assert!(!res.text.contains("ghp_"));
        assert!(!res.text.contains("sk-ant-"));
        assert!(res.text.contains("[REDACTED_SECRET]"));

        let strict_res = scan_and_sanitize_secrets(text, true);
        assert!(strict_res.is_err());
    }
}
