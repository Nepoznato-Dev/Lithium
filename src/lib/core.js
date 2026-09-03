/**
 * JS facade over the Rust lithium-core wasm module.
 *
 * Sync facades are generated from a data-driven dispatch table.
 * Each entry maps a public name → [wasmExport, returnType].
 * The generic `_call` function handles encode → invoke → decode.
 *
 * Helpers (coreReady, hasWasm, wasmStatus, safe, toWasm, fromOut, callStr, mem)
 * live in coreHelpers.js — this file re-exports them for backward compat.
 */

export { coreReady, hasWasm, wasmStatus, mem, safe, toWasm, fromOut, callStr, getE } from './coreHelpers';
import { coreReady, safe, toWasm, fromOut, mem, getE } from './coreHelpers';

/* ================================================================
   Dispatch table  —  [wasmExport, returnType]
   returnType:
     'json'   → callStr(fn, JSON.stringify(input)) → JSON.parse   (default)
     'str'    → callStr(fn, JSON.stringify(input)) → raw string
     'bytes'  → toWasm(input) → fn(ptr, len) → fromOut → Uint8Array
     'int'    → toWasm(input) → fn(ptr, len) → raw integer
   Input is byte-encoded (TextEncoder) when the key contains 'Bytes',
   otherwise JSON-serialized.
   ================================================================ */

const _D = {
  // Markdown + fs
  mdRenderSync:              ['md_render',           'str'],
  mdRenderEnhancedSync:      ['md_render_enhanced',  'str'],
  mdWikiLinksSync:           ['md_wiki_links',       'json'],
  fsOpSync:                  ['fs_op',               'json'],
  explorerOpSync:            ['explorer_op',         'json'],
  // API catalog / validate / audit
  apiCatalogSync:            ['api_catalog',         'json'],
  apiValidateSync:           ['api_validate',        'json'],
  apiAuditAppendSync:        ['api_audit_append',    'json'],
  // Notification history
  notifyFilterSync:          ['notify_filter',       'json'],
  notifyMarkAllReadSync:     ['notify_mark_all_read','json'],
  notifyMarkReadSync:        ['notify_mark_read',    'json'],
  notifyDismissSync:         ['notify_dismiss',      'json'],
  notifyUnreadCountSync:     ['notify_unread_count', 'int'],
  // Settings
  settingsDefaultsSync:      ['settings_defaults',       'json'],
  settingsMergeSync:         ['settings_merge',          'json'],
  settingsSetAtPathSync:     ['settings_set_at_path',    'json'],
  // Window snap
  snapDetectZoneSync:        ['snap_detect_zone',    'json'],
  snapBoundsSync:            ['snap_bounds',         'json'],
  snapPreviewStyleSync:      ['snap_preview_style',  'json'],
  // Lock
  lockVerifySync:            ['lock_verify',          'json'],
  lockRecordFailureSync:     ['lock_record_failure',  'json'],
  // Memory
  memoryWriteSync:           ['memory_write',         'json'],
  memoryDumpSync:            ['memory_dump',          'json'],
  // Agent
  agentModeCatalogSync:      ['agent_mode_catalog',       'json'],
  agentExtractApiCallsSync:  ['agent_extract_api_calls',  'json'],
  agentExtractWidgetBlocksSync: ['agent_extract_widget_blocks', 'json'],
  agentStripToolBlocksSync:  ['agent_strip_tool_blocks',  'json'],
  // Chat
  chatsUpsertSync:           ['chats_upsert',  'json'],
  chatsDeleteSync:           ['chats_delete',  'json'],
  chatsTrimSync:             ['chats_trim',    'json'],
  // Storage calculation
  storageFormatBytesSync:    ['storage_format_bytes',  'json'],
  storageGuessDiskSync:      ['storage_guess_disk',    'json'],
  storageSummarySync:        ['storage_summary',       'json'],
  // Weather
  weatherDescriptionSync:    ['weather_description',   'json'],
  weatherEmojiSync:          ['weather_emoji',         'json'],
  weatherReportSync:         ['weather_report',        'json'],
  weatherSummaryLineSync:    ['weather_summary_line',  'json'],
  // KV tier
  kvShouldOverflowSync:      ['kv_should_overflow',      'json'],
  kvOverflowBytesSync:       ['kv_overflow_bytes',       'json'],
  kvMigrationCandidatesSync: ['kv_migration_candidates', 'json'],
  // Download sync
  dlSlugSync:                ['dl_slug',      'json'],
  dlProgressSync:            ['dl_progress',  'json'],
  dlStateSync:               ['dl_state',     'json'],
  // Model
  modelSlugifySync:          ['model_slugify',        'json'],
  modelParseHfUrlSync:       ['model_parse_hf_url',   'json'],
  modelHfResolveUrlSync:     ['model_hf_resolve_url', 'json'],
  modelSearchSync:           ['model_search',         'json'],
  modelDownloadSlugSync:     ['model_download_slug',  'json'],
  // Soloist
  soloistEntityInfoSync:     ['soloist_entity_info', 'json'],
  soloistPositionSync:       ['soloist_position',    'json'],
  // Inference runtime
  runtimePrepareMessagesSync:      ['runtime_prepare_messages',       'json'],
  runtimeEstimateTokensSync:       ['runtime_estimate_tokens',        'json'],
  runtimeEstimateMessagesTokensSync: ['runtime_estimate_messages_tokens', 'json'],
  runtimeTrimMessagesToContextSync:  ['runtime_trim_messages_to_context', 'json'],
  runtimeResolveModelSync:           ['runtime_resolve_model',          'json'],
  // Widget runtime
  widgetFilterEntriesSync:   ['widget_filter_entries',   'json'],
  widgetToggleEnabledSync:   ['widget_toggle_enabled',   'json'],
  widgetStaleRunningIdsSync: ['widget_stale_running_ids','json'],
  // Browser
  browserResolveInputSync:     ['browser_resolve_input',     'json'],
  browserHostnameSync:         ['browser_hostname',          'json'],
  browserToProxyUrlSync:       ['browser_to_proxy_url',      'json'],
  browserStatsIncrementSync:   ['browser_stats_increment',   'json'],
  browserStatsDailyResetSync:  ['browser_stats_daily_reset', 'json'],
  browserFormatStatNumberSync: ['browser_format_stat_number','json'],
  browserFormatTimeSavedSync:  ['browser_format_time_saved', 'json'],
  browserBookmarkTreeSync:     ['browser_bookmark_tree',     'json'],
  browserBookmarkSearchSync:   ['browser_bookmark_search',   'json'],
  browserHistoryGroupSync:     ['browser_history_group',     'json'],
  browserHistorySearchSync:    ['browser_history_search',    'json'],
  browserOmniboxRankSync:      ['browser_omnibox_rank',      'json'],
  browserSanitizeHtmlSync:     ['browser_sanitize_html',     'str'],
  browserSlugSync:             ['browser_slug',              'json'],
};

/* ---------- generic dispatcher ---------- */

function _call(name, input) {
  const e = getE();
  if (!e) return null;
  const entry = _D[name];
  if (!entry) return null;
  const [wasmFn, ret] = entry;
  const fn = e[wasmFn];
  if (!fn) return null;

  // Encode input
  let ptr, len;
  if (name.includes('Bytes')) {
    ptr = toWasm(input);
    len = input.length;
  } else {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    ptr = toWasm(bytes);
    len = bytes.length;
  }

  const out = fn(ptr, len);

  // Decode output by return type
  switch (ret) {
    case 'bytes': {
      return out ? fromOut(out) : null;
    }
    case 'int': {
      return out;
    }
    case 'str': {
      return out ? new TextDecoder().decode(fromOut(out)) : null;
    }
    default: { // json
      if (!out) return null;
      const text = new TextDecoder().decode(fromOut(out));
      try { return JSON.parse(text); } catch { return null; }
    }
  }
}

/* ================================================================
   Async facades (need await coreReady()) — unique, not table-driven
   ================================================================ */

/** LZ4-compress (size-prepended container). Returns Uint8Array or null (no wasm). */
export async function wasmComPress(u8) {
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

/* ================================================================
   Sync facades — auto-generated from the dispatch table.
   Each is a thin wrapper: pack args → _call(name, input) → return.
   ================================================================ */

/* ---------- Markdown + fs ---------- */

export function mdRenderSync(source) { return safe(() => _call('mdRenderSync', source || '')); }
export function mdRenderEnhancedSync(source) { return safe(() => _call('mdRenderEnhancedSync', source || '')); }
export function mdWikiLinksSync(source) { return safe(() => _call('mdWikiLinksSync', source || '')); }
export function fsOpSync(request) { return safe(() => _call('fsOpSync', request)); }
export function explorerOpSync(request) { return safe(() => _call('explorerOpSync', request)); }

/* ---------- API catalog / validate / audit ---------- */

export function apiCatalogSync() { return safe(() => _call('apiCatalogSync', {})); }
export function apiValidateSync(request) { return safe(() => _call('apiValidateSync', request)); }
export function apiAuditAppendSync(log, api, caller, ok, error, now, cap) {
  return safe(() => _call('apiAuditAppendSync', { log, api, caller, ok, error: error || '', now, cap }));
}

/* ---------- Notification history ---------- */

export function notifyFilterSync(jsonString, cutoffMs) { return safe(() => _call('notifyFilterSync', { jsonString, cutoffMs })); }
export function notifyMarkAllReadSync(jsonString) { return safe(() => _call('notifyMarkAllReadSync', { jsonString })); }
export function notifyMarkReadSync(jsonString, id) { return safe(() => _call('notifyMarkReadSync', { jsonString, id })); }
export function notifyDismissSync(jsonString, id) { return safe(() => _call('notifyDismissSync', { jsonString, id })); }
export function notifyUnreadCountSync(jsonString) { return safe(() => _call('notifyUnreadCountSync', { jsonString })); }

/* ---------- Settings ---------- */

export function settingsDefaultsSync() { return safe(() => _call('settingsDefaultsSync', {})); }
export function settingsMergeSync(stored) { return safe(() => _call('settingsMergeSync', { stored })); }
export function settingsSetAtPathSync(settings, path, value) { return safe(() => _call('settingsSetAtPathSync', { settings, path, value })); }

/* ---------- Window snap ---------- */

export function snapDetectZoneSync(x, y, screenWidth) { return safe(() => _call('snapDetectZoneSync', { x, y, screenWidth })); }
export function snapBoundsSync(side, taskbarPosition, screenWidth, screenHeight) { return safe(() => _call('snapBoundsSync', { side, taskbarPosition, screenWidth, screenHeight })); }
export function snapPreviewStyleSync(side, taskbarPosition, screenWidth, screenHeight) { return safe(() => _call('snapPreviewStyleSync', { side, taskbarPosition, screenWidth, screenHeight })); }

/* ---------- Lock ---------- */

export function lockVerifySync(pin, failCount, lockedUntil, now) { return safe(() => _call('lockVerifySync', { pin, failCount, lockedUntil, now })); }
export function lockRecordFailureSync(failCount, now) { return safe(() => _call('lockRecordFailureSync', { failCount, now })); }

/* ---------- Memory ---------- */

export function memoryWriteSync(memory, key, value, now) { return safe(() => _call('memoryWriteSync', { memory, key, value, now })); }
export function memoryDumpSync(memory, maxEntries = 40) { return safe(() => _call('memoryDumpSync', { memory, maxEntries })); }

/* ---------- Agent ---------- */

export function agentModeCatalogSync() { return safe(() => _call('agentModeCatalogSync', {})); }
export function agentExtractApiCallsSync(text) { return safe(() => _call('agentExtractApiCallsSync', { text })); }
export function agentExtractWidgetBlocksSync(text) { return safe(() => _call('agentExtractWidgetBlocksSync', { text })); }
export function agentStripToolBlocksSync(text) { return safe(() => _call('agentStripToolBlocksSync', { text })); }

/* ---------- Chat ---------- */

export function chatsUpsertSync(chats, chat, now) { return safe(() => _call('chatsUpsertSync', { chats, chat, now })); }
export function chatsDeleteSync(chats, id) { return safe(() => _call('chatsDeleteSync', { chats, id })); }
export function chatsTrimSync(chats) { return safe(() => _call('chatsTrimSync', { chats })); }

/* ---------- Storage calculation ---------- */

export function storageFormatBytesSync(bytes) { return safe(() => _call('storageFormatBytesSync', { bytes })); }
export function storageGuessDiskSync(quota) { return safe(() => _call('storageGuessDiskSync', { quota })); }
export function storageSummarySync(snapshot) { return safe(() => _call('storageSummarySync', snapshot)); }

/* ---------- Weather ---------- */

export function weatherDescriptionSync(code) { return safe(() => _call('weatherDescriptionSync', { code })); }
export function weatherEmojiSync(code, isDay) { return safe(() => _call('weatherEmojiSync', { code, isDay })); }
export function weatherReportSync(data) { return safe(() => _call('weatherReportSync', data)); }
export function weatherSummaryLineSync(params) { return safe(() => _call('weatherSummaryLineSync', params)); }

/* ---------- KV tier ---------- */

export function kvShouldOverflowSync(jsonLength) { return safe(() => _call('kvShouldOverflowSync', { jsonLength })); }
export function kvOverflowBytesSync(entries) { return safe(() => _call('kvOverflowBytesSync', { entries })); }
export function kvMigrationCandidatesSync(entries) { return safe(() => _call('kvMigrationCandidatesSync', { entries })); }

/* ---------- Download sync ---------- */

export function dlSlugSync(name) { return safe(() => _call('dlSlugSync', { name })); }
export function dlProgressSync(received, total) { return safe(() => _call('dlProgressSync', { received, total })); }
export function dlStateSync(received, total, error) { return safe(() => _call('dlStateSync', { received, total, error })); }

/* ---------- Model ---------- */

export function modelSlugifySync(text) { return safe(() => _call('modelSlugifySync', { text })); }
export function modelParseHfUrlSync(url) { return safe(() => _call('modelParseHfUrlSync', { url })); }
export function modelHfResolveUrlSync(repoId, file) { return safe(() => _call('modelHfResolveUrlSync', { repoId, file })); }
export function modelSearchSync(models, query, tier) { return safe(() => _call('modelSearchSync', { models, query: query || '', tier: tier || '' })); }
export function modelDownloadSlugSync(name) { return safe(() => _call('modelDownloadSlugSync', { name })); }

/* ---------- Soloist ---------- */

export function soloistEntityInfoSync(item) { return safe(() => _call('soloistEntityInfoSync', { item })); }
export function soloistPositionSync(anchor, status) { return safe(() => { const o = _call('soloistPositionSync', { anchor, status, now: Date.now() }); return o ? parseFloat(o) : null; }); }

/* ---------- Inference runtime ---------- */

export function runtimePrepareMessagesSync(messages, modelId, noThink, thinking) { return safe(() => _call('runtimePrepareMessagesSync', { messages, modelId, noThink, thinking })); }
export function runtimeEstimateTokensSync(text) { return safe(() => _call('runtimeEstimateTokensSync', { text })); }
export function runtimeEstimateMessagesTokensSync(messages) { return safe(() => _call('runtimeEstimateMessagesTokensSync', { messages })); }
export function runtimeTrimMessagesToContextSync(messages, maxTokens) { return safe(() => _call('runtimeTrimMessagesToContextSync', { messages, maxTokens })); }
export function runtimeResolveModelSync(tierOrModelId, tiers, downloaded) { return safe(() => _call('runtimeResolveModelSync', { tierOrModelId, tiers, downloaded })); }

/* ---------- Widget runtime ---------- */

export function widgetFilterEntriesSync(tree, folderId) { return safe(() => _call('widgetFilterEntriesSync', { tree, folderId })); }
export function widgetToggleEnabledSync(enabled, id, value) { return safe(() => _call('widgetToggleEnabledSync', { enabled, id, value })); }
export function widgetStaleRunningIdsSync(running, valid) { return safe(() => _call('widgetStaleRunningIdsSync', { running, valid })); }

/* ---------- Browser ---------- */

export function browserResolveInputSync(input, searchUrl) { return safe(() => _call('browserResolveInputSync', { input, searchUrl })); }
export function browserHostnameSync(url) { return safe(() => _call('browserHostnameSync', { url })); }
export function browserToProxyUrlSync(url, proxyOrigin, backendUrl) { return safe(() => _call('browserToProxyUrlSync', { url, proxyOrigin, backendUrl })); }
export function browserStatsIncrementSync(stats, ads, trackers, https, scripts, data) {
  return safe(() => _call('browserStatsIncrementSync', { stats: JSON.stringify(stats), ads: ads || 0, trackers: trackers || 0, https: https || 0, scripts: scripts || 0, data: data || 0 }));
}
export function browserStatsDailyResetSync(stats, now) { return safe(() => _call('browserStatsDailyResetSync', { stats: JSON.stringify(stats), now })); }
export function browserFormatStatNumberSync(n) { return safe(() => _call('browserFormatStatNumberSync', { n })); }
export function browserFormatTimeSavedSync(seconds) { return safe(() => _call('browserFormatTimeSavedSync', { seconds })); }
export function browserBookmarkTreeSync(bookmarks) { return safe(() => _call('browserBookmarkTreeSync', { bookmarks })); }
export function browserBookmarkSearchSync(bookmarks, query) { return safe(() => _call('browserBookmarkSearchSync', { bookmarks, query: query || '' })); }
export function browserHistoryGroupSync(entries, now) { return safe(() => _call('browserHistoryGroupSync', { entries, now })); }
export function browserHistorySearchSync(entries, query) { return safe(() => _call('browserHistorySearchSync', { entries, query: query || '' })); }
export function browserOmniboxRankSync(query, history, bookmarks, topSites) {
  return safe(() => _call('browserOmniboxRankSync', { query: query || '', history: history || [], bookmarks: bookmarks || [], topSites: topSites || [] }));
}
export function browserSanitizeHtmlSync(html) { return safe(() => _call('browserSanitizeHtmlSync', { html })) || null; }
export function browserSlugSync(text) { return safe(() => _call('browserSlugSync', { text })); }

/* ---------- TAR archive (byte-level, special handling) ---------- */

/** Build TAR stream from entries. Returns Uint8Array or null (no wasm). */
export function tarBuildSync(entries) {
  return safe(() => {
    const jsonEntries = entries.map(e => {
      let bin = '';
      for (let i = 0; i < e.data.length; i += 32768) {
        bin += String.fromCharCode.apply(null, e.data.subarray(i, Math.min(i + 32768, e.data.length)));
      }
      return { name: e.name, data_b64: btoa(bin) };
    });
    const json = JSON.stringify({ entries: jsonEntries });
    const bytes = new TextEncoder().encode(json);
    const len = getE().tar_build(toWasm(bytes), bytes.length);
    return len ? fromOut(len) : null;
  });
}

/** Parse TAR stream into file entries. Returns {files, count} or null. */
export function tarParseSync(tarBytes) {
  return safe(() => {
    const len = getE().tar_parse(toWasm(tarBytes), tarBytes.length);
    if (!len) return null;
    return JSON.parse(new TextDecoder().decode(fromOut(len)));
  });
}
