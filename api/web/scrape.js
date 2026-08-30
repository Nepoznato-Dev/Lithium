/**
 * Vercel serverless scrape — mirrors the Python backend's /api/web/scrape.
 * Fetches a page and returns cleaned text content.
 */
import { safeGet } from '../lib/urlGuard.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', '*')
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, max_chars = 12000 } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const safeMaxChars = Math.min(Math.max(1000, Number(max_chars) || 12000), 30000);

  try {
    const response = await safeGet(url, {
      headers: { 'User-Agent': BROWSER_UA },
    });

    const html = await response.text();
    const text = clean(html.replace(/<(script|style|noscript)[^>]*>.*?<\/\1>/gi, ' '));

    const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(html);
    const title = titleMatch ? clean(titleMatch[1]) : url;

    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({
        url: response.url || url,
        title,
        content: text.slice(0, safeMaxChars),
      });
  } catch (err) {
    const message = err.message || 'Scrape failed';
    if (message.includes('not allowed') || message.includes('could not be resolved') || message.includes('Invalid URL')) {
      return res.status(400).json({ error: message });
    }
    return res.status(502).json({ error: message });
  }
}
