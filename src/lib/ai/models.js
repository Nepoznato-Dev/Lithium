import { storage } from '../storage/localStorage';
import { deleteBlob, getBlob, putBlob } from '../storage/manager';
import { backendFeatureEnabled, backendUrl } from '../backendApi';
import { opfsAvailable, opfsDelete, opfsGetFile, opfsWriteStream } from '../storage/indexedDB';

/**
 * Lightweight local model catalog (GGUF, Q4_K_M) downloaded from Hugging Face
 * into IndexedDB. Files count toward the 15 GB IndexedDB tier and show up in
 * the Storage Manager.
 */

export const MODEL_CATALOG = [
  {
    id: 'qwen3-0.6b',
    name: 'Qwen3 0.6B',
    params: '0.6B',
    quant: 'Q4_K_M',
    size: 468_000_000,
    tier: 'lite',
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
    blurb: 'Tiny but sharp — great for summaries, time & weather reports.',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B Instruct',
    params: '1.5B',
    quant: 'Q4_K_M',
    size: 1_100_000_000,
    tier: 'efficient',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    blurb: 'Balanced instruction follower for everyday assistant tasks (MMLU 74).',
  },
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B-it',
    params: 'E2B',
    quant: 'Q4_K_M',
    size: 3_106_738_272,
    tier: 'efficient',
    url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf',
    blurb: 'Fast multimodal model (image/audio/video aware) — text chat in Lithium for now.',
  },
  {
    id: 'smollm3-3b',
    name: 'SmolLM3 3B',
    params: '3B',
    quant: 'Q4_K_M',
    size: 1_950_000_000,
    tier: 'performance',
    url: 'https://huggingface.co/mradermacher/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B.Q4_K_M.gguf',
    blurb: 'Hugging Face’s smol 3B-class leader with 128k context.',
  },
  {
    id: 'phi-4-mini',
    name: 'Phi-4-mini',
    params: '3.8B',
    quant: 'Q4_K_M',
    size: 2_500_000_000,
    tier: 'performance',
    url: 'https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
    blurb: 'Microsoft’s compact reasoner — MMLU 73 / MATH 62 at half the memory of 8B models.',
  },
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B Instruct-2507',
    params: '4B',
    quant: 'Q4_K_M',
    size: 2_497_281_120,
    tier: 'ultra',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    blurb: 'Thinking mode for complex tasks — MATH-500 97, strongest in the lineup.',
  },
];

const META_KEY = 'models';
const META_EVENT = 'lithium:models-changed';
const CUSTOM_KEY = 'custom-models';

export function loadModelMeta() {
  return storage.get(META_KEY, {});
}

function saveModelMeta(meta) {
  storage.set(META_KEY, meta);
  window.dispatchEvent(new Event(META_EVENT));
}

/* ---------- Custom models (user-added GGUFs, fully in-browser) ---------- */

function _slugify(text, maxLen = 48) {
  const clean = (text || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let r = '', pd = true;
  for (const c of clean) { if (c === '-') { if (!pd) r += '-'; pd = true; } else { r += c; pd = false; } }
  if (r.endsWith('-')) r = r.slice(0, -1);
  return (r.slice(0, maxLen)) || 'model';
}
const slugify = text => _slugify(text);

/** User-added models persist in localStorage; their GGUF blobs live in IndexedDB. */
export function loadCustomModels() {
  return storage.get(CUSTOM_KEY, []);
}

function saveCustomModels(list) {
  storage.set(CUSTOM_KEY, list);
  window.dispatchEvent(new Event(META_EVENT));
}

export function allModels() {
  return [...MODEL_CATALOG, ...loadCustomModels()];
}

export function getModel(id) {
  return allModels().find(model => model.id === id) || null;
}

/** Register a custom model from a URL — download it later with downloadModel(). */
export function addCustomModel({ name, url, size = 0, blurb = '' }) {
  const id = `custom-${slugify(name)}`;
  if (allModels().some(model => model.id === id)) throw new Error('A model with this name already exists');
  const model = {
    id,
    name: String(name || 'Custom model').slice(0, 64),
    params: 'custom',
    quant: 'GGUF',
    size: Number(size) || 0,
    tier: 'custom',
    url: String(url),
    blurb: String(blurb || 'Custom model added by you — runs fully in the browser via wllama.'),
    custom: true,
  };
  saveCustomModels([...loadCustomModels(), model]);
  return model;
}

/** Import a GGUF file from disk straight into IndexedDB (no download needed). */
export async function importLocalGguf(file, name) {
  const id = `custom-${slugify(name || file.name)}`;
  if (allModels().some(model => model.id === id)) throw new Error('A model with this name already exists');
  await putBlob(`model:${id}`, file, { name: file.name });
  const meta = loadModelMeta();
  meta[id] = { downloaded: true, size: file.size, at: Date.now() };
  saveModelMeta(meta);
  saveCustomModels([...loadCustomModels(), {
    id,
    name: String(name || file.name.replace(/\.gguf$/i, '')).slice(0, 64),
    params: 'custom',
    quant: 'GGUF',
    size: file.size,
    tier: 'custom',
    url: '',
    blurb: 'Imported from this device — runs fully in the browser via wllama.',
    custom: true,
  }]);
  return id;
}

/** Remove a custom model: registry entry + downloaded blob + meta. */
export async function removeCustomModel(id) {
  await deleteBlob(`model:${id}`).catch(() => {});
  const meta = loadModelMeta();
  const info = meta[id];
  if (info?.storage === 'opfs') await opfsDelete(info.opfsName || opfsFile(id));
  delete meta[id];
  saveModelMeta(meta);
  saveCustomModels(loadCustomModels().filter(model => model.id !== id));
}

/** Register a GGUF that another tool (the Downloader) already stored in OPFS.
 * Makes it a first-class custom model: Cortex lists it, wllama can load it,
 * Downloads mirrors it. Returns the model id. */
export function registerExternalGguf({ name, opfsName, size = 0, url = '' }) {
  const clean = String(name || 'model').replace(/\.gguf$/i, '');
  let id = `custom-${slugify(clean)}`;
  let n = 2;
  while (allModels().some(model => model.id === id)) id = `custom-${slugify(clean)}-${n++}`;
  saveCustomModels([...loadCustomModels(), {
    id,
    name: clean.slice(0, 64),
    params: 'custom',
    quant: 'GGUF',
    size: Number(size) || 0,
    tier: 'custom',
    url: String(url || ''),
    blurb: 'Downloaded with the Downloader app — runs fully in the browser via wllama.',
    custom: true,
  }]);
  const meta = loadModelMeta();
  meta[id] = { downloaded: true, size: Number(size) || 0, at: Date.now(), storage: 'opfs', opfsName };
  saveModelMeta(meta);
  return id;
}

/* ---------- Hugging Face helpers ---------- */

/**
 * Browsers often block cross-origin fetches from huggingface.co (CORS).
 * Try the direct request first; on a network/CORS failure retry through the
 * local Python backend's proxy, which streams the same URL server-side.
 */
async function fetchMaybeProxied(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (!backendFeatureEnabled()) throw err;
    let proxied;
    try {
      proxied = await fetch(`${backendUrl()}/api/llm/proxy?url=${encodeURIComponent(url)}`, options);
    } catch {
      throw new Error(`${err.message} — and the local backend proxy is unreachable (${backendUrl()}). Start it with: python run.py in backend/, or check the URL.`);
    }
    if (!proxied.ok) {
      let detail = '';
      try { detail = (await proxied.json()).detail || ''; } catch { /* not JSON */ }
      throw new Error(detail || `proxy returned HTTP ${proxied.status}`);
    }
    return proxied;
  }
}

/**
 * Parse a Hugging Face URL into { repoId, path } for the repo file browser.
 * Returns null for non-HF URLs, /resolve/ file links and unrelated pages.
 */
export function parseHfUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const afterScheme = trimmed.startsWith('https://') ? trimmed.slice(8) : trimmed.startsWith('http://') ? trimmed.slice(7) : null;
  if (!afterScheme) return null;
  const hostEnd = afterScheme.indexOf('/');
  const host = hostEnd === -1 ? afterScheme : afterScheme.slice(0, hostEnd);
  if (!host.endsWith('huggingface.co') && !host.endsWith('huggingface.co.')) return null;
  if (hostEnd === -1) return null;
  const parts = afterScheme.slice(hostEnd + 1).split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repoId = `${parts[0]}/${parts[1]}`;
  if (parts.length < 3) return { repoId, path: '' };
  if (parts[2] === 'resolve') return null;
  if (parts[2] === 'tree') return { repoId, path: parts.slice(3).join('/') };
  if (parts[2] === 'blob') return { repoId, path: parts.length > 4 ? parts.slice(3, parts.length - 1).join('/') : '' };
  return null;
}

/** Direct download link for one file of a HF repo. */
export const hfResolveUrl = (repoId, file) =>
  `https://huggingface.co/${repoId || ''}/resolve/main/${file || ''}`;

/** List one directory of a HF repo (GitHub-style browsing).
 * Proxy-first: the local backend's server-side fetch is the proven-reliable
 * route on networks where the browser's direct path misbehaves. */
export async function listHfDir(repoId, path = '') {
  const target = `https://huggingface.co/api/models/${repoId}/tree/main${path ? `/${path}` : ''}`;
  let lastError = null;
  for (const attempt of (backendFeatureEnabled() ? ['proxy', 'direct'] : ['direct'])) {
    try {
      const url = attempt === 'direct' ? target : `${backendUrl()}/api/llm/proxy?url=${encodeURIComponent(target)}`;
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`Hugging Face lookup failed (HTTP ${response.status})`);
        continue;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        return data
          .map(entry => ({
            type: entry.type,
            name: String(entry.path).split('/').pop(),
            path: entry.path,
            size: entry.size || (entry.lfs && entry.lfs.size) || 0,
          }))
          .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
      }
      lastError = new Error('Hugging Face returned an unexpected response');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Hugging Face lookup failed');
}

/* ---------- Inference tiers (benchmarked placements) ---------- */

export const TIERS = [
  { id: 'auto', label: 'Auto', modelId: 'qwen2.5-1.5b', hint: 'dynamically picks the best tier for your query' },
  { id: 'lite', label: 'Lite', modelId: 'qwen3-0.6b', hint: 'fast & lightweight · everyday tasks' },
  { id: 'efficient', label: 'Efficient', modelId: 'qwen2.5-1.5b', alt: 'gemma-4-e2b', hint: 'balanced speed & quality · standard reasoning' },
  { id: 'performance', label: 'Performance', modelId: 'smollm3-3b', alt: 'phi-4-mini', hint: 'advanced reasoning · high output quality' },
  { id: 'ultra', label: 'Ultra', modelId: 'qwen3-4b', hint: 'frontier-class · expert deep reasoning & thinking' },
];

/** Analyze a message and return the best tier id for it. */
export function autoSelectTier(text) {
  const t = (text || '').toLowerCase();
  const len = text.length;
  // Ultra signals: deep reasoning, complex analysis, multi-step
  if (/\b(think|reason|analyze|compare|evaluate|prove|derive|explain in detail|step.by.step|chain.of.thought)\b/.test(t) && len > 80) return 'ultra';
  // Performance signals: coding, writing, structured output
  if (/\b(code|write|function|class|implement|debug|refactor|algorithm|design|architecture|essay|article|report)\b/.test(t) && len > 40) return 'performance';
  // Lite signals: short, simple questions
  if (len < 60 && /^\s*(what|who|when|where|how|is|are|do|does|can|will)\b/i.test(text.trim())) return 'lite';
  // Default: efficient
  return 'efficient';
}

export const getTier = () => storage.get('ai-tier', 'lite');
export const setTier = id => storage.set('ai-tier', id);
export const tierModel = tierId => TIERS.find(tier => tier.id === tierId) || TIERS[0];

/** Which model of a tier is downloaded (prefers the primary). Null if none. */
export function downloadedModelFor(tierId) {
  const tier = tierModel(tierId);
  const meta = loadModelMeta();
  for (const id of [tier.modelId, tier.alt].filter(Boolean)) {
    if (meta[id]?.downloaded) return getModel(id);
  }
  return null;
}

/* ---------- OPFS streaming storage (multi-GB safe) ---------- */

const opfsFile = id => `${String(id).replace(/[^a-z0-9.-]/gi, '_')}.gguf`;

/** Stream a GGUF into browser storage with progress callbacks.
 * Large models stream into an OPFS file (constant memory); only when OPFS is
 * unavailable do we fall back to an in-memory blob in IndexedDB. */
export async function downloadModel(id, { onProgress, signal } = {}) {
  const model = getModel(id);
  if (!model) throw new Error('Unknown model');
  const response = await fetchMaybeProxied(model.url, { signal });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}) — check that the URL points at a real file`);
  const total = Number(response.headers.get('content-length')) || model.size;

  let size;
  let storageKind;
  if (opfsAvailable()) {
    size = await opfsWriteStream(opfsFile(id), response, total, onProgress, signal);
    storageKind = 'opfs';
  } else {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.({ received, total });
    }
    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    await putBlob(`model:${id}`, blob, { name: model.url.split('/').pop() });
    size = blob.size;
    storageKind = 'idb';
  }

  const meta = loadModelMeta();
  meta[id] = { downloaded: true, size, at: Date.now(), storage: storageKind };
  saveModelMeta(meta);
}

export async function deleteModel(id) {
  await deleteBlob(`model:${id}`).catch(() => {});
  const meta = loadModelMeta();
  const info = meta[id];
  if (info?.storage === 'opfs') await opfsDelete(info.opfsName || opfsFile(id));
  delete meta[id];
  saveModelMeta(meta);
  // Custom models lose their registry entry too.
  if (String(id).startsWith('custom-')) {
    saveCustomModels(loadCustomModels().filter(model => model.id !== id));
  }
}

/** Blob/File for a downloaded model — OPFS returns a lazy File (no memory copy). */
export async function getModelBlob(id) {
  const meta = loadModelMeta();
  if (meta[id]?.storage === 'opfs' && opfsAvailable()) {
    return opfsGetFile(meta[id].opfsName || opfsFile(id));
  }
  return getBlob(`model:${id}`);
}
