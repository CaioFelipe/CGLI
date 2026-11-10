use cgli_core::{AgentRole, CanvasNode, CliConfig, ImageNodeData, NodeStyle, Position2D, ProjectInfo, ThemeMode};
use leptos::*;
use serde_json::json;
use crate::store::use_canvas_store;

#[component]
pub fn TopbarView() -> impl IntoView {
    let store = use_canvas_store();
    let is_project_dropdown_open = create_rw_signal(false);
    let is_add_node_open = create_rw_signal(false);

    // Current project memo
    let current_project = create_memo(move |_| {
        let projects = store.projects.get();
        let curr_id = store.current_project_id.get();
        projects
            .into_iter()
            .find(|p| p.id == curr_id)
            .unwrap_or_else(|| ProjectInfo {
                id: "default".into(),
                name: "CGLI Workspace".into(),
                path: "/home/antigravity/CaioFelipe/CGLI".into(),
                folders: vec![],
                active_folder_id: None,
                created_at: None,
                recent_projects: None,
            })
    });

    // Helper: Add agent node
    let handle_add_agent = move |cli: Option<CliConfig>, default_type: &str| {
        let timestamp = js_sys::Date::now() as u64;
        let (cli_id, title, role, color, binary) = if let Some(c) = cli {
            (c.id.clone(), c.name.clone(), c.role, c.color.clone(), c.binary.clone())
        } else if default_type == "claude" {
            ("claude-code".into(), "Claude Code".into(), AgentRole::Planner, "#EA580C".into(), "claude".into())
        } else {
            ("agy".into(), "Antigravity (AGY)".into(), AgentRole::Executor, "#0284C7".into(), "agy".into())
        };

        let node_id = format!("node-{}-{}", cli_id, timestamp);
        let current_nodes = store.nodes.get();
        let offset = current_nodes.len() as f64;

        let node_data = json!({
            "title": title,
            "agentType": cli_id,
            "cliId": cli_id,
            "role": role.as_str(),
            "status": "idle",
            "viewMode": "extension",
            "thinking": null,
            "messages": [],
            "approvals": [],
            "attachedImages": [],
            "terminalLogs": [],
            "sessionId": format!("pty-{}", node_id),
            "cliSessionId": uuid::Uuid::new_v4().to_string(),
            "hasStarted": false,
            "customBinary": binary,
            "color": color
        });

        let new_node = CanvasNode {
            id: node_id,
            node_type: "agentNode".into(),
            position: Position2D {
                x: 200.0 + offset * 30.0,
                y: 150.0 + offset * 20.0,
            },
            style: NodeStyle {
                width: Some(600.0),
                height: Some(520.0),
                z_index: None,
            },
            selected: true,
            data: node_data,
        };

        store.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                n.selected = false;
            }
            nodes.push(new_node);
        });
        is_add_node_open.set(false);
    };

    // Helper: Add image node
    let handle_add_image = move |_| {
        let timestamp = js_sys::Date::now() as u64;
        let node_id = format!("node-image-{}", timestamp);
        let current_nodes = store.nodes.get();
        let offset = current_nodes.len() as f64;

        let img_data = ImageNodeData {
            title: "Nova Imagem".into(),
            name: Some("".into()),
            url: Some("".into()),
            width: None,
            height: None,
            annotations: Some(vec![]),
            images: Some(vec![]),
            active_image_index: Some(0),
        };

        let new_node = CanvasNode {
            id: node_id,
            node_type: "imageNode".into(),
            position: Position2D {
                x: 120.0 + offset * 25.0,
                y: 200.0 + offset * 20.0,
            },
            style: NodeStyle {
                width: Some(360.0),
                height: Some(280.0),
                z_index: None,
            },
            selected: true,
            data: serde_json::to_value(img_data).unwrap_or(json!({})),
        };

        store.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                n.selected = false;
            }
            nodes.push(new_node);
        });
        is_add_node_open.set(false);
    };

    // Helper: Add terminal node
    let handle_add_terminal = move |_| {
        let timestamp = js_sys::Date::now() as u64;
        let node_id = format!("node-terminal-{}", timestamp);
        let current_nodes = store.nodes.get();
        let offset = current_nodes.len() as f64;

        let data = json!({
            "title": "PowerShell",
            "shell": "powershell",
            "sessionId": format!("pty-{}", node_id),
            "isPtyActive": true
        });

        let new_node = CanvasNode {
            id: node_id,
            node_type: "terminalNode".into(),
            position: Position2D {
                x: 200.0 + offset * 30.0,
                y: 150.0 + offset * 20.0,
            },
            style: NodeStyle {
                width: Some(640.0),
                height: Some(400.0),
                z_index: None,
            },
            selected: true,
            data,
        };

        store.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                n.selected = false;
            }
            nodes.push(new_node);
        });
        is_add_node_open.set(false);
    };

    // Helper: Add group node
    let handle_add_group = move |_| {
        let timestamp = js_sys::Date::now() as u64;
        let node_id = format!("group-{}", timestamp);
        let current_nodes = store.nodes.get();
        let offset = current_nodes.len() as f64;

        let data = json!({
            "title": "Novo Grupo de Nós",
            "nodeIds": [],
            "width": 560.0,
            "height": 420.0,
            "color": "#6366F1",
            "isReactive": true
        });

        let new_node = CanvasNode {
            id: node_id,
            node_type: "groupNode".into(),
            position: Position2D {
                x: 150.0 + offset * 20.0,
                y: 150.0 + offset * 20.0,
            },
            style: NodeStyle {
                width: Some(560.0),
                height: Some(420.0),
                z_index: Some(0),
            },
            selected: true,
            data,
        };

        store.nodes.update(|nodes| {
            for n in nodes.iter_mut() {
                n.selected = false;
            }
            nodes.push(new_node);
        });
        is_add_node_open.set(false);
    };

    // Helper: Fit View
    let handle_fit_view = move |_| {
        store.viewport.set(cgli_core::ViewportTransform {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        });
    };

    // Helper: Toggle Theme
    let handle_toggle_theme = move |_| {
        let current = store.theme.get();
        let next = current.toggle();
        store.theme.set(next);

        // Update html document class
        if let Some(window) = web_sys::window() {
            if let Some(document) = window.document() {
                if let Some(html) = document.document_element() {
                    let _ = html.set_class_name(next.as_str());
                }
            }
        }
    };

    view! {
        <header
            class="h-13 w-full border-b flex items-center justify-between px-4 z-30 select-none bg-white/95 dark:bg-[#0B0F17]/95 border-slate-200/80 dark:border-slate-800/80 text-slate-900 dark:text-slate-100 backdrop-blur-md"
        >
            // Left: Brand & Active Project Selector
            <div class="flex items-center gap-4">
                // Brand Logo + Rust Edition badge
                <div class="flex items-center gap-2 pr-2 border-r border-slate-200 dark:border-slate-800">
                    <img
                        src="/favicon.svg"
                        alt="CGLI Logo"
                        class="w-7 h-7 rounded-lg shadow-xs select-none"
                    />
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-sm tracking-tight">"CGLI"</span>
                        <span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                            "Rust Edition"
                        </span>
                    </div>
                </div>

                // Project Selector Dropdown
                <div class="relative">
                    <button
                        type="button"
                        on:click=move |_| is_project_dropdown_open.update(|v| *v = !*v)
                        class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                            <circle cx="12" cy="13" r="2" />
                            <path d="M12 15v5" />
                        </svg>

                        <div class="text-left leading-tight">
                            <div class="flex items-center gap-1.5">
                                <span class="font-semibold block">{move || current_project.get().name}</span>
                                {move || {
                                    let count = current_project.get().folders.len();
                                    if count > 1 {
                                        view! {
                                            <span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                                                {count} " pastas"
                                            </span>
                                        }.into_view()
                                    } else {
                                        view! { <span></span> }.into_view()
                                    }
                                }}
                            </div>
                            <span class="text-[10px] text-slate-400 font-mono block truncate max-w-[220px]">
                                {move || current_project.get().path}
                            </span>
                        </div>

                        <svg class="w-3 h-3 text-slate-400 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>

                    // Dropdown Menu
                    {move || {
                        if is_project_dropdown_open.get() {
                            view! {
                                <div class="absolute left-0 top-full mt-1.5 w-80 rounded-xl border shadow-2xl p-2 z-50 bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                                    // Quick Actions
                                    <div class="space-y-1 pb-2 border-b border-inherit">
                                        <button
                                            type="button"
                                            on:click=move |_| {
                                                is_project_dropdown_open.set(false);
                                                store.is_new_project_open.set(true);
                                            }
                                            class="w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
                                        >
                                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                                                <line x1="12" y1="10" x2="12" y2="16" />
                                                <line x1="9" y1="13" x2="15" y2="13" />
                                            </svg>
                                            <span>"+ Criar Novo Projeto"</span>
                                        </button>

                                        <button
                                            type="button"
                                            on:click=move |_| {
                                                is_project_dropdown_open.set(false);
                                                store.is_manage_workspace_open.set(true);
                                            }
                                            class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                                        >
                                            <div class="flex items-center gap-2">
                                                <svg class="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <circle cx="11" cy="11" r="8" />
                                                    <path d="m21 21-4.3-4.3" />
                                                </svg>
                                                <span>"Gerenciar Pastas do Workspace"</span>
                                            </div>
                                            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-200 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300">
                                                {move || current_project.get().folders.len().max(1)}
                                            </span>
                                        </button>
                                    </div>

                                    // Projects List Header
                                    <div class="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-slate-400">
                                        "Seus Projetos"
                                    </div>

                                    // Projects Scrollable List
                                    <div class="space-y-1 max-h-56 overflow-y-auto">
                                        {move || {
                                            let projects = store.projects.get();
                                            let curr_id = store.current_project_id.get();
                                            projects.into_iter().map(|p| {
                                                let p_id = p.id.clone();
                                                let p_id_del = p.id.clone();
                                                let p_name = p.name.clone();
                                                let p_path = p.path.clone();
                                                let folders_len = p.folders.len();
                                                let is_current = p.id == curr_id;

                                                view! {
                                                    <div class={format!(
                                                        "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors {}",
                                                        if is_current {
                                                            "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30"
                                                        } else {
                                                            "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                                        }
                                                    )}>
                                                        <button
                                                            type="button"
                                                            on:click=move |_| {
                                                                store.current_project_id.set(p_id.clone());
                                                                is_project_dropdown_open.set(false);
                                                            }
                                                            class="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                                                        >
                                                            {if is_current {
                                                                view! {
                                                                    <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                        <polyline points="20 6 9 17 4 12" />
                                                                    </svg>
                                                                }.into_view()
                                                            } else {
                                                                view! { <div class="w-3.5 h-3.5 shrink-0" /> }.into_view()
                                                            }}
                                                            <div class="min-w-0 flex-1">
                                                                <div class="flex items-center gap-1.5">
                                                                    <span class="font-semibold truncate">{p_name}</span>
                                                                    {if folders_len > 1 {
                                                                        view! {
                                                                            <span class="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-mono">
                                                                                {folders_len} "p"
                                                                            </span>
                                                                        }.into_view()
                                                                    } else {
                                                                        view! { <span></span> }.into_view()
                                                                    }}
                                                                </div>
                                                                <span class="text-[9px] text-slate-400 font-mono truncate block">
                                                                    {p_path}
                                                                </span>
                                                            </div>
                                                        </button>

                                                        {move || {
                                                            if store.projects.get().len() > 1 {
                                                                let del_id = p_id_del.clone();
                                                                view! {
                                                                    <button
                                                                        type="button"
                                                                        on:click=move |e| {
                                                                            e.stop_propagation();
                                                                            let target_id = del_id.clone();
                                                                            store.projects.update(|list| {
                                                                                list.retain(|proj| proj.id != target_id);
                                                                            });
                                                                            if store.current_project_id.get() == target_id {
                                                                                let remaining = store.projects.get();
                                                                                if let Some(first) = remaining.first() {
                                                                                    store.current_project_id.set(first.id.clone());
                                                                                }
                                                                            }
                                                                        }
                                                                        class="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 ml-1 transition-colors cursor-pointer"
                                                                        title="Excluir projeto"
                                                                    >
                                                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path d="M3 6h18" />
                                                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                                        </svg>
                                                                    </button>
                                                                }.into_view()
                                                            } else {
                                                                view! { <span></span> }.into_view()
                                                            }
                                                        }}
                                                    </div>
                                                }
                                            }).collect_view()
                                        }}
                                    </div>
                                </div>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }
                    }}
                </div>
            </div>

            // Right: Actions & Toggles
            <div class="flex items-center gap-2">
                // Add Node Dropdown
                <div class="relative">
                    <button
                        type="button"
                        on:click=move |_| is_add_node_open.update(|v| *v = !*v)
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>"Novo Nó"</span>
                        <svg class="w-3 h-3 ml-0.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>

                    {move || {
                        if is_add_node_open.get() {
                            view! {
                                <div class="absolute right-0 top-full mt-1.5 w-52 rounded-xl border shadow-xl p-1.5 z-50 bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                                    // Dynamic CLIs or defaults
                                    {move || {
                                        let clis = store.clis.get();
                                        if !clis.is_empty() {
                                            clis.into_iter().map(|cli| {
                                                let cli_clone = cli.clone();
                                                let dot_color = cli.color.clone();
                                                let name = cli.name.clone();
                                                view! {
                                                    <button
                                                        type="button"
                                                        on:click=move |_| handle_add_agent(Some(cli_clone.clone()), "")
                                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <div
                                                            class="w-2 h-2 rounded-full shrink-0"
                                                            style=format!("background-color: {}", dot_color)
                                                        />
                                                        <span class="truncate">{name}</span>
                                                    </button>
                                                }
                                            }).collect_view()
                                        } else {
                                            view! {
                                                <>
                                                    <button
                                                        type="button"
                                                        on:click=move |_| handle_add_agent(None, "claude")
                                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <div class="w-2 h-2 rounded-full bg-amber-500" />
                                                        <span>"Agente Claude Code"</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        on:click=move |_| handle_add_agent(None, "agy")
                                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <div class="w-2 h-2 rounded-full bg-sky-500" />
                                                        <span>"Agente Antigravity"</span>
                                                    </button>
                                                </>
                                            }.into_view()
                                        }
                                    }}

                                    // Image Node
                                    <button
                                        type="button"
                                        on:click=handle_add_image
                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                        <svg class="w-3.5 h-3.5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                            <circle cx="9" cy="9" r="2" />
                                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                                        </svg>
                                        <span>"Imagem / Captura"</span>
                                    </button>

                                    // Terminal Node
                                    <button
                                        type="button"
                                        on:click=handle_add_terminal
                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                        <svg class="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="m7 11 2-2-2-2" />
                                            <path d="M11 13h4" />
                                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                        </svg>
                                        <span>"Terminal PowerShell"</span>
                                    </button>

                                    // Memory / Obsidian Node
                                    <button
                                        type="button"
                                        on:click=move |_| {
                                            is_add_node_open.set(false);
                                            store.is_memory_explorer_open.set(true);
                                        }
                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                        <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
                                            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
                                        </svg>
                                        <span>"Memória / Obsidian"</span>
                                    </button>

                                    <div class="my-1 border-t border-slate-200 dark:border-slate-800" />

                                    // Group Node
                                    <button
                                        type="button"
                                        on:click=handle_add_group
                                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                        <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <rect width="20" height="5" x="2" y="3" rx="1" />
                                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                                            <path d="M10 12h4" />
                                        </svg>
                                        <span>"Novo Grupo de Nós"</span>
                                    </button>
                                </div>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }
                    }}
                </div>

                // Fit View Zoom Button
                <button
                    type="button"
                    on:click=handle_fit_view
                    title="Enquadrar nós no canvas"
                    class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>

                // Memory Explorer Button
                <button
                    type="button"
                    on:click=move |_| store.is_memory_explorer_open.update(|v| *v = !*v)
                    title="Explorar Memória Compartilhada do Obsidian"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                    <svg class="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
                    </svg>
                    <span>"Memória"</span>
                </button>

                // Stash Toggle Button
                <button
                    type="button"
                    on:click=move |_| store.is_stash_open.update(|v| *v = !*v)
                    title="Gaveta do Stash"
                    class="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                    <svg class="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="5" x="2" y="3" rx="1" />
                        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                        <path d="M10 12h4" />
                    </svg>
                    <span>"Stash"</span>
                    {move || {
                        let count = store.stash_items.get().len();
                        if count > 0 {
                            view! {
                                <span class="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                                    {count}
                                </span>
                            }.into_view()
                        } else {
                            view! { <span></span> }.into_view()
                        }
                    }}
                </button>

                // Theme Toggle Button
                <button
                    type="button"
                    on:click=handle_toggle_theme
                    title=move || if store.theme.get() == ThemeMode::Dark { "Alternar para Modo Claro" } else { "Alternar para Modo Escuro" }
                    class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                    {move || {
                        if store.theme.get() == ThemeMode::Dark {
                            view! {
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="4" />
                                    <path d="M12 2v2" />
                                    <path d="M12 20v2" />
                                    <path d="m4.93 4.93 1.41 1.41" />
                                    <path d="m17.66 17.66 1.41 1.41" />
                                    <path d="M2 12h2" />
                                    <path d="M20 12h2" />
                                    <path d="m6.34 17.66-1.41 1.41" />
                                    <path d="m19.07 4.93-1.41 1.41" />
                                </svg>
                            }.into_view()
                        } else {
                            view! {
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                                </svg>
                            }.into_view()
                        }
                    }}
                </button>

                // Settings Button
                <button
                    type="button"
                    on:click=move |_| store.is_settings_open.set(true)
                    title="Configurações e CLIs"
                    class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </button>
            </div>
        </header>
    }
}
