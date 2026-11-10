//! RemovableEdge component calculating Cubic Bezier curve between source and target handles
//! and rendering the path and the delete (×) button.

use cgli_core::CanvasEdge;
use leptos::*;
use crate::store::use_canvas_store;

#[component]
pub fn RemovableEdgeView(
    edge: CanvasEdge,
    #[prop(default = 0.0)] source_x: f64,
    #[prop(default = 0.0)] source_y: f64,
    #[prop(default = 0.0)] target_x: f64,
    #[prop(default = 0.0)] target_y: f64,
    #[prop(default = false)] is_locked: bool,
    #[prop(into, default = "#6366F1".to_string())] color: String,
) -> impl IntoView {
    let store = use_canvas_store();
    let is_hovered = create_rw_signal(false);
    let _edge_id = edge.id.clone();
    let edge_id_del = edge.id.clone();

    // Calculate Cubic Bezier path and midpoint
    let (path_d, mid_x, mid_y) = calculate_bezier_path(source_x, source_y, target_x, target_y);

    let handle_delete = move |e: web_sys::MouseEvent| {
        e.stop_propagation();
        if is_locked {
            return;
        }
        store.delete_edge(&edge_id_del);
    };

    let stroke_width = move || {
        if is_hovered.get() || edge.selected {
            3.0
        } else {
            2.0
        }
    };

    view! {
        <g class="react-flow__edge">
            // Rendered Visible Path
            <path
                class=format!("react-flow__edge-path {}", if edge.animated { "animate-pulse" } else { "" })
                d=path_d.clone()
                fill="none"
                stroke=color.clone()
                stroke-width=stroke_width
                stroke-dasharray=if edge.animated { "5 5" } else { "none" }
                style="transition: stroke-width 0.15s ease, stroke 0.15s ease;"
            />

            // Invisible thicker interaction path for easy hover/selection
            <path
                d=path_d
                fill="none"
                stroke="transparent"
                stroke-width="24"
                class="cursor-pointer"
                on:mouseenter=move |_| is_hovered.set(true)
                on:mouseleave=move |_| is_hovered.set(false)
            />

            // Delete button at midpoint
            {if !is_locked {
                view! {
                    <foreignObject
                        x=mid_x - 12.0
                        y=mid_y - 12.0
                        width="24"
                        height="24"
                        class="overflow-visible"
                        on:mouseenter=move |_| is_hovered.set(true)
                        on:mouseleave=move |_| is_hovered.set(false)
                    >
                        <div class="w-6 h-6 flex items-center justify-center pointer-events-auto">
                            <button
                                type="button"
                                on:click=handle_delete
                                title="Excluir conexão entre os nós"
                                class=move || format!(
                                    "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 shadow-md cursor-pointer {}",
                                    if is_hovered.get() || edge.selected {
                                        "opacity-100 scale-110 bg-rose-600 text-white hover:bg-rose-500 ring-2 ring-rose-400/40"
                                    } else {
                                        "opacity-40 hover:opacity-100 bg-slate-900/90 text-slate-300 border border-slate-700 hover:bg-rose-600 hover:text-white"
                                    }
                                )
                            >
                                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </foreignObject>
                }.into_view()
            } else {
                view! { <g></g> }.into_view()
            }}
        </g>
    }
}

pub fn calculate_bezier_path(
    source_x: f64,
    source_y: f64,
    target_x: f64,
    target_y: f64,
) -> (String, f64, f64) {
    let dx = (target_x - source_x).abs();
    let curvature = 0.5;
    let delta = (dx * curvature).max(25.0);

    let c1_x = source_x + delta;
    let c1_y = source_y;
    let c2_x = target_x - delta;
    let c2_y = target_y;

    let path = format!(
        "M {},{} C {},{} {},{} {},{}",
        source_x, source_y, c1_x, c1_y, c2_x, c2_y, target_x, target_y
    );

    // Calculate midpoint on cubic bezier at t = 0.5
    let t = 0.5;
    let u = 1.0 - t;
    let mid_x = u * u * u * source_x
        + 3.0 * u * u * t * c1_x
        + 3.0 * u * t * t * c2_x
        + t * t * t * target_x;
    let mid_y = u * u * u * source_y
        + 3.0 * u * u * t * c1_y
        + 3.0 * u * t * t * c2_y
        + t * t * t * target_y;

    (path, mid_x, mid_y)
}
