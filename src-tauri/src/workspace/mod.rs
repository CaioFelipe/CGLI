use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillItem {
    pub name: String,
    pub path: String,
    pub content: String,
}

pub fn get_cgli_home() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not determine user home directory (neither USERPROFILE nor HOME set)".to_string())?;
    Ok(PathBuf::from(home).join(".cgli"))
}

pub fn get_skills_dir() -> Result<PathBuf, String> {
    let dir = get_cgli_home()?.join("skills");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create skills directory '{}': {}", dir.display(), e))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn save_workspace(project_path: String, data: String) -> Result<(), String> {
    let cgli_dir = Path::new(&project_path).join(".cgli");
    if !cgli_dir.exists() {
        fs::create_dir_all(&cgli_dir)
            .map_err(|e| format!("Failed to create .cgli directory '{}': {}", cgli_dir.display(), e))?;
    }

    let file_path = cgli_dir.join("workspace.json");
    fs::write(&file_path, data)
        .map_err(|e| format!("Failed to write workspace file '{}': {}", file_path.display(), e))?;

    Ok(())
}

#[tauri::command]
pub fn load_workspace(project_path: String) -> Result<Option<String>, String> {
    let file_path = Path::new(&project_path).join(".cgli").join("workspace.json");
    if !file_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workspace file '{}': {}", file_path.display(), e))?;

    Ok(Some(content))
}

#[tauri::command]
pub fn get_skills() -> Result<Vec<SkillItem>, String> {
    let skills_dir = get_skills_dir()?;
    let mut skills = Vec::new();

    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills directory '{}': {}", skills_dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if let Ok(content) = fs::read_to_string(&path) {
                skills.push(SkillItem {
                    name,
                    path: path.to_string_lossy().to_string(),
                    content,
                });
            }
        } else if path.is_dir() {
            let dir_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let candidate_files = ["SKILL.md", "skill.md", "index.md", "skill.json"];
            let mut found = false;

            for candidate in &candidate_files {
                let sub_path = path.join(candidate);
                if sub_path.is_file() {
                    if let Ok(content) = fs::read_to_string(&sub_path) {
                        skills.push(SkillItem {
                            name: dir_name.clone(),
                            path: sub_path.to_string_lossy().to_string(),
                            content,
                        });
                        found = true;
                        break;
                    }
                }
            }

            if !found {
                if let Ok(sub_entries) = fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file()
                            && sub_path.extension().and_then(|s| s.to_str()) == Some("md")
                        {
                            if let Ok(content) = fs::read_to_string(&sub_path) {
                                skills.push(SkillItem {
                                    name: dir_name.clone(),
                                    path: sub_path.to_string_lossy().to_string(),
                                    content,
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(skills)
}

#[tauri::command]
pub fn save_skill(name: String, content: String) -> Result<String, String> {
    let skills_dir = get_skills_dir()?;
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Skill name cannot be empty".to_string());
    }

    // Sanitize name to prevent path traversal
    let safe_name = Path::new(trimmed_name)
        .file_name()
        .ok_or_else(|| "Invalid skill name".to_string())?
        .to_string_lossy();

    let file_name = if safe_name.ends_with(".md") || safe_name.ends_with(".json") {
        safe_name.to_string()
    } else {
        format!("{}.md", safe_name)
    };

    let target_path = skills_dir.join(&file_name);
    fs::write(&target_path, content)
        .map_err(|e| format!("Failed to save skill to '{}': {}", target_path.display(), e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_load_workspace() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let proj_path = temp_dir.to_string_lossy().to_string();

        let initial = load_workspace(proj_path.clone()).unwrap();
        assert_eq!(initial, None);

        let data = r#"{"name": "test-project", "panes": []}"#;
        save_workspace(proj_path.clone(), data.to_string()).unwrap();

        let loaded = load_workspace(proj_path.clone()).unwrap();
        assert_eq!(loaded, Some(data.to_string()));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_skill_empty_name() {
        let result = save_skill("".to_string(), "content".to_string());
        assert!(result.is_err());
    }
}
