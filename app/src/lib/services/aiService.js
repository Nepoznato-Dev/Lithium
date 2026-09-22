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
/** Shared with lib/ai/providers.js so the desktop, Cortex and every BYO-key
 *  surface agree on one "active provider" instead of two competing ones. */
const ACTIVE_MODEL_KEY = 'ai-active-model';
const ACTIVE_PROVIDER_KEY = 'ai-provider';
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

/** Create a new conversation session.  Returns the session object.
 *  Accepts an options object or a bare title string, since most callers just
 *  want to name the chat they are about to fill. */
export function createSession(options = {}) {
  const { title = 'New Chat', model, provider, context } =
    typeof options === 'string' ? { title: options } : options;
  const session = {
    id: makeId(),
    title,
    model: model || getActiveModel() || undefined,
    provider: provider || getActiveProvider() || undefined,
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
    // What a Lite reply cost, so the transcript can say so after a reload.
    ...(message.usage ? { usage: message.usage } : {}),
    // Thinking mode used for this reply, shown in the transcript.
    ...(message.thinkingMode ? { thinkingMode: message.thinkingMode } : {}),
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

/** Replace a session's messages wholesale — the auto-compactor's only move.
 *  The summaries it writes are ordinary stored messages from then on. */
function replaceMessages(sessionId, messages) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return null;
  sessions[idx].messages = messages;
  sessions[idx].updatedAt = Date.now();
  persistSessions(sessions);
  emit('session-compacted', { sessionId, count: messages.length });
  return sessions[idx];
}

/** What a stored message looks like on the wire: its own text, plus the context
 *  that rode on its turn, plus a label when it is a compaction summary — the
 *  model is told what it is reading, the transcript already shows the human. */
function wireText(msg) {
  const head = msg.role === 'system' && msg.compacted
    ? `Summary of the ${msg.compacted.replaced} messages that came before:\n${msg.content}`
    : String(msg.content || '');
  // An attachment-only turn has no text of its own, hence the trim.
  return (msg.context?.text ? `${head}\n\n${msg.context.text}` : head).trim();
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
/** Send one message in a session and return the assistant reply.
 *  The heart of the service: every app that wants the AI calls this (or
 *  quickChat) so conversations all land in one place Cortex can show.
 *
 *  @param {string} sessionId — from createSession()
 *  @param {string} text — the user's prompt
 *  @param {Object} [options]
 *  @param {Object} [options.context] — buildContext() payload for THIS turn
 *  @param {Array} [options.attachments] — readFiles() records to fold into THIS turn
 *  @param {Function} [options.onToken] — streams deltas when given
 *  @param {Function} [options.onUsage] — Lite tier: called with the credit and
 *    token receipt for this reply, which is also stored on the assistant message
 *  @param {AbortSignal} [options.signal] — cancels the upstream request
 *  @param {string} [options.provider] / [options.model] — one-off overrides
 *  @param {string} [options.system] — replaces the stored system prompt for this turn
 *  @returns {Promise<string>} the full assistant text
 */
export async function sendMessage(sessionId, text, { context, attachments, onToken, onUsage, onReasoning, signal, provider, model, system, thinkingMode } = {}) {
  const providerId = provider || getSession(sessionId)?.provider || getActiveProvider();
  const modelId = model || getSession(sessionId)?.model || getActiveModel();

  // Dynamic import keeps the provider/model stack out of the desktop bundle —
  // this service is loaded by the shell for its session list alone.
  const { chatCompletion, streamChatCompletion, DEFAULT_PROVIDER, modelSupportsVision, acceptsImageParts } =
    await import('../ai/providers');

  // Resolve the thinking budget from the mode id. Lite gets a capped budget.
  let thinkingBudget = 0;
  if (thinkingMode && providerId !== 'local') {
    const { liteBudget, thinkingBudget: resolveBudget } = await import('../ai/thinkingModes');
    thinkingBudget = providerId === DEFAULT_PROVIDER ? liteBudget(thinkingMode) : resolveBudget(thinkingMode);
  }

  // Attached files belong to the turn that carried them, like page context does:
  // text becomes a block appended to the message, an image becomes a caption —
  // or a genuine content part, when the model can see and the provider is
  // OpenAI-shaped enough to carry one.
  let turn = context || null;
  let imageBlock = null;
  if (attachments?.length) {
    const { serializeAttachments, imageParts } = await import('../ai/attachments');
    const vision = modelSupportsVision(modelId) && acceptsImageParts(providerId);
    turn = {
      text: [context?.text, serializeAttachments(attachments, { vision })].filter(Boolean).join('\n\n'),
      sources: [...(context?.sources || []), ...attachments.map(att => att.name)],
      ts: context?.ts || Date.now(),
    };
    // The pixels live in this request only. Storing a base64 image on the
    // message would put it in localStorage and in every later turn's history.
    if (vision) imageBlock = imageParts(attachments);
  }

  // Price the turn that is about to go out, and fold the old end of the thread
  // away before it rather than after. A provider that will not summarize must
  // not swallow the message, so this failure only means the turn goes over budget.
  const systemPrompt = system || getSystemPrompt();
  const history = getSession(sessionId)?.messages || [];
  const { estimateContextTokens } = await import('../ai/contextEstimate');
  if (estimateContextTokens([...history, { role: 'user', content: text, context: turn }], systemPrompt, modelId).shouldCompact) {
    const { compactMessages } = await import('../ai/compactor');
    const compacted = await compactMessages(history, {
      provider: providerId, model: modelId, signal,
    }).catch(() => null);
    if (compacted) replaceMessages(sessionId, compacted.messages);
  }

  if (!appendMessage(sessionId, { role: 'user', content: text, context: turn })) {
    throw new Error(`no AI session '${sessionId}'`);
  }
  const session = getSession(sessionId);

  // Page/file/selection context belongs to the turn that carried it, so it is
  // composed in here rather than written into the stored message.
  const messages = [
    { role: 'system', content: systemPrompt },
    ...session.messages.map(msg => ({ role: msg.role, content: wireText(msg) })),
  ];

  if (imageBlock?.length) {
    const current = messages[messages.length - 1];
    const words = String(current.content).trim();
    current.content = [
      ...(words ? [{ type: 'text', text: words }] : []),
      ...imageBlock,
    ];
  }

  // Keep the receipt as well as forwarding it: it belongs to the message it
  // describes, and a reply is priced by the tokens it used.
  let usage = null;
  const reportUsage = receipt => { usage = receipt; onUsage?.(receipt); };

  let reply;
  // The tool-calling loop replaces a single streamChatCompletion for the
  // lithium provider: it streams text normally but intercepts model tool_calls,
  // runs them via apiManager, and re-sends the conversation until the model
  // stops calling tools. Falls through to the normal path for other providers
  // or when no skills are offered.
  if (onToken && providerId === DEFAULT_PROVIDER) {
    const { buildSkillRegistry } = await import('../ai/skillRegistry');
    const { isOffered } = await import('../ai/skillPermissions');
    const registry = buildSkillRegistry();
    const hasSkills = [...registry.values()].some(s => isOffered(s.id, s.permission));
    if (hasSkills) {
      const { runToolLoop } = await import('../ai/toolLoop');
      reply = await runToolLoop({
        messages,
        model: modelId,
        signal,
        onToken,
        onReasoning,
        onUsage: reportUsage,
        thinkingBudget,
      });
    } else {
      reply = await streamChatCompletion(providerId, messages, { model: modelId, signal, onToken, onUsage: reportUsage, onReasoning, thinkingBudget });
    }
  } else if (onToken) {
    reply = await streamChatCompletion(providerId, messages, { model: modelId, signal, onToken, onUsage: reportUsage, onReasoning, thinkingBudget });
  } else {
    reply = await chatCompletion(providerId, messages, { model: modelId, signal, onUsage: reportUsage, thinkingBudget });
  }

  appendMessage(sessionId, { role: 'assistant', content: reply || '', usage, thinkingMode });
  emit('message-replied', { sessionId, usage });
  return reply || '';
}

/**
 * Send a single message and get a response.  Creates a session if needed.
 * This is the simplest way for an app to talk to the AI.
 *
 *  @param {string} userMessage — the user's prompt
 *  @param {Object} [options] — see sendMessage(), plus [options.sessionId]
 *  @returns {Promise<{ session: Object, response: string }>}
 */
export async function quickChat(userMessage, options = {}) {
  const sessionId = options.sessionId
    || createSession({ context: options.context, model: options.model, provider: options.provider }).id;
  const response = await sendMessage(sessionId, userMessage, options);
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
    const { loadTree, saveTree, createEntry } = await import('../fileSystem');
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
  } catch {
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
  } catch { /* autosave is best-effort — a missing AI folder must not break chat */ }
}
