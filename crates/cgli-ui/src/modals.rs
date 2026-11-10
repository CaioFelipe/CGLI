use cgli_core::{
    AgentRole, AnnotationItem, AnnotationTool, CanvasNode, CliConfig, ConnectedAccount,
    ImageGroupNodeData,
    ImageNodeData, MemoryNodeData, NodeStyle, NoteItem, Position2D, ProjectInfo, SkillItem,
    WorkspaceFolder,
};
use leptos::*;
use serde_json::json;
use crate::markdown_view::MarkdownView;
use crate::store::use_canvas_store;

// =============================================================================
// 1. ImageAnnotationModalView
// =============================================================================
#[component]
fn ImageAnnotationModalView() -> impl IntoView {
    let store = use_canvas_store();

    let active_tool = create_rw_signal(AnnotationTool::Circle);
    let active_color = create_rw_signal("#EF4444".to_string());
    let stroke_width: f64 = 3.0;

    let is_drawing = create_rw_signal(false);
    let start_point = create_rw_signal::<Option<(f64, f64)>>(None);
    let current_draft = create_rw_signal::<Option<AnnotationItem>>(None);
    let text_prompt_pos = create_rw_signal::<Option<(f64, f64)>>(None);
    let text_input_val = create_rw_signal(String::new());

    // Local working copy of annotations
    let annotations = create_rw_signal::<Vec<AnnotationItem>>(vec![]);
    let loaded_node_id = create_rw_signal::<Option<String>>(None);

    let tools = vec![
        (AnnotationTool::Circle, "Círculo / Elipse"),
        (AnnotationTool::Arrow, "Seta"),
        (AnnotationTool::Rect, "Retângulo"),
        (AnnotationTool::Brush, "Desenho Livre"),
        (AnnotationTool::Text, "Texto"),
    ];

    let color_palette = vec![
        ("Vermelho", "#EF4444"),
        ("Âmbar", "#F59E0B"),
        ("Verde", "#10B981"),
        ("Azul", "#3B82F6"),
    ];

    // Helper: Close modal
    let close_modal = move |_| {
        store.annotating_node_id.set(None);
        loaded_node_id.set(None);
        current_draft.set(None);
        text_prompt_pos.set(None);
        text_input_val.set(String::new());
    };

    view! {
        {move || {
            let target_node_id = match store.annotating_node_id.get() {
                Some(id) => id,
                None => return view! { <span class="hidden"></span> }.into_view(),
            };

            let nodes = store.nodes.get();
            let active_node = match nodes.into_iter().find(|n| n.id == target_node_id) {
                Some(n) => n,
                None => return view! { <span class="hidden"></span> }.into_view(),
            };

            // Load initial annotations once per node open
            if loaded_node_id.get().as_deref() != Some(&target_node_id) {
                loaded_node_id.set(Some(target_node_id.clone()));
                if active_node.node_type == "imageGroupNode" {
                    if let Ok(group_data) = serde_json::from_value::<ImageGroupNodeData>(active_node.data.clone()) {
                        let idx = group_data.active_image_index.min(group_data.images.len().saturating_sub(1));
                        if let Some(img) = group_data.images.get(idx) {
                            annotations.set(img.annotations.clone().unwrap_or_default());
                        }
                    }
                } else if let Ok(img_data) = serde_json::from_value::<ImageNodeData>(active_node.data.clone()) {
                    if let Some(ref imgs) = img_data.images {
                        let idx = img_data.active_image_index.unwrap_or(0).min(imgs.len().saturating_sub(1));
                        if let Some(img) = imgs.get(idx) {
                            annotations.set(img.annotations.clone().unwrap_or_default());
                        } else {
                            annotations.set(img_data.annotations.unwrap_or_default());
                        }
                    } else {
                        annotations.set(img_data.annotations.unwrap_or_default());
                    }
                }
            }

            // Extract image url and name
            let (image_url, image_name) = if active_node.node_type == "imageGroupNode" {
                if let Ok(group_data) = serde_json::from_value::<ImageGroupNodeData>(active_node.data.clone()) {
                    let idx = group_data.active_image_index.min(group_data.images.len().saturating_sub(1));
                    group_data.images.get(idx).map(|img| (img.url.clone(), img.name.clone())).unwrap_or_default()
                } else {
                    (String::new(), String::new())
                }
            } else if let Ok(img_data) = serde_json::from_value::<ImageNodeData>(active_node.data.clone()) {
                if let Some(ref imgs) = img_data.images {
                    let idx = img_data.active_image_index.unwrap_or(0).min(imgs.len().saturating_sub(1));
                    if let Some(img) = imgs.get(idx) {
                        (img.url.clone(), img.name.clone())
                    } else {
                        (img_data.url.unwrap_or_default(), img_data.name.unwrap_or_default())
                    }
                } else {
                    (img_data.url.unwrap_or_default(), img_data.name.unwrap_or_default())
                }
            } else {
                (String::new(), String::new())
            };

            // Save handler
            let target_node_id_save = target_node_id.clone();
            let is_group = active_node.node_type == "imageGroupNode";
            let handle_save = move |_| {
                let saved_anns = annotations.get();
                let target = target_node_id_save.clone();
                store.nodes.update(|list| {
                    if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                        if is_group {
                            if let Ok(mut group_data) = serde_json::from_value::<ImageGroupNodeData>(n.data.clone()) {
                                let idx = group_data.active_image_index.min(group_data.images.len().saturating_sub(1));
                                if let Some(img) = group_data.images.get_mut(idx) {
                                    img.annotations = Some(saved_anns.clone());
                                }
                                n.data = serde_json::to_value(group_data).unwrap_or(n.data.clone());
                            }
                        } else if let Ok(mut img_data) = serde_json::from_value::<ImageNodeData>(n.data.clone()) {
                            if let Some(ref mut imgs) = img_data.images {
                                let idx = img_data.active_image_index.unwrap_or(0).min(imgs.len().saturating_sub(1));
                                if let Some(img) = imgs.get_mut(idx) {
                                    img.annotations = Some(saved_anns.clone());
                                }
                            }
                            img_data.annotations = Some(saved_anns.clone());
                            n.data = serde_json::to_value(img_data).unwrap_or(n.data.clone());
                        }
                    }
                });
                store.annotating_node_id.set(None);
                loaded_node_id.set(None);
            };

            let handle_mouse_down = move |e: web_sys::MouseEvent| {
                let rect_width = 800.0;
                let rect_height = 480.0;
                let scale_x = rect_width / 800.0;
                let scale_y = rect_height / 480.0;
                let x = (e.offset_x() as f64 * scale_x).clamp(0.0, 800.0);
                let y = (e.offset_y() as f64 * scale_y).clamp(0.0, 480.0);

                let tool = active_tool.get();
                if tool == AnnotationTool::Text {
                    text_prompt_pos.set(Some((x, y)));
                    text_input_val.set(String::new());
                    return;
                }

                is_drawing.set(true);
                start_point.set(Some((x, y)));

                let ann_id = format!("ann-{}", js_sys::Date::now() as u64);
                let color = active_color.get();

                if tool == AnnotationTool::Brush {
                    current_draft.set(Some(AnnotationItem {
                        id: ann_id,
                        tool,
                        color,
                        stroke_width,
                        points: Some(vec![x, y]),
                        x: None,
                        y: None,
                        width: None,
                        height: None,
                        end_x: None,
                        end_y: None,
                        text: None,
                    }));
                } else {
                    current_draft.set(Some(AnnotationItem {
                        id: ann_id,
                        tool,
                        color,
                        stroke_width,
                        points: None,
                        x: Some(x),
                        y: Some(y),
                        width: Some(0.0),
                        height: Some(0.0),
                        end_x: Some(x),
                        end_y: Some(y),
                        text: None,
                    }));
                }
            };

            let handle_mouse_move = move |e: web_sys::MouseEvent| {
                if !is_drawing.get() { return; }
                let (sx, sy) = match start_point.get() {
                    Some(pt) => pt,
                    None => return,
                };

                let x = (e.offset_x() as f64).clamp(0.0, 800.0);
                let y = (e.offset_y() as f64).clamp(0.0, 480.0);
                let tool = active_tool.get();

                if let Some(mut draft) = current_draft.get() {
                    if tool == AnnotationTool::Brush {
                        if let Some(ref mut pts) = draft.points {
                            pts.push(x);
                            pts.push(y);
                        }
                    } else if tool == AnnotationTool::Arrow {
                        draft.end_x = Some(x);
                        draft.end_y = Some(y);
                    } else if tool == AnnotationTool::Circle || tool == AnnotationTool::Rect {
                        draft.x = Some(sx.min(x));
                        draft.y = Some(sy.min(y));
                        draft.width = Some((x - sx).abs());
                        draft.height = Some((y - sy).abs());
                    }
                    current_draft.set(Some(draft));
                }
            };

            let handle_mouse_up = move |_| {
                if is_drawing.get() {
                    if let Some(draft) = current_draft.get() {
                        let valid = match draft.tool {
                            AnnotationTool::Brush => draft.points.as_ref().map(|p| p.len() > 2).unwrap_or(false),
                            AnnotationTool::Arrow => draft.x != draft.end_x || draft.y != draft.end_y,
                            AnnotationTool::Circle | AnnotationTool::Rect => draft.width.unwrap_or(0.0) > 4.0,
                            _ => true,
                        };
                        if valid {
                            annotations.update(|list| list.push(draft));
                        }
                    }
                }
                is_drawing.set(false);
                start_point.set(None);
                current_draft.set(None);
            };

            let handle_confirm_text = move |_| {
                if let Some((x, y)) = text_prompt_pos.get() {
                    let val = text_input_val.get().trim().to_string();
                    if !val.is_empty() {
                        let text_item = AnnotationItem {
                            id: format!("ann-{}", js_sys::Date::now() as u64),
                            tool: AnnotationTool::Text,
                            color: active_color.get(),
                            stroke_width,
                            points: None,
                            x: Some(x),
                            y: Some(y),
                            width: None,
                            height: None,
                            end_x: None,
                            end_y: None,
                            text: Some(val),
                        };
                        annotations.update(|list| list.push(text_item));
                    }
                }
                text_prompt_pos.set(None);
                text_input_val.set(String::new());
            };

            view! {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div class="w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                        // Header
                        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                            <div>
                                <h2 class="text-sm font-semibold tracking-tight">"Anotações Visuais"</h2>
                                <p class="text-xs text-slate-500 dark:text-slate-400">
                                    "Desenhe setas, círculos e orientações diretamente sobre a captura"
                                </p>
                            </div>
                            <button
                                type="button"
                                on:click=close_modal
                                class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                            >
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Toolbar
                        <div class="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            // Tool buttons
                            <div class="flex items-center gap-1.5">
                                {tools.clone().into_iter().map(|(tool_id, label)| {
                                    let is_active = active_tool.get() == tool_id;
                                    view! {
                                        <button
                                            type="button"
                                            on:click=move |_| active_tool.set(tool_id)
                                            title=label
                                            class=format!(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer {}",
                                                if is_active {
                                                    "bg-rose-600 text-white shadow-xs"
                                                } else {
                                                    "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                                                }
                                            )
                                        >
                                            <span>{label}</span>
                                        </button>
                                    }
                                }).collect_view()}
                            </div>

                            // Colors & Actions
                            <div class="flex items-center gap-4">
                                // Color swatches
                                <div class="flex items-center gap-1.5">
                                    {color_palette.clone().into_iter().map(|(c_label, c_hex)| {
                                        let is_sel = active_color.get() == c_hex;
                                        let hex = c_hex.to_string();
                                        view! {
                                            <button
                                                type="button"
                                                on:click=move |_| active_color.set(hex.clone())
                                                title=c_label
                                                class=format!(
                                                    "w-6 h-6 rounded-full transition-transform cursor-pointer {}",
                                                    if is_sel {
                                                        "scale-125 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900"
                                                    } else {
                                                        "hover:scale-110"
                                                    }
                                                )
                                                style=format!("background-color: {};", c_hex)
                                            />
                                        }
                                    }).collect_view()}
                                </div>

                                <div class="h-5 w-px bg-slate-300 dark:bg-slate-700" />

                                // Undo & Clear
                                <div class="flex items-center gap-1">
                                    <button
                                        type="button"
                                        on:click=move |_| annotations.update(|list| { list.pop(); })
                                        disabled=move || annotations.get().is_empty()
                                        title="Desfazer"
                                        class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="9 14 4 9 9 4" />
                                            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        on:click=move |_| annotations.set(vec![])
                                        disabled=move || annotations.get().is_empty()
                                        title="Limpar Tudo"
                                        class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        // Canvas Area
                        <div class="relative w-full h-[480px] bg-slate-950 flex items-center justify-center overflow-hidden select-none p-4">
                            {if !image_url.is_empty() {
                                view! {
                                    <div class="relative max-w-full max-h-full flex items-center justify-center">
                                        <img
                                            src=image_url.clone()
                                            alt=image_name.clone()
                                            class="max-w-full max-h-[448px] w-auto h-auto object-contain pointer-events-none block select-none rounded-xs"
                                        />

                                        // Interactive SVG Overlay
                                        <svg
                                            class="absolute inset-0 w-full h-full cursor-crosshair"
                                            viewBox="0 0 800 480"
                                            preserveAspectRatio="none"
                                            on:mousedown=handle_mouse_down
                                            on:mousemove=handle_mouse_move
                                            on:mouseup=handle_mouse_up
                                        >
                                            <defs>
                                                <marker
                                                    id="modal-arrow-head"
                                                    markerWidth="8"
                                                    markerHeight="8"
                                                    refX="6"
                                                    refY="3"
                                                    orient="auto"
                                                    markerUnits="strokeWidth"
                                                >
                                                    <path d="M0,0 L0,6 L7,3 z" fill="currentColor" />
                                                </marker>
                                            </defs>

                                            // Render confirmed annotations
                                            {move || {
                                                let anns = annotations.get();
                                                anns.iter().map(|ann| {
                                                    let color = ann.color.clone();
                                                    let stroke_width = ann.stroke_width;
                                                    match ann.tool {
                                                        AnnotationTool::Circle => {
                                                            let x = ann.x.unwrap_or(0.0);
                                                            let y = ann.y.unwrap_or(0.0);
                                                            let w = ann.width.unwrap_or(0.0);
                                                            let h = ann.height.unwrap_or(0.0);
                                                            view! {
                                                                <ellipse
                                                                    cx=x + w / 2.0
                                                                    cy=y + h / 2.0
                                                                    rx=(w / 2.0).abs()
                                                                    ry=(h / 2.0).abs()
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                />
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Rect => {
                                                            let x = ann.x.unwrap_or(0.0);
                                                            let y = ann.y.unwrap_or(0.0);
                                                            let w = ann.width.unwrap_or(0.0);
                                                            let h = ann.height.unwrap_or(0.0);
                                                            view! {
                                                                <rect
                                                                    x=x
                                                                    y=y
                                                                    width=w
                                                                    height=h
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                    rx="4"
                                                                />
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Arrow => {
                                                            let x = ann.x.unwrap_or(0.0);
                                                            let y = ann.y.unwrap_or(0.0);
                                                            let end_x = ann.end_x.unwrap_or(0.0);
                                                            let end_y = ann.end_y.unwrap_or(0.0);
                                                            view! {
                                                                <g style=format!("color: {}", color)>
                                                                    <line
                                                                        x1=x
                                                                        y1=y
                                                                        x2=end_x
                                                                        y2=end_y
                                                                        stroke=color
                                                                        stroke-width=stroke_width
                                                                        marker-end="url(#modal-arrow-head)"
                                                                    />
                                                                </g>
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Brush => {
                                                            let pts = ann.points.clone().unwrap_or_default();
                                                            let mut pairs = Vec::new();
                                                            let mut i = 0;
                                                            while i + 1 < pts.len() {
                                                                pairs.push(format!("{},{}", pts[i], pts[i+1]));
                                                                i += 2;
                                                            }
                                                            view! {
                                                                <polyline
                                                                    points=pairs.join(" ")
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                    stroke-linecap="round"
                                                                    stroke-linejoin="round"
                                                                />
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Text => {
                                                            let x = ann.x.unwrap_or(0.0);
                                                            let y = ann.y.unwrap_or(0.0);
                                                            let text = ann.text.clone().unwrap_or_default();
                                                            let w = text.len() as f64 * 9.0 + 12.0;
                                                            view! {
                                                                <g>
                                                                    <rect x=x - 6.0 y=y - 18.0 width=w height=24.0 fill="#000000" fill-opacity="0.8" rx="4" />
                                                                    <text x=x y=y fill=color font-size="14" font-weight="bold" font-family="sans-serif">{text}</text>
                                                                </g>
                                                            }.into_view()
                                                        }
                                                    }
                                                }).collect_view()
                                            }}

                                            // Render current active draft
                                            {move || {
                                                if let Some(ref draft) = current_draft.get() {
                                                    let color = draft.color.clone();
                                                    let stroke_width = draft.stroke_width;
                                                    match draft.tool {
                                                        AnnotationTool::Circle => {
                                                            let x = draft.x.unwrap_or(0.0);
                                                            let y = draft.y.unwrap_or(0.0);
                                                            let w = draft.width.unwrap_or(0.0);
                                                            let h = draft.height.unwrap_or(0.0);
                                                            view! {
                                                                <ellipse
                                                                    cx=x + w / 2.0
                                                                    cy=y + h / 2.0
                                                                    rx=(w / 2.0).abs()
                                                                    ry=(h / 2.0).abs()
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                    stroke-dasharray="4 4"
                                                                />
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Rect => {
                                                            let x = draft.x.unwrap_or(0.0);
                                                            let y = draft.y.unwrap_or(0.0);
                                                            let w = draft.width.unwrap_or(0.0);
                                                            let h = draft.height.unwrap_or(0.0);
                                                            view! {
                                                                <rect
                                                                    x=x
                                                                    y=y
                                                                    width=w
                                                                    height=h
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                    stroke-dasharray="4 4"
                                                                    rx="4"
                                                                />
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Arrow => {
                                                            let x = draft.x.unwrap_or(0.0);
                                                            let y = draft.y.unwrap_or(0.0);
                                                            let end_x = draft.end_x.unwrap_or(0.0);
                                                            let end_y = draft.end_y.unwrap_or(0.0);
                                                            view! {
                                                                <g style=format!("color: {}", color)>
                                                                    <line
                                                                        x1=x
                                                                        y1=y
                                                                        x2=end_x
                                                                        y2=end_y
                                                                        stroke=color
                                                                        stroke-width=stroke_width
                                                                        marker-end="url(#modal-arrow-head)"
                                                                    />
                                                                </g>
                                                            }.into_view()
                                                        }
                                                        AnnotationTool::Brush => {
                                                            let pts = draft.points.clone().unwrap_or_default();
                                                            let mut pairs = Vec::new();
                                                            let mut i = 0;
                                                            while i + 1 < pts.len() {
                                                                pairs.push(format!("{},{}", pts[i], pts[i+1]));
                                                                i += 2;
                                                            }
                                                            view! {
                                                                <polyline
                                                                    points=pairs.join(" ")
                                                                    fill="none"
                                                                    stroke=color
                                                                    stroke-width=stroke_width
                                                                    stroke-linecap="round"
                                                                    stroke-linejoin="round"
                                                                />
                                                            }.into_view()
                                                        }
                                                        _ => view! { <g></g> }.into_view(),
                                                    }
                                                } else {
                                                    view! { <g></g> }.into_view()
                                                }
                                            }}
                                        </svg>

                                        // Text Input Prompt overlay
                                        {move || {
                                            if let Some((tx, ty)) = text_prompt_pos.get() {
                                                view! {
                                                    <div
                                                        class="absolute z-20 bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-xl flex items-center gap-2"
                                                        style=format!("left: {}%; top: {}%; transform: translate(-10%, -50%);", (tx / 800.0) * 100.0, (ty / 480.0) * 100.0)
                                                    >
                                                        <input
                                                            type="text"
                                                            autofocus
                                                            prop:value=text_input_val.get()
                                                            on:input=move |e| text_input_val.set(event_target_value(&e))
                                                            placeholder="Digitar legenda..."
                                                            class="text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-hidden focus:border-rose-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            on:click=handle_confirm_text
                                                            class="px-2 py-1 rounded text-xs bg-rose-600 text-white font-medium hover:bg-rose-500 cursor-pointer"
                                                        >
                                                            "OK"
                                                        </button>
                                                        <button
                                                            type="button"
                                                            on:click=move |_| text_prompt_pos.set(None)
                                                            class="text-slate-400 hover:text-white cursor-pointer"
                                                        >
                                                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <path d="M18 6 6 18" />
                                                                <path d="m6 6 12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                }.into_view()
                                            } else {
                                                view! { <span></span> }.into_view()
                                            }
                                        }}
                                    </div>
                                }.into_view()
                            } else {
                                view! {
                                    <div class="text-slate-500 text-sm">"Nenhuma imagem carregada para anotação"</div>
                                }.into_view()
                            }}
                        </div>

                        // Footer
                        <div class="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            <span class="text-xs text-slate-500">
                                {move || annotations.get().len()} " anotação(ões) registrada(s)"
                            </span>
                            <div class="flex items-center gap-3">
                                <button
                                    type="button"
                                    on:click=close_modal
                                    class="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                    "Cancelar"
                                </button>
                                <button
                                    type="button"
                                    on:click=handle_save
                                    class="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-md cursor-pointer"
                                >
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                        <polyline points="17 21 17 13 7 13 7 21" />
                                        <polyline points="7 3 7 8 15 8" />
                                    </svg>
                                    <span>"Salvar Anotações"</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            }.into_view()
        }}
    }
}

// =============================================================================
// 2. MemoryExplorerModalView
// =============================================================================
#[component]
fn MemoryExplorerModalView() -> impl IntoView {
    let store = use_canvas_store();
    let view_mode = create_rw_signal("notes".to_string());
    let active_scope = create_rw_signal("all".to_string());
    let active_type = create_rw_signal("all".to_string());
    let search_query = create_rw_signal(String::new());
    let toast_msg = create_rw_signal::<Option<String>>(None);

    let is_creating = create_rw_signal(false);
    let new_title = create_rw_signal(String::new());
    let new_content = create_rw_signal(String::new());
    let new_type = create_rw_signal("knowledge".to_string());
    let new_scope = create_rw_signal("project".to_string());

    // Sample notes list
    let notes = create_rw_signal(vec![
        NoteItem {
            id: "adr-001-rust-wasm".into(),
            title: "ADR-001: Refatoração 100% Rust WASM e Leptos CSR".into(),
            note_type: "decision".into(),
            scope: "project".into(),
            relative_path: "decisions/adr-001.md".into(),
            full_path: "/home/antigravity/CaioFelipe/CGLI/.cgli/vault/decisions/adr-001.md".into(),
            snippet: Some("Decisão arquitetural de migrar a interface Tauri para Leptos WASM e Rust nativo.".into()),
            tags: vec!["adr".into(), "architecture".into(), "rust".into()],
            author: "claude-code".into(),
            created: "2026-11-10 10:00".into(),
            updated: "2026-11-10 10:00".into(),
            rev: 1,
            etag: "etag-1".into(),
            content: "# ADR-001: Refatoração 100% Rust WASM\n\nAdotamos Leptos CSR para o canvas reativo.".into(),
        },
        NoteItem {
            id: "learning-conventions".into(),
            title: "Convenção de Branches e Git Push Automático".into(),
            note_type: "learning".into(),
            scope: "global".into(),
            relative_path: "learnings/git-push.md".into(),
            full_path: "/home/antigravity/.cgli/vault/learnings/git-push.md".into(),
            snippet: Some("Sempre que concluir alterações em um projeto, faça git commit e git push automaticamente.".into()),
            tags: vec!["git".into(), "workflow".into()],
            author: "agy".into(),
            created: "2026-11-09 14:00".into(),
            updated: "2026-11-09 14:00".into(),
            rev: 1,
            etag: "etag-2".into(),
            content: "# Regras Globais\n\n- Git commit e push automáticos após cada alteração.".into(),
        },
    ]);

    let handle_spawn_to_canvas = move |note: NoteItem| {
        let timestamp = js_sys::Date::now() as u64;
        let node_id = format!("memory-{}-{}", note.note_type, timestamp);
        let current_nodes = store.nodes.get();
        let offset = current_nodes.len() as f64;

        let mem_data = MemoryNodeData {
            id: Some(note.id.clone()),
            title: note.title.clone(),
            note_type: note.note_type.clone(),
            scope: note.scope.clone(),
            content: note.content.clone(),
            tags: Some(note.tags.clone()),
            author: Some(note.author.clone()),
            created: Some(note.created.clone()),
            relative_path: Some(note.relative_path.clone()),
            full_path: Some(note.full_path.clone()),
            parent_agent_id: None,
        };

        let new_node = CanvasNode {
            id: node_id,
            node_type: "memoryNode".into(),
            position: Position2D {
                x: 250.0 + offset * 25.0,
                y: 180.0 + offset * 20.0,
            },
            style: NodeStyle {
                width: Some(420.0),
                height: Some(320.0),
                z_index: None,
            },
            selected: true,
            data: serde_json::to_value(mem_data).unwrap_or(json!({})),
        };

        store.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                n.selected = false;
            }
            nodes.push(new_node);
        });
        store.is_memory_explorer_open.set(false);
    };

    let handle_create_note = move |_| {
        let t = new_title.get().trim().to_string();
        let c = new_content.get().trim().to_string();
        if t.is_empty() { return; }

        let n = NoteItem {
            id: format!("note-{}", js_sys::Date::now() as u64),
            title: t.clone(),
            note_type: new_type.get(),
            scope: new_scope.get(),
            relative_path: format!("{}/{}.md", new_type.get(), t.to_lowercase().replace(' ', "-")),
            full_path: "".into(),
            snippet: Some(c.chars().take(80).collect()),
            tags: vec![],
            author: "user".into(),
            created: "Hoje".into(),
            updated: "Hoje".into(),
            rev: 1,
            etag: "".into(),
            content: c,
        };

        notes.update(|list| list.insert(0, n));
        new_title.set(String::new());
        new_content.set(String::new());
        is_creating.set(false);
    };

    view! {
        {move || {
            if !store.is_memory_explorer_open.get() {
                return view! { <span class="hidden"></span> }.into_view();
            }

            view! {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div class="w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-h-[90vh]">
                        // Modal Header
                        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                            <div class="flex items-center gap-2.5">
                                <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
                                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 class="text-sm font-semibold tracking-tight">"Explorador de Memória Compartilhada (Obsidian)"</h2>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">
                                        "Decisões (ADR), regras, tarefas e mapas de conteúdo persistentes"
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                on:click=move |_| store.is_memory_explorer_open.set(false)
                                class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                            >
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Navigation Tabs (Notas / MOC / Memory Doctor)
                        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6">
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    on:click=move |_| view_mode.set("notes".to_string())
                                    class=format!(
                                        "py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer {}",
                                        if view_mode.get() == "notes" {
                                            "border-purple-500 text-purple-600 dark:text-purple-400"
                                        } else {
                                            "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                        }
                                    )
                                >
                                    "Notas"
                                </button>
                                <button
                                    type="button"
                                    on:click=move |_| view_mode.set("moc".to_string())
                                    class=format!(
                                        "py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer {}",
                                        if view_mode.get() == "moc" {
                                            "border-purple-500 text-purple-600 dark:text-purple-400"
                                        } else {
                                            "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                        }
                                    )
                                >
                                    "Mapa de Conteúdo (MOC)"
                                </button>
                                <button
                                    type="button"
                                    on:click=move |_| view_mode.set("doctor".to_string())
                                    class=format!(
                                        "py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer {}",
                                        if view_mode.get() == "doctor" {
                                            "border-purple-500 text-purple-600 dark:text-purple-400"
                                        } else {
                                            "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                        }
                                    )
                                >
                                    "Memory Doctor"
                                </button>
                            </div>

                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    on:click=move |_| {
                                        toast_msg.set(Some("Compactação de journals realizada com sucesso!".into()));
                                    }
                                    class="text-xs px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors cursor-pointer"
                                >
                                    "Compactar Journals"
                                </button>
                                <button
                                    type="button"
                                    on:click=move |_| is_creating.update(|v| *v = !*v)
                                    class="text-xs px-3 py-1 rounded-md bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors cursor-pointer"
                                >
                                    "+ Nova Nota"
                                </button>
                            </div>
                        </div>

                        // Content Body
                        <div class="p-6 overflow-y-auto flex-1">
                            {move || {
                                match view_mode.get().as_str() {
                                    "moc" => view! {
                                        <div class="space-y-4">
                                            <div class="flex items-center justify-between border-b pb-2">
                                                <h3 class="font-bold text-xs uppercase text-slate-400 tracking-wider">"Índice de Conhecimento Estruturado"</h3>
                                                <button
                                                    type="button"
                                                    on:click=move |_| toast_msg.set(Some("MOC regenerado com sucesso!".into()))
                                                    class="text-xs text-purple-400 hover:underline cursor-pointer"
                                                >
                                                    "Regenerar MOC"
                                                </button>
                                            </div>
                                            <div class="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                                                <MarkdownView content="# Mapa de Conteúdo (MOC)\n\n## Decisões (ADRs)\n- [[adr-001-rust-wasm|ADR-001: Refatoração 100% Rust WASM e Leptos CSR]]\n\n## Aprendizados Globais\n- [[learning-conventions|Convenção de Branches e Git Push Automático]]".to_string() />
                                            </div>
                                        </div>
                                    }.into_view(),

                                    "doctor" => view! {
                                        <div class="space-y-4">
                                            <div class="grid grid-cols-4 gap-3">
                                                <div class="p-3 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-center">
                                                    <span class="text-[10px] text-slate-400 uppercase font-semibold">"Total de Notas"</span>
                                                    <span class="text-lg font-bold block mt-1 text-purple-400">"14"</span>
                                                </div>
                                                <div class="p-3 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-center">
                                                    <span class="text-[10px] text-slate-400 uppercase font-semibold">"Journals"</span>
                                                    <span class="text-lg font-bold block mt-1 text-indigo-400">"8"</span>
                                                </div>
                                                <div class="p-3 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-center">
                                                    <span class="text-[10px] text-slate-400 uppercase font-semibold">"Tokens Est."</span>
                                                    <span class="text-lg font-bold block mt-1 text-emerald-400">"4.2k"</span>
                                                </div>
                                                <div class="p-3 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-center">
                                                    <span class="text-[10px] text-slate-400 uppercase font-semibold">"Saúde"</span>
                                                    <span class="text-lg font-bold block mt-1 text-emerald-500">"100% OK"</span>
                                                </div>
                                            </div>

                                            <div class="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 flex items-center gap-3">
                                                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                    <polyline points="22 4 12 14.01 9 11.01" />
                                                </svg>
                                                <span class="text-xs font-medium">"Vault saudável: Sem links quebrados ou notas órfãs detectadas."</span>
                                            </div>
                                        </div>
                                    }.into_view(),

                                    _ => view! {
                                        <div class="space-y-4">
                                            // Search & Filters bar
                                            <div class="flex items-center gap-3">
                                                <div class="relative flex-1">
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar por título, tag ou conteúdo..."
                                                        prop:value=search_query.get()
                                                        on:input=move |e| search_query.set(event_target_value(&e))
                                                        class="w-full text-xs rounded-lg pl-8 pr-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden"
                                                    />
                                                    <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <circle cx="11" cy="11" r="8" />
                                                        <path d="m21 21-4.3-4.3" />
                                                    </svg>
                                                </div>

                                                // Scope filter
                                                <select
                                                    on:change=move |e| active_scope.set(event_target_value(&e))
                                                    class="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 font-medium"
                                                >
                                                    <option value="all">"Todos os Escopos"</option>
                                                    <option value="project">"Vault Local (Projeto)"</option>
                                                    <option value="global">"Vault Global"</option>
                                                </select>

                                                // Type filter
                                                <select
                                                    on:change=move |e| active_type.set(event_target_value(&e))
                                                    class="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 font-medium"
                                                >
                                                    <option value="all">"Todos os Tipos"</option>
                                                    <option value="decision">"Decisões (ADR)"</option>
                                                    <option value="learning">"Aprendizados"</option>
                                                    <option value="knowledge">"Conhecimento"</option>
                                                    <option value="rule">"Regras"</option>
                                                    <option value="task">"Tarefas"</option>
                                                </select>
                                            </div>

                                            // Form to create note
                                            {if is_creating.get() {
                                                view! {
                                                    <div class="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3">
                                                        <h4 class="text-xs font-bold text-purple-400">"Criar Nova Nota de Memória"</h4>
                                                        <input
                                                            type="text"
                                                            placeholder="Título da nota (Ex: Arquitetura de Cache)"
                                                            prop:value=new_title.get()
                                                            on:input=move |e| new_title.set(event_target_value(&e))
                                                            class="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                                        />
                                                        <textarea
                                                            placeholder="Conteúdo em Markdown..."
                                                            prop:value=new_content.get()
                                                            on:input=move |e| new_content.set(event_target_value(&e))
                                                            rows=3
                                                            class="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                                        />
                                                        <div class="flex items-center justify-between">
                                                            <div class="flex items-center gap-2">
                                                                <select
                                                                    on:change=move |e| new_type.set(event_target_value(&e))
                                                                    class="text-xs bg-white dark:bg-slate-900 border rounded px-2 py-1"
                                                                >
                                                                    <option value="decision">"Decisão"</option>
                                                                    <option value="learning">"Aprendizado"</option>
                                                                    <option value="knowledge">"Conhecimento"</option>
                                                                    <option value="rule">"Regra"</option>
                                                                </select>
                                                                <select
                                                                    on:change=move |e| new_scope.set(event_target_value(&e))
                                                                    class="text-xs bg-white dark:bg-slate-900 border rounded px-2 py-1"
                                                                >
                                                                    <option value="project">"Local"</option>
                                                                    <option value="global">"Global"</option>
                                                                </select>
                                                            </div>
                                                            <div class="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    on:click=move |_| is_creating.set(false)
                                                                    class="text-xs px-3 py-1 text-slate-400 hover:text-white"
                                                                >
                                                                    "Cancelar"
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    on:click=handle_create_note
                                                                    class="text-xs px-3 py-1 font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-500"
                                                                >
                                                                    "Salvar Nota"
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                }.into_view()
                                            } else {
                                                view! { <span></span> }.into_view()
                                            }}

                                            // Notes list
                                            <div class="space-y-2.5">
                                                {move || {
                                                    let query = search_query.get().to_lowercase();
                                                    let scope_f = active_scope.get();
                                                    let type_f = active_type.get();

                                                    let filtered: Vec<NoteItem> = notes.get().into_iter().filter(|n| {
                                                        let matches_query = query.is_empty()
                                                            || n.title.to_lowercase().contains(&query)
                                                            || n.content.to_lowercase().contains(&query);
                                                        let matches_scope = scope_f == "all" || n.scope == scope_f;
                                                        let matches_type = type_f == "all" || n.note_type == type_f;
                                                        matches_query && matches_scope && matches_type
                                                    }).collect();

                                                    filtered.into_iter().map(|note| {
                                                        let n_send = note.clone();
                                                        let is_glob = note.scope == "global";
                                                        view! {
                                                            <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700">
                                                                <div class="min-w-0 flex-1 mr-3">
                                                                    <div class="flex items-center gap-2 mb-1">
                                                                        <span class=format!(
                                                                            "text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold {}",
                                                                            if is_glob { "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" } else { "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" }
                                                                        )>
                                                                            {if is_glob { "Global" } else { "Local" }}
                                                                        </span>
                                                                        <span class="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                                                                            {note.note_type}
                                                                        </span>
                                                                        <h4 class="font-semibold text-xs truncate">{note.title}</h4>
                                                                    </div>
                                                                    <p class="text-[11px] text-slate-400 line-clamp-1">{note.snippet.unwrap_or_default()}</p>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    on:click=move |_| handle_spawn_to_canvas(n_send.clone())
                                                                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors shrink-0 cursor-pointer"
                                                                >
                                                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                        <path d="M5 12h14" />
                                                                        <path d="m12 5 7 7-7 7" />
                                                                    </svg>
                                                                    <span>"Enviar ao Canvas"</span>
                                                                </button>
                                                            </div>
                                                        }
                                                    }).collect_view()
                                                }}
                                            </div>
                                        </div>
                                    }.into_view(),
                                }
                            }}
                        </div>
                    </div>
                </div>
            }.into_view()
        }}
    }
}

// =============================================================================
// 3. SettingsModalView
// =============================================================================
#[component]
fn SettingsModalView() -> impl IntoView {
    let store = use_canvas_store();
    let settings_tab = create_rw_signal(0);

    // New CLI state
    let new_cli_name = create_rw_signal(String::new());
    let new_cli_binary = create_rw_signal(String::new());
    let new_cli_args = create_rw_signal(String::new());
    let new_cli_role = create_rw_signal(AgentRole::Executor);
    let new_cli_color = create_rw_signal("#8B5CF6".to_string());

    // New Skill state
    let is_adding_skill = create_rw_signal(false);
    let new_skill_name = create_rw_signal(String::new());
    let new_skill_desc = create_rw_signal(String::new());
    let new_skill_cat = create_rw_signal("Geral".to_string());

    let tabs = vec![
        (0, "CLIs & Contas"),
        (1, "Papéis dos Nós"),
        (2, "Adicionar CLI"),
        (3, "Hub de Skills"),
    ];

    let handle_create_cli = move |_| {
        let name = new_cli_name.get().trim().to_string();
        let binary = new_cli_binary.get().trim().to_string();
        if name.is_empty() || binary.is_empty() { return; }

        let cli = CliConfig {
            id: format!("cli-{}", js_sys::Date::now() as u64),
            name,
            binary,
            color: new_cli_color.get(),
            active: true,
            role: new_cli_role.get(),
            connected_account: Some(ConnectedAccount {
                email: Some("local@device".into()),
                status: "connected".into(),
                token_or_key: None,
            }),
            default_args: new_cli_args.get().trim().to_string(),
        };

        store.clis.update(|list| list.push(cli));
        new_cli_name.set(String::new());
        new_cli_binary.set(String::new());
        new_cli_args.set(String::new());
        settings_tab.set(0);
    };

    let handle_create_skill = move |_| {
        let name = new_skill_name.get().trim().to_string();
        let desc = new_skill_desc.get().trim().to_string();
        if name.is_empty() || desc.is_empty() { return; }

        let skill = SkillItem {
            id: format!("skill-{}", js_sys::Date::now() as u64),
            name,
            description: desc,
            enabled: true,
            category: new_skill_cat.get(),
            path: "".into(),
            content: "".into(),
        };

        store.skills.update(|list| list.push(skill));
        new_skill_name.set(String::new());
        new_skill_desc.set(String::new());
        is_adding_skill.set(false);
    };

    view! {
        {move || {
            if !store.is_settings_open.get() {
                return view! { <span class="hidden"></span> }.into_view();
            }

            view! {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div class="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                        // Header
                        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                            <div class="flex items-center gap-2.5">
                                <div class="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center font-bold">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="4" y1="21" x2="4" y2="14" />
                                        <line x1="4" y1="10" x2="4" y2="3" />
                                        <line x1="12" y1="21" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12" y2="3" />
                                        <line x1="20" y1="21" x2="20" y2="16" />
                                        <line x1="20" y1="12" x2="20" y2="3" />
                                        <line x1="1" y1="14" x2="7" y2="14" />
                                        <line x1="9" y1="8" x2="15" y2="8" />
                                        <line x1="17" y1="16" x2="23" y2="16" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 class="text-sm font-semibold tracking-tight">"Preferências do Estúdio"</h2>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">
                                        "Gerencie executáveis CLI, contas autenticadas e skills globais"
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                on:click=move |_| store.is_settings_open.set(false)
                                class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                            >
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Tabs
                        <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6">
                            {tabs.clone().into_iter().map(|(id, label)| {
                                let is_active = settings_tab.get() == id;
                                view! {
                                    <button
                                        type="button"
                                        on:click=move |_| settings_tab.set(id)
                                        class=format!(
                                            "flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer {}",
                                            if is_active {
                                                "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                                            } else {
                                                "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                                            }
                                        )
                                    >
                                        <span>{label}</span>
                                    </button>
                                }
                            }).collect_view()}
                        </div>

                        // Body
                        <div class="p-6 overflow-y-auto max-h-[460px]">
                            {move || match settings_tab.get() {
                                0 => view! {
                                    <div class="space-y-4">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-xs font-medium text-slate-500">"CLIs configurados para orquestração"</span>
                                            <button
                                                type="button"
                                                on:click=move |_| settings_tab.set(2)
                                                class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                                            >
                                                <span>"+ Adicionar CLI"</span>
                                            </button>
                                        </div>

                                        {store.clis.get().into_iter().map(|cli| {
                                            let cli_id_toggle = cli.id.clone();
                                            let cli_id_auth = cli.id.clone();
                                            let is_act = cli.active;
                                            let is_conn = cli.connected_account.as_ref().map(|a| a.status == "connected").unwrap_or(false);
                                            let name_prefix: String = cli.name.chars().take(2).collect();

                                            view! {
                                                <div class="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                                                    <div class="flex items-center justify-between mb-3">
                                                        <div class="flex items-center gap-2.5">
                                                            <div
                                                                class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                                                                style=format!("background-color: {}20; color: {};", cli.color, cli.color)
                                                            >
                                                                {name_prefix.to_uppercase()}
                                                            </div>
                                                            <div>
                                                                <div class="flex items-center gap-2">
                                                                    <span class="font-semibold text-xs">{cli.name}</span>
                                                                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                                        {cli.binary}
                                                                    </span>
                                                                </div>
                                                                <span class="text-[11px] text-slate-400">
                                                                    {cli.connected_account.as_ref().and_then(|a| a.email.clone()).unwrap_or_else(|| "Nenhuma conta vinculada".into())}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        // Toggle active
                                                        <button
                                                            type="button"
                                                            on:click=move |_| {
                                                                let target = cli_id_toggle.clone();
                                                                store.clis.update(|list| {
                                                                    if let Some(c) = list.iter_mut().find(|c| c.id == target) {
                                                                        c.active = !c.active;
                                                                    }
                                                                });
                                                            }
                                                            class=format!(
                                                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer {}",
                                                                if is_act { "bg-emerald-600" } else { "bg-slate-300 dark:bg-slate-700" }
                                                            )
                                                        >
                                                            <span class=format!(
                                                                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform {}",
                                                                if is_act { "translate-x-4.5" } else { "translate-x-1" }
                                                            ) />
                                                        </button>
                                                    </div>

                                                    <div class="flex items-center justify-between pt-3 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                                                        <span class="text-slate-500">"Args: " <code class="font-mono text-[11px]">{cli.default_args}</code></span>
                                                        <button
                                                            type="button"
                                                            on:click=move |_| {
                                                                let target = cli_id_auth.clone();
                                                                store.clis.update(|list| {
                                                                    if let Some(c) = list.iter_mut().find(|c| c.id == target) {
                                                                        let next_status = if is_conn { "disconnected" } else { "connected" };
                                                                        if let Some(ref mut acc) = c.connected_account {
                                                                            acc.status = next_status.into();
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                            class=format!(
                                                                "px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer {}",
                                                                if is_conn {
                                                                    "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30"
                                                                } else {
                                                                    "bg-emerald-600 text-white hover:bg-emerald-500"
                                                                }
                                                            )
                                                        >
                                                            {if is_conn { "Desconectar" } else { "Conectar" }}
                                                        </button>
                                                    </div>
                                                </div>
                                            }
                                        }).collect_view()}
                                    </div>
                                }.into_view(),

                                1 => view! {
                                    <div class="space-y-4">
                                        <p class="text-xs text-slate-500 leading-relaxed">
                                            "Defina o comportamento padrão de cada agente no canvas ao iniciar fluxos de trabalho."
                                        </p>
                                        {store.clis.get().into_iter().map(|cli| {
                                            let cli_id_role = cli.id.clone();
                                            let role_val = cli.role;
                                            view! {
                                                <div class="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                                    <div>
                                                        <span class="font-semibold text-xs block">{cli.name}</span>
                                                        <span class="text-[11px] text-slate-400">
                                                            {if role_val == AgentRole::Planner {
                                                                "Focado em especificação, requisitos e planos"
                                                            } else {
                                                                "Focado em execução, patches de código e testes"
                                                            }}
                                                        </span>
                                                    </div>

                                                    <select
                                                        prop:value=role_val.as_str()
                                                        on:change=move |e| {
                                                            let val = event_target_value(&e);
                                                            let target = cli_id_role.clone();
                                                            store.clis.update(|list| {
                                                                if let Some(c) = list.iter_mut().find(|c| c.id == target) {
                                                                    c.role = if val == "planner" { AgentRole::Planner } else { AgentRole::Executor };
                                                                }
                                                            });
                                                        }
                                                        class="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium"
                                                    >
                                                        <option value="planner">"Planejador"</option>
                                                        <option value="executor">"Executor"</option>
                                                    </select>
                                                </div>
                                            }
                                        }).collect_view()}
                                    </div>
                                }.into_view(),

                                2 => view! {
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-xs font-semibold mb-1">"Nome do CLI"</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Claude Code, Antigravity, OpenCode"
                                                prop:value=new_cli_name.get()
                                                on:input=move |e| new_cli_name.set(event_target_value(&e))
                                                class="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                            />
                                        </div>

                                        <div class="grid grid-cols-2 gap-4">
                                            <div>
                                                <label class="block text-xs font-semibold mb-1">"Comando Executável"</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: claude, agy, codex"
                                                    prop:value=new_cli_binary.get()
                                                    on:input=move |e| new_cli_binary.set(event_target_value(&e))
                                                    class="w-full text-xs font-mono rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                                />
                                            </div>

                                            <div>
                                                <label class="block text-xs font-semibold mb-1">"Papel Inicial"</label>
                                                <select
                                                    on:change=move |e| {
                                                        let val = event_target_value(&e);
                                                        new_cli_role.set(if val == "planner" { AgentRole::Planner } else { AgentRole::Executor });
                                                    }
                                                    class="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                                >
                                                    <option value="planner">"Planejador"</option>
                                                    <option value="executor">"Executor"</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label class="block text-xs font-semibold mb-1">"Argumentos Padrão"</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: --stream --auto-approve"
                                                prop:value=new_cli_args.get()
                                                on:input=move |e| new_cli_args.set(event_target_value(&e))
                                                class="w-full text-xs font-mono rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                            />
                                        </div>

                                        <div class="pt-2 flex justify-end">
                                            <button
                                                type="button"
                                                on:click=handle_create_cli
                                                class="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md cursor-pointer"
                                            >
                                                "Cadastrar CLI"
                                            </button>
                                        </div>
                                    </div>
                                }.into_view(),

                                _ => view! {
                                    <div class="space-y-4">
                                        <div class="flex items-center justify-between">
                                            <span class="text-xs text-slate-500">"Skills disponíveis para os agentes do projeto"</span>
                                            <button
                                                type="button"
                                                on:click=move |_| is_adding_skill.update(|v| *v = !*v)
                                                class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                                            >
                                                <span>"+ Nova Skill"</span>
                                            </button>
                                        </div>

                                        {if is_adding_skill.get() {
                                            view! {
                                                <div class="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-3">
                                                    <h4 class="text-xs font-bold text-indigo-500">"Cadastrar Nova Skill"</h4>
                                                    <input
                                                        type="text"
                                                        placeholder="Nome da Skill"
                                                        prop:value=new_skill_name.get()
                                                        on:input=move |e| new_skill_name.set(event_target_value(&e))
                                                        class="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Descrição"
                                                        prop:value=new_skill_desc.get()
                                                        on:input=move |e| new_skill_desc.set(event_target_value(&e))
                                                        class="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border"
                                                    />
                                                    <div class="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            on:click=move |_| is_adding_skill.set(false)
                                                            class="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                                                        >
                                                            "Cancelar"
                                                        </button>
                                                        <button
                                                            type="button"
                                                            on:click=handle_create_skill
                                                            class="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 cursor-pointer"
                                                        >
                                                            "Salvar Skill"
                                                        </button>
                                                    </div>
                                                </div>
                                            }.into_view()
                                        } else {
                                            view! { <span></span> }.into_view()
                                        }}

                                        <div class="space-y-2.5">
                                            {store.skills.get().into_iter().map(|skill| {
                                                let s_id = skill.id.clone();
                                                let is_en = skill.enabled;
                                                view! {
                                                    <div class="p-3.5 rounded-xl border flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                                                        <div>
                                                            <div class="flex items-center gap-2">
                                                                <span class="font-semibold text-xs">{skill.name}</span>
                                                                <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">{skill.category}</span>
                                                            </div>
                                                            <p class="text-[11px] text-slate-400 mt-0.5">{skill.description}</p>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            on:click=move |_| {
                                                                let target = s_id.clone();
                                                                store.skills.update(|list| {
                                                                    if let Some(s) = list.iter_mut().find(|s| s.id == target) {
                                                                        s.enabled = !s.enabled;
                                                                    }
                                                                });
                                                            }
                                                            class=format!(
                                                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer {}",
                                                                if is_en { "bg-indigo-600" } else { "bg-slate-300 dark:bg-slate-700" }
                                                            )
                                                        >
                                                            <span class=format!(
                                                                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform {}",
                                                                if is_en { "translate-x-4.5" } else { "translate-x-1" }
                                                            ) />
                                                        </button>
                                                    </div>
                                                }
                                            }).collect_view()}
                                        </div>
                                    </div>
                                }.into_view(),
                            }}
                        </div>
                    </div>
                </div>
            }.into_view()
        }}
    }
}

// =============================================================================
// 4. NewProjectModalView
// =============================================================================
#[component]
fn NewProjectModalView() -> impl IntoView {
    let store = use_canvas_store();
    let project_name = create_rw_signal(String::new());
    let folders = create_rw_signal::<Vec<WorkspaceFolder>>(vec![]);
    let manual_name = create_rw_signal(String::new());
    let manual_path = create_rw_signal(String::new());
    let err_msg = create_rw_signal::<Option<String>>(None);

    let handle_add_manual = move |_| {
        let p = manual_path.get().trim().to_string();
        if p.is_empty() {
            err_msg.set(Some("Informe o caminho da pasta.".into()));
            return;
        }

        let name = if !manual_name.get().trim().is_empty() {
            manual_name.get().trim().to_string()
        } else {
            p.split(&['/', '\\'][..]).filter(|s| !s.is_empty()).last().unwrap_or("pasta").to_string()
        };

        folders.update(|list| {
            let is_primary = list.is_empty();
            list.push(WorkspaceFolder {
                id: format!("f-{}", js_sys::Date::now() as u64),
                name,
                path: p,
                is_primary: Some(is_primary),
            });
        });

        manual_name.set(String::new());
        manual_path.set(String::new());
        err_msg.set(None);
    };

    let handle_create = move |_| {
        let name = project_name.get().trim().to_string();
        if name.is_empty() {
            err_msg.set(Some("Defina um nome para o projeto.".into()));
            return;
        }

        let folder_list = folders.get();
        if folder_list.is_empty() {
            err_msg.set(Some("Adicione ao menos uma pasta ao projeto.".into()));
            return;
        }

        let new_id = format!("proj-{}", js_sys::Date::now() as u64);
        let primary_path = folder_list.first().map(|f| f.path.clone()).unwrap_or_default();

        let new_proj = ProjectInfo {
            id: new_id.clone(),
            name,
            path: primary_path,
            folders: folder_list,
            active_folder_id: None,
            created_at: Some(chrono::Local::now().to_rfc3339()),
            recent_projects: None,
        };

        store.projects.update(|list| list.push(new_proj));
        store.current_project_id.set(new_id);
        store.is_new_project_open.set(false);

        project_name.set(String::new());
        folders.set(vec![]);
        err_msg.set(None);
    };

    view! {
        {move || {
            if !store.is_new_project_open.get() {
                return view! { <span class="hidden"></span> }.into_view();
            }

            view! {
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 select-none">
                    <div class="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC]">
                        // Header
                        <div class="flex items-center justify-between px-6 py-4 border-b bg-slate-50 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#30363D]">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-500">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                                        <line x1="12" y1="10" x2="12" y2="16" />
                                        <line x1="9" y1="13" x2="15" y2="13" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 class="text-sm font-bold tracking-tight">"Criar Novo Projeto"</h2>
                                    <p class="text-xs text-slate-400">"Configure um workspace único ou multi-pastas"</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                on:click=move |_| store.is_new_project_open.set(false)
                                class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Body Form
                        <div class="p-6 overflow-y-auto flex-1 space-y-5">
                            {if let Some(ref msg) = err_msg.get() {
                                view! {
                                    <div class="p-3 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
                                        {msg}
                                    </div>
                                }.into_view()
                            } else {
                                view! { <span></span> }.into_view()
                            }}

                            <div>
                                <label class="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                                    "Nome do Projeto" <span class="text-rose-500">"*"</span>
                                </label>
                                <input
                                    type="text"
                                    autofocus
                                    placeholder="Ex: Plataforma E-Commerce, Microserviços API..."
                                    prop:value=project_name.get()
                                    on:input=move |e| project_name.set(event_target_value(&e))
                                    class="w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-[#161B22] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] focus:outline-hidden focus:border-indigo-500"
                                />
                            </div>

                            // Folder list
                            <div class="space-y-3">
                                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    "Pastas do Projeto"
                                </span>

                                <div class="space-y-2 max-h-40 overflow-y-auto">
                                    {folders.get().into_iter().enumerate().map(|(idx, f)| {
                                        let is_pri = f.is_primary.unwrap_or(idx == 0);
                                        view! {
                                            <div class="flex items-center justify-between p-2.5 rounded-xl border bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#30363D]">
                                                <div class="min-w-0 flex-1 mr-2">
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-xs font-semibold truncate">{f.name}</span>
                                                        {if is_pri {
                                                            view! {
                                                                <span class="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                                                    "Principal"
                                                                </span>
                                                            }.into_view()
                                                        } else {
                                                            view! { <span></span> }.into_view()
                                                        }}
                                                    </div>
                                                    <span class="text-[10px] text-slate-400 font-mono truncate block">{f.path}</span>
                                                </div>

                                                <button
                                                    type="button"
                                                    on:click=move |_| folders.update(|list| { list.retain(|item| item.id != f.id); })
                                                    class="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                                                >
                                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <path d="M3 6h18" />
                                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    </svg>
                                                </button>
                                            </div>
                                        }
                                    }).collect_view()}
                                </div>

                                // Add folder input
                                <div class="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Nome/Apelido"
                                        prop:value=manual_name.get()
                                        on:input=move |e| manual_name.set(event_target_value(&e))
                                        class="w-1/3 px-2.5 py-1.5 text-xs rounded-lg border bg-white dark:bg-[#161B22] border-slate-300 dark:border-[#30363D]"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Caminho absoluto..."
                                        prop:value=manual_path.get()
                                        on:input=move |e| manual_path.set(event_target_value(&e))
                                        class="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border bg-white dark:bg-[#161B22] border-slate-300 dark:border-[#30363D]"
                                    />
                                    <button
                                        type="button"
                                        on:click=handle_add_manual
                                        class="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 cursor-pointer shrink-0"
                                    >
                                        "+ Adicionar"
                                    </button>
                                </div>
                            </div>

                            <div class="pt-4 border-t flex justify-end gap-3">
                                <button
                                    type="button"
                                    on:click=move |_| store.is_new_project_open.set(false)
                                    class="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                                >
                                    "Cancelar"
                                </button>
                                <button
                                    type="button"
                                    on:click=handle_create
                                    class="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all shadow-md cursor-pointer"
                                >
                                    "Criar Projeto"
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            }.into_view()
        }}
    }
}

// =============================================================================
// 5. ManageWorkspaceModalView
// =============================================================================
#[component]
fn ManageWorkspaceModalView() -> impl IntoView {
    let store = use_canvas_store();
    let manual_name = create_rw_signal(String::new());
    let manual_path = create_rw_signal(String::new());

    let curr_id = store.current_project_id.get();
    let projects = store.projects.get();
    let _curr_proj = projects.into_iter().find(|p| p.id == curr_id);

    let handle_add_folder = move |_| {
        let p = manual_path.get().trim().to_string();
        if p.is_empty() { return; }

        let name = if !manual_name.get().trim().is_empty() {
            manual_name.get().trim().to_string()
        } else {
            p.split(&['/', '\\'][..]).filter(|s| !s.is_empty()).last().unwrap_or("pasta").to_string()
        };

        let target_id = store.current_project_id.get();
        store.projects.update(|list| {
            if let Some(proj) = list.iter_mut().find(|proj| proj.id == target_id) {
                let is_pri = proj.folders.is_empty();
                proj.folders.push(WorkspaceFolder {
                    id: format!("f-{}", js_sys::Date::now() as u64),
                    name,
                    path: p,
                    is_primary: Some(is_pri),
                });
            }
        });

        manual_name.set(String::new());
        manual_path.set(String::new());
    };

    view! {
        {move || {
            if !store.is_manage_workspace_open.get() {
                return view! { <span class="hidden"></span> }.into_view();
            }

            let proj = match store.projects.get().into_iter().find(|p| p.id == store.current_project_id.get()) {
                Some(p) => p,
                None => return view! { <span class="hidden"></span> }.into_view(),
            };

            let folders = proj.folders.clone();
            let active_f_id = proj.active_folder_id.clone();
            let proj_name = proj.name.clone();

            view! {
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 select-none">
                    <div class="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC]">
                        // Header
                        <div class="flex items-center justify-between px-6 py-4 border-b bg-slate-50 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#30363D]">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-500">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 class="text-sm font-bold tracking-tight">"Gerenciar Pastas do Workspace"</h2>
                                    <p class="text-xs text-slate-400">
                                        "Projeto ativo: " <span class="font-semibold text-slate-200">{proj_name}</span>
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                on:click=move |_| store.is_manage_workspace_open.set(false)
                                class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Body
                        <div class="p-6 overflow-y-auto flex-1 space-y-5">
                            <div class="space-y-2 max-h-52 overflow-y-auto">
                                {folders.into_iter().map(|f| {
                                    let is_active = active_f_id.as_deref() == Some(&f.id) || (active_f_id.is_none() && f.is_primary == Some(true));
                                    let f_id_act = f.id.clone();
                                    let f_id_del = f.id.clone();

                                    view! {
                                        <div class=format!(
                                            "flex items-center justify-between p-3 rounded-xl border transition-all {}",
                                            if is_active {
                                                "bg-indigo-50 dark:bg-indigo-950/25 border-indigo-300 dark:border-indigo-500/50"
                                            } else {
                                                "bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#30363D]"
                                            }
                                        )>
                                            <div class="min-w-0 flex-1 mr-2">
                                                <div class="flex items-center gap-2">
                                                    <span class="text-xs font-semibold truncate">{f.name}</span>
                                                    {if is_active {
                                                        view! {
                                                            <span class="text-[9px] px-1.5 py-0.2 rounded font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                                                "Diretório Ativo"
                                                            </span>
                                                        }.into_view()
                                                    } else {
                                                        view! { <span></span> }.into_view()
                                                    }}
                                                </div>
                                                <span class="text-[10px] text-slate-400 font-mono truncate block">{f.path}</span>
                                            </div>

                                            <div class="flex items-center gap-1">
                                                {if !is_active {
                                                    view! {
                                                        <button
                                                            type="button"
                                                            on:click=move |_| {
                                                                let target_proj = store.current_project_id.get();
                                                                let act_id = f_id_act.clone();
                                                                store.projects.update(|list| {
                                                                    if let Some(p) = list.iter_mut().find(|p| p.id == target_proj) {
                                                                        p.active_folder_id = Some(act_id);
                                                                    }
                                                                });
                                                            }
                                                            class="px-2 py-1 rounded text-[10px] font-semibold bg-slate-200 dark:bg-[#21262D] text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-[#30363D] cursor-pointer"
                                                        >
                                                            "Tornar Ativo"
                                                        </button>
                                                    }.into_view()
                                                } else {
                                                    view! { <span></span> }.into_view()
                                                }}

                                                <button
                                                    type="button"
                                                    on:click=move |_| {
                                                        let target_proj = store.current_project_id.get();
                                                        let del_id = f_id_del.clone();
                                                        store.projects.update(|list| {
                                                            if let Some(p) = list.iter_mut().find(|p| p.id == target_proj) {
                                                                p.folders.retain(|f| f.id != del_id);
                                                            }
                                                        });
                                                    }
                                                    class="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                                                >
                                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <path d="M3 6h18" />
                                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    }
                                }).collect_view()}
                            </div>

                            // Add folder input
                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Nome/Apelido"
                                    prop:value=manual_name.get()
                                    on:input=move |e| manual_name.set(event_target_value(&e))
                                    class="w-1/3 px-2.5 py-1.5 text-xs rounded-lg border bg-white dark:bg-[#161B22] border-slate-300 dark:border-[#30363D]"
                                />
                                <input
                                    type="text"
                                    placeholder="C:/caminho/para/pasta..."
                                    prop:value=manual_path.get()
                                    on:input=move |e| manual_path.set(event_target_value(&e))
                                    class="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border bg-white dark:bg-[#161B22] border-slate-300 dark:border-[#30363D]"
                                />
                                <button
                                    type="button"
                                    on:click=handle_add_folder
                                    class="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 cursor-pointer shrink-0"
                                >
                                    "+ Adicionar"
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            }.into_view()
        }}
    }
}

// =============================================================================
// AllModalsView - Main Container for all 5 Modals
// =============================================================================
#[component]
pub fn AllModalsView() -> impl IntoView {
    view! {
        <ImageAnnotationModalView />
        <MemoryExplorerModalView />
        <SettingsModalView />
        <NewProjectModalView />
        <ManageWorkspaceModalView />
    }
}
