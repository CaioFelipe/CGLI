//! CGLI Infinite Canvas Engine and Core CanvasApp Component
//!
//! Provides:
//! - Reactive state provider (CanvasStore)
//! - Pan and Zoom centered on cursor with SVG dot grid background
//! - Transformed nodes layer with drag-and-drop, selection, and collision detection
//! - Drag-to-attach (Memory -> Agent) and Drag-into-group (>25% overlap)
//! - Cubic Bezier SVG edges layer with RemovableEdgeView
//! - Context menu (Right-click: Claude, AGY, PowerShell, Image, Group, Memory)
//! - Global Ctrl+V clipboard image paste listener
//! - Floating multi-selection toolbar (Group Selected Nodes)
//! - Bottom controls (Zoom +, Zoom -, Fit View) & MiniMap
//! - SSE Bridge event listener synchronization
//! - Modals and Stash Drawer integration

use cgli_core::{CanvasNode, NodeStyle, Position2D, ThemeMode};
use leptos::*;
use serde_json::json;
use wasm_bindgen::prelude::*;
use web_sys::{HtmlElement, MouseEvent, WheelEvent};

use crate::modals::AllModalsView;
use crate::nodes_core::{AgentCardNodeView, ArtifactNodeView, TerminalNodeView};
use crate::nodes_visual::{
    DiffNodeView, GroupNodeView, ImageGroupNodeView, ImageNodeView, MemoryNodeView,
    PreviewNodeView,
};
use crate::removable_edge::RemovableEdgeView;
use crate::stash_drawer::StashDrawerView;
use crate::store::CanvasStore;
use crate::topbar::TopbarView;

/// Helper to get default dimensions for a canvas node
pub fn get_node_dimensions(node: &CanvasNode) -> (f64, f64) {
    if let (Some(w), Some(h)) = (node.style.width, node.style.height) {
        if w > 0.0 && h > 0.0 {
            return (w, h);
        }
    }
    match node.node_type.as_str() {
        "agentNode" => (600.0, 520.0),
        "artifactNode" => (440.0, 360.0),
        "previewNode" => (440.0, 360.0),
        "diffNode" => (440.0, 320.0),
        "terminalNode" => (640.0, 400.0),
        "imageNode" => (340.0, 260.0),
        "imageGroupNode" => (560.0, 420.0),
        "groupNode" => (560.0, 420.0),
        "memoryNode" => (380.0, 260.0),
        _ => (400.0, 300.0),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct DraggingNodeState {
    offset_x: f64,
    offset_y: f64,
    start_x: f64,
    start_y: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct ContextMenuState {
    client_x: f64,
    client_y: f64,
    flow_x: f64,
    flow_y: f64,
}

#[component]
pub fn CanvasApp() -> impl IntoView {
    // Provide CanvasStore context if not present
    let store = match use_context::<CanvasStore>() {
        Some(s) => s,
        None => {
            let s = CanvasStore::new();
            provide_context(s);
            s
        }
    };

    // Viewport transform signals: x, y (pan offset) and zoom
    let viewport_x = create_rw_signal(store.viewport.get().x);
    let viewport_y = create_rw_signal(store.viewport.get().y);
    let viewport_zoom = create_rw_signal(store.viewport.get().zoom);

    // Mouse & Pan state
    let is_panning = create_rw_signal(false);
    let pan_start = create_rw_signal::<(f64, f64)>((0.0, 0.0));
    let pan_origin = create_rw_signal::<(f64, f64)>((0.0, 0.0));

    // Dragging node state
    let dragged_node_id = create_rw_signal::<Option<String>>(None);
    let drag_state = create_rw_signal::<Option<DraggingNodeState>>(None);

    // Context menu state
    let context_menu = create_rw_signal::<Option<ContextMenuState>>(None);

    // Track mouse position in viewport
    let mouse_pos = create_rw_signal::<(f64, f64)>((300.0, 300.0));

    // Synchronize document theme class
    create_effect(move |_| {
        let theme = store.theme.get();
        if let Some(doc) = web_sys::window().and_then(|w| w.document()) {
            if let Some(root) = doc.document_element() {
                if theme == ThemeMode::Dark {
                    let _ = root.class_list().add_1("dark");
                } else {
                    let _ = root.class_list().remove_1("dark");
                }
            }
        }
    });

    // Subscribe to Bridge SSE events on mount
    create_effect(move |_| {
        let store_c = store;
        if let Ok(es) = crate::services::subscribe_bridge_events(move |action| {
            store_c.handle_bridge_action(action);
        }) {
            // Keep event source active
            std::mem::forget(es);
        }
    });

    // Helper: screen to canvas coordinate conversion
    let screen_to_canvas = move |screen_x: f64, screen_y: f64| -> (f64, f64) {
        let z = viewport_zoom.get();
        let vx = viewport_x.get();
        let vy = viewport_y.get();
        ((screen_x - vx) / z, (screen_y - vy) / z)
    };

    // Helper: Fit View
    let fit_view = move || {
        let nodes = store.nodes.get();
        if nodes.is_empty() {
            viewport_x.set(100.0);
            viewport_y.set(100.0);
            viewport_zoom.set(1.0);
            return;
        }

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for node in &nodes {
            let (w, h) = get_node_dimensions(node);
            let nx = node.position.x;
            let ny = node.position.y;
            if nx < min_x {
                min_x = nx;
            }
            if ny < min_y {
                min_y = ny;
            }
            if nx + w > max_x {
                max_x = nx + w;
            }
            if ny + h > max_y {
                max_y = ny + h;
            }
        }

        let bounds_w = (max_x - min_x).max(100.0);
        let bounds_h = (max_y - min_y).max(100.0);

        let win_w = web_sys::window()
            .and_then(|w| w.inner_width().ok())
            .and_then(|v| v.as_f64())
            .unwrap_or(1280.0);
        let win_h = web_sys::window()
            .and_then(|w| w.inner_height().ok())
            .and_then(|v| v.as_f64())
            .unwrap_or(800.0)
            - 52.0;

        let padding = 80.0;
        let scale_x = (win_w - padding * 2.0) / bounds_w;
        let scale_y = (win_h - padding * 2.0) / bounds_h;
        let new_zoom = scale_x.min(scale_y).clamp(0.2, 1.5);

        let center_x = min_x + bounds_w / 2.0;
        let center_y = min_y + bounds_h / 2.0;

        viewport_zoom.set(new_zoom);
        viewport_x.set(win_w / 2.0 - center_x * new_zoom);
        viewport_y.set((win_h / 2.0 + 52.0) - center_y * new_zoom);
    };

    // Zoom In / Out
    let zoom_in = move || {
        let current = viewport_zoom.get();
        let next = (current * 1.2).min(2.5);
        viewport_zoom.set(next);
    };

    let zoom_out = move || {
        let current = viewport_zoom.get();
        let next = (current / 1.2).max(0.15);
        viewport_zoom.set(next);
    };

    // Zoom centered on cursor
    let handle_wheel = move |e: WheelEvent| {
        e.prevent_default();
        let delta = e.delta_y();
        let zoom_factor = if delta < 0.0 { 1.1 } else { 0.909 };

        let current_zoom = viewport_zoom.get();
        let next_zoom = (current_zoom * zoom_factor).clamp(0.15, 2.5);

        let mouse_x = e.client_x() as f64;
        let mouse_y = e.client_y() as f64;

        let vx = viewport_x.get();
        let vy = viewport_y.get();

        // Keep the point under mouse stationary
        let new_vx = mouse_x - (mouse_x - vx) * (next_zoom / current_zoom);
        let new_vy = mouse_y - (mouse_y - vy) * (next_zoom / current_zoom);

        viewport_zoom.set(next_zoom);
        viewport_x.set(new_vx);
        viewport_y.set(new_vy);
    };

    // Pane mouse down: Pan start
    let handle_pane_mousedown = move |e: MouseEvent| {
        context_menu.set(None);
        if e.button() == 0 {
            // Left click on background
            let target = e.target();
            if let Some(el) = target.and_then(|t| t.dyn_into::<HtmlElement>().ok()) {
                let tag = el.tag_name().to_lowercase();
                if tag == "input" || tag == "textarea" || tag == "button" || tag == "select" {
                    return;
                }
            }
            is_panning.set(true);
            pan_start.set((e.client_x() as f64, e.client_y() as f64));
            pan_origin.set((viewport_x.get(), viewport_y.get()));
        }
    };

    // Window mouse move: handles Pan or Node Drag
    let handle_mousemove = move |e: MouseEvent| {
        let client_x = e.client_x() as f64;
        let client_y = e.client_y() as f64;
        mouse_pos.set((client_x, client_y));

        if is_panning.get() {
            let (start_x, start_y) = pan_start.get();
            let (orig_x, orig_y) = pan_origin.get();
            let dx = client_x - start_x;
            let dy = client_y - start_y;
            viewport_x.set(orig_x + dx);
            viewport_y.set(orig_y + dy);
            return;
        }

        if let (Some(node_id), Some(state)) = (dragged_node_id.get(), drag_state.get()) {
            let (canvas_x, canvas_y) = screen_to_canvas(client_x, client_y);
            let new_node_x = canvas_x - state.offset_x;
            let new_node_y = canvas_y - state.offset_y;

            // Update position in store
            store.nodes.update(|nodes| {
                if let Some(n) = nodes.iter_mut().find(|n| n.id == node_id) {
                    n.position.x = new_node_x;
                    n.position.y = new_node_y;
                }
            });

            // Collision detection with groups (> 25% overlap)
            let nodes = store.nodes.get();
            if let Some(curr_node) = nodes.iter().find(|n| n.id == node_id) {
                if curr_node.node_type != "groupNode" {
                    let (n_w, n_h) = get_node_dimensions(curr_node);
                    let n_center_x = new_node_x + n_w / 2.0;
                    let n_center_y = new_node_y + n_h / 2.0;

                    let mut target_group = None;
                    for g in nodes.iter().filter(|n| n.node_type == "groupNode") {
                        let member_ids = g
                            .data
                            .get("nodeIds")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|x| x.as_str().map(String::from))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        if member_ids.contains(&node_id) {
                            continue;
                        }

                        let (g_w, g_h) = get_node_dimensions(g);
                        let g_x = g.position.x;
                        let g_y = g.position.y;

                        let is_center_in = n_center_x >= g_x
                            && n_center_x <= g_x + g_w
                            && n_center_y >= g_y
                            && n_center_y <= g_y + g_h;
                        let overlap_x =
                            (0.0_f64).max((new_node_x + n_w).min(g_x + g_w) - new_node_x.max(g_x));
                        let overlap_y =
                            (0.0_f64).max((new_node_y + n_h).min(g_y + g_h) - new_node_y.max(g_y));
                        let overlap_area = overlap_x * overlap_y;
                        let node_area = n_w * n_h;
                        let has_overlap = node_area > 0.0 && (overlap_area / node_area) > 0.25;

                        if is_center_in || has_overlap {
                            target_group = Some(g.id.clone());
                            break;
                        }
                    }
                    store.group_drag_over.set(target_group);
                }
            }
        }
    };

    // Window mouse up: releases Pan or Node Drag and performs attachment
    let handle_mouseup = move |_e: MouseEvent| {
        if is_panning.get() {
            is_panning.set(false);
        }

        if let Some(node_id) = dragged_node_id.get() {
            dragged_node_id.set(None);
            drag_state.set(None);
            store.group_drag_over.set(None);

            let nodes = store.nodes.get();
            let dragged_node = nodes.iter().find(|n| n.id == node_id).cloned();

            if let Some(curr) = dragged_node {
                let (n_w, n_h) = get_node_dimensions(&curr);
                let n_center_x = curr.position.x + n_w / 2.0;
                let n_center_y = curr.position.y + n_h / 2.0;

                // 1. Check Group insertion
                if curr.node_type != "groupNode" {
                    for g in nodes.iter().filter(|n| n.node_type == "groupNode") {
                        let member_ids = g
                            .data
                            .get("nodeIds")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|x| x.as_str().map(String::from))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        if member_ids.contains(&node_id) {
                            continue;
                        }

                        let (g_w, g_h) = get_node_dimensions(g);
                        let is_center_in = n_center_x >= g.position.x
                            && n_center_x <= g.position.x + g_w
                            && n_center_y >= g.position.y
                            && n_center_y <= g.position.y + g_h;
                        let overlap_x = (0.0_f64).max(
                            (curr.position.x + n_w).min(g.position.x + g_w)
                                - curr.position.x.max(g.position.x),
                        );
                        let overlap_y = (0.0_f64).max(
                            (curr.position.y + n_h).min(g.position.y + g_h)
                                - curr.position.y.max(g.position.y),
                        );
                        let has_overlap =
                            (n_w * n_h) > 0.0 && ((overlap_x * overlap_y) / (n_w * n_h)) > 0.25;

                        if is_center_in || has_overlap {
                            store.add_node_to_group(&g.id, &curr.id);
                            return;
                        }
                    }
                }

                // 2. Drag-to-Attach: MemoryNode <-> AgentNode
                if curr.node_type == "memoryNode" {
                    for ag in nodes.iter().filter(|n| n.node_type == "agentNode") {
                        let (a_w, a_h) = get_node_dimensions(ag);
                        let is_in = n_center_x >= ag.position.x
                            && n_center_x <= ag.position.x + a_w
                            && n_center_y >= ag.position.y
                            && n_center_y <= ag.position.y + a_h;
                        if is_in {
                            store.on_connect(&curr.id, &ag.id);
                            break;
                        }
                    }
                } else if curr.node_type == "agentNode" {
                    for mem in nodes.iter().filter(|n| n.node_type == "memoryNode") {
                        let (m_w, m_h) = get_node_dimensions(mem);
                        let is_in = n_center_x >= mem.position.x
                            && n_center_x <= mem.position.x + m_w
                            && n_center_y >= mem.position.y
                            && n_center_y <= mem.position.y + m_h;
                        if is_in {
                            store.on_connect(&mem.id, &curr.id);
                            break;
                        }
                    }
                }
            }

            store.save_canvas_state();
        }
    };

    // Right-click: Context Menu
    let handle_context_menu = move |e: MouseEvent| {
        e.prevent_default();
        let client_x = e.client_x() as f64;
        let client_y = e.client_y() as f64;
        let (flow_x, flow_y) = screen_to_canvas(client_x, client_y);

        context_menu.set(Some(ContextMenuState {
            client_x,
            client_y,
            flow_x,
            flow_y,
        }));
    };

    // Node drag start callback passed to nodes
    let handle_node_drag_start = move |nid: String, mouse_x: f64, mouse_y: f64| {
        let (c_x, c_y) = screen_to_canvas(mouse_x, mouse_y);
        let nodes = store.nodes.get();
        if let Some(n) = nodes.iter().find(|n| n.id == nid) {
            dragged_node_id.set(Some(nid.clone()));
            drag_state.set(Some(DraggingNodeState {
                offset_x: c_x - n.position.x,
                offset_y: c_y - n.position.y,
                start_x: n.position.x,
                start_y: n.position.y,
            }));

            // Select this node
            store.nodes.update(|list| {
                for node in list.iter_mut() {
                    node.selected = node.id == nid;
                }
            });
        }
    };

    // Spawn agent helper
    let spawn_agent = move |agent_type: &str, pos_x: f64, pos_y: f64| {
        let timestamp = js_sys::Date::now() as u64;
        let is_claude = agent_type == "claude";
        let new_id = format!("node-{}-{}", agent_type, timestamp);
        let node = CanvasNode {
            id: new_id.clone(),
            node_type: "agentNode".into(),
            position: Position2D {
                x: pos_x - 200.0,
                y: pos_y - 150.0,
            },
            style: NodeStyle {
                width: Some(600.0),
                height: Some(520.0),
                z_index: None,
            },
            selected: true,
            data: json!({
                "title": if is_claude { "Claude Code" } else { "Antigravity (AGY)" },
                "agentType": agent_type,
                "role": if is_claude { "planner" } else { "executor" },
                "status": "idle",
                "viewMode": "extension",
                "thinking": null,
                "messages": [],
                "approvals": [],
                "attachedImages": [],
                "terminalLogs": [],
                "sessionId": format!("pty-{}", new_id),
                "cliSessionId": uuid::Uuid::new_v4().to_string(),
                "hasStarted": false,
            }),
        };
        store.add_node(node);
        context_menu.set(None);
    };

    // Spawn terminal helper
    let spawn_terminal = move |pos_x: f64, pos_y: f64| {
        let timestamp = js_sys::Date::now() as u64;
        let new_id = format!("node-terminal-{}", timestamp);
        let node = CanvasNode {
            id: new_id.clone(),
            node_type: "terminalNode".into(),
            position: Position2D {
                x: pos_x - 200.0,
                y: pos_y - 120.0,
            },
            style: NodeStyle {
                width: Some(640.0),
                height: Some(400.0),
                z_index: None,
            },
            selected: true,
            data: json!({
                "title": "PowerShell",
                "shell": "powershell",
                "sessionId": format!("pty-{}", new_id),
                "workspacePath": store.get_active_workspace_path(),
                "isPtyActive": true,
            }),
        };
        store.add_node(node);
        context_menu.set(None);
    };

    // Spawn image helper
    let spawn_image = move |pos_x: f64, pos_y: f64| {
        let timestamp = js_sys::Date::now() as u64;
        let node = CanvasNode {
            id: format!("node-image-{}", timestamp),
            node_type: "imageNode".into(),
            position: Position2D {
                x: pos_x - 170.0,
                y: pos_y - 120.0,
            },
            style: NodeStyle {
                width: Some(340.0),
                height: Some(260.0),
                z_index: None,
            },
            selected: true,
            data: json!({
                "title": "Nova Imagem",
                "name": "",
                "url": "",
                "images": [],
                "activeImageIndex": 0,
                "annotations": [],
            }),
        };
        store.add_node(node);
        context_menu.set(None);
    };

    // Spawn group frame helper
    let spawn_group = move |pos_x: f64, pos_y: f64| {
        let timestamp = js_sys::Date::now() as u64;
        let node = CanvasNode {
            id: format!("group-{}", timestamp),
            node_type: "groupNode".into(),
            position: Position2D {
                x: pos_x - 200.0,
                y: pos_y - 150.0,
            },
            style: NodeStyle {
                width: Some(560.0),
                height: Some(420.0),
                z_index: Some(0),
            },
            selected: true,
            data: json!({
                "title": "Novo Grupo de Nós",
                "nodeIds": [],
                "width": 560,
                "height": 420,
            }),
        };
        store.add_node(node);
        context_menu.set(None);
    };

    // Global Paste Listener (Ctrl+V) for images
    create_effect(move |_| {
        let store_c = store;
        let cb = Closure::<dyn FnMut(web_sys::ClipboardEvent)>::new(
            move |e: web_sys::ClipboardEvent| {
                if let Some(target) = e.target() {
                    if let Ok(el) = target.dyn_into::<HtmlElement>() {
                        let tag = el.tag_name().to_lowercase();
                        if tag == "input" || tag == "textarea" {
                            return;
                        }
                    }
                }

                if let Some(data) = e.clipboard_data() {
                    let items = data.items();
                    for i in 0..items.length() {
                        if let Some(item) = items.get(i) {
                            if item.kind() == "file" && item.type_().starts_with("image/") {
                                if let Ok(Some(file)) = item.get_as_file() {
                                    e.prevent_default();
                                    let store_post = store_c;
                                    let filename = file.name();
                                    let (mx, my) = mouse_pos.get();
                                    let (flow_x, flow_y) = screen_to_canvas(mx, my);

                                    let reader = web_sys::FileReader::new().ok();
                                    if let Some(r) = reader {
                                        let store_post = store_c;
                                        let file_clone = file.clone();
                                        let filename_clone = filename.clone();
                                        let r_clone = r.clone();
                                        let onload = Closure::<dyn FnMut()>::new(move || {
                                            if let Ok(result) = r_clone.result() {
                                                if let Some(url_str) = result.as_string() {
                                                    let project_path = store_post.get_active_workspace_path();
                                                    let fname = filename_clone.clone();
                                                    let base64 = url_str.clone();

                                                    wasm_bindgen_futures::spawn_local(async move {
                                                        let saved_url = crate::services::save_attachment(&project_path, &fname, &base64)
                                                            .await
                                                            .unwrap_or_else(|_| base64.clone());

                                                        let new_node = CanvasNode {
                                                            id: format!(
                                                                "node-image-paste-{}",
                                                                js_sys::Date::now() as u64
                                                            ),
                                                            node_type: "imageNode".into(),
                                                            position: Position2D {
                                                                x: flow_x - 170.0,
                                                                y: flow_y - 120.0,
                                                            },
                                                            style: NodeStyle {
                                                                width: Some(340.0),
                                                                height: Some(260.0),
                                                                z_index: None,
                                                            },
                                                            selected: true,
                                                            data: json!({
                                                                "title": "Captura Colada",
                                                                "name": fname,
                                                                "url": saved_url,
                                                                "images": [{
                                                                    "id": format!("img-{}", js_sys::Date::now() as u64),
                                                                    "url": saved_url,
                                                                    "name": fname,
                                                                    "annotations": []
                                                                }],
                                                                "activeImageIndex": 0,
                                                                "annotations": []
                                                            }),
                                                        };
                                                        store_post.add_node(new_node);
                                                    });
                                                }
                                            }
                                        });
                                        r.set_onload(Some(onload.as_ref().unchecked_ref()));
                                        onload.forget();
                                        let _ = r.read_as_data_url(&file_clone);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            },
        );

        if let Some(win) = web_sys::window() {
            let _ = win.add_event_listener_with_callback("paste", cb.as_ref().unchecked_ref());
            cb.forget();
        }
    });

    // Count selected non-group nodes
    let selected_non_group_nodes = create_memo(move |_| {
        store
            .nodes
            .get()
            .into_iter()
            .filter(|n| n.selected && n.node_type != "groupNode")
            .collect::<Vec<_>>()
    });

    view! {
        <div
            class="w-full h-screen flex flex-col overflow-hidden select-none bg-slate-100 dark:bg-[#090D13] text-slate-900 dark:text-[#F0F6FC]"
            on:mousemove=handle_mousemove
            on:mouseup=handle_mouseup
        >
            // 1. Topbar Navigation
            <TopbarView />

            // 2. Main Infinite Canvas Area
            <main
                class="flex-1 w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing"
                on:mousedown=handle_pane_mousedown
                on:wheel=handle_wheel
                on:contextmenu=handle_context_menu
            >
                // Background Dot Grid SVG (Inspired by n8n / ReactFlow BackgroundVariant.Dots)
                {move || {
                    let z = viewport_zoom.get();
                    let vx = viewport_x.get();
                    let vy = viewport_y.get();
                    let is_dark = store.theme.get() == ThemeMode::Dark;
                    let dot_color = if is_dark { "#1E293B" } else { "#CBD5E1" };
                    let gap = 20.0 * z;
                    let dot_r = 1.2 * z.clamp(0.6, 2.0);
                    let ox = vx % gap;
                    let oy = vy % gap;

                    view! {
                        <svg class="absolute inset-0 w-full h-full pointer-events-none z-0">
                            <defs>
                                <pattern
                                    id="canvas-dot-grid"
                                    x=ox
                                    y=oy
                                    width=gap
                                    height=gap
                                    patternUnits="userSpaceOnUse"
                                >
                                    <circle cx=dot_r cy=dot_r r=dot_r fill=dot_color />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
                        </svg>
                    }
                }}

                // Transform Layer: Edges + Nodes
                {move || {
                    let z = viewport_zoom.get();
                    let vx = viewport_x.get();
                    let vy = viewport_y.get();
                    let nodes = store.nodes.get();
                    let edges = store.edges.get();

                    view! {
                        <div
                            class="absolute inset-0 origin-top-left pointer-events-none"
                            style=format!(
                                "transform: translate({}px, {}px) scale({});",
                                vx, vy, z
                            )
                        >
                            // Layer A: SVG Edges
                            <svg class="absolute inset-0 w-[50000px] h-[50000px] -translate-x-[25000px] -translate-y-[25000px] overflow-visible pointer-events-none z-10">
                                <g transform="translate(25000, 25000)">
                                    {edges.into_iter().map(|edge| {
                                        let source_node = nodes.iter().find(|n| n.id == edge.source);
                                        let target_node = nodes.iter().find(|n| n.id == edge.target);

                                        if let (Some(s), Some(t)) = (source_node, target_node) {
                                            let (s_w, s_h) = get_node_dimensions(s);
                                            let (_t_w, t_h) = get_node_dimensions(t);

                                            // Connect Right Handle of Source to Left Handle of Target
                                            let source_x = s.position.x + s_w;
                                            let source_y = s.position.y + s_h / 2.0;
                                            let target_x = t.position.x;
                                            let target_y = t.position.y + t_h / 2.0;

                                            let edge_color = if s.node_type == "imageNode" || s.node_type == "imageGroupNode" {
                                                "#F43F5E"
                                            } else if s.node_type == "agentNode" {
                                                let is_claude = s.data.get("agentType").and_then(|v| v.as_str()).unwrap_or("").contains("claude");
                                                if is_claude { "#EA580C" } else { "#0284C7" }
                                            } else if s.node_type == "previewNode" {
                                                "#06B6D4"
                                            } else if s.node_type == "memoryNode" {
                                                "#10B981"
                                            } else {
                                                "#6366F1"
                                            };

                                            view! {
                                                <RemovableEdgeView
                                                    edge=edge
                                                    source_x=source_x
                                                    source_y=source_y
                                                    target_x=target_x
                                                    target_y=target_y
                                                    color=edge_color.to_string()
                                                />
                                            }.into_view()
                                        } else {
                                            view! { <g></g> }.into_view()
                                        }
                                    }).collect_view()}
                                </g>
                            </svg>

                            // Layer B: Nodes
                            <div class="absolute inset-0 w-full h-full pointer-events-none z-20">
                                {nodes.into_iter().map(|node| {
                                    let node_id = node.id.clone();
                                    let node_type = node.node_type.clone();
                                    let (w, h) = get_node_dimensions(&node);
                                    let x = node.position.x;
                                    let y = node.position.y;
                                    let z_index = node.style.z_index.unwrap_or(if node_type == "groupNode" { 0 } else { 10 });

                                    let on_drag_start = {
                                        let nid = node_id.clone();
                                        move |e: MouseEvent| {
                                            e.stop_propagation();
                                            handle_node_drag_start(nid.clone(), e.client_x() as f64, e.client_y() as f64);
                                        }
                                    };

                                    view! {
                                        <div
                                            data-node-id=node_id.clone()
                                            class="absolute pointer-events-auto"
                                            style=format!(
                                                "transform: translate({}px, {}px); width: {}px; height: {}px; z-index: {};",
                                                x, y, w, h, z_index
                                            )
                                            on:mousedown=on_drag_start
                                        >
                                            {match node_type.as_str() {
                                                "agentNode" => view! { <AgentCardNodeView node=node /> }.into_view(),
                                                "artifactNode" => view! { <ArtifactNodeView node=node /> }.into_view(),
                                                "terminalNode" => view! { <TerminalNodeView node=node /> }.into_view(),
                                                "imageNode" => view! { <ImageNodeView node=node /> }.into_view(),
                                                "imageGroupNode" => view! { <ImageGroupNodeView node=node /> }.into_view(),
                                                "groupNode" => view! { <GroupNodeView node=node /> }.into_view(),
                                                "memoryNode" => view! { <MemoryNodeView node=node /> }.into_view(),
                                                "previewNode" => view! { <PreviewNodeView node=node /> }.into_view(),
                                                "diffNode" => view! { <DiffNodeView node=node /> }.into_view(),
                                                _ => view! { <div class="p-4 bg-slate-800 text-white rounded-xl">{node.id}</div> }.into_view(),
                                            }}
                                        </div>
                                    }
                                }).collect_view()}
                            </div>
                        </div>
                    }
                }}

                // 3. Right-Click Context Menu
                {move || {
                    context_menu.get().map(|menu| {
                        let is_dark = store.theme.get() == ThemeMode::Dark;
                        let menu_bg = if is_dark {
                            "bg-[#161B22]/95 border-[#30363D] text-[#F0F6FC] shadow-black/60"
                        } else {
                            "bg-white/95 border-slate-300 text-slate-900 shadow-slate-400/40"
                        };

                        let fx = menu.flow_x;
                        let fy = menu.flow_y;

                        view! {
                            <div
                                class=format!(
                                    "fixed z-50 min-w-[230px] rounded-xl border p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none {}",
                                    menu_bg
                                )
                                style=format!("top: {}px; left: {}px;", menu.client_y, menu.client_x)
                                on:click=move |e| e.stop_propagation()
                            >
                                <div class="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/50 mb-1 flex items-center justify-between">
                                    <span>"Adicionar ao Canvas"</span>
                                    <span class="text-[9px] font-mono opacity-70">"Menu"</span>
                                </div>

                                // Novo Agente Claude
                                <button
                                    type="button"
                                    on:click=move |_| spawn_agent("claude", fx, fy)
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center text-orange-500 shrink-0 font-bold">
                                        "C"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Claude Code"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Planejador CLI"</span>
                                    </div>
                                </button>

                                // Novo Agente AGY
                                <button
                                    type="button"
                                    on:click=move |_| spawn_agent("agy", fx, fy)
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-sky-500/15 flex items-center justify-center text-sky-500 shrink-0 font-bold">
                                        "A"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Antigravity AGY"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Executor CLI"</span>
                                    </div>
                                </button>

                                // Terminal PowerShell
                                <button
                                    type="button"
                                    on:click=move |_| spawn_terminal(fx, fy)
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-500 shrink-0 font-bold">
                                        ">_"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Terminal PowerShell"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Shell local PTY"</span>
                                    </div>
                                </button>

                                <div class="my-1 border-t border-slate-700/50" />

                                // Imagem
                                <button
                                    type="button"
                                    on:click=move |_| spawn_image(fx, fy)
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-rose-500/15 flex items-center justify-center text-rose-500 shrink-0 font-bold">
                                        "🖼"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Nova Imagem"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Print & Editor Canvas"</span>
                                    </div>
                                </button>

                                // Moldura de Grupo
                                <button
                                    type="button"
                                    on:click=move |_| spawn_group(fx, fy)
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0 font-bold">
                                        "⊞"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Moldura de Grupo"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Agrupar nós no canvas"</span>
                                    </div>
                                </button>

                                // Nota de Memória
                                <button
                                    type="button"
                                    on:click=move |_| {
                                        store.is_memory_explorer_open.set(true);
                                        context_menu.set(None);
                                    }
                                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors hover:bg-slate-800/60 dark:hover:bg-[#21262D] cursor-pointer"
                                >
                                    <div class="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0 font-bold">
                                        "🧠"
                                    </div>
                                    <div class="flex flex-col flex-1 min-w-0">
                                        <span class="font-semibold text-xs leading-tight">"Nota de Memória"</span>
                                        <span class="text-[10px] text-slate-400 leading-tight">"Explorar Obsidian & Fixar"</span>
                                    </div>
                                </button>
                            </div>
                        }
                    })
                }}

                // 4. Multi-Selection Floating Action Bar
                {move || {
                    let selected = selected_non_group_nodes.get();
                    if selected.len() > 1 {
                        let count = selected.len();
                        let ids: Vec<String> = selected.into_iter().map(|n| n.id).collect();
                        view! {
                            <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl bg-[#0D1117]/95 border-indigo-500/40 text-slate-100 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
                                <span class="text-xs font-semibold text-indigo-400">
                                    {format!("{} nós selecionados", count)}
                                </span>
                                <button
                                    type="button"
                                    on:click={
                                        let ids = ids.clone();
                                        move |_| store.group_selected_nodes(&ids, None)
                                    }
                                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs cursor-pointer"
                                >
                                    <span>"Criar Grupo"</span>
                                </button>
                            </div>
                        }.into_view()
                    } else {
                        view! { <div></div> }.into_view()
                    }
                }}

                // 5. Controls (Zoom In, Zoom Out, Fit View) at Bottom Left
                <div class="absolute bottom-6 left-6 z-30 flex items-center gap-1 p-1 rounded-xl shadow-xl border bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 backdrop-blur-md">
                    <button
                        type="button"
                        on:click=move |_| zoom_in()
                        title="Aumentar Zoom (+)"
                        class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        "+"
                    </button>
                    <button
                        type="button"
                        on:click=move |_| zoom_out()
                        title="Diminuir Zoom (-)"
                        class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        "−"
                    </button>
                    <div class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-0.5" />
                    <button
                        type="button"
                        on:click=move |_| fit_view()
                        title="Ajustar Visualização (Fit View)"
                        class="px-2.5 h-8 rounded-lg flex items-center justify-center font-medium text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        "[ ]"
                    </button>
                </div>

                // 6. MiniMap at Bottom Right
                {move || {
                    let nodes = store.nodes.get();
                    let is_dark = store.theme.get() == ThemeMode::Dark;
                    let map_bg = if is_dark { "bg-[#0D1117] border-slate-800" } else { "bg-white border-slate-300" };

                    // Calculate minimap bounding box
                    let mut min_x = 0.0_f64;
                    let mut min_y = 0.0_f64;
                    let mut max_x = 2000.0_f64;
                    let mut max_y = 1500.0_f64;

                    for n in &nodes {
                        let (w, h) = get_node_dimensions(n);
                        if n.position.x < min_x { min_x = n.position.x; }
                        if n.position.y < min_y { min_y = n.position.y; }
                        if n.position.x + w > max_x { max_x = n.position.x + w; }
                        if n.position.y + h > max_y { max_y = n.position.y + h; }
                    }

                    let pad = 200.0;
                    let view_w = (max_x - min_x + pad * 2.0).max(1000.0);
                    let view_h = (max_y - min_y + pad * 2.0).max(800.0);
                    let v_box = format!("{} {} {} {}", min_x - pad, min_y - pad, view_w, view_h);

                    view! {
                        <div class=format!("absolute bottom-6 right-6 z-30 w-44 h-32 rounded-xl border shadow-lg overflow-hidden backdrop-blur-md {}", map_bg)>
                            <svg viewBox=v_box class="w-full h-full">
                                {nodes.into_iter().map(|n| {
                                    let (w, h) = get_node_dimensions(&n);
                                    let color = match n.node_type.as_str() {
                                        "agentNode" => {
                                            let is_claude = n.data.get("agentType").and_then(|v| v.as_str()).unwrap_or("").contains("claude");
                                            if is_claude { "#EA580C" } else { "#0284C7" }
                                        },
                                        "artifactNode" => "#6366F1",
                                        "previewNode" => "#06B6D4",
                                        "terminalNode" => "#0078D4",
                                        "diffNode" => "#10B981",
                                        "imageNode" | "imageGroupNode" => "#F43F5E",
                                        "groupNode" => "rgba(99, 102, 241, 0.35)",
                                        "memoryNode" => "#10B981",
                                        _ => "#64748B",
                                    };
                                    view! {
                                        <rect
                                            x=n.position.x
                                            y=n.position.y
                                            width=w
                                            height=h
                                            rx="16"
                                            fill=color
                                            stroke=if n.selected { "#FFFFFF" } else { "none" }
                                            stroke-width="8"
                                        />
                                    }
                                }).collect_view()}
                            </svg>
                        </div>
                    }
                }}
            </main>

            // 7. Stash Drawer & Modals
            <StashDrawerView />
            <AllModalsView />
        </div>
    }
}
