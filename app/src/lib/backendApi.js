import { storage } from './storage/localStorage';
import { getAccessToken } from './supabase';
import { getDeviceId } from './deviceId';
import { readSSEStream, extractOpenAIDelta, extractReasoningDelta, extractLithiumUsage, errorText } from './ai/sse';

/**
 * Client for the Lithium backend (models, memory, context windows,
 * chat proxy). Supports multiple server URLs with automatic fallback.
 *
 * The backend is optional — every call fails gracefully when
 * all servers are offline, and callers fall back to the in-browser engine.
 *
 * Server URLs are stored as a JSON array in localStorage key 'server-urls'.
 * The client tries each URL in order until one responds successfully.
 * Once a working URL is found, it's cached as the active URL for subsequent requests.
 *
 * JWT forwarding: If the user is signed in via Supabase, the access token
 * is sent as Authorization: Bearer header for Full tier access.
 */

const DEFAULT_URLS = [
  // Primary server port (li-server default)
  'http://127.0.0.1:8734',
  'http://localhost:8734',
  // Common LAN IPs (reachable when server binds to 0.0.0.0)
  'http://192.168.1.1:8734',
  'http://192.168.0.1:8734',
  'http://192.168.1.100:8734',
  'http://192.168.0.100:8734',
  'http://10.0.0.1:8734',
  'http://10.0.0.100:8734',
  // Alternative ports (same machine, different services)
  'http://127.0.0.1:4515',
  'http://127.0.0.1:9461',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8888',
  'http://127.0.0.1:9000',
  'http://localhost:8080',
];

export const BACKEND_OFFLINE_MESSAGE = 'Backend currently offline, try again later.';
export const BACKEND_FEATURES_DISABLED = true;
export const BACKEND_INACTIVE_MESSAGE = 'Backend inactive — Lithium is intentionally shown as a design prototype with no working backend features yet.';
export const backendFeatureEnabled = () => !BACKEND_FEATURES_DISABLED;

/** Get the list of server URLs to try. */
export const getServerUrls = () => {
  const stored = storage.get('server-urls', null);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return DEFAULT_URLS;
};

/** Set the list of server URLs. */
export const setServerUrls = (urls) => storage.set('server-urls', urls);

/** Get the active (cached working) URL, or the first URL if none cached. */
export const getActiveUrl = () => {
  const cached = storage.get('active-server-url', null);
  if (cached) return cached;
  const urls = getServerUrls();
  return urls[0] || DEFAULT_URLS[0];
};

/** Cache the working URL. */
export const setActiveUrl = (url) => storage.set('active-server-url', url);

/** Clear the cached URL (force re-discovery). */
export const clearActiveUrl = () => storage.remove('active-server-url');

/** Legacy compatibility: backendUrl() returns the active URL. */
export const backendUrl = getActiveUrl;
export const setBackendUrl = (url) => {
  setActiveUrl(url);
  // Also update the server URLs list to include this URL
  const urls = getServerUrls();
  if (!urls.includes(url)) {
    setServerUrls([url, ...urls]);
  }
};

/**
 * Try a request against multiple server URLs in order.
 * Returns { response, baseUrl } for the first successful attempt.
 * Throws if all URLs fail.
 */
async function tryUrls(path, options = {}) {
  const activeUrl = getActiveUrl();
  const urls = getServerUrls();

  // Try the cached active URL first
  if (activeUrl && urls.includes(activeUrl)) {
    try {
      const response = await fetchWithAuth(activeUrl, path, options);
      return { response, baseUrl: activeUrl };
    } catch {
      // Active URL failed — try others
    }
  }

  // Try each URL in order
  for (const baseUrl of urls) {
    if (baseUrl === activeUrl) continue; // Already tried
    try {
      const response = await fetchWithAuth(baseUrl, path, options);
      // Success — cache this as the active URL
      setActiveUrl(baseUrl);
      return { response, baseUrl };
    } catch {
      // This URL failed — try next
    }
  }

  throw new Error(BACKEND_OFFLINE_MESSAGE);
}

/**
 * Make a fetch request with JWT auth header.
 */
async function fetchWithAuth(baseUrl, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach Supabase JWT if available
  const token = await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch { /* not JSON */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200));
  }

  return response;
}

/**
 * Make a request to the backend, trying multiple URLs with fallback.
 */
async function request(path, options = {}) {
  if (!backendFeatureEnabled()) {
    throw new Error(BACKEND_INACTIVE_MESSAGE);
  }

  const { response } = await tryUrls(path, options);
  return response.json();
}

/** Quick liveness probe — tries each URL until one responds. */
export async function backendHealth({ timeout = 2500 } = {}) {
  if (!backendFeatureEnabled()) {
    return { ok: false, inactive: true, message: BACKEND_INACTIVE_MESSAGE, memories: 0 };
  }

  const urls = getServerUrls();
  const activeUrl = getActiveUrl();

  // Try active URL first
  if (activeUrl) {
    try {
      const res = await fetch(`${activeUrl}/api/health`, {
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Active URL failed — try others
    }
  }

  // Try each URL
  for (const baseUrl of urls) {
    if (baseUrl === activeUrl) continue;
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) {
        setActiveUrl(baseUrl);
        return await res.json();
      }
    } catch {
      // This URL failed — try next
    }
  }

  return { ok: false, offline: true, message: BACKEND_OFFLINE_MESSAGE };
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
    const baseUrl = getActiveUrl();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api/llm/models/upload`);

    // Attach JWT header
    getAccessToken().then(token => {
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    });

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

/* ================================================================
 *  Lithium Lite — the hosted free tier (Rust li-server).
 *
 *  A separate path from everything above: it targets the user's own
 *  li-server, whose /api/chat holds the upstream credential server-side and
 *  meters each caller against a credit allowance. It deliberately ignores
 *  BACKEND_FEATURES_DISABLED, which describes the legacy Python prototype.
 * ================================================================ */

/** Public origin of the Lite server, if one was baked in at build time. */
const ENV_LI_URL = (import.meta.env.VITE_LI_SERVER_URL || '').trim().replace(/\/+$/, '');

/** Resolve where to send Lite requests: explicit override → build-time URL →
 *  the LAN-rediscovered backend (so local development works unconfigured). */
export function liServerUrl() {
  const saved = (storage.get('li-server-url', '') || '').trim().replace(/\/+$/, '');
  if (saved) return saved;
  if (ENV_LI_URL) return ENV_LI_URL;
  return getActiveUrl();
}

/** Point the Lite tier at a specific server ('' restores the default). */
export function setLiServerUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) storage.set('li-server-url', clean);
  else storage.remove('li-server-url');
}

/** The current override, or '' when following the baked-in default. */
export const liServerUrlOverride = () => storage.get('li-server-url', '') || '';

/** Identity headers every Lite call carries: device metering + JWT if signed in. */
async function liHeaders(extra = {}) {
  const headers = { 'X-Device-ID': getDeviceId(), ...extra };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Stream a Lite completion, forwarding tokens as they arrive.
 * Returns the full assistant text.
 *
 * `onUsage(receipt)` runs once at the end with what the reply cost — credits and
 * token counts — since a reply is billed by the tokens it used, not per request.
 * `onReasoning(text, fullReasoning)` fires per reasoning_content delta from
 * models that think out loud (gpt-oss). The receipt is not part of the text.
 * Stopping a stream early does not reach here (the reader throws), but the
 * server still bills for the text it had already sent.
 *
 * Tool-calling support (Phase 3):
 *   `tools`           — array of OpenAI-format tool definitions to send upstream.
 *   `toolAccumulator` — a mutable object from `createToolCallAccumulator()`.
 *     Every SSE line is fed through its `process()` method; after the stream
 *     closes the caller reads accumulated tool calls via `accumulator.calls`.
 *     Passing an accumulator does not change the return value — text still
 *     streams through `onToken` exactly as before.
 */
export async function liChatStream(messages, { model, temperature, maxTokens, signal, onToken, onUsage, onReasoning, tools, toolAccumulator, thinkingBudget } = {}) {
  const response = await fetch(`${liServerUrl()}/api/chat`, {
    method: 'POST',
    signal,
    headers: await liHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify({
      messages,
      model,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      ...(tools?.length ? { tools } : {}),
      ...(thinkingBudget ? { thinking_budget: thinkingBudget } : {}),
    }),
  });
  if (!response.ok) throw new Error(await errorText(response));

  let usage = null;
  let reasoning = '';
  const full = await readSSEStream(response, onToken, line => {
    const receipt = extractLithiumUsage(line);
    if (receipt) { usage = receipt; return null; }
    const think = extractReasoningDelta(line);
    if (think) { reasoning += think; onReasoning?.(think, reasoning); return null; }
    // Feed every line through the tool-call accumulator (no-op for non-tool frames).
    toolAccumulator?.process(line);
    return extractOpenAIDelta(line);
  });
  if (usage) onUsage?.(usage);
  return full;
}

/** One-shot Lite completion (no streaming). Returns the assistant text. */
export async function liChat(messages, { model, temperature, maxTokens, signal, onUsage, thinkingBudget } = {}) {
  const response = await fetch(`${liServerUrl()}/api/chat`, {
    method: 'POST',
    signal,
    headers: await liHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      messages, model, stream: false, temperature, max_tokens: maxTokens,
      ...(thinkingBudget ? { thinking_budget: thinkingBudget } : {}),
    }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  const data = await response.json();
  if (data.usage) onUsage?.(data.usage);
  // li-server wraps the upstream payload: { success, response: <provider json>, usage }
  return data.response?.choices?.[0]?.message?.content || '';
}

/**
 * Remaining free credits: { authenticated, metered, balance:
 * { kind, limit, spent, remaining, window_secs, reset_at, tokens_in, tokens_out } }.
 */
export async function liCredits({ signal } = {}) {
  const response = await fetch(`${liServerUrl()}/api/credits`, {
    signal,
    headers: await liHeaders(),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/* ================================================================
 *  Package store — the server's own shelf of .tar.gz apps and games.
 *
 *  This replaces the Cloudflare pair (an appstore Worker streaming out of R2
 *  and a games Worker holding 767 loose index.html files). The archives are
 *  ordinary files on the li-server host now, so everything here is one of:
 *  list what's on the shelf, hand a URL to the browser so it can save the
 *  archive, or hand the bytes to `lib/storeApi.js` to unpack into the FS.
 *
 *  Like the rest of the Lite tier this ignores BACKEND_FEATURES_DISABLED, and
 *  it carries X-Device-ID because the server's guest download budget is keyed
 *  to the device, not the JWT.
 * ================================================================ */

/** GET a store endpoint, throwing the server's own message when it refuses.
 *  Accepts a server-relative path or an already-absolute URL — package objects
 *  hand back absolute urls, and re-prefixing one would point at `http://hosthttp://host…`. */
async function liGet(path, { signal } = {}) {
  const url = /^https?:/i.test(path) ? path : `${liServerUrl()}${path}`;
  const response = await fetch(url, { signal, headers: await liHeaders() });
  if (!response.ok) throw new Error(await errorText(response));
  return response;
}

/** { success, counts, apps: [...], games: [...] } — both shelves at once. */
export async function liStoreCatalog({ signal } = {}) {
  return (await liGet('/api/store/catalog', { signal })).json();
}

/** { success, games: [...] } — every game a caller may take. */
export async function liStoreGames({ signal } = {}) {
  return (await liGet('/api/games', { signal })).json();
}

/** { success, apps: [...] } */
export async function liStoreApps({ signal } = {}) {
  return (await liGet('/api/apps', { signal })).json();
}

/** { success, game } / { success, app } — one package's manifest. */
export const liStoreGame = async (slug, { signal } = {}) =>
  (await liGet(`/api/games/${encodeURIComponent(slug)}`, { signal })).json();
export const liStoreApp = async (id, { signal } = {}) =>
  (await liGet(`/api/apps/${encodeURIComponent(id)}`, { signal })).json();

/** Take an archive off the shelf as bytes, for unpacking into the FS. */
export async function liStoreBlob(path, { signal } = {}) {
  return (await liGet(path, { signal })).blob();
}

/** Absolute URL for a server-served path (a game's play page, a download), so
 *  an iframe or an <a download> reaches the same host the shelf was read from. */
export const liAssetUrl = path =>
  /^https?:/i.test(path) ? path : `${liServerUrl()}${path}`;
