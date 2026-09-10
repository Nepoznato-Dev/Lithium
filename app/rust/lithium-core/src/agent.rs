//! Agent modes and AI block parsing — mode catalog, prompt building, tool block extraction.

use crate::{get, write_json, Parser, Value};

/// Get the mode catalog as JSON.
/// Output: `{"MODE_ORDER": [...], "MODES": {...}}`
pub fn mode_catalog() -> String {
    let mut out = String::new();
    out.push('{');
    
    // MODE_ORDER
    out.push_str("\"MODE_ORDER\":[");
    out.push_str("\"agent\",\"ask\",\"plan\",\"review\",\"explore\",\"chat\"");
    out.push(']');
    
    out.push(',');
    
    // MODES
    out.push_str("\"MODES\":{");
    
    // agent
    out.push_str("\"agent\":{\"label\":\"Agent\",\"read\":true,\"write\":\"execute\",\"prompt\":\"You are an AGENT — a senior software-engineering assistant that modifies and improves the user's codespace.\\nFollow the loop: Understand → Inspect → Plan → Implement → Verify → Report.\\n- FIRST assess scope: call code.list to gauge the repository. If the repo is large or the change would span many files, do NOT implement yet — produce a concise plan (files to touch, order, risks) and recommend switching to Plan mode for the full picture. Only implement directly for small, well-scoped changes.\\n- Before editing, gather context with read tools; never modify based on assumption.\\n- Make targeted, minimal changes; match existing style; preserve unrelated code; never invent files or APIs.\\n- For complex/multi-file changes, briefly list the files you'll touch, the order, and risks BEFORE editing. For simple single-file changes, proceed directly.\\n- Keep diffs small and readable; write clean code the first time; add comments only where the why is non-obvious.\\n- After changes, verify and report: what changed, files modified, checks performed, remaining issues, next steps.\\n- Never delete/overwrite unrelated files; warn before anything risky. Lead with the most important information.\"}");
    
    out.push(',');
    
    // ask
    out.push_str("\"ask\":{\"label\":\"Ask\",\"read\":true,\"write\":\"none\",\"prompt\":\"You are an ASK advisor — a read-only engineering advisor. Understand → inspect → explain → guide.\n- Inspect the code with read tools before answering; never answer from assumption.\n- Cite real file paths, functions, and symbols; include line references where helpful.\n- Answers: accurate, specific, proportional, structured (headings/lists/code refs).\n- You NEVER modify anything. If a fix is needed, describe exactly what would change and suggest switching to Agent mode.\"}");
    
    out.push(',');
    
    // plan
    out.push_str("\"plan\":{\"label\":\"Plan\",\"read\":true,\"write\":\"plan\",\"prompt\":\"You are a PLANNING agent — a software architect. Research with read tools, then design a plan another agent could execute confidently. You do NOT implement.\\nProduce a structured plan: Summary · Discovery findings · Implementation steps (ordered phases with dependencies) · Relevant files (path + purpose) · Verification steps · Risks & mitigations · Scope (included/excluded).\\nEmit the intended file changes as code.write blocks; they are NOT applied until the user approves. Ground every step in actual codebase findings, not assumptions.\"}");
    
    out.push(',');
    
    // review
    out.push_str("\"review\":{\"label\":\"Review\",\"read\":true,\"write\":\"none\",\"prompt\":\"You are a REVIEW agent — a read-only code reviewer. Inspect with read tools and critique: correctness, logic bugs, security issues, style, performance, and maintainability.\\nPrioritize high-signal issues over nitpicks. Cite file paths and line numbers. For each issue: what's wrong, why it matters, and a suggested fix. Do NOT modify any files.\"}");
    
    out.push(',');
    
    // explore
    out.push_str("\"explore\":{\"label\":\"Explore\",\"read\":true,\"write\":\"none\",\"prompt\":\"You are an EXPLORE agent — a read-only investigator. Use read/list tools to map the codebase: locate relevant files, trace execution flows, and summarize architecture and patterns.\\nReport findings with concrete file paths and symbol names. Be thorough but concise. Do NOT modify anything.\"}");
    
    out.push(',');
    
    // chat
    out.push_str("\"chat\":{\"label\":\"Chat\",\"read\":false,\"write\":\"none\",\"prompt\":\"You are a CHAT companion — conversational only, with NO tool access. Be friendly, engaging, thoughtful, and concise; match the user's tone.\\nIf asked to read, analyze, or modify code, politely explain you can't in Chat mode and suggest Ask (questions), Explore (investigation), or Agent (implementation).\"}");
    
    out.push('}');
    out.push('}');
    out
}

/// Extract ```api blocks from text.
/// Input: `{"text": "..."}`
/// Output: JSON array `[{api, params}, ...]`
pub fn extract_api_calls(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let text = get(&obj, "text")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    
    let mut calls = Vec::new();
    let mut i = 0;
    let bytes = text.as_bytes();
    
    while i < bytes.len() {
        // Look for ```api
        if i + 6 <= bytes.len() && &bytes[i..i+6] == b"```api" {
            i += 6;
            // Skip whitespace after ```api
            while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n') {
                i += 1;
            }
            // Find closing ```
            let start = i;
            while i + 3 <= bytes.len() {
                if &bytes[i..i+3] == b"```" {
                    let block = &text[start..i];
                    // Try to parse as JSON
                    if let Ok(parsed) = serde_json_parse(block) {
                        match parsed {
                            Value::Arr(items) => {
                                for item in items {
                                    if let Value::Obj(obj) = item {
                                        if let Some(api) = get(&obj, "api") {
                                            if let Value::Str(api_str) = api {
                                                let params = get(&obj, "params").cloned().unwrap_or(Value::Obj(vec![]));
                                                let mut call = Vec::new();
                                                call.push(("api".to_string(), Value::Str(api_str.clone())));
                                                call.push(("params".to_string(), params));
                                                calls.push(Value::Obj(call));
                                            }
                                        }
                                    }
                                }
                            }
                            Value::Obj(obj) => {
                                if let Some(api) = get(&obj, "api") {
                                    if let Value::Str(api_str) = api {
                                        let params = get(&obj, "params").cloned().unwrap_or(Value::Obj(vec![]));
                                        let mut call = Vec::new();
                                        call.push(("api".to_string(), Value::Str(api_str.clone())));
                                        call.push(("params".to_string(), params));
                                        calls.push(Value::Obj(call));
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    i += 3;
                    break;
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    
    let mut out = String::new();
    write_json(&Value::Arr(calls), &mut out);
    Some(out)
}

/// Extract ```widget blocks from text.
/// Input: `{"text": "..."}`
/// Output: JSON array `[{name, code}, ...]`
pub fn extract_widget_blocks(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let text = get(&obj, "text")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    
    let mut blocks = Vec::new();
    let mut i = 0;
    let bytes = text.as_bytes();
    
    while i < bytes.len() {
        // Look for ```widget
        if i + 9 <= bytes.len() && &bytes[i..i+9] == b"```widget" {
            i += 9;
            // Skip whitespace
            while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n') {
                i += 1;
            }
            // Find closing ```
            let start = i;
            while i + 3 <= bytes.len() {
                if &bytes[i..i+3] == b"```" {
                    let code = text[start..i].trim().to_string();
                    
                    // Extract name from // widget: X header
                    let name = extract_widget_name(&code, blocks.len());
                    
                    let mut block = Vec::new();
                    block.push(("name".to_string(), Value::Str(name)));
                    block.push(("code".to_string(), Value::Str(code)));
                    blocks.push(Value::Obj(block));
                    
                    i += 3;
                    break;
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    
    let mut out = String::new();
    write_json(&Value::Arr(blocks), &mut out);
    Some(out)
}

/// Strip ```api and ```widget blocks from text.
/// Input: `{"text": "..."}`
/// Output: cleaned text string
pub fn strip_tool_blocks(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let text = get(&obj, "text")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    
    let mut result = String::new();
    let mut i = 0;
    let bytes = text.as_bytes();
    
    while i < bytes.len() {
        // Check for ```api or ```widget
        if (i + 6 <= bytes.len() && &bytes[i..i+6] == b"```api") ||
           (i + 9 <= bytes.len() && &bytes[i..i+9] == b"```widget") {
            // Skip until closing ```
            let skip_len = if &bytes[i..i+6] == b"```api" { 6 } else { 9 };
            i += skip_len;
            while i + 3 <= bytes.len() {
                if &bytes[i..i+3] == b"```" {
                    i += 3;
                    break;
                }
                i += 1;
            }
        } else {
            result.push(text.chars().nth(i).unwrap_or(' '));
            i += 1;
        }
    }
    
    Some(format!("\"{}\"", crate::json_escape(result.trim())))
}

// Helper: extract widget name from code
fn extract_widget_name(code: &str, index: usize) -> String {
    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") {
            let comment = trimmed[2..].trim();
            if comment.to_lowercase().starts_with("widget:") {
                let name = comment[7..].trim();
                // Sanitize name
                let sanitized: String = name
                    .chars()
                    .filter(|c| !r#"\/:*?"<>|"#.contains(*c))
                    .take(48)
                    .collect();
                if !sanitized.is_empty() {
                    return sanitized;
                }
            }
        }
    }
    format!("AI Widget {}", index + 1)
}

// Helper: simple JSON parser (reuse Parser from crate)
fn serde_json_parse(text: &str) -> Result<Value, ()> {
    let bytes = text.as_bytes();
    Parser::new(bytes).value().ok_or(())
}
