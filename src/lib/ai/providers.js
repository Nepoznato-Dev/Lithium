import { storage } from '../storage/localStorage';
import { backendChat } from '../backendApi';

/**
 * Unified chat-completion adapters for cloud providers.
 * Keys are stored locally only (lithium:ai-keys) and sent straight to the
 * provider from the browser (all of these support CORS; Anthropic requires
 * the dangerous-direct-browser-access header by design).
 */

export const AI_PROVIDERS = {
  builtin: { label: 'On-device engine', needsKey: false, model: 'built-in reports' },
  backend: { label: 'Lithium backend (Python)', needsKey: false, model: 'managed server-side' },
  groq: { label: 'Groq', needsKey: true, model: 'llama-3.3-70b-versatile' },
  openai: { label: 'OpenAI', needsKey: true, model: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', needsKey: true, model: 'claude-3-5-haiku-latest' },
  google: { label: 'Google', needsKey: true, model: 'gemini-2.0-flash' },
  xai: { label: 'Grok (xAI)', needsKey: true, model: 'grok-3-mini' },
};

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

/** messages: [{ role: 'system'|'user'|'assistant', content }] → assistant text */
export async function chatCompletion(provider, messages, { signal } = {}) {
  if (provider === 'backend') {
    // Python backend picks the model; forward saved keys so it can proxy cloud providers.
    const reply = await backendChat(messages, { keys: loadKeys(), signal });
    return reply.content || '';
  }

  const key = loadKeys()[provider];
  if (provider !== 'builtin' && !key) throw new Error(`No API key saved for ${AI_PROVIDERS[provider]?.label}`);

  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const turns = messages.filter(message => message.role !== 'system');

  if (provider === 'groq' || provider === 'openai' || provider === 'xai') {
    const base = provider === 'groq'
      ? 'https://api.groq.com/openai/v1'
      : provider === 'xai'
        ? 'https://api.x.ai/v1'
        : 'https://api.openai.com/v1';
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: AI_PROVIDERS[provider].model, messages, temperature: 0.7 }),
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
        model: AI_PROVIDERS.anthropic.model,
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
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_PROVIDERS.google.model}:generateContent?key=${encodeURIComponent(key)}`,
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
