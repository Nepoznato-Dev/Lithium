//! Chats — upsert, delete, trim.
//! Ported from coreNative.js lines 449-471.

use serde::{Deserialize, Serialize};

const MAX_CHATS: usize = 30;

#[derive(Deserialize, Serialize, Clone)]
pub struct Chat {
    #[serde(default)]
    pub id: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
pub struct ChatList {
    pub chats: Vec<Chat>,
}

pub fn upsert(chats: &[Chat], chat: &Chat, now: u64) -> Option<ChatList> {
    if chat.id.is_empty() { return None; }
    let mut updated = chat.clone();
    updated.extra.insert("updatedAt".into(), serde_json::json!(now));
    let filtered: Vec<Chat> = chats.iter().filter(|c| c.id != chat.id).cloned().collect();
    let mut result = vec![updated];
    result.extend(filtered);
    result.truncate(MAX_CHATS);
    Some(ChatList { chats: result })
}

pub fn delete(chats: &[Chat], id: &str) -> Option<ChatList> {
    if id.is_empty() { return None; }
    if !chats.iter().any(|c| c.id == id) { return None; }
    Some(ChatList { chats: chats.iter().filter(|c| c.id != id).cloned().collect() })
}

pub fn trim(chats: &[Chat]) -> ChatList {
    let mut c: Vec<Chat> = chats.to_vec();
    c.truncate(MAX_CHATS);
    ChatList { chats: c }
}
