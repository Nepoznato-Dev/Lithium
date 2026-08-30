import { storage } from './storage/localStorage';

/**
 * Client for the Lithium Python backend (models, memory, context windows,
 * chat proxy). The backend is optional — every call fails gracefully when
 * the server is offline, and callers fall back to the in-browser engine.
 *
 * Server: `python run.py` inside backend/ → http://127.0.0.1:8734
 */

const DEFAULT_URL = 'http://127.0.0.1:8734';

export const backendUrl = () => storage.get('backend-url', DEFAULT_URL);
export const setBackendUrl = url => storage.set('backend-url', url);

async function request(path, options = {}) {
  const response = await fetch(`${backendUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch { /* not JSON */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200));
  }
  return response.json();
}

/** Quick liveness probe — returns the health object or null when offline. */
export async function backendHealth({ timeout = 2500 } = {}) {
  try {
    return await request('/api/health', { signal: AbortSignal.timeout(timeout) });
  } catch {
    return null;
  }
}

/** Chat via the backend. Resolves model_id → registry, else provider default. */
export function backendChat(messages, { modelId, provider, model, keys, temperature, signal } = {}) {
  return request('/api/chat', {
    method: 'POST',
    signal,
    body: JSON.stringify({ messages, model_id: modelId, provider, model, keys, temperature }),
  });
}

/* ---------- Model registry ---------- */

export const backendModels = () => request('/api/models');
export const backendSaveModel = (model, signal) => request(model.id ? `/api/models/${model.id}` : '/api/models', {
  method: model.id ? 'PUT' : 'POST',
  signal,
  body: JSON.stringify(model),
});
export const backendDeleteModel = id => request(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ---------- Memory (mirrors src/lib/memory.js shape) ---------- */

export const backendMemory = () => request('/api/memory');
export const backendWriteMemory = (key, value) => request('/api/memory', { method: 'POST', body: JSON.stringify({ key, value }) });
export const backendDeleteMemory = key => request(`/api/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });

/** Merge the browser memory store into the backend; returns the merged map. */
export const backendMemorySync = entries => request('/api/memory/sync', { method: 'POST', body: JSON.stringify({ entries }) });

/* ---------- Context window ---------- */

/** Fit messages into a model's context window; injects backend memory. */
export const backendBuildContext = (messages, { maxTokens, modelId, includeMemory } = {}, signal) => request('/api/context/build', {
  method: 'POST',
  signal,
  body: JSON.stringify({ messages, max_tokens: maxTokens, model_id: modelId, include_memory: includeMemory ?? true }),
});

export const backendWebSearch = (query, limit = 5, signal) => request('/api/web/search', {
  method: 'POST', signal, body: JSON.stringify({ query, limit }),
});

/* ---------- Local GGUF model store (the "mini-Ollama") ---------- */

/** Engines + store info: { llamaCpp, ollamaCli, ollamaRunning, modelsDir }. */
export const backendLlmStatus = () => request('/api/llm/status');

/** { models: [...], downloads: [...] } from the local store. */
export const backendLlmModels = () => request('/api/llm/models');

export const backendLlmDelete = id => request(`/api/llm/models/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Ask the backend to download a GGUF from a URL into its own store. */
export const backendLlmDownload = (url, name) => request('/api/llm/models/download', {
  method: 'POST',
  body: JSON.stringify({ url, name }),
});

/** (Re)import a stored GGUF into Ollama. */
export const backendLlmImport = id => request(`/api/llm/models/${encodeURIComponent(id)}/import`, { method: 'POST' });

/** Upload a GGUF file from the browser into the backend store (XHR → progress). */
export function backendLlmUpload(file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${backendUrl()}/api/llm/models/upload`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.({ received: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — is the backend running?'));
    signal?.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
