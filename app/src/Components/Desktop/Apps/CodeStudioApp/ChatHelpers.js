import { stripToolBlocks } from '../../../../lib/ai/agent';
import { renderMarkdown } from '../../../../lib/markdown';

// Tolerant tool-call extractor: accepts fenced ```api/```json blocks OR bare JSON,
// and either "api" or "action" as the key. Dedupes identical calls.
export function extractCodeCalls(text) {
  const calls = []; const seen = new Set();
  const consider = obj => {
    if (!obj || typeof obj !== 'object') return;
    const list = Array.isArray(obj) ? obj : [obj];
    for (const item of list) {
      const api = item && (item.api || item.action);
      if (typeof api !== 'string' || !api.startsWith('code.')) continue;
      const params = item.params && typeof item.params === 'object' ? item.params : {};
      const key = api + JSON.stringify(params);
      if (seen.has(key)) continue; seen.add(key);
      calls.push({ api, params });
    }
  };
  const src = text || '';
  let i = 0;
  while ((i = src.indexOf('{', i)) !== -1) {
    let depth = 0; let j = i;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
    if (depth !== 0) break;
    try { consider(JSON.parse(src.slice(i, j + 1))); } catch { /* not JSON */ }
    i = j + 1;
  }
  return calls;
}

// Prepare an assistant reply for display: drop tool blocks (balanced or run-away),
// collapse a fully duplicated answer (small on-device models sometimes repeat).
export function cleanAssistant(text) {
  let t = (stripToolBlocks(text) || '');
  t = t.replace(/```(?:api|json|tool)[^\n]*\n[\s\S]*?(?:```|$)/g, '');
  t = t.trim();
  // Collapse a repeated answer even when the echo lost its markdown formatting.
  const norm = s => s.replace(/[-*`>#_]/g, '').replace(/\s+/g, ' ').trim();
  const half = Math.floor(t.length / 2);
  for (let cut = half; cut < Math.min(t.length, half + 80); cut++) {
    const a = t.slice(0, cut); const b = t.slice(cut);
    if (a && b && norm(a) === norm(b)) { t = a.trim(); break; }
  }
  return t;
}

// renderMarkdown can choke on odd model output — fall back to escaped text.
export function safeMarkdown(text) {
  try { return renderMarkdown(text); } catch { return `<pre class="md-pre">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`; }
}
