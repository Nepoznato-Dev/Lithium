//! Exact Rust port of Lithium's JS markdown renderer.
//! Emits the same HTML structure and `md-*` classes so existing CSS applies.

fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            c => out.push(c),
        }
    }
    out
}

/// Leftmost-scan replacement of `open … close` pairs whose content contains
/// none of the `banned` chars (mirrors the JS regex-based transforms).
fn pair_replace(s: &str, open: &str, banned: &str, tag_open: &str, tag_close: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find(open) {
        out.push_str(&rest[..i]);
        let after = &rest[i + open.len()..];
        let valid = match after.find(open) {
            Some(p) => {
                let content = &after[..p];
                !content.is_empty() && !content.chars().any(|c| banned.contains(c))
            }
            None => false,
        };
        if valid {
            let p = after.find(open).unwrap();
            out.push_str(tag_open);
            out.push_str(&after[..p]);
            out.push_str(tag_close);
            rest = &after[p + open.len()..];
        } else {
            out.push_str(open);
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// ![alt](url) — only http/data urls render as images, otherwise the alt text.
fn images(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("![" ) {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let mut advanced = false;
        if let Some(j) = after.find(']') {
            if after[j + 1..].starts_with('(') {
                let url_rest = &after[j + 2..];
                if let Some(k) = url_rest.find(')') {
                    let alt = &after[..j];
                    let url = &url_rest[..k];
                    if !url.is_empty()
                        && !url.contains(char::is_whitespace)
                        && (url.starts_with("http") || url.starts_with("data:"))
                    {
                        out.push_str(&format!(
                            "<img src=\"{}\" alt=\"{}\" style=\"max-width:100%;border-radius:8px\" />",
                            url, alt
                        ));
                    } else {
                        out.push_str(alt);
                    }
                    rest = &url_rest[k + 1..];
                    advanced = true;
                }
            }
        }
        if !advanced {
            out.push_str("![");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// [label](url) — only http or root-relative urls become anchors.
fn links(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('[') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let mut advanced = false;
        if i == 0 || rest.as_bytes()[i - 1] != b'!' {
            if let Some(j) = after.find(']') {
                if j > 0 && after[j + 1..].starts_with('(') {
                    let url_rest = &after[j + 2..];
                    if let Some(k) = url_rest.find(')') {
                        if k > 0 {
                            let label = &after[..j];
                            let url = &url_rest[..k];
                            if !url.contains(char::is_whitespace)
                                && (url.starts_with("http") || url.starts_with('/'))
                            {
                                out.push_str(&format!(
                                    "<a href=\"{}\" target=\"_blank\" rel=\"noreferrer\" class=\"md-link\">{}</a>",
                                    url, label
                                ));
                            } else {
                                // JS parity: rejected links collapse to just the label.
                                out.push_str(label);
                            }
                            rest = &url_rest[k + 1..];
                            advanced = true;
                        }
                    }
                }
            }
        }
        if !advanced {
            out.push('[');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// [[Target]] or [[Target|alias]] — Obsidian-style wiki links.
fn wiki(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("[[") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let mut advanced = false;
        if let Some(te) = after.find(|c| c == ']' || c == '|') {
            if te > 0 {
                let target = after[..te].trim();
                let next = &after[te..];
                if next.starts_with('|') {
                    let stripped = &next[1..];
                    if let Some(ae) = stripped.find(']') {
                        if ae > 0 && stripped[ae + 1..].starts_with(']') {
                            let alias = stripped[..ae].trim();
                            out.push_str(&format!(
                                "<a href=\"#\" data-wiki=\"{}\" class=\"md-wiki\">{}</a>",
                                target,
                                if alias.is_empty() { target } else { alias }
                            ));
                            rest = &stripped[ae + 2..];
                            advanced = true;
                        }
                    }
                } else if next.starts_with("]]") && !target.is_empty() {
                    out.push_str(&format!(
                        "<a href=\"#\" data-wiki=\"{}\" class=\"md-wiki\">{}</a>",
                        target, target
                    ));
                    rest = &next[2..];
                    advanced = true;
                }
            }
        }
        if !advanced {
            out.push_str("[[");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// *italic* — single stars not preceded by another star, no newline inside.
fn italic(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('*') {
        let prev_star = i > 0 && rest.as_bytes()[i - 1] == b'*';
        if prev_star {
            out.push_str(&rest[..i + 1]);
            rest = &rest[i + 1..];
            continue;
        }
        let after = &rest[i + 1..];
        match after.find('*') {
            Some(p) => {
                let content = &after[..p];
                if !content.is_empty() && !content.contains('\n') {
                    out.push_str(&rest[..i]);
                    out.push_str("<em>");
                    out.push_str(content);
                    out.push_str("</em>");
                    rest = &after[p + 1..];
                } else {
                    out.push_str(&rest[..i + 1]);
                    rest = after;
                }
            }
            None => {
                out.push_str(rest);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

fn inline(text: &str) -> String {
    let mut out = escape_html(text);
    out = images(&out);
    out = links(&out);
    out = wiki(&out);
    out = pair_replace(&out, "**", "*", "<strong>", "</strong>");
    out = italic(&out);
    out = pair_replace(&out, "~~", "~", "<del>", "</del>");
    out = pair_replace(&out, "`", "`", "<code class=\"md-code\">", "</code>");
    out = pair_replace(&out, "==", "=", "<mark class=\"md-mark\">", "</mark>");
    out
}

/* ---------- Block-level helpers ---------- */

fn heading(line: &str) -> Option<(usize, &str)> {
    let b = line.as_bytes();
    let mut n = 0;
    while n < b.len() && n < 6 && b[n] == b'#' {
        n += 1;
    }
    if n == 0 || n >= b.len() || !matches!(b[n], b' ' | b'\t') {
        return None;
    }
    let rest = line[n..].trim_start_matches([' ', '\t']);
    Some((n, rest))
}

fn is_hr(line: &str) -> bool {
    let t = line.trim();
    t.len() >= 3 && (t.bytes().all(|c| c == b'-') || t.bytes().all(|c| c == b'*') || t.bytes().all(|c| c == b'_'))
}

fn quote_content(line: &str) -> Option<&str> {
    let rest = line.strip_prefix('>')?;
    // JS parity: /^>\s?/ strips at most one whitespace char.
    Some(match rest.as_bytes().first() {
        Some(b' ' | b'\t') => &rest[1..],
        _ => rest,
    })
}

fn task_item(line: &str) -> Option<(bool, &str)> {
    let t = line.trim_start_matches([' ', '\t']);
    let b = t.as_bytes();
    if b.is_empty() || !matches!(b[0], b'-' | b'*' | b'+') {
        return None;
    }
    let rest = t[1..].trim_start_matches([' ', '\t']);
    let rb = rest.as_bytes();
    if rb.len() < 4 || rb[0] != b'[' || rb[2] != b']' {
        return None;
    }
    if !matches!(rb[1], b' ' | b'x' | b'X') {
        return None;
    }
    if !matches!(rb[3], b' ' | b'\t') {
        return None;
    }
    Some((rb[1] != b' ', rest[3..].trim_start_matches([' ', '\t'])))
}

fn ul_item(line: &str) -> Option<&str> {
    let t = line.trim_start_matches([' ', '\t']);
    let b = t.as_bytes();
    if b.is_empty() || !matches!(b[0], b'-' | b'*' | b'+') {
        return None;
    }
    let rest = &t[1..];
    if !matches!(rest.as_bytes().first(), Some(b' ' | b'\t')) {
        return None;
    }
    Some(rest.trim_start_matches([' ', '\t']))
}

fn ol_item(line: &str) -> Option<&str> {
    let t = line.trim_start_matches([' ', '\t']);
    let digits = t.bytes().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return None;
    }
    let rest = &t[digits..];
    if !rest.starts_with('.') {
        return None;
    }
    let after = &rest[1..];
    if !matches!(after.as_bytes().first(), Some(b' ' | b'\t')) {
        return None;
    }
    Some(after.trim_start_matches([' ', '\t']))
}

fn is_structural(line: &str) -> bool {
    line.trim().is_empty()
        || heading(line).is_some()
        || line.starts_with("```")
        || quote_content(line).is_some()
        || ul_item(line).is_some()
        || ol_item(line).is_some()
}

/// Render markdown source to an HTML string (same output classes as the JS version).
pub fn render(src: &str) -> String {
    let lines: Vec<&str> = src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let mut html: Vec<String> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        // Code fence
        if line.starts_with("```") {
            let mut buffer: Vec<&str> = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].starts_with("```") {
                buffer.push(lines[i]);
                i += 1;
            }
            i += 1;
            html.push(format!(
                "<pre class=\"md-pre\"><code>{}</code></pre>",
                escape_html(&buffer.join("\n"))
            ));
            continue;
        }

        // Heading
        if let Some((level, content)) = heading(line) {
            html.push(format!(
                "<h{level} class=\"md-h md-h{level}\">{}</h{level}>",
                inline(content)
            ));
            i += 1;
            continue;
        }

        // Horizontal rule
        if is_hr(line) {
            html.push("<hr class=\"md-hr\" />".into());
            i += 1;
            continue;
        }

        // Blockquote (collect consecutive)
        if quote_content(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                match quote_content(lines[i]) {
                    Some(content) => {
                        buffer.push(inline(content));
                        i += 1;
                    }
                    None => break,
                }
            }
            html.push(format!("<blockquote class=\"md-quote\">{}</blockquote>", buffer.join("<br/>")));
            continue;
        }

        // Task list
        if task_item(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                match task_item(lines[i]) {
                    Some((done, content)) => {
                        buffer.push(format!(
                            "<li class=\"md-task {}\"><span class=\"md-task-box\">{}</span>{}</li>",
                            if done { "done" } else { "" },
                            if done { "\u{2611}" } else { "\u{2610}" },
                            inline(content)
                        ));
                        i += 1;
                    }
                    None => break,
                }
            }
            html.push(format!("<ul class=\"md-list md-tasks\">{}</ul>", buffer.join("")));
            continue;
        }

        // Unordered list
        if ul_item(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                if task_item(lines[i]).is_some() {
                    break;
                }
                match ul_item(lines[i]) {
                    Some(content) => {
                        buffer.push(format!("<li>{}</li>", inline(content)));
                        i += 1;
                    }
                    None => break,
                }
            }
            html.push(format!("<ul class=\"md-list\">{}</ul>", buffer.join("")));
            continue;
        }

        // Ordered list
        if ol_item(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                match ol_item(lines[i]) {
                    Some(content) => {
                        buffer.push(format!("<li>{}</li>", inline(content)));
                        i += 1;
                    }
                    None => break,
                }
            }
            html.push(format!("<ol class=\"md-list\">{}</ol>", buffer.join("")));
            continue;
        }

        // Blank line
        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        // Paragraph (collect until blank/structural line)
        let mut buffer: Vec<String> = vec![inline(line)];
        i += 1;
        while i < lines.len() && !is_structural(lines[i]) {
            buffer.push(inline(lines[i]));
            i += 1;
        }
        html.push(format!("<p class=\"md-p\">{}</p>", buffer.join("<br/>")));
    }

    html.join("\n")
}

/// Extract all unique [[wiki link]] targets in order of appearance.
pub fn wiki_links(src: &str) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    let mut rest = src;
    while let Some(i) = rest.find("[[") {
        let after = &rest[i + 2..];
        let mut advanced = false;
        if let Some(te) = after.find(|c| c == ']' || c == '|') {
            if te > 0 {
                let target = after[..te].trim().to_string();
                let next = &after[te..];
                if next.starts_with('|') {
                    let stripped = &next[1..];
                    if let Some(ae) = stripped.find(']') {
                        if ae > 0 && stripped[ae + 1..].starts_with(']') {
                            if !found.contains(&target) {
                                found.push(target);
                            }
                            rest = &stripped[ae + 2..];
                            advanced = true;
                        }
                    }
                } else if next.starts_with("]]") {
                    if !target.is_empty() && !found.contains(&target) {
                        found.push(target);
                    }
                    rest = &next[2..];
                    advanced = true;
                }
            }
        }
        if !advanced {
            rest = after;
        }
    }
    found
}

/* ---------- Enhanced Obsidian/GFM Renderer ---------- */

use std::collections::HashMap;

/// Safe inline HTML tags to preserve
const SAFE_TAGS: &[&str] = &["u", "/u", "kbd", "/kbd", "sup", "/sup", "sub", "/sub", "br", "br/", "mark", "/mark", "ins", "/ins"];

/// Callout type configuration
struct CalloutConfig {
    icon: &'static str,
    cls: &'static str,
}

fn get_callout_config(callout_type: &str) -> CalloutConfig {
    match callout_type {
        "note" => CalloutConfig { icon: "📝", cls: "md-callout-note" },
        "tip" => CalloutConfig { icon: "💡", cls: "md-callout-tip" },
        "important" => CalloutConfig { icon: "⭐", cls: "md-callout-important" },
        "warning" => CalloutConfig { icon: "⚠️", cls: "md-callout-warning" },
        "caution" => CalloutConfig { icon: "🔥", cls: "md-callout-caution" },
        "info" => CalloutConfig { icon: "ℹ️", cls: "md-callout-info" },
        "example" => CalloutConfig { icon: "📌", cls: "md-callout-example" },
        "quote" => CalloutConfig { icon: "💬", cls: "md-callout-quote" },
        "bug" => CalloutConfig { icon: "🐛", cls: "md-callout-bug" },
        "fail" => CalloutConfig { icon: "❌", cls: "md-callout-fail" },
        "success" => CalloutConfig { icon: "✅", cls: "md-callout-success" },
        "question" => CalloutConfig { icon: "❓", cls: "md-callout-question" },
        "abstract" => CalloutConfig { icon: "📋", cls: "md-callout-abstract" },
        "todo" => CalloutConfig { icon: "☑️", cls: "md-callout-todo" },
        _ => CalloutConfig { icon: "📝", cls: "md-callout-note" },
    }
}

/// Protect safe HTML tags before escaping
fn protect_html(text: &str) -> (String, Vec<String>) {
    let mut stash: Vec<String> = Vec::new();
    let mut out = String::new();
    let mut rest = text;
    
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        let after = &rest[i..];
        
        // Find the closing >
        if let Some(end) = after.find('>') {
            let tag_full = &after[..=end];
            // Extract tag name
            let inner = &after[1..end];
            let tag_name = inner.split(|c: char| c.is_whitespace())
                .next()
                .unwrap_or("")
                .to_lowercase();
            
            // Check if it's a safe tag
            let is_safe = SAFE_TAGS.iter().any(|t| *t == tag_name) ||
                          SAFE_TAGS.iter().any(|t| *t == tag_full.trim_start_matches('<').trim_end_matches('>').trim_end_matches('/').to_lowercase());
            
            if is_safe {
                let idx = stash.len();
                stash.push(tag_full.to_string());
                out.push_str(&format!("⟦MDHTML{}⟧", idx));
                rest = &after[end + 1..];
            } else {
                out.push('<');
                rest = &after[1..];
            }
        } else {
            out.push('<');
            rest = &after[1..];
        }
    }
    out.push_str(rest);
    (out, stash)
}

/// Restore protected HTML tags
fn restore_html(text: &str, stash: &[String]) -> String {
    let mut out = String::new();
    let mut rest = text;
    
    while let Some(i) = rest.find("⟦MDHTML") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 7..];
        if let Some(end) = after.find('⟧') {
            if let Ok(idx) = after[..end].parse::<usize>() {
                if idx < stash.len() {
                    out.push_str(&stash[idx]);
                }
                rest = &after[end + 1..];
            } else {
                out.push_str("⟦MDHTML");
                rest = after;
            }
        } else {
            out.push_str("⟦MDHTML");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// Enhanced inline processing with all Obsidian/GFM features
fn inline_enhanced(text: &str, ref_links: &HashMap<String, (String, String)>) -> String {
    // 1. Protect safe HTML tags
    let (protected, stash) = protect_html(text);
    let mut out = escape_html(&protected);
    
    // Inline math $...$
    out = replace_inline_math(&out);
    
    // Images ![alt](url)
    out = replace_images(&out);
    
    // Links [text](url)
    out = replace_links(&out, ref_links);
    
    // Reference-style links [text][ref]
    out = replace_ref_links(&out, ref_links);
    
    // Wiki links [[Note]]
    out = replace_wiki_links(&out);
    
    // Embeds ![[Note]]
    out = replace_embeds(&out);
    
    // Footnote references [^id]
    out = replace_footnote_refs(&out);
    
    // @mentions
    out = replace_mentions(&out);
    
    // Issue references #123
    out = replace_issue_refs(&out);
    
    // Auto-link URLs
    out = replace_auto_links(&out);
    
    // Emphasis (bold/italic)
    out = replace_emphasis(&out);
    
    // Strikethrough
    out = pair_replace(&out, "~~", "~", "<del>", "</del>");
    
    // Inline code
    out = pair_replace(&out, "`", "`", "<code class=\"md-code\">", "</code>");
    
    // Highlights ==text==
    out = pair_replace(&out, "==", "=", "<mark class=\"md-mark\">", "</mark>");
    
    // Superscript ^text^
    out = replace_superscript(&out);
    
    // Subscript ~text~
    out = replace_subscript(&out);
    
    // Tags #tag
    out = replace_tags(&out);
    
    // 2. Restore protected HTML tags
    restore_html(&out, &stash)
}

fn replace_inline_math(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('$') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        if let Some(end) = after.find('$') {
            let content = &after[..end];
            if !content.is_empty() && !content.contains('\n') {
                out.push_str(&format!("<span class=\"md-math-inline\">\\({}\\)</span>", content));
                rest = &after[end + 1..];
            } else {
                out.push('$');
                rest = after;
            }
        } else {
            out.push('$');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_images(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("![") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let mut advanced = false;
        if let Some(j) = after.find(']') {
            if after[j + 1..].starts_with('(') {
                let url_rest = &after[j + 2..];
                if let Some(k) = url_rest.find(')') {
                    let alt = &after[..j];
                    let url_part = &url_rest[..k];
                    // Parse URL and optional title
                    let (url, title) = if let Some(ti) = url_part.find(" \"") {
                        (&url_part[..ti], Some(&url_part[ti + 2..url_part.len() - 1]))
                    } else {
                        (url_part, None)
                    };
                    if !url.is_empty() && !url.contains(char::is_whitespace)
                        && (url.starts_with("http") || url.starts_with("data:"))
                    {
                        let title_attr = title.map(|t| format!(" title=\"{}\"", t)).unwrap_or_default();
                        out.push_str(&format!(
                            "<img src=\"{}\" alt=\"{}\"{} style=\"max-width:100%;border-radius:8px\" />",
                            url, alt, title_attr
                        ));
                    } else {
                        out.push_str(alt);
                    }
                    rest = &url_rest[k + 1..];
                    advanced = true;
                }
            }
        }
        if !advanced {
            out.push_str("![");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_links(s: &str, _ref_links: &HashMap<String, (String, String)>) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('[') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let mut advanced = false;
        if i == 0 || rest.as_bytes()[i - 1] != b'!' {
            if let Some(j) = after.find(']') {
                if j > 0 && after[j + 1..].starts_with('(') {
                    let url_rest = &after[j + 2..];
                    if let Some(k) = url_rest.find(')') {
                        if k > 0 {
                            let label = &after[..j];
                            let url_part = &url_rest[..k];
                            let (url, title) = if let Some(ti) = url_part.find(" \"") {
                                (&url_part[..ti], Some(&url_part[ti + 2..url_part.len() - 1]))
                            } else {
                                (url_part, None)
                            };
                            if !url.contains(char::is_whitespace)
                                && (url.starts_with("http") || url.starts_with('/'))
                            {
                                let title_attr = title.map(|t| format!(" title=\"{}\"", t)).unwrap_or_default();
                                out.push_str(&format!(
                                    "<a href=\"{}\"{} target=\"_blank\" rel=\"noreferrer\" class=\"md-link\">{}</a>",
                                    url, title_attr, label
                                ));
                            } else {
                                out.push_str(label);
                            }
                            rest = &url_rest[k + 1..];
                            advanced = true;
                        }
                    }
                }
            }
        }
        if !advanced {
            out.push('[');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_ref_links(s: &str, ref_links: &HashMap<String, (String, String)>) -> String {
    if ref_links.is_empty() {
        return s.to_string();
    }
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('[') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let mut advanced = false;
        if let Some(j) = after.find(']') {
            let label = &after[..j];
            let after_label = &after[j + 1..];
            if after_label.starts_with('[') {
                if let Some(k) = after_label[1..].find(']') {
                    let ref_key = &after_label[1..k + 1];
                    let key = if ref_key.is_empty() { label.to_lowercase() } else { ref_key.to_lowercase() };
                    if let Some((url, title)) = ref_links.get(&key) {
                        let title_attr = if !title.is_empty() { format!(" title=\"{}\"", title) } else { String::new() };
                        out.push_str(&format!(
                            "<a href=\"{}\"{} target=\"_blank\" rel=\"noreferrer\" class=\"md-link\">{}</a>",
                            url, title_attr, label
                        ));
                        rest = &after_label[k + 2..];
                        advanced = true;
                    }
                }
            }
        }
        if !advanced {
            out.push('[');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_wiki_links(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("[[") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let mut advanced = false;
        // Find the end of the wiki link
        let mut target_end = None;
        let mut section = None;
        let mut alias = None;
        let mut pos = 0;
        let bytes = after.as_bytes();
        while pos < bytes.len() {
            if bytes[pos] == b'#' && section.is_none() && target_end.is_none() {
                target_end = Some(pos);
                let section_start = pos + 1;
                if let Some(end) = after[section_start..].find("]]") {
                    section = Some(&after[section_start..section_start + end]);
                }
            } else if bytes[pos] == b'|' && alias.is_none() {
                if target_end.is_none() {
                    target_end = Some(pos);
                }
                alias = Some(&after[pos + 1..]);
                break;
            } else if bytes[pos] == b']' && pos + 1 < bytes.len() && bytes[pos + 1] == b']' {
                if target_end.is_none() {
                    target_end = Some(pos);
                }
                break;
            }
            pos += 1;
        }
        
        if let Some(te) = target_end {
            let target = after[..te].trim();
            if !target.is_empty() {
                let display = alias.map(|a| a.trim()).unwrap_or(target);
                let section_attr = section.map(|s| format!(" data-section=\"{}\"", s.trim())).unwrap_or_default();
                out.push_str(&format!(
                    "<a href=\"#\" data-wiki=\"{}\"{} class=\"md-wiki\">{}</a>",
                    target, section_attr, display
                ));
                // Find the closing ]]
                if let Some(close) = after.find("]]") {
                    rest = &after[close + 2..];
                    advanced = true;
                }
            }
        }
        if !advanced {
            out.push_str("[[");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_embeds(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("![[") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 3..];
        let mut advanced = false;
        if let Some(end) = after.find("]]") {
            let content = &after[..end];
            let (target, section) = if let Some(si) = content.find('#') {
                (&content[..si], Some(&content[si + 1..]))
            } else {
                (content, None)
            };
            if !target.is_empty() {
                let section_attr = section.map(|s| format!(" data-section=\"{}\"", s.trim())).unwrap_or_default();
                let section_display = section.map(|s| format!(" → {}", s.trim())).unwrap_or_default();
                out.push_str(&format!(
                    "<span class=\"md-embed\" data-embed=\"{}\"{}>📎 {}{}</span>",
                    target.trim(), section_attr, target.trim(), section_display
                ));
                rest = &after[end + 2..];
                advanced = true;
            }
        }
        if !advanced {
            out.push_str("![[");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_footnote_refs(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("[^") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        if let Some(end) = after.find(']') {
            let id = &after[..end];
            if !id.is_empty() && !id.contains(']') {
                out.push_str(&format!(
                    "<sup class=\"md-footnote-ref\"><a href=\"#fn-{}\" id=\"fnref-{}\">{}</a></sup>",
                    id, id, id
                ));
                rest = &after[end + 1..];
            } else {
                out.push_str("[^");
                rest = after;
            }
        } else {
            out.push_str("[^");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_mentions(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    let mut i = 0;
    let bytes = rest.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'@' {
            // Check if it's a valid mention
            let after = &rest[i + 1..];
            let after_bytes = after.as_bytes();
            let mut end;
            // First char must be alphanumeric
            if !after_bytes.is_empty() && (after_bytes[0].is_ascii_alphanumeric()) {
                end = 1;
                while end < after_bytes.len() {
                    let c = after_bytes[end];
                    if c.is_ascii_alphanumeric() || c == b'-' {
                        end += 1;
                    } else {
                        break;
                    }
                }
                // Last char must be alphanumeric
                if end > 1 && after_bytes[end - 1].is_ascii_alphanumeric() {
                    let username = &after[..end];
                    out.push_str(&format!(
                        "<a href=\"https://github.com/{}\" target=\"_blank\" rel=\"noreferrer\" class=\"md-mention\">@{}</a>",
                        username, username
                    ));
                    rest = &after[end..];
                    i = 0;
                    continue;
                }
            }
        }
        out.push(rest.as_bytes()[i] as char);
        rest = &rest[1..];
    }
    out.push_str(rest);
    out
}

fn replace_issue_refs(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    let mut i = 0;
    while i < rest.len() {
        if rest.as_bytes()[i] == b'#' {
            // Check if preceded by word char
            if i > 0 && (rest.as_bytes()[i - 1].is_ascii_alphanumeric() || rest.as_bytes()[i - 1] == b'_') {
                out.push('#');
                i += 1;
                continue;
            }
            let after = &rest[i + 1..];
            let mut end = 0;
            let after_bytes = after.as_bytes();
            while end < after_bytes.len() && after_bytes[end].is_ascii_digit() {
                end += 1;
            }
            if end > 0 {
                // Check if followed by word char
                if end < after_bytes.len() && (after_bytes[end].is_ascii_alphanumeric() || after_bytes[end] == b'_') {
                    out.push('#');
                    i += 1;
                    continue;
                }
                let num = &after[..end];
                out.push_str(&format!("<a href=\"#\" class=\"md-issue-ref\">#{}</a>", num));
                rest = &after[end..];
                i = 0;
                continue;
            }
        }
        out.push(rest.as_bytes()[i] as char);
        i += 1;
    }
    out.push_str(rest);
    out
}

fn replace_auto_links(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("http") {
        out.push_str(&rest[..i]);
        let after = &rest[i..];
        // Find end of URL
        let mut end = 0;
        let bytes = after.as_bytes();
        while end < bytes.len() {
            let c = bytes[end];
            if c.is_ascii_whitespace() || c == b'<' || c == b'>' || c == b'"' {
                break;
            }
            end += 1;
        }
        if end > 4 {
            // Check if already in a link
            let before = &rest[..i];
            let in_link = before.contains("href=\"") || before.contains("src=\"");
            if !in_link {
                let url = &after[..end];
                out.push_str(&format!(
                    "<a href=\"{}\" target=\"_blank\" rel=\"noreferrer\" class=\"md-link\">{}</a>",
                    url, url
                ));
            } else {
                out.push_str(&after[..end]);
            }
            rest = &after[end..];
        } else {
            out.push_str(&after[..end.min(4)]);
            rest = &after[end.min(4)..];
        }
    }
    out.push_str(rest);
    out
}

fn replace_emphasis(s: &str) -> String {
    let mut out = s.to_string();
    // Bold-italic ***text***
    out = pair_replace(&out, "***", "*", "<strong><em>", "</em></strong>");
    // Bold **text**
    out = pair_replace(&out, "**", "*", "<strong>", "</strong>");
    // Italic *text*
    out = italic(&out);
    // Bold-italic ___text___
    out = pair_replace(&out, "___", "_", "<strong><em>", "</em></strong>");
    // Bold __text__
    out = pair_replace(&out, "__", "_", "<strong>", "</strong>");
    // Italic _text_
    out = pair_replace(&out, "_", "_", "<em>", "</em>");
    out
}

fn replace_superscript(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('^') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        // Check not preceded by ^
        if i > 0 && rest.as_bytes()[i - 1] == b'^' {
            out.push('^');
            rest = after;
            continue;
        }
        if let Some(end) = after.find('^') {
            let content = &after[..end];
            if !content.is_empty() && !content.contains(char::is_whitespace) && !content.contains('^') {
                // Check not followed by ^
                if end + 1 >= after.len() || after.as_bytes()[end + 1] != b'^' {
                    out.push_str(&format!("<sup class=\"md-sup\">{}</sup>", content));
                    rest = &after[end + 1..];
                } else {
                    out.push('^');
                    rest = after;
                }
            } else {
                out.push('^');
                rest = after;
            }
        } else {
            out.push('^');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_subscript(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('~') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        // Check not preceded by ~ (that would be ~~)
        if i > 0 && rest.as_bytes()[i - 1] == b'~' {
            out.push('~');
            rest = after;
            continue;
        }
        // Check not followed by ~ (that would be ~~)
        if after.starts_with('~') {
            out.push('~');
            rest = after;
            continue;
        }
        if let Some(end) = after.find('~') {
            let content = &after[..end];
            if !content.is_empty() && !content.contains(char::is_whitespace) && !content.contains('~') {
                // Check not followed by ~
                if end + 1 >= after.len() || after.as_bytes()[end + 1] != b'~' {
                    out.push_str(&format!("<sub class=\"md-sub\">{}</sub>", content));
                    rest = &after[end + 1..];
                } else {
                    out.push('~');
                    rest = after;
                }
            } else {
                out.push('~');
                rest = after;
            }
        } else {
            out.push('~');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn replace_tags(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('#') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        // Check preceded by whitespace or start of string
        let valid_prefix = i == 0 || rest.as_bytes()[i - 1].is_ascii_whitespace();
        if !valid_prefix {
            out.push('#');
            rest = after;
            continue;
        }
        let bytes = after.as_bytes();
        if bytes.is_empty() || !bytes[0].is_ascii_alphabetic() {
            out.push('#');
            rest = after;
            continue;
        }
        let mut end = 0;
        while end < bytes.len() {
            let c = bytes[end];
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'/' || c == b'-' {
                end += 1;
            } else {
                break;
            }
        }
        if end > 0 {
            let tag = &after[..end];
            out.push_str(&format!("<span class=\"md-tag\">#{}</span>", tag));
            rest = &after[end..];
        } else {
            out.push('#');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// Parse a table row into cells
fn parse_table_row(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    let trimmed = trimmed.strip_prefix('|').unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix('|').unwrap_or(trimmed);
    trimmed.split('|').map(|c| c.trim().to_string()).collect()
}

/// Check if line is a table separator
fn is_table_sep(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.contains('-') {
        return false;
    }
    // Must match pattern like |:?:-+:?:|
    // Simple check: contains only |, -, :, and whitespace
    trimmed.chars().all(|c| c == '|' || c == '-' || c == ':' || c.is_whitespace())
        && trimmed.contains('-')
        && (trimmed.contains('|') || trimmed.chars().all(|c| c == '-' || c == ':' || c.is_whitespace()))
}

/// Check if line is a table header
fn is_table_header(line: &str) -> bool {
    if !line.contains('|') {
        return false;
    }
    let trimmed = line.trim();
    // Must have at least one | that acts as column separator
    trimmed.contains("| ") || trimmed.contains(" |") || trimmed.starts_with('|') || trimmed.ends_with('|')
}

/// Render a table
fn render_table(header: &str, sep: &str, body: &[&str], ref_links: &HashMap<String, (String, String)>, source_line: usize) -> String {
    let headers = parse_table_row(header);
    let aligns: Vec<&str> = parse_table_row(sep).iter().map(|c| {
        let c = c.trim();
        if c.starts_with(':') && c.ends_with(':') {
            "center"
        } else if c.ends_with(':') {
            "right"
        } else {
            "left"
        }
    }).collect();
    
    let mut html = format!("<div class=\"md-table-wrap\" data-source-line=\"{}\"><table class=\"md-table\"><thead><tr>", source_line);
    for (i, h) in headers.iter().enumerate() {
        let align = aligns.get(i).copied().unwrap_or("left");
        html.push_str(&format!("<th style=\"text-align:{}\">{}</th>", align, inline_enhanced(h, ref_links)));
    }
    html.push_str("</tr></thead><tbody>");
    
    for row in body {
        let cells = parse_table_row(row);
        html.push_str("<tr>");
        for (i, c) in cells.iter().enumerate() {
            let align = aligns.get(i).copied().unwrap_or("left");
            html.push_str(&format!("<td style=\"text-align:{}\">{}</td>", align, inline_enhanced(c, ref_links)));
        }
        html.push_str("</tr>");
    }
    
    html.push_str("</tbody></table></div>");
    html
}

/// Parse callout from blockquote lines
fn parse_callout(lines: &[&str]) -> Option<(String, String, Vec<String>)> {
    let first = lines.first()?;
    // Match > [!TYPE] or > [!TYPE] Title
    let stripped = first.strip_prefix(">")?.trim_start();
    if !stripped.starts_with("[!") {
        return None;
    }
    let after = &stripped[2..];
    let end = after.find(']')?;
    let callout_type = after[..end].to_lowercase();
    let rest = after[end + 1..].trim();
    let title = if rest.is_empty() {
        callout_type.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default() + &callout_type[1..]
    } else {
        rest.to_string()
    };
    
    let mut body: Vec<String> = Vec::new();
    for line in lines.iter().skip(1) {
        let stripped = line.strip_prefix(">").unwrap_or(line);
        let stripped = stripped.strip_prefix(' ').unwrap_or(stripped);
        body.push(stripped.to_string());
    }
    
    Some((callout_type, title, body))
}

/// Enhanced markdown renderer with full Obsidian/GFM support
pub fn render_enhanced(src: &str) -> String {
    let lines: Vec<&str> = src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let mut html: Vec<String> = Vec::new();
    let mut footnotes: HashMap<String, String> = HashMap::new();
    let mut ref_links: HashMap<String, (String, String)> = HashMap::new();
    
    // First pass: collect footnote definitions and reference links, tracking original line numbers
    let mut content_lines: Vec<&str> = Vec::new();
    let mut line_map: Vec<usize> = Vec::new();
    for (orig_idx, line) in lines.iter().enumerate() {
        // Footnote definition [^id]: text
        if line.starts_with("[^") {
            if let Some(colon) = line.find("]: ") {
                let id = &line[2..colon];
                let text = &line[colon + 3..];
                footnotes.insert(id.to_string(), text.to_string());
                continue;
            }
        }
        // Reference link [ref]: url "title"
        if line.starts_with('[') && !line.starts_with("[[") {
            if let Some(colon) = line.find("]: ") {
                let key = &line[1..colon].to_lowercase();
                let rest = &line[colon + 3..];
                let (url, title) = if let Some(space) = rest.find(' ') {
                    if rest[space..].contains('"') {
                        let url = &rest[..space];
                        let title_start = rest.find('"').unwrap_or(space + 1) + 1;
                        let title_end = rest.rfind('"').unwrap_or(rest.len());
                        let title = if title_end > title_start { &rest[title_start..title_end] } else { "" };
                        (url, title)
                    } else {
                        (rest, "")
                    }
                } else {
                    (rest, "")
                };
                ref_links.insert(key.to_string(), (url.to_string(), title.to_string()));
                continue;
            }
        }
        content_lines.push(line);
        line_map.push(orig_idx);
    }
    
    // Remove Obsidian comments %%...%%
    let content = content_lines.join("\n");
    let content = remove_comments(&content);
    let cleaned_lines: Vec<&str> = content.split('\n').collect();
    let sl = |idx: usize| -> String {
        format!(" data-source-line=\"{}\"", line_map.get(idx).copied().unwrap_or(idx))
    };
    
    let mut i = 0;
    while i < cleaned_lines.len() {
        let line = cleaned_lines[i];
        
        // Display math $$...$$
        if line.trim_start().starts_with("$$") {
            let startI = i;
            let mut buffer: Vec<&str> = vec![line.trim_start().strip_prefix("$$").unwrap_or("")];
            i += 1;
            while i < cleaned_lines.len() && !cleaned_lines[i].trim_start().starts_with("$$") {
                buffer.push(cleaned_lines[i]);
                i += 1;
            }
            if i < cleaned_lines.len() {
                buffer.push(cleaned_lines[i].trim_start().strip_prefix("$$").unwrap_or(""));
                i += 1;
            }
            html.push(format!("<div class=\"md-math-block\"{}>\\[{}\\]</div>", sl(startI), buffer.join("\n")));
            continue;
        }
        
        // Code fence
        if line.starts_with("```") {
            let startI = i;
            let lang = line[3..].trim();
            let mut buffer: Vec<&str> = Vec::new();
            i += 1;
            while i < cleaned_lines.len() && !cleaned_lines[i].starts_with("```") {
                buffer.push(cleaned_lines[i]);
                i += 1;
            }
            i += 1;
            let lang_attr = if !lang.is_empty() { format!(" data-lang=\"{}\"", escape_html(lang)) } else { String::new() };
            let lang_label = if !lang.is_empty() {
                format!("<span class=\"md-code-lang\">{}</span>", escape_html(lang))
            } else {
                String::new()
            };
            html.push(format!(
                "<div class=\"md-pre-wrap\"{}{}>{}<pre class=\"md-pre\"><code>{}</code></pre></div>",
                sl(startI), lang_attr, lang_label, escape_html(&buffer.join("\n"))
            ));
            continue;
        }
        
        // Heading
        if let Some((level, content)) = heading(line) {
            let startI = i;
            let id = content.to_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "-").trim_matches('-').to_string();
            html.push(format!(
                "<h{level} id=\"{}\" class=\"md-h md-h{level}\"{}>{}</h{level}>",
                id, sl(startI), inline_enhanced(content, &ref_links)
            ));
            i += 1;
            continue;
        }
        
        // Horizontal rule
        if is_hr(line) {
            html.push(format!("<hr class=\"md-hr\"{} />", sl(i)));
            i += 1;
            continue;
        }
        
        // Collapsible details
        if line.to_lowercase().starts_with("<details>") {
            let startI = i;
            let mut buffer: Vec<&str> = Vec::new();
            i += 1;
            while i < cleaned_lines.len() && !cleaned_lines[i].to_lowercase().contains("</details>") {
                buffer.push(cleaned_lines[i]);
                i += 1;
            }
            i += 1;
            let summary = buffer.first()
                .and_then(|l| l.strip_prefix("<summary>"))
                .and_then(|l| l.strip_suffix("</summary>"))
                .unwrap_or("Details");
            let content = if buffer.len() > 1 { buffer[1..].join("\n") } else { String::new() };
            html.push(format!(
                "<details class=\"md-details\"{}><summary>{}</summary><div class=\"md-details-body\">{}</div></details>",
                sl(startI), inline_enhanced(summary, &ref_links), render_enhanced(&content)
            ));
            continue;
        }
        
        // Table
        if is_table_header(line) && i + 1 < cleaned_lines.len() && is_table_sep(cleaned_lines[i + 1]) {
            let tableStartI = i;
            let header_line = line;
            i += 1;
            let sep_line = cleaned_lines[i];
            i += 1;
            let mut body_rows: Vec<&str> = Vec::new();
            while i < cleaned_lines.len() && cleaned_lines[i].contains('|') && !cleaned_lines[i].trim().is_empty() {
                body_rows.push(cleaned_lines[i]);
                i += 1;
            }
            html.push(render_table(header_line, sep_line, &body_rows, &ref_links, line_map.get(tableStartI).copied().unwrap_or(tableStartI)));
            continue;
        }
        
        // Blockquote / Callout
        if line.starts_with('>') {
            let bqStart = i;
            let mut quote_lines: Vec<&str> = Vec::new();
            while i < cleaned_lines.len() && cleaned_lines[i].starts_with('>') {
                quote_lines.push(cleaned_lines[i]);
                i += 1;
            }
            if let Some((callout_type, title, body)) = parse_callout(&quote_lines) {
                let cfg = get_callout_config(&callout_type);
                let body_html: Vec<String> = body.iter().map(|l| inline_enhanced(l, &ref_links)).collect();
                html.push(format!(
                    "<div class=\"md-callout {}\"{}><span class=\"md-callout-icon\">{}</span><div class=\"md-callout-title\">{}</div><div class=\"md-callout-body\">{}</div></div>",
                    cfg.cls, sl(bqStart), cfg.icon, inline_enhanced(&title, &ref_links), body_html.join("<br/>")
                ));
            } else {
                let content: Vec<String> = quote_lines.iter()
                    .map(|l| l.strip_prefix(">").unwrap_or(l).strip_prefix(' ').unwrap_or(l.strip_prefix(">").unwrap_or(l)))
                    .map(|l| inline_enhanced(l, &ref_links))
                    .collect();
                html.push(format!("<blockquote class=\"md-quote\"{}>{}</blockquote>", sl(bqStart), content.join("<br/>")));
            }
            continue;
        }
        
        // Task list
        if task_item(line).is_some() {
            let taskStart = i;
            let mut buffer: Vec<String> = Vec::new();
            while i < cleaned_lines.len() {
                if let Some((done, content)) = task_item(cleaned_lines[i]) {
                    buffer.push(format!(
                        "<li class=\"md-task {}\"><span class=\"md-task-box\">{}</span>{}</li>",
                        if done { "done" } else { "" },
                        if done { "\u{2611}" } else { "\u{2610}" },
                        inline_enhanced(content, &ref_links)
                    ));
                    i += 1;
                } else {
                    break;
                }
            }
            html.push(format!("<ul class=\"md-list md-tasks\"{}>{}</ul>", sl(taskStart), buffer.join("")));
            continue;
        }
        
        // Unordered list
        if ul_item(line).is_some() {
            let ulStart = i;
            let mut buffer: Vec<String> = Vec::new();
            let base_indent = line.len() - line.trim_start().len();
            while i < cleaned_lines.len() {
                if task_item(cleaned_lines[i]).is_some() {
                    break;
                }
                if let Some(content) = ul_item(cleaned_lines[i]) {
                    let indent = cleaned_lines[i].len() - cleaned_lines[i].trim_start().len();
                    if indent > base_indent {
                        buffer.push(format!("<li class=\"md-subitem\">{}</li>", inline_enhanced(content, &ref_links)));
                    } else {
                        buffer.push(format!("<li>{}</li>", inline_enhanced(content, &ref_links)));
                    }
                    i += 1;
                } else {
                    break;
                }
            }
            html.push(format!("<ul class=\"md-list\"{}>{}</ul>", sl(ulStart), buffer.join("")));
            continue;
        }
        
        // Ordered list
        if ol_item(line).is_some() {
            let olStart = i;
            let mut buffer: Vec<String> = Vec::new();
            while i < cleaned_lines.len() {
                if let Some(content) = ol_item(cleaned_lines[i]) {
                    buffer.push(format!("<li>{}</li>", inline_enhanced(content, &ref_links)));
                    i += 1;
                } else {
                    break;
                }
            }
            html.push(format!("<ol class=\"md-list\"{}>{}</ol>", sl(olStart), buffer.join("")));
            continue;
        }
        
        // Blank line
        if line.trim().is_empty() {
            i += 1;
            continue;
        }
        
        // Paragraph
        let paraStart = i;
        let mut buffer: Vec<String> = vec![inline_enhanced(line, &ref_links)];
        i += 1;
        while i < cleaned_lines.len() && !is_structural_enhanced(cleaned_lines[i]) {
            buffer.push(inline_enhanced(cleaned_lines[i], &ref_links));
            i += 1;
        }
        html.push(format!("<p class=\"md-p\"{}>{}</p>", sl(paraStart), buffer.join("<br/>")));
    }
    
    // Append footnotes
    if !footnotes.is_empty() {
        html.push("<section class=\"md-footnotes\"><hr class=\"md-hr\" /><ol>".into());
        for (id, text) in &footnotes {
            html.push(format!(
                "<li id=\"fn-{}\">{} <a href=\"#fnref-{}\" class=\"md-footnote-back\">↩</a></li>",
                id, inline_enhanced(text, &ref_links), id
            ));
        }
        html.push("</ol></section>".into());
    }
    
    html.join("\n")
}

fn remove_comments(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("%%") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        if let Some(end) = after.find("%%") {
            rest = &after[end + 2..];
        } else {
            out.push_str("%%");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn is_structural_enhanced(line: &str) -> bool {
    line.trim().is_empty()
        || heading(line).is_some()
        || line.starts_with("```")
        || line.starts_with('>')
        || ul_item(line).is_some()
        || ol_item(line).is_some()
        || task_item(line).is_some()
        || line.trim_start().starts_with("$$")
        || line.to_lowercase().starts_with("<details>")
        || (is_table_header(line) && false) // Would need next line check
}
