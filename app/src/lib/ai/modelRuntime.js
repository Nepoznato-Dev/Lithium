import { getModel, getModelBlob, loadModelMeta } from './models';
import { storage } from '../storage/localStorage';

function _estimateTokens(text) { return text ? Math.ceil(text.length / 4) : 0; }

function _prepareMessages(messages, modelId, noThink, thinking) {
  if (!Array.isArray(messages)) return [];
  const isQwen3 = (modelId || '').startsWith('qwen3');
  const inject = noThink && isQwen3 && !thinking;
  let lastUserIdx = -1;
  if (inject) {
    for (let j = messages.length - 1; j >= 0; j--) {
      if (messages[j]?.role === 'user') { lastUserIdx = j; break; }
    }
  }
  return messages.map((msg, i) => {
    const content = msg.content || '';
    if (inject && i === lastUserIdx) return { role: msg.role, content: content + '\n/no_think' };
    return { role: msg.role, content };
  });
}

function _trimMessages(messages, maxTokens = 8192) {
  if (!Array.isArray(messages) || messages.length === 0) return { messages: [] };
  const msgTokens = messages.map((m, i) => ({ i, tokens: _estimateTokens(m.content) + 4 }));
  const systemIdx = msgTokens.find(mt => messages[mt.i]?.role === 'system')?.i;
  const systemTokens = systemIdx != null ? msgTokens[systemIdx].tokens : 0;
  const budget = Math.max(0, maxTokens - systemTokens);
  const selected = [];
  let used = 0;
  for (let j = msgTokens.length - 1; j >= 0; j--) {
    if (msgTokens[j].i === systemIdx) continue;
    if (used + msgTokens[j].tokens <= budget) { selected.push(msgTokens[j].i); used += msgTokens[j].tokens; }
    else break;
  }
  selected.sort((a, b) => a - b);
  const result = [];
  if (systemIdx != null) result.push(messages[systemIdx]);
  for (const idx of selected) result.push(messages[idx]);
  return { messages: result };
}

function _estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return { tokens: 0 };
  let total = 0;
  for (const msg of messages) {
    if (msg.content) total += _estimateTokens(msg.content);
    total += 4;
  }
  return { tokens: total };
}

// wllama WASM loaded from CDN (not bundled)
const WLLAMA_WASM_URL = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.2.2/esm/wasm/wllama.wasm';

/**
 * On-device inference via wllama (llama.cpp compiled to wasm, WebGPU
 * auto-offload when available). The heavy WASM runtime and all inference
 * work runs in a dedicated Web Worker so the main thread stays responsive.
 *
 * Models are the Q4_K_M GGUFs already stored in IndexedDB by the Models
 * tab — the blob is read on the main thread (where IndexedDB/OPFS access
 * is straightforward) and transferred to the worker as an ArrayBuffer.
 */

/* ---------- Worker lifecycle ---------- */

let worker = null;
let workerModelId = null;
let nextId = 1;
const pending = new Map(); // id → { resolve, reject, onToken }

/* wllama WASM loaded from CDN (not bundled). */
const wasmUrl = WLLAMA_WASM_URL;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./inferenceWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const { id, type } = event.data;
    const entry = pending.get(id);
    if (!entry) return;

    if (type === 'TOKEN') {
      entry.onToken?.(event.data.token, event.data.text);
    } else if (type === 'DONE') {
      pending.delete(id);
      entry.resolve(event.data.text);
    } else if (type === 'OK') {
      pending.delete(id);
      entry.resolve();
    } else if (type === 'ERROR') {
      pending.delete(id);
      entry.reject(new Error(event.data.error));
    }
  };
  return worker;
}

/** Send a command to the worker and return a promise for its result. */
function send(cmd, data, onToken) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onToken });
    ensureWorker().postMessage({ id, cmd, ...data });
  });
}

/* ---------- Public API ---------- */

export function loadedModelId() {
  return workerModelId;
}

/**
 * Load (or reuse) the worker runtime for one downloaded model id.
 * Throws Error('MODEL_NOT_DOWNLOADED:id') when the weights are not local.
 *
 * Callers reach this only through an explicit user action — the engine imports
 * nothing until here, so a fresh install never downloads the WASM runtime.
 */
export async function ensureRuntime(modelId) {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown local model: ${modelId || 'none selected'}`);
  if (workerModelId === model.id) return { modelId: model.id };

  // One context at a time: release the previous model before loading the next.
  if (workerModelId) {
    await send('UNLOAD', {}).catch(() => {});
    workerModelId = null;
  }

  const meta = loadModelMeta();
  if (!meta[model.id]?.downloaded) throw new Error(`MODEL_NOT_DOWNLOADED:${model.id}`);

  const blob = await getModelBlob(model.id);
  if (!blob) throw new Error(`MODEL_NOT_DOWNLOADED:${model.id}`);

  // Convert blob → ArrayBuffer for transfer to the worker
  const buffer = await blob.arrayBuffer();

  await send('LOAD', {
    wasmUrl,
    buffer,
    nCtx: storage.get('ai-ctx', 8192),
  });

  workerModelId = model.id;
  return { modelId: model.id };
}

/**
 * Streaming chat with the loaded model.
 * messages: [{ role, content }] · onToken(token, fullText)
 */
export async function localChat(messages, { onToken, thinking = false, signal, maxTokens } = {}) {
  if (!workerModelId) throw new Error('No model loaded');
  // /no_think is a Qwen3-specific chat convention that some GGUFs/templates reject
  // outright (they echo "Unknown command"). Only inject it when the user opts in.
  const noThink = storage.get('ai-qwen-nothink', false);
  let prepared = _prepareMessages(messages, workerModelId, noThink, thinking) || messages;

  // Use Rust core for context window trimming
  const nCtx = storage.get('ai-ctx', 8192);
  const reserveForResponse = maxTokens || 600;
  const budget = nCtx - reserveForResponse;

  // Estimate tokens and trim if needed (Rust does the heavy lifting)
  const estimate = _estimateMessagesTokens(prepared);
  if (estimate && estimate.tokens > budget) {
    const trimmed = _trimMessages(prepared, budget);
    if (trimmed?.messages) prepared = trimmed.messages;
  }

  // If the caller passes an AbortSignal, we can't cancel the worker mid-stream
  // (postMessage has no AbortController), but we stop forwarding tokens.
  return send('CHAT', {
    messages: prepared,
    options: { temperature: 0.7, maxTokens: maxTokens || 600 },
  }, (token, text) => {
    if (!signal?.aborted) onToken?.(token, text);
  });
}

export async function unloadRuntime() {
  if (workerModelId) {
    await send('UNLOAD', {}).catch(() => {});
    workerModelId = null;
  }
}
