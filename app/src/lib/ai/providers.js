import { storage } from '../storage/localStorage';
import { liChat, liChatStream, liCredits } from '../backendApi';
import { readSSEStream, extractOpenAIDelta, errorText } from './sse';
import { downloadedModels } from './models';

/**
 * Unified chat-completion adapters.
 *
 * `lithium` is the free hosted default: it calls the user's own li-server,
 * which holds the upstream credential server-side and meters each caller
 * against a credit allowance. Nothing sensitive is shipped in the bundle, so
 * the free tier cannot be lifted out of it.
 *
 * Every other cloud provider is bring-your-own-key: keys live in localStorage
 * (`lithium:ai-keys`) and go straight from the browser to that provider. All of
 * them support CORS; Anthropic additionally needs the
 * dangerous-direct-browser-access header by design.
 *
 * `local` is opt-in on-device inference over a GGUF the user downloaded, routed
 * to the wllama worker through a dynamic import so nothing heavy is pulled in
 * until it is actually used.
 */

/** Free hosted tier — the provider a fresh install starts on. */
export const DEFAULT_PROVIDER = 'lithium';
/** Pseudo-provider for the on-device engine. */
export const LOCAL_PROVIDER = 'local';

/** OpenAI-compatible bases, i.e. everything reached at `${base}/chat/completions`. */
const OPENAI_COMPAT_BASES = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  zai: 'https://api.z.ai/api/paas/v4',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  huggingface: 'https://router.huggingface.co/v1',
};

export const AI_PROVIDERS = {
  lithium: { label: 'Lithium Lite', needsKey: false, hosted: true, model: 'openai/gpt-oss-120b', desc: 'Free hosted GPT-OSS 120B, metered by daily credits' },
  groq: { label: 'Groq', needsKey: true, model: 'openai/gpt-oss-120b' },
  openai: { label: 'OpenAI', needsKey: true, model: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', needsKey: true, model: 'claude-3-5-haiku-latest' },
  google: { label: 'Google', needsKey: true, model: 'gemini-2.0-flash' },
  xai: { label: 'Grok (xAI)', needsKey: true, model: 'grok-3-mini' },
  cerebras: { label: 'Cerebras', needsKey: true, model: 'gpt-oss-120b' },
  mistral: { label: 'Mistral', needsKey: true, model: 'mistral-small-latest' },
  openrouter: { label: 'OpenRouter', needsKey: true, model: 'openai/gpt-oss-120b' },
  zai: { label: 'Z.ai', needsKey: true, model: 'glm-4.7-flash' },
  deepseek: { label: 'DeepSeek', needsKey: true, model: 'deepseek-chat' },
  together: { label: 'Together AI', needsKey: true, model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  fireworks: { label: 'Fireworks', needsKey: true, model: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
  huggingface: { label: 'Hugging Face', needsKey: true, model: 'openai/gpt-oss-120b' },
  custom: { label: 'Custom endpoint', needsKey: true, model: '' },
  local: { label: 'On-device (GGUF)', needsKey: false, local: true, model: '' },
};

/* ── Per-provider model catalogs ──
   Each entry: { id, name, context, tag?, vision?, desc }
   `tag` is a short UI chip label: free / fast / coding / frontier / ...
   `context` is a human-readable string ('131K', '1M', etc.). The numeric token
   limit is derived by maxContextForModel() so the data stays in one place.
   `vision: true` marks a model that takes image input; the UI chip `tag:
   'vision'` is treated as the same promise, so the two never drift apart.

   These are curated offline fallbacks. Providers whose catalog changes often
   should be refreshed live with fetchProviderModels() — the lists below only
   decide what a first-time user sees before they connect a key. */

export const PROVIDER_MODELS = {
  lithium: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: '131K', tag: 'free', desc: 'Lithium Lite default — top-tier open-weight model with strong reasoning' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: '131K', tag: 'fast', desc: 'Smaller open-weight model for quick, everyday replies' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: '131K', tag: 'best', desc: 'Top-tier open-weight model with exceptional reasoning and agentic reliability' },
    { id: 'groq/compound', name: 'Groq Compound', context: '131K', tag: 'agent', desc: 'Multi-model orchestration system for complex autonomous task execution' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: '131K', tag: 'fast', desc: 'Lightweight open-weight model optimized for speed on Groq hardware' },
    { id: 'groq/compound-mini', name: 'Compound Mini', context: '131K', tag: 'light', desc: 'Compact compound system for quick, cost-effective task completion' },
    { id: 'qwen/qwen3.6-27b', name: 'Qwen3.6-27B', context: '131K', tag: 'vision', desc: 'Native multimodal model with deep image and document understanding' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', context: '128K', tag: 'frontier', vision: true, desc: 'Flagship omnimodal model with native audio, vision, and text reasoning' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: '128K', tag: 'fast', vision: true, desc: 'Cost-efficient small model with strong general intelligence' },
    { id: 'gpt-4.1', name: 'GPT-4.1', context: '1M', tag: 'coding', vision: true, desc: 'Purpose-built for long-context coding with precise instruction following' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', context: '1M', tag: 'balanced', vision: true, desc: 'Balanced coding and reasoning at lower cost with 1M context' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', context: '1M', tag: 'light', vision: true, desc: 'Ultra-fast, cheapest option for lightweight tasks and classification' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', context: '200K', tag: 'best', vision: true, desc: 'Latest Sonnet with superior coding, reasoning, and agentic capabilities' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', context: '200K', tag: 'fast', vision: true, desc: 'Fastest Anthropic model for quick responses and high-throughput tasks' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', context: '200K', tag: 'balanced', vision: true, desc: 'Excellent balance of intelligence, speed, and cost for general use' },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', context: '200K', tag: 'frontier', vision: true, desc: 'Most powerful Claude for complex analysis, research, and deep reasoning' },
  ],
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M', tag: 'best', vision: true, desc: 'Next-gen model with thinking capabilities and exceptional speed' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '1M', tag: 'frontier', vision: true, desc: 'Google\'s most capable model with advanced reasoning and 1M context' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: '1M', tag: 'fast', vision: true, desc: 'Fast multimodal model with native image, audio, and video understanding' },
  ],
  xai: [
    { id: 'grok-3', name: 'Grok 3', context: '131K', tag: 'frontier', desc: 'xAI\'s flagship with world-class reasoning, math, and real-time knowledge' },
    { id: 'grok-3-mini', name: 'Grok 3 Mini', context: '131K', tag: 'fast', desc: 'Compact, fast Grok variant for efficient everyday conversations' },
  ],
  cerebras: [
    { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', context: '131K', tag: 'best', desc: 'Blazing-fast inference on Cerebras wafer-scale chips for large models' },
    { id: 'gemma-4-31b', name: 'Gemma 4 31B', context: '131K', tag: 'vision', desc: 'Google\'s open multimodal model with vision and strong reasoning' },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large 3', context: '256K', tag: 'frontier', desc: 'Mistral\'s most capable model for complex multilingual reasoning tasks' },
    { id: 'codestral-latest', name: 'Codestral', context: '256K', tag: 'coding', desc: 'Purpose-built code generation model with fill-in-the-middle support' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium 3.5', context: '256K', tag: 'writing', vision: true, desc: 'Balanced model excelling at writing, summarization, and creative tasks' },
    { id: 'mistral-small-latest', name: 'Mistral Small 4', context: '256K', tag: 'balanced', desc: 'Cost-effective general-purpose model with strong language understanding' },
    { id: 'open-mixtral-8x7b-fp8', name: 'Mixtral 8x7B FP8', context: '32K', tag: 'free', desc: 'Open-weight MoE model — fast, free-tier friendly, good for experimentation' },
    { id: 'devstral-small-2505', name: 'Devstral Small 2505', context: '32K', tag: 'free', desc: 'Open-weight developer-focused model for code assistance and tool use' },
  ],
  openrouter: [
    { id: 'nvidia/nemotron-3-ultra-550b', name: 'Nemotron 3 Ultra 550B', context: '1M', tag: 'frontier', desc: 'Nvidia\'s largest model — 550B parameters for frontier-class reasoning' },
    { id: 'alibaba/qwen3-coder-480b', name: 'Qwen3 Coder 480B', context: '262K', tag: 'coding', desc: 'Massive coding-specialized model with precise instruction following' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: '128K', tag: 'best', desc: 'Top-tier open-weight model routed through OpenRouter\'s global edge' },
    { id: 'nvidia/nemotron-3-super-120b', name: 'Nemotron 3 Super 120B', context: '1M', tag: 'agent', desc: 'Agent-optimized Nvidia model for multi-step tool use and planning' },
    { id: 'alibaba/qwen3-next-80b', name: 'Qwen3 Next 80B', context: '262K', tag: 'rag', desc: 'Strong retrieval-augmented generation with long-context comprehension' },
    { id: 'poolside/laguna-m1', name: 'Poolside Laguna M.1', context: '262K', tag: 'coding', desc: 'Specialized coding model with frontier-level code generation quality' },
    { id: 'google/gemma-4-31b', name: 'Gemma 4 31B', context: '262K', tag: 'vision', desc: 'Open multimodal model with vision and strong general reasoning' },
    { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', context: '128K', tag: 'agent', vision: true, desc: 'Meta\'s agent-capable model with strong tool use and planning skills' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: '131K', tag: 'fast', desc: 'Lightweight open model for fast, affordable general-purpose tasks' },
    { id: 'inclusion-ai/ling-3.0-flash', name: 'Ling 3.0 Flash', context: '262K', tag: 'chat', desc: 'Conversational model optimized for natural dialogue and Q&A' },
    { id: 'nvidia/nemotron-3-nano-30b', name: 'Nemotron 3 Nano 30B', context: '256K', tag: 'light', desc: 'Compact Nvidia model for quick, low-cost inference at scale' },
    { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', context: '128K', tag: 'chat', desc: 'Meta\'s versatile 70B model — strong at chat, reasoning, and coding' },
    { id: 'google/gemma-3-27b', name: 'Gemma 3 27B', context: '131K', tag: 'balanced', vision: true, desc: 'Google\'s open model balancing capability and efficiency' },
    { id: 'google/gemma-3-12b', name: 'Gemma 3 12B', context: '32K', tag: 'light', vision: true, desc: 'Small, fast open model ideal for lightweight tasks and prototyping' },
  ],
  zai: [
    { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', context: '128K', tag: 'free', desc: 'Z.ai\'s latest fast model with strong Chinese and English bilingual support' },
    { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', context: '128K', tag: 'free', desc: 'Previous-gen fast model — reliable and cost-free for general tasks' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', context: '64K', tag: 'chat', desc: 'General conversational model with strong instruction following' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', context: '64K', tag: 'reason', desc: 'Chain-of-thought model for math, logic, and multi-step problems' },
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', context: '128K', tag: 'chat', desc: 'Hosted Turbo build of Meta\'s 70B model, tuned for fast inference' },
    { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen2.5 72B Turbo', context: '128K', tag: 'best', desc: 'Large Qwen instruct model on Together\'s optimized runtime' },
    { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek R1 32B', context: '32K', tag: 'reason', desc: 'Reasoning-distilled model for step-by-step problem solving' },
    { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B IT', context: '8K', tag: 'balanced', desc: 'Google open instruct model, good all-round quality' },
  ],
  fireworks: [
    { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B', context: '128K', tag: 'chat', desc: 'Meta 70B served on Fireworks\' fast inference stack' },
    { id: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct', name: 'Qwen2.5 Coder 32B', context: '128K', tag: 'coding', desc: 'Code-specialized Qwen for generation and completion' },
    { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', context: '128K', tag: 'reason', desc: 'DeepSeek\'s MoE general model with strong reasoning' },
    { id: 'accounts/fireworks/models/gemma2-9b-it', name: 'Gemma 2 9B', context: '8K', tag: 'light', desc: 'Compact open model for low-latency tasks' },
  ],
  // Verified live against https://router.huggingface.co/v1/models.
  huggingface: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: '131K', tag: 'best', desc: 'Open-weight flagship served through the HF router' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', context: '128K', tag: 'chat', desc: 'Meta\'s versatile 70B instruct model' },
    { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', context: '128K', tag: 'reason', desc: 'DeepSeek MoE with strong reasoning and coding' },
    { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', name: 'Qwen3 Coder 480B', context: '256K', tag: 'coding', desc: 'Large coding-specialized MoE model' },
    { id: 'moonshotai/Kimi-K2.6', name: 'Kimi K2.6', context: '128K', tag: 'agent', desc: 'Moonshot\'s agentic model for tool use and long tasks' },
    { id: 'zai-org/GLM-4.7-Flash', name: 'GLM-4.7 Flash', context: '128K', tag: 'fast', desc: 'Fast GLM variant with bilingual strength' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B', context: '131K', tag: 'balanced', vision: true, desc: 'Google open instruct model' },
    { id: 'microsoft/phi-4', name: 'Phi-4', context: '16K', tag: 'light', desc: 'Microsoft compact model, strong for its size' },
  ],
};

/**
 * Resolve a model's numeric context window from its display string.
 * '131K' → 131_072, '1M' → 1_048_576, '32K' → 32_768, etc.
 * Falls back to 128K (common modern default) if the model is unknown.
 */
export function maxContextForModel(modelId) {
  if (!modelId) return 131_072;
  for (const list of Object.values(PROVIDER_MODELS)) {
    const found = list.find(m => m.id === modelId);
    if (found?.context) return parseContext(found.context);
  }
  return 131_072;
}

function parseContext(str) {
  const match = /^(\d+(?:\.\d+)?)\s*([KM])?$/i.exec(str);
  if (!match) return 131_072;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'K').toUpperCase();
  if (unit === 'M') return Math.round(num * 1_048_576);
  // K values: 128K → 131_072, 131K → 131_072, 32K → 32_768, etc.
  // Use the closest power-of-two when the value is close (128→131072, 256→262144)
  const raw = Math.round(num * 1024);
  // Snap to common context window sizes: 8K, 16K, 32K, 64K, 128K(131072), 200K, 256K(262144)
  const snaps = [8192, 16384, 32768, 65536, 131072, 200000, 262144];
  let closest = snaps[0];
  for (const s of snaps) { if (Math.abs(raw - s) < Math.abs(raw - closest)) closest = s; }
  // Only snap if within 5% — otherwise use the raw calculation
  return Math.abs(raw - closest) / raw < 0.05 ? closest : raw;
}

/** Ids that are not in a curated catalog (hand-typed, or discovered live at
 *  GET /models) but whose name is still a clear promise of image input. */
const VISION_ID_HINTS = [
  'gpt-4o', 'gpt-4.1', 'gemini', 'claude', 'llama-4', 'gemma-3', 'gemma-4',
  'qwen-vl', 'qwen2.5-vl', 'pixtral', 'grok-4', 'internvl', 'llava', 'vision',
];

/**
 * Whether a model can be shown an image.
 *
 * The curated catalog is authoritative when the model is in it; a hand-typed or
 * live-discovered id falls back to name matching, because the alternative —
 * silently dropping the picture — is a worse failure than one provider error.
 */
export function modelSupportsVision(modelId) {
  if (!modelId) return false;
  for (const list of Object.values(PROVIDER_MODELS)) {
    const found = list.find(entry => entry.id === modelId);
    if (found) return found.vision === true || found.tag === 'vision';
  }
  const id = String(modelId).toLowerCase();
  return VISION_ID_HINTS.some(hint => id.includes(hint));
}

/**
 * Whether a provider's request builder forwards OpenAI `content` parts verbatim.
 *
 * Anthropic and Google build their own body shapes and the on-device runtime
 * takes plain strings, so an image can only ride along on an OpenAI-compatible
 * path — anywhere else it has to go as the text description instead.
 */
export function acceptsImageParts(providerId) {
  if (providerId === DEFAULT_PROVIDER || providerId === 'custom') return true;
  return Object.prototype.hasOwnProperty.call(OPENAI_COMPAT_BASES, providerId);
}

/* ── Tag colour map for the UI chip ── */
export const TAG_COLORS = {
  frontier: '#f59e0b', best: '#4ade80', coding: '#38bdf8', agent: '#a78bfa',
  fast: '#22d3ee', vision: '#f472b6', free: '#34d399', balanced: '#94a3b8',
  writing: '#fb923c', chat: '#818cf8', light: '#cbd5e1', rag: '#e879f9',
  reason: '#c084fc',
};

/* ================================================================
 *  Selection helpers — what the model picker binds to.
 * ================================================================ */

/** Label for a provider id, tolerating the legacy/unknown ones. */
export function providerLabel(providerId) {
  return AI_PROVIDERS[providerId]?.label || providerId || 'Unknown';
}

/** Curated model list for a provider. Empty for endpoints that must be queried. */
export function modelsForProvider(providerId) {
  return PROVIDER_MODELS[providerId] || [];
}

/** Get the user's selected model for a provider, falling back to the default. */
export function getSelectedModel(providerId) {
  const map = storage.get('ai-model-selections', {});
  if (map[providerId]) return map[providerId];
  return AI_PROVIDERS[providerId]?.model || '';
}

/** Persist the user's model choice for a provider. */
export function setSelectedModel(providerId, modelId) {
  const map = storage.get('ai-model-selections', {});
  map[providerId] = modelId;
  storage.set('ai-model-selections', map);
}

/** The on-device model to load: the saved pick, else any GGUF already downloaded. */
export function getLocalModel() {
  return getSelectedModel(LOCAL_PROVIDER) || downloadedModels()[0]?.id || '';
}

/** Provider the user last chatted with — free hosted until they switch. */
export function getActiveProvider() {
  const saved = storage.get('ai-provider', '');
  return AI_PROVIDERS[saved] ? saved : DEFAULT_PROVIDER;
}

export function setActiveProvider(providerId) {
  if (AI_PROVIDERS[providerId]) storage.set('ai-provider', providerId);
}

/** Providers to render in a picker. `local` only appears once opted in. */
export function visibleProviders() {
  const list = { ...AI_PROVIDERS };
  if (!localEngineEnabled()) delete list.local;
  return list;
}

/** Whether the user turned on the on-device engine (off by default). */
export function localEngineEnabled() {
  return storage.get('ai-local-enabled', false) === true;
}

export function setLocalEngineEnabled(enabled) {
  storage.set('ai-local-enabled', !!enabled);
}

/* ================================================================
 *  Keys and custom endpoints.
 * ================================================================ */

export function loadKeys() {
  return storage.get('ai-keys', {});
}

export function saveKeys(keys) {
  storage.set('ai-keys', keys);
}

/** Whether a provider can be used right now. */
export function isReady(providerId) {
  if (providerId === DEFAULT_PROVIDER) return true;
  if (providerId === LOCAL_PROVIDER) return !!getLocalModel();
  if (providerId === 'custom') return !!loadKeys().custom && !!getCustomEndpoint().baseUrl;
  return !!loadKeys()[providerId];
}

/** OpenAI-compatible endpoint the user supplies themselves. */
export function getCustomEndpoint() {
  const saved = storage.get('ai-custom-endpoint', null);
  return { baseUrl: saved?.baseUrl || '', model: saved?.model || '' };
}

export function setCustomEndpoint({ baseUrl, model }) {
  const current = getCustomEndpoint();
  storage.set('ai-custom-endpoint', {
    baseUrl: baseUrl === undefined ? current.baseUrl : String(baseUrl).trim().replace(/\/+$/, ''),
    model: model === undefined ? current.model : String(model).trim(),
  });
}

/**
 * Base URL for an OpenAI-compatible call, validated so a malformed custom
 * endpoint fails here with a clear message rather than as an opaque network
 * error later.
 */
function resolveBaseUrl(providerId) {
  if (providerId === 'custom') {
    const { baseUrl } = getCustomEndpoint();
    if (!baseUrl) throw new Error('No custom endpoint URL configured');
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('Custom endpoint URL is not valid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Custom endpoint must be http(s)');
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  }
  const base = OPENAI_COMPAT_BASES[providerId];
  if (!base) throw new Error(`Unknown provider: ${providerId}`);
  return base;
}

/* ================================================================
 *  Completions.
 * ================================================================ */

/** Split a message list into the system prompt and the conversation turns,
 *  which is the shape Anthropic and Google want. */
function splitMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const turns = messages.filter(m => m.role !== 'system');
  return { system, turns };
}

/** One OpenAI-compatible call, streaming or not depending on `onToken`. */
async function openaiCompletion(providerId, messages, { model, temperature, maxTokens, signal, onToken, thinkingBudget }) {
  const baseUrl = resolveBaseUrl(providerId);
  const key = loadKeys()[providerId];
  if (!key) throw new Error(`No API key saved for ${providerLabel(providerId)}`);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (providerId === 'openrouter') {
    headers['X-Title'] = 'Lithium';
  }

  const streaming = typeof onToken === 'function';
  const body = { model, messages, temperature: temperature ?? 0.7, stream: streaming };
  if (maxTokens) body.max_tokens = maxTokens;
  // Thinking budget: forwarded as max_completion_tokens for reasoning-capable models.
  if (thinkingBudget && thinkingBudget > 0) body.max_completion_tokens = thinkingBudget;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', signal, headers, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${providerLabel(providerId)}: ${await errorText(response)}`);

  if (streaming) return readSSEStream(response, onToken, extractOpenAIDelta);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Anthropic Messages API — different auth headers and a split system prompt. */
async function anthropicCompletion(messages, { model, temperature, maxTokens, signal, onToken }) {
  const key = loadKeys().anthropic;
  if (!key) throw new Error('No API key saved for Anthropic');
  const { system, turns } = splitMessages(messages);
  const streaming = typeof onToken === 'function';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || (streaming ? 4096 : 1024),
      temperature: temperature ?? 1.0,
      stream: streaming || undefined,
      system: system || undefined,
      messages: turns,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic: ${await errorText(response)}`);

  if (streaming) {
    return readSSEStream(response, onToken, line => {
      if (!line.startsWith('data: ')) return null;
      try {
        const json = JSON.parse(line.slice(6).trim());
        return json.type === 'content_block_delta' ? json.delta?.text || null : null;
      } catch { return null; }
    });
  }
  const data = await response.json();
  return (data.content || []).map(block => block.text || '').join('');
}

/** Google Generative Language API — different body shape and SSE payload. */
async function googleCompletion(messages, { model, temperature, maxTokens, signal, onToken }) {
  const key = loadKeys().google;
  if (!key) throw new Error('No API key saved for Google');
  const { system, turns } = splitMessages(messages);
  const streaming = typeof onToken === 'function';

  const verb = streaming ? 'streamGenerateContent?alt=sse&key=' : 'generateContent?key=';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:${verb}${encodeURIComponent(key)}`,
    {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: turns.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: temperature ?? 0.7,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Google: ${await errorText(response)}`);

  if (streaming) {
    return readSSEStream(response, onToken, line => {
      if (!line.startsWith('data: ')) return null;
      try {
        const json = JSON.parse(line.slice(6).trim());
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch { return null; }
    });
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
}

/**
 * Single implementation behind both public entry points.
 *
 * `onToken` present → streamed; absent → one-shot. Passing an explicit
 * `model` overrides the saved selection, which lets a caller drive several
 * providers from one screen.
 *
 * `onUsage(receipt)` is a Lite-tier thing: only the hosted proxy meters a caller
 * (by tokens, priced against the upstream's published rates), so the other
 * providers — billed by whoever issued the key — simply never call it.
 */
async function complete(provider, messages, { signal, model, temperature, maxTokens, onToken, onUsage, onReasoning, thinkingBudget } = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('No messages to send');
  const providerId = provider || DEFAULT_PROVIDER;
  const modelName = model || getSelectedModel(providerId)
    || (providerId === LOCAL_PROVIDER ? getLocalModel() : AI_PROVIDERS[providerId]?.model);

  if (providerId === DEFAULT_PROVIDER) {
    const options = { model: modelName, temperature, maxTokens, signal, onUsage, onReasoning, thinkingBudget };
    // li-server wraps the upstream reply; both helpers unwrap it to plain text.
    return onToken ? liChatStream(messages, { ...options, onToken }) : liChat(messages, options);
  }

  if (providerId === LOCAL_PROVIDER) {
    // Dynamic import keeps the wllama worker out of the initial bundle: the
    // on-device engine is opt-in and only paid for when actually used.
    const { ensureRuntime, localChat } = await import('./modelRuntime');
    await ensureRuntime(modelName);
    return localChat(messages, { onToken, signal, maxTokens });
  }

  if (providerId === 'anthropic') {
    return anthropicCompletion(messages, { model: modelName, temperature, maxTokens, signal, onToken });
  }
  if (providerId === 'google') {
    return googleCompletion(messages, { model: modelName, temperature, maxTokens, signal, onToken });
  }
  return openaiCompletion(providerId, messages, { model: modelName, temperature, maxTokens, signal, onToken, thinkingBudget });
}

/**
 * messages: [{ role: 'system'|'user'|'assistant', content }] → assistant text.
 * options.model overrides the provider's default model.
 */
export async function chatCompletion(provider, messages, { signal, model, temperature, maxTokens, onUsage, thinkingBudget } = {}) {
  return complete(provider, messages, { signal, model, temperature, maxTokens, onUsage, thinkingBudget });
}

/** Streaming completion — calls onToken(chunk, fullText) as data arrives.
 *  onReasoning(chunk, fullReasoning) fires for reasoning_content deltas. */
export async function streamChatCompletion(provider, messages, { signal, model, onToken, onUsage, onReasoning, thinkingBudget } = {}) {
  return complete(provider, messages, { signal, model, onToken, onUsage, onReasoning, thinkingBudget });
}

/* ================================================================
 *  Live discovery and connectivity tests.
 * ================================================================ */

/**
 * Fetch a provider's real catalog from its GET /models endpoint, falling back
 * to the curated list. OpenRouter and the HF router answer without a key, so
 * their catalogs are complete before the user connects anything.
 */
export async function fetchProviderModels(providerId, { signal } = {}) {
  const fallback = modelsForProvider(providerId);
  if (providerId === LOCAL_PROVIDER || providerId === DEFAULT_PROVIDER) return fallback;

  let url; let headers = {};
  try {
    if (providerId === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models';
      headers = {
        'x-api-key': loadKeys().anthropic || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    } else if (providerId === 'google') {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(loadKeys().google || '')}`;
    } else {
      url = `${resolveBaseUrl(providerId)}/models`;
      const key = loadKeys()[providerId];
      if (key) headers.Authorization = `Bearer ${key}`;
    }
  } catch {
    return fallback;
  }

  try {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) return fallback;
    const data = await response.json();
    const raw = Array.isArray(data) ? data : data.data || data.models || [];
    const ids = raw.map(entry => (typeof entry === 'string' ? entry : entry.id || entry.name)).filter(Boolean);
    if (!ids.length) return fallback;

    const known = new Map(fallback.map(m => [m.id, m]));
    return ids.map(id => known.get(id) || { id, name: id.split('/').pop(), context: '', tag: '' });
  } catch {
    return fallback;
  }
}

/**
 * Check that a provider actually works, without generating text.
 * Resolves with a human-readable confirmation, throws otherwise.
 */
export async function testConnection(providerId, { signal } = {}) {
  if (providerId === DEFAULT_PROVIDER) {
    const credits = await liCredits({ signal });
    const { remaining, limit, kind } = credits.balance;
    return `${remaining} of ${limit} ${kind === 'user' ? 'daily' : 'weekly'} credits available`;
  }
  if (providerId === LOCAL_PROVIDER) {
    const model = getLocalModel();
    if (!model) throw new Error('No model downloaded yet');
    const { loadedModelId, ensureRuntime } = await import('./modelRuntime');
    if (loadedModelId() !== model) await ensureRuntime(model);
    return `On-device model ready (${model})`;
  }
  if (!isReady(providerId)) throw new Error(`No API key saved for ${providerLabel(providerId)}`);

  const models = await fetchProviderModels(providerId, { signal });
  if (!models.length) throw new Error(`${providerLabel(providerId)} returned no models`);
  return `${providerLabel(providerId)} reachable — ${models.length} models available`;
}
