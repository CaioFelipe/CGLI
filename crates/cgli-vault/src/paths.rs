use std::fs;
use std::path::{Path, PathBuf};

pub fn slugify(text: &str) -> String {
    let text = if text.is_empty() { "nota" } else { text };
    let mut slug = String::with_capacity(text.len());
    let mut prev_dash = false;

    for c in text.chars() {
        let lower = c.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            slug.push(lower);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-');
    let mut result = trimmed.to_string();
    if result.is_empty() {
        result = "nota".to_string();
    }
    if result.len() > 45 {
        result.truncate(45);
        result = result.trim_end_matches('-').to_string();
    }
    result
}

pub fn get_global_vault_path() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    home.join(".cgli").join("vault")
}

pub fn get_local_vault_path(workspace_path: Option<&Path>) -> PathBuf {
    let root = match workspace_path {
        Some(p) => p.to_path_buf(),
        None => std::env::var("CGLI_WORKSPACE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
            }),
    };
    root.join(".cgli").join("vault")
}

pub fn get_vault_path(scope: &str, workspace_path: Option<&Path>) -> PathBuf {
    if scope == "global" {
        get_global_vault_path()
    } else {
        get_local_vault_path(workspace_path)
    }
}

pub fn ensure_vault_structure(
    scope: &str,
    workspace_path: Option<&Path>,
) -> Result<PathBuf, String> {
    let vault_path = get_vault_path(scope, workspace_path);
    let is_global = scope == "global";

    let common_folders = ["00-meta", ".tmp", "90-journal"];
    let local_folders = [
        "00-inbox",
        "10-sessions",
        "20-agents",
        "30-artifacts",
        "40-decisions",
        "50-knowledge",
        "60-tasks",
        "70-entities",
    ];
    let global_folders = ["20-agents", "30-preferences", "50-learnings"];

    let target_folders: Vec<&str> = if is_global {
        common_folders.iter().chain(global_folders.iter()).copied().collect()
    } else {
        common_folders.iter().chain(local_folders.iter()).copied().collect()
    };

    for folder in target_folders {
        let dir = vault_path.join(folder);
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| format!("Falha ao criar diretório {:?}: {}", dir, e))?;
        }
    }

    // Criação do README do Vault caso não exista
    let readme_path = vault_path.join("README.md");
    if !readme_path.exists() {
        let title = if is_global {
            "# CGLI Global Vault (Memória Global do Usuário)"
        } else {
            "# CGLI Project Vault (Memória do Projeto)"
        };

        let description = if is_global {
            "Este Vault armazena aprendizados transversais dos agentes, preferências arquiteturais do desenvolvedor e convenções reutilizáveis entre múltiplos projetos."
        } else {
            "Este Vault armazena decisões arquiteturais (ADRs), especificações, entidades mapeadas, tarefas e o journal de execução dos agentes deste projeto."
        };

        let readme_content = format!(
            "{}\n\n{}\n\n> Gerenciado automaticamente pelo **CGLI Canvas Orchestrator**.\n",
            title, description
        );
        fs::write(&readme_path, readme_content)
            .map_err(|e| format!("Falha ao criar README {:?}: {}", readme_path, e))?;
    }

    Ok(vault_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Nova Decisão Importante!"), "nova-decis-o-importante");
        assert_eq!(slugify("   test---slug   "), "test-slug");
        assert_eq!(slugify(""), "nota");
    }
}
