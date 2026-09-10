/**
 * In-memory sliding-window rate limiter for Vercel serverless functions.
 *
 * State is per-process (a warm function instance keeps the Map alive),
 * so this raises the bar against casual abuse but is not a substitute
 * for Vercel's built-in rate limiting or a KV-backed store.
 *
 * A periodic sweep evicts stale entries so the Map stays bounded even
 * on long-lived function instances that see low traffic.
 */

const WINDOW_MS = 60_000;   // 1 minute
const MAX_HITS = 30;         // max requests per window per IP
const MAX_ENTRIES = 10000;   // max tracked IPs before cleanup
const SWEEP_INTERVAL_MS = 5 * 60_000; // full sweep every 5 minutes

const hits = new Map();
let lastSweep = Date.now();

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

  // Periodic full sweep — cheaper than checking size every request and
  // prevents slow Map growth from IPs that only appear once.
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, ts] of hits) {
      const valid = ts.filter(t => now - t < WINDOW_MS);
      if (valid.length === 0) hits.delete(k);
      else hits.set(k, valid);
    }
  } else if (hits.size > MAX_ENTRIES) {
    // Urgent cleanup when the hard cap is hit.
    for (const [k, ts] of hits) {
      const valid = ts.filter(t => now - t < WINDOW_MS);
      if (valid.length === 0) hits.delete(k);
      else hits.set(k, valid);
    }
  }

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
