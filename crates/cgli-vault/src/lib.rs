pub mod atomic;
pub mod frontmatter;
pub mod id;
pub mod idem;
pub mod ops;
pub mod paths;
pub mod security;

// Re-exports
pub use atomic::atomic_write_file;
pub use frontmatter::{parse_frontmatter, Frontmatter, ParsedDoc};
pub use id::generate_id;
pub use ops::*;
pub use paths::{
    ensure_vault_structure, get_global_vault_path, get_local_vault_path, get_vault_path, slugify,
};
pub use security::{calculate_etag, scan_and_sanitize_secrets, SecretScanResult};

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_vault_flow() {
        let temp_dir = std::env::temp_dir().join(format!("cgli_vault_test_{}", generate_id()));
        fs::create_dir_all(&temp_dir).unwrap();

        // 1. Ensure vault structure
        let vault_path = ensure_vault_structure("project", Some(&temp_dir)).unwrap();
        assert!(vault_path.join("README.md").exists());
        assert!(vault_path.join("40-decisions").exists());

        // 2. Write observation
        let obs = write_observation(WriteObservationParams {
            scope: "project",
            workspace_path: Some(&temp_dir),
            agent_id: "agent-test",
            agent_type: "claude",
            content: "Found an interesting pattern in Rust",
            kind: "finding",
            tags: vec!["rust".into(), "test".into()],
            refs: vec![],
            source: Some("src/main.rs"),
            confidence: 0.9,
            idem_key: None,
        })
        .unwrap();
        assert!(obs.get("success").unwrap().as_bool().unwrap());
        let obs_id = obs.get("id").unwrap().as_str().unwrap();
        assert_eq!(obs_id.len(), 26);

        // 3. Create note
        let note = create_note(CreateNoteParams {
            scope: "project",
            workspace_path: Some(&temp_dir),
            note_type: "decision",
            title: "Uso de Rust Puro",
            content: "Decidimos refatorar para Rust 100% nativo.",
            author: "claude",
            tags: vec!["rust".into(), "refactor".into()],
            links: std::collections::HashMap::new(),
            node_id: None,
            confidence: 0.95,
            idem_key: None,
        })
        .unwrap();
        let note_id = note.get("id").unwrap().as_str().unwrap();
        assert_eq!(note_id.len(), 26);
        let note_etag = note.get("etag").unwrap().as_str().unwrap();

        // 4. Update note success
        let update_res = update_note(UpdateNoteParams {
            id: note_id,
            expect_rev: Some(1),
            expect_etag: Some(note_etag),
            content: "Decidimos refatorar para Rust 100% nativo com alta performance.",
            file: None,
            author: "claude",
            scope: "project",
            workspace_path: Some(&temp_dir),
            idem_key: None,
        })
        .unwrap();
        assert_eq!(update_res.get("rev").unwrap().as_u64().unwrap(), 2);

        // 5. Update note conflict (rev mismatch)
        let conflict_res = update_note(UpdateNoteParams {
            id: note_id,
            expect_rev: Some(1), // actual is 2!
            expect_etag: Some(note_etag),
            content: "Outra tentativa concorrente.",
            file: None,
            author: "agy",
            scope: "project",
            workspace_path: Some(&temp_dir),
            idem_key: None,
        })
        .unwrap();
        assert_eq!(conflict_res.get("conflict").unwrap().as_bool().unwrap(), true);
        assert_eq!(conflict_res.get("statusCode").unwrap().as_u64().unwrap(), 409);

        // 6. Search notes
        let search_hits = search_notes("Rust", "project", None, Some(&temp_dir), 10).unwrap();
        assert!(!search_hits.is_empty());
        assert_eq!(search_hits[0].id, note_id);

        // 7. Map of Content (MOC)
        let moc_res = generate_moc("project", Some(&temp_dir)).unwrap();
        assert!(moc_res.get("success").unwrap().as_bool().unwrap());
        assert!(moc_res.get("content").unwrap().as_str().unwrap().contains("Uso de Rust Puro"));

        // 8. Doctor
        let doctor_res = run_doctor("project", Some(&temp_dir)).unwrap();
        assert!(doctor_res.get("stats").is_some());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
