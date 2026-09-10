import { kvGet, kvSet } from '../storage/kvTier';
import { storage } from '../storage/localStorage';
import { emitEvent } from './apiManager';

const _MODE_CATALOG = {
  MODE_ORDER: ['agent', 'ask', 'plan', 'review', 'explore', 'chat'],
  MODES: {
    agent: { label: 'Agent', read: true, write: 'execute', prompt: `You are an AGENT — a senior software-engineering assistant that modifies and improves the user's codespace.
Follow the loop: Understand → Inspect → Plan → Implement → Verify → Report.
- FIRST assess scope: call code.list to gauge the repository. If the repo is large or the change would span many files, do NOT implement yet — produce a concise plan (files to touch, order, risks) and recommend switching to Plan mode for the full picture. Only implement directly for small, well-scoped changes.
- Before editing, gather context with read tools; never modify based on assumption.
- Make targeted, minimal changes; match existing style; preserve unrelated code; never invent files or APIs.
- For complex/multi-file changes, briefly list the files you'll touch, the order, and risks BEFORE editing. For simple single-file changes, proceed directly.
- Keep diffs small and readable; write clean code the first time; add comments only where the why is non-obvious.
- After changes, verify and report: what changed, files modified, checks performed, remaining issues, next steps.
- Never delete/overwrite unrelated files; warn before anything risky. Lead with the most important information.` },
    ask: { label: 'Ask', read: true, write: 'none', prompt: 'You are an ASK advisor — a read-only engineering advisor. Understand → inspect → explain → guide.\n- Inspect the code with read tools before answering; never answer from assumption.\n- Cite real file paths, functions, and symbols; include line references where helpful.\n- Answers: accurate, specific, proportional, structured (headings/lists/code refs).\n- You NEVER modify anything. If a fix is needed, describe exactly what would change and suggest switching to Agent mode.' },
    plan: { label: 'Plan', read: true, write: 'plan', prompt: 'You are a PLANNING agent — a software architect. Research with read tools, then design a plan another agent could execute confidently. You do NOT implement.\nProduce a structured plan: Summary · Discovery findings · Implementation steps (ordered phases with dependencies) · Relevant files (path + purpose) · Verification steps · Risks & mitigations · Scope (included/excluded).\nEmit the intended file changes as code.write blocks; they are NOT applied until the user approves. Ground every step in actual codebase findings, not assumptions.' },
    review: { label: 'Review', read: true, write: 'none', prompt: 'You are a REVIEW agent — a read-only code reviewer. Inspect with read tools and critique: correctness, logic bugs, security issues, style, performance, and maintainability.\nPrioritize high-signal issues over nitpicks. Cite file paths and line numbers. For each issue: what\'s wrong, why it matters, and a suggested fix. Do NOT modify any files.' },
    explore: { label: 'Explore', read: true, write: 'none', prompt: 'You are an EXPLORE agent — a read-only investigator. Use read/list tools to map the codebase: locate relevant files, trace execution flows, and summarize architecture and patterns.\nReport findings with concrete file paths and symbol names. Be thorough but concise. Do NOT modify anything.' },
    chat: { label: 'Chat', read: false, write: 'none', prompt: 'You are a CHAT companion — conversational only, with NO tool access. Be friendly, engaging, thoughtful, and concise; match the user\'s tone.\nIf asked to read, analyze, or modify code, politely explain you can\'t in Chat mode and suggest Ask (questions), Explore (investigation), or Agent (implementation).' },
  },
};

/* ================================================================
 *  Agent modes — Code Studio IDE prompts & tool permissions.
 * ================================================================ */

const _modeCatalog = _MODE_CATALOG;

/** Mode display order for the Code Studio selector. */
export const MODE_ORDER = _modeCatalog?.MODE_ORDER || [];
/** Mode definitions keyed by id. */
export const MODES = _modeCatalog?.MODES || {};

/* ── Cortex mode persistence ── */
const CORTEX_MODES = ['agent', 'ask', 'plan', 'review', 'chat'];
/** Cortex-specific mode order (subset of Code Studio modes). */
export const CORTEX_MODE_ORDER = CORTEX_MODES;

/** Get the persisted Cortex mode, defaulting to 'agent'. */
export function getCortexMode() {
  return storage.get('ai-cortex-mode', 'agent');
}

/** Persist the selected Cortex mode. */
export function setCortexMode(mode) {
  storage.set('ai-cortex-mode', mode);
}

/* ================================================================
 *  AI block parsers — extract fenced tool blocks from assistant replies.
 * ================================================================ */

/** ```api blocks → [{ api, params }] (malformed JSON silently skipped). */
export function extractApiCalls(text) {
  if (!text) return [];
  const calls = [];
  const re = /```api\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.api) calls.push({ api: item.api, params: item.params || {} });
        }
      } else if (parsed && parsed.api) {
        calls.push({ api: parsed.api, params: parsed.params || {} });
      }
    } catch {}
  }
  return calls;
}

/** ```widget blocks → [{ name, code }]. Name comes from a `// widget: X` header. */
export function extractWidgetBlocks(text) {
  if (!text) return [];
  const blocks = [];
  const re = /```widget\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const code = m[1].trim();
    const nameMatch = code.match(/\/\/\s*widget:\s*(.+)/i);
    let name = `AI Widget ${blocks.length + 1}`;
    if (nameMatch) { name = nameMatch[1].trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 48) || name; }
    blocks.push({ name, code });
  }
  return blocks;
}

/** Remove api/widget blocks so the surrounding markdown renders cleanly. */
export function stripToolBlocks(text) {
  if (!text) return '';
  return text.replace(/```(?:api|widget)\s*[\s\S]*?```/g, '').trim();
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
  const chats = loadChats();
  if (!Array.isArray(chats) || !chat || !chat.id) return;
  const filtered = chats.filter(c => c.id !== chat.id);
  const updated = { ...chat, updatedAt: Date.now() };
  saveChats([updated, ...filtered].slice(0, MAX_CHATS));
}

export function deleteChat(id) {
  const chats = loadChats();
  if (!Array.isArray(chats) || !id) return;
  if (!chats.some(c => c.id === id)) return;
  saveChats(chats.filter(c => c.id !== id));
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
  const cleanValue = String(value ?? '').slice(0, VALUE_CAP);
  const updated = { ...(memory || {}) };
  delete updated[cleanKey];
  updated[cleanKey] = { value: cleanValue, updatedAt: Date.now() };
  const entries = Object.entries(updated);
  if (entries.length > MEMORY_CAP) {
    entries.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
    const toRemove = entries.length - MEMORY_CAP;
    for (let i = 0; i < toRemove; i++) delete updated[entries[i][0]];
  }
  saveMemory(updated);
  return cleanKey;
}

export function deleteMemory(key) {
  const memory = loadMemory();
  if (!(key in memory)) throw new Error(`no memory entry '${key}'`);
  delete memory[key];
  saveMemory(memory);
}

/** Compact dump injected into the device-control prompt. */
export function memoryDump(maxEntries = 40) {
  const memory = loadMemory();
  if (!memory || typeof memory !== 'object') return '(empty)';
  const entries = Object.entries(memory);
  if (entries.length === 0) return '(empty)';
  entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  return entries.slice(0, maxEntries).map(([k, v]) => `- ${k}: ${v.value || ''}`).join('\n');
}

/* ================================================================
 *  Knowledge notebooks — notebook-style knowledge organization.
 * ================================================================ */

const NOTEBOOKS_KEY = 'ai-notebooks';

export function loadNotebooks() {
  return kvGet(NOTEBOOKS_KEY, []);
}

export function saveNotebooks(notebooks) {
  kvSet(NOTEBOOKS_KEY, notebooks);
}

export function makeNotebookId() {
  return `nb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addNotebook(name) {
  const notebooks = loadNotebooks();
  const nb = { id: makeNotebookId(), name: name.trim(), entries: [], createdAt: Date.now() };
  saveNotebooks([...notebooks, nb]);
  return nb;
}

export function deleteNotebook(id) {
  saveNotebooks(loadNotebooks().filter(nb => nb.id !== id));
}

export function addNotebookEntry(notebookId, entry) {
  const notebooks = loadNotebooks();
  const nb = notebooks.find(n => n.id === notebookId);
  if (!nb) return;
  nb.entries = nb.entries || [];
  nb.entries.push({ id: `e-${Date.now()}`, title: entry.title || 'Untitled', content: entry.content || '', tags: entry.tags || [], createdAt: Date.now() });
  saveNotebooks(notebooks);
}

export function updateNotebookEntry(notebookId, entryId, updates) {
  const notebooks = loadNotebooks();
  const nb = notebooks.find(n => n.id === notebookId);
  if (!nb) return;
  const entry = (nb.entries || []).find(e => e.id === entryId);
  if (!entry) return;
  Object.assign(entry, updates, { updatedAt: Date.now() });
  saveNotebooks(notebooks);
}

export function deleteNotebookEntry(notebookId, entryId) {
  const notebooks = loadNotebooks();
  const nb = notebooks.find(n => n.id === notebookId);
  if (!nb) return;
  nb.entries = (nb.entries || []).filter(e => e.id !== entryId);
  saveNotebooks(notebooks);
}
