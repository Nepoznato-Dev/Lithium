//! File explorer operations — sort, filter, search, batch ops, MIME detection,
//! recent/gallery queries, conflict checking, and undo reverse-op generation.
//!
//! All ops take/return JSON strings through a single `explorer_op` WASM entry point:
//!   in : {"op":"...", "tree":[...], ...extra}
//!   out: JSON (op-specific) — or None on any parse error (JS falls back).
//!
//! Reuses helpers from `fs.rs` (eid, eparent, etype, entry_field, obj_set,
//! doomed_ids, serialize_tree, insert_suffix) via pub(crate) visibility.

use crate::{get, json_escape, num_json, write_json, Parser, Value};
use crate::fs::{doomed_ids, eid, entry_field, eparent, etype, obj_set, serialize_tree};
use std::collections::{HashMap, HashSet};

/// Build the path string for an entry by walking parent links.
fn build_path(tree: &[Value], entry: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut cur = eparent(entry);
    let mut guard = tree.len() + 1;
    while let Some(pid) = cur {
        if guard == 0 { break; }
        guard -= 1;
        if pid == "root" { break; }
        if let Some(e) = tree.iter().find(|e| eid(e) == pid) {
            let name = entry_field(e, "name")
                .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                .unwrap_or("");
            parts.push(name.to_string());
            cur = eparent(e);
        } else {
            break;
        }
    }
    parts.reverse();
    parts.join("/")
}

/// Collect all descendant IDs of a scope folder (inclusive).
fn scope_descendant_ids(tree: &[Value], scope_id: &str) -> HashSet<String> {
    let mut scope = HashSet::new();
    scope.insert(scope_id.to_string());
    let mut grew = true;
    while grew {
        grew = false;
        for entry in tree {
            let child = eid(entry);
            if let Some(parent) = eparent(entry) {
                if scope.contains(&parent) && !scope.contains(&child) {
                    scope.insert(child);
                    grew = true;
                }
            }
        }
    }
    scope
}

pub fn op(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };
    let field = |key: &str| -> Option<String> {
        get(&req, key).and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
    };
    let num = |key: &str| -> f64 {
        get(&req, key).map(|v| match v { Value::Num(n) => *n, _ => 0.0 }).unwrap_or(0.0)
    };
    let bool_field = |key: &str| -> bool {
        get(&req, key).map(|v| match v { Value::Bool(b) => *b, _ => false }).unwrap_or(false)
    };

    let op = field("op")?;
    let Value::Arr(tree) = get(&req, "tree")? else { return None };

    match op.as_str() {
        // ── Sort children of a folder by field + direction ──
        // Input: { op:"sort", tree, folderId, field:"name"|"size"|"type"|"modified", direction:"asc"|"desc" }
        // Output: sorted children array (full entries)
        "sort" => {
            let folder_id = field("folderId").unwrap_or_else(|| "root".into());
            let sort_field = field("field").unwrap_or_else(|| "name".into());
            let direction = field("direction").unwrap_or_else(|| "asc".into());

            let mut children: Vec<&Value> = tree
                .iter()
                .filter(|e| eparent(e).as_deref() == Some(&folder_id))
                .collect();

            children.sort_by(|a, b| {
                let ta = etype(a);
                let tb = etype(b);
                // Folders always first regardless of sort field
                let base = match (ta.as_str(), tb.as_str()) {
                    ("folder", "folder") => std::cmp::Ordering::Equal,
                    ("folder", _) => std::cmp::Ordering::Less,
                    (_, "folder") => std::cmp::Ordering::Greater,
                    _ => std::cmp::Ordering::Equal,
                };
                if base != std::cmp::Ordering::Equal { return base; }

                let cmp = match sort_field.as_str() {
                    "size" => {
                        let sa = entry_field(a, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        let sb = entry_field(b, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
                    }
                    "modified" => {
                        let ma = entry_field(a, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        let mb = entry_field(b, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        ma.partial_cmp(&mb).unwrap_or(std::cmp::Ordering::Equal)
                    }
                    "type" => {
                        ta.cmp(&tb)
                    }
                    _ => {
                        let na = entry_field(a, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                        let nb = entry_field(b, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                        na.cmp(nb)
                    }
                };
                if direction == "desc" { cmp.reverse() } else { cmp }
            });

            let cloned: Vec<Value> = children.into_iter().cloned().collect();
            Some(serialize_tree(&cloned))
        }

        // ── Filter children by visibility predicates ──
        // Input: { op:"filter", tree, folderId, showHidden:bool, typeFilter?:"image" }
        // Output: filtered children array (full entries)
        "filter" => {
            let folder_id = field("folderId").unwrap_or_else(|| "root".into());
            let show_hidden = bool_field("showHidden");
            let type_filter = field("typeFilter").unwrap_or_default();

            let children: Vec<Value> = tree
                .iter()
                .filter(|e| {
                    if eparent(e).as_deref() != Some(&folder_id) { return false; }
                    if !show_hidden {
                        let name = entry_field(e, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                            .unwrap_or("");
                        if name.starts_with('.') { return false; }
                    }
                    if !type_filter.is_empty() && etype(e) != type_filter { return false; }
                    true
                })
                .cloned()
                .collect();
            Some(serialize_tree(&children))
        }

        // ── Combined sort + filter in one pass (hot path for navigation) ──
        // Input: { op:"sort_filter", tree, folderId, field, direction, showHidden, typeFilter? }
        // Output: sorted + filtered children array (full entries)
        "sort_filter" => {
            let folder_id = field("folderId").unwrap_or_else(|| "root".into());
            let sort_field = field("field").unwrap_or_else(|| "name".into());
            let direction = field("direction").unwrap_or_else(|| "asc".into());
            let show_hidden = bool_field("showHidden");
            let type_filter = field("typeFilter").unwrap_or_default();

            let mut children: Vec<&Value> = tree
                .iter()
                .filter(|e| {
                    if eparent(e).as_deref() != Some(&folder_id) { return false; }
                    if !show_hidden {
                        let name = entry_field(e, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                            .unwrap_or("");
                        if name.starts_with('.') { return false; }
                    }
                    if !type_filter.is_empty() && etype(e) != type_filter { return false; }
                    true
                })
                .collect();

            children.sort_by(|a, b| {
                let ta = etype(a);
                let tb = etype(b);
                let base = match (ta.as_str(), tb.as_str()) {
                    ("folder", "folder") => std::cmp::Ordering::Equal,
                    ("folder", _) => std::cmp::Ordering::Less,
                    (_, "folder") => std::cmp::Ordering::Greater,
                    _ => std::cmp::Ordering::Equal,
                };
                if base != std::cmp::Ordering::Equal { return base; }

                let cmp = match sort_field.as_str() {
                    "size" => {
                        let sa = entry_field(a, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        let sb = entry_field(b, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
                    }
                    "modified" => {
                        let ma = entry_field(a, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        let mb = entry_field(b, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                        ma.partial_cmp(&mb).unwrap_or(std::cmp::Ordering::Equal)
                    }
                    "type" => ta.cmp(&tb),
                    _ => {
                        let na = entry_field(a, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                        let nb = entry_field(b, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                        na.cmp(nb)
                    }
                };
                if direction == "desc" { cmp.reverse() } else { cmp }
            });

            let cloned: Vec<Value> = children.into_iter().cloned().collect();
            Some(serialize_tree(&cloned))
        }

        // ── Extended search with scope + type filter + path building ──
        // Input: { op:"search", tree, query, scopeId?, typeFilter?, limit }
        // Output: [{id, name, type, path}, ...]
        "search" => {
            let query = field("query").unwrap_or_default();
            let type_filter = field("typeFilter").unwrap_or_default();
            let scope_id = field("scopeId");
            let limit = num("limit") as usize;
            let cap = if limit > 0 { limit } else { 100 };
            let q_lower = query.to_lowercase();

            let scope = scope_id.as_ref().map(|sid| scope_descendant_ids(tree, sid));

            let mut results: Vec<String> = Vec::new();
            for entry in tree.iter() {
                if results.len() >= cap { break; }
                let entry_id = eid(entry);
                if entry_id.is_empty() || entry_id == "root" { continue; }
                if let Some(ref s) = scope {
                    if !s.contains(&entry_id) { continue; }
                }
                let et = etype(entry);
                if !type_filter.is_empty() && et != type_filter { continue; }
                let name = entry_field(entry, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                if !q_lower.is_empty() && !name.to_lowercase().contains(&q_lower) { continue; }
                let path = build_path(tree, entry);
                let full_path = if path.is_empty() { name.to_string() } else { format!("{}/{}", path, name) };
                results.push(format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"type\":\"{}\",\"path\":\"{}\"}}",
                    json_escape(&entry_id), json_escape(name), et, json_escape(&full_path)
                ));
            }
            Some(format!("[{}]", results.join(",")))
        }

        // ── Batch move: reparent N entries to destination in one WASM call ──
        // Input: { op:"batch_move", tree, ids:[...], parentId, now }
        // Output: { tree:[...], moved:N }
        "batch_move" => {
            let parent = field("parentId")?;
            let now = num("now");
            let ids: Vec<String> = match get(&req, "ids") {
                Some(Value::Arr(arr)) => arr.iter().filter_map(|v| match v {
                    Value::Str(s) => Some(s.clone()),
                    _ => None,
                }).collect(),
                _ => return None,
            };
            if ids.is_empty() {
                return Some(format!("{{\"tree\":{},\"moved\":0}}", serialize_tree(tree)));
            }

            let id_set: HashSet<String> = ids.iter().cloned().collect();
            // Guard: can't move a folder into itself or any of its descendants
            for id in &ids {
                if doomed_ids(tree, id).contains(&parent) {
                    return Some(format!("{{\"tree\":{},\"moved\":0}}", serialize_tree(tree)));
                }
            }

            let mut next: Vec<Value> = tree.clone();
            let mut moved = 0u32;
            for entry in next.iter_mut() {
                if id_set.contains(&eid(entry)) {
                    if let Value::Obj(obj) = entry {
                        obj_set(obj, "parentId", Value::Str(parent.clone()));
                        obj_set(obj, "updatedAt", Value::Num(now));
                        moved += 1;
                    }
                }
            }
            Some(format!("{{\"tree\":{},\"moved\":{}}}", serialize_tree(&next), moved))
        }

        // ── Batch delete: trash/remove N entries in one WASM call ──
        // Input: { op:"batch_delete", tree, ids:[...], trashId?, permanent:bool, now }
        // Output: { tree:[...], deleted:N }
        "batch_delete" => {
            let now = num("now");
            let permanent = bool_field("permanent");
            let trash_id = field("trashId").unwrap_or_else(|| "default-trash".into());
            let ids: Vec<String> = match get(&req, "ids") {
                Some(Value::Arr(arr)) => arr.iter().filter_map(|v| match v {
                    Value::Str(s) => Some(s.clone()),
                    _ => None,
                }).collect(),
                _ => return None,
            };
            if ids.is_empty() {
                return Some(format!("{{\"tree\":{},\"deleted\":0}}", serialize_tree(tree)));
            }

            if permanent {
                // Collect all doomed IDs (including children)
                let mut all_doomed: HashSet<String> = HashSet::new();
                for id in &ids {
                    all_doomed.extend(doomed_ids(tree, id));
                }
                let kept: Vec<&Value> = tree.iter().filter(|e| !all_doomed.contains(&eid(e))).collect();
                let mut out = String::from("[");
                for (idx, item) in kept.iter().enumerate() {
                    if idx > 0 { out.push(','); }
                    write_json(item, &mut out);
                }
                out.push(']');
                Some(format!("{{\"tree\":{},\"deleted\":{}}}", out, all_doomed.len()))
            } else {
                // Move to trash
                let id_set: HashSet<String> = ids.iter().cloned().collect();
                let mut next: Vec<Value> = Vec::with_capacity(tree.len());
                let mut deleted = 0u32;
                for entry in tree.iter() {
                    let mut e = entry.clone();
                    let entry_id = eid(&e);
                    if id_set.contains(&entry_id) && entry_id != trash_id {
                        let orig_parent = eparent(&e).unwrap_or_default();
                        if let Value::Obj(obj) = &mut e {
                            obj_set(obj, "parentId", Value::Str(trash_id.clone()));
                            obj_set(obj, "trashedAt", Value::Num(now));
                            if !orig_parent.is_empty() {
                                obj_set(obj, "originalParentId", Value::Str(orig_parent));
                            }
                            obj_set(obj, "updatedAt", Value::Num(now));
                            deleted += 1;
                        }
                    }
                    next.push(e);
                }
                Some(format!("{{\"tree\":{},\"deleted\":{}}}", serialize_tree(&next), deleted))
            }
        }

        // ── Batch copy: deep-copy N entries to destination with new IDs ──
        // Input: { op:"batch_copy", tree, ids:[...], parentId, suffix, seed, now }
        // Output: { tree:[...], idMap:{...}, copied:N }
        "batch_copy" => {
            let parent = field("parentId")?;
            let suffix = field("suffix").unwrap_or_else(|| " (copy)".into());
            let seed = field("seed").unwrap_or_else(|| "0".into());
            let now = num("now");
            let ids: Vec<String> = match get(&req, "ids") {
                Some(Value::Arr(arr)) => arr.iter().filter_map(|v| match v {
                    Value::Str(s) => Some(s.clone()),
                    _ => None,
                }).collect(),
                _ => return None,
            };
            if ids.is_empty() {
                return Some(format!("{{\"tree\":{},\"idMap\":{{}},\"copied\":0}}", serialize_tree(tree)));
            }

            let mut id_map: HashMap<String, String> = HashMap::new();
            let mut all_members: Vec<(usize, String, bool)> = Vec::new(); // (tree_idx, old_id, is_root)
            let mut counter = 0u32;

            for root_id in &ids {
                let doomed = doomed_ids(tree, root_id);
                for (idx, entry) in tree.iter().enumerate() {
                    let entry_id = eid(entry);
                    if doomed.contains(&entry_id) && !id_map.contains_key(&entry_id) {
                        let new_id = format!("entry-{}-{}", seed, counter);
                        counter += 1;
                        let is_root = entry_id == *root_id;
                        id_map.insert(entry_id.clone(), new_id);
                        all_members.push((idx, entry_id, is_root));
                    }
                }
            }

            let mut clones: Vec<Value> = Vec::with_capacity(all_members.len());
            for (idx, old_id, is_root) in &all_members {
                let entry = &tree[*idx];
                let mut clone = entry.clone();
                if let Value::Obj(obj) = &mut clone {
                    let new_id = id_map.get(old_id).cloned().unwrap_or_default();
                    let new_parent = if *is_root {
                        parent.clone()
                    } else {
                        eparent(entry)
                            .and_then(|p| id_map.get(&p).cloned())
                            .unwrap_or_default()
                    };
                    obj_set(obj, "id", Value::Str(new_id));
                    obj_set(obj, "parentId", Value::Str(new_parent));
                    if *is_root && etype(entry) != "folder" {
                        let name = entry_field(entry, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
                            .unwrap_or_default();
                        obj_set(obj, "name", Value::Str(crate::fs::insert_suffix(&name, &suffix)));
                    }
                    obj_set(obj, "createdAt", Value::Num(now));
                    obj_set(obj, "updatedAt", Value::Num(now));
                }
                clones.push(clone);
            }

            let mut next: Vec<Value> = tree.clone();
            next.append(&mut clones);

            let mut map_parts: Vec<String> = id_map.iter()
                .map(|(old, new)| format!("\"{}\":\"{}\"", json_escape(old), json_escape(new)))
                .collect();
            map_parts.sort();

            Some(format!(
                "{{\"tree\":{},\"idMap\":{{{}}},\"copied\":{}}}",
                serialize_tree(&next),
                map_parts.join(","),
                all_members.len()
            ))
        }

        // ── Generate reverse operations for undo ──
        // Input: { op:"reverse_ops", treeBefore:[...], ops:[{type, id, oldParentId, ...}] }
        // Output: [{type, id, parentId, name, ...}] — reverse ops in LIFO order
        "reverse_ops" => {
            let Value::Arr(ops_arr) = get(&req, "ops").cloned().unwrap_or(Value::Arr(vec![])) else {
                return Some("[]".to_string());
            };
            let tree_before: Option<&Vec<Value>> = match get(&req, "treeBefore") {
                Some(Value::Arr(arr)) => Some(arr),
                _ => None,
            };

            let mut reverses: Vec<String> = Vec::new();
            for op_val in ops_arr.iter().rev() {
                let Value::Obj(op_obj) = op_val else { continue };
                let op_type = get(&op_obj, "type").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let entry_id = get(&op_obj, "id").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");

                match op_type {
                    "move" => {
                        let old_parent = get(&op_obj, "oldParentId").and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None }).unwrap_or_else(|| "root".into());
                        reverses.push(format!(
                            "{{\"type\":\"move\",\"id\":\"{}\",\"parentId\":\"{}\"}}",
                            json_escape(entry_id), json_escape(&old_parent)
                        ));
                    }
                    "delete" | "trash" => {
                        // Find the entry in treeBefore to restore its parent
                        if let Some(before) = tree_before {
                            if let Some(entry) = before.iter().find(|e| eid(e) == entry_id) {
                                let old_parent = eparent(entry).unwrap_or_else(|| "root".into());
                                let name = entry_field(entry, "name")
                                    .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
                                    .unwrap_or_default();
                                reverses.push(format!(
                                    "{{\"type\":\"restore\",\"id\":\"{}\",\"parentId\":\"{}\",\"name\":\"{}\"}}",
                                    json_escape(entry_id), json_escape(&old_parent), json_escape(&name)
                                ));
                            }
                        }
                    }
                    "create" => {
                        reverses.push(format!(
                            "{{\"type\":\"delete\",\"id\":\"{}\"}}",
                            json_escape(entry_id)
                        ));
                    }
                    "rename" => {
                        let old_name = get(&op_obj, "oldName").and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None }).unwrap_or_default();
                        reverses.push(format!(
                            "{{\"type\":\"rename\",\"id\":\"{}\",\"name\":\"{}\"}}",
                            json_escape(entry_id), json_escape(&old_name)
                        ));
                    }
                    "copy" => {
                        // Reverse of copy is delete of the copy
                        let new_id = get(&op_obj, "newId").and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None }).unwrap_or_default();
                        if !new_id.is_empty() {
                            reverses.push(format!(
                                "{{\"type\":\"delete\",\"id\":\"{}\"}}",
                                json_escape(&new_id)
                            ));
                        }
                    }
                    _ => {}
                }
            }
            Some(format!("[{}]", reverses.join(",")))
        }

        // ── MIME type detection from file extension ──
        // Input: { op:"mime", name:"photo.jpg" }
        // Output: { mime:"image/jpeg", category:"image" }
        "mime" => {
            let name = field("name").unwrap_or_default();
            let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
            let (mime, category) = match ext.as_str() {
                // Images
                "jpg" | "jpeg" => ("image/jpeg", "image"),
                "png" => ("image/png", "image"),
                "gif" => ("image/gif", "image"),
                "webp" => ("image/webp", "image"),
                "svg" => ("image/svg+xml", "image"),
                "bmp" => ("image/bmp", "image"),
                "ico" => ("image/x-icon", "image"),
                "avif" => ("image/avif", "image"),
                // Video
                "mp4" => ("video/mp4", "video"),
                "webm" => ("video/webm", "video"),
                "mkv" => ("video/x-matroska", "video"),
                "avi" => ("video/x-msvideo", "video"),
                "mov" => ("video/quicktime", "video"),
                "wmv" => ("video/x-ms-wmv", "video"),
                "flv" => ("video/x-flv", "video"),
                // Audio
                "mp3" => ("audio/mpeg", "audio"),
                "wav" => ("audio/wav", "audio"),
                "ogg" => ("audio/ogg", "audio"),
                "flac" => ("audio/flac", "audio"),
                "aac" => ("audio/aac", "audio"),
                "m4a" => ("audio/mp4", "audio"),
                "wma" => ("audio/x-ms-wma", "audio"),
                // Text / code
                "txt" | "log" => ("text/plain", "text"),
                "md" => ("text/markdown", "text"),
                "html" | "htm" => ("text/html", "text"),
                "css" => ("text/css", "text"),
                "csv" => ("text/csv", "text"),
                "xml" => ("text/xml", "text"),
                "json" => ("application/json", "text"),
                "js" | "mjs" => ("text/javascript", "text"),
                "jsx" | "ts" | "tsx" => ("text/javascript", "text"),
                "rs" => ("text/x-rust", "text"),
                "py" => ("text/x-python", "text"),
                "c" | "h" => ("text/x-c", "text"),
                "cpp" | "hpp" => ("text/x-c++", "text"),
                "java" => ("text/x-java", "text"),
                "go" => ("text/x-go", "text"),
                "rb" => ("text/x-ruby", "text"),
                "php" => ("text/x-php", "text"),
                "sh" | "bash" => ("text/x-shellscript", "text"),
                "yaml" | "yml" => ("text/yaml", "text"),
                "toml" => ("text/toml", "text"),
                "ini" | "cfg" => ("text/ini", "text"),
                // Documents
                "pdf" => ("application/pdf", "document"),
                "doc" | "docx" => ("application/msword", "document"),
                "xls" | "xlsx" => ("application/vnd.ms-excel", "document"),
                "ppt" | "pptx" => ("application/vnd.ms-powerpoint", "document"),
                // Archives
                "zip" => ("application/zip", "archive"),
                "gz" | "gzip" => ("application/gzip", "archive"),
                "tar" => ("application/x-tar", "archive"),
                "7z" => ("application/x-7z-compressed", "archive"),
                "rar" => ("application/vnd.rar", "archive"),
                // Models / AI
                "gguf" => ("application/x-gguf", "model"),
                "bin" => ("application/octet-stream", "model"),
                "onnx" => ("application/x-onnx", "model"),
                // Fonts
                "woff" => ("font/woff", "font"),
                "woff2" => ("font/woff2", "font"),
                "ttf" => ("font/ttf", "font"),
                "otf" => ("font/otf", "font"),
                // Fallback
                _ => ("application/octet-stream", "unknown"),
            };
            Some(format!("{{\"mime\":\"{}\",\"category\":\"{}\"}}", mime, category))
        }

        // ── Last N modified non-folder entries ──
        // Input: { op:"recent", tree, limit:12, scopeId? }
        // Output: [{id, name, type, size, updatedAt, path}, ...]
        "recent" => {
            let limit = num("limit") as usize;
            let cap = if limit > 0 { limit } else { 12 };
            let scope_id = field("scopeId");

            let scope = scope_id.as_ref().map(|sid| scope_descendant_ids(tree, sid));

            let build_entry_path = |entry: &Value| -> String {
                let mut parts: Vec<String> = Vec::new();
                let mut cur = eparent(entry);
                let mut guard = tree.len() + 1;
                while let Some(pid) = cur {
                    if guard == 0 { break; }
                    guard -= 1;
                    if pid == "root" { break; }
                    if let Some(e) = tree.iter().find(|e| eid(e) == pid) {
                        let name = entry_field(e, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                            .unwrap_or("");
                        parts.push(name.to_string());
                        cur = eparent(e);
                    } else {
                        break;
                    }
                }
                parts.reverse();
                parts.join("/")
            };

            let mut files: Vec<&Value> = tree.iter().filter(|e| {
                let et = etype(e);
                if et == "folder" { return false; }
                let entry_id = eid(e);
                if entry_id.is_empty() || entry_id == "root" { return false; }
                if let Some(ref s) = scope {
                    if !s.contains(&entry_id) { return false; }
                }
                true
            }).collect();

            files.sort_by(|a, b| {
                let ma = entry_field(a, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let mb = entry_field(b, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                mb.partial_cmp(&ma).unwrap_or(std::cmp::Ordering::Equal)
            });

            let results: Vec<String> = files.into_iter().take(cap).map(|entry| {
                let entry_id = eid(entry);
                let name = entry_field(entry, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                let et = etype(entry);
                let size = entry_field(entry, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let updated = entry_field(entry, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let path = build_entry_path(entry);
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"type\":\"{}\",\"size\":{},\"updatedAt\":{},\"path\":\"{}\"}}",
                    json_escape(&entry_id), json_escape(name), et, num_json(size), num_json(updated), json_escape(&path)
                )
            }).collect();
            Some(format!("[{}]", results.join(",")))
        }

        // ── All image entries sorted by modified date desc ──
        // Input: { op:"gallery", tree, scopeId?, limit:200 }
        // Output: [{id, name, path, size, updatedAt}, ...]
        "gallery" => {
            let limit = num("limit") as usize;
            let cap = if limit > 0 { limit } else { 200 };
            let scope_id = field("scopeId");

            let scope = scope_id.as_ref().map(|sid| scope_descendant_ids(tree, sid));

            let build_entry_path = |entry: &Value| -> String {
                let mut parts: Vec<String> = Vec::new();
                let mut cur = eparent(entry);
                let mut guard = tree.len() + 1;
                while let Some(pid) = cur {
                    if guard == 0 { break; }
                    guard -= 1;
                    if pid == "root" { break; }
                    if let Some(e) = tree.iter().find(|e| eid(e) == pid) {
                        let name = entry_field(e, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                            .unwrap_or("");
                        parts.push(name.to_string());
                        cur = eparent(e);
                    } else {
                        break;
                    }
                }
                parts.reverse();
                parts.join("/")
            };

            let mut images: Vec<&Value> = tree.iter().filter(|e| {
                if etype(e) != "image" { return false; }
                let entry_id = eid(e);
                if entry_id.is_empty() { return false; }
                if let Some(ref s) = scope {
                    if !s.contains(&entry_id) { return false; }
                }
                true
            }).collect();

            images.sort_by(|a, b| {
                let ma = entry_field(a, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let mb = entry_field(b, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                mb.partial_cmp(&ma).unwrap_or(std::cmp::Ordering::Equal)
            });

            let results: Vec<String> = images.into_iter().take(cap).map(|entry| {
                let entry_id = eid(entry);
                let name = entry_field(entry, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                let size = entry_field(entry, "size").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let updated = entry_field(entry, "updatedAt").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
                let path = build_entry_path(entry);
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"path\":\"{}\",\"size\":{},\"updatedAt\":{}}}",
                    json_escape(&entry_id), json_escape(name), json_escape(&path), num_json(size), num_json(updated)
                )
            }).collect();
            Some(format!("[{}]", results.join(",")))
        }

        // ── Check for name collisions in destination ──
        // Input: { op:"conflict", tree, names:["file.txt",...], destId }
        // Output: { conflicts:[{name, existingId}], clean:["other.txt"] }
        "conflict" => {
            let dest_id = field("destId").unwrap_or_else(|| "root".into());
            let names: Vec<String> = match get(&req, "names") {
                Some(Value::Arr(arr)) => arr.iter().filter_map(|v| match v {
                    Value::Str(s) => Some(s.clone()),
                    _ => None,
                }).collect(),
                _ => return None,
            };

            // Build set of existing child names in destination
            let existing: HashMap<String, String> = tree.iter().filter_map(|e| {
                if eparent(e).as_deref() != Some(&dest_id) { return None; }
                let name = entry_field(e, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })?;
                let entry_id = eid(e);
                Some((name.to_lowercase(), entry_id))
            }).collect();

            let mut conflicts: Vec<String> = Vec::new();
            let mut clean: Vec<String> = Vec::new();
            for name in &names {
                match existing.get(&name.to_lowercase()) {
                    Some(existing_id) => {
                        conflicts.push(format!(
                            "{{\"name\":\"{}\",\"existingId\":\"{}\"}}",
                            json_escape(name), json_escape(existing_id)
                        ));
                    }
                    None => {
                        clean.push(format!("\"{}\"", json_escape(name)));
                    }
                }
            }
            Some(format!("{{\"conflicts\":[{}],\"clean\":[{}]}}", conflicts.join(","), clean.join(",")))
        }

        _ => None,
    }
}
