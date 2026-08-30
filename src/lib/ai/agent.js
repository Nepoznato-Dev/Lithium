import { kvGet, kvSet } from '../storage/kvTier';
import { emitEvent } from './apiManager';
import * as core from '../core';

/* ================================================================
 *  Agent modes — Code Studio IDE prompts & tool permissions.
 * ================================================================ */

const _modeCatalog = core.agentModeCatalogSync();

/** Mode display order for the Code Studio selector. */
export const MODE_ORDER = _modeCatalog?.MODE_ORDER || [];
/** Mode definitions keyed by id. */
export const MODES = _modeCatalog?.MODES || {};

/* ================================================================
 *  AI block parsers — extract fenced tool blocks from assistant replies.
 * ================================================================ */

/** ```api blocks → [{ api, params }] (malformed JSON silently skipped). */
export function extractApiCalls(text) {
  return core.agentExtractApiCallsSync(text || '') || [];
}

/** ```widget blocks → [{ name, code }]. Name comes from a `// widget: X` header. */
export function extractWidgetBlocks(text) {
  return core.agentExtractWidgetBlocksSync(text || '') || [];
}

/** Remove api/widget blocks so the surrounding markdown renders cleanly. */
export function stripToolBlocks(text) {
  return core.agentStripToolBlocksSync(text || '') || (text || '');
}

/* ================================================================
 *  Chat history — persistent assistant conversations.
 * ================================================================ */

const CHATS_KEY = 'ai-chats';
const MAX_CHATS = 30;

export function loadChats() {
  return kvGet(CHATS_KEY, []);
}

export function saveChats(list) {
  kvSet(CHATS_KEY, list.slice(0, MAX_CHATS));
}

export function makeChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Upsert a chat (by id) keeping the list most-recent-first. */
export function upsertChat(chat) {
  const result = core.chatsUpsertSync(loadChats(), chat, Date.now());
  if (result?.chats) saveChats(result.chats);
}

export function deleteChat(id) {
  const result = core.chatsDeleteSync(loadChats(), id);
  if (result?.chats) saveChats(result.chats);
}

/* ================================================================
 *  Model memory — persistent key/value store for AI context.
 * ================================================================ */

const MEMORY_KEY = 'ai-memory';
const MEMORY_CAP = 200; // max entries
const VALUE_CAP = 2000; // chars per value

export function loadMemory() {
  return kvGet(MEMORY_KEY, {});
}

function saveMemory(memory) {
  kvSet(MEMORY_KEY, memory);
  emitEvent('memory.changed', { keys: Object.keys(memory) });
  window.dispatchEvent(new Event('lithium:memory-changed'));
}

export function readMemory(key) {
  return loadMemory()[key]?.value ?? null;
}

export function writeMemory(key, value) {
  const cleanKey = String(key || '').trim().slice(0, 64);
  if (!cleanKey) throw new Error('memory key must not be empty');
  const memory = loadMemory();
  const result = core.memoryWriteSync(memory, cleanKey, String(value ?? '').slice(0, VALUE_CAP), Date.now());
  if (!result?.memory) return cleanKey;
  saveMemory(result.memory);
  return result.cleanKey;
}

export function deleteMemory(key) {
  const memory = loadMemory();
  if (!(key in memory)) throw new Error(`no memory entry '${key}'`);
  delete memory[key];
  saveMemory(memory);
}

/** Compact dump injected into the device-control prompt. */
export function memoryDump(maxEntries = 40) {
  return core.memoryDumpSync(loadMemory(), maxEntries) || '(empty)';
}
