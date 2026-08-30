/**
 * JS facade over the Rust lithium-core wasm module.
 * Sync facades return null when wasm isn't loaded; callers supply
 * minimal JS defaults via `|| fallback`.
 */

let exportsRef = null;
let readyPromise = null;

export function coreReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const response = await fetch(new URL('../wasm/lithium_core.wasm', import.meta.url));
        if (!response.ok) throw new Error(`wasm fetch ${response.status}`);
        const bytes = await response.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        exportsRef = instance.exports;
        const fnCount = Object.keys(exportsRef).filter(k => typeof exportsRef[k] === 'function').length;
        console.log(`[lithium-core] WASM loaded — ${fnCount} native functions available`);
      } catch (err) {
        exportsRef = null;
        console.warn('[lithium-core] WASM unavailable:', err.message || err);
      }
      return exportsRef;
    })();
  }
  return readyPromise;
}

export function hasWasm() {
  return Boolean(exportsRef);
}

/** Diagnostic: returns a summary of WASM status for browser console debugging. */
export function wasmStatus() {
  if (!exportsRef) return { wasm: false, functions: [] };
  const fns = Object.keys(exportsRef).filter(k => typeof exportsRef[k] === 'function');
  return { wasm: true, functions: fns, memory: `${(exportsRef.memory.buffer.byteLength / 1024).toFixed(0)} KB` };
}

const mem = () => new Uint8Array(exportsRef.memory.buffer);

/** Run a WASM call with graceful null-return when exports aren't ready. */
function safe(fn) {
  if (!exportsRef) return null;
  return fn();
}

function toWasm(u8) {
  const ptr = exportsRef.alloc(u8.length);
  mem().set(u8, ptr);
  return ptr;
}

function fromOut(len) {
  const ptr = exportsRef.out_ptr();
  return mem().slice(ptr, ptr + len);
}

/** LZ4-compress (size-prepended container). Returns Uint8Array or null (no wasm). */
export async function wasmCompress(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const len = wasm.lz4_compress(toWasm(u8), u8.length);
  return len ? fromOut(len) : null;
}

/** Decompress a container produced by wasmCompress. */
export async function wasmDecompress(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const inPtr = toWasm(u8);
  const orig = wasm.lz4_uncompressed_size(inPtr, u8.length);
  if (!orig) return null;
  const outPtr = wasm.alloc(orig);
  const written = wasm.lz4_decompress_into(inPtr, u8.length, outPtr, orig);
  if (!written) return null;
  return mem().slice(outPtr, outPtr + written);
}

/** xxh3-64 integrity hash as a hex string (null without wasm). */
export async function wasmHash(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const value = wasm.xxh3(toWasm(u8), u8.length);
  return BigInt.asUintN(64, value).toString(16).padStart(16, '0');
}

/** JSON (entries array) → binary snapshot. Null without wasm. */
export async function snapshotEncode(jsonString) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const bytes = new TextEncoder().encode(jsonString);
  const len = wasm.snapshot_encode(toWasm(bytes), bytes.length);
  return len ? fromOut(len) : null;
}

/** Binary snapshot → JSON string. Null without wasm or on corruption. */
export async function snapshotDecode(bin) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const len = wasm.snapshot_decode(toWasm(bin), bin.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}

/* ---------- Sync facades (markdown + fs ops) ----------
 * These run only when the wasm is already instantiated (warmed up at app
 * start); callers keep a JS fallback for the null result. */

function callStr(fn, text) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}

/** Markdown → HTML via Rust. Null when wasm isn't loaded (JS fallback). */
export function mdRenderSync(source) {
  return safe(() => {
    return callStr(exportsRef.md_render, source || '');
  });
}

/** Enhanced Markdown (Obsidian/GFM) → HTML via Rust. Null without wasm. */
export function mdRenderEnhancedSync(source) {
  return safe(() => {
    return callStr(exportsRef.md_render_enhanced, source || '');
  });
}

/** Unique [[wiki link]] targets via Rust. Null without wasm. */
export function mdWikiLinksSync(source) {
  return safe(() => {
    const out = callStr(exportsRef.md_wiki_links, source || '');
    return out ? JSON.parse(out) : null;
  });
}

/** File-system tree op via Rust. `op` = { op, tree, id, … } → parsed JSON or null. */
export function fsOpSync(request) {
  return safe(() => {
    const out = callStr(exportsRef.fs_op, JSON.stringify(request));
    return out ? JSON.parse(out) : null;
  });
}

/** Full API catalog from Rust ({ api, ns, desc, callers, params }[]). */
export function apiCatalogSync() {
  return safe(() => {
    const len = exportsRef.api_catalog();
    return len ? JSON.parse(new TextDecoder().decode(fromOut(len))) : null;
  });
}

/** Validate an API call request in Rust → { ok, api, params } | { ok: false, error }. */
export function apiValidateSync(request) {
  return safe(() => {
    const out = callStr(exportsRef.api_validate, JSON.stringify(request));
    return out ? JSON.parse(out) : null;
  });
}

/** Prepend audit log entry and cap: returns updated log array. */
export function apiAuditAppendSync(log, api, caller, ok, error, now, cap) {
  return safe(() => {
    const out = callStr(exportsRef.api_audit_append, JSON.stringify({ log, api, caller, ok, error: error || '', now, cap }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Notification history facades ---------- */

/** Filter notifications by age. JSON string → filtered JSON string. */
export function notifyFilterSync(jsonString, cutoffMs) {
  return safe(() => {
    const bytes = new TextEncoder().encode(jsonString);
    const len = exportsRef.notify_filter(toWasm(bytes), bytes.length, cutoffMs);
    return len ? new TextDecoder().decode(fromOut(len)) : null;
  });
}

/** Mark all notifications as read. JSON string → updated JSON string. */
export function notifyMarkAllReadSync(jsonString) {
  return safe(() => {
    const bytes = new TextEncoder().encode(jsonString);
    const len = exportsRef.notify_mark_all_read(toWasm(bytes), bytes.length);
    return len ? new TextDecoder().decode(fromOut(len)) : null;
  });
}

/** Mark single notification as read. JSON string + id → updated JSON string. */
export function notifyMarkReadSync(jsonString, id) {
  return safe(() => {
    const bytes = new TextEncoder().encode(jsonString);
    const idBytes = new TextEncoder().encode(id);
    const len = exportsRef.notify_mark_read(toWasm(bytes), bytes.length, toWasm(idBytes), idBytes.length);
    return len ? new TextDecoder().decode(fromOut(len)) : null;
  });
}

/** Dismiss notification by id. JSON string + id → filtered JSON string. */
export function notifyDismissSync(jsonString, id) {
  return safe(() => {
    const bytes = new TextEncoder().encode(jsonString);
    const idBytes = new TextEncoder().encode(id);
    const len = exportsRef.notify_dismiss(toWasm(bytes), bytes.length, toWasm(idBytes), idBytes.length);
    return len ? new TextDecoder().decode(fromOut(len)) : null;
  });
}

/** Count unread notifications. JSON string → count. */
export function notifyUnreadCountSync(jsonString) {
  return safe(() => {
    const bytes = new TextEncoder().encode(jsonString);
    return exportsRef.notify_unread_count(toWasm(bytes), bytes.length);
  });
}

/* ---------- Settings facades ---------- */

/** Default settings as JSON object. */
export function settingsDefaultsSync() {
  return safe(() => {
    const len = exportsRef.settings_defaults();
    return len ? JSON.parse(new TextDecoder().decode(fromOut(len))) : null;
  });
}

/** Deep-merge stored settings over defaults. */
export function settingsMergeSync(stored) {
  return safe(() => {
    const out = callStr(exportsRef.settings_merge, JSON.stringify({ stored }));
    return out ? JSON.parse(out) : null;
  });
}

/** Immutable set at dotted path. */
export function settingsSetAtPathSync(settings, path, value) {
  return safe(() => {
    const out = callStr(exportsRef.settings_set_at_path, JSON.stringify({ settings, path, value }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Window snap facades ---------- */

/** Detect snap zone from pointer position. */
export function snapDetectZoneSync(x, y, screenWidth) {
  return safe(() => {
    const out = callStr(exportsRef.snap_detect_zone, JSON.stringify({ x, y, screenWidth }));
    return out ? JSON.parse(out) : null;
  });
}

/** Calculate window bounds for a snap side. */
export function snapBoundsSync(side, taskbarPosition, screenWidth, screenHeight) {
  return safe(() => {
    const out = callStr(exportsRef.snap_bounds, JSON.stringify({ side, taskbarPosition, screenWidth, screenHeight }));
    return out ? JSON.parse(out) : null;
  });
}

/** Calculate preview style for a snap zone. */
export function snapPreviewStyleSync(side, taskbarPosition, screenWidth, screenHeight) {
  return safe(() => {
    const out = callStr(exportsRef.snap_preview_style, JSON.stringify({ side, taskbarPosition, screenWidth, screenHeight }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Lock facades ---------- */

/** Validate PIN format and lockout state. */
export function lockVerifySync(pin, failCount, lockedUntil, now) {
  return safe(() => {
    const out = callStr(exportsRef.lock_verify, JSON.stringify({ pin, failCount, lockedUntil, now }));
    return out ? JSON.parse(out) : null;
  });
}

/** Record PIN failure and compute lockout. */
export function lockRecordFailureSync(failCount, now) {
  return safe(() => {
    const out = callStr(exportsRef.lock_record_failure, JSON.stringify({ failCount, now }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Memory facades ---------- */

/** Write memory entry with LRU eviction. */
export function memoryWriteSync(memory, key, value, now) {
  return safe(() => {
    const out = callStr(exportsRef.memory_write, JSON.stringify({ memory, key, value, now }));
    return out ? JSON.parse(out) : null;
  });
}

/** Generate compact memory dump. */
export function memoryDumpSync(memory, maxEntries = 40) {
  return safe(() => {
    const out = callStr(exportsRef.memory_dump, JSON.stringify({ memory, maxEntries }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Agent facades ---------- */

/** Get mode catalog. */
export function agentModeCatalogSync() {
  return safe(() => {
    const len = exportsRef.agent_mode_catalog();
    return len ? JSON.parse(new TextDecoder().decode(fromOut(len))) : null;
  });
}

/** Extract ```api blocks from text. */
export function agentExtractApiCallsSync(text) {
  return safe(() => {
    const out = callStr(exportsRef.agent_extract_api_calls, JSON.stringify({ text }));
    return out ? JSON.parse(out) : null;
  });
}

/** Extract ```widget blocks from text. */
export function agentExtractWidgetBlocksSync(text) {
  return safe(() => {
    const out = callStr(exportsRef.agent_extract_widget_blocks, JSON.stringify({ text }));
    return out ? JSON.parse(out) : null;
  });
}

/** Strip tool blocks from text. */
export function agentStripToolBlocksSync(text) {
  return safe(() => {
    const out = callStr(exportsRef.agent_strip_tool_blocks, JSON.stringify({ text }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Chat facades ---------- */

/** Upsert chat keeping list most-recent-first. */
export function chatsUpsertSync(chats, chat, now) {
  return safe(() => {
    const out = callStr(exportsRef.chats_upsert, JSON.stringify({ chats, chat, now }));
    return out ? JSON.parse(out) : null;
  });
}

/** Delete chat by id. */
export function chatsDeleteSync(chats, id) {
  return safe(() => {
    const out = callStr(exportsRef.chats_delete, JSON.stringify({ chats, id }));
    return out ? JSON.parse(out) : null;
  });
}

/** Trim chats list to max. */
export function chatsTrimSync(chats) {
  return safe(() => {
    const out = callStr(exportsRef.chats_trim, JSON.stringify({ chats }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Storage calculation facades ---------- */

/** Format bytes to human-readable string. */
export function storageFormatBytesSync(bytes) {
  return safe(() => {
    const out = callStr(exportsRef.storage_format_bytes, JSON.stringify({ bytes }));
    return out ? JSON.parse(out) : null;
  });
}

/** Guess total disk from quota. */
export function storageGuessDiskSync(quota) {
  return safe(() => {
    const out = callStr(exportsRef.storage_guess_disk, JSON.stringify({ quota }));
    return out ? JSON.parse(out) : null;
  });
}

/** Storage summary with formatted sizes. */
export function storageSummarySync(snapshot) {
  return safe(() => {
    const out = callStr(exportsRef.storage_summary, JSON.stringify(snapshot));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Weather facades ---------- */

/** Weather description from WMO code. */
export function weatherDescriptionSync(code) {
  return safe(() => {
    const out = callStr(exportsRef.weather_description, JSON.stringify({ code }));
    return out ? JSON.parse(out) : null;
  });
}

/** Weather emoji from WMO code + day/night. */
export function weatherEmojiSync(code, isDay) {
  return safe(() => {
    const out = callStr(exportsRef.weather_emoji, JSON.stringify({ code, isDay }));
    return out ? JSON.parse(out) : null;
  });
}

/** Build weather report markdown. */
export function weatherReportSync(data) {
  return safe(() => {
    const out = callStr(exportsRef.weather_report, JSON.stringify(data));
    return out ? JSON.parse(out) : null;
  });
}

/** Weather summary line. */
export function weatherSummaryLineSync(params) {
  return safe(() => {
    const out = callStr(exportsRef.weather_summary_line, JSON.stringify(params));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- KV tier facades ---------- */

/** Decide if value should overflow to IndexedDB. */
export function kvShouldOverflowSync(jsonLength) {
  return safe(() => {
    const out = callStr(exportsRef.kv_should_overflow, JSON.stringify({ jsonLength }));
    return out ? JSON.parse(out) : null;
  });
}

/** Calculate overflow bytes from entries. */
export function kvOverflowBytesSync(entries) {
  return safe(() => {
    const out = callStr(exportsRef.kv_overflow_bytes, JSON.stringify({ entries }));
    return out ? JSON.parse(out) : null;
  });
}

/** Migration candidates for overflow. */
export function kvMigrationCandidatesSync(entries) {
  return safe(() => {
    const out = callStr(exportsRef.kv_migration_candidates, JSON.stringify({ entries }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Download sync facades ---------- */

/** Download slug from name. */
export function dlSlugSync(name) {
  return safe(() => {
    const out = callStr(exportsRef.dl_slug, JSON.stringify({ name }));
    return out ? JSON.parse(out) : null;
  });
}

/** Download progress with formatted sizes. */
export function dlProgressSync(received, total) {
  return safe(() => {
    const out = callStr(exportsRef.dl_progress, JSON.stringify({ received, total }));
    return out ? JSON.parse(out) : null;
  });
}

/** Download state from progress. */
export function dlStateSync(received, total, error) {
  return safe(() => {
    const out = callStr(exportsRef.dl_state, JSON.stringify({ received, total, error }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Model facades ---------- */

/** Slugify a model name. */
export function modelSlugifySync(text) {
  return safe(() => {
    const out = callStr(exportsRef.model_slugify, JSON.stringify({ text }));
    return out ? JSON.parse(out) : null;
  });
}

/** Parse Hugging Face URL. */
export function modelParseHfUrlSync(url) {
  return safe(() => {
    const out = callStr(exportsRef.model_parse_hf_url, JSON.stringify({ url }));
    return out ? JSON.parse(out) : null;
  });
}

/** Resolve HF file URL. */
export function modelHfResolveUrlSync(repoId, file) {
  return safe(() => {
    const out = callStr(exportsRef.model_hf_resolve_url, JSON.stringify({ repoId, file }));
    return out ? JSON.parse(out) : null;
  });
}

/** Search/filter models. */
export function modelSearchSync(models, query, tier) {
  return safe(() => {
    const out = callStr(exportsRef.model_search, JSON.stringify({ models, query: query || '', tier: tier || '' }));
    return out ? JSON.parse(out) : null;
  });
}

/** Download slug from model name. */
export function modelDownloadSlugSync(name) {
  return safe(() => {
    const out = callStr(exportsRef.model_download_slug, JSON.stringify({ name }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Soloist facades ---------- */

/** Extract display info from a Soloist entity envelope. */
export function soloistEntityInfoSync(item) {
  return safe(() => {
    const out = callStr(exportsRef.soloist_entity_info, JSON.stringify({ item }));
    return out ? JSON.parse(out) : null;
  });
}

/** Interpolate playback position from anchor. JS must supply now = Date.now(). */
export function soloistPositionSync(anchor, status) {
  return safe(() => {
    const out = callStr(exportsRef.soloist_position, JSON.stringify({ anchor, status, now: Date.now() }));
    return out ? parseFloat(out) : null;
  });
}

/* ---------- Inference runtime facades ---------- */

/** Prepare chat messages for inference (Qwen3 /no_think injection). */
export function runtimePrepareMessagesSync(messages, modelId, noThink, thinking) {
  return safe(() => {
    const out = callStr(exportsRef.runtime_prepare_messages, JSON.stringify({ messages, modelId, noThink, thinking }));
    return out ? JSON.parse(out) : null;
  });
}

/** Estimate token count from text. */
export function runtimeEstimateTokensSync(text) {
  return safe(() => {
    const out = callStr(exportsRef.runtime_estimate_tokens, JSON.stringify({ text }));
    return out ? JSON.parse(out) : null;
  });
}

/** Estimate total tokens across messages. */
export function runtimeEstimateMessagesTokensSync(messages) {
  return safe(() => {
    const out = callStr(exportsRef.runtime_estimate_messages_tokens, JSON.stringify({ messages }));
    return out ? JSON.parse(out) : null;
  });
}

/** Trim messages to fit within a token budget. */
export function runtimeTrimMessagesToContextSync(messages, maxTokens) {
  return safe(() => {
    const out = callStr(exportsRef.runtime_trim_messages_to_context, JSON.stringify({ messages, maxTokens }));
    return out ? JSON.parse(out) : null;
  });
}

/** Resolve tier or model ID to a downloaded model. */
export function runtimeResolveModelSync(tierOrModelId, tiers, downloaded) {
  return safe(() => {
    const out = callStr(exportsRef.runtime_resolve_model, JSON.stringify({ tierOrModelId, tiers, downloaded }));
    return out ? JSON.parse(out) : null;
  });
}

/* ---------- Widget runtime facades ---------- */

/** Filter widget entries from tree. */
export function widgetFilterEntriesSync(tree, folderId) {
  return safe(() => {
    const out = callStr(exportsRef.widget_filter_entries, JSON.stringify({ tree, folderId }));
    return out ? JSON.parse(out) : null;
  });
}

/** Toggle id in enabled set. */
export function widgetToggleEnabledSync(enabled, id, value) {
  return safe(() => {
    const out = callStr(exportsRef.widget_toggle_enabled, JSON.stringify({ enabled, id, value }));
    return out ? JSON.parse(out) : null;
  });
}

/** Find stale running widget ids. */
export function widgetStaleRunningIdsSync(running, valid) {
  return safe(() => {
    const out = callStr(exportsRef.widget_stale_running_ids, JSON.stringify({ running, valid }));
    return out ? JSON.parse(out) : null;
  });
}
