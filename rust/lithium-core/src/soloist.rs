use crate::{get, as_num, json_escape, num_json, Parser, Value};

/* ---------- Soloist Spotify entity extraction ---------- */

/// Extract display info from a Soloist entity envelope.
/// Input: {"item": {...}} → {uri, name, artist, album, cover, durationMs} or null.
pub fn entity_info(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };
    let item = get(&req, "item")?;
    let Value::Obj(item_obj) = item else { return None };

    // uri
    let uri = get(item_obj, "uri")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    // decorations
    let decor = match get(item_obj, "decorations") {
        Some(Value::Obj(d)) => d,
        _ => return Some("{\"uri\":\"\",\"name\":\"Unknown\",\"artist\":\"\",\"album\":\"\",\"cover\":null,\"durationMs\":0}".into()),
    };

    // identity.name
    let name = get(decor, "identity")
        .and_then(|v| match v { Value::Obj(o) => get(o, "name"), _ => None })
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("Unknown");

    // creators → artist names
    let mut artist = String::new();
    if let Some(Value::Arr(creators)) = get(decor, "creators") {
        for (i, c) in creators.iter().enumerate() {
            let creator_name = match c {
                Value::Obj(co) => get(co, "entity")
                    .and_then(|e| match e { Value::Obj(eo) => get(eo, "decorations"), _ => None })
                    .and_then(|d| match d { Value::Obj(do_) => get(do_, "identity"), _ => None })
                    .and_then(|id| match id { Value::Obj(io) => get(io, "name"), _ => None })
                    .and_then(|n| match n { Value::Str(s) => Some(s.as_str()), _ => None }),
                _ => None,
            };
            if let Some(n) = creator_name {
                if i > 0 { artist.push_str(", "); }
                artist.push_str(n);
            }
        }
    }

    // parent.entity.decorations.identity.name → album
    let album = get(decor, "parent")
        .and_then(|v| match v { Value::Obj(o) => get(o, "entity"), _ => None })
        .and_then(|v| match v { Value::Obj(o) => get(o, "decorations"), _ => None })
        .and_then(|v| match v { Value::Obj(o) => get(o, "identity"), _ => None })
        .and_then(|v| match v { Value::Obj(o) => get(o, "name"), _ => None })
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    // visual_identity.cover[0].url → cover
    let cover = get(decor, "visual_identity")
        .and_then(|v| match v { Value::Obj(o) => get(o, "cover"), _ => None })
        .and_then(|v| match v { Value::Arr(a) => a.first(), _ => None })
        .and_then(|v| match v { Value::Obj(o) => get(o, "url"), _ => None })
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None });

    // playback.duration_ms → durationMs
    let duration_ms = get(decor, "playback")
        .and_then(|v| match v { Value::Obj(o) => get(o, "duration_ms"), _ => None })
        .map(|v| as_num(v))
        .unwrap_or(0.0);

    let mut out = String::from("{\"uri\":\"");
    out.push_str(&json_escape(uri));
    out.push_str("\",\"name\":\"");
    out.push_str(&json_escape(name));
    out.push_str("\",\"artist\":\"");
    out.push_str(&json_escape(&artist));
    out.push_str("\",\"album\":\"");
    out.push_str(&json_escape(album));
    out.push_str("\",\"cover\":");
    match cover {
        Some(c) => { out.push('"'); out.push_str(&json_escape(c)); out.push('"'); }
        None => out.push_str("null"),
    }
    out.push_str(",\"durationMs\":");
    out.push_str(&num_json(duration_ms));
    out.push('}');
    Some(out)
}

/* ---------- Playback position interpolation ---------- */

/// Interpolate playback position (seconds) from a position_sync anchor.
/// Input: {"anchor": {...} | null, "status": "playing"|..., "now": 1234567890} → seconds number.
/// `now` must be supplied by JS (Date.now()) since WASM has no clock.
pub fn position(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let status = get(&req, "status")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let anchor = match get(&req, "anchor") {
        Some(Value::Obj(a)) => a,
        _ => return Some("0".into()),
    };

    let position_ms = get(anchor, "position_ms").map(|v| as_num(v)).unwrap_or(0.0);
    let timestamp_ms = get(anchor, "timestamp_ms").map(|v| as_num(v)).unwrap_or(0.0);
    let speed = get(anchor, "speed").map(|v| as_num(v)).unwrap_or(0.0);
    let now = get(&req, "now").map(|v| as_num(v)).unwrap_or(0.0);

    let seconds = if status != "playing" || speed == 0.0 || now == 0.0 {
        position_ms / 1000.0
    } else {
        (position_ms + (now - timestamp_ms) * speed) / 1000.0
    };

    Some(num_json(seconds))
}
