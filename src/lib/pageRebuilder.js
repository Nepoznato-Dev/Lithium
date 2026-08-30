/**
 * pageRebuilder.js — Fetch a webpage, extract its main content with
 * Mozilla Readability, and rebuild a clean, styled page for display
 * inside the Lithium browser viewport.
 *
 * Uses the same proxy chain as the search scraper (backend → public
 * CORS proxies → direct) so it works with or without the backend.
 */

import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { fetchSearchHtml } from './searchProxy';

/**
 * Fetch a URL through the proxy chain, extract main content, and
 * return a clean HTML string ready for the viewport.
 *
 * @param {string} url — the page to rebuild
 * @returns {Promise<{ html: string, title: string, source: string, readerable: boolean }>}
 */
export async function rebuildPage(url) {
  const { html: rawHtml, source } = await fetchSearchHtml(url);

  // Parse into a DOM document for Readability.
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Check if Readability thinks this page is worth reading.
  const readerable = isProbablyReaderable(doc);

  if (!readerable) {
    // Not an article/content page — return a notice with the raw text
    // so the user can still see something.
    const title = doc.title || hostname(url);
    const bodyText = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const preview = bodyText.slice(0, 2000);

    return {
      html: buildFallbackPage(title, preview, url, source),
      title,
      source,
      readerable: false,
    };
  }

  // Extract the main content.
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article || !article.content) {
    return {
      html: buildFallbackPage(hostname(url), '', url, source),
      title: article?.title || hostname(url),
      source,
      readerable: false,
    };
  }

  return {
    html: buildArticlePage(article, url, source),
    title: article.title || hostname(url),
    source,
    readerable: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Page builders                                                     */
/* ------------------------------------------------------------------ */

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Build a clean article page from Readability output. */
function buildArticlePage(article, url, source) {
  const domain = hostname(url);
  const byline = article.byline ? `<div class="rb-byline">${esc(article.byline)}</div>` : '';
  const excerpt = article.excerpt
    ? `<div class="rb-excerpt">${esc(article.excerpt)}</div>`
    : '';

  // Readability returns sanitized HTML in article.content.
  // We wrap it in our own styled container.
  return `<div class="rb-page">
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
  <style>${REBUILD_STYLES}</style>`;
}

/** Build a fallback page when Readability can't extract content. */
function buildFallbackPage(title, preview, url, source) {
  const domain = hostname(url);
  const previewHtml = preview
    ? `<pre class="rb-preview">${esc(preview)}</pre>`
    : `<p class="rb-empty">This page doesn't look like an article. Try opening it directly.</p>`;

  return `<div class="rb-page">
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
  <style>${REBUILD_STYLES}</style>`;
}

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
