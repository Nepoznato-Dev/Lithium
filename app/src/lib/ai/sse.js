/**
 * Server-sent-events reading shared by every streaming AI path.
 *
 * Lives on its own because both `providers.js` (direct provider calls) and
 * `backendApi.js` (the Lithium-hosted Lite proxy) need the exact same chunked
 * `data:` parsing — and putting it in either of those would create an import
 * cycle, since providers.js already depends on backendApi.js.
 */

/**
 * Read an SSE response body, calling `onToken(chunk, fullText)` per delta.
 * `extract(line)` returns the text for a `data:` line, or null to skip it.
 * Resolves with the concatenated full text.
 */
export async function readSSEStream(response, onToken, extract) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  const consume = line => {
    const text = extract(line);
    if (text) {
      full += text;
      onToken?.(text, full);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Keep the trailing partial line — a chunk can split a `data:` payload.
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) consume(line);
  }

  // Flush whatever the final chunk left behind.
  if (buffer.trim()) consume(buffer);
  return full;
}

/** Pull assistant text out of an OpenAI-compatible SSE `data:` line. */
export function extractOpenAIDelta(line) {
  if (!line.startsWith('data: ')) return null;
  const payload = line.slice(6).trim();
  if (payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    return json.choices?.[0]?.delta?.content || null;
  } catch { return null; }
}

/**
 * Pull reasoning/thinking text out of a provider's SSE delta.
 *
 * gpt-oss models on Groq emit `delta.reasoning_content` before (and separate
 * from) `delta.content`. Surfacing it gives the UI a collapsible "thinking"
 * section so the user sees what the model considered before answering.
 */
export function extractReasoningDelta(line) {
  if (!line.startsWith('data: {') || !line.includes('reasoning_content')) return null;
  try {
    return JSON.parse(line.slice(6).trim()).choices?.[0]?.delta?.reasoning_content || null;
  } catch { return null; }
}

/**
 * Pull the credit receipt out of the Lithium Lite proxy's closing frame.
 *
 * The proxy answers like any OpenAI-compatible endpoint and then adds one last
 * `data: {"lithium_usage":{…}}` after its own `[DONE]`, carrying what the reply
 * cost in credits and tokens. It is read here rather than in
 * `extractOpenAIDelta` because it is this server's frame, not part of the
 * OpenAI protocol, and because the substring test keeps the cost off every
 * ordinary delta on the hot path.
 */
export function extractLithiumUsage(line) {
  if (!line.startsWith('data: {') || !line.includes('"lithium_usage"')) return null;
  try {
    return JSON.parse(line.slice(6).trim()).lithium_usage || null;
  } catch { return null; }
}

/**
 * Stateful accumulator for streaming tool calls.
 *
 * The OpenAI SSE protocol sends `delta.tool_calls` fragments across multiple
 * chunks: the first chunk carries the id and function name, subsequent chunks
 * carry argument fragments that must be concatenated by index. This factory
 * collects them into the complete tool-call list.
 *
 * @returns {{ process(line: string): void, calls: Array, hasCalls: boolean }}
 */
export function createToolCallAccumulator() {
  const calls = [];       // [{id, type, function: {name, arguments}}]
  const byIndex = new Map(); // stream-index → position in calls[]

  return {
    /** Feed one SSE line; silently skips non-tool-call frames. */
    process(line) {
      if (!line.startsWith('data: {') || !line.includes('tool_calls')) return;
      try {
        const delta = JSON.parse(line.slice(6).trim()).choices?.[0]?.delta?.tool_calls;
        if (!Array.isArray(delta)) return;
        for (const frag of delta) {
          const idx = frag.index ?? 0;
          if (!byIndex.has(idx)) {
            byIndex.set(idx, calls.length);
            calls.push({
              id: frag.id || '',
              type: frag.type || 'function',
              function: { name: frag.function?.name || '', arguments: '' },
            });
          }
          const call = calls[byIndex.get(idx)];
          if (frag.id) call.id = frag.id;
          if (frag.function?.name) call.function.name = frag.function.name;
          if (frag.function?.arguments) call.function.arguments += frag.function.arguments;
        }
      } catch { /* skip unparseable fragments */ }
    },
    /** The accumulated tool calls after the stream has closed. */
    get calls() { return calls; },
    /** True when the model requested at least one tool call. */
    get hasCalls() { return calls.length > 0; },
  };
}

/** Human-readable reason from a failed provider/proxy response. */
export async function errorText(response) {
  try {
    const body = await response.json();
    return body.error?.message || body.error || body.detail || JSON.stringify(body).slice(0, 200);
  } catch {
    return `HTTP ${response.status}`;
  }
}
