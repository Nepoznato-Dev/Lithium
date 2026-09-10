use crate::{get, as_bool, json_escape, write_json, Parser, Value};

/* ---------- Token estimation ---------- */

/// Estimate token count from text (rough heuristic: ~4 chars per token for English).
/// Input: {"text": "..."}
/// Output: {"tokens": 123}
pub fn estimate_tokens(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let text = get(&obj, "text")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    // Rough heuristic: ~4 chars per token for English text
    // This is conservative (overestimates slightly) which is safer for context management
    let chars = text.len();
    let tokens = (chars + 3) / 4; // ceiling division

    Some(format!("{{\"tokens\":{}}}", tokens))
}

/// Estimate total tokens across all messages.
/// Input: {"messages": [{role, content}, ...]}
/// Output: {"tokens": 456}
pub fn estimate_messages_tokens(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let messages = match get(&obj, "messages") {
        Some(Value::Arr(m)) => m,
        _ => return None,
    };

    let mut total = 0usize;
    for msg in messages {
        if let Value::Obj(m) = msg {
            if let Some(Value::Str(content)) = get(m, "content") {
                let chars = content.len();
                total += (chars + 3) / 4;
            }
            // Add overhead for role and message framing (~4 tokens per message)
            total += 4;
        }
    }

    Some(format!("{{\"tokens\":{}}}", total))
}

/* ---------- Context window trimming ---------- */

/// Trim messages to fit within a token budget, preserving system message and recent context.
/// Input: {"messages": [...], "maxTokens": 4096}
/// Output: {"messages": [...trimmed...]}
pub fn trim_messages_to_context(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let messages = match get(&req, "messages") {
        Some(Value::Arr(m)) => m,
        _ => return None,
    };

    let max_tokens = get(&req, "maxTokens")
        .and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None })
        .unwrap_or(8192);

    if messages.is_empty() {
        return Some("{\"messages\":[]}".to_string());
    }

    // Estimate tokens for each message
    let mut msg_tokens: Vec<(usize, usize)> = Vec::new(); // (index, tokens)
    for (i, msg) in messages.iter().enumerate() {
        if let Value::Obj(m) = msg {
            let content_len = get(m, "content")
                .and_then(|v| match v { Value::Str(s) => Some(s.len()), _ => None })
                .unwrap_or(0);
            let tokens = (content_len + 3) / 4 + 4; // content + overhead
            msg_tokens.push((i, tokens));
        }
    }

    // Find system message (always keep it)
    let system_idx = msg_tokens.iter()
        .position(|(i, _)| {
            if let Some(Value::Obj(m)) = messages.get(*i) {
                get(m, "role")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .map(|r| r == "system")
                    .unwrap_or(false)
            } else {
                false
            }
        });

    let system_tokens = system_idx.map(|i| msg_tokens[i].1).unwrap_or(0);
    let budget = max_tokens.saturating_sub(system_tokens);

    // Greedily add messages from most recent to oldest
    let mut selected: Vec<usize> = Vec::new();
    let mut used = 0usize;

    // Iterate in reverse (most recent first), skip system
    for (i, tokens) in msg_tokens.iter().rev() {
        if Some(*i) == system_idx {
            continue; // skip system, we'll add it first
        }
        if used + tokens <= budget {
            selected.push(*i);
            used += tokens;
        } else {
            break; // context full
        }
    }

    // Sort selected indices to preserve order
    selected.sort_unstable();

    // Build output: system first, then selected messages
    let mut out_messages: Vec<&Value> = Vec::new();
    if let Some(idx) = system_idx {
        out_messages.push(&messages[idx]);
    }
    for idx in selected {
        out_messages.push(&messages[idx]);
    }

    let mut out = String::from("{\"messages\":[");
    for (i, msg) in out_messages.iter().enumerate() {
        if i > 0 { out.push(','); }
        write_json(msg, &mut out);
    }
    out.push_str("]}");
    Some(out)
}

/* ---------- Model resolution ---------- */

/// Resolve tier or model ID to a downloaded model.
/// Input: {"tierOrModelId": "efficient", "tiers": [...], "downloaded": {"model-id": true}}
/// Output: {"modelId": "qwen2.5-1.5b"} or null
pub fn resolve_model(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let tier_or_id = get(&req, "tierOrModelId")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let tiers = match get(&req, "tiers") {
        Some(Value::Arr(t)) => t,
        _ => return None,
    };

    let downloaded = match get(&req, "downloaded") {
        Some(Value::Obj(d)) => d,
        _ => return None,
    };

    // Check if tierOrModelId is a direct model ID that's downloaded
    let is_downloaded = downloaded.iter()
        .any(|(k, v)| k == tier_or_id && matches!(v, Value::Bool(true)));

    if is_downloaded {
        return Some(format!("{{\"modelId\":\"{}\"}}", json_escape(tier_or_id)));
    }

    // Otherwise, resolve tier to model
    for tier in tiers {
        if let Value::Obj(t) = tier {
            let tier_id = get(t, "id")
                .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                .unwrap_or("");

            if tier_id == tier_or_id {
                // Check primary model
                if let Some(Value::Str(model_id)) = get(t, "modelId") {
                    let is_dl = downloaded.iter()
                        .any(|(k, v)| k == model_id && matches!(v, Value::Bool(true)));
                    if is_dl {
                        return Some(format!("{{\"modelId\":\"{}\"}}", json_escape(model_id)));
                    }
                }
                // Check alt model
                if let Some(Value::Str(alt_id)) = get(t, "alt") {
                    let is_dl = downloaded.iter()
                        .any(|(k, v)| k == alt_id && matches!(v, Value::Bool(true)));
                    if is_dl {
                        return Some(format!("{{\"modelId\":\"{}\"}}", json_escape(alt_id)));
                    }
                }
                // Tier matched but no downloaded model
                return Some("null".to_string());
            }
        }
    }

    Some("null".to_string())
}

/* ---------- Inference message preparation ---------- */

/// Prepare chat messages for inference, injecting /no_think for Qwen3 models.
/// Input: {"messages": [{role, content}, ...], "modelId": "...", "noThink": true, "thinking": false}
/// Output: prepared messages JSON array.
pub fn prepare_messages(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let messages = match get(&req, "messages") {
        Some(Value::Arr(m)) => m,
        _ => return None,
    };

    let model_id = get(&req, "modelId")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let no_think = get(&req, "noThink").map(|v| as_bool(v)).unwrap_or(false);
    let thinking = get(&req, "thinking").map(|v| as_bool(v)).unwrap_or(false);

    let is_qwen3 = model_id.starts_with("qwen3");
    let inject = no_think && is_qwen3 && !thinking;
    let last_user_idx = if inject {
        // Find the last user message index
        messages.iter().enumerate().rev().find_map(|(i, m)| {
            match m {
                Value::Obj(o) => get(o, "role")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .and_then(|r| if r == "user" { Some(i) } else { None }),
                _ => None,
            }
        })
    } else {
        None
    };

    let mut out = String::from("[");
    for (i, msg) in messages.iter().enumerate() {
        if i > 0 { out.push(','); }
        let Value::Obj(obj) = msg else { continue };

        let role = get(obj, "role")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("");

        let content = get(obj, "content")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("");

        out.push_str("{\"role\":\"");
        out.push_str(&json_escape(role));
        out.push_str("\",\"content\":\"");

        if inject && Some(i) == last_user_idx && role == "user" {
            out.push_str(&json_escape(content));
            out.push_str("\\n/no_think");
        } else {
            out.push_str(&json_escape(content));
        }
        out.push_str("\"}");
    }
    out.push(']');
    Some(out)
}
