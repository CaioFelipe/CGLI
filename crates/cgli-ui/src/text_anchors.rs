//! Text Anchor helpers to anchor comments to a selected passage of rendered text.
//! Port of src/utils/textAnchors.ts

use cgli_core::TextAnchor;
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::JsCast;
use web_sys::{
    Document, HtmlElement, Node, Range, Selection, TreeWalker, Window,
};

pub const MAX_QUOTE_LENGTH: usize = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HighlightLayer {
    Comment,
    Active,
    Pending,
}

impl HighlightLayer {
    pub fn name(&self) -> &'static str {
        match self {
            HighlightLayer::Comment => "artifact-comment",
            HighlightLayer::Active => "artifact-comment-active",
            HighlightLayer::Pending => "artifact-comment-pending",
        }
    }

    pub fn priority(&self) -> u32 {
        match self {
            HighlightLayer::Comment => 0,
            HighlightLayer::Pending => 1,
            HighlightLayer::Active => 2,
        }
    }
}

thread_local! {
    static REGISTRY: RefCell<HashMap<HighlightLayer, HashMap<String, Vec<Range>>>> = RefCell::new(HashMap::new());
}

fn window() -> Option<Window> {
    web_sys::window()
}

fn document() -> Option<Document> {
    window().and_then(|w| w.document())
}

pub fn supports_highlights() -> bool {
    if let Some(win) = window() {
        let css_val = js_sys::Reflect::get(&win, &wasm_bindgen::JsValue::from_str("CSS")).unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
        if !css_val.is_undefined() && !css_val.is_null() {
            let highlights = js_sys::Reflect::get(&css_val, &wasm_bindgen::JsValue::from_str("highlights")).unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
            let hl_fn = js_sys::Reflect::get(&win, &wasm_bindgen::JsValue::from_str("Highlight")).unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
            return !highlights.is_undefined() && hl_fn.is_function();
        }
    }
    false
}

fn sync_layer(layer: HighlightLayer) {
    if !supports_highlights() {
        return;
    }
    let Some(win) = window() else { return };
    let Ok(css_val) = js_sys::Reflect::get(&win, &wasm_bindgen::JsValue::from_str("CSS")) else { return };
    let Ok(highlights_val) = js_sys::Reflect::get(&css_val, &wasm_bindgen::JsValue::from_str("highlights")) else { return };
    if highlights_val.is_undefined() || highlights_val.is_null() {
        return;
    }

    let layer_name = layer.name();
    let ranges: Vec<Range> = REGISTRY.with(|reg| {
        let borrowed = reg.borrow();
        if let Some(map) = borrowed.get(&layer) {
            map.values().flatten().cloned().collect()
        } else {
            Vec::new()
        }
    });

    let delete_fn = js_sys::Reflect::get(&highlights_val, &wasm_bindgen::JsValue::from_str("delete")).ok();
    let set_fn = js_sys::Reflect::get(&highlights_val, &wasm_bindgen::JsValue::from_str("set")).ok();

    if ranges.is_empty() {
        if let Some(del) = delete_fn {
            if let Ok(f) = del.dyn_into::<js_sys::Function>() {
                let _ = f.call1(&highlights_val, &wasm_bindgen::JsValue::from_str(layer_name));
            }
        }
        return;
    }

    // Create Highlight object with all ranges
    let js_ranges = js_sys::Array::new();
    for r in ranges {
        js_ranges.push(&r);
    }

    if let Ok(hl_ctor) = js_sys::Reflect::get(&win, &wasm_bindgen::JsValue::from_str("Highlight")) {
        if let Ok(hl_fn) = hl_ctor.dyn_into::<js_sys::Function>() {
            let hl_instance = js_sys::Reflect::construct(&hl_fn, &js_ranges).unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
            if !hl_instance.is_undefined() {
                let _ = js_sys::Reflect::set(&hl_instance, &wasm_bindgen::JsValue::from_str("priority"), &wasm_bindgen::JsValue::from_f64(layer.priority() as f64));
                if let Some(set) = set_fn {
                    if let Ok(f) = set.dyn_into::<js_sys::Function>() {
                        let _ = f.call2(&highlights_val, &wasm_bindgen::JsValue::from_str(layer_name), &hl_instance);
                    }
                }
            }
        }
    }
}

pub fn set_highlights(owner_id: &str, layer: HighlightLayer, ranges: Vec<Range>) {
    if !supports_highlights() {
        return;
    }
    REGISTRY.with(|reg| {
        let mut borrowed = reg.borrow_mut();
        let map = borrowed.entry(layer).or_insert_with(HashMap::new);
        if ranges.is_empty() {
            map.remove(owner_id);
        } else {
            map.insert(owner_id.to_string(), ranges);
        }
    });
    sync_layer(layer);
}

pub fn clear_highlights(owner_id: &str) {
    if !supports_highlights() {
        return;
    }
    let layers = [HighlightLayer::Comment, HighlightLayer::Active, HighlightLayer::Pending];
    for layer in layers {
        let removed = REGISTRY.with(|reg| {
            let mut borrowed = reg.borrow_mut();
            if let Some(map) = borrowed.get_mut(&layer) {
                map.remove(owner_id).is_some()
            } else {
                false
            }
        });
        if removed {
            sync_layer(layer);
        }
    }
}

/// Builds a Range covering [start, end) of the concatenated text nodes under `root`.
pub fn range_from_offsets(root: &Node, start: usize, end: usize) -> Option<Range> {
    let doc = document()?;
    // NodeFilter::SHOW_TEXT is constant 4
    let walker: TreeWalker = doc
        .create_tree_walker_with_what_to_show(root, 4)
        .ok()?;
    let range = doc.create_range().ok()?;

    let mut pos = 0;
    let mut start_set = false;

    while let Ok(Some(node)) = walker.next_node() {
        let length = node.node_value().map(|v| v.len()).unwrap_or(0);
        if !start_set && start < pos + length {
            range.set_start(&node, (start - pos) as u32).ok()?;
            start_set = true;
        }
        if start_set && end <= pos + length {
            range.set_end(&node, (end - pos) as u32).ok()?;
            return Some(range);
        }
        pos += length;
    }
    None
}

/// Finds the anchor's range: exact offsets first, then the first occurrence of the quote.
pub fn resolve_anchor_range(root: &HtmlElement, anchor: &TextAnchor) -> Option<Range> {
    let full = root.text_content().unwrap_or_default();
    if anchor.quote.is_empty() {
        return None;
    }
    let quote_len = anchor.quote.len();
    let mut start = if anchor.start >= 0 { anchor.start as usize } else { 0 };

    if start + quote_len > full.len() || &full[start..start + quote_len] != anchor.quote.as_str() {
        if let Some(idx) = full.find(&anchor.quote) {
            start = idx;
        } else {
            return None;
        }
    }
    range_from_offsets(root.as_ref(), start, start + quote_len)
}

/// Reads the current selection as an anchor, or null if it is empty or outside `root`.
pub fn get_selection_anchor(root: &HtmlElement) -> Option<TextAnchor> {
    let win = window()?;
    let selection: Selection = win.get_selection().ok()??;
    if selection.range_count() == 0 || selection.is_collapsed() {
        return None;
    }
    let range: Range = selection.get_range_at(0).ok()?;

    let start_container = range.start_container().ok()?;
    let end_container = range.end_container().ok()?;

    if !root.contains(Some(&start_container)) || !root.contains(Some(&end_container)) {
        return None;
    }

    let doc = document()?;
    let before = doc.create_range().ok()?;
    before.select_node_contents(root).ok()?;
    before.set_end(&start_container, range.start_offset().unwrap_or(0)).ok()?;

    let raw: String = range.to_string().into();
    let trimmed_start = raw.trim_start();
    let leading = raw.len() - trimmed_start.len();
    let quote_full = raw.trim();
    if quote_full.is_empty() {
        return None;
    }

    let quote = if quote_full.len() > MAX_QUOTE_LENGTH {
        quote_full[..MAX_QUOTE_LENGTH].to_string()
    } else {
        quote_full.to_string()
    };

    let before_str: String = before.to_string().into();
    let start = before_str.len() + leading;
    let end = start + quote.len();

    Some(TextAnchor {
        quote,
        start: start as isize,
        end: end as isize,
    })
}

/// Scrolls `container` so that `target` is centered.
pub fn scroll_within(container: &HtmlElement, target: &Range) {
    let container_rect = container.get_bounding_client_rect();
    let target_rect = target.get_bounding_client_rect();
    let offset_height = container.offset_height() as f64;
    let scale = if offset_height > 0.0 {
        container_rect.height() / offset_height
    } else {
        1.0
    };

    let delta = (target_rect.top() - container_rect.top()) / scale
        - (container.client_height() as f64) / 2.0
        + (target_rect.height() / scale) / 2.0;

    let current_scroll = container.scroll_top() as f64;
    container.set_scroll_top((current_scroll + delta) as i32);
}
