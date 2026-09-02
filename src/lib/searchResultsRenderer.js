/**
 * searchResultsRenderer.js — Fetch raw search engine HTML, sanitize it,
 * rewrite URLs, inject a minimal top bar with provider tabs, and return
 * a self-contained HTML string for display in the viewport.
 *
 * Uses the same DOMParser-based sanitization patterns as fullRenderer.js.
 * The search engine's own CSS renders the results natively.
 */

import { fetchSearchHtml, getBackendUrl, SCRAPE_PROVIDERS } from './searchProxy';

/**
 * Fetch search results as raw HTML, sanitize, and inject a top bar.
 *
 * @param {string} query — the search terms
 * @param {string} providerKey — one of the SCRAPE_PROVIDERS keys
 * @returns {Promise<{ html: string, provider: string, source: string, query: string }>}
 */
export async function renderSearchResults(query, providerKey = 'brave') {
  const provider = SCRAPE_PROVIDERS[providerKey] || SCRAPE_PROVIDERS.duckduckgo;
  const searchUrl = provider.buildUrl(query);
  const { html: rawHtml, source } = await fetchSearchHtml(searchUrl);

  // Parse into a DOM document for sanitization and URL rewriting.
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Sanitize — remove dangerous elements and attributes.
  sanitize(doc);

  // Rewrite all relative URLs to absolute so resources load correctly.
  rewriteUrls(doc, searchUrl);

  // Inject a <base> tag as fallback for any URLs we miss.
  injectBase(doc, searchUrl);

  // Inject the Lithium top bar (search input + provider tabs).
  injectTopBar(doc, query, providerKey);

  // Inject navigation override script (link clicks + form submissions).
  injectOverrides(doc, searchUrl, query);

  // Serialize back to HTML string.
  const html = new XMLSerializer().serializeToString(doc);

  return { html, provider: provider.label, source, query, providerKey, searchUrl };
}

/* ------------------------------------------------------------------ */
/*  Sanitization                                                      */
/* ------------------------------------------------------------------ */

function sanitize(doc) {
  // Remove all scripts — search engines don't need them for HTML results.
  doc.querySelectorAll('script').forEach(el => el.remove());

  // Remove iframes, objects, embeds.
  doc.querySelectorAll('iframe, object, embed').forEach(el => el.remove());

  // Remove forms (we inject our own search form in the top bar).
  doc.querySelectorAll('form').forEach(el => el.remove());

  // Remove on* event handler attributes from all elements.
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Remove CSP meta tags and X-Frame-Options.
  doc.querySelectorAll('meta[http-equiv]').forEach(el => {
    const equiv = (el.getAttribute('http-equiv') || '').toLowerCase();
    if (['content-security-policy', 'x-frame-options', 'refresh'].includes(equiv)) {
      el.remove();
    }
  });

  // Remove preload/prefetch links that may fail cross-origin.
  doc.querySelectorAll('link[rel="preload"], link[rel="prefetch"]').forEach(el => el.remove());

  // Remove service worker registrations (in case any inline scripts remain).
  doc.querySelectorAll('link[rel="manifest"]').forEach(el => el.remove());

  // Remove noscript fallbacks that may contain unwanted content.
  // (Keep noscript elements — they're safe and may contain useful images.)
}

/* ------------------------------------------------------------------ */
/*  URL rewriting (reuses fullRenderer.js patterns)                    */
/* ------------------------------------------------------------------ */

function injectBase(doc, url) {
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

  resolve('href');
  resolve('src');
  resolve('srcset');
  resolve('action');
  resolve('poster');
  resolve('data');

  // Rewrite CSS url() in inline styles.
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
/*  Inject Lithium top bar                                            */
/* ------------------------------------------------------------------ */

function injectTopBar(doc, query, activeProviderKey) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const providerKeys = Object.keys(SCRAPE_PROVIDERS);

  const tabsHtml = providerKeys.map(key => {
    const label = SCRAPE_PROVIDERS[key].label;
    const active = key === activeProviderKey;
    return `<button type="button" data-lithium-provider="${key}" class="li-tab${active ? ' li-tab-active' : ''}">${esc(label)}</button>`;
  }).join('');

  const barHtml = `
<div class="li-bar">
  <form class="li-form" data-lithium-search="1">
    <input class="li-input" name="q" value="${esc(query)}" placeholder="Search the web…" autocomplete="off" />
  </form>
  <div class="li-tabs">${tabsHtml}</div>
</div>`;

  const barStyle = `
<style id="lithium-bar-style">
.li-bar{position:sticky;top:0;z-index:99999;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#12121c;border-bottom:1px solid rgba(255,255,255,.08);font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(12px)}
.li-form{flex:1;max-width:540px}
.li-input{width:100%;background:#1e1e2e;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:8px 16px;color:#fff;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
.li-input:focus{border-color:rgba(251,84,43,.4);box-shadow:0 0 0 2px rgba(251,84,43,.12)}
.li-tabs{display:flex;gap:4px;flex-shrink:0}
.li-tab{background:none;border:none;color:rgba(255,255,255,.4);font-size:11px;font-weight:500;padding:5px 12px;border-radius:14px;cursor:pointer;white-space:nowrap;transition:all .15s}
.li-tab:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.7)}
.li-tab-active{background:rgba(251,84,43,.15);color:#FB542B}
</style>`;

  // Insert at the beginning of <body> (or <html> if no body).
  const body = doc.querySelector('body');
  if (body) {
    // Insert style into <head>.
    const head = doc.querySelector('head');
    if (head) {
      const styleEl = doc.createElement('style');
      styleEl.id = 'lithium-bar-style';
      styleEl.textContent = `
.li-bar{position:sticky;top:0;z-index:99999;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#12121c;border-bottom:1px solid rgba(255,255,255,.08);font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(12px)}
.li-form{flex:1;max-width:540px}
.li-input{width:100%;background:#1e1e2e;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:8px 16px;color:#fff;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
.li-input:focus{border-color:rgba(251,84,43,.4);box-shadow:0 0 0 2px rgba(251,84,43,.12)}
.li-tabs{display:flex;gap:4px;flex-shrink:0}
.li-tab{background:none;border:none;color:rgba(255,255,255,.4);font-size:11px;font-weight:500;padding:5px 12px;border-radius:14px;cursor:pointer;white-space:nowrap;transition:all .15s}
.li-tab:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.7)}
.li-tab-active{background:rgba(251,84,43,.15);color:#FB542B}`;
      head.appendChild(styleEl);
    }
    // Insert bar at top of body.
    const barDiv = doc.createElement('div');
    barDiv.innerHTML = barHtml;
    body.insertBefore(barDiv.firstChild, body.firstChild);
  } else {
    const html = doc.querySelector('html');
    if (html) {
      const styleEl = doc.createElement('style');
      styleEl.textContent = barStyle;
      html.insertBefore(styleEl, html.firstChild);
      const barDiv = doc.createElement('div');
      barDiv.innerHTML = barHtml;
      html.insertBefore(barDiv.firstChild, styleEl.nextSibling);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Inject navigation overrides                                       */
/* ------------------------------------------------------------------ */

function injectOverrides(doc, targetUrl, query) {
  const script = doc.createElement('script');
  script.textContent = `
(function() {
  var TARGET_URL = ${JSON.stringify(targetUrl)};
  var QUERY = ${JSON.stringify(query)};

  // --- Link navigation ---
  // Intercept clicks on links so they navigate the Lithium browser.
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

  // --- Search form (our injected top bar) ---
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.hasAttribute('data-lithium-search')) {
      e.preventDefault();
      var input = form.querySelector('input[name="q"]');
      if (input && input.value.trim()) {
        window.parent.postMessage({ type: 'lithium-search', query: input.value.trim() }, '*');
      }
    }
  }, true);

  // --- Provider tab clicks ---
  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('[data-lithium-provider]');
    if (btn) {
      var provider = btn.getAttribute('data-lithium-provider');
      if (provider) {
        window.parent.postMessage({ type: 'lithium-switch-provider', provider: provider, query: QUERY }, '*');
        e.preventDefault();
      }
    }
  }, true);
})();
`;

  const body = doc.querySelector('body');
  if (body) {
    body.insertBefore(script, body.firstChild);
  } else {
    const html = doc.querySelector('html');
    if (html) html.appendChild(script);
  }
}
