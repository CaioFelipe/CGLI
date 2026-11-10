//! MarkdownView component rendering GFM markdown, GitHub Alerts, tables, checklists, and styled code blocks.
//! Uses pulldown-cmark for high-performance GFM parsing.

use leptos::*;
use pulldown_cmark::{html, Options, Parser};

#[component]
pub fn MarkdownView(
    #[prop(into)] content: String,
    #[prop(into, optional)] class: Option<String>,
) -> impl IntoView {
    let rendered_html = create_memo(move |_| {
        render_markdown_to_html(&content)
    });

    let extra_class = class.unwrap_or_default();

    view! {
        <div
            class=format!("markdown-body text-slate-200 font-sans text-xs space-y-2.5 leading-relaxed {}", extra_class)
            inner_html=move || rendered_html.get()
        />
    }
}

pub fn render_markdown_to_html(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    // Post-process HTML for GitHub Alerts, badges, checklists, and code copy styling
    post_process_html(&html_output)
}

fn post_process_html(html: &str) -> String {
    let mut out = html.to_string();

    // 1. Format Badges: [MODIFY], [NEW], [DELETE]
    out = out.replace(
        "[MODIFY]",
        r#"<span class="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">MODIFY</span>"#,
    );
    out = out.replace(
        "[NEW]",
        r#"<span class="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">NEW</span>"#,
    );
    out = out.replace(
        "[DELETE]",
        r#"<span class="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">DELETE</span>"#,
    );

    // 2. Format GitHub Alerts inside <blockquote>
    // > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
    let alert_configs = [
        ("NOTE", "border-sky-500/80 bg-sky-950/25 text-sky-200", "text-sky-400", "Nota", r#"<svg class="w-4 h-4 text-sky-400 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>"#),
        ("TIP", "border-emerald-500/80 bg-emerald-950/25 text-emerald-200", "text-emerald-400", "Dica", r#"<svg class="w-4 h-4 text-emerald-400 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>"#),
        ("IMPORTANT", "border-indigo-500/80 bg-indigo-950/30 text-indigo-200", "text-indigo-400", "Importante", r#"<svg class="w-4 h-4 text-indigo-400 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>"#),
        ("WARNING", "border-amber-500/80 bg-amber-950/30 text-amber-200", "text-amber-400", "Aviso", r#"<svg class="w-4 h-4 text-amber-400 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>"#),
        ("CAUTION", "border-rose-500/80 bg-rose-950/30 text-rose-200", "text-rose-400", "Atenção", r#"<svg class="w-4 h-4 text-rose-400 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>"#),
    ];

    for (tag, border, title_color, label, icon_svg) in alert_configs {
        let pattern_p = format!("<p>[!{}]", tag);
        let pattern_p_space = format!("<p>[!{}] ", tag);
        let replacement = format!(
            r#"<div class="my-3 p-3 rounded-r-lg border-l-4 text-xs {} shadow-sm"><div class="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] mb-1.5 {}">{} <span>{}</span></div><div class="space-y-1 leading-relaxed opacity-95 text-[12px]"><p>"#,
            border, title_color, icon_svg, label
        );

        out = out.replace(&pattern_p_space, &replacement);
        out = out.replace(&pattern_p, &replacement);
    }

    // 3. Task lists checkboxes
    out = out.replace(
        r#"<input disabled="" type="checkbox" checked=""/>"#,
        r#"<span class="inline-flex items-center mr-2 align-middle text-indigo-400">✓</span>"#,
    );
    out = out.replace(
        r#"<input disabled="" type="checkbox"/>"#,
        r#"<span class="inline-flex items-center mr-2 align-middle text-slate-500">☐</span>"#,
    );

    // 4. Style standard tables
    out = out.replace(
        "<table>",
        r#"<div class="my-3 overflow-x-auto rounded-lg border border-slate-700/70 shadow-sm"><table class="w-full text-left text-xs border-collapse">"#,
    );
    out = out.replace("</table>", "</table></div>");
    out = out.replace(
        "<thead>",
        r#"<thead class="bg-[#161B22] text-slate-200 border-b border-slate-700 uppercase font-mono text-[10px] tracking-wider">"#,
    );
    out = out.replace(
        "<tbody>",
        r#"<tbody class="divide-y divide-slate-800 bg-[#0D1117]/80">"#,
    );
    out = out.replace("<th>", r#"<th class="px-3 py-2 font-semibold text-slate-300">"#);
    out = out.replace("<td>", r#"<td class="px-3 py-2 text-slate-300 text-xs">"#);
    out = out.replace("<tr>", r#"<tr class="hover:bg-slate-800/40 transition-colors">"#);

    // 5. Code block wrappers
    out = out.replace(
        "<pre><code>",
        r#"<div class="my-3 rounded-lg border border-slate-700/80 bg-[#0B0F17] overflow-hidden shadow-md"><pre class="p-3 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed"><code>"#,
    );
    out = out.replace("</code></pre>", "</code></pre></div>");

    out
}
