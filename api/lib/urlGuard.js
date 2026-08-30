/**
 * SSRF protection — mirrors the Python backend's url_guard.py.
 * Validates that outbound URLs point to public IPs only.
 */
import dns from 'node:dns';
import { URL } from 'node:url';
import { promisify } from 'node:util';

const resolve = promisify(dns.resolve);

const PRIVATE_RANGES = [
  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^127\./, /^0\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fd/i, /^fe80:/i,
];

function isPrivateIp(ip) {
  return PRIVATE_RANGES.some(re => re.test(ip));
}

/**
 * Validate that a URL points to a public, resolvable host.
 * Returns the validated URL string or throws.
 */
export async function publicUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not allowed');
  }
  const hostname = parsed.hostname;
  if (!hostname) throw new Error('URL must have a hostname');

  // Block obviously internal hostnames
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private or internal URL destinations are not allowed');
  }

  // DNS resolution check
  try {
    const addresses = await resolve(hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error('Private or non-public URL destinations are not allowed');
      }
    }
  } catch (err) {
    if (err.message.includes('Private or non-public')) throw err;
    throw new Error('URL host could not be resolved');
  }

  return value;
}

/**
 * Fetch a public URL while validating every redirect destination.
 * Returns the final Response.
 */
export async function safeGet(url, { headers = {}, maxRedirects = 5 } = {}) {
  let current = await publicUrl(url);
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      headers,
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      const location = res.headers.get('location');
      // Resolve relative redirects
      current = new URL(location, current).href;
      await publicUrl(current); // validate the redirect target
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}
