import { storage } from '../storage/localStorage';
import { backendChat } from '../backendApi';

/**
 * Unified chat-completion adapters for cloud providers.
 * Keys are stored locally only (lithium:ai-keys) and sent straight to the
 * provider from the browser (all of these support CORS; Anthropic requires
 * the dangerous-direct-browser-access header by design).
 *
 * Free-tier Groq: when VITE_GROQ_FREE_KEY is set at build time (Vercel production),
 * a "Free" provider appears that routes through Groq using the embedded key.
 * In development / GitHub builds, users supply their own Groq key under Connections.
 */

/** Embedded Groq API key for the free tier (Vercel production only). */
const GROQ_FREE_KEY = import.meta.env.VITE_GROQ_FREE_KEY || '';

/** Resolve the Groq API key: user-saved key first, then embedded free key. */
export function getGroqKey() {
  const userKey = loadKeys().groq;
  if (userKey) return userKey;
  if (GROQ_FREE_KEY) return GROQ_FREE_KEY;
  return '';
}

/** Whether the free Groq tier is available (embedded key present at build time). */
export const hasFreeGroq = () => !!GROQ_FREE_KEY;

export const AI_PROVIDERS = {
  builtin: { label: 'On-device engine', needsKey: false, model: 'built-in reports' },
  backend: { label: 'Lithium backend (Python)', needsKey: false, model: 'managed server-side' },
  free: { label: 'Free (Groq)', needsKey: false, model: 'openai/gpt-oss-120b', _groq: true },
  groq: { label: 'Groq', needsKey: true, model: 'openai/gpt-oss-120b' },
  openai: { label: 'OpenAI', needsKey: true, model: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', needsKey: true, model: 'claude-3-5-haiku-latest' },
  google: { label: 'Google', needsKey: true, model: 'gemini-2.0-flash' },
  xai: { label: 'Grok (xAI)', needsKey: true, model: 'grok-3-mini' },
  cerebras: { label: 'Cerebras', needsKey: true, model: 'gpt-oss-120b' },
  mistral: { label: 'Mistral', needsKey: true, model: 'mistral-small-latest' },
  openrouter: { label: 'OpenRouter', needsKey: true, model: 'openai/gpt-oss-120b' },
  zai: { label: 'Z.ai', needsKey: true, model: 'glm-4.7-flash' },
};

/* ── Per-provider model catalogs ──
   Each entry: { id, name, context, tag? }
   tag is a short label like 'free', 'fast', 'coding', 'frontier' for the UI chip. */

export const PROVIDER_MODELS = {
  groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: '131K', tag: 'best', desc: 'Top-tier open-weight model with exceptional reasoning and agentic reliability' },
    { id: 'groq/compound', name: 'Groq Compound', context: '131K', tag: 'agent', desc: 'Multi-model orchestration system for complex autonomous task execution' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: '131K', tag: 'fast', desc: 'Lightweight open-weight model optimized for speed on Groq hardware' },
    { id: 'groq/compound-mini', name: 'Compound Mini', context: '131K', tag: 'light', desc: 'Compact compound system for quick, cost-effective task completion' },
    { id: 'qwen/qwen3.6-27b', name: 'Qwen3.6-27B', context: '131K', tag: 'vision', desc: 'Native multimodal model with deep image and document understanding' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', context: '128K', tag: 'frontier', desc: 'Flagship omnimodal model with native audio, vision, and text reasoning' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: '128K', tag: 'fast', desc: 'Cost-efficient small model with strong general intelligence' },
    { id: 'gpt-4.1', name: 'GPT-4.1', context: '1M', tag: 'coding', desc: 'Purpose-built for long-context coding with precise instruction following' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', context: '1M', tag: 'balanced', desc: 'Balanced coding and reasoning at lower cost with 1M context' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', context: '1M', tag: 'light', desc: 'Ultra-fast, cheapest option for lightweight tasks and classification' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', context: '200K', tag: 'best', desc: 'Latest Sonnet with superior coding, reasoning, and agentic capabilities' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', context: '200K', tag: 'fast', desc: 'Fastest Anthropic model for quick responses and high-throughput tasks' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', context: '200K', tag: 'balanced', desc: 'Excellent balance of intelligence, speed, and cost for general use' },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', context: '200K', tag: 'frontier', desc: 'Most powerful Claude for complex analysis, research, and deep reasoning' },
  ],
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M', tag: 'best', desc: 'Next-gen model with thinking capabilities and exceptional speed' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '1M', tag: 'frontier', desc: 'Google\'s most capable model with advanced reasoning and 1M context' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: '1M', tag: 'fast', desc: 'Fast multimodal model with native image, audio, and video understanding' },
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
    { id: 'mistral-medium-latest', name: 'Mistral Medium 3.5', context: '256K', tag: 'writing', desc: 'Balanced model excelling at writing, summarization, and creative tasks' },
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
    { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', context: '128K', tag: 'agent', desc: 'Meta\'s agent-capable model with strong tool use and planning skills' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: '131K', tag: 'fast', desc: 'Lightweight open model for fast, affordable general-purpose tasks' },
    { id: 'inclusion-ai/ling-3.0-flash', name: 'Ling 3.0 Flash', context: '262K', tag: 'chat', desc: 'Conversational model optimized for natural dialogue and Q&A' },
    { id: 'nvidia/nemotron-3-nano-30b', name: 'Nemotron 3 Nano 30B', context: '256K', tag: 'light', desc: 'Compact Nvidia model for quick, low-cost inference at scale' },
    { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', context: '128K', tag: 'chat', desc: 'Meta\'s versatile 70B model — strong at chat, reasoning, and coding' },
    { id: 'google/gemma-3-27b', name: 'Gemma 3 27B', context: '131K', tag: 'balanced', desc: 'Google\'s open model balancing capability and efficiency' },
    { id: 'google/gemma-3-12b', name: 'Gemma 3 12B', context: '32K', tag: 'light', desc: 'Small, fast open model ideal for lightweight tasks and prototyping' },
  ],
  zai: [
    { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', context: '128K', tag: 'free', desc: 'Z.ai\'s latest fast model with strong Chinese and English bilingual support' },
    { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', context: '128K', tag: 'free', desc: 'Previous-gen fast model — reliable and cost-free for general tasks' },
  ],
};

/* ── Tag colour map for the UI chip ─ */
export const TAG_COLORS = {
  frontier: '#f59e0b', best: '#4ade80', coding: '#38bdf8', agent: '#a78bfa',
  fast: '#22d3ee', vision: '#f472b6', free: '#34d399', balanced: '#94a3b8',
  writing: '#fb923c', chat: '#818cf8', light: '#cbd5e1', rag: '#e879f9',
};

/* ── Tier → best model per provider ──
   When the user picks a tier (Lite / Efficient / Performance / Ultra),
   the system auto-selects the best model for their current provider.
   Models chosen from the user's ranked table of free-tier models. */

export const TIER_MODELS = {
  auto: {
    openrouter: 'openai/gpt-oss-20b',
    openai:     'gpt-4o-mini',
    anthropic:  'claude-3-5-haiku-latest',
    google:     'gemini-2.0-flash',
    groq:       'openai/gpt-oss-20b',
    free:       'openai/gpt-oss-20b',
    cerebras:   'gemma-4-31b',
    mistral:    'mistral-medium-latest',
    xai:        'grok-3-mini',
    zai:        'glm-4.7-flash',
  },
  ultra: {
    openrouter: 'nvidia/nemotron-3-ultra-550b',
    openai:     'gpt-4o',
    anthropic:  'claude-sonnet-4-20250514',
    google:     'gemini-2.5-pro',
    groq:       'openai/gpt-oss-120b',
    free:       'openai/gpt-oss-120b',
    cerebras:   'gpt-oss-120b',
    mistral:    'mistral-large-latest',
    xai:        'grok-3',
    zai:        'glm-4.7-flash',
  },
  performance: {
    openrouter: 'alibaba/qwen3-next-80b',
    openai:     'gpt-4.1',
    anthropic:  'claude-3-5-sonnet-latest',
    google:     'gemini-2.5-flash',
    groq:       'groq/compound',
    free:       'groq/compound',
    cerebras:   'gemma-4-31b',
    mistral:    'codestral-latest',
    xai:        'grok-3-mini',
    zai:        'glm-4.7-flash',
  },
  efficient: {
    openrouter: 'openai/gpt-oss-20b',
    openai:     'gpt-4o-mini',
    anthropic:  'claude-3-5-haiku-latest',
    google:     'gemini-2.0-flash',
    groq:       'openai/gpt-oss-20b',
    free:       'openai/gpt-oss-20b',
    cerebras:   'gemma-4-31b',
    mistral:    'mistral-medium-latest',
    xai:        'grok-3-mini',
    zai:        'glm-4.7-flash',
  },
  lite: {
    openrouter: 'nvidia/nemotron-3-nano-30b',
    openai:     'gpt-4.1-nano',
    anthropic:  'claude-3-5-haiku-latest',
    google:     'gemini-2.0-flash',
    groq:       'groq/compound-mini',
    free:       'groq/compound-mini',
    cerebras:   'gpt-oss-120b',
    mistral:    'mistral-small-latest',
    xai:        'grok-3-mini',
    zai:        'glm-4.5-flash',
  },
};

/** Return the best model ID for a given tier + provider. Falls back to provider default. */
export function getBestModelForTier(tierId, providerId) {
  return TIER_MODELS[tierId]?.[providerId] || AI_PROVIDERS[providerId]?.model || '';
}

/** Return the model list for a provider (empty array for builtin/backend). 'free' aliases groq models. */
export function modelsForProvider(providerId) {
  return PROVIDER_MODELS[providerId === 'free' ? 'groq' : providerId] || [];
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

/** Return providers visible in the UI selector (excludes internal 'backend'; includes 'free' only when embedded key is available). */
export function visibleProviders() {
  const { backend, ...rest } = AI_PROVIDERS;
  // Hide 'free' if no embedded key (dev / GitHub builds)
  if (!hasFreeGroq()) {
    const { free, ...withoutFree } = rest;
    return withoutFree;
  }
  return rest;
}

export function loadKeys() {
  return storage.get('ai-keys', {});
}

export function saveKeys(keys) {
  storage.set('ai-keys', keys);
}

async function errorText(response) {
  try {
    const body = await response.json();
    return body.error?.message || body.error || JSON.stringify(body).slice(0, 200);
  } catch {
    return `HTTP ${response.status}`;
  }
}

/* ── SSE streaming helpers ── */

/** Parse an SSE stream and call onToken(text) for each content chunk.
 *  Returns the concatenated full text. */
async function readSSEStream(response, onToken, extract) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      const text = extract(line);
      if (text) { full += text; onToken(text, full); }
    }
  }
  // flush remaining buffer
  if (buffer.trim()) {
    const text = extract(buffer);
    if (text) { full += text; onToken(text, full); }
  }
  return full;
}

/** Extract content from an OpenAI-compatible SSE data line. */
function extractOpenAIDelta(line) {
  if (!line.startsWith('data: ')) return null;
  const payload = line.slice(6).trim();
  if (payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    return json.choices?.[0]?.delta?.content || null;
  } catch { return null; }
}

/** Extract content from an Anthropic SSE stream. */
function extractAnthropicDelta(line) {
  if (!line.startsWith('data: ')) return null;
  try {
    const json = JSON.parse(line.slice(6).trim());
    if (json.type === 'content_block_delta') return json.delta?.text || null;
    return null;
  } catch { return null; }
}

/** Extract content from a Google SSE stream. */
function extractGoogleDelta(line) {
  if (!line.startsWith('data: ')) return null;
  try {
    const json = JSON.parse(line.slice(6).trim());
    return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

/** Streaming chat completion — calls onToken(chunk, fullText) as data arrives.
 *  Falls back to non-streaming chatCompletion on failure. */
export async function streamChatCompletion(provider, messages, { signal, model, onToken } = {}) {
  // Builtin / backend don't stream
  if (provider === 'builtin' || provider === 'backend') {
    const text = await chatCompletion(provider, messages, { signal, model });
    onToken?.(text, text);
    return text;
  }

  // 'free' provider uses embedded Groq key (no user key needed)
  const key = provider === 'free' ? getGroqKey() : loadKeys()[provider];
  if (!key) throw new Error(`No API key saved for ${AI_PROVIDERS[provider]?.label}`);
  // 'free' routes through Groq API
  const effectiveProvider = provider === 'free' ? 'groq' : provider;
  const modelName = model || getSelectedModel(provider) || AI_PROVIDERS[provider]?.model;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const turns = messages.filter(m => m.role !== 'system');

  try {
    // OpenAI-compatible providers
    if (['groq', 'free', 'openai', 'xai', 'cerebras', 'mistral', 'openrouter', 'zai'].includes(effectiveProvider)) {
      const baseUrls = {
        groq: 'https://api.groq.com/openai/v1',
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        cerebras: 'https://api.cerebras.ai/v1',
        mistral: 'https://api.mistral.ai/v1',
        openrouter: 'https://openrouter.ai/api/v1',
        zai: 'https://api.z.ai/api/paas/v4',
      };
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      if (effectiveProvider === 'openrouter') headers['X-Title'] = 'Lithium';
      const response = await fetch(`${baseUrls[effectiveProvider]}/chat/completions`, {
        method: 'POST', signal, headers,
        body: JSON.stringify({ model: modelName, messages, temperature: 0.7, stream: true }),
      });
      if (!response.ok) throw new Error(`${AI_PROVIDERS[provider].label}: ${await errorText(response)}`);
      return await readSSEStream(response, onToken, extractOpenAIDelta);
    }

    // Anthropic
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelName, max_tokens: 4096, stream: true,
          system: system || undefined, messages: turns,
        }),
      });
      if (!response.ok) throw new Error(`Anthropic: ${await errorText(response)}`);
      return await readSSEStream(response, onToken, extractAnthropicDelta);
    }

    // Google
    if (provider === 'google') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            contents: turns.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          }),
        }
      );
      if (!response.ok) throw new Error(`Google: ${await errorText(response)}`);
      return await readSSEStream(response, onToken, extractGoogleDelta);
    }

    throw new Error('Unknown provider');
  } catch (err) {
    // If streaming fails before any tokens, fall back to non-streaming
    throw err;
  }
}

/** messages: [{ role: 'system'|'user'|'assistant', content }] → assistant text
 *  options.model overrides the provider's default model. */
export async function chatCompletion(provider, messages, { signal, model } = {}) {
  if (provider === 'backend') {
    const reply = await backendChat(messages, { keys: loadKeys(), signal });
    return reply.content || '';
  }

  // 'free' provider uses embedded Groq key (no user key needed)
  const key = provider === 'free' ? getGroqKey() : loadKeys()[provider];
  if (provider !== 'builtin' && provider !== 'free' && !key) throw new Error(`No API key saved for ${AI_PROVIDERS[provider]?.label}`);
  if (provider === 'free' && !key) throw new Error('Free Groq tier unavailable — no embedded key configured.');

  // Resolve which model to use: explicit override → saved selection → provider default
  const modelName = model || getSelectedModel(provider) || AI_PROVIDERS[provider]?.model;

  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const turns = messages.filter(message => message.role !== 'system');

  // 'free' routes through Groq API
  const effectiveProvider = provider === 'free' ? 'groq' : provider;

  if (effectiveProvider === 'groq' || effectiveProvider === 'openai' || effectiveProvider === 'xai' || effectiveProvider === 'cerebras' || effectiveProvider === 'mistral' || effectiveProvider === 'openrouter' || effectiveProvider === 'zai') {
    const baseUrls = {
      groq: 'https://api.groq.com/openai/v1',
      openai: 'https://api.openai.com/v1',
      xai: 'https://api.x.ai/v1',
      cerebras: 'https://api.cerebras.ai/v1',
      mistral: 'https://api.mistral.ai/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      zai: 'https://api.z.ai/api/paas/v4',
    };
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    if (effectiveProvider === 'openrouter') headers['X-Title'] = 'Lithium';
    const response = await fetch(`${baseUrls[effectiveProvider]}/chat/completions`, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({ model: modelName, messages, temperature: 0.7 }),
    });
    if (!response.ok) throw new Error(`${AI_PROVIDERS[provider].label}: ${await errorText(response)}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1024,
        system: system || undefined,
        messages: turns,
      }),
    });
    if (!response.ok) throw new Error(`Anthropic: ${await errorText(response)}`);
    const data = await response.json();
    return (data.content || []).map(block => block.text || '').join('');
  }

  if (provider === 'google') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: turns.map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
        }),
      }
    );
    if (!response.ok) throw new Error(`Google: ${await errorText(response)}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  }

  throw new Error('Unknown provider');
}
