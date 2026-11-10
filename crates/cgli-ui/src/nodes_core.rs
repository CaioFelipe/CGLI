//! Core Nodes: AgentCardNodeView, ArtifactNodeView, and TerminalNodeView.
//! Full parity with AgentCardNode.tsx, ArtifactNode.tsx, and TerminalNode.tsx.

use cgli_core::{
    AgentNodeData, AgentRole, AgentViewMode, ArtifactNodeData,
    CanvasNode, ChatMessage, TerminalNodeData,
};
use cgli_pty_vt::TerminalScreenView;
use leptos::*;
use crate::markdown_view::MarkdownView;
use crate::store::use_canvas_store;

// -----------------------------------------------------------------------------
// 1. AgentCardNodeView
// -----------------------------------------------------------------------------

#[component]
pub fn AgentCardNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_id_del = node.id.clone();
    let node_id_toggle_view = node.id.clone();
    let node_id_clear = node.id.clone();
    let node_id_send = node.id.clone();
    let node_id_key = node.id.clone();

    let node_data: AgentNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let title = node_data.title.clone();
    let agent_type = node_data.agent_type.clone();
    let role = node_data.role;
    let status = node_data.status;
    let session_id = node_data
        .session_id
        .clone()
        .unwrap_or_else(|| format!("pty-{}", node.id));

    let is_claude = agent_type.to_lowercase().contains("claude") || title.to_lowercase().contains("claude");
    let is_agy = agent_type.to_lowercase().contains("agy") || title.to_lowercase().contains("antigravity");

    let accent_color = if is_claude {
        "#EA580C"
    } else if is_agy {
        "#0284C7"
    } else {
        "#6366F1"
    };

    let accent_border = if is_claude {
        "border-orange-500/80"
    } else if is_agy {
        "border-sky-500/80"
    } else {
        "border-indigo-500/80"
    };

    let role_label = match role {
        AgentRole::Planner => "Planejador",
        AgentRole::Executor => "Executor",
    };

    let status_color = match status {
        cgli_core::AgentStatus::Idle => "bg-slate-400",
        cgli_core::AgentStatus::Running => "bg-emerald-400 animate-pulse",
        cgli_core::AgentStatus::WaitingApproval => "bg-amber-400 animate-pulse",
        cgli_core::AgentStatus::Error => "bg-rose-500",
    };

    let view_mode = create_rw_signal(node_data.view_mode);
    let plan_drawer_open = create_rw_signal(false);
    let message_input = create_rw_signal(String::new());

    // Approved plans
    let approved_plans: Vec<_> = node_data
        .attached_artifacts
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter(|art| art.artifact_type == "artifact" && art.status.as_deref() == Some("approved"))
        .collect();

    let sess_id_int = session_id.clone();
    let handle_interrupt = move |e: web_sys::MouseEvent| {
        e.stop_propagation();
        let sid = sess_id_int.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = crate::services::pty_write(&sid, "\x03").await;
        });
    };

    let sess_id_esc = session_id.clone();
    let handle_esc = move |e: web_sys::MouseEvent| {
        e.stop_propagation();
        let sid = sess_id_esc.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = crate::services::pty_write(&sid, "\x1b").await;
        });
    };

    let sess_id_restart = session_id.clone();
    let cmd_restart = if is_claude { "claude" } else if is_agy { "agy" } else { "powershell" };
    let handle_restart = move |e: web_sys::MouseEvent| {
        e.stop_propagation();
        let sid = sess_id_restart.clone();
        let cmd = cmd_restart.to_string();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = crate::services::pty_kill(&sid).await;
            let _ = crate::services::pty_spawn(
                &sid,
                &cmd,
                &["--dangerously-skip-permissions".into()],
                None,
                None,
            ).await;
        });
    };

    let handle_send_message = {
        let store = store.clone();
        let nid = node_id_send.clone();
        let sid = session_id.clone();
        std::rc::Rc::new(move || {
            let text = message_input.get();
            if text.trim().is_empty() {
                return;
            }
            let prompt_payload = format!("{}\r", text.trim());

            // Push into chat messages
            store.nodes.update(|nodes| {
                if let Some(n) = nodes.iter_mut().find(|n| n.id == nid) {
                    if let Ok(mut data) = serde_json::from_value::<AgentNodeData>(n.data.clone()) {
                        data.messages.push(ChatMessage {
                            id: format!("msg-{}", js_sys::Date::now() as u64),
                            sender: "user".into(),
                            text: text.clone(),
                            code_blocks: None,
                            timestamp: chrono::Local::now().format("%H:%M").to_string(),
                            images: None,
                            is_streaming: None,
                        });
                        data.status = cgli_core::AgentStatus::Running;
                        n.data = serde_json::to_value(data).unwrap_or(n.data.clone());
                    }
                }
            });

            let sid_c = sid.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let _ = crate::services::pty_write(&sid_c, &prompt_payload).await;
            });

            message_input.set(String::new());
        })
    };

    let messages = node_data.messages.clone();
    let attached_images = node_data.attached_images.clone();

    view! {
        <div
            class=format!(
                "group relative rounded-2xl border-2 transition-all duration-150 flex flex-col overflow-hidden select-none {} {}",
                if node.selected { "ring-2 ring-indigo-500 shadow-xl" } else { "shadow-lg" },
                accent_border
            )
            style=format!(
                "width: 100%; height: 100%; min-width: 440px; min-height: 380px; background-color: #0D1117;"
            )
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />

            // Header Bar
            <div
                class="flex items-center justify-between px-3.5 py-2.5 border-b backdrop-blur-sm z-20 bg-[#161B22]/90 border-[#21262D] text-slate-100"
                style=format!("border-top: 3px solid {};", accent_color)
            >
                <div class="flex items-center gap-2 min-w-0">
                    <div
                        class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                        style=format!("background-color: {}25; color: {};", accent_color, accent_color)
                    >
                        {if is_claude { "C" } else if is_agy { "A" } else { "P" }}
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-xs tracking-tight truncate max-w-[180px]">{title}</span>
                            <span class=format!("w-2 h-2 rounded-full shrink-0 {}", status_color) />
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                {role_label}
                            </span>
                        </div>
                    </div>
                </div>

                // Right header buttons: Toggle Mode, Diff, Stash, Delete
                <div class="flex items-center gap-1 shrink-0">
                    // Toggle Extension / Terminal View Mode
                    <button
                        type="button"
                        on:click=move |_| {
                            let next = match view_mode.get() {
                                AgentViewMode::Extension => AgentViewMode::Terminal,
                                AgentViewMode::Terminal => AgentViewMode::Extension,
                            };
                            view_mode.set(next);
                            let target = node_id_toggle_view.clone();
                            store.nodes.update(|nodes| {
                                if let Some(n) = nodes.iter_mut().find(|n| n.id == target) {
                                    if let Ok(mut d) = serde_json::from_value::<AgentNodeData>(n.data.clone()) {
                                        d.view_mode = next;
                                        n.data = serde_json::to_value(d).unwrap_or(n.data.clone());
                                    }
                                }
                            });
                        }
                        title="Alternar entre Chat e Terminal"
                        class="px-2 py-1 rounded text-[11px] font-mono border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                        {move || match view_mode.get() {
                            AgentViewMode::Extension => "Terminal ›",
                            AgentViewMode::Terminal => "‹ Chat",
                        }}
                    </button>

                    // Toggle Diff
                    <button
                        type="button"
                        on:click={
                            let ag_id = node_id.clone();
                            move |_| store.toggle_agent_diff_node(&ag_id)
                        }
                        title="Abrir/Fechar Nó de Diff de Alterações"
                        class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="6" y1="3" x2="6" y2="15" />
                            <circle cx="18" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                    </button>

                    // Stash
                    <button
                        type="button"
                        on:click={
                            let n_id = node_id.clone();
                            move |_| store.stash_node(&n_id)
                        }
                        title="Guardar no Stash"
                        class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="5" x="2" y="3" rx="1" />
                            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                            <path d="M10 12h4" />
                        </svg>
                    </button>

                    // Delete
                    <button
                        type="button"
                        on:click=move |_| store.delete_node(&node_id_del)
                        title="Excluir Agente"
                        class="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            // Controls Toolbar (Esc, Interrupt, Reconnect)
            <div class="nodrag flex items-center justify-between px-3 py-1 bg-[#11161F] border-b border-[#21262D] text-xs">
                <div class="flex items-center gap-1.5">
                    <button
                        type="button"
                        on:click=handle_esc
                        title="Enviar Esc"
                        class="px-2 py-0.5 rounded text-[11px] font-mono border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                        "Esc"
                    </button>
                    <button
                        type="button"
                        on:click=handle_interrupt
                        title="Interromper Comando (Ctrl+C)"
                        class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-rose-900/40 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 transition-colors cursor-pointer"
                    >
                        <span>"^C"</span>
                    </button>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click=handle_restart
                        title="Reconectar Sessão PTY"
                        class="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                    </button>
                </div>
            </div>

            // Body: Conditional between Extension (Chat) and Terminal (VT100)
            {
                let handle_send_message = handle_send_message.clone();
                let session_id = session_id.clone();
                let approved_plans = approved_plans.clone();
                let messages = messages.clone();
                move || {
                    let send_msg_key = handle_send_message.clone();
                    let send_msg_click = handle_send_message.clone();
                    if view_mode.get() == AgentViewMode::Extension {
                        view! {
                            <div class="flex-1 flex flex-col min-h-0 bg-[#0D1117]">
                                // Approved plans drawer
                                {if !approved_plans.is_empty() {
                                    view! {
                                        <div class="shrink-0 border-b bg-[#11161F] border-[#21262D] flex flex-col">
                                            <button
                                                type="button"
                                                on:click=move |_| plan_drawer_open.update(|v| *v = !*v)
                                                class="flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
                                            >
                                                <span class="font-semibold text-emerald-300 truncate">
                                                    {format!("✓ {} plano(s) aprovado(s)", approved_plans.len())}
                                                </span>
                                            </button>
                                        </div>
                                    }.into_view()
                                } else {
                                    view! { <div></div> }.into_view()
                                }}

                                // Chat scrollable stream
                                <div class="nodrag nowheel nopan flex-1 overflow-y-auto p-3 space-y-3 select-text">
                                    {if messages.is_empty() {
                                        view! {
                                            <div class="h-full flex flex-col items-center justify-center text-center opacity-40 p-4">
                                                <span class="text-xs font-semibold text-slate-400">"Sessão pronta"</span>
                                                <span class="text-[10px] text-slate-500 mt-1">"Digite uma instrução abaixo para iniciar"</span>
                                            </div>
                                        }.into_view()
                                    } else {
                                        messages.iter().map(|msg| {
                                            let is_user = msg.sender == "user";
                                            view! {
                                                <div class=format!("flex flex-col {}", if is_user { "items-end" } else { "items-start" })>
                                                    <div class=format!(
                                                        "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed {}",
                                                        if is_user {
                                                            "bg-indigo-600 text-white rounded-br-xs"
                                                        } else {
                                                            "bg-[#161B22] text-slate-200 border border-slate-700/80 rounded-bl-xs"
                                                        }
                                                    )>
                                                        <MarkdownView content=msg.text.clone() />
                                                    </div>
                                                    <span class="text-[9px] text-slate-500 mt-0.5 px-1 font-mono">{&msg.timestamp}</span>
                                                </div>
                                            }
                                        }).collect_view()
                                    }}
                                </div>

                                // Chat Input Box
                                <div class="nodrag p-2 border-t border-[#21262D] bg-[#11161F] flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Digite uma instrução para o agente..."
                                        prop:value=move || message_input.get()
                                        on:input=move |e| message_input.set(event_target_value(&e))
                                        on:keydown=move |e: web_sys::KeyboardEvent| {
                                            if e.key() == "Enter" && !e.shift_key() {
                                                e.prevent_default();
                                                send_msg_key();
                                            }
                                        }
                                        class="flex-1 bg-[#0D1117] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                                    />
                                    <button
                                        type="button"
                                        on:click=move |_| send_msg_click()
                                        class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                        "Enviar"
                                    </button>
                                </div>
                            </div>
                        }.into_view()
                    } else {
                        view! {
                            <div class="nodrag nowheel nopan flex-1 min-h-[220px] bg-[#0D1117] p-1.5 overflow-hidden flex flex-col relative">
                                <TerminalScreenView
                                    session_id=session_id.clone()
                                    background="#0D1117".to_string()
                                    foreground="#C9D1D9".to_string()
                                />
                            </div>
                        }.into_view()
                    }
                }
            }

            // Attached images thumbnail strip
            {if !attached_images.is_empty() {
                let ag_id_rm = node_id.clone();
                view! {
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-[#161B22] border-t border-slate-800 overflow-x-auto shrink-0">
                        <span class="text-[10px] text-slate-400 font-medium shrink-0">"Imagens:"</span>
                        {attached_images.into_iter().map(|img| {
                            let img_id = img.id.clone();
                            let ag_id = ag_id_rm.clone();
                            view! {
                                <div class="relative group shrink-0 flex items-center gap-1.5 bg-[#0D1117] pl-1 pr-1.5 py-0.5 rounded border border-slate-700/80">
                                    <img src=img.url alt=img.name.clone() class="w-6 h-6 object-cover rounded" />
                                    <span class="text-[10px] text-slate-300 font-mono truncate max-w-[100px]">{img.name}</span>
                                    <button
                                        type="button"
                                        on:click=move |_| store.remove_attached_image(&ag_id, &img_id)
                                        class="p-0.5 rounded hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 cursor-pointer"
                                    >
                                        "×"
                                    </button>
                                </div>
                            }
                        }).collect_view()}
                    </div>
                }.into_view()
            } else {
                view! { <div></div> }.into_view()
            }}
        </div>
    }
}

// -----------------------------------------------------------------------------
// 2. ArtifactNodeView
// -----------------------------------------------------------------------------

#[component]
pub fn ArtifactNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_id_del = node.id.clone();
    let node_id_app = node.id.clone();

    let node_data: ArtifactNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let title = node_data.title.clone();
    let markdown_content = node_data.markdown_content.clone();
    let status = node_data.status.clone();
    let comments = node_data.comments.clone().unwrap_or_default();
    let parent_agent = node_data.parent_agent_title.clone();

    let active_tab = create_rw_signal(node_data.active_tab.unwrap_or_else(|| "document".into()));
    let comment_text = create_rw_signal(String::new());

    let handle_approve = move |_| {
        store.approve_artifact(&node_id_app);
    };

    let is_approved = status == "approved";

    view! {
        <div
            class=format!(
                "group relative rounded-2xl border-2 transition-all duration-150 flex flex-col overflow-hidden select-none bg-[#0D1117] text-[#F0F6FC] {}",
                if node.selected { "ring-2 ring-indigo-500 border-indigo-500 shadow-xl" } else { "border-indigo-500/50 shadow-md" }
            )
            style="width: 100%; height: 100%; min-width: 420px; min-height: 320px;"
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#0D1117] z-20" />

            // Header Bar
            <div class="flex items-center justify-between px-3.5 py-2.5 border-b bg-[#161B22]/90 border-[#21262D]">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-indigo-500/15 text-indigo-400">
                        "📄"
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-xs tracking-tight truncate max-w-[200px]">{title}</span>
                            <span class=format!(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium {}",
                                if is_approved { "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" } else { "bg-indigo-950/60 text-indigo-300 border border-indigo-800/60" }
                            )>
                                {if is_approved { "Aprovado" } else { "Revisão" }}
                            </span>
                        </div>
                        {if let Some(parent) = parent_agent {
                            view! {
                                <div class="text-[10px] text-slate-400 mt-0.5">
                                    {format!("Gerado por {}", parent)}
                                </div>
                            }.into_view()
                        } else {
                            view! { <div></div> }.into_view()
                        }}
                    </div>
                </div>

                // Actions: Approve, Delete
                <div class="flex items-center gap-1">
                    {if !is_approved {
                        view! {
                            <button
                                type="button"
                                on:click=handle_approve
                                class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                            >
                                "✓ Aprovar e Executar"
                            </button>
                        }.into_view()
                    } else {
                        view! {
                            <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                "✓ Aprovado"
                            </span>
                        }.into_view()
                    }}

                    <button
                        type="button"
                        on:click=move |_| store.delete_node(&node_id_del)
                        title="Remover Artefato"
                        class="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                        "✕"
                    </button>
                </div>
            </div>

            // Tabs Bar: Documento / Comentários / Dividido
            <div class="flex items-center gap-1 px-3 py-1.5 border-b bg-[#11161F] border-[#21262D] text-xs">
                <button
                    type="button"
                    on:click=move |_| active_tab.set("document".into())
                    class=move || format!(
                        "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer {}",
                        if active_tab.get() == "document" { "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40" } else { "text-slate-400 hover:text-slate-200" }
                    )
                >
                    "Documento"
                </button>
                <button
                    type="button"
                    on:click=move |_| active_tab.set("comments".into())
                    class=move || format!(
                        "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer {}",
                        if active_tab.get() == "comments" { "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40" } else { "text-slate-400 hover:text-slate-200" }
                    )
                >
                    {format!("Comentários ({})", comments.len())}
                </button>
                <button
                    type="button"
                    on:click=move |_| active_tab.set("split".into())
                    class=move || format!(
                        "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer {}",
                        if active_tab.get() == "split" { "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40" } else { "text-slate-400 hover:text-slate-200" }
                    )
                >
                    "Dividido"
                </button>
            </div>

            // Content Area
            <div class="flex-1 min-h-0 flex flex-row overflow-hidden bg-[#0D1117]">
                // Document Pane
                {move || {
                    let tab = active_tab.get();
                    if tab == "document" || tab == "split" {
                        let is_split = tab == "split";
                        view! {
                            <div class=format!(
                                "nodrag nowheel nopan overflow-y-auto p-4 select-text leading-relaxed {}",
                                if is_split { "w-1/2 border-r border-[#21262D]" } else { "w-full" }
                            )>
                                <MarkdownView content=markdown_content.clone() />
                            </div>
                        }.into_view()
                    } else {
                        view! { <div></div> }.into_view()
                    }
                }}

                // Comments Pane
                {move || {
                    let tab = active_tab.get();
                    if tab == "comments" || tab == "split" {
                        let is_split = tab == "split";
                        view! {
                            <div class=format!(
                                "nodrag flex flex-col p-3 bg-[#11161F] {}",
                                if is_split { "w-1/2" } else { "w-full" }
                            )>
                                <div class="flex-1 overflow-y-auto space-y-2 mb-2">
                                    {if comments.is_empty() {
                                        view! {
                                            <div class="text-xs text-slate-500 text-center py-6">
                                                "Nenhum comentário adicionado ainda."
                                            </div>
                                        }.into_view()
                                    } else {
                                        comments.iter().map(|c| {
                                            view! {
                                                <div class="p-2 rounded-lg bg-[#161B22] border border-slate-700/80 text-xs">
                                                    {if let Some(ref q) = c.quote {
                                                        view! {
                                                            <div class="mb-1 border-l-2 border-amber-400 pl-1.5 text-[10px] italic text-slate-400">
                                                                {format!("“{}”", q)}
                                                            </div>
                                                        }.into_view()
                                                    } else {
                                                        view! { <div></div> }.into_view()
                                                    }}
                                                    <div class="text-slate-200">{&c.text}</div>
                                                    <div class="text-[9px] text-slate-500 mt-1 font-mono">{format!("{} · {}", c.author, &c.created_at[..16.min(c.created_at.len())])}</div>
                                                </div>
                                            }
                                        }).collect_view()
                                    }}
                                </div>
                                <div class="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Comentário sobre o plano..."
                                        prop:value=move || comment_text.get()
                                        on:input=move |e| comment_text.set(event_target_value(&e))
                                        class="flex-1 bg-[#0D1117] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden"
                                    />
                                    <button
                                        type="button"
                                        on:click={
                                            let nid = node_id.clone();
                                            move |_| {
                                                let txt = comment_text.get();
                                                if !txt.trim().is_empty() {
                                                    store.add_artifact_comment(&nid, &txt, None, None);
                                                    comment_text.set(String::new());
                                                }
                                            }
                                        }
                                        class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                                    >
                                        "Comentar"
                                    </button>
                                </div>
                            </div>
                        }.into_view()
                    } else {
                        view! { <div></div> }.into_view()
                    }
                }}
            </div>
        </div>
    }
}

// -----------------------------------------------------------------------------
// 3. TerminalNodeView
// -----------------------------------------------------------------------------

#[component]
pub fn TerminalNodeView(node: CanvasNode) -> impl IntoView {
    let store = use_canvas_store();
    let node_id = node.id.clone();
    let node_id_del = node.id.clone();
    let node_data: TerminalNodeData = serde_json::from_value(node.data.clone()).unwrap_or_default();
    let title = node_data.title.clone();
    let session_id = node_data.session_id.clone();

    let sess_id_restart = session_id.clone();
    let handle_restart = move |_| {
        let sid = sess_id_restart.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let _ = crate::services::pty_kill(&sid).await;
            let _ = crate::services::pty_spawn(
                &sid,
                "powershell.exe",
                &["-NoLogo".into()],
                None,
                None,
            ).await;
        });
    };

    view! {
        <div
            class=format!(
                "group relative rounded-2xl border-2 transition-all duration-150 flex flex-col overflow-hidden select-none bg-[#012456] text-[#EEEDF0] {}",
                if node.selected { "ring-2 ring-[#0078D4] border-[#0078D4] shadow-2xl" } else { "border-[#0078D4]/60 shadow-lg" }
            )
            style="width: 100%; height: 100%; min-width: 440px; min-height: 300px;"
        >
            // Connection Handles
            <div class="react-flow__handle absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#0078D4] border-2 border-white dark:border-[#012456] z-20" />
            <div class="react-flow__handle absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#0078D4] border-2 border-white dark:border-[#012456] z-20" />
            <div class="react-flow__handle absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#0078D4] border-2 border-white dark:border-[#012456] z-20" />
            <div class="react-flow__handle absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#0078D4] border-2 border-white dark:border-[#012456] z-20" />

            // Header Bar
            <div class="flex items-center justify-between px-3.5 py-2 border-b bg-[#001D45] border-[#0078D4]/40">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-[#0078D4]" />
                        {title}
                    </span>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        on:click=handle_restart
                        title="Reiniciar PowerShell"
                        class="p-1 rounded hover:bg-[#0078D4]/40 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        on:click=move |_| store.delete_node(&node_id_del)
                        title="Remover Terminal"
                        class="p-1 rounded hover:bg-rose-500/30 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                        "✕"
                    </button>
                </div>
            </div>

            // Interactive Terminal Screen
            <div class="nodrag nowheel nopan flex-1 overflow-hidden p-1 bg-[#012456]">
                <TerminalScreenView
                    session_id=session_id
                    background="#012456".to_string()
                    foreground="#EEEDF0".to_string()
                />
            </div>
        </div>
    }
}
