/**
 * fullRenderer.js — Fetch a webpage and rebuild it for display in a
 * srcdoc iframe with full URL rewriting and API proxying.
 *
 * Based on the user's PoC: fetch through CORS proxy, rewrite relative
 * URLs to absolute, inject location spoof + fetch override so the page
 * thinks it's running on its own origin and API calls route through
 * the proxy chain.
 *
 * The result is loaded into a <iframe srcdoc="..."> which gives scripts
 * their own document context (unlike innerHTML where scripts don't run).
 */

import { fetchSearchHtml, getBackendUrl } from './searchProxy';

/**
 * Fetch a URL and rebuild it for the srcdoc iframe.
 *
 * @param {string} url — the page to render
 * @returns {Promise<{ srcdoc: string, title: string, source: string }>}
 */
export async function fullRender(url) {
  const { html: rawHtml, source } = await fetchSearchHtml(url);

  // Parse into a DOM document for thorough URL rewriting.
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Inject a <base> tag so any URLs we miss still resolve correctly.
  injectBase(doc, url);

  // Rewrite all relative URLs to absolute.
  rewriteUrls(doc, url);

  // Strip dangerous / broken elements.
  stripDangerous(doc);

  // Inject the proxy override script into <head>.
  injectOverrides(doc, url);

  // Serialize back to HTML string.
  const srcdoc = new XMLSerializer().serializeToString(doc);
  const title = doc.title || hostname(url);

  return { srcdoc, title, source };
}

/* ------------------------------------------------------------------ */
/*  URL rewriting                                                     */
/* ------------------------------------------------------------------ */

function injectBase(doc, url) {
  // Remove any existing <base> tags.
  doc.querySelectorAll('base').forEach(el => el.remove());

  const base = doc.createElement('base');
  base.setAttribute('href', url);
  const head = doc.querySelector('head');
  if (head) {
    head.insertBefore(base, head.firstChild);
  } else {
    const html = doc.querySelector('html');
    if (html) html.insertBefore(base, html.firstChild);
  }
}

function rewriteUrls(doc, baseUrl) {
  const resolve = (attr) => {
    doc.querySelectorAll(`[${attr}]`).forEach(el => {
      const val = el.getAttribute(attr);
      if (!val) return;
      // Skip data URIs, javascript:, anchors, and already-absolute URLs.
      if (/^(data:|javascript:|mailto:|#|blob:)/i.test(val)) return;
      if (/^https?:\/\//i.test(val)) return;
      try {
        const absolute = new URL(val, baseUrl).href;
        el.setAttribute(attr, absolute);
      } catch { /* keep original */ }
    });
  };

  // Rewrite common URL-bearing attributes.
  resolve('href');
  resolve('src');
  resolve('srcset');
  resolve('action');
  resolve('poster');
  resolve('data');

  // Rewrite CSS background-image and other url() references in inline styles.
  doc.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style');
    if (style && style.includes('url(')) {
      el.setAttribute('style', rewriteCssUrls(style, baseUrl));
    }
  });

  // Rewrite url() in <style> elements.
  doc.querySelectorAll('style').forEach(el => {
    const css = el.textContent;
    if (css && css.includes('url(')) {
      el.textContent = rewriteCssUrls(css, baseUrl);
    }
  });
}

function rewriteCssUrls(css, baseUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (/^(data:|https?:\/\/|\/\/)/i.test(url)) return match;
    try {
      const absolute = new URL(url, baseUrl).href;
      return `url(${quote}${absolute}${quote})`;
    } catch { return match; }
  });
}

/* ------------------------------------------------------------------ */
/*  Strip dangerous / broken elements                                 */
/* ------------------------------------------------------------------ */

function stripDangerous(doc) {
  // Remove service workers, web workers, and CSP meta tags.
  doc.querySelectorAll('script[src*="sw.js"], script[src*="service-worker"]').forEach(el => el.remove());
  doc.querySelectorAll('meta[http-equiv]').forEach(el => {
    const equiv = (el.getAttribute('http-equiv') || '').toLowerCase();
    if (['content-security-policy', 'x-frame-options', 'refresh'].includes(equiv)) {
      el.remove();
    }
  });

  // Remove link rel="preload" for fonts/scripts that may fail cross-origin.
  doc.querySelectorAll('link[rel="preload"]').forEach(el => el.remove());
}

/* ------------------------------------------------------------------ */
/*  Inject proxy overrides                                            */
/* ------------------------------------------------------------------ */

function injectOverrides(doc, targetUrl) {
  const origin = new URL(targetUrl).origin;
  const hostname = new URL(targetUrl).hostname;

  // Build the override script. This runs inside the srcdoc iframe's
  // own document context, so it can spoof location and intercept APIs.
  const script = doc.createElement('script');
  script.textContent = `
(function() {
  var TARGET_URL = ${JSON.stringify(targetUrl)};
  var TARGET_ORIGIN = ${JSON.stringify(origin)};
  var TARGET_HOST = ${JSON.stringify(hostname)};

  // --- Location spoof ---
  // Override location properties so JS that checks the current URL
  // sees the target domain, not the Lithium origin.
  var fakeLocation = {
    href: TARGET_URL,
    origin: TARGET_ORIGIN,
    protocol: 'https:',
    host: TARGET_HOST,
    hostname: TARGET_HOST,
    port: '',
    pathname: new URL(TARGET_URL).pathname,
    search: new URL(TARGET_URL).search,
    hash: new URL(TARGET_URL).hash,
    ancestorOrigins: [],
    assign: function(u) { window.parent.postMessage({ type: 'lithium-navigate', url: u }, '*'); },
    replace: function(u) { window.parent.postMessage({ type: 'lithium-navigate', url: u }, '*'); },
    reload: function() { window.parent.postMessage({ type: 'lithium-reload' }, '*'); }
  };

  try {
    Object.defineProperty(window, 'location', { value: fakeLocation, writable: false });
  } catch(e) {}

  // Also patch document.URL and document.documentURI.
  try {
    Object.defineProperty(document, 'URL', { value: TARGET_URL, get: function() { return TARGET_URL; } });
    Object.defineProperty(document, 'documentURI', { value: TARGET_URL, get: function() { return TARGET_URL; } });
  } catch(e) {}

  // --- Fetch override ---
  // Route all fetch() calls through the CORS proxy so API calls work.
  var origFetch = window.fetch;
  var PROXY_BASE = '${getBackendUrl()}/api/web/proxy?url=';
  var FALLBACK_PROXY = 'https://api.allorigins.win/raw?url=';
  window.fetch = function(input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    // Resolve relative URLs against the target page.
    try { url = new URL(url, TARGET_URL).href; } catch(e) {}
    // Route through backend proxy, fallback to allorigins.
    var proxyUrl = PROXY_BASE + encodeURIComponent(url);
    return origFetch.call(this, proxyUrl, init).catch(function() {
      return origFetch.call(this, FALLBACK_PROXY + encodeURIComponent(url), init);
    });
  };

  // --- XMLHttpRequest override ---
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string') {
      try { url = new URL(url, TARGET_URL).href; } catch(e) {}
      arguments[1] = PROXY_BASE + encodeURIComponent(url);
    }
    return origOpen.apply(this, arguments);
  };

  // --- Link navigation ---
  // Intercept clicks on links so they navigate the Lithium browser
  // instead of the srcdoc iframe.
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) {
      var href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try { href = new URL(href, TARGET_URL).href; } catch(e) {}
        window.parent.postMessage({ type: 'lithium-navigate', url: href }, '*');
        e.preventDefault();
      }
    }
  }, true);

  // --- Form submission ---
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.tagName === 'FORM') {
      e.preventDefault();
      var action = form.action || TARGET_URL;
      var method = (form.method || 'get').toLowerCase();
      var formData = new FormData(form);
      var params = new URLSearchParams(formData).toString();
      var navUrl = method === 'get'
        ? action + (action.includes('?') ? '&' : '?') + params
        : action;
      window.parent.postMessage({ type: 'lithium-navigate', url: navUrl }, '*');
    }
  }, true);
})();
`;

  const head = doc.querySelector('head');
  if (head) {
    head.insertBefore(script, head.firstChild);
  } else {
    const html = doc.querySelector('html');
    if (html) html.insertBefore(script, html.firstChild);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
