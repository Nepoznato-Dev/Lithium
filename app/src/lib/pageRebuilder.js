/**
 * pageRebuilder.js — Fetch a webpage, extract its main content with
 * Mozilla Readability, and rebuild a styled page preserving the
 * original site's CSS and JS so it doesn't look like a wall of text.
 *
 * Returns a complete HTML document string suitable for a srcdoc iframe.
 * Uses the same proxy chain as the search scraper (backend → public
 * CORS proxies → direct) so it works with or without the backend.
 */

import { fetchSearchHtml } from './searchProxy';

/**
 * Fetch a URL through the proxy chain, extract main content, and
 * return a full HTML document with original CSS/JS preserved.
 *
 * @param {string} url — the page to rebuild
 * @returns {Promise<{ srcdoc: string, html: string, title: string, source: string, readerable: boolean }>}
 */
export async function rebuildPage(url) {
  const { Readability, isProbablyReaderable } = await import('@mozilla/readability');
  const { html: rawHtml, source } = await fetchSearchHtml(url);

  // Parse into a DOM document for Readability and resource extraction.
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Extract CSS and JS from the original page BEFORE Readability strips them.
  const css = extractCss(doc, url);
  const js = extractJs(doc, url);

  // Check if Readability thinks this page is worth reading.
  const readerable = isProbablyReaderable(doc);

  if (!readerable) {
    const title = doc.title || hostname(url);
    const bodyText = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const preview = bodyText.slice(0, 2000);

    const srcdoc = buildFallbackDoc(title, preview, url, source, css, js);
    return {
      srcdoc,
      html: srcdoc, // backward compat for Viewport
      title,
      source,
      readerable: false,
    };
  }

  // Extract the main content.
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article || !article.content) {
    const srcdoc = buildFallbackDoc(hostname(url), '', url, source, css, js);
    return {
      srcdoc,
      html: srcdoc,
      title: article?.title || hostname(url),
      source,
      readerable: false,
    };
  }

  const srcdoc = buildArticleDoc(article, url, source, css, js);
  return {
    srcdoc,
    html: srcdoc, // backward compat for Viewport
    title: article.title || hostname(url),
    source,
    readerable: true,
  };
}

/* ------------------------------------------------------------------ */
/*  CSS & JS extraction                                               */
/* ------------------------------------------------------------------ */

/**
 * Extract all CSS from the document: inline <style> blocks and
 * external <link rel="stylesheet"> tags. Rewrites relative URLs
 * to absolute so they work in the srcdoc iframe.
 */
function extractCss(doc, baseUrl) {
  const parts = [];

  // Inline <style> blocks — rewrite url() references to absolute.
  doc.querySelectorAll('style').forEach(el => {
    let css = el.textContent?.trim();
    if (css) {
      css = rewriteCssUrls(css, baseUrl);
      parts.push(`<style>${css}</style>`);
    }
  });

  // External <link rel="stylesheet"> — rewrite href to absolute.
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (!href) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      parts.push(`<link rel="stylesheet" href="${absolute}">`);
    } catch { /* skip broken URLs */ }
  });

  return parts.join('\n');
}

/**
 * Extract all <script> elements from the document. Inline scripts
 * are kept as-is; external scripts have their src rewritten to absolute.
 * Service workers and dangerous scripts are stripped.
 */
function extractJs(doc, baseUrl) {
  const parts = [];

  doc.querySelectorAll('script').forEach(el => {
    // Skip service workers and web workers.
    const src = el.getAttribute('src') || '';
    if (/service-worker|sw\.js|worker\.js/i.test(src)) return;

    // Skip modules with type="module" — they often use bare imports
    // that won't resolve cross-origin.
    const type = el.getAttribute('type') || '';
    if (type === 'module') return;

    if (src) {
      // External script — rewrite src to absolute.
      try {
        const absolute = new URL(src, baseUrl).href;
        const attrs = [`src="${absolute}"`];
        if (el.getAttribute('defer')) attrs.push('defer');
        if (el.getAttribute('async')) attrs.push('async');
        parts.push(`<script ${attrs.join(' ')}></script>`);
      } catch { /* skip broken URLs */ }
    } else if (el.textContent?.trim()) {
      // Inline script — keep as-is.
      parts.push(`<script>${el.textContent}</script>`);
    }
  });

  return parts.join('\n');
}

/** Rewrite CSS url() references from relative to absolute. */
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
/*  Document builders                                                 */
/* ------------------------------------------------------------------ */

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Build a complete srcdoc HTML document for an article. */
function buildArticleDoc(article, url, source, css, js) {
  const domain = hostname(url);
  const byline = article.byline ? `<div class="rb-byline">${esc(article.byline)}</div>` : '';
  const excerpt = article.excerpt
    ? `<div class="rb-excerpt">${esc(article.excerpt)}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${esc(url)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${css}
  <style>${REBUILD_STYLES}</style>
</head>
<body>
  <div class="rb-page">
    <div class="rb-accent"></div>
    <div class="rb-bar">
      <span class="rb-domain">${esc(domain)}</span>
      <span class="rb-source-tag">via ${esc(source)}</span>
    </div>
    <article class="rb-article">
      <h1 class="rb-title">${esc(article.title)}</h1>
      ${byline}
      ${excerpt}
      <div class="rb-content">${article.content}</div>
    </article>
  </div>
  ${js}
  <script>${LINK_INTERCEPT_SCRIPT}</script>
</body>
</html>`;
}

/** Build a fallback srcdoc when Readability can't extract content. */
function buildFallbackDoc(title, preview, url, source, css, js) {
  const domain = hostname(url);
  const previewHtml = preview
    ? `<pre class="rb-preview">${esc(preview)}</pre>`
    : `<p class="rb-empty">This page doesn't look like an article. Try opening it directly.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${esc(url)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${css}
  <style>${REBUILD_STYLES}</style>
</head>
<body>
  <div class="rb-page">
    <div class="rb-accent"></div>
    <div class="rb-bar">
      <span class="rb-domain">${esc(domain)}</span>
      <span class="rb-source-tag">via ${esc(source)}</span>
    </div>
    <article class="rb-article">
      <h1 class="rb-title">${esc(title)}</h1>
      <p class="rb-note">This page isn't in article format — showing a text preview.</p>
      ${previewHtml}
      <a class="rb-open-btn" href="${esc(url)}" target="_blank" rel="noreferrer">Open original in new tab</a>
    </article>
  </div>
  ${js}
  <script>${LINK_INTERCEPT_SCRIPT}</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Link interception (runs inside the srcdoc iframe)                  */
/* ------------------------------------------------------------------ */

const LINK_INTERCEPT_SCRIPT = `
(function() {
  // Intercept link clicks → postMessage to parent for navigation.
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a) {
      var href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try { href = new URL(href, document.baseURI).href; } catch(e) {}
        window.parent.postMessage({ type: 'lithium-navigate', url: href }, '*');
        e.preventDefault();
      }
    }
  }, true);

  // Intercept form submissions → postMessage to parent.
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.tagName === 'FORM') {
      e.preventDefault();
      var action = form.action || document.baseURI;
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

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const REBUILD_STYLES = `
  .rb-page{font-family:system-ui,-apple-system,sans-serif;background:#0f0f17;color:#e0e0e8;min-height:100vh}
  .rb-accent{height:3px;background:linear-gradient(90deg,#7c3aed,#06b6d4)}
  .rb-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;font-size:11px;color:rgba(255,255,255,.35)}
  .rb-domain{font-weight:600;color:rgba(255,255,255,.5)}
  .rb-source-tag{background:rgba(124,58,237,.12);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:10px}
  .rb-article{max-width:720px;margin:0 auto;padding:8px 24px 60px}
  .rb-title{font-size:26px;font-weight:700;line-height:1.3;color:#fff;margin:0 0 8px}
  .rb-byline{font-size:13px;color:rgba(255,255,255,.4);margin-bottom:12px}
  .rb-excerpt{font-size:15px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:20px;font-style:italic;border-left:3px solid rgba(124,58,237,.3);padding-left:14px}
  .rb-content{font-size:15px;line-height:1.75;color:rgba(255,255,255,.78)}
  .rb-content h1,.rb-content h2,.rb-content h3,.rb-content h4{color:#fff;margin:28px 0 12px;font-weight:600}
  .rb-content h1{font-size:22px} .rb-content h2{font-size:19px} .rb-content h3{font-size:16px}
  .rb-content p{margin:0 0 16px}
  .rb-content a{color:#8ab4f8;text-decoration:none}
  .rb-content a:hover{text-decoration:underline}
  .rb-content img{max-width:100%;height:auto;border-radius:8px;margin:12px 0}
  .rb-content pre{background:#1a1a26;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:14px 16px;overflow-x:auto;font-size:13px;color:rgba(255,255,255,.7)}
  .rb-content code{font-family:'SF Mono',Consolas,monospace;font-size:13px}
  .rb-content blockquote{border-left:3px solid rgba(6,182,212,.3);margin:16px 0;padding:4px 16px;color:rgba(255,255,255,.5);font-style:italic}
  .rb-content ul,.rb-content ol{margin:0 0 16px;padding-left:24px}
  .rb-content li{margin-bottom:6px}
  .rb-content table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  .rb-content th,.rb-content td{border:1px solid rgba(255,255,255,.08);padding:8px 12px;text-align:left}
  .rb-content th{background:rgba(255,255,255,.04);font-weight:600;color:#fff}
  .rb-content figure{margin:16px 0}
  .rb-content figcaption{font-size:12px;color:rgba(255,255,255,.35);text-align:center;margin-top:6px}
  .rb-note{font-size:12px;color:rgba(255,255,255,.3);margin-bottom:16px}
  .rb-preview{font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,.5);white-space:pre-wrap;background:#1a1a26;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:16px;max-height:400px;overflow:auto}
  .rb-empty{text-align:center;padding:40px;color:rgba(255,255,255,.3);font-size:14px}
  .rb-open-btn{display:inline-block;margin-top:16px;padding:8px 20px;background:rgba(124,58,237,.15);color:#a78bfa;border-radius:20px;font-size:13px;text-decoration:none}
  .rb-open-btn:hover{background:rgba(124,58,237,.25)}
`;
