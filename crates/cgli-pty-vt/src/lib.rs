use cgli_core::BridgeAction;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnsiColor {
    Default,
    Named(u8),
    Palette(u8),
    Rgb(u8, u8, u8),
}

impl AnsiColor {
    pub fn to_css_color(&self, is_foreground: bool, theme: &TerminalTheme) -> String {
        match self {
            AnsiColor::Default => {
                if is_foreground {
                    theme.foreground.clone()
                } else {
                    theme.background.clone()
                }
            }
            AnsiColor::Named(code) => theme.color_from_ansi_code(*code),
            AnsiColor::Palette(idx) => theme.color_from_256(*idx),
            AnsiColor::Rgb(r, g, b) => format!("#{:02X}{:02X}{:02X}", r, g, b),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalTheme {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection_background: String,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
}

impl TerminalTheme {
    pub fn dark() -> Self {
        Self {
            background: "#0D1117".to_string(),
            foreground: "#C9D1D9".to_string(),
            cursor: "#58A6FF".to_string(),
            selection_background: "#1F6FEB44".to_string(),
            black: "#0D1117".to_string(),
            red: "#FF7B72".to_string(),
            green: "#3FB950".to_string(),
            yellow: "#D29922".to_string(),
            blue: "#58A6FF".to_string(),
            magenta: "#BC8CFF".to_string(),
            cyan: "#39C5CF".to_string(),
            white: "#C9D1D9".to_string(),
            bright_black: "#484F58".to_string(),
            bright_red: "#FFA198".to_string(),
            bright_green: "#56D364".to_string(),
            bright_yellow: "#E3B341".to_string(),
            bright_blue: "#79C0FF".to_string(),
            bright_magenta: "#D2A8FF".to_string(),
            bright_cyan: "#56D4DD".to_string(),
            bright_white: "#F0F6FC".to_string(),
        }
    }

    pub fn light() -> Self {
        Self {
            background: "#F8FAFC".to_string(),
            foreground: "#1E293B".to_string(),
            cursor: "#0284C7".to_string(),
            selection_background: "#0284C722".to_string(),
            black: "#1E293B".to_string(),
            red: "#EF4444".to_string(),
            green: "#10B981".to_string(),
            yellow: "#F59E0B".to_string(),
            blue: "#0284C7".to_string(),
            magenta: "#8B5CF6".to_string(),
            cyan: "#06B6D4".to_string(),
            white: "#F8FAFC".to_string(),
            bright_black: "#64748B".to_string(),
            bright_red: "#F87171".to_string(),
            bright_green: "#34D399".to_string(),
            bright_yellow: "#FBBF24".to_string(),
            bright_blue: "#38BDF8".to_string(),
            bright_magenta: "#A78BFA".to_string(),
            bright_cyan: "#22D3EE".to_string(),
            bright_white: "#FFFFFF".to_string(),
        }
    }

    pub fn powershell() -> Self {
        Self {
            background: "#012456".to_string(),
            foreground: "#EEEDF0".to_string(),
            cursor: "#EEEDF0".to_string(),
            selection_background: "#FFFFFF55".to_string(),
            black: "#0C0C0C".to_string(),
            red: "#C50F1F".to_string(),
            green: "#13A10E".to_string(),
            yellow: "#C19C00".to_string(),
            blue: "#3B78FF".to_string(),
            magenta: "#B4009E".to_string(),
            cyan: "#3A96DD".to_string(),
            white: "#CCCCCC".to_string(),
            bright_black: "#767676".to_string(),
            bright_red: "#E74856".to_string(),
            bright_green: "#16C60C".to_string(),
            bright_yellow: "#F9F1A5".to_string(),
            bright_blue: "#6EA0FF".to_string(),
            bright_magenta: "#D670D6".to_string(),
            bright_cyan: "#61D6D6".to_string(),
            bright_white: "#F2F2F2".to_string(),
        }
    }

    pub fn color_from_ansi_code(&self, code: u8) -> String {
        match code {
            0 => self.black.clone(),
            1 => self.red.clone(),
            2 => self.green.clone(),
            3 => self.yellow.clone(),
            4 => self.blue.clone(),
            5 => self.magenta.clone(),
            6 => self.cyan.clone(),
            7 => self.white.clone(),
            8 => self.bright_black.clone(),
            9 => self.bright_red.clone(),
            10 => self.bright_green.clone(),
            11 => self.bright_yellow.clone(),
            12 => self.bright_blue.clone(),
            13 => self.bright_magenta.clone(),
            14 => self.bright_cyan.clone(),
            15 => self.bright_white.clone(),
            _ => self.foreground.clone(),
        }
    }

    pub fn color_from_256(&self, idx: u8) -> String {
        if idx < 16 {
            return self.color_from_ansi_code(idx);
        }
        if idx >= 232 {
            let gray = (idx - 232) * 10 + 8;
            return format!("#{:02X}{:02X}{:02X}", gray, gray, gray);
        }
        let code = idx - 16;
        let b = (code % 6) * 51;
        let g = ((code / 6) % 6) * 51;
        let r = (code / 36) * 51;
        format!("#{:02X}{:02X}{:02X}", r, g, b)
    }
}

impl Default for TerminalTheme {
    fn default() -> Self {
        Self::dark()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CellStyle {
    pub fg: AnsiColor,
    pub bg: AnsiColor,
    pub bold: bool,
    pub dim: bool,
    pub italic: bool,
    pub underline: bool,
    pub inverse: bool,
    pub hidden: bool,
    pub strikethrough: bool,
}

impl Default for CellStyle {
    fn default() -> Self {
        Self {
            fg: AnsiColor::Default,
            bg: AnsiColor::Default,
            bold: false,
            dim: false,
            italic: false,
            underline: false,
            inverse: false,
            hidden: false,
            strikethrough: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cell {
    pub ch: char,
    pub style: CellStyle,
}

impl Default for Cell {
    fn default() -> Self {
        Self {
            ch: ' ',
            style: CellStyle::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderedSpan {
    pub text: String,
    pub style: CellStyle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderedLine {
    pub line_idx: usize,
    pub spans: Vec<RenderedSpan>,
}

#[derive(Debug, Clone)]
pub struct TerminalScreen {
    pub cols: usize,
    pub rows: usize,
    pub cursor_col: usize,
    pub cursor_row: usize,
    pub saved_cursor: (usize, usize),
    pub current_style: CellStyle,
    pub buffer: Vec<Vec<Cell>>,
    pub theme: TerminalTheme,
    pub scrollback_limit: usize,
    pub stream_markers: Vec<BridgeAction>,
}

impl TerminalScreen {
    pub fn new(cols: usize, rows: usize) -> Self {
        let cols = cols.max(1);
        let rows = rows.max(1);
        let buffer = vec![vec![Cell::default(); cols]; rows];
        Self {
            cols,
            rows,
            cursor_col: 0,
            cursor_row: 0,
            saved_cursor: (0, 0),
            current_style: CellStyle::default(),
            buffer,
            theme: TerminalTheme::default(),
            scrollback_limit: 1000,
            stream_markers: Vec::new(),
        }
    }

    pub fn with_theme(mut self, theme: TerminalTheme) -> Self {
        self.theme = theme;
        self
    }

    pub fn set_theme(&mut self, theme: TerminalTheme) {
        self.theme = theme;
    }

    pub fn resize(&mut self, cols: usize, rows: usize) {
        let cols = cols.max(1);
        let rows = rows.max(1);
        self.cols = cols;
        self.rows = rows;
        while self.buffer.len() < rows {
            self.buffer.push(vec![Cell::default(); cols]);
        }
        for line in &mut self.buffer {
            line.resize(cols, Cell::default());
        }
        if self.cursor_col >= cols {
            self.cursor_col = cols - 1;
        }
        if self.cursor_row >= rows {
            self.cursor_row = rows - 1;
        }
    }

    pub fn clear_screen(&mut self) {
        for row in &mut self.buffer {
            for cell in row {
                *cell = Cell::default();
            }
        }
        self.cursor_col = 0;
        self.cursor_row = 0;
    }

    pub fn clear_line(&mut self, mode: u8) {
        if self.cursor_row >= self.buffer.len() {
            return;
        }
        let line = &mut self.buffer[self.cursor_row];
        match mode {
            0 => {
                // Clear from cursor to end of line
                for c in self.cursor_col..line.len() {
                    line[c] = Cell::default();
                }
            }
            1 => {
                // Clear from beginning to cursor
                let limit = self.cursor_col.min(line.len() - 1);
                for c in 0..=limit {
                    line[c] = Cell::default();
                }
            }
            2 => {
                // Clear entire line
                for cell in line {
                    *cell = Cell::default();
                }
            }
            _ => {}
        }
    }

    pub fn newline(&mut self) {
        self.cursor_col = 0;
        if self.cursor_row + 1 >= self.rows {
            self.scroll_up();
        } else {
            self.cursor_row += 1;
        }
    }

    fn scroll_up(&mut self) {
        let new_line = vec![Cell::default(); self.cols];
        self.buffer.push(new_line);
        if self.buffer.len() > self.scrollback_limit {
            self.buffer.remove(0);
        }
    }

    pub fn put_char(&mut self, ch: char) {
        while self.cursor_row >= self.buffer.len() {
            self.buffer.push(vec![Cell::default(); self.cols]);
        }
        if self.cursor_col >= self.cols {
            self.cursor_col = 0;
            self.newline();
        }
        let cell = &mut self.buffer[self.cursor_row][self.cursor_col];
        cell.ch = ch;
        cell.style = self.current_style;
        self.cursor_col += 1;
    }

    pub fn feed_str(&mut self, data: &str) {
        let extracted = extract_cgli_markers(data);
        if !extracted.is_empty() {
            self.stream_markers.extend(extracted);
        }

        let chars: Vec<char> = data.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let ch = chars[i];
            if ch == '\x1b' {
                if i + 1 < len && chars[i + 1] == '[' {
                    // CSI Sequence
                    let mut j = i + 2;
                    while j < len {
                        let c = chars[j];
                        if (c >= '@' && c <= '~') && c != '[' {
                            break;
                        }
                        j += 1;
                    }
                    if j < len {
                        let final_byte = chars[j];
                        let params_str: String = chars[i + 2..j].iter().collect();
                        self.handle_csi(&params_str, final_byte);
                        i = j + 1;
                        continue;
                    } else {
                        break;
                    }
                } else if i + 1 < len && chars[i + 1] == ']' {
                    // OSC sequence: \x1b] ... (\x07 | \x1b\\)
                    let mut j = i + 2;
                    while j < len {
                        if chars[j] == '\x07' {
                            j += 1;
                            break;
                        }
                        if chars[j] == '\x1b' && j + 1 < len && chars[j + 1] == '\\' {
                            j += 2;
                            break;
                        }
                        j += 1;
                    }
                    i = j;
                    continue;
                } else if i + 1 < len && chars[i + 1] == '7' {
                    // DECSC - Save cursor
                    self.saved_cursor = (self.cursor_col, self.cursor_row);
                    i += 2;
                    continue;
                } else if i + 1 < len && chars[i + 1] == '8' {
                    // DECRC - Restore cursor
                    self.cursor_col = self.saved_cursor.0.min(self.cols.saturating_sub(1));
                    self.cursor_row = self.saved_cursor.1.min(self.rows.saturating_sub(1));
                    i += 2;
                    continue;
                } else {
                    i += 1;
                    continue;
                }
            }

            match ch {
                '\r' => {
                    self.cursor_col = 0;
                }
                '\n' => {
                    self.newline();
                }
                '\x08' => {
                    // Backspace
                    if self.cursor_col > 0 {
                        self.cursor_col -= 1;
                    }
                }
                '\t' => {
                    // Tab to next multiple of 8
                    let next_tab = (self.cursor_col + 8) & !7;
                    let target = next_tab.min(self.cols.saturating_sub(1));
                    while self.cursor_col < target {
                        self.put_char(' ');
                    }
                }
                c if c >= ' ' => {
                    self.put_char(c);
                }
                _ => {
                    // Ignore other control characters
                }
            }
            i += 1;
        }
    }

    fn handle_csi(&mut self, params_str: &str, command: char) {
        match command {
            'm' => self.handle_sgr(params_str),
            'H' | 'f' => {
                // Cursor position: 1-indexed (row;col)
                let parts: Vec<&str> = params_str.split(';').collect();
                let row = parts
                    .get(0)
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(1)
                    .saturating_sub(1);
                let col = parts
                    .get(1)
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(1)
                    .saturating_sub(1);
                self.cursor_row = row.min(self.rows.saturating_sub(1));
                self.cursor_col = col.min(self.cols.saturating_sub(1));
            }
            'A' => {
                // Cursor Up
                let n = params_str.parse::<usize>().unwrap_or(1).max(1);
                self.cursor_row = self.cursor_row.saturating_sub(n);
            }
            'B' => {
                // Cursor Down
                let n = params_str.parse::<usize>().unwrap_or(1).max(1);
                self.cursor_row = (self.cursor_row + n).min(self.rows.saturating_sub(1));
            }
            'C' => {
                // Cursor Forward
                let n = params_str.parse::<usize>().unwrap_or(1).max(1);
                self.cursor_col = (self.cursor_col + n).min(self.cols.saturating_sub(1));
            }
            'D' => {
                // Cursor Back
                let n = params_str.parse::<usize>().unwrap_or(1).max(1);
                self.cursor_col = self.cursor_col.saturating_sub(n);
            }
            'J' => {
                // Erase in Display
                let mode = params_str.parse::<u8>().unwrap_or(0);
                if mode == 2 || mode == 3 {
                    self.clear_screen();
                } else if mode == 0 {
                    self.clear_line(0);
                    for r in (self.cursor_row + 1)..self.buffer.len() {
                        for cell in &mut self.buffer[r] {
                            *cell = Cell::default();
                        }
                    }
                }
            }
            'K' => {
                // Erase in Line
                let mode = params_str.parse::<u8>().unwrap_or(0);
                self.clear_line(mode);
            }
            's' => {
                // Save cursor position
                self.saved_cursor = (self.cursor_col, self.cursor_row);
            }
            'u' => {
                // Restore cursor position
                self.cursor_col = self.saved_cursor.0.min(self.cols.saturating_sub(1));
                self.cursor_row = self.saved_cursor.1.min(self.rows.saturating_sub(1));
            }
            _ => {}
        }
    }

    fn handle_sgr(&mut self, params_str: &str) {
        if params_str.is_empty() {
            self.current_style = CellStyle::default();
            return;
        }

        let codes: Vec<u32> = params_str
            .split(';')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect();

        let mut idx = 0;
        let count = codes.len();

        while idx < count {
            let code = codes[idx];
            match code {
                0 => self.current_style = CellStyle::default(),
                1 => self.current_style.bold = true,
                2 => self.current_style.dim = true,
                3 => self.current_style.italic = true,
                4 => self.current_style.underline = true,
                7 => self.current_style.inverse = true,
                8 => self.current_style.hidden = true,
                9 => self.current_style.strikethrough = true,
                21 | 22 => {
                    self.current_style.bold = false;
                    self.current_style.dim = false;
                }
                23 => self.current_style.italic = false,
                24 => self.current_style.underline = false,
                27 => self.current_style.inverse = false,
                28 => self.current_style.hidden = false,
                29 => self.current_style.strikethrough = false,
                // Standard Foreground
                30..=37 => self.current_style.fg = AnsiColor::Named((code - 30) as u8),
                38 => {
                    // Extended Foreground: 38;5;n or 38;2;r;g;b
                    if idx + 2 < count && codes[idx + 1] == 5 {
                        let color_idx = codes[idx + 2] as u8;
                        self.current_style.fg = AnsiColor::Palette(color_idx);
                        idx += 2;
                    } else if idx + 4 < count && codes[idx + 1] == 2 {
                        let r = codes[idx + 2] as u8;
                        let g = codes[idx + 3] as u8;
                        let b = codes[idx + 4] as u8;
                        self.current_style.fg = AnsiColor::Rgb(r, g, b);
                        idx += 4;
                    }
                }
                39 => self.current_style.fg = AnsiColor::Default,
                // Standard Background
                40..=47 => self.current_style.bg = AnsiColor::Named((code - 40) as u8),
                48 => {
                    // Extended Background: 48;5;n or 48;2;r;g;b
                    if idx + 2 < count && codes[idx + 1] == 5 {
                        let color_idx = codes[idx + 2] as u8;
                        self.current_style.bg = AnsiColor::Palette(color_idx);
                        idx += 2;
                    } else if idx + 4 < count && codes[idx + 1] == 2 {
                        let r = codes[idx + 2] as u8;
                        let g = codes[idx + 3] as u8;
                        let b = codes[idx + 4] as u8;
                        self.current_style.bg = AnsiColor::Rgb(r, g, b);
                        idx += 4;
                    }
                }
                49 => self.current_style.bg = AnsiColor::Default,
                // High Intensity Foreground
                90..=97 => self.current_style.fg = AnsiColor::Named((code - 90 + 8) as u8),
                // High Intensity Background
                100..=107 => self.current_style.bg = AnsiColor::Named((code - 100 + 8) as u8),
                _ => {}
            }
            idx += 1;
        }
    }

    pub fn visible_lines(&self) -> Vec<RenderedLine> {
        let total = self.buffer.len();
        let start = total.saturating_sub(self.rows);
        let mut rendered_lines = Vec::new();

        for (row_idx, line) in self.buffer[start..].iter().enumerate() {
            let mut spans = Vec::new();
            let mut current_text = String::new();
            let mut active_style = line.first().map(|c| c.style).unwrap_or_default();

            for cell in line {
                if cell.style == active_style {
                    current_text.push(cell.ch);
                } else {
                    if !current_text.is_empty() {
                        spans.push(RenderedSpan {
                            text: current_text,
                            style: active_style,
                        });
                        current_text = String::new();
                    }
                    active_style = cell.style;
                    current_text.push(cell.ch);
                }
            }

            if !current_text.is_empty() {
                spans.push(RenderedSpan {
                    text: current_text,
                    style: active_style,
                });
            }

            // Trim trailing blank spaces from lines
            while let Some(last_span) = spans.last_mut() {
                let trimmed = last_span.text.trim_end_matches(' ');
                if trimmed.is_empty() && last_span.style.bg == AnsiColor::Default {
                    spans.pop();
                } else {
                    if trimmed.len() < last_span.text.len() && last_span.style.bg == AnsiColor::Default {
                        last_span.text = trimmed.to_string();
                    }
                    break;
                }
            }

            rendered_lines.push(RenderedLine {
                line_idx: start + row_idx,
                spans,
            });
        }

        rendered_lines
    }

    pub fn render_lines_html(&self) -> String {
        let mut html = String::with_capacity(4096);
        let lines = self.visible_lines();

        for line in lines {
            html.push_str("<div class=\"vt-line\" style=\"white-space:pre;\">");
            if line.spans.is_empty() {
                html.push_str("&nbsp;");
            } else {
                for span in line.spans {
                    let mut styles = Vec::new();

                    let effective_fg = if span.style.inverse {
                        span.style.bg
                    } else {
                        span.style.fg
                    };
                    let effective_bg = if span.style.inverse {
                        span.style.fg
                    } else {
                        span.style.bg
                    };

                    if effective_fg != AnsiColor::Default {
                        styles.push(format!("color:{};", effective_fg.to_css_color(true, &self.theme)));
                    }
                    if effective_bg != AnsiColor::Default {
                        styles.push(format!("background-color:{};", effective_bg.to_css_color(false, &self.theme)));
                    }
                    if span.style.bold {
                        styles.push("font-weight:bold;".to_string());
                    }
                    if span.style.dim {
                        styles.push("opacity:0.6;".to_string());
                    }
                    if span.style.italic {
                        styles.push("font-style:italic;".to_string());
                    }
                    if span.style.underline {
                        styles.push("text-decoration:underline;".to_string());
                    }
                    if span.style.strikethrough {
                        styles.push("text-decoration:line-through;".to_string());
                    }
                    if span.style.hidden {
                        styles.push("visibility:hidden;".to_string());
                    }

                    let escaped = html_escape(&span.text);
                    if styles.is_empty() {
                        html.push_str(&escaped);
                    } else {
                        html.push_str(&format!("<span style=\"{}\">{}</span>", styles.join(""), escaped));
                    }
                }
            }
            html.push_str("</div>\n");
        }

        html
    }
}

pub fn extract_cgli_markers(input: &str) -> Vec<BridgeAction> {
    let mut actions = Vec::new();
    let marker_prefix = "<<<CGLI:";
    let marker_suffix = ">>>";

    let mut search_idx = 0;
    while let Some(start_pos) = input[search_idx..].find(marker_prefix) {
        let abs_start = search_idx + start_pos;
        if let Some(end_pos) = input[abs_start..].find(marker_suffix) {
            let abs_end = abs_start + end_pos;
            let marker_content = &input[abs_start + marker_prefix.len()..abs_end];
            let mut parts = marker_content.trim().splitn(2, |c: char| c.is_whitespace());
            let action_name = parts.next().unwrap_or("").to_lowercase();
            let json_str = parts.next().unwrap_or("{}");

            if let Ok(mut action) = serde_json::from_str::<BridgeAction>(json_str) {
                if action.action_type.is_empty() {
                    action.action_type = action_name;
                }
                actions.push(action);
            }
            search_idx = abs_end + marker_suffix.len();
        } else {
            break;
        }
    }

    actions
}

fn html_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_themes_exact_values() {
        let dark = TerminalTheme::dark();
        assert_eq!(dark.background, "#0D1117");
        assert_eq!(dark.foreground, "#C9D1D9");
        assert_eq!(dark.cursor, "#58A6FF");

        let light = TerminalTheme::light();
        assert_eq!(light.background, "#F8FAFC");
        assert_eq!(light.foreground, "#1E293B");
        assert_eq!(light.cursor, "#0284C7");

        let ps = TerminalTheme::powershell();
        assert_eq!(ps.background, "#012456");
        assert_eq!(ps.foreground, "#EEEDF0");
        assert_eq!(ps.blue, "#3B78FF");
    }

    #[test]
    fn test_feed_plain_text_and_cursor_movement() {
        let mut screen = TerminalScreen::new(80, 24);
        screen.feed_str("Hello World!\r\nLine 2");
        assert_eq!(screen.cursor_col, 6);
        assert_eq!(screen.cursor_row, 1);

        let lines = screen.visible_lines();
        assert_eq!(lines[0].spans[0].text, "Hello World!");
        assert_eq!(lines[1].spans[0].text, "Line 2");
    }

    #[test]
    fn test_ansi_colors_and_sgr() {
        let mut screen = TerminalScreen::new(80, 24);
        // Red bold text, then reset
        screen.feed_str("\x1b[1;31mRed Alert\x1b[0m Normal");
        let lines = screen.visible_lines();
        assert_eq!(lines[0].spans.len(), 2);
        assert_eq!(lines[0].spans[0].text, "Red Alert");
        assert!(lines[0].spans[0].style.bold);
        assert_eq!(lines[0].spans[0].style.fg, AnsiColor::Named(1));

        assert_eq!(lines[0].spans[1].text, " Normal");
        assert!(!lines[0].spans[1].style.bold);
        assert_eq!(lines[0].spans[1].style.fg, AnsiColor::Default);
    }

    #[test]
    fn test_ansi_truecolor_and_256_colors() {
        let mut screen = TerminalScreen::new(80, 24);
        // TrueColor RGB 38;2;12;34;56 and 256 color bg 48;5;200
        screen.feed_str("\x1b[38;2;12;34;56;48;5;200mColorized\x1b[0m");
        let lines = screen.visible_lines();
        assert_eq!(lines[0].spans[0].style.fg, AnsiColor::Rgb(12, 34, 56));
        assert_eq!(lines[0].spans[0].style.bg, AnsiColor::Palette(200));

        let html = screen.render_lines_html();
        assert!(html.contains("color:#0C2238"));
    }

    #[test]
    fn test_osc_and_clear_screen_escape_handling() {
        let mut screen = TerminalScreen::new(80, 24);
        // OSC set window title should be ignored
        screen.feed_str("\x1b]0;CGLI Console\x07Text Before\x1b[2JText After");
        let lines = screen.visible_lines();
        assert_eq!(lines[0].spans[0].text, "Text After");
    }

    #[test]
    fn test_extract_cgli_markers() {
        let pty_output = "Compiling project...\r\n<<<CGLI:CREATE_ARTIFACT {\"title\": \"Spec 1\", \"content\": \"# Content\"}>>>\r\nDone!\r\n<<<CGLI:SPAWN_SUBAGENT {\"role\": \"executor\", \"task\": \"build\"}>>>\r\n";
        let actions = extract_cgli_markers(pty_output);
        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0].action_type, "create_artifact");
        assert_eq!(actions[0].title.as_deref(), Some("Spec 1"));
        assert_eq!(actions[0].content.as_deref(), Some("# Content"));

        assert_eq!(actions[1].action_type, "spawn_subagent");
        assert_eq!(actions[1].role.as_deref(), Some("executor"));
        assert_eq!(actions[1].task.as_deref(), Some("build"));
    }

    #[test]
    fn test_render_lines_html() {
        let mut screen = TerminalScreen::new(80, 24);
        screen.feed_str("\x1b[32m<Success & Finished>\x1b[0m");
        let html = screen.render_lines_html();
        assert!(html.contains("&lt;Success &amp; Finished&gt;"));
        assert!(html.contains("color:#3FB950")); // Green in dark theme
    }
}
