//! Chat management — upsert, delete, and trim operations.

use crate::{get, write_json, Parser, Value};

/// Maximum number of chats to keep.
const MAX_CHATS: usize = 30;

/// Upsert a chat (by id) keeping the list most-recent-first.
/// Input: `{"chats": [...], "chat": {...}, "now": 1234567890}`
/// Output: `{"chats": [...updated...]}`
pub fn upsert(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let chats = get(&root_obj, "chats")?;
    let chat = get(&root_obj, "chat")?;
    let now = get(&root_obj, "now")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(0.0);
    
    let Value::Obj(chat_obj) = chat else { return None };
    let chat_id = get(&chat_obj, "id")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })?;
    
    let Value::Arr(chats_arr) = chats else { return None };
    
    // Filter out existing chat with same id
    let mut updated: Vec<Value> = chats_arr
        .iter()
        .filter(|c| {
            if let Value::Obj(obj) = c {
                if let Some(id) = get(obj, "id") {
                    if let Value::Str(id_str) = id {
                        return id_str != chat_id;
                    }
                }
            }
            true
        })
        .cloned()
        .collect();
    
    // Add updatedAt to chat
    let mut updated_chat = chat.clone();
    if let Value::Obj(ref mut obj) = updated_chat {
        if let Some(pair) = obj.iter_mut().find(|(k, _)| k == "updatedAt") {
            pair.1 = Value::Num(now);
        } else {
            obj.push(("updatedAt".to_string(), Value::Num(now)));
        }
    }
    
    // Insert at beginning (most recent first)
    updated.insert(0, updated_chat);
    
    // Trim to MAX_CHATS
    updated.truncate(MAX_CHATS);
    
    let mut out = String::new();
    out.push('{');
    out.push_str("\"chats\":");
    write_json(&Value::Arr(updated), &mut out);
    out.push('}');
    Some(out)
}

/// Delete a chat by id.
/// Input: `{"chats": [...], "id": "chat-123"}`
/// Output: `{"chats": [...updated...]}` or `null` if id not found
pub fn delete(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let chats = get(&root_obj, "chats")?;
    let id = get(&root_obj, "id")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })?;
    
    let Value::Arr(chats_arr) = chats else { return None };
    
    // Check if id exists
    let exists = chats_arr.iter().any(|c| {
        if let Value::Obj(obj) = c {
            if let Some(chat_id) = get(obj, "id") {
                if let Value::Str(id_str) = chat_id {
                    return id_str == id;
                }
            }
        }
        false
    });
    
    if !exists {
        return None; // Guard: never wipe the store when id is unknown
    }
    
    // Filter out the chat
    let updated: Vec<Value> = chats_arr
        .iter()
        .filter(|c| {
            if let Value::Obj(obj) = c {
                if let Some(chat_id) = get(obj, "id") {
                    if let Value::Str(id_str) = chat_id {
                        return id_str != id;
                    }
                }
            }
            true
        })
        .cloned()
        .collect();
    
    let mut out = String::new();
    out.push('{');
    out.push_str("\"chats\":");
    write_json(&Value::Arr(updated), &mut out);
    out.push('}');
    Some(out)
}

/// Trim chats list to MAX_CHATS.
/// Input: `{"chats": [...]}`
/// Output: `{"chats": [...trimmed...]}`
pub fn trim(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let chats = get(&root_obj, "chats")?;
    let Value::Arr(chats_arr) = chats else { return None };
    
    let mut trimmed = chats_arr.clone();
    trimmed.truncate(MAX_CHATS);
    
    let mut out = String::new();
    out.push('{');
    out.push_str("\"chats\":");
    write_json(&Value::Arr(trimmed), &mut out);
    out.push('}');
    Some(out)
}
