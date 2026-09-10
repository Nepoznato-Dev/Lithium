/**
 * AiService — Lithium OS central AI intelligence daemon.
 *
 * Responsibilities:
 *   1. Manage the active model and provider lifecycle
 *   2. Own conversation session state (create, list, load, delete)
 *   3. Provide a context injection framework — any app can attach page
 *      content, file listings, note text, or selection as context for the
 *      next AI call
 *   4. Expose an event bus for cross-app AI communication
 *   5. Route requests to the correct provider (cloud or local inference)
 *
 * The service wraps the existing ai/ infrastructure (providers.js,
 * modelRuntime.js, inferenceWorker.js, apiManager.js) and adds OS-level
 * orchestration on top.
 */

import { storage } from '../storage/localStorage';

// ── Event channel ────────────────────────────────────────────────────────────
const EVENT = 'lithium:ai';

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail, ts: Date.now() } }));
}

export function subscribeAi(handler) {
  const listener = e => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// ── Storage keys ─────────────────────────────────────────────────────────────
const SESSIONS_KEY = 'lithium:ai:sessions';
const ACTIVE_MODEL_KEY = 'lithium:ai:active-model';
const ACTIVE_PROVIDER_KEY = 'lithium:ai:active-provider';
const SYSTEM_PROMPT_KEY = 'lithium:ai:system-prompt';

// ── Session management ───────────────────────────────────────────────────────
function makeId() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSessions() {
  try { return storage.get(SESSIONS_KEY, []); } catch { return []; }
}

function persistSessions(sessions) {
  storage.set(SESSIONS_KEY, sessions);
}

/** Create a new conversation session.  Returns the session object. */
export function createSession({ title = 'New Chat', model, provider, context } = {}) {
  const session = {
    id: makeId(),
    title,
    model: model || getActiveModel(),
    provider: provider || getActiveProvider(),
    messages: [],
    context: context || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const sessions = loadSessions();
  sessions.unshift(session);
  persistSessions(sessions);
  emit('session-created', { session });
  return session;
}

/** List all sessions (newest first). */
export function listSessions() {
  return loadSessions();
}

/** Load a single session by id. */
export function getSession(id) {
  return loadSessions().find(s => s.id === id) || null;
}

/** Append a message to a session. */
export function appendMessage(sessionId, message) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return null;
  sessions[idx].messages.push({
    role: message.role || 'user',
    content: message.content || '',
    ts: Date.now(),
    ...(message.context ? { context: message.context } : {}),
  });
  sessions[idx].updatedAt = Date.now();
  // Auto-title from first user message
  if (sessions[idx].messages.length === 1 && message.role !== 'system') {
    sessions[idx].title = (message.content || 'New Chat').slice(0, 60);
  }
  persistSessions(sessions);
  emit('message-appended', { sessionId, message: sessions[idx].messages.at(-1) });
  return sessions[idx];
}

/** Delete a session. */
export function deleteSession(id) {
  const sessions = loadSessions().filter(s => s.id !== id);
  persistSessions(sessions);
  emit('session-deleted', { id });
}

/** Rename a session. */
export function renameSession(id, title) {
  const sessions = loadSessions();
  const s = sessions.find(s => s.id === id);
  if (s) { s.title = title; s.updatedAt = Date.now(); persistSessions(sessions); emit('session-renamed', { id, title }); }
}

// ── Active model / provider ──────────────────────────────────────────────────
export function getActiveModel() {
  return storage.get(ACTIVE_MODEL_KEY, null);
}

export function setActiveModel(model) {
  storage.set(ACTIVE_MODEL_KEY, model);
  emit('model-changed', { model });
}

export function getActiveProvider() {
  return storage.get(ACTIVE_PROVIDER_KEY, null);
}

export function setActiveProvider(provider) {
  storage.set(ACTIVE_PROVIDER_KEY, provider);
  emit('provider-changed', { provider });
}

// ── System prompt ────────────────────────────────────────────────────────────
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant integrated into Lithium OS, a web-based desktop environment. You can help with tasks like writing, analysis, coding, summarization, and general questions. Be concise and helpful.';

export function getSystemPrompt() {
  return storage.get(SYSTEM_PROMPT_KEY, DEFAULT_SYSTEM_PROMPT);
}

export function setSystemPrompt(prompt) {
  storage.set(SYSTEM_PROMPT_KEY, prompt);
  emit('system-prompt-changed', { prompt });
}

// ── Context injection ────────────────────────────────────────────────────────
/** Build a context payload from various sources.  Apps call this to attach
 *  page content, file listings, note text, or selection text.
 *
 *  @param {Object} sources
 *  @param {string} [sources.pageContent]  — extracted article/page text
 *  @param {string} [sources.pageUrl]      — URL of the current page
 *  @param {string} [sources.pageTitle]    — title of the current page
 *  @param {string} [sources.selection]    — user-selected text
 *  @param {string} [sources.noteContent]  — current note body
 *  @param {string} [sources.noteName]     — current note file name
 *  @param {string} [sources.fileContent]  — file body
 *  @param {string} [sources.fileName]     — file name
 *  @param {Array}  [sources.fileListing]  — array of { name, type } for a folder
 *  @returns {Object} context payload ready to attach to a message
 */
export function buildContext(sources) {
  const parts = [];
  if (sources.pageContent) {
    parts.push(`[Page: ${sources.pageTitle || sources.pageUrl || 'unknown'}]\n${sources.pageContent}`);
  }
  if (sources.selection) {
    parts.push(`[Selected text]\n${sources.selection}`);
  }
  if (sources.noteContent) {
    parts.push(`[Note: ${sources.noteName || 'untitled'}]\n${sources.noteContent}`);
  }
  if (sources.fileContent) {
    parts.push(`[File: ${sources.fileName || 'unknown'}]\n${sources.fileContent}`);
  }
  if (sources.fileListing?.length) {
    const listing = sources.fileListing.map(f => `  ${f.type === 'folder' ? '📁' : '📄'} ${f.name}`).join('\n');
    parts.push(`[Folder contents]\n${listing}`);
  }
  return {
    text: parts.join('\n\n'),
    sources: Object.keys(sources).filter(k => sources[k]),
    ts: Date.now(),
  };
}

// ── Quick chat helper ────────────────────────────────────────────────────────
/** Send a single message and get a response.  Creates a session if needed.
 *  This is the simplest way for an app to talk to the AI.
 *
 *  @param {string} userMessage — the user's prompt
 *  @param {Object} [options]
 *  @param {Object} [options.context] — context from buildContext()
 *  @param {string} [options.sessionId] — existing session to append to
 *  @param {string} [options.model] — override model
 *  @param {string} [options.provider] — override provider
 *  @returns {Promise<{ session: Object, response: string }>}
 */
export async function quickChat(userMessage, options = {}) {
  let sessionId = options.sessionId;
  if (!sessionId) {
    const session = createSession({ context: options.context });
    sessionId = session.id;
  }
  // Append user message
  appendMessage(sessionId, { role: 'user', content: userMessage, context: options.context });

  // Build the full prompt
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...session.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  // Route to the appropriate provider
  let response = '';
  try {
    const { chatCompletion } = await import('../ai/providers');
    const model = options.model || session.model;
    const provider = options.provider || session.provider;
    response = await chatCompletion(messages, { model, provider });
  } catch (err) {
    response = `Error: ${err.message}`;
  }

  // Append assistant response
  appendMessage(sessionId, { role: 'assistant', content: response });

  return { session: getSession(sessionId), response };
}

// ── Boot ─────────────────────────────────────────────────────────────────────
let _initialized = false;

export function initAiService() {
  if (_initialized) return;
  _initialized = true;
  emit('init', {
    activeModel: getActiveModel(),
    activeProvider: getActiveProvider(),
    sessionCount: loadSessions().length,
  });
}

// ── File system persistence (E3) ─────────────────────────────────────────────
/** Export a conversation session to a file in /Documents/AI/.
 *  Creates a JSON file with the conversation messages.
 *  Returns the file entry id or null on failure. */
export async function exportSessionToFile(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  try {
    const { loadTree, saveTree, createEntry, SYS } = await import('../fileSystem');
    const { SYS: SYS_IDS } = await import('../fileSystem/systemDirs');
    const tree = loadTree();
    // Ensure the AI folder exists
    const aiFolder = tree.find(e => e.id === SYS_IDS.AI);
    if (!aiFolder) return null;
    // Build markdown content from the conversation
    const lines = [`# ${session.title}`, '', `> Model: ${session.model || 'default'} | Provider: ${session.provider || 'default'}`, `> Created: ${new Date(session.createdAt).toLocaleString()}`, ''];
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**You**' : msg.role === 'assistant' ? '**AI**' : '**System**';
      lines.push(`${role}: ${msg.content}`, '');
    }
    const content = lines.join('\n');
    // Sanitize filename
    const safeName = session.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50) || 'chat';
    const fileName = `${safeName} — ${new Date(session.createdAt).toISOString().slice(0, 10)}.md`;
    const next = createEntry(tree, { name: fileName, type: 'text', parentId: SYS_IDS.AI, content });
    saveTree(next);
    emit('session-exported', { sessionId, fileName });
    return next[next.length - 1]?.id || null;
  } catch (err) {
    return null;
  }
}

/** Auto-save a session to /Documents/AI/ whenever it gets a new message.
 *  Called by appendMessage when autoSave is enabled. */
export async function autoSaveSession(sessionId) {
  const session = getSession(sessionId);
  if (!session || session.messages.length < 2) return;
  try {
    const { loadTree, saveTree, createEntry } = await import('../fileSystem');
    const { SYS: SYS_IDS } = await import('../fileSystem/systemDirs');
    const tree = loadTree();
    const aiFolder = tree.find(e => e.id === SYS_IDS.AI);
    if (!aiFolder) return;
    // Check if we already have a file for this session
    const existing = tree.find(e => e.parentId === SYS_IDS.AI && e.name?.includes(session.id));
    const lines = [`# ${session.title}`, '', `> Auto-saved | ${new Date(session.updatedAt).toLocaleString()}`, ''];
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**You**' : msg.role === 'assistant' ? '**AI**' : '**System**';
      lines.push(`${role}: ${msg.content}`, '');
    }
    const content = lines.join('\n');
    if (existing) {
      // Update existing file
      const updated = tree.map(e => e.id === existing.id ? { ...e, content, updatedAt: Date.now() } : e);
      saveTree(updated);
    } else {
      const safeName = session.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40) || 'chat';
      const fileName = `${safeName} [${session.id}].md`;
      const next = createEntry(tree, { name: fileName, type: 'text', parentId: SYS_IDS.AI, content });
      saveTree(next);
    }
  } catch {}
}
