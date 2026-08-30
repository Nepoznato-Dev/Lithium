/* eslint-disable no-undef */
// HTMLRewriter is a Cloudflare Workers global — no import needed.

/**
 * Lithium Cloudflare Proxy Worker
 *
 * Reverse-proxies arbitrary web pages so the Lithium in-browser iframe
 * can render sites that normally refuse embedding (CSP frame-ancestors,
 * X-Frame-Options, etc.).
 *
 * URL scheme:  GET /proxy/<target-url>
 * Example:     /proxy/https://example.com/page?q=1
 *
 * For HTML responses the worker:
 *   • Rewrites every href / src / action / poster / data to route back
 *     through the same proxy (HTMLRewriter).
 *   • Rewrites inline CSS url() references.
 *   • Injects a <script> that patches history.pushState / replaceState so
 *     SPA navigation also goes through the proxy.
 *   • Strips <meta http-equiv="content-security-policy"> tags.
 *   • Removes response-level CSP & X-Frame-Options headers.
 *
 * Non-HTML responses (images, JS, CSS, fonts …) are forwarded as-is with
 * permissive CORS headers so the iframe can consume them.
 */

const PROXY_PREFIX = '/proxy/';

/* ------------------------------------------------------------------ */
/*  URL helpers                                                       */
/* ------------------------------------------------------------------ */

/** Build the proxy URL for any absolute target URL. */
function toProxyUrl(target, requestOrigin) {
  try {
    const resolved = new URL(target).href;
    return `${requestOrigin}${PROXY_PREFIX}${resolved}`;
  } catch {
    return target;
  }
}

/** Resolve a possibly-relative URL against a base, returning the absolute form. */
function resolveUrl(raw, base) {
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

/* ------------------------------------------------------------------ */
/*  HTMLRewriter element handlers                                     */
/* ------------------------------------------------------------------ */

/** Rewrite every relevant attribute on a given element tag. */
class UrlRewriter {
  constructor(attrs, proxyOrigin) {
    this.attrs = attrs; // e.g. ['href'] for <a>, ['src'] for <img>
    this.proxyOrigin = proxyOrigin;
  }

  element(el) {
    for (const attr of this.attrs) {
      const raw = el.getAttribute(attr);
      if (!raw) continue;
      const trimmed = raw.trim();
      if (
        trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:') ||
        trimmed === '#' ||
        trimmed.startsWith('#')
      ) {
        continue;
      }
      const abs = resolveUrl(trimmed, this._base);
      el.setAttribute(attr, `${this.proxyOrigin}${PROXY_PREFIX}${abs}`);
    }
  }

  setBase(base) {
    this._base = base;
  }
}

/** Rewrite url() references inside a <style> element's text content. */
class StyleRewriter {
  constructor(proxyOrigin) {
    this.proxyOrigin = proxyOrigin;
  }

  text(chunk) {
    // HTMLRewriter delivers <style> content in chunks; we can only do a
    // best-effort replace on each chunk.  Multi-line url() spanning
    // chunks is extremely rare in practice.
    const rewritten = chunk.replace(
      /url\(\s*(['"]?)(.+?)\1\s*\)/g,
      (_m, q, raw) => {
        const trimmed = raw.trim();
        if (
          trimmed.startsWith('data:') ||
          trimmed.startsWith('blob:') ||
          trimmed.startsWith('#')
        ) {
          return _m;
        }
        const abs = resolveUrl(trimmed, this._base);
        return `url("${this.proxyOrigin}${PROXY_PREFIX}${abs}")`;
      },
    );
    chunk.replace(rewritten);
  }

  setBase(base) {
    this._base = base;
  }
}

/** Remove <meta http-equiv="content-security-policy"> tags. */
class CspMetaRemover {
  element(el) {
    const httpEquiv = (el.getAttribute('http-equiv') || '').toLowerCase();
    if (httpEquiv === 'content-security-policy') {
      el.remove();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Core proxy logic                                                  */
/* ------------------------------------------------------------------ */

async function proxyRequest(request, targetUrl, proxyOrigin) {
  // Build the outbound request, forwarding safe headers.
  const headers = new Headers(request.headers);
  headers.set('Host', new URL(targetUrl).hostname);
  // Avoid sending the proxy's own Accept-Encoding / connection headers.
  headers.delete('Accept-Encoding');
  headers.delete('Connection');
  headers.delete('Cache-Control');
  headers.delete('Pragma');

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    redirect: 'follow',
  });

  const contentType = upstream.headers.get('Content-Type') || '';
  const responseHeaders = new Headers(upstream.headers);

  // ---- Strip framing restrictions ----
  responseHeaders.delete('Content-Security-Policy');
  responseHeaders.delete('Content-Security-Policy-Report-Only');
  responseHeaders.delete('X-Frame-Options');

  // Remove any frame-ancestors CSP directive that might be embedded in
  // other header variants.
  for (const [key] of responseHeaders) {
    if (key.toLowerCase().startsWith('x-content-') ||
        key.toLowerCase() === 'cross-origin-embedder-policy') {
      responseHeaders.delete(key);
    }
  }

  // ---- Permissive CORS ----
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  responseHeaders.delete('X-Content-Type-Options');

  // ---- HTML: rewrite URLs ----
  if (contentType.includes('text/html')) {
    const rewriters = [
      // Navigation
      new UrlRewriter(['href'], proxyOrigin),        // a, area, link
      new UrlRewriter(['href', 'formaction'], proxyOrigin), // form, button
      // Scripts & media
      new UrlRewriter(['src'], proxyOrigin),         // script, img, iframe, embed, audio, source
      new UrlRewriter(['poster'], proxyOrigin),      // video
      new UrlRewriter(['data'], proxyOrigin),        // object
      // CSP meta removal
      new CspMetaRemover(),
      // <style> url() rewriting
      new StyleRewriter(proxyOrigin),
    ];

    let rewriter = new HTMLRewriter();
    // <head> injection: patch history API so SPA navigations go through proxy
    rewriter = rewriter.on('head', {
      element(el) {
        el.prepend(
          `<script>(()=>{` +
          `const P=${JSON.stringify(proxyOrigin + PROXY_PREFIX)};` +
          `const _p=u=>{try{return new URL(u,location.href).href}catch{return u}};` +
          `const _w=u=>P+_p(u);` +
          `const h=history;` +
          `const _push=h.pushState.bind(h);` +
          `const _replace=h.replaceState.bind(h);` +
          `h.pushState=function(s,t,u){return _push(s,t,u?_w(u):u)};` +
          `h.replaceState=function(s,t,u){return _replace(s,t,u?_w(u):u)};` +
          `})();</script>`,
          { html: true },
        );
      },
    });

    // Tag-level URL rewriting
    rewriter = rewriter
      .on('a', rewriters[0])
      .on('area', rewriters[0])
      .on('link', rewriters[0])
      .on('form', rewriters[1])
      .on('button', rewriters[1])
      .on('script', rewriters[2])
      .on('img', rewriters[2])
      .on('iframe', rewriters[2])
      .on('embed', rewriters[2])
      .on('audio', rewriters[2])
      .on('video', new UrlRewriter(['src', 'poster'], proxyOrigin))
      .on('source', rewriters[2])
      .on('object', rewriters[4])
      .on('meta', rewriters[5])
      .on('style', rewriters[6]);

    return rewriter.transform(upstream);
  }

  // ---- CSS: rewrite url() references ----
  if (contentType.includes('text/css')) {
    const css = await upstream.text();
    const rewritten = css.replace(
      /url\(\s*(['"]?)(.+?)\1\s*\)/g,
      (_m, _q, raw) => {
        const trimmed = raw.trim();
        if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#')) {
          return _m;
        }
        const abs = resolveUrl(trimmed, targetUrl);
        return `url("${proxyOrigin}${PROXY_PREFIX}${abs}")`;
      },
    );
    return new Response(rewritten, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  // ---- Everything else: pass through with CORS ----
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                       */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only handle /proxy/<url> paths
    if (!url.pathname.startsWith(PROXY_PREFIX)) {
      return new Response('Lithium Proxy — use /proxy/&lt;url&gt;', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const targetUrl = url.pathname.slice(PROXY_PREFIX.length);
    if (!targetUrl) {
      return new Response('Missing target URL', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    try {
      return await proxyRequest(request, targetUrl, proxyOrigin);
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
};
