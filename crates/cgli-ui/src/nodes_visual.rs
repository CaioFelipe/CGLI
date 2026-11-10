use cgli_core::{
    AnnotationItem, CanvasNode, DiffNodeData, GroupNodeData, ImageGroupNodeData,
    ImageItem, ImageNodeData, MemoryNodeData, PreviewNodeData, StashItem,
};
use leptos::*;
use crate::markdown_view::MarkdownView;
use crate::store::use_canvas_store;

// Helper: Stash a node
fn stash_canvas_node(store: crate::store::CanvasStore, node: &CanvasNode, name: &str, snippet: &str) {
    let now = chrono::Local::now().format("%d/%m %H:%M").to_string();
    let clean_type = node.node_type.trim_end_matches("Node").to_string();

    let stash_item = StashItem {
        id: format!("stash-{}", js_sys::Date::now() as u64),
        node_id: node.id.clone(),
        name: name.to_string(),
        item_type: clean_type,
        saved_at: now,
        node_data: node.data.clone(),
        position: node.position,
        style: Some(node.style.clone()),
        preview_snippet: snippet.to_string(),
    };

    store.stash_items.update(|list| list.push(stash_item));
    let target_id = node.id.clone();
    store.nodes.update(|list| list.retain(|n| n.id != target_id));
}

// Helper: Delete a node
fn delete_canvas_node(store: crate::store::CanvasStore, node_id: &str) {
    let target_id = node_id.to_string();
    store.nodes.update(|list| list.retain(|n| n.id != target_id));
}

// Helper: Render SVG Annotations
fn render_svg_annotations(node_id: &str, annotations: &[AnnotationItem]) -> impl IntoView {
    let marker_id = format!("arrow-head-{}", node_id);
    let marker_url = format!("url(#{})", marker_id);

    view! {
        <svg
            class="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 800 480"
            preserveAspectRatio="none"
        >
            <defs>
                <marker
                    id=marker_id
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

            {annotations.iter().map(|ann| {
                let color = ann.color.clone();
                let stroke_width = ann.stroke_width;

                match ann.tool {
                    cgli_core::AnnotationTool::Circle => {
                        let x = ann.x.unwrap_or(0.0);
                        let y = ann.y.unwrap_or(0.0);
                        let w = ann.width.unwrap_or(0.0);
                        let h = ann.height.unwrap_or(0.0);
                        let cx = x + w / 2.0;
                        let cy = y + h / 2.0;
                        let rx = (w / 2.0).abs();
                        let ry = (h / 2.0).abs();
                        view! {
                            <ellipse
                                cx=cx
                                cy=cy
                                rx=rx
                                ry=ry
                                fill="none"
                                stroke=color
                                stroke-width=stroke_width
                            />
                        }.into_view()
                    }
                    cgli_core::AnnotationTool::Rect => {
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
                    cgli_core::AnnotationTool::Arrow => {
                        let x = ann.x.unwrap_or(0.0);
                        let y = ann.y.unwrap_or(0.0);
                        let end_x = ann.end_x.unwrap_or(0.0);
                        let end_y = ann.end_y.unwrap_or(0.0);
                        let m_url = marker_url.clone();
                        view! {
                            <g style=format!("color: {}", color)>
                                <line
                                    x1=x
                                    y1=y
                                    x2=end_x
                                    y2=end_y
                                    stroke=color
                                    stroke-width=stroke_width
                                    marker-end=m_url
                                />
                            </g>
                        }.into_view()
                    }
                    cgli_core::AnnotationTool::Brush => {
                        let points_str = if let Some(pts) = &ann.points {
                            let mut coords = Vec::new();
                            let mut i = 0;
                            while i + 1 < pts.len() {
                                coords.push(format!("{},{}", pts[i], pts[i + 1]));
                                i += 2;
                            }
                            coords.join(" ")
                        } else {
                            String::new()
                        };

                        view! {
                            <polyline
                                points=points_str
                                fill="none"
                                stroke=color
                                stroke-width=stroke_width
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        }.into_view()
                    }
                    cgli_core::AnnotationTool::Text => {
                        let x = ann.x.unwrap_or(0.0);
                        let y = ann.y.unwrap_or(0.0);
                        let text = ann.text.clone().unwrap_or_default();
                        let text_len = text.len() as f64;
                        let bg_width = text_len * 9.0 + 12.0;

                        view! {
                            <g>
                                <rect
                                    x=x - 6.0
                                    y=y - 18.0
                                    width=bg_width
                                    height=24.0
                                    fill="#000000"
                                    fill-opacity="0.8"
                                    rx="4"
                                />
                                <text
                                    x=x
                                    y=y
                                    fill=color
                                    font-size="14"
                                    font-weight="bold"
                                    font-family="sans-serif"
                                >
                                    {text}
                                </text>
                            </g>
                        }.into_view()
                    }
                }
            }).collect_view()}
        </svg>
    }
}

// -----------------------------------------------------------------------------
// 1. ImageNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn ImageNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_clone = node.clone();
    let _is_drag_over = create_rw_signal(false);

    let parsed_data: ImageNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();

    // Normalizing images list
    let images: Vec<ImageItem> = if let Some(ref imgs) = parsed_data.images {
        if !imgs.is_empty() {
            imgs.clone()
        } else if let Some(ref url) = parsed_data.url {
            if !url.is_empty() {
                vec![ImageItem {
                    id: format!("{}-img-1", node.id),
                    url: url.clone(),
                    name: parsed_data.name.clone().unwrap_or_else(|| "captura.png".into()),
                    annotations: parsed_data.annotations.clone(),
                    width: parsed_data.width,
                    height: parsed_data.height,
                }]
            } else {
                vec![]
            }
        } else {
            vec![]
        }
    } else if let Some(ref url) = parsed_data.url {
        if !url.is_empty() {
            vec![ImageItem {
                id: format!("{}-img-1", node.id),
                url: url.clone(),
                name: parsed_data.name.clone().unwrap_or_else(|| "captura.png".into()),
                annotations: parsed_data.annotations.clone(),
                width: parsed_data.width,
                height: parsed_data.height,
            }]
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let active_index = parsed_data.active_image_index.unwrap_or(0).min(images.len().saturating_sub(1));
    let active_image = images.get(active_index).cloned();
    let title = parsed_data.title.clone();
    let images_count = images.len();

    let node_id_prev = node_id.clone();
    let node_id_next = node_id.clone();
    let node_id_ann = node_id.clone();
    let node_id_del = node_id.clone();

    let handle_prev = move |_| {
        if active_index > 0 {
            let next_idx = active_index - 1;
            let target = node_id_prev.clone();
            store.nodes.update(|list| {
                if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                    if let Ok(mut data) = serde_json::from_value::<ImageNodeData>(n.data.clone()) {
                        data.active_image_index = Some(next_idx);
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            });
        }
    };

    let handle_next = move |_| {
        if active_index + 1 < images_count {
            let next_idx = active_index + 1;
            let target = node_id_next.clone();
            store.nodes.update(|list| {
                if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                    if let Ok(mut data) = serde_json::from_value::<ImageNodeData>(n.data.clone()) {
                        data.active_image_index = Some(next_idx);
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            });
        }
    };

    view! {
        <div
            class=format!(
                "group relative rounded-xl border transition-all duration-200 flex flex-col focus:outline-hidden bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] {}",
                if node.selected { "ring-2 ring-rose-500 border-rose-500" } else { "" }
            )
            style="width: 100%; height: 100%; min-width: 280px; min-height: 220px;"
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />

            // Header
            <div
                class="flex items-center justify-between px-3 py-2 border-b rounded-t-xl bg-slate-50/90 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#21262D]"
                style="border-top: 3px solid #F43F5E;"
            >
                <div class="flex items-center gap-2 truncate">
                    <div class="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs bg-rose-500/15 text-rose-500 shrink-0">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                    </div>
                    <div class="truncate flex items-center gap-1.5">
                        <span class="font-semibold text-xs tracking-tight truncate block">
                            {if !title.is_empty() { title.clone() } else { "Imagem / Captura".into() }}
                        </span>
                        {if images_count > 1 {
                            view! {
                                <span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                                    {images_count}
                                </span>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}
                    </div>
                </div>

                <div class="flex items-center gap-1">
                    // Stash button
                    <button
                        type="button"
                        on:click={
                            let n = node_clone.clone();
                            let t = title.clone();
                            move |_| stash_canvas_node(store, &n, &t, "Imagem arquivada no Stash")
                        }
                        title="Guardar no Stash"
                        class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="5" x="2" y="3" rx="1" />
                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                            <path d="M10 12h4" />
                        </svg>
                    </button>

                    // Delete button
                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Remover Nó"
                        class="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Body Area
            <div class="relative w-full flex-1 min-h-[160px] bg-slate-950 flex items-center justify-center overflow-hidden p-1.5">
                {if let Some(ref img) = active_image {
                    let anns = img.annotations.clone().unwrap_or_default();
                    let ann_count = anns.len();

                    view! {
                        <div class="relative max-w-full max-h-full flex items-center justify-center">
                            <img
                                src=img.url.clone()
                                alt=img.name.clone()
                                class="max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none block rounded-xs"
                            />
                            {render_svg_annotations(&node_id, &anns)}
                        </div>

                        // Annotation count badge
                        {if ann_count > 0 {
                            view! {
                                <div class="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-xs border border-slate-700/60 text-rose-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-xs z-10 pointer-events-none">
                                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                        <polyline points="2 17 12 22 22 17" />
                                        <polyline points="2 12 12 17 22 12" />
                                    </svg>
                                    <span>{ann_count} " anotações"</span>
                                </div>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}

                        // Carousel Controls
                        {if images_count > 1 {
                            view! {
                                <>
                                    <button
                                        type="button"
                                        on:click=handle_prev
                                        disabled=active_index == 0
                                        title="Imagem anterior"
                                        class="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/85 text-white disabled:opacity-20 hover:bg-rose-600 transition-colors z-20 backdrop-blur-xs shadow-md cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="15 18 9 12 15 6" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        on:click=handle_next
                                        disabled=active_index + 1 == images_count
                                        title="Próxima imagem"
                                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/85 text-white disabled:opacity-20 hover:bg-rose-600 transition-colors z-20 backdrop-blur-xs shadow-md cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>
                                    <div class="absolute bottom-2 inset-x-0 flex justify-center z-20 pointer-events-none">
                                        <span class="bg-slate-950/80 backdrop-blur-xs border border-slate-800 px-2 py-0.5 rounded text-[10px] text-white">
                                            {active_index + 1} " de " {images_count}
                                        </span>
                                    </div>
                                </>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}
                    }.into_view()
                } else {
                    view! {
                        <div class="flex flex-col items-center justify-center p-6 text-center text-slate-400 select-none">
                            <svg class="w-10 h-10 mb-2 text-rose-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                                <path d="M12 12v9" />
                                <path d="m16 16-4-4-4 4" />
                            </svg>
                            <span class="text-xs font-semibold">"Nenhuma imagem carregada"</span>
                            <span class="text-[10px] text-slate-500 mt-1">"Clique em Anotar ou adicione uma imagem"</span>
                        </div>
                    }.into_view()
                }}
            </div>

            // Footer Actions
            <div class="px-3 py-2 border-t rounded-b-xl flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#090D13] border-slate-200 dark:border-[#21262D]">
                <span class="text-[10px] text-slate-400 truncate max-w-[140px]">
                    {if let Some(ref img) = active_image { img.name.clone() } else { "captura.png".into() }}
                </span>

                <div class="flex items-center gap-1.5">
                    <button
                        type="button"
                        on:click=move |_| store.annotating_node_id.set(Some(node_id_ann.clone()))
                        class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-xs cursor-pointer"
                    >
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        <span>"Anotar"</span>
                    </button>
                </div>
            </div>
        </div>
    }
}

// -----------------------------------------------------------------------------
// 2. ImageGroupNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn ImageGroupNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_clone = node.clone();

    let parsed_data: ImageGroupNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let images = parsed_data.images;
    let images_count = images.len();
    let active_index = parsed_data.active_image_index.min(images_count.saturating_sub(1));
    let active_image = images.get(active_index).cloned();
    let title = parsed_data.title.clone();

    let node_id_prev = node_id.clone();
    let node_id_next = node_id.clone();
    let node_id_ann = node_id.clone();
    let node_id_del = node_id.clone();

    let handle_prev = move |_| {
        if active_index > 0 {
            let next_idx = active_index - 1;
            let target = node_id_prev.clone();
            store.nodes.update(|list| {
                if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                    if let Ok(mut data) = serde_json::from_value::<ImageGroupNodeData>(n.data.clone()) {
                        data.active_image_index = next_idx;
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            });
        }
    };

    let handle_next = move |_| {
        if active_index + 1 < images_count {
            let next_idx = active_index + 1;
            let target = node_id_next.clone();
            store.nodes.update(|list| {
                if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                    if let Ok(mut data) = serde_json::from_value::<ImageGroupNodeData>(n.data.clone()) {
                        data.active_image_index = next_idx;
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            });
        }
    };

    view! {
        <div
            class=format!(
                "group relative rounded-xl border transition-all duration-200 flex flex-col bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] {}",
                if node.selected { "ring-2 ring-rose-500 border-rose-500" } else { "" }
            )
            style="width: 100%; height: 100%; min-width: 300px; min-height: 220px;"
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white dark:border-[#0D1117]" />

            // Header
            <div
                class="flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl bg-slate-50/90 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#21262D]"
                style="border-top: 3px solid #F43F5E;"
            >
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs bg-rose-500/15 text-rose-500">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                        </svg>
                    </div>
                    <div>
                        <span class="font-bold text-xs tracking-tight">
                            {if !title.is_empty() { title.clone() } else { "Grupo de Referências".into() }}
                        </span>
                        <span class="text-[10px] text-slate-400 block">
                            {images_count} " capturas agrupadas"
                        </span>
                    </div>
                </div>

                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click={
                            let n = node_clone.clone();
                            let t = title.clone();
                            move |_| stash_canvas_node(store, &n, &t, "Grupo de imagens no Stash")
                        }
                        title="Guardar no Stash"
                        class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="5" x="2" y="3" rx="1" />
                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                            <path d="M10 12h4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Remover Nó"
                        class="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Main Image View
            <div class="relative w-full flex-1 min-h-[160px] bg-slate-950 flex items-center justify-center overflow-hidden p-1.5">
                {if let Some(ref img) = active_image {
                    let anns = img.annotations.clone().unwrap_or_default();
                    let ann_count = anns.len();

                    view! {
                        <div class="relative max-w-full max-h-full flex items-center justify-center">
                            <img
                                src=img.url.clone()
                                alt=img.name.clone()
                                class="max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none block rounded-xs"
                            />
                            {render_svg_annotations(&node_id, &anns)}
                        </div>

                        {if ann_count > 0 {
                            view! {
                                <div class="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-xs border border-slate-700/60 text-rose-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-xs z-10 pointer-events-none">
                                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                        <polyline points="2 17 12 22 22 17" />
                                        <polyline points="2 12 12 17 22 12" />
                                    </svg>
                                    <span>{ann_count} " anotações"</span>
                                </div>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}

                        {if images_count > 1 {
                            view! {
                                <>
                                    <button
                                        type="button"
                                        on:click=handle_prev
                                        disabled=active_index == 0
                                        class="absolute left-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors z-20 cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="15 18 9 12 15 6" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        on:click=handle_next
                                        disabled=active_index + 1 == images_count
                                        class="absolute right-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors z-20 cursor-pointer"
                                    >
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>
                                    <div class="absolute bottom-2 inset-x-0 flex justify-center z-20">
                                        <span class="bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-white pointer-events-none">
                                            {active_index + 1} " de " {images_count}
                                        </span>
                                    </div>
                                </>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}
                    }.into_view()
                } else {
                    view! {
                        <div class="flex flex-col items-center gap-1.5 text-slate-500 text-xs select-none">
                            <svg class="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                <circle cx="9" cy="9" r="2" />
                                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                            </svg>
                            <span>"Nenhuma imagem no grupo"</span>
                        </div>
                    }.into_view()
                }}
            </div>

            // Footer
            <div class="px-3 py-2 border-t rounded-b-xl flex items-center justify-between bg-slate-50 dark:bg-[#090D13] border-slate-200 dark:border-[#21262D]">
                <span class="text-[10px] text-slate-400 truncate max-w-[150px]">
                    {if let Some(ref img) = active_image { img.name.clone() } else { "captura.png".into() }}
                </span>
                <button
                    type="button"
                    on:click=move |_| store.annotating_node_id.set(Some(node_id_ann.clone()))
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-xs cursor-pointer"
                >
                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span>"Anotar"</span>
                </button>
            </div>
        </div>
    }
}

// -----------------------------------------------------------------------------
// 3. GroupNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn GroupNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_clone = node.clone();

    let parsed_data: GroupNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let is_editing_title = create_rw_signal(false);
    let title = create_rw_signal(if !parsed_data.title.is_empty() { parsed_data.title } else { "Novo Grupo de Nós".into() });
    let _is_add_menu_open = create_rw_signal(false);
    let is_reactive = parsed_data.is_reactive.unwrap_or(true);
    let is_drag_over = parsed_data.is_drag_over.unwrap_or(false);
    let member_ids = parsed_data.node_ids.clone();
    let current_color = parsed_data.color.unwrap_or_else(|| "#6366F1".into());


    let node_id_reactive = node_id.clone();
    let toggle_reactive = move |_| {
        let target = node_id_reactive.clone();
        store.nodes.update(|list| {
            if let Some(n) = list.iter_mut().find(|n| n.id == target) {
                if let Ok(mut data) = serde_json::from_value::<GroupNodeData>(n.data.clone()) {
                    let next = !data.is_reactive.unwrap_or(true);
                    data.is_reactive = Some(next);
                    n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                }
            }
        });
    };

    let node_id_del = node_id.clone();
    let node_id_ungroup = node_id.clone();

    let colors = ["#6366F1", "#0284C7", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6"];

    view! {
        <div
            class=format!(
                "relative rounded-2xl border-2 transition-all duration-150 flex flex-col {} {}",
                if is_drag_over {
                    "ring-4 ring-indigo-500/70 border-indigo-400 bg-indigo-500/15 shadow-indigo-500/30 shadow-2xl scale-[1.005]"
                } else if node.selected {
                    "ring-2 ring-indigo-500 border-indigo-500"
                } else {
                    ""
                },
                "bg-indigo-50/70 dark:bg-[#080C14]/60 border-indigo-300 dark:border-indigo-500/50 shadow-md shadow-indigo-100/60 dark:shadow-2xl dark:shadow-indigo-950/20"
            )
            style=format!("width: 100%; height: 100%; min-width: 340px; min-height: 240px; border-color: {};", current_color)
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117]" />

            // Group Header Bar
            <div
                class="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl border-b backdrop-blur-sm relative z-20 bg-white/95 dark:bg-[#0D1117]/95 border-indigo-200 dark:border-indigo-500/30 text-slate-900 dark:text-slate-100 shadow-xs"
            >
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold shrink-0">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                        </svg>
                    </div>

                    {
                        let node_id_blur = node_id.clone();
                        move || {
                            if is_editing_title.get() {
                                let target = node_id_blur.clone();
                                view! {
                                    <input
                                        type="text"
                                        autofocus
                                        prop:value=title.get()
                                        on:input=move |e| title.set(event_target_value(&e))
                                        on:blur=move |_| {
                                            is_editing_title.set(false);
                                            let new_t = title.get();
                                            let t_clone = target.clone();
                                            store.nodes.update(|list| {
                                                if let Some(n) = list.iter_mut().find(|n| n.id == t_clone) {
                                                    if let Ok(mut data) = serde_json::from_value::<GroupNodeData>(n.data.clone()) {
                                                        data.title = new_t;
                                                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                                                    }
                                                }
                                            });
                                        }
                                        class="px-2 py-0.5 text-xs font-bold rounded bg-slate-800 text-white border border-indigo-500 focus:outline-hidden"
                                    />
                                }.into_view()
                            } else {
                                view! {
                                    <div
                                        class="flex items-center gap-1.5 cursor-pointer group/title truncate"
                                        on:click=move |_| is_editing_title.set(true)
                                        title="Clique para renomear o grupo"
                                    >
                                        <span class="font-bold text-xs tracking-tight truncate max-w-[140px]">{title.get()}</span>
                                        <svg class="w-3 h-3 text-slate-400 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                        </svg>
                                    </div>
                                }.into_view()
                            }
                        }
                    }

                    <span class="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 shrink-0">
                        {member_ids.len()} " nós"
                    </span>
                </div>

                // Actions
                <div class="flex items-center gap-1.5 shrink-0 relative">
                    // Color Palette Selector
                    <div class="flex items-center gap-1 mr-1">
                        {
                            let node_id_color = node_id.clone();
                            colors.into_iter().map(move |c| {
                                let c_val = c.to_string();
                                let target = node_id_color.clone();
                                view! {
                                    <button
                                        type="button"
                                        on:click=move |_| {
                                            let col = c_val.clone();
                                            let t = target.clone();
                                            store.nodes.update(|list| {
                                                if let Some(n) = list.iter_mut().find(|n| n.id == t) {
                                                    if let Ok(mut data) = serde_json::from_value::<GroupNodeData>(n.data.clone()) {
                                                        data.color = Some(col);
                                                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                                                    }
                                                }
                                            });
                                        }
                                        class="w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 cursor-pointer"
                                        style=format!("background-color: {};", c)
                                        title=c
                                    />
                                }
                            }).collect_view()
                        }
                    </div>


                    // Reactive Toggle
                    <button
                        type="button"
                        on:click=toggle_reactive
                        title="Alternar Auto-Ajuste Reativo"
                        class=format!(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer {}",
                            if is_reactive {
                                "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                            } else {
                                "bg-slate-700/50 text-slate-400 border border-slate-600/40 hover:bg-slate-700/80"
                            }
                        )
                    >
                        <span>{if is_reactive { "⚡ Reativo" } else { "📐 Manual" }}</span>
                    </button>

                    // Stash
                    <button
                        type="button"
                        on:click={
                            let n = node_clone.clone();
                            let t = title.get();
                            move |_| stash_canvas_node(store, &n, &t, "Grupo arquivado no Stash")
                        }
                        title="Guardar Grupo no Stash"
                        class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="5" x="2" y="3" rx="1" />
                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                            <path d="M10 12h4" />
                        </svg>
                    </button>

                    // Ungroup
                    <button
                        type="button"
                        on:click=move |_| {
                            let target = node_id_ungroup.clone();
                            store.nodes.update(|list| list.retain(|n| n.id != target));
                        }
                        title="Desagrupar nós"
                        class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="8" height="8" x="2" y="2" rx="1" />
                            <rect width="8" height="8" x="14" y="14" rx="1" />
                            <path d="M14 6h4a2 2 0 0 1 2 2v4" />
                            <path d="M10 18H6a2 2 0 0 1-2-2v-4" />
                        </svg>
                    </button>

                    // Delete
                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Excluir Grupo"
                        class="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Canvas Body
            {if member_ids.is_empty() {
                view! {
                    <div class="flex-1 w-full flex flex-col items-center justify-center p-6 text-center pointer-events-none select-none opacity-40">
                        <svg class="w-8 h-8 text-indigo-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                        </svg>
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">"Moldura de Grupo Vazia"</span>
                        <span class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px]">
                            "Arraste nós para dentro desta moldura para agrupá-los"
                        </span>
                    </div>
                }.into_view()
            } else {
                view! {
                    <div class="flex-1 w-full pointer-events-none"></div>
                }.into_view()
            }}
        </div>
    }
}

// -----------------------------------------------------------------------------
// 4. MemoryNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn MemoryNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let copied = create_rw_signal(false);

    let parsed_data: MemoryNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let is_global = parsed_data.scope == "global";
    let accent_color = if is_global { "#10B981" } else { "#6366F1" };

    let note_type = parsed_data.note_type.clone();
    let (type_label, type_color) = match note_type.as_str() {
        "decision" => ("Decisão (ADR)", "bg-amber-500/15 text-amber-500 border-amber-500/30"),
        "learning" => ("Aprendizado", "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"),
        "knowledge" => ("Conhecimento", "bg-cyan-500/15 text-cyan-500 border-cyan-500/30"),
        "rule" | "preference" => ("Regra / Preferência", "bg-purple-500/15 text-purple-500 border-purple-500/30"),
        "task" => ("Tarefa", "bg-indigo-500/15 text-indigo-500 border-indigo-500/30"),
        "entity" => ("Entidade", "bg-blue-500/15 text-blue-500 border-blue-500/30"),
        _ => ("Nota de Memória", "bg-indigo-500/15 text-indigo-500 border-indigo-500/30"),
    };

    let title = parsed_data.title.clone();
    let content = parsed_data.content.clone();
    let content_copy = content.clone();
    let tags = parsed_data.tags.clone().unwrap_or_default();
    let relative_path = parsed_data.relative_path.clone().unwrap_or_default();
    let author = parsed_data.author.clone();

    let handle_copy = move |_| {
        if let Some(window) = web_sys::window() {
            let nav = window.navigator();
            let clipboard = nav.clipboard();
            let _ = clipboard.write_text(&content_copy);
            copied.set(true);
        }
    };

    let rel_path_open = relative_path.clone();
    let handle_open_obsidian = move |_| {
        let vault_name = if is_global { "CGLI_Global" } else { "CGLI" };
        let file_param = rel_path_open.trim_end_matches(".md");
        let uri = format!("obsidian://open?vault={}&file={}", vault_name, file_param);
        if let Some(window) = web_sys::window() {
            let _ = window.open_with_url_and_target(&uri, "_blank");
        }
    };

    let node_id_del = node_id.clone();

    view! {
        <div
            class=format!(
                "group relative rounded-xl border transition-all duration-200 flex flex-col overflow-hidden bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] {}",
                if node.selected { "ring-2" } else { "" }
            )
            style=format!("width: 100%; height: 100%; min-width: 380px; min-height: 280px; border-color: {};", accent_color)
        >
            // Connection Handles
            <div class=format!("react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0D1117] {}", if is_global { "bg-emerald-400" } else { "bg-indigo-400" }) />
            <div class=format!("react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0D1117] {}", if is_global { "bg-emerald-400" } else { "bg-indigo-400" }) />
            <div class=format!("react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0D1117] {}", if is_global { "bg-emerald-400" } else { "bg-indigo-400" }) />
            <div class=format!("react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0D1117] {}", if is_global { "bg-emerald-400" } else { "bg-indigo-400" }) />

            // Header
            <div
                class="px-3.5 py-2.5 border-b flex items-center justify-between shrink-0 select-none bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#30363D]"
            >
                <div class="flex items-center gap-2 min-w-0">
                    <div
                        class=format!(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 {}",
                            if is_global { "bg-emerald-500/20 text-emerald-500" } else { "bg-indigo-500/20 text-indigo-500" }
                        )
                    >
                        {if is_global {
                            view! {
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                            }.into_view()
                        } else {
                            view! {
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
                                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
                                </svg>
                            }.into_view()
                        }}
                    </div>
                    <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span
                                class=format!(
                                    "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider {}",
                                    if is_global { "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" } else { "bg-indigo-500/15 text-indigo-500 border-indigo-500/30" }
                                )
                            >
                                {if is_global { "Vault Global" } else { "Vault Local" }}
                            </span>
                            <span class=format!("text-[10px] font-semibold px-1.5 py-0.5 rounded border {}", type_color)>
                                {type_label}
                            </span>
                        </div>
                        <h3 class="text-xs font-semibold truncate leading-tight mt-0.5 max-w-[200px]" title=title.clone()>
                            {if !title.is_empty() { title.clone() } else { "Nota de Memória".into() }}
                        </h3>
                    </div>
                </div>

                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click=handle_open_obsidian
                        title="Abrir no aplicativo Obsidian"
                        class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-600/15 text-purple-400 hover:bg-purple-600/25 border border-purple-500/30 transition-colors cursor-pointer"
                    >
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span class="text-[10px] hidden sm:inline">"Obsidian"</span>
                    </button>

                    <button
                        type="button"
                        on:click=handle_copy
                        title="Copiar conteúdo"
                        class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        {move || {
                            if copied.get() {
                                view! {
                                    <svg class="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                }.into_view()
                            } else {
                                view! {
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                    </svg>
                                }.into_view()
                            }
                        }}
                    </button>

                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Remover do canvas"
                        class="p-1.5 rounded hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Tags
            {if !tags.is_empty() {
                view! {
                    <div class="px-3.5 py-1.5 flex items-center gap-1.5 flex-wrap border-b text-[11px] bg-slate-100/60 dark:bg-[#090D13] border-slate-200 dark:border-[#21262D]">
                        <svg class="w-3 h-3 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                            <path d="M7 7h.01" />
                        </svg>
                        {tags.into_iter().map(|tag| {
                            view! {
                                <span class="px-1.5 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                                    "#" {tag}
                                </span>
                            }
                        }).collect_view()}
                    </div>
                }.into_view()
            } else {
                view! { <span></span> }.into_view()
            }}

            // Markdown Content
            <div class="flex-1 overflow-y-auto p-4 text-xs font-sans leading-relaxed">
                <MarkdownView content=content />
            </div>

            // Footer
            <div class="px-3 py-1.5 border-t text-[10px] text-slate-400 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#30363D]">
                <span class="truncate max-w-[240px]" title=relative_path.clone()>
                    {if !relative_path.is_empty() { relative_path } else { "Memória Obsidian".into() }}
                </span>
                {if let Some(auth) = author {
                    view! { <span>"Agente: " {auth}</span> }.into_view()
                } else {
                    view! { <span></span> }.into_view()
                }}
            </div>
        </div>
    }
}

// -----------------------------------------------------------------------------
// 5. PreviewNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn PreviewNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let iframe_key = create_rw_signal(0);

    let parsed_data: PreviewNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let title = parsed_data.title.clone();
    let html_content = parsed_data.html_preview.clone();
    let parent_agent = parsed_data.parent_agent_title.clone();

    let node_id_del = node_id.clone();
    let html_copy = html_content.clone();

    let open_in_new_tab = move |_| {
        if let Some(window) = web_sys::window() {
            let data_url = format!("data:text/html;charset=utf-8,{}", js_sys::encode_uri_component(&html_copy));
            let _ = window.open_with_url_and_target(&data_url, "_blank");
        }
    };

    view! {
        <div
            class=format!(
                "group relative rounded-xl border transition-all duration-200 flex flex-col bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] {}",
                if node.selected { "ring-2 ring-cyan-500 border-cyan-500" } else { "" }
            )
            style="width: 100%; height: 100%; min-width: 420px; min-height: 340px; border-color: #06B6D4;"
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white dark:border-[#0D1117]" />

            // Header
            <div
                class="flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl bg-slate-50/90 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#21262D]"
                style="border-top: 3px solid #06B6D4;"
            >
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-cyan-500/15 text-cyan-500">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-semibold text-xs tracking-tight">
                                {if !title.is_empty() { title.clone() } else { "Web Preview".into() }}
                            </span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                                "Sandbox"
                            </span>
                        </div>
                        {if let Some(agent) = parent_agent {
                            view! {
                                <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <svg class="w-2.5 h-2.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                                    </svg>
                                    <span>"Gerado por " {agent}</span>
                                </div>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }}
                    </div>
                </div>

                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click=move |_| iframe_key.update(|k| *k += 1)
                        title="Recarregar Preview"
                        class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-500 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 21h5v-5" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        on:click=open_in_new_tab
                        title="Abrir em Nova Aba"
                        class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-500 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Remover Nó"
                        class="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Iframe sandbox container
            <div class="flex-1 min-h-0 p-2.5 overflow-hidden flex flex-col relative">
                <div class="w-full flex-1 rounded-lg border border-slate-700/80 overflow-hidden bg-slate-950 shadow-inner">
                    {move || {
                        let _k = iframe_key.get();
                        view! {
                            <iframe
                                title="Web Sandbox"
                                sandbox="allow-scripts allow-forms"
                                srcdoc=html_content.clone()
                                class="w-full h-full border-0"
                            />
                        }
                    }}
                </div>
            </div>

            // Footer
            <div class="px-3 py-1.5 border-t rounded-b-xl flex items-center justify-between text-[10px] text-slate-400 bg-slate-50 dark:bg-[#090D13] border-slate-200 dark:border-[#21262D]">
                <span>"Preview isolado e interativo"</span>
                <span class="font-mono">"iframe sandbox"</span>
            </div>
        </div>
    }
}

// -----------------------------------------------------------------------------
// 6. DiffNodeView
// -----------------------------------------------------------------------------
#[component]
pub fn DiffNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();

    let parsed_data: DiffNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let title = parsed_data.title.clone();
    let filename = parsed_data.filename.clone();
    let lines = parsed_data.lines;
    let additions = parsed_data.stats.as_ref().map(|s| s.additions).unwrap_or_else(|| {
        lines.iter().filter(|l| l.line_type == "add").count()
    });
    let deletions = parsed_data.stats.as_ref().map(|s| s.deletions).unwrap_or_else(|| {
        lines.iter().filter(|l| l.line_type == "remove").count()
    });
    let parent_agent = parsed_data.parent_agent_title.clone();
    let node_id_del = node_id.clone();
    let lines_len = lines.len();

    view! {
        <div
            class=format!(
                "group relative rounded-xl border transition-all duration-200 flex flex-col bg-white dark:bg-[#0D1117] border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-[#F0F6FC] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)] {}",
                if node.selected { "ring-2 ring-emerald-500 border-emerald-500" } else { "" }
            )
            style="width: 100%; height: 100%; min-width: 420px; min-height: 300px; border-color: #10B981;"
        >
            // Target handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0D1117]" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0D1117]" />

            // Header
            <div
                class="flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl bg-slate-50/90 dark:bg-[#161B22]/80 border-slate-200 dark:border-[#21262D]"
                style="border-top: 3px solid #10B981;"
            >
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-emerald-500/15 text-emerald-500">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="18" r="3" />
                            <circle cx="6" cy="6" r="3" />
                            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                            <path d="M11 18H8a2 2 0 0 1-2-2V9" />
                        </svg>
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-semibold text-xs tracking-tight">
                                {if !title.is_empty() { title.clone() } else { "Diff de Código".into() }}
                            </span>
                            <span class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                "+" {additions} " / -" {deletions}
                            </span>
                        </div>
                        <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <svg class="w-2.5 h-2.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>
                                {if let Some(agent) = parent_agent {
                                    format!("Vinculado a {} (Exclusivo)", agent)
                                } else {
                                    "Vinculado ao Agente".into()
                                }}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click=move |_| delete_canvas_node(store, &node_id_del)
                        title="Fechar Visualização de Diff"
                        class="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // File Bar
            <div class="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span class="flex items-center gap-1.5 truncate">
                    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span class="font-medium text-slate-200">
                        {if !filename.is_empty() { filename } else { "patch.diff".into() }}
                    </span>
                </span>
                <span class="text-[10px] text-slate-400 shrink-0">"Unified Diff"</span>
            </div>

            // Diff Lines
            <div class="flex-1 min-h-0 overflow-auto select-text cursor-text p-2 bg-[#0B0F17] font-mono text-[11px]">
                <div class="min-w-max space-y-0.5">
                    {if lines.is_empty() {
                        view! {
                            <div class="h-full flex items-center justify-center p-4 text-slate-500 text-xs text-center font-sans">
                                "Nenhuma alteração pendente ou registrada para este agente."
                            </div>
                        }.into_view()
                    } else {
                        lines.into_iter().map(|line| {
                            let is_add = line.line_type == "add";
                            let is_remove = line.line_type == "remove";
                            let prefix = if is_add { "+" } else if is_remove { "-" } else { " " };
                            let row_class = if is_add {
                                "bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500"
                            } else if is_remove {
                                "bg-rose-950/50 text-rose-300 border-l-2 border-rose-500"
                            } else {
                                "text-slate-400"
                            };

                            let old_num_str = line.old_line.map(|n| n.to_string()).unwrap_or_default();
                            let new_num_str = line.new_line.map(|n| n.to_string()).unwrap_or_default();

                            view! {
                                <div class=format!("flex items-start gap-2 px-2 py-0.5 rounded-xs transition-colors {}", row_class)>
                                    <span class="w-8 text-right select-none text-[10px] opacity-40 shrink-0 font-mono">
                                        {old_num_str}
                                    </span>
                                    <span class="w-8 text-right select-none text-[10px] opacity-40 shrink-0 font-mono">
                                        {new_num_str}
                                    </span>
                                    <span class="w-3 text-center select-none text-[10px] opacity-70 shrink-0 font-bold">
                                        {prefix}
                                    </span>
                                    <span class="whitespace-pre leading-relaxed">{line.content}</span>
                                </div>
                            }
                        }).collect_view().into_view()
                    }}
                </div>
            </div>

            // Footer
            <div class="px-3 py-1.5 border-t rounded-b-xl flex items-center justify-between text-[10px] bg-slate-50 dark:bg-[#090D13] border-slate-200 dark:border-[#21262D] text-slate-500 dark:text-slate-400">
                <span class="flex items-center gap-1 text-amber-500/90 font-medium">
                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    "Exclusivo do agente pai"
                </span>
                <span class="font-mono">
                    {lines_len} " linha" {if lines_len != 1 { "s" } else { "" }}
                </span>
            </div>
        </div>
    }
}
