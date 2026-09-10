//! File-system tree operations — pure transforms over the entry array.
//! All ops take/return JSON strings through a single `fs_op` entry point:
//!   in : {"op","tree","id","parentId","suffix","seed","now"}
//!   out: JSON (op-specific) — or None on any parse error (JS falls back).

use crate::{get, json_escape, write_json, Parser, Value};
use std::collections::{HashMap, HashSet};

pub(crate) fn entry_field<'v>(v: &'v Value, key: &str) -> Option<&'v Value> {
    match v {
        Value::Obj(obj) => get(obj, key),
        _ => None,
    }
}

pub(crate) fn eid(v: &Value) -> String {
    entry_field(v, "id").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("").to_string()
}

pub(crate) fn eparent(v: &Value) -> Option<String> {
    entry_field(v, "parentId").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).map(|s| s.to_string())
}

pub(crate) fn etype(v: &Value) -> String {
    entry_field(v, "type").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("").to_string()
}

pub(crate) fn obj_set(obj: &mut Vec<(String, Value)>, key: &str, val: Value) {
    if let Some(pair) = obj.iter_mut().find(|(k, _)| k == key) {
        pair.1 = val;
    } else {
        obj.push((key.to_string(), val));
    }
}

pub(crate) fn doomed_ids(entries: &[Value], id: &str) -> HashSet<String> {
    let mut doomed: HashSet<String> = HashSet::new();
    doomed.insert(id.to_string());
    let mut grew = true;
    while grew {
        grew = false;
        for entry in entries {
            let child = eid(entry);
            if let Some(parent) = eparent(entry) {
                if doomed.contains(&parent) && !doomed.contains(&child) {
                    doomed.insert(child);
                    grew = true;
                }
            }
        }
    }
    doomed
}

pub(crate) fn serialize_tree(items: &[Value]) -> String {
    let mut out = String::from("[");
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        write_json(item, &mut out);
    }
    out.push(']');
    out
}

pub(crate) fn insert_suffix(name: &str, suffix: &str) -> String {
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{}{}{}", &name[..dot], suffix, &name[dot..]),
        _ => format!("{}{}", name, suffix),
    }
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

    let op = field("op")?;
    let Value::Arr(tree) = get(&req, "tree")? else { return None };
    let id = field("id").unwrap_or_default();

    match op.as_str() {
        // ["id", ...] — every entry inside the subtree (inclusive).
        "doomed" => {
            let doomed = doomed_ids(tree, &id);
            let parts: Vec<String> = tree
                .iter()
                .filter(|e| doomed.contains(&eid(e)))
                .map(|e| format!("\"{}\"", json_escape(&eid(e))))
                .collect();
            Some(format!("[{}]", parts.join(",")))
        }

        // Folder ids inside the subtree (paste-loop guard).
        "folders" => {
            let doomed = doomed_ids(tree, &id);
            let parts: Vec<String> = tree
                .iter()
                .filter(|e| doomed.contains(&eid(e)) && etype(e) == "folder")
                .map(|e| format!("\"{}\"", json_escape(&eid(e))))
                .collect();
            Some(format!("[{}]", parts.join(",")))
        }

        // Tree without the subtree.
        "remove" => {
            let doomed = doomed_ids(tree, &id);
            let kept: Vec<&Value> = tree.iter().filter(|e| !doomed.contains(&eid(e))).collect();
            let mut out = String::from("[");
            for (idx, item) in kept.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                write_json(item, &mut out);
            }
            out.push(']');
            Some(out)
        }

        // Reparent with self-nesting guard; bumps updatedAt.
        "move" => {
            let parent = field("parentId")?;
            let now = num("now");
            if id == parent || doomed_ids(tree, &id).contains(&parent) {
                return Some(serialize_tree(tree));
            }
            let mut next: Vec<Value> = tree.clone();
            for entry in next.iter_mut() {
                if eid(entry) == id {
                    if let Value::Obj(obj) = entry {
                        obj_set(obj, "parentId", Value::Str(parent.clone()));
                        obj_set(obj, "updatedAt", Value::Num(now));
                    }
                }
            }
            Some(serialize_tree(&next))
        }

        // [{"id","name"}, ...] from the entry up to (excluding) root.
        "path" => {
            let mut parts: Vec<String> = Vec::new();
            let mut current = id.clone();
            let mut guard = tree.len() + 1;
            while guard > 0 {
                guard -= 1;
                let Some(entry) = tree.iter().find(|e| eid(e) == current) else { break };
                if current == "root" {
                    break;
                }
                let name = entry_field(entry, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                parts.push(format!("{{\"id\":\"{}\",\"name\":\"{}\"}}", json_escape(&current), json_escape(name)));
                match eparent(entry) {
                    Some(parent) => current = parent,
                    None => break,
                }
            }
            parts.reverse();
            Some(format!("[{}]", parts.join(",")))
        }

        // Deep-copy with fresh ids: {"tree":[...],"idMap":{"old":"new",...}}
        "duplicate" => {
            let parent = field("parentId")?;
            let suffix = field("suffix").unwrap_or_else(|| " (copy)".into());
            let seed = field("seed").unwrap_or_else(|| "0".into());
            let now = num("now");
            let doomed = doomed_ids(tree, &id);
            let members: Vec<usize> = tree
                .iter()
                .enumerate()
                .filter(|(_, e)| doomed.contains(&eid(e)))
                .map(|(idx, _)| idx)
                .collect();
            if members.is_empty() {
                return Some(format!("{{\"tree\":{},\"idMap\":{{}}}}", serialize_tree(tree)));
            }

            let mut id_map: HashMap<String, String> = HashMap::new();
            for (n, idx) in members.iter().enumerate() {
                id_map.insert(eid(&tree[*idx]), format!("entry-{}-{}", seed, n));
            }

            let mut clones: Vec<Value> = Vec::with_capacity(members.len());
            for idx in &members {
                let entry = &tree[*idx];
                let old = eid(entry);
                let mut clone = entry.clone();
                if let Value::Obj(obj) = &mut clone {
                    let is_root_member = old == id;
                    let is_folder = etype(entry) == "folder";
                    let new_id = id_map.get(&old).cloned().unwrap_or_default();
                    let new_parent = if is_root_member {
                        parent.clone()
                    } else {
                        eparent(entry)
                            .and_then(|p| id_map.get(&p).cloned())
                            .unwrap_or_default()
                    };
                    obj_set(obj, "id", Value::Str(new_id));
                    obj_set(obj, "parentId", Value::Str(new_parent));
                    if is_root_member && !is_folder {
                        let name = entry_field(entry, "name")
                            .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
                            .unwrap_or_default();
                        obj_set(obj, "name", Value::Str(insert_suffix(&name, &suffix)));
                    }
                    obj_set(obj, "createdAt", Value::Num(now));
                    obj_set(obj, "updatedAt", Value::Num(now));
                }
                clones.push(clone);
            }

            let mut next: Vec<Value> = tree.clone();
            next.append(&mut clones);

            let mut map_parts: Vec<String> = tree
                .iter()
                .filter_map(|e| {
                    let old = eid(e);
                    id_map.get(&old).map(|new| format!("\"{}\":\"{}\"", json_escape(&old), json_escape(new)))
                })
                .collect();
            map_parts.dedup();
            Some(format!(
                "{{\"tree\":{},\"idMap\":{{{}}}}}",
                serialize_tree(&next),
                map_parts.join(",")
            ))
        }

        // Get a single entry by id (linear scan)
        "entry" => {
            for entry in tree.iter() {
                if eid(entry) == id {
                    let mut out = String::new();
                    write_json(entry, &mut out);
                    return Some(out);
                }
            }
            Some("null".to_string())
        }

        // Get sorted children of a folder (folders first, then by name)
        "children" => {
            let mut children: Vec<&Value> = tree
                .iter()
                .filter(|e| eparent(e).as_deref() == Some(&id))
                .collect();
            
            // Sort: folders first, then alphabetically by name
            children.sort_by(|a, b| {
                let type_a = etype(a);
                let type_b = etype(b);
                let name_a = entry_field(a, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let name_b = entry_field(b, "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                
                match (type_a.as_str(), type_b.as_str()) {
                    ("folder", "folder") | ("text", "text") | ("image", "image") => name_a.cmp(name_b),
                    ("folder", _) => std::cmp::Ordering::Less,
                    (_, "folder") => std::cmp::Ordering::Greater,
                    _ => name_a.cmp(name_b),
                }
            });
            
            let cloned: Vec<Value> = children.into_iter().cloned().collect();
            Some(serialize_tree(&cloned))
        }

        // Calculate total bytes used by all entries
        "used_bytes" => {
            let total: f64 = tree.iter().map(|entry| {
                let size = entry_field(entry, "size")
                    .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
                    .unwrap_or(0.0);
                let content_len = entry_field(entry, "content")
                    .and_then(|v| match v { Value::Str(s) => Some(s.len() as f64), _ => None })
                    .unwrap_or(0.0);
                size + content_len
            }).sum();
            Some(format!("{{\"total\":{}}}", total as u64))
        }

        // Search tree by name/type substring: [{id, name, type, path}, ...]
        "search" => {
            let query = field("query").unwrap_or_default();
            let type_filter = field("type_filter").unwrap_or_default();
            let limit = num("limit") as usize;
            let cap = if limit > 0 { limit } else { 100 };
            let q_lower = query.to_lowercase();

            let build_path = |entry: &Value| -> String {
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

            let mut results: Vec<String> = Vec::new();
            for entry in tree.iter() {
                if results.len() >= cap { break; }
                let entry_id = eid(entry);
                if entry_id.is_empty() || entry_id == "root" { continue; }
                let et = etype(entry);
                if !type_filter.is_empty() && et != type_filter { continue; }
                let name = entry_field(entry, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                if !q_lower.is_empty() && !name.to_lowercase().contains(&q_lower) { continue; }
                let path = build_path(entry);
                let full_path = if path.is_empty() { name.to_string() } else { format!("{}/{}", path, name) };
                results.push(format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"type\":\"{}\",\"path\":\"{}\"}}",
                    json_escape(&entry_id), json_escape(name), et, json_escape(&full_path)
                ));
            }
            Some(format!("[{}]", results.join(",")))
        }

        // Tree statistics: {total, files, folders, maxDepth, totalSize}
        "stats" => {
            let parent_map: HashMap<String, String> = tree.iter().filter_map(|e| {
                let eid_val = eid(e);
                eparent(e).map(|p| (eid_val, p))
            }).collect();

            let calc_depth = |entry: &Value| -> usize {
                let mut depth = 0usize;
                let mut cur = eparent(entry);
                let mut guard = tree.len() + 1;
                while let Some(pid) = cur {
                    if guard == 0 { break; }
                    guard -= 1;
                    depth += 1;
                    if pid == "root" { break; }
                    cur = parent_map.get(&pid).cloned();
                }
                depth
            };

            let total = tree.len();
            let mut files = 0usize;
            let mut folders = 0usize;
            let mut total_size: f64 = 0.0;
            let mut max_depth = 0usize;
            for entry in tree.iter() {
                let et = etype(entry);
                if et == "folder" { folders += 1; } else { files += 1; }
                let size = entry_field(entry, "size")
                    .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
                    .unwrap_or(0.0);
                let content_len = entry_field(entry, "content")
                    .and_then(|v| match v { Value::Str(s) => Some(s.len() as f64), _ => None })
                    .unwrap_or(0.0);
                total_size += size.max(content_len);
                let d = calc_depth(entry);
                if d > max_depth { max_depth = d; }
            }
            Some(format!(
                "{{\"total\":{},\"files\":{},\"folders\":{},\"maxDepth\":{},\"totalSize\":{}}}",
                total, files, folders, max_depth, total_size as u64
            ))
        }

        // Move entry (+ children) into trash folder
        "trash" => {
            let trash_id = field("trashId").unwrap_or_else(|| "default-trash".into());
            let now = num("now");
            let target = tree.iter().find(|e| eid(e) == id);
            if target.is_none() || id == trash_id {
                return Some(serialize_tree(tree));
            }
            let target_parent = eparent(target.unwrap());
            let mut next: Vec<Value> = Vec::with_capacity(tree.len());
            for entry in tree.iter() {
                let mut e = entry.clone();
                if eid(&e) == id {
                    if let Value::Obj(obj) = &mut e {
                        obj_set(obj, "parentId", Value::Str(trash_id.clone()));
                        obj_set(obj, "trashedAt", Value::Num(now));
                        if let Some(ref orig) = target_parent {
                            obj_set(obj, "originalParentId", Value::Str(orig.clone()));
                        }
                        obj_set(obj, "updatedAt", Value::Num(now));
                    }
                }
                next.push(e);
            }
            Some(serialize_tree(&next))
        }

        // Restore entry from trash back to original parent
        "restore" => {
            let now = num("now");
            let target = tree.iter().find(|e| eid(e) == id);
            if target.is_none() {
                return Some(serialize_tree(tree));
            }
            let target = target.unwrap();
            let orig_parent = entry_field(target, "originalParentId")
                .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                .unwrap_or("root");
            // Verify original parent still exists (or fall back to root)
            let parent_id = if orig_parent == "root" || tree.iter().any(|e| eid(e) == orig_parent) {
                orig_parent.to_string()
            } else {
                "root".to_string()
            };
            let mut next: Vec<Value> = Vec::with_capacity(tree.len());
            for entry in tree.iter() {
                let mut e = entry.clone();
                if eid(&e) == id {
                    if let Value::Obj(obj) = &mut e {
                        obj_set(obj, "parentId", Value::Str(parent_id.clone()));
                        obj.retain(|(k, _)| k != "trashedAt" && k != "originalParentId");
                        obj_set(obj, "updatedAt", Value::Num(now));
                    }
                }
                next.push(e);
            }
            Some(serialize_tree(&next))
        }

        // Walk folder tree into flat rows: [{id, path, type, size}, ...]
        "walk" => {
            let folder = field("folder").unwrap_or_else(|| "root".into());
            let limit = num("limit") as usize;
            let cap = if limit > 0 { limit } else { 500 };

            // Build children index for efficient traversal
            let mut children_of: HashMap<String, Vec<usize>> = HashMap::new();
            for (idx, entry) in tree.iter().enumerate() {
                if let Some(pid) = eparent(entry) {
                    children_of.entry(pid).or_default().push(idx);
                }
            }

            let mut rows: Vec<String> = Vec::new();
            let mut stack: Vec<(String, String)> = vec![(folder, String::new())];
            while let Some((fid, prefix)) = stack.pop() {
                if rows.len() >= cap { break; }
                let mut indices = children_of.remove(&fid).unwrap_or_default();
                // Sort children: folders first, then by name
                indices.sort_by(|&a, &b| {
                    let ta = etype(&tree[a]);
                    let tb = etype(&tree[b]);
                    let na = entry_field(&tree[a], "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                    let nb = entry_field(&tree[b], "name").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                    match (ta.as_str(), tb.as_str()) {
                        ("folder", "folder") | ("text", "text") | ("image", "image") => na.cmp(nb),
                        ("folder", _) => std::cmp::Ordering::Less,
                        (_, "folder") => std::cmp::Ordering::Greater,
                        _ => na.cmp(nb),
                    }
                });
                // Push in reverse so first child is processed first (stack is LIFO)
                for &idx in indices.iter().rev() {
                    let entry = &tree[idx];
                    let name = entry_field(entry, "name")
                        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                        .unwrap_or("");
                    let path = if prefix.is_empty() { name.to_string() } else { format!("{}/{}", prefix, name) };
                    let size = entry_field(entry, "size")
                        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
                        .unwrap_or(0.0);
                    rows.push(format!(
                        "{{\"id\":\"{}\",\"path\":\"{}\",\"type\":\"{}\",\"size\":{}}}",
                        json_escape(&eid(entry)), json_escape(&path), etype(entry), crate::num_json(size)
                    ));
                    if etype(entry) == "folder" {
                        stack.push((eid(entry), path));
                    }
                }
            }
            Some(format!("[{}]", rows.join(",")))
        }

        _ => None,
    }
}
