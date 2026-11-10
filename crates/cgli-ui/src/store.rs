use cgli_core::*;
use leptos::*;
use std::collections::HashMap;

pub const DEFAULT_PROJECT_ID: &str = "proj-default";
pub const DEFAULT_PROJECT_NAME: &str = "CGLI Workspace";
pub const STORAGE_KEY_PROJECTS: &str = "cgli_projects_v2";
pub const STORAGE_KEY_CURRENT_PROJECT: &str = "cgli_current_project_id";
pub const STORAGE_KEY_STASH: &str = "cgli_stash_items";
pub const STORAGE_KEY_CLIS: &str = "cgli_clis";
pub const STORAGE_KEY_SKILLS: &str = "cgli_skills";
pub const STORAGE_KEY_THEME: &str = "cgli_theme";

#[derive(Clone, Copy)]
pub struct CanvasStore {
    pub theme: RwSignal<ThemeMode>,
    pub nodes: RwSignal<Vec<CanvasNode>>,
    pub edges: RwSignal<Vec<CanvasEdge>>,
    pub viewport: RwSignal<ViewportTransform>,
    pub projects: RwSignal<Vec<ProjectInfo>>,
    pub current_project_id: RwSignal<String>,
    pub stash_items: RwSignal<Vec<StashItem>>,
    pub is_stash_open: RwSignal<bool>,
    pub is_settings_open: RwSignal<bool>,
    pub is_new_project_open: RwSignal<bool>,
    pub is_manage_workspace_open: RwSignal<bool>,
    pub is_memory_explorer_open: RwSignal<bool>,
    pub annotating_node_id: RwSignal<Option<String>>,
    pub clis: RwSignal<Vec<CliConfig>>,
    pub skills: RwSignal<Vec<SkillItem>>,
    pub group_drag_over: RwSignal<Option<String>>,
}

pub fn use_canvas_store() -> CanvasStore {
    use_context::<CanvasStore>().expect("CanvasStore must be provided in context")
}

impl CanvasStore {
    pub fn new() -> Self {
        let (projects, current_proj_id) = Self::load_initial_projects();
        let (nodes, edges) = Self::load_initial_canvas(&current_proj_id);
        let stash_items = Self::load_initial_stash();
        let clis = Self::load_initial_clis();
        let skills = Self::load_initial_skills();
        let theme = Self::load_initial_theme();

        Self {
            theme: create_rw_signal(theme),
            nodes: create_rw_signal(nodes),
            edges: create_rw_signal(edges),
            viewport: create_rw_signal(ViewportTransform::default()),
            projects: create_rw_signal(projects),
            current_project_id: create_rw_signal(current_proj_id),
            stash_items: create_rw_signal(stash_items),
            is_stash_open: create_rw_signal(false),
            is_settings_open: create_rw_signal(false),
            is_new_project_open: create_rw_signal(false),
            is_manage_workspace_open: create_rw_signal(false),
            is_memory_explorer_open: create_rw_signal(false),
            annotating_node_id: create_rw_signal(None),
            clis: create_rw_signal(clis),
            skills: create_rw_signal(skills),
            group_drag_over: create_rw_signal(None),
        }
    }

    // --- Persistence & Initial Loaders ---

    fn get_storage() -> Option<web_sys::Storage> {
        web_sys::window()?.local_storage().ok()?
    }

    fn load_initial_theme() -> ThemeMode {
        if let Some(storage) = Self::get_storage() {
            if let Ok(Some(saved)) = storage.get_item(STORAGE_KEY_THEME) {
                if saved == "light" {
                    return ThemeMode::Light;
                }
            }
        }
        ThemeMode::Dark
    }

    fn load_initial_projects() -> (Vec<ProjectInfo>, String) {
        if let Some(storage) = Self::get_storage() {
            if let Ok(Some(saved)) = storage.get_item(STORAGE_KEY_PROJECTS) {
                if let Ok(projs) = serde_json::from_str::<Vec<ProjectInfo>>(&saved) {
                    if !projs.is_empty() {
                        let active_id = storage
                            .get_item(STORAGE_KEY_CURRENT_PROJECT)
                            .ok()
                            .flatten()
                            .unwrap_or_else(|| projs[0].id.clone());
                        let final_id = if projs.iter().any(|p| p.id == active_id) {
                            active_id
                        } else {
                            projs[0].id.clone()
                        };
                        return (projs, final_id);
                    }
                }
            }
        }

        let default_proj = ProjectInfo {
            id: DEFAULT_PROJECT_ID.into(),
            name: DEFAULT_PROJECT_NAME.into(),
            path: "/home/antigravity/CaioFelipe/CGLI".into(),
            folders: vec![WorkspaceFolder {
                id: "f-default-1".into(),
                name: "CGLI".into(),
                path: "/home/antigravity/CaioFelipe/CGLI".into(),
                is_primary: Some(true),
            }],
            active_folder_id: Some("f-default-1".into()),
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            recent_projects: Some(vec![RecentProjectRef {
                name: "CGLI".into(),
                path: "/home/antigravity/CaioFelipe/CGLI".into(),
            }]),
        };
        (vec![default_proj], DEFAULT_PROJECT_ID.into())
    }

    fn load_initial_canvas(project_id: &str) -> (Vec<CanvasNode>, Vec<CanvasEdge>) {
        if let Some(storage) = Self::get_storage() {
            let key = format!("cgli_canvas_{}", project_id);
            if let Ok(Some(saved)) = storage.get_item(&key) {
                #[derive(serde::Deserialize)]
                struct CanvasSaved {
                    nodes: Vec<CanvasNode>,
                    edges: Vec<CanvasEdge>,
                }
                if let Ok(parsed) = serde_json::from_str::<CanvasSaved>(&saved) {
                    return (parsed.nodes, parsed.edges);
                }
            }
        }
        (Vec::new(), Vec::new())
    }

    fn load_initial_stash() -> Vec<StashItem> {
        if let Some(storage) = Self::get_storage() {
            if let Ok(Some(saved)) = storage.get_item(STORAGE_KEY_STASH) {
                if let Ok(items) = serde_json::from_str::<Vec<StashItem>>(&saved) {
                    return items;
                }
            }
        }
        Vec::new()
    }

    fn load_initial_clis() -> Vec<CliConfig> {
        if let Some(storage) = Self::get_storage() {
            if let Ok(Some(saved)) = storage.get_item(STORAGE_KEY_CLIS) {
                if let Ok(clis) = serde_json::from_str::<Vec<CliConfig>>(&saved) {
                    if !clis.is_empty() {
                        return clis;
                    }
                }
            }
        }
        vec![
            CliConfig {
                id: "claude-code".into(),
                name: "Claude Code".into(),
                binary: "claude".into(),
                color: "#EA580C".into(),
                active: true,
                role: AgentRole::Planner,
                connected_account: None,
                default_args: "--dangerously-skip-permissions".into(),
            },
            CliConfig {
                id: "agy".into(),
                name: "Antigravity (AGY)".into(),
                binary: "agy".into(),
                color: "#0284C7".into(),
                active: true,
                role: AgentRole::Executor,
                connected_account: None,
                default_args: "--dangerously-skip-permissions".into(),
            },
        ]
    }

    fn load_initial_skills() -> Vec<SkillItem> {
        if let Some(storage) = Self::get_storage() {
            if let Ok(Some(saved)) = storage.get_item(STORAGE_KEY_SKILLS) {
                if let Ok(skills) = serde_json::from_str::<Vec<SkillItem>>(&saved) {
                    if !skills.is_empty() {
                        return skills;
                    }
                }
            }
        }
        vec![
            SkillItem {
                id: "clean-ui-copy".into(),
                name: "Clean UI Copy".into(),
                description: "Enforces natural, production-grade microcopy without prompt leakage or style bleed.".into(),
                enabled: true,
                category: "UI & Design".into(),
                path: "".into(),
                content: "".into(),
            },
            SkillItem {
                id: "cli-orchestrator".into(),
                name: "CLI Orchestrator".into(),
                description: "Hot-swap tokens and coordinate multi-agent tasks with quota guardrails.".into(),
                enabled: true,
                category: "Architecture".into(),
                path: "".into(),
                content: "".into(),
            },
            SkillItem {
                id: "react-flow-helpers".into(),
                name: "Flow Automation".into(),
                description: "Automates node linking, graph validation, and smart auto-layouting.".into(),
                enabled: true,
                category: "Workflow".into(),
                path: "".into(),
                content: "".into(),
            },
            SkillItem {
                id: "test-runner".into(),
                name: "Automated Test Runner".into(),
                description: "Executes unit tests and integration tests in background daemon tasks.".into(),
                enabled: false,
                category: "Testing".into(),
                path: "".into(),
                content: "".into(),
            },
        ]
    }

    pub fn save_canvas_state(&self) {
        if let Some(storage) = Self::get_storage() {
            let curr_id = self.current_project_id.get();
            let key = format!("cgli_canvas_{}", curr_id);
            let state = serde_json::json!({
                "nodes": self.nodes.get(),
                "edges": self.edges.get(),
            });
            let _ = storage.set_item(&key, &state.to_string());
        }
    }

    pub fn save_projects_state(&self) {
        if let Some(storage) = Self::get_storage() {
            let projs = self.projects.get();
            if let Ok(s) = serde_json::to_string(&projs) {
                let _ = storage.set_item(STORAGE_KEY_PROJECTS, &s);
            }
            let _ = storage.set_item(STORAGE_KEY_CURRENT_PROJECT, &self.current_project_id.get());
        }
    }

    pub fn save_stash_state(&self) {
        if let Some(storage) = Self::get_storage() {
            let items = self.stash_items.get();
            if let Ok(s) = serde_json::to_string(&items) {
                let _ = storage.set_item(STORAGE_KEY_STASH, &s);
            }
        }
    }

    pub fn save_clis_state(&self) {
        if let Some(storage) = Self::get_storage() {
            let clis = self.clis.get();
            if let Ok(s) = serde_json::to_string(&clis) {
                let _ = storage.set_item(STORAGE_KEY_CLIS, &s);
            }
        }
    }

    pub fn save_skills_state(&self) {
        if let Some(storage) = Self::get_storage() {
            let skills = self.skills.get();
            if let Ok(s) = serde_json::to_string(&skills) {
                let _ = storage.set_item(STORAGE_KEY_SKILLS, &s);
            }
        }
    }

    // --- Theme & Workspace Info ---

    pub fn toggle_theme(&self) {
        let next = self.theme.get().toggle();
        self.theme.set(next);
        if let Some(storage) = Self::get_storage() {
            let _ = storage.set_item(STORAGE_KEY_THEME, next.as_str());
        }
        if let Some(win) = web_sys::window() {
            if let Some(doc) = win.document() {
                if let Some(html) = doc.document_element() {
                    let _ = html.set_class_name(next.as_str());
                }
            }
        }
    }

    pub fn get_active_workspace_path(&self) -> String {
        let curr_id = self.current_project_id.get();
        let projs = self.projects.get();
        if let Some(p) = projs.into_iter().find(|p| p.id == curr_id) {
            if let Some(act_id) = &p.active_folder_id {
                if let Some(folder) = p.folders.iter().find(|f| &f.id == act_id) {
                    return folder.path.clone();
                }
            }
            if let Some(primary) = p.folders.iter().find(|f| f.is_primary == Some(true)) {
                return primary.path.clone();
            }
            if let Some(first) = p.folders.first() {
                return first.path.clone();
            }
            return p.path;
        }
        "/home/antigravity/CaioFelipe/CGLI".into()
    }

    // --- Nodes & Edges Operations ---

    pub fn add_node(&self, node: CanvasNode) {
        self.nodes.update(|nodes| {
            nodes.push(node);
        });
        self.save_canvas_state();
    }

    pub fn delete_node(&self, id: &str) {
        let node_to_delete = self.nodes.get().into_iter().find(|n| n.id == id);
        if let Some(n) = &node_to_delete {
            if n.node_type == "terminalNode" || n.node_type == "agentNode" {
                let session_id = n
                    .data
                    .get("sessionId")
                    .and_then(|s| s.as_str())
                    .unwrap_or(id);
                let sess_copy = session_id.to_string();
                wasm_bindgen_futures::spawn_local(async move {
                    let _ = crate::services::pty_kill(&sess_copy).await;
                });
            }
        }

        // Set of nodes to delete: includes target node and child diffNodes if parent agent deleted
        let mut to_delete = vec![id.to_string()];
        if let Some(n) = &node_to_delete {
            if n.node_type == "agentNode" {
                for node in self.nodes.get().iter() {
                    if node.node_type == "diffNode" {
                        if let Some(parent) = node.data.get("parentAgentId").and_then(|p| p.as_str()) {
                            if parent == id {
                                to_delete.push(node.id.clone());
                            }
                        }
                    }
                }
            }
        }

        self.nodes.update(|nodes| {
            nodes.retain(|n| !to_delete.contains(&n.id));
            // Remove node from any group members
            for n in nodes.iter_mut() {
                if n.node_type == "groupNode" {
                    if let Ok(mut g_data) = serde_json::from_value::<GroupNodeData>(n.data.clone()) {
                        g_data.node_ids.retain(|m_id| !to_delete.contains(m_id));
                        n.data = serde_json::to_value(g_data).unwrap_or(n.data.clone());
                    }
                }
            }
        });

        self.edges.update(|edges| {
            edges.retain(|e| !to_delete.contains(&e.source) && !to_delete.contains(&e.target));
        });

        self.save_canvas_state();
    }

    pub fn update_node_data(&self, id: &str, data: serde_json::Value) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == id) {
                if let (Some(dest), Some(src)) = (n.data.as_object_mut(), data.as_object()) {
                    for (k, v) in src {
                        dest.insert(k.clone(), v.clone());
                    }
                } else {
                    n.data = data;
                }
            }
        });
        self.save_canvas_state();
    }

    pub fn update_node_position(&self, id: &str, pos: Position2D) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == id) {
                n.position = pos;
            }
        });
        self.save_canvas_state();
    }

    pub fn resize_node(&self, id: &str, width: f64, height: f64) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == id) {
                n.style.width = Some(width);
                n.style.height = Some(height);
            }
        });
        self.save_canvas_state();
    }

    pub fn on_connect(&self, source: &str, target: &str) {
        let nodes = self.nodes.get();
        let source_node = nodes.iter().find(|n| n.id == source);
        let target_node = nodes.iter().find(|n| n.id == target);

        // Diff node cannot be linked to other agents
        if let Some(s) = source_node {
            if s.node_type == "diffNode" {
                return;
            }
        }
        if let Some(t) = target_node {
            if t.node_type == "diffNode" {
                return;
            }
        }

        // Color coding
        let stroke_color = if let Some(s) = source_node {
            if s.node_type == "imageNode" || s.node_type == "imageGroupNode" {
                "#F43F5E"
            } else if s.node_type == "agentNode" {
                let is_claude = s.data.get("agentType").and_then(|t| t.as_str()).unwrap_or("").contains("claude");
                if is_claude { "#EA580C" } else { "#0284C7" }
            } else if s.node_type == "previewNode" {
                "#06B6D4"
            } else if s.node_type == "memoryNode" {
                "#10B981"
            } else {
                "#6366F1"
            }
        } else {
            "#6366F1"
        };

        let edge_id = format!("edge-{}-{}", source, target);
        let new_edge = CanvasEdge {
            id: edge_id,
            source: source.to_string(),
            target: target.to_string(),
            source_handle: None,
            target_handle: None,
            edge_type: Some("removable".into()),
            animated: true,
            selected: false,
        };

        self.edges.update(|edges| {
            if !edges.iter().any(|e| (e.source == source && e.target == target) || (e.source == target && e.target == source)) {
                edges.push(new_edge);
            }
        });

        // Memory to Agent drag-to-attach context
        let is_source_mem = source_node.map(|n| n.node_type == "memoryNode").unwrap_or(false);
        let is_target_mem = target_node.map(|n| n.node_type == "memoryNode").unwrap_or(false);
        let is_source_agent = source_node.map(|n| n.node_type == "agentNode").unwrap_or(false);
        let is_target_agent = target_node.map(|n| n.node_type == "agentNode").unwrap_or(false);

        if (is_source_mem && is_target_agent) || (is_target_mem && is_source_agent) {
            let (mem, agent) = if is_source_mem {
                (source_node.unwrap(), target_node.unwrap())
            } else {
                (target_node.unwrap(), source_node.unwrap())
            };

            let title = mem.data.get("title").and_then(|t| t.as_str()).unwrap_or("Nota de Memória");
            let log_msg = format!("> [CGLI] Memória [[{}]] conectada e fixada no contexto deste agente.", title);

            self.nodes.update(|list| {
                if let Some(ag) = list.iter_mut().find(|n| n.id == agent.id) {
                    if let Ok(mut data) = serde_json::from_value::<AgentNodeData>(ag.data.clone()) {
                        data.terminal_logs.push(log_msg);
                        ag.data = serde_json::to_value(data).unwrap_or(ag.data.clone());
                    }
                }
            });
        }

        self.save_canvas_state();
    }

    pub fn delete_edge(&self, edge_id: &str) {
        self.edges.update(|edges| {
            edges.retain(|e| e.id != edge_id);
        });
        self.save_canvas_state();
    }

    // --- Stash Operations ---

    pub fn toggle_stash_open(&self) {
        self.is_stash_open.update(|v| *v = !*v);
    }

    pub fn stash_node(&self, id: &str) {
        let node_opt = self.nodes.get().into_iter().find(|n| n.id == id);
        let Some(node) = node_opt else { return };

        let item_type = match node.node_type.as_str() {
            "agentNode" => "agent",
            "terminalNode" => "terminal",
            "artifactNode" => "artifact",
            "previewNode" => "preview",
            "diffNode" => "diff",
            "imageNode" => "image",
            "imageGroupNode" => "imageGroup",
            "memoryNode" => "memory",
            "groupNode" => "group",
            _ => "agent",
        };

        let title = node
            .data
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("Item arquivado")
            .to_string();

        let new_item = StashItem {
            id: format!("stash-{}", js_sys::Date::now() as u64),
            node_id: node.id.clone(),
            name: title.clone(),
            item_type: item_type.to_string(),
            saved_at: chrono::Local::now().format("%H:%M").to_string(),
            node_data: node.data.clone(),
            position: node.position,
            style: Some(node.style.clone()),
            preview_snippet: title,
        };

        self.stash_items.update(|items| {
            items.insert(0, new_item);
        });

        self.delete_node(id);
        self.save_stash_state();
    }

    pub fn restore_stash_item(&self, stash_id: &str) {
        let item_opt = self.stash_items.get().into_iter().find(|i| i.id == stash_id);
        let Some(item) = item_opt else { return };

        let new_id = format!("{}-restored-{}", item.node_id, js_sys::Date::now() as u64);
        let node_type = match item.item_type.as_str() {
            "terminal" => "terminalNode",
            "artifact" => "artifactNode",
            "preview" => "previewNode",
            "diff" => "diffNode",
            "image" => "imageNode",
            "imageGroup" => "imageGroupNode",
            "memory" => "memoryNode",
            "group" => "groupNode",
            _ => "agentNode",
        };

        let mut data = item.node_data.clone();
        if node_type == "terminalNode" {
            if let Some(obj) = data.as_object_mut() {
                obj.insert("sessionId".into(), serde_json::Value::String(format!("pty-{}", new_id)));
                obj.insert("isPtyActive".into(), serde_json::Value::Bool(true));
            }
        }

        let restored_node = CanvasNode {
            id: new_id,
            node_type: node_type.into(),
            position: Position2D {
                x: item.position.x + 40.0,
                y: item.position.y + 40.0,
            },
            style: item.style.unwrap_or_default(),
            selected: true,
            data,
        };

        self.nodes.update(|nodes| {
            nodes.push(restored_node);
        });

        self.stash_items.update(|items| {
            items.retain(|i| i.id != stash_id);
        });

        self.save_canvas_state();
        self.save_stash_state();
    }

    pub fn delete_stash_item(&self, stash_id: &str) {
        self.stash_items.update(|items| {
            items.retain(|i| i.id != stash_id);
        });
        self.save_stash_state();
    }

    // --- Artifact Comments & Approval ---

    pub fn add_artifact_comment(
        &self,
        node_id: &str,
        text: &str,
        author: Option<&str>,
        anchor: Option<TextAnchor>,
    ) {
        let new_comment = ArtifactComment {
            id: format!("comment-{}", js_sys::Date::now() as u64),
            author: author.unwrap_or("Usuário").to_string(),
            text: text.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            quote: anchor.as_ref().map(|a| a.quote.clone()),
            quote_start: anchor.as_ref().map(|a| a.start),
            quote_end: anchor.as_ref().map(|a| a.end),
        };

        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                if let Ok(mut data) = serde_json::from_value::<ArtifactNodeData>(n.data.clone()) {
                    let mut comments = data.comments.unwrap_or_default();
                    comments.push(new_comment);
                    data.comments = Some(comments);
                    n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                }
            }
        });
        self.save_canvas_state();
    }

    pub fn delete_artifact_comment(&self, node_id: &str, comment_id: &str) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                if let Ok(mut data) = serde_json::from_value::<ArtifactNodeData>(n.data.clone()) {
                    if let Some(mut comments) = data.comments {
                        comments.retain(|c| c.id != comment_id);
                        data.comments = Some(comments);
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            }
        });
        self.save_canvas_state();
    }

    pub fn approve_artifact(&self, node_id: &str) {
        let nodes = self.nodes.get();
        let art_node = nodes.iter().find(|n| n.id == node_id);
        let Some(art) = art_node else { return };

        let Ok(mut art_data) = serde_json::from_value::<ArtifactNodeData>(art.data.clone()) else { return };
        art_data.status = "approved".into();

        let title = art_data.title.clone();
        let markdown = art_data.markdown_content.clone();
        let comments = art_data.comments.clone().unwrap_or_default();

        // Find connected agent node
        let edges = self.edges.get();
        let target_agent_id = art_data
            .parent_agent_id
            .clone()
            .or_else(|| {
                edges.iter().find_map(|e| {
                    if e.source == node_id {
                        nodes.iter().find(|n| n.id == e.target && n.node_type == "agentNode").map(|n| n.id.clone())
                    } else if e.target == node_id {
                        nodes.iter().find(|n| n.id == e.source && n.node_type == "agentNode").map(|n| n.id.clone())
                    } else {
                        None
                    }
                })
            });

        // Format approval prompt
        let prompt = Self::build_approval_prompt(&title, &markdown, &comments);

        // Update artifact node data
        self.nodes.update(|list| {
            if let Some(n) = list.iter_mut().find(|n| n.id == node_id) {
                n.data = serde_json::to_value(&art_data).unwrap_or(n.data.clone());
            }

            // Update attached artifact badge on agent node
            if let Some(ref ag_id) = target_agent_id {
                if let Some(ag) = list.iter_mut().find(|n| &n.id == ag_id) {
                    if let Ok(mut ag_data) = serde_json::from_value::<AgentNodeData>(ag.data.clone()) {
                        let mut badges = ag_data.attached_artifacts.unwrap_or_default();
                        for b in badges.iter_mut() {
                            if b.source_node_id == node_id {
                                b.status = Some("approved".into());
                                b.approved_markdown = Some(markdown.clone());
                                b.approved_at = Some(chrono::Utc::now().to_rfc3339());
                            }
                        }
                        ag_data.attached_artifacts = Some(badges);
                        ag.data = serde_json::to_value(ag_data).unwrap_or(ag.data.clone());
                    }
                }
            }
        });

        // Write approval prompt into agent's PTY
        if let Some(ag_id) = target_agent_id {
            if let Some(ag_node) = nodes.iter().find(|n| n.id == ag_id) {
                let session_id = ag_node
                    .data
                    .get("sessionId")
                    .and_then(|s| s.as_str())
                    .unwrap_or(&ag_id)
                    .to_string();
                let prompt_payload = format!("{}\r", prompt);
                wasm_bindgen_futures::spawn_local(async move {
                    let _ = crate::services::pty_write(&session_id, &prompt_payload).await;
                });
            }
        }

        self.save_canvas_state();
    }

    fn build_approval_prompt(title: &str, markdown: &str, comments: &[ArtifactComment]) -> String {
        let mut lines = vec![format!(
            "Plano [{}] aprovado pelo usuário. Prossiga com a execução imediata. (Plano e comentários abaixo em uma única linha; '⏎' marca quebra de linha.)",
            title
        )];

        if !markdown.trim().is_empty() {
            lines.push("## Plano aprovado".into());
            lines.push(markdown.trim().into());
        }

        if !comments.is_empty() {
            lines.push(format!("## Comentários e diretrizes do usuário ({})", comments.len()));
            for (i, c) in comments.iter().enumerate() {
                let when = c.created_at.chars().take(16).collect::<String>();
                let about = if let Some(ref q) = c.quote {
                    let short_q = if q.len() > 160 { format!("{}…", &q[..160]) } else { q.clone() };
                    format!(" (sobre o trecho do plano: \"{}\")", short_q)
                } else {
                    "".into()
                };
                lines.push(format!("{}. [{} · {}]{} {}", i + 1, c.author, when, about, c.text));
            }
            lines.push("Considere todos os comentários acima como requisitos obrigatórios ao executar o plano.".into());
        }

        lines
            .join("\n")
            .replace('\n', " ⏎ ")
            .replace('\r', "")
            .trim()
            .to_string()
    }

    // --- Image & Badge Operations ---

    pub fn attach_image_to_agent(&self, node_id: &str, image: AttachedImageBadge) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                if let Ok(mut data) = serde_json::from_value::<AgentNodeData>(n.data.clone()) {
                    if !data.attached_images.iter().any(|i| i.id == image.id || i.url == image.url) {
                        data.attached_images.push(image);
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            }
        });
        self.save_canvas_state();
    }

    pub fn remove_attached_image(&self, node_id: &str, image_id: &str) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                if let Ok(mut data) = serde_json::from_value::<AgentNodeData>(n.data.clone()) {
                    data.attached_images.retain(|i| i.id != image_id);
                    n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                }
            }
        });
        self.save_canvas_state();
    }

    pub fn toggle_agent_diff_node(&self, agent_id: &str) {
        let existing = self.nodes.get().into_iter().find(|n| {
            n.node_type == "diffNode"
                && n.data.get("parentAgentId").and_then(|p| p.as_str()) == Some(agent_id)
        });

        if let Some(diff) = existing {
            self.delete_node(&diff.id);
        } else {
            let agent_opt = self.nodes.get().into_iter().find(|n| n.id == agent_id);
            let Some(agent) = agent_opt else { return };
            let title = agent
                .data
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("Agente");

            let diff_id = format!("diff-{}", js_sys::Date::now() as u64);
            let diff_data = DiffNodeData {
                title: "Diff de Alterações".into(),
                filename: "src/main.rs".into(),
                lines: vec![],
                stats: Some(DiffStats { additions: 0, deletions: 0 }),
                parent_agent_id: agent_id.to_string(),
                parent_agent_title: Some(title.to_string()),
            };

            let diff_node = CanvasNode {
                id: diff_id.clone(),
                node_type: "diffNode".into(),
                position: Position2D {
                    x: agent.position.x + 640.0,
                    y: agent.position.y,
                },
                style: NodeStyle {
                    width: Some(440.0),
                    height: Some(320.0),
                    z_index: None,
                },
                selected: true,
                data: serde_json::to_value(diff_data).unwrap_or_default(),
            };

            let edge = CanvasEdge {
                id: format!("edge-{}-{}", agent_id, diff_id),
                source: agent_id.to_string(),
                target: diff_id,
                source_handle: None,
                target_handle: None,
                edge_type: Some("removable".into()),
                animated: true,
                selected: false,
            };

            self.nodes.update(|nodes| nodes.push(diff_node));
            self.edges.update(|edges| edges.push(edge));
            self.save_canvas_state();
        }
    }

    pub fn save_annotations(&self, node_id: &str, annotations: Vec<AnnotationItem>) {
        self.nodes.update(|nodes| {
            if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                if let Ok(mut data) = serde_json::from_value::<ImageNodeData>(n.data.clone()) {
                    data.annotations = Some(annotations.clone());
                    if let Some(mut imgs) = data.images {
                        let active_idx = data.active_image_index.unwrap_or(0);
                        if active_idx < imgs.len() {
                            imgs[active_idx].annotations = Some(annotations);
                        }
                        data.images = Some(imgs);
                    }
                    n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                }
            }
        });
        self.annotating_node_id.set(None);
        self.save_canvas_state();
    }

    // --- Groups Operations ---

    pub fn set_group_drag_over(&self, group_id: Option<String>) {
        self.group_drag_over.set(group_id.clone());
        self.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                if n.node_type == "groupNode" {
                    let is_target = group_id.as_deref() == Some(&n.id);
                    if let Ok(mut g_data) = serde_json::from_value::<GroupNodeData>(n.data.clone()) {
                        g_data.is_drag_over = Some(is_target);
                        n.data = serde_json::to_value(g_data).unwrap_or(n.data.clone());
                    }
                }
            }
        });
    }

    pub fn add_node_to_group(&self, group_id: &str, node_id: &str) {
        self.nodes.update(|nodes| {
            if let Some(g) = nodes.iter_mut().find(|n| n.id == group_id) {
                if let Ok(mut g_data) = serde_json::from_value::<GroupNodeData>(g.data.clone()) {
                    if !g_data.node_ids.contains(&node_id.to_string()) {
                        g_data.node_ids.push(node_id.to_string());
                        g.data = serde_json::to_value(g_data).unwrap_or(g.data.clone());
                    }
                }
            }
        });
        self.recalculate_group_bounds(group_id);
    }

    pub fn remove_node_from_group(&self, group_id: &str, node_id: &str) {
        self.nodes.update(|nodes| {
            if let Some(g) = nodes.iter_mut().find(|n| n.id == group_id) {
                if let Ok(mut g_data) = serde_json::from_value::<GroupNodeData>(g.data.clone()) {
                    g_data.node_ids.retain(|id| id != node_id);
                    g.data = serde_json::to_value(g_data).unwrap_or(g.data.clone());
                }
            }
        });
        self.recalculate_group_bounds(group_id);
    }

    pub fn group_selected_nodes(&self, node_ids: &[String], title: Option<&str>) {
        if node_ids.is_empty() {
            return;
        }

        let nodes = self.nodes.get();
        let selected: Vec<&CanvasNode> = nodes.iter().filter(|n| node_ids.contains(&n.id)).collect();
        if selected.is_empty() {
            return;
        }

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for n in &selected {
            let w = n.style.width.unwrap_or(400.0);
            let h = n.style.height.unwrap_or(320.0);
            min_x = min_x.min(n.position.x);
            min_y = min_y.min(n.position.y);
            max_x = max_x.max(n.position.x + w);
            max_y = max_y.max(n.position.y + h);
        }

        let pad_x = 36.0;
        let pad_top = 94.0;
        let pad_bottom = 36.0;

        let g_x = min_x - pad_x;
        let g_y = min_y - pad_top;
        let g_w = (max_x - min_x + pad_x * 2.0).max(560.0);
        let g_h = (max_y - min_y + pad_top + pad_bottom).max(420.0);

        let group_id = format!("group-{}", js_sys::Date::now() as u64);
        let g_data = GroupNodeData {
            title: title.unwrap_or("Novo Grupo de Nós").into(),
            node_ids: node_ids.to_vec(),
            width: Some(g_w),
            height: Some(g_h),
            color: Some("#6366F1".into()),
            is_reactive: Some(true),
            is_drag_over: Some(false),
            is_resizing: Some(false),
        };

        let group_node = CanvasNode {
            id: group_id,
            node_type: "groupNode".into(),
            position: Position2D { x: g_x, y: g_y },
            style: NodeStyle {
                width: Some(g_w),
                height: Some(g_h),
                z_index: Some(0),
            },
            selected: true,
            data: serde_json::to_value(g_data).unwrap_or_default(),
        };

        self.nodes.update(|nodes| {
            nodes.insert(0, group_node);
        });
        self.save_canvas_state();
    }

    pub fn recalculate_group_bounds(&self, group_id: &str) {
        let nodes = self.nodes.get();
        let group_opt = nodes.iter().find(|n| n.id == group_id);
        let Some(group) = group_opt else { return };
        let Ok(g_data) = serde_json::from_value::<GroupNodeData>(group.data.clone()) else { return };

        if g_data.is_reactive != Some(true) || g_data.node_ids.is_empty() {
            return;
        }

        let members: Vec<&CanvasNode> = nodes.iter().filter(|n| g_data.node_ids.contains(&n.id)).collect();
        if members.is_empty() {
            return;
        }

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for n in members {
            let w = n.style.width.unwrap_or(400.0);
            let h = n.style.height.unwrap_or(320.0);
            min_x = min_x.min(n.position.x);
            min_y = min_y.min(n.position.y);
            max_x = max_x.max(n.position.x + w);
            max_y = max_y.max(n.position.y + h);
        }

        let pad_x = 36.0;
        let pad_top = 94.0;
        let pad_bottom = 36.0;

        let g_x = min_x - pad_x;
        let g_y = min_y - pad_top;
        let g_w = (max_x - min_x + pad_x * 2.0).max(560.0);
        let g_h = (max_y - min_y + pad_top + pad_bottom).max(420.0);

        self.nodes.update(|list| {
            if let Some(g) = list.iter_mut().find(|n| n.id == group_id) {
                g.position = Position2D { x: g_x, y: g_y };
                g.style.width = Some(g_w);
                g.style.height = Some(g_h);
                if let Ok(mut data) = serde_json::from_value::<GroupNodeData>(g.data.clone()) {
                    data.width = Some(g_w);
                    data.height = Some(g_h);
                    g.data = serde_json::to_value(data).unwrap_or(g.data.clone());
                }
            }
        });
        self.save_canvas_state();
    }

    // --- Memory & Bridge Actions ---

    pub fn spawn_memory_node(&self, note: MemoryNodeData, position: Option<Position2D>) {
        let pos = position.unwrap_or_else(|| {
            let count = self.nodes.get().len() as f64;
            Position2D {
                x: 200.0 + count * 30.0,
                y: 150.0 + count * 20.0,
            }
        });

        let node_id = format!("node-memory-{}", js_sys::Date::now() as u64);
        let mem_node = CanvasNode {
            id: node_id,
            node_type: "memoryNode".into(),
            position: pos,
            style: NodeStyle {
                width: Some(440.0),
                height: Some(380.0),
                z_index: None,
            },
            selected: true,
            data: serde_json::to_value(note).unwrap_or_default(),
        };

        self.add_node(mem_node);
        self.is_memory_explorer_open.set(false);
    }

    pub fn handle_bridge_action(&self, action: BridgeAction) {
        let nodes = self.nodes.get();
        let timestamp = js_sys::Date::now() as u64;

        match action.action_type.as_str() {
            "spawn_subagent" => {
                let parent_id = action.parent_node_id.unwrap_or_default();
                let parent_pos = nodes
                    .iter()
                    .find(|n| n.id == parent_id)
                    .map(|n| n.position)
                    .unwrap_or(Position2D { x: 200.0, y: 150.0 });

                let child_type = action.child_type.unwrap_or_else(|| "agy".into());
                let role = if action.role.as_deref() == Some("planner") {
                    AgentRole::Planner
                } else {
                    AgentRole::Executor
                };

                let child_id = format!("node-{}-sub-{}", child_type, timestamp);
                let (title, binary, color) = if child_type == "claude" {
                    ("Claude Code (Subagente)", "claude", "#EA580C")
                } else {
                    ("Antigravity (Executor)", "agy", "#0284C7")
                };

                let mut messages = Vec::new();
                if let Some(task) = action.task {
                    messages.push(ChatMessage {
                        id: format!("msg-{}", timestamp),
                        sender: "user".into(),
                        text: task,
                        code_blocks: None,
                        timestamp: chrono::Local::now().format("%H:%M").to_string(),
                        images: None,
                        is_streaming: None,
                    });
                }

                let child_data = AgentNodeData {
                    title: title.into(),
                    agent_type: child_type,
                    role,
                    status: AgentStatus::Idle,
                    view_mode: AgentViewMode::Extension,
                    thinking: None,
                    messages,
                    approvals: vec![],
                    attached_images: vec![],
                    attached_artifacts: None,
                    terminal_logs: vec![],
                    session_id: Some(format!("pty-{}", child_id)),
                    cli_session_id: Some(uuid::Uuid::new_v4().to_string()),
                    has_started: Some(false),
                    workspace_path: Some(self.get_active_workspace_path()),
                    is_pty_active: Some(true),
                    cli_id: None,
                    custom_binary: Some(binary.into()),
                    default_args: Some("--dangerously-skip-permissions".into()),
                    initial_task: None,
                    agy_conversation_id: None,
                };

                let child_node = CanvasNode {
                    id: child_id.clone(),
                    node_type: "agentNode".into(),
                    position: Position2D {
                        x: parent_pos.x + 640.0,
                        y: parent_pos.y,
                    },
                    style: NodeStyle {
                        width: Some(600.0),
                        height: Some(520.0),
                        z_index: None,
                    },
                    selected: true,
                    data: serde_json::to_value(child_data).unwrap_or_default(),
                };

                let edge = CanvasEdge {
                    id: format!("edge-{}-{}", parent_id, child_id),
                    source: parent_id,
                    target: child_id,
                    source_handle: None,
                    target_handle: None,
                    edge_type: Some("removable".into()),
                    animated: true,
                    selected: false,
                };

                self.nodes.update(|n| n.push(child_node));
                self.edges.update(|e| e.push(edge));
                self.save_canvas_state();
            }

            "create_artifact" => {
                let parent_id = action.parent_node_id.unwrap_or_default();
                let parent_node = nodes.iter().find(|n| n.id == parent_id);
                let parent_pos = parent_node
                    .map(|n| n.position)
                    .unwrap_or(Position2D { x: 200.0, y: 150.0 });
                let parent_title = parent_node
                    .and_then(|n| n.data.get("title").and_then(|t| t.as_str()))
                    .unwrap_or("Agente")
                    .to_string();

                let art_id = format!("art-{}", timestamp);
                let art_data = ArtifactNodeData {
                    title: action.title.unwrap_or_else(|| "Plano de Execução".into()),
                    markdown_content: action.content.unwrap_or_default(),
                    status: "draft".into(),
                    parent_agent_id: Some(parent_id.clone()),
                    parent_agent_title: Some(parent_title),
                    active_tab: Some("document".into()),
                    comments: Some(vec![]),
                    html_preview: None,
                    diff_content: None,
                };

                let art_node = CanvasNode {
                    id: art_id.clone(),
                    node_type: "artifactNode".into(),
                    position: Position2D {
                        x: parent_pos.x + 640.0,
                        y: parent_pos.y,
                    },
                    style: NodeStyle {
                        width: Some(400.0),
                        height: Some(320.0),
                        z_index: None,
                    },
                    selected: true,
                    data: serde_json::to_value(art_data).unwrap_or_default(),
                };

                let edge = CanvasEdge {
                    id: format!("edge-{}-{}", parent_id, art_id),
                    source: parent_id,
                    target: art_id,
                    source_handle: None,
                    target_handle: None,
                    edge_type: Some("removable".into()),
                    animated: true,
                    selected: false,
                };

                self.nodes.update(|n| n.push(art_node));
                self.edges.update(|e| e.push(edge));
                self.save_canvas_state();
            }

            "create_preview" => {
                let parent_id = action.parent_node_id.unwrap_or_default();
                let parent_pos = nodes
                    .iter()
                    .find(|n| n.id == parent_id)
                    .map(|n| n.position)
                    .unwrap_or(Position2D { x: 200.0, y: 150.0 });

                let prev_id = format!("preview-{}", timestamp);
                let prev_data = PreviewNodeData {
                    title: action.title.unwrap_or_else(|| "Web Preview Sandbox".into()),
                    html_preview: action.html.or(action.content).unwrap_or_default(),
                    status: Some("ready".into()),
                    parent_agent_id: Some(parent_id.clone()),
                    parent_agent_title: None,
                };

                let prev_node = CanvasNode {
                    id: prev_id.clone(),
                    node_type: "previewNode".into(),
                    position: Position2D {
                        x: parent_pos.x + 640.0,
                        y: parent_pos.y,
                    },
                    style: NodeStyle {
                        width: Some(440.0),
                        height: Some(360.0),
                        z_index: None,
                    },
                    selected: true,
                    data: serde_json::to_value(prev_data).unwrap_or_default(),
                };

                let edge = CanvasEdge {
                    id: format!("edge-{}-{}", parent_id, prev_id),
                    source: parent_id,
                    target: prev_id,
                    source_handle: None,
                    target_handle: None,
                    edge_type: Some("removable".into()),
                    animated: true,
                    selected: false,
                };

                self.nodes.update(|n| n.push(prev_node));
                self.edges.update(|e| e.push(edge));
                self.save_canvas_state();
            }

            "create_diff" => {
                let parent_id = action.parent_node_id.unwrap_or_default();
                let parent_pos = nodes
                    .iter()
                    .find(|n| n.id == parent_id)
                    .map(|n| n.position)
                    .unwrap_or(Position2D { x: 200.0, y: 150.0 });

                let diff_id = format!("diff-{}", timestamp);
                let lines: Vec<DiffLine> = action
                    .lines
                    .and_then(|l| serde_json::from_value(l).ok())
                    .unwrap_or_default();

                let diff_data = DiffNodeData {
                    title: action.title.unwrap_or_else(|| "Diff de Alterações".into()),
                    filename: action.filename.unwrap_or_else(|| "src/main.rs".into()),
                    lines,
                    stats: Some(DiffStats { additions: 0, deletions: 0 }),
                    parent_agent_id: parent_id.clone(),
                    parent_agent_title: None,
                };

                let diff_node = CanvasNode {
                    id: diff_id.clone(),
                    node_type: "diffNode".into(),
                    position: Position2D {
                        x: parent_pos.x + 640.0,
                        y: parent_pos.y,
                    },
                    style: NodeStyle {
                        width: Some(440.0),
                        height: Some(320.0),
                        z_index: None,
                    },
                    selected: true,
                    data: serde_json::to_value(diff_data).unwrap_or_default(),
                };

                let edge = CanvasEdge {
                    id: format!("edge-{}-{}", parent_id, diff_id),
                    source: parent_id,
                    target: diff_id,
                    source_handle: None,
                    target_handle: None,
                    edge_type: Some("removable".into()),
                    animated: true,
                    selected: false,
                };

                self.nodes.update(|n| n.push(diff_node));
                self.edges.update(|e| e.push(edge));
                self.save_canvas_state();
            }

            _ => {}
        }
    }

    // --- Projects & Workspaces ---

    pub fn switch_project(&self, project_id: &str) {
        if project_id == self.current_project_id.get() {
            return;
        }

        // Save current canvas state before switching
        self.save_canvas_state();

        let (new_nodes, new_edges) = Self::load_initial_canvas(project_id);
        self.current_project_id.set(project_id.to_string());
        self.nodes.set(new_nodes);
        self.edges.set(new_edges);

        if let Some(storage) = Self::get_storage() {
            let _ = storage.set_item(STORAGE_KEY_CURRENT_PROJECT, project_id);
        }

        // Sync with bridge
        let path = self.get_active_workspace_path();
        let name = self.projects.get().into_iter().find(|p| p.id == project_id).map(|p| p.name).unwrap_or_default();
        let projs = self.projects.get();
        let folders = projs.iter().find(|p| p.id == project_id).map(|p| p.folders.clone()).unwrap_or_default();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = crate::services::sync_workspace_info(&name, None, &folders).await;
        });
    }

    pub fn create_project(&self, name: &str, folders: Vec<WorkspaceFolder>) {
        let new_id = format!("proj-{}", js_sys::Date::now() as u64);
        let path = folders.first().map(|f| f.path.clone()).unwrap_or_default();
        let new_proj = ProjectInfo {
            id: new_id.clone(),
            name: name.to_string(),
            path,
            folders,
            active_folder_id: None,
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            recent_projects: None,
        };

        self.projects.update(|list| list.push(new_proj));
        self.save_projects_state();
        self.switch_project(&new_id);
        self.is_new_project_open.set(false);
    }

    pub fn delete_project(&self, project_id: &str) {
        let projs = self.projects.get();
        if projs.len() <= 1 {
            return;
        }

        self.projects.update(|list| list.retain(|p| p.id != project_id));
        self.save_projects_state();

        if self.current_project_id.get() == project_id {
            if let Some(first) = self.projects.get().first() {
                self.switch_project(&first.id);
            }
        }
    }

    pub fn add_workspace_folder(&self, project_id: &str, folder: WorkspaceFolder) {
        self.projects.update(|list| {
            if let Some(p) = list.iter_mut().find(|p| p.id == project_id) {
                p.folders.push(folder);
            }
        });
        self.save_projects_state();
    }

    pub fn remove_workspace_folder(&self, project_id: &str, folder_id: &str) {
        self.projects.update(|list| {
            if let Some(p) = list.iter_mut().find(|p| p.id == project_id) {
                p.folders.retain(|f| f.id != folder_id);
            }
        });
        self.save_projects_state();
    }

    pub fn set_primary_folder(&self, project_id: &str, folder_id: &str) {
        self.projects.update(|list| {
            if let Some(p) = list.iter_mut().find(|p| p.id == project_id) {
                for f in p.folders.iter_mut() {
                    f.is_primary = Some(f.id == folder_id);
                }
                p.active_folder_id = Some(folder_id.to_string());
            }
        });
        self.save_projects_state();
    }

    // --- CLIs & Skills ---

    pub fn toggle_cli_active(&self, id: &str) {
        self.clis.update(|list| {
            if let Some(c) = list.iter_mut().find(|c| c.id == id) {
                c.active = !c.active;
            }
        });
        self.save_clis_state();
    }

    pub fn update_cli_role(&self, id: &str, role: AgentRole) {
        self.clis.update(|list| {
            if let Some(c) = list.iter_mut().find(|c| c.id == id) {
                c.role = role;
            }
        });
        self.save_clis_state();
    }

    pub fn add_custom_cli(&self, cli: CliConfig) {
        self.clis.update(|list| list.push(cli));
        self.save_clis_state();
    }

    pub fn toggle_skill(&self, id: &str) {
        self.skills.update(|list| {
            if let Some(s) = list.iter_mut().find(|s| s.id == id) {
                s.enabled = !s.enabled;
            }
        });
        self.save_skills_state();
    }

    pub fn add_skill(&self, skill: SkillItem) {
        self.skills.update(|list| list.push(skill));
        self.save_skills_state();
    }
}
