/**
 * In-memory sliding-window rate limiter for Vercel serverless functions.
 *
 * State is per-process (a warm function instance keeps the Map alive),
 * so this raises the bar against casual abuse but is not a substitute
 * for Vercel's built-in rate limiting or a KV-backed store.
 */

const WINDOW_MS = 60_000;   // 1 minute
const MAX_HITS = 30;         // max requests per window per IP

const hits = new Map();

/**
 * Check whether *ip* is within the rate limit.
 * Returns true if the request is allowed, false if it should be rejected.
 */
export function rateLimit(ip) {
  const key = (ip || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const timestamps = hits.get(key) || [];
  const recent = timestamps.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(key, recent); // prune stale entries
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * Extract the client IP from a Vercel request.
 */
export function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
