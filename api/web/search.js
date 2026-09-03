/**
 * Vercel serverless search — mirrors the Python backend's /api/web/search.
 * Searches DuckDuckGo HTML and returns normalized results.
 */
import { corsOrigin } from '../lib/cors.js';
import { rateLimit, clientIp } from '../lib/rateLimit.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_QUERY = 500;

export const config = { runtime: 'nodejs' };

function clean(value) {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(value) {
  try {
    const decoded = decodeURIComponent(String(value));
    const parsed = new URL(decoded.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return decoded;
  } catch {
    return null;
  }
}

function normalizeResults(items, limit) {
  const results = [];
  const seen = new Set();
  for (const item of items) {
    const url = safeUrl(item.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: clean(item.title || '').slice(0, 240),
      url,
      snippet: clean(item.snippet || '').slice(0, 600),
    });
    if (results.length >= limit) break;
  }
  return results;
}

export default async function handler(req, res) {
  const origin = corsOrigin(req);
  // CORS preflight
  if (req.method === 'OPTIONS') {
    if (!origin) return res.status(403).json({ error: 'Origin not allowed' });
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', origin)
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  if (!rateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { query, limit = 5 } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const trimmed = query.trim().slice(0, MAX_QUERY);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 10);

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(ddgUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(502).json({ error: `DuckDuckGo search failed: ${response.status}` });
    }

    const html = await response.text();
    const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>(.*?)(?=<a[^>]+class="result__a"|<\/body>)/gi;

    const parsedResults = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const rawUrl = match[1].replace(/&amp;/g, '&');
      let url = rawUrl;
      // DDG wraps URLs in a redirect — extract the actual URL
      try {
        const parsed = new URL(rawUrl);
        const uddg = parsed.searchParams.get('uddg');
        if (uddg) url = decodeURIComponent(uddg);
      } catch { /* use raw URL */ }
      parsedResults.push({ title: match[2], url, snippet: match[3] });
    }

    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    return res.status(200).json({
        query: trimmed,
        provider: 'duckduckgo',
        results: normalizeResults(parsedResults, safeLimit),
      });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Search failed' });
  }
}
