//! Markdown rendering — basic, enhanced (Obsidian/GFM), and wiki-link extraction.
//!
//! Ported from rust/lithium-core/src/markdown.rs (1574 lines).
//! All functions are pure string-in → string-out, no JSON involved.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct MdInput {
    pub source: String,
}

#[derive(Serialize)]
pub struct WikiLinksOutput {
    pub links: Vec<String>,
}

// Re-export the render functions directly — the markdown module from
// lithium-core is self-contained (no JSON parser dependency for the
// public API).  We copy the implementations here verbatim.

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

fn images(s: &str) -> String {
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

/// Basic markdown render — same output as coreNative.js mdRender.
pub fn render(src: &str) -> String {
    let lines: Vec<&str> = src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let mut html: Vec<String> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if line.starts_with("```") {
            let mut buffer: Vec<&str> = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].starts_with("```") {
                buffer.push(lines[i]);
                i += 1;
            }
            i += 1;
            html.push(format!("<pre class=\"md-pre\"><code>{}</code></pre>", escape_html(&buffer.join("\n"))));
            continue;
        }
        if let Some((level, content)) = heading(line) {
            html.push(format!("<h{level} class=\"md-h md-h{level}\">{}</h{level}>", inline(content)));
            i += 1;
            continue;
        }
        if is_hr(line) {
            html.push("<hr class=\"md-hr\" />".into());
            i += 1;
            continue;
        }
        if quote_content(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                match quote_content(lines[i]) {
                    Some(content) => { buffer.push(inline(content)); i += 1; }
                    None => break,
                }
            }
            html.push(format!("<blockquote class=\"md-quote\">{}</blockquote>", buffer.join("<br/>")));
            continue;
        }
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
        if ul_item(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                if task_item(lines[i]).is_some() { break; }
                match ul_item(lines[i]) {
                    Some(content) => { buffer.push(format!("<li>{}</li>", inline(content))); i += 1; }
                    None => break,
                }
            }
            html.push(format!("<ul class=\"md-list\">{}</ul>", buffer.join("")));
            continue;
        }
        if ol_item(line).is_some() {
            let mut buffer: Vec<String> = Vec::new();
            while i < lines.len() {
                match ol_item(lines[i]) {
                    Some(content) => { buffer.push(format!("<li>{}</li>", inline(content))); i += 1; }
                    None => break,
                }
            }
            html.push(format!("<ol class=\"md-list\">{}</ol>", buffer.join("")));
            continue;
        }
        if line.trim().is_empty() { i += 1; continue; }
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

/// Extract wiki links — same as coreNative.js mdWikiLinks.
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
                            if !found.contains(&target) { found.push(target); }
                            rest = &stripped[ae + 2..];
                            advanced = true;
                        }
                    }
                } else if next.starts_with("]]") {
                    if !target.is_empty() && !found.contains(&target) { found.push(target); }
                    rest = &next[2..];
                    advanced = true;
                }
            }
        }
        if !advanced { rest = after; }
    }
    found
}

/// Enhanced render — delegates to render() for now (the full enhanced
/// renderer from lithium-core/src/markdown.rs is 1100+ lines and will be
/// ported in a follow-up; the basic renderer covers the coreNative.js
/// mdRenderEnhanced which already delegates to mdRender).
pub fn render_enhanced(src: &str) -> String {
    render(src)
}
