use cgli_core::{CanvasNode, NodeStyle, StashItem};
use leptos::*;
use crate::store::use_canvas_store;

#[component]
pub fn StashDrawerView() -> impl IntoView {
    let store = use_canvas_store();

    let restore_from_stash = move |stash_id: String| {
        let items = store.stash_items.get();
        if let Some(item) = items.into_iter().find(|i| i.id == stash_id) {
            let node_type = match item.item_type.as_str() {
                "agent" => "agentNode".to_string(),
                "artifact" => "artifactNode".to_string(),
                "preview" => "previewNode".to_string(),
                "diff" => "diffNode".to_string(),
                "image" => "imageNode".to_string(),
                "imageGroup" => "imageGroupNode".to_string(),
                "group" => "groupNode".to_string(),
                "terminal" => "terminalNode".to_string(),
                "memory" => "memoryNode".to_string(),
                other => {
                    if other.ends_with("Node") {
                        other.to_string()
                    } else {
                        format!("{}Node", other)
                    }
                }
            };

            let restored_node = CanvasNode {
                id: item.node_id,
                node_type,
                position: item.position,
                style: item.style.unwrap_or(NodeStyle {
                    width: None,
                    height: None,
                    z_index: None,
                }),
                selected: true,
                data: item.node_data,
            };

            store.nodes.update(|nodes| {
                for n in nodes.iter_mut() {
                    n.selected = false;
                }
                nodes.push(restored_node);
            });

            store.stash_items.update(|list| {
                list.retain(|i| i.id != stash_id);
            });
        }
    };

    let remove_stash_item = move |stash_id: String| {
        store.stash_items.update(|list| {
            list.retain(|i| i.id != stash_id);
        });
    };

    let get_type_badge_class = |item_type: &str| -> &'static str {
        match item_type {
            "agent" => "bg-amber-500/10 text-amber-500 border-amber-500/20",
            "artifact" => "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
            "preview" => "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
            "diff" => "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
            "image" | "imageGroup" => "bg-rose-500/10 text-rose-500 border-rose-500/20",
            "group" => "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
            _ => "bg-slate-500/10 text-slate-400 border-slate-500/20",
        }
    };

    view! {
        {move || {
            if !store.is_stash_open.get() {
                return view! { <span class="hidden"></span> }.into_view();
            }

            let items = store.stash_items.get();
            let items_count = items.len();

            view! {
                <div class="fixed inset-y-0 right-0 z-40 flex">
                    // Backdrop
                    <div
                        class="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
                        on:click=move |_| store.is_stash_open.set(false)
                    />

                    // Drawer Container
                    <aside
                        class="relative w-96 max-w-full h-full shadow-2xl flex flex-col border-l z-50 animate-in slide-in-from-right duration-200 bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    >
                        // Drawer Header
                        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="20" height="5" x="2" y="3" rx="1" />
                                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                                    <path d="M10 12h4" />
                                </svg>
                                <h2 class="text-sm font-semibold tracking-tight">"Stash do Canvas"</h2>
                                <span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {items_count}
                                </span>
                            </div>

                            <button
                                type="button"
                                on:click=move |_| store.is_stash_open.set(false)
                                class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
                            >
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        // Drawer Content
                        <div class="flex-1 overflow-y-auto p-4 space-y-3">
                            {if items.is_empty() {
                                view! {
                                    <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                                        <svg class="w-12 h-12 mb-3 opacity-30 stroke-[1.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                            <rect width="20" height="5" x="2" y="3" rx="1" />
                                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                                            <path d="M10 12h4" />
                                        </svg>
                                        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            "Nenhum nó guardado no Stash"
                                        </p>
                                        <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">
                                            "Clique no ícone de arquivo em qualquer nó para guardá-lo temporariamente fora do canvas."
                                        </p>
                                    </div>
                                }.into_view()
                            } else {
                                items.into_iter().map(|item: StashItem| {
                                    let item_id_res = item.id.clone();
                                    let item_id_del = item.id.clone();
                                    let item_type = item.item_type.clone();
                                    let item_name = item.name.clone();
                                    let preview = item.preview_snippet.clone();
                                    let saved_at = item.saved_at.clone();
                                    let badge_class = get_type_badge_class(&item_type);

                                    view! {
                                        <div class="p-3.5 rounded-xl border transition-all duration-150 shadow-xs hover:shadow-md bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700">
                                            // Top info
                                            <div class="flex items-start justify-between gap-2 mb-2">
                                                <div class="flex items-center gap-2 min-w-0">
                                                    // Type Icon
                                                    {match item_type.as_str() {
                                                        "agent" => view! {
                                                            <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <polyline points="4 17 10 11 4 5" />
                                                                <line x1="12" y1="19" x2="20" y2="19" />
                                                            </svg>
                                                        }.into_view(),
                                                        "artifact" => view! {
                                                            <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                                                <polyline points="14 2 14 8 20 8" />
                                                            </svg>
                                                        }.into_view(),
                                                        "preview" => view! {
                                                            <svg class="w-3.5 h-3.5 text-cyan-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                                                <circle cx="12" cy="12" r="3" />
                                                            </svg>
                                                        }.into_view(),
                                                        "diff" => view! {
                                                            <svg class="w-3.5 h-3.5 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <circle cx="18" cy="18" r="3" />
                                                                <circle cx="6" cy="6" r="3" />
                                                                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                                                                <path d="M11 18H8a2 2 0 0 1-2-2V9" />
                                                            </svg>
                                                        }.into_view(),
                                                        "image" | "imageGroup" => view! {
                                                            <svg class="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                                                <circle cx="9" cy="9" r="2" />
                                                                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                                                            </svg>
                                                        }.into_view(),
                                                        "group" => view! {
                                                            <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <rect width="20" height="5" x="2" y="3" rx="1" />
                                                                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                                                                <path d="M10 12h4" />
                                                            </svg>
                                                        }.into_view(),
                                                        _ => view! {
                                                            <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                                                            </svg>
                                                        }.into_view(),
                                                    }}
                                                    <span class="font-semibold text-xs truncate max-w-[170px]">
                                                        {item_name}
                                                    </span>
                                                </div>

                                                <span class={format!("text-[9px] uppercase px-1.5 py-0.5 rounded border font-semibold tracking-wider shrink-0 {}", badge_class)}>
                                                    {item_type}
                                                </span>
                                            </div>

                                            // Snippet Preview
                                            <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                                                {preview}
                                            </p>

                                            // Card Footer Actions
                                            <div class="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                                                <div class="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                        <circle cx="12" cy="12" r="10" />
                                                        <polyline points="12 6 12 12 16 14" />
                                                    </svg>
                                                    <span>{saved_at}</span>
                                                </div>

                                                <div class="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        on:click=move |_| remove_stash_item(item_id_del.clone())
                                                        title="Excluir do Stash"
                                                        class="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                                    >
                                                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                            <path d="M3 6h18" />
                                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        on:click=move |_| restore_from_stash(item_id_res.clone())
                                                        class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs cursor-pointer"
                                                    >
                                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                            <path d="M3 3v5h5" />
                                                        </svg>
                                                        <span>"Restaurar"</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                }).collect_view().into_view()
                            }}
                        </div>
                    </aside>
                </div>
            }.into_view()
        }}
    }
}
