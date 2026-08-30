/**
 * Vercel serverless proxy — mirrors the Python backend's /api/web/proxy.
 * Fetches any public URL, strips CSP headers/meta tags, and returns with CORS.
 */
import { safeGet } from '../lib/urlGuard.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const STRIP_HEADERS = new Set([
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'cross-origin-embedder-policy',
  'cross-origin-opener-policy', 'cross-origin-resource-policy',
  'content-encoding', 'content-length',
]);

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', '*')
      .end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const upstream = await safeGet(url, {
      headers: { 'User-Agent': BROWSER_UA },
    });

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const isHtml = contentType.toLowerCase().includes('html');

    let body;
    if (isHtml) {
      let html = await upstream.text();
      // Strip CSP meta tags
      html = html.replace(
        /<meta[^>]+http-equiv=["'](?:content-security-policy|x-frame-options|refresh)["'][^>]*>/gi,
        ''
      );
      // Inject <base> so relative URLs resolve to the original origin
      const baseTag = `<base href="${url}">`;
      if (/<head>/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
      } else if (/<html>/i.test(html)) {
        html = html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
      } else {
        html = baseTag + html;
      }
      body = html;
    } else {
      body = Buffer.from(await upstream.arrayBuffer());
    }

    // Build response headers — strip CSP-related + set CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'X-Content-Type-Options': 'nosniff',
    };

    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (!STRIP_HEADERS.has(lk) && !(lk in headers)) {
        headers[key] = value;
      }
    });

    res.status(upstream.status);
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
    return res.send(body);
  } catch (err) {
    const message = err.message || 'Proxy fetch failed';
    if (message.includes('not allowed') || message.includes('could not be resolved') || message.includes('Invalid URL')) {
      return res.status(400).json({ error: message });
    }
    return res.status(502).json({ error: message });
  }
}
