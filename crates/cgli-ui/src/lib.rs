pub mod store;
pub mod services;
pub mod text_anchors;
pub mod markdown_view;
pub mod removable_edge;
pub mod nodes_core;
pub mod nodes_visual;
pub mod topbar;
pub mod stash_drawer;
pub mod modals;
pub mod canvas;

use leptos::*;
use crate::canvas::CanvasApp;

#[component]
pub fn App() -> impl IntoView {
    view! {
        <CanvasApp />
    }
}
