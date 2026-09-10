/**
 * Origin-restricted CORS helper for Vercel serverless functions.
 * Returns the request origin if it matches the allowlist, else null.
 *
 * Production origins are read from the VERCEL_URL / ALLOWED_ORIGINS env vars
 * so the same code works across preview, production, and custom domains.
 */

const ALLOWED = new Set([
  'http://localhost:5173',   // Vite dev server
  'http://127.0.0.1:5173',
  'http://localhost:4173',   // vite preview
  'https://lithium-mu.vercel.app', // Vercel production
]);

// Merge any extra origins from environment (comma-separated).
if (process.env.ALLOWED_ORIGINS) {
  for (const o of process.env.ALLOWED_ORIGINS.split(',')) {
    const trimmed = o.trim();
    if (trimmed) ALLOWED.add(trimmed);
  }
}

/**
 * Return the CORS origin header value for *req*.
 * Returns the requesting origin if allowed, otherwise null.
 */
export function corsOrigin(req) {
  const origin = (req.headers.origin || '').trim();
  return ALLOWED.has(origin) ? origin : null;
}

/**
 * Apply CORS headers to a Vercel response.
 * If the origin is not allowed, the Access-Control-Allow-Origin header
 * is omitted (the browser will block the response).
 */
export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = corsOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return origin;
}
