use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    Dark,
    Light,
}

impl ThemeMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ThemeMode::Dark => "dark",
            ThemeMode::Light => "light",
        }
    }

    pub fn toggle(&self) -> Self {
        match self {
            ThemeMode::Dark => ThemeMode::Light,
            ThemeMode::Light => ThemeMode::Dark,
        }
    }
}

pub type AgentType = String; // "claude" | "agy" | custom

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    #[default]
    Planner,
    Executor,
}

impl AgentRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentRole::Planner => "planner",
            AgentRole::Executor => "executor",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    #[default]
    Idle,
    Running,
    WaitingApproval,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentViewMode {
    #[default]
    Extension,
    Terminal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodeBlockData {
    pub language: String,
    pub code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub sender: String, // "user" | "agent" | "system"
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_blocks: Option<Vec<CodeBlockData>>,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionApproval {
    pub id: String,
    #[serde(rename = "type")]
    pub approval_type: String, // "command" | "file_change"
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    pub status: String, // "pending" | "approved" | "rejected"
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingStep {
    pub duration: String,
    pub thoughts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_expanded: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttachedImageBadge {
    pub id: String,
    pub url: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TextAnchor {
    pub quote: String,
    pub start: isize,
    pub end: isize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactComment {
    pub id: String,
    pub author: String,
    pub text: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_start: Option<isize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_end: Option<isize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttachedArtifactBadge {
    pub id: String,
    #[serde(rename = "type")]
    pub artifact_type: String, // "artifact" | "preview"
    pub title: String,
    pub source_node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_snippet: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>, // "draft" | "approved" | "rejected"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_markdown: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments: Option<Vec<ArtifactComment>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentNodeData {
    pub title: String,
    pub agent_type: AgentType,
    pub role: AgentRole,
    pub status: AgentStatus,
    pub view_mode: AgentViewMode,
    #[serde(default)]
    pub thinking: Option<ThinkingStep>,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub approvals: Vec<ActionApproval>,
    #[serde(default)]
    pub attached_images: Vec<AttachedImageBadge>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attached_artifacts: Option<Vec<AttachedArtifactBadge>>,
    #[serde(default)]
    pub terminal_logs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cli_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_started: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_pty_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cli_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_binary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_args: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_task: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agy_conversation_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: String, // "add" | "remove" | "normal"
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_line: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_line: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDiffContent {
    pub filename: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactNodeData {
    pub title: String,
    pub markdown_content: String,
    pub status: String, // "draft" | "approved" | "rejected"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_tab: Option<String>, // "document" | "comments" | "split"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments: Option<Vec<ArtifactComment>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html_preview: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff_content: Option<ArtifactDiffContent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PreviewNodeData {
    pub title: String,
    pub html_preview: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>, // "draft" | "ready"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffNodeData {
    pub title: String,
    pub filename: String,
    pub lines: Vec<DiffLine>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<DiffStats>,
    pub parent_agent_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalNodeData {
    pub title: String,
    pub shell: String, // "powershell"
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_pty_active: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationTool {
    #[default]
    Circle,
    Arrow,
    Rect,
    Brush,
    Text,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationItem {
    pub id: String,
    pub tool: AnnotationTool,
    pub color: String,
    pub stroke_width: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageItem {
    pub id: String,
    pub url: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<Vec<AnnotationItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageNodeData {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<Vec<AnnotationItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<ImageItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_image_index: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageGroupNodeData {
    pub title: String,
    pub images: Vec<ImageItem>,
    pub active_image_index: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GroupNodeData {
    pub title: String,
    pub node_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_reactive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_drag_over: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_resizing: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNodeData {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub title: String,
    pub note_type: String, // "decision" | "knowledge" | "learning" | "rule" | "task" | "entity" | "journal"
    pub scope: String,     // "project" | "global"
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relative_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub full_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct Position2D {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ViewportTransform {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for ViewportTransform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct NodeStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "camelCase")]
pub enum NodeKindData {
    Agent(AgentNodeData),
    Artifact(ArtifactNodeData),
    Preview(PreviewNodeData),
    Diff(DiffNodeData),
    Terminal(TerminalNodeData),
    Image(ImageNodeData),
    ImageGroup(ImageGroupNodeData),
    Group(GroupNodeData),
    Memory(MemoryNodeData),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String, // "agentNode" | "artifactNode" | "previewNode" | "diffNode" | "imageNode" | "imageGroupNode" | "groupNode" | "memoryNode" | "terminalNode"
    pub position: Position2D,
    #[serde(default)]
    pub style: NodeStyle,
    #[serde(default)]
    pub selected: bool,
    pub data: serde_json::Value,
}

impl CanvasNode {
    pub fn new(
        id: impl Into<String>,
        node_type: impl Into<String>,
        position: Position2D,
        data: serde_json::Value,
    ) -> Self {
        Self {
            id: id.into(),
            node_type: node_type.into(),
            position,
            style: NodeStyle::default(),
            selected: false,
            data,
        }
    }

    pub fn with_style(mut self, style: NodeStyle) -> Self {
        self.style = style;
        self
    }

    pub fn with_dimensions(mut self, width: f64, height: f64) -> Self {
        self.style.width = Some(width);
        self.style.height = Some(height);
        self
    }

    pub fn new_agent(id: impl Into<String>, position: Position2D, data: AgentNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "agentNode", position, value)
    }

    pub fn new_artifact(id: impl Into<String>, position: Position2D, data: ArtifactNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "artifactNode", position, value)
    }

    pub fn new_preview(id: impl Into<String>, position: Position2D, data: PreviewNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "previewNode", position, value)
    }

    pub fn new_diff(id: impl Into<String>, position: Position2D, data: DiffNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "diffNode", position, value)
    }

    pub fn new_terminal(id: impl Into<String>, position: Position2D, data: TerminalNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "terminalNode", position, value)
    }

    pub fn new_image(id: impl Into<String>, position: Position2D, data: ImageNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "imageNode", position, value)
    }

    pub fn new_image_group(id: impl Into<String>, position: Position2D, data: ImageGroupNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "imageGroupNode", position, value)
    }

    pub fn new_group(id: impl Into<String>, position: Position2D, data: GroupNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "groupNode", position, value)
    }

    pub fn new_memory(id: impl Into<String>, position: Position2D, data: MemoryNodeData) -> Self {
        let value = serde_json::to_value(&data).unwrap_or(serde_json::Value::Null);
        Self::new(id, "memoryNode", position, value)
    }

    pub fn get_node_dimensions(&self) -> (f64, f64) {
        if let (Some(w), Some(h)) = (self.style.width, self.style.height) {
            if w > 0.0 && h > 0.0 {
                return (w, h);
            }
        }
        match self.node_type.as_str() {
            "agentNode" => (600.0, 520.0),
            "artifactNode" => (400.0, 320.0),
            "previewNode" => (440.0, 360.0),
            "diffNode" => (440.0, 320.0),
            "imageNode" => (340.0, 280.0),
            "imageGroupNode" => (360.0, 300.0),
            "groupNode" => (560.0, 420.0),
            "memoryNode" => (440.0, 380.0),
            "terminalNode" => (640.0, 400.0),
            _ => (380.0, 320.0),
        }
    }

    pub fn as_agent_data(&self) -> Option<AgentNodeData> {
        if self.node_type != "agentNode" && self.node_type != "agent" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_artifact_data(&self) -> Option<ArtifactNodeData> {
        if self.node_type != "artifactNode" && self.node_type != "artifact" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_preview_data(&self) -> Option<PreviewNodeData> {
        if self.node_type != "previewNode" && self.node_type != "preview" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_diff_data(&self) -> Option<DiffNodeData> {
        if self.node_type != "diffNode" && self.node_type != "diff" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_terminal_data(&self) -> Option<TerminalNodeData> {
        if self.node_type != "terminalNode" && self.node_type != "terminal" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_image_data(&self) -> Option<ImageNodeData> {
        if self.node_type != "imageNode" && self.node_type != "image" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_image_group_data(&self) -> Option<ImageGroupNodeData> {
        if self.node_type != "imageGroupNode" && self.node_type != "imageGroup" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_group_data(&self) -> Option<GroupNodeData> {
        if self.node_type != "groupNode" && self.node_type != "group" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }

    pub fn as_memory_data(&self) -> Option<MemoryNodeData> {
        if self.node_type != "memoryNode" && self.node_type != "memory" {
            return None;
        }
        serde_json::from_value(self.data.clone()).ok()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub edge_type: Option<String>,
    #[serde(default)]
    pub animated: bool,
    #[serde(default)]
    pub selected: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashItem {
    pub id: String,
    pub node_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub saved_at: String,
    pub node_data: serde_json::Value,
    pub position: Position2D,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<NodeStyle>,
    pub preview_snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectedAccount {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub status: String, // "connected" | "disconnected"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_or_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliConfig {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub color: String,
    pub active: bool,
    pub role: AgentRole,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connected_account: Option<ConnectedAccount>,
    pub default_args: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillItem {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectRef {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub folders: Vec<WorkspaceFolder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_projects: Option<Vec<RecentProjectRef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BridgeAction {
    #[serde(default)]
    pub action_type: String, // "spawn_subagent" | "create_artifact" | "create_preview" | "create_diff"
    pub parent_node_id: Option<String>,
    pub child_type: Option<String>,
    pub role: Option<String>,
    pub task: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub html: Option<String>,
    pub filename: Option<String>,
    pub lines: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub scope: String, // "project" | "global"
    pub relative_path: String,
    pub full_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
    #[serde(default)]
    pub rev: u32,
    #[serde(default)]
    pub etag: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorIssue {
    pub severity: String, // "error" | "warning" | "info"
    pub scope: String,
    pub file: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorStats {
    pub total_notes: usize,
    pub total_journals: usize,
    pub total_estimated_tokens: usize,
    pub storage_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSummary {
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub passed: bool,
    pub scanned_scopes: Vec<String>,
    pub stats: DoctorStats,
    pub issues: Vec<DoctorIssue>,
    pub summary: DoctorSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpawnPtyRequest {
    pub session_id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCanvasState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub nodes: Vec<CanvasNode>,
    #[serde(default)]
    pub edges: Vec<CanvasEdge>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport: Option<ViewportTransform>,
}

impl WorkspaceCanvasState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_nodes_and_edges(nodes: Vec<CanvasNode>, edges: Vec<CanvasEdge>) -> Self {
        Self {
            name: None,
            nodes,
            edges,
            viewport: Some(ViewportTransform::default()),
        }
    }

    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

pub fn parse_hunk_header(line: &str) -> Option<(usize, usize)> {
    if !line.starts_with("@@") {
        return None;
    }
    let rest = line.strip_prefix("@@")?.trim_start();
    let end_idx = rest.find("@@")?;
    let header_content = rest[..end_idx].trim();
    let mut parts = header_content.split_whitespace();
    let old_part = parts.next()?.strip_prefix('-')?;
    let new_part = parts.next()?.strip_prefix('+')?;

    let old_start = old_part.split(',').next()?.parse::<usize>().ok()?;
    let new_start = new_part.split(',').next()?.parse::<usize>().ok()?;
    Some((old_start, new_start))
}

pub fn parse_unified_diff(raw: &str) -> (Vec<DiffLine>, DiffStats) {
    if raw.trim().is_empty() {
        return (Vec::new(), DiffStats::default());
    }

    let mut lines = Vec::new();
    let mut additions = 0usize;
    let mut deletions = 0usize;
    let mut old_line_cursor: Option<usize> = None;
    let mut new_line_cursor: Option<usize> = None;

    for line in raw.lines() {
        if line.starts_with("@@") {
            if let Some((old_start, new_start)) = parse_hunk_header(line) {
                old_line_cursor = Some(old_start);
                new_line_cursor = Some(new_start);
            }
            lines.push(DiffLine {
                line_type: "normal".to_string(),
                content: line.to_string(),
                old_line: None,
                new_line: None,
            });
        } else if line.starts_with("---")
            || line.starts_with("+++")
            || line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with('\\')
        {
            lines.push(DiffLine {
                line_type: "normal".to_string(),
                content: line.to_string(),
                old_line: None,
                new_line: None,
            });
        } else if line.starts_with('+') {
            additions += 1;
            let new_line = new_line_cursor;
            if let Some(nl) = new_line_cursor {
                new_line_cursor = Some(nl + 1);
            }
            lines.push(DiffLine {
                line_type: "add".to_string(),
                content: line.to_string(),
                old_line: None,
                new_line,
            });
        } else if line.starts_with('-') {
            deletions += 1;
            let old_line = old_line_cursor;
            if let Some(ol) = old_line_cursor {
                old_line_cursor = Some(ol + 1);
            }
            lines.push(DiffLine {
                line_type: "remove".to_string(),
                content: line.to_string(),
                old_line,
                new_line: None,
            });
        } else {
            let old_line = old_line_cursor;
            let new_line = new_line_cursor;
            if let Some(ol) = old_line_cursor {
                old_line_cursor = Some(ol + 1);
            }
            if let Some(nl) = new_line_cursor {
                new_line_cursor = Some(nl + 1);
            }
            lines.push(DiffLine {
                line_type: "normal".to_string(),
                content: line.to_string(),
                old_line,
                new_line,
            });
        }
    }

    let stats = DiffStats { additions, deletions };
    (lines, stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_node_default_and_custom_dimensions() {
        let node_agent = CanvasNode::new("agent-1", "agentNode", Position2D { x: 10.0, y: 20.0 }, serde_json::Value::Null);
        assert_eq!(node_agent.get_node_dimensions(), (600.0, 520.0));

        let node_artifact = CanvasNode::new("art-1", "artifactNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_artifact.get_node_dimensions(), (400.0, 320.0));

        let node_preview = CanvasNode::new("prev-1", "previewNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_preview.get_node_dimensions(), (440.0, 360.0));

        let node_diff = CanvasNode::new("diff-1", "diffNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_diff.get_node_dimensions(), (440.0, 320.0));

        let node_image = CanvasNode::new("img-1", "imageNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_image.get_node_dimensions(), (340.0, 280.0));

        let node_img_group = CanvasNode::new("img-grp-1", "imageGroupNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_img_group.get_node_dimensions(), (360.0, 300.0));

        let node_group = CanvasNode::new("grp-1", "groupNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_group.get_node_dimensions(), (560.0, 420.0));

        let node_memory = CanvasNode::new("mem-1", "memoryNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_memory.get_node_dimensions(), (440.0, 380.0));

        let node_terminal = CanvasNode::new("term-1", "terminalNode", Position2D::default(), serde_json::Value::Null);
        assert_eq!(node_terminal.get_node_dimensions(), (640.0, 400.0));

        let custom_node = node_agent.with_dimensions(800.0, 600.0);
        assert_eq!(custom_node.get_node_dimensions(), (800.0, 600.0));
    }

    #[test]
    fn test_canvas_node_typed_accessors() {
        // AgentNode
        let agent_data = AgentNodeData {
            title: "Claude Planner".to_string(),
            agent_type: "claude".to_string(),
            role: AgentRole::Planner,
            status: AgentStatus::Running,
            view_mode: AgentViewMode::Terminal,
            terminal_logs: vec!["Starting session...".to_string()],
            ..Default::default()
        };
        let agent_node = CanvasNode::new_agent("node-1", Position2D { x: 50.0, y: 50.0 }, agent_data.clone());
        let extracted = agent_node.as_agent_data().expect("Should extract agent data");
        assert_eq!(extracted.title, "Claude Planner");
        assert_eq!(extracted.role, AgentRole::Planner);
        assert_eq!(extracted.status, AgentStatus::Running);
        assert!(agent_node.as_artifact_data().is_none());

        // ArtifactNode
        let artifact_data = ArtifactNodeData {
            title: "Plan Architecture".to_string(),
            markdown_content: "# Architecture".to_string(),
            status: "approved".to_string(),
            ..Default::default()
        };
        let artifact_node = CanvasNode::new_artifact("art-1", Position2D::default(), artifact_data);
        let extracted_art = artifact_node.as_artifact_data().expect("Should extract artifact data");
        assert_eq!(extracted_art.title, "Plan Architecture");
        assert_eq!(extracted_art.status, "approved");

        // PreviewNode
        let preview_data = PreviewNodeData {
            title: "Dashboard Preview".to_string(),
            html_preview: "<h1>Hello</h1>".to_string(),
            status: Some("ready".to_string()),
            ..Default::default()
        };
        let preview_node = CanvasNode::new_preview("prev-1", Position2D::default(), preview_data);
        let extracted_prev = preview_node.as_preview_data().expect("Should extract preview data");
        assert_eq!(extracted_prev.title, "Dashboard Preview");

        // DiffNode
        let diff_data = DiffNodeData {
            title: "Diff: main.rs".to_string(),
            filename: "src/main.rs".to_string(),
            lines: vec![DiffLine {
                line_type: "add".to_string(),
                content: "+fn main() {}".to_string(),
                old_line: None,
                new_line: Some(1),
            }],
            stats: Some(DiffStats { additions: 1, deletions: 0 }),
            parent_agent_id: "agent-1".to_string(),
            parent_agent_title: Some("Planner".to_string()),
        };
        let diff_node = CanvasNode::new_diff("diff-1", Position2D::default(), diff_data);
        let extracted_diff = diff_node.as_diff_data().expect("Should extract diff data");
        assert_eq!(extracted_diff.filename, "src/main.rs");
        assert_eq!(extracted_diff.stats.unwrap().additions, 1);

        // TerminalNode
        let terminal_data = TerminalNodeData {
            title: "PowerShell".to_string(),
            shell: "powershell".to_string(),
            session_id: "pty-123".to_string(),
            workspace_path: Some("/home/project".to_string()),
            is_pty_active: Some(true),
        };
        let terminal_node = CanvasNode::new_terminal("term-1", Position2D::default(), terminal_data);
        let extracted_term = terminal_node.as_terminal_data().expect("Should extract terminal data");
        assert_eq!(extracted_term.session_id, "pty-123");

        // ImageNode
        let image_data = ImageNodeData {
            title: "Screenshot".to_string(),
            url: Some("data:image/png;base64,...".to_string()),
            name: Some("screenshot.png".to_string()),
            ..Default::default()
        };
        let image_node = CanvasNode::new_image("img-1", Position2D::default(), image_data);
        assert_eq!(image_node.as_image_data().unwrap().name.unwrap(), "screenshot.png");

        // ImageGroupNode
        let img_group_data = ImageGroupNodeData {
            title: "Gallery".to_string(),
            images: vec![],
            active_image_index: 0,
        };
        let img_group_node = CanvasNode::new_image_group("ig-1", Position2D::default(), img_group_data);
        assert_eq!(img_group_node.as_image_group_data().unwrap().title, "Gallery");

        // GroupNode
        let group_data = GroupNodeData {
            title: "Frontend Cluster".to_string(),
            node_ids: vec!["node-1".to_string(), "node-2".to_string()],
            ..Default::default()
        };
        let group_node = CanvasNode::new_group("grp-1", Position2D::default(), group_data);
        assert_eq!(group_node.as_group_data().unwrap().node_ids.len(), 2);

        // MemoryNode
        let memory_data = MemoryNodeData {
            title: "ADR 001".to_string(),
            note_type: "decision".to_string(),
            scope: "project".to_string(),
            content: "We use 100% pure Rust".to_string(),
            ..Default::default()
        };
        let memory_node = CanvasNode::new_memory("mem-1", Position2D::default(), memory_data);
        assert_eq!(memory_node.as_memory_data().unwrap().note_type, "decision");
    }

    #[test]
    fn test_parse_unified_diff_git_format() {
        let raw_diff = r#"diff --git a/src/lib.rs b/src/lib.rs
index 1234567..89abcdef 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -10,4 +10,5 @@ fn test() {
 context line 1
-removed line
+added line A
+added line B
 context line 2
"#;

        let (lines, stats) = parse_unified_diff(raw_diff);
        assert_eq!(stats.additions, 2);
        assert_eq!(stats.deletions, 1);

        let add_lines: Vec<_> = lines.iter().filter(|l| l.line_type == "add").collect();
        assert_eq!(add_lines.len(), 2);
        assert_eq!(add_lines[0].content, "+added line A");
        assert_eq!(add_lines[0].new_line, Some(11));
        assert_eq!(add_lines[1].content, "+added line B");
        assert_eq!(add_lines[1].new_line, Some(12));

        let rem_lines: Vec<_> = lines.iter().filter(|l| l.line_type == "remove").collect();
        assert_eq!(rem_lines.len(), 1);
        assert_eq!(rem_lines[0].content, "-removed line");
        assert_eq!(rem_lines[0].old_line, Some(11));
    }

    #[test]
    fn test_parse_unified_diff_empty_and_simple() {
        let (lines, stats) = parse_unified_diff("");
        assert!(lines.is_empty());
        assert_eq!(stats.additions, 0);
        assert_eq!(stats.deletions, 0);

        let simple = "+new line 1\n-old line 1\n normal context";
        let (lines, stats) = parse_unified_diff(simple);
        assert_eq!(lines.len(), 3);
        assert_eq!(stats.additions, 1);
        assert_eq!(stats.deletions, 1);
        assert_eq!(lines[0].line_type, "add");
        assert_eq!(lines[1].line_type, "remove");
        assert_eq!(lines[2].line_type, "normal");
    }

    #[test]
    fn test_workspace_json_roundtrip_compatibility() {
        let sample_workspace_json = r#"{
            "nodes": [
                {
                    "id": "node-agent-1",
                    "type": "agentNode",
                    "position": { "x": 100.5, "y": 250.0 },
                    "style": { "width": 600.0, "height": 520.0 },
                    "selected": true,
                    "data": {
                        "title": "Orchestrator",
                        "agentType": "claude",
                        "role": "planner",
                        "status": "idle",
                        "viewMode": "terminal",
                        "terminalLogs": ["Started"]
                    }
                },
                {
                    "id": "node-terminal-1",
                    "type": "terminalNode",
                    "position": { "x": 750.0, "y": 250.0 },
                    "style": { "width": 640.0, "height": 400.0 },
                    "selected": false,
                    "data": {
                        "title": "PowerShell",
                        "shell": "powershell",
                        "sessionId": "pty-node-terminal-1"
                    }
                }
            ],
            "edges": [
                {
                    "id": "e-1-2",
                    "source": "node-agent-1",
                    "target": "node-terminal-1",
                    "animated": true,
                    "selected": false
                }
            ],
            "viewport": {
                "x": 0.0,
                "y": 0.0,
                "zoom": 1.0
            }
        }"#;

        let state: WorkspaceCanvasState = serde_json::from_str(sample_workspace_json)
            .expect("Should deserialize sample workspace JSON");

        assert_eq!(state.nodes.len(), 2);
        assert_eq!(state.edges.len(), 1);
        assert_eq!(state.nodes[0].id, "node-agent-1");
        assert_eq!(state.nodes[0].node_type, "agentNode");
        assert_eq!(state.nodes[0].position.x, 100.5);
        assert!(state.nodes[0].selected);

        let agent = state.nodes[0].as_agent_data().expect("Should extract agent data");
        assert_eq!(agent.title, "Orchestrator");
        assert_eq!(agent.role, AgentRole::Planner);

        let term = state.nodes[1].as_terminal_data().expect("Should extract terminal data");
        assert_eq!(term.session_id, "pty-node-terminal-1");

        let serialized = serde_json::to_string(&state).expect("Should serialize back to JSON");
        let roundtrip: WorkspaceCanvasState = serde_json::from_str(&serialized)
            .expect("Should deserialize from serialized JSON");

        assert_eq!(state, roundtrip);
    }
}

