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
import { processDocument } from '../pages/Browser/stores/shieldsStore';
import { buildCosmeticCss, initAdBlocker } from './services/adBlocker';
import {
  recordAdsBlocked, recordTrackersPrevented, recordScriptsBlocked,
  recordDataSaved, recordPageProcessed, recordParamsStripped,
  stripTrackingParams,
} from './services/privacyService';
import { loadSettings } from './settings';

/**
 * Fetch a URL and rebuild it for the srcdoc iframe.
 *
 * @param {string} url — the page to render
 * @returns {Promise<{ srcdoc: string, title: string, source: string }>}
 */
export async function fullRender(url) {
  // Ensure ad blocker engine is initialized
  initAdBlocker();

  const { html: rawHtml, source } = await fetchSearchHtml(url);

  // Parse into a DOM document for thorough URL rewriting.
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Inject a <base> tag so any URLs we miss still resolve correctly.
  injectBase(doc, url);

  // Rewrite all relative URLs to absolute.
  rewriteUrls(doc, url);

  // Strip dangerous / broken elements.
  stripDangerous(doc);

  // ── Real ad/tracker blocking ──
  // Scan the document, remove classified resources, and record stats.
  const blockResult = processDocument(doc, url);

  // Record real stats to privacyService
  if (blockResult.ads > 0) recordAdsBlocked(blockResult.ads);
  if (blockResult.trackers > 0) recordTrackersPrevented(blockResult.trackers);
  if (blockResult.scripts > 0) recordScriptsBlocked(blockResult.scripts);
  if (blockResult.dataSaved > 0) recordDataSaved(blockResult.dataSaved);
  recordPageProcessed();

  // ── Tracking parameter stripping ──
  // Rewrite URLs in the document that contain tracking parameters
  const settings = loadSettings();
  if (settings.privacy?.stripTrackingParams !== false) {
    let paramsStripped = 0;
    doc.querySelectorAll('[href]').forEach(el => {
      const href = el.getAttribute('href');
      if (href && (href.includes('?') || href.includes('&'))) {
        const result = stripTrackingParams(href);
        if (result.stripped > 0) {
          el.setAttribute('href', result.url);
          paramsStripped += result.stripped;
        }
      }
    });
    doc.querySelectorAll('[src]').forEach(el => {
      const src = el.getAttribute('src');
      if (src && (src.includes('?') || src.includes('&'))) {
        const result = stripTrackingParams(src);
        if (result.stripped > 0) {
          el.setAttribute('src', result.url);
          paramsStripped += result.stripped;
        }
      }
    });
    if (paramsStripped > 0) recordParamsStripped(paramsStripped);
  }

  // ── Cosmetic CSS injection ──
  // Inject a stylesheet that hides ad remnants, cookie banners, etc.
  if (settings.privacy?.cosmeticFilters !== false) {
    const cosmeticCss = buildCosmeticCss(true);
    const styleEl = doc.createElement('style');
    styleEl.setAttribute('data-lithium-cosmetic', 'true');
    styleEl.textContent = cosmeticCss;
    const head = doc.querySelector('head');
    if (head) head.appendChild(styleEl);
  }

  // Inject the proxy override script into <head>.
  injectOverrides(doc, url);

  // Serialize back to HTML string.
  const srcdoc = new XMLSerializer().serializeToString(doc);
  const title = doc.title || hostname(url);

  return { srcdoc, title, source, blocked: blockResult };
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
  // Block known tracker/ad domains by returning empty responses.
  var origFetch = window.fetch;
  var PROXY_BASE = '${getBackendUrl()}/api/web/proxy?url=';
  var FALLBACK_PROXY = 'https://api.allorigins.win/raw?url=';

  // Tracker/ad domains to block at runtime (inside the iframe).
  var BLOCKED_DOMAINS = [
    'doubleclick.net','googlesyndication.com','googleadservices.com',
    'google-analytics.com','googletagmanager.com','googletagservices.com',
    'facebook.net','an.facebook.com','pixel.facebook.com',
    'hotjar.com','mixpanel.com','segment.com','amplitude.com',
    'newrelic.com','nr-data.net','fullstory.com','sentry.io',
    'adsrvr.org','adnxs.com','adroll.com','criteo.com','criteo.net',
    'taboola.com','outbrain.com','pubmatic.com','openx.net',
    'rubiconproject.com','smartadserver.com','teads.tv',
    'scorecardresearch.com','quantserve.com','bluekai.com',
    'demdex.net','exelator.com','krxd.net','mathtag.com',
    'mookie1.com','pardot.com','tapad.com','eyeota.net',
    'coinhive.com','coin-hive.com','authedmine.com','crypto-loot.com',
    'onesignal.com','cleverpush.com',
    'hubspot.com','hs-scripts.com','marketo.com',
    'drift.com','intercom.io',
  ];

  function isTrackerUrl(u) {
    if (!u || typeof u !== 'string') return false;
    var h = '';
    try { h = new URL(u).hostname.replace(/^www\\./, ''); } catch(e) { return false; }
    for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
      if (h === BLOCKED_DOMAINS[i] || h.endsWith('.' + BLOCKED_DOMAINS[i])) return true;
    }
    return false;
  }

  function blockedResponse() {
    return Promise.resolve(new Response('', { status: 204, statusText: 'Blocked by Lithium Shields' }));
  }

  window.fetch = function(input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    // Resolve relative URLs against the target page.
    try { url = new URL(url, TARGET_URL).href; } catch(e) {}
    // Block tracker/ad requests
    if (isTrackerUrl(url)) return blockedResponse();
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
      // Block tracker/ad requests
      if (isTrackerUrl(url)) {
        // Redirect to a harmless empty response
        arguments[1] = 'data:text/plain,';
        return origOpen.apply(this, arguments);
      }
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
