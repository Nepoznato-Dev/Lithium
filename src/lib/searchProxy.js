/**
 * searchProxy.js — Free search scraping with fallback proxy chain.
 *
 * Fetches search engine HTML through a chain of proxies:
 *   1. Vercel backend proxy (always-online serverless functions)
 *   2. Local Python backend (legacy — localhost:8734)
 *   3. Public CORS proxies (allorigins, corsproxy.io, codetabs)
 *   4. Direct fetch (last resort — may fail due to CORS)
 *
 * Providers: DuckDuckGo, Brave, Bing, Mojeek.
 *
 * Each provider has a `buildUrl` (constructs the search URL) and a
 * `parse` function (extracts { title, url, snippet }[] from the HTML).
 */

/* ------------------------------------------------------------------ */
/*  Proxy chain with fallbacks                                        */
/* ------------------------------------------------------------------ */

/** Vercel serverless backend — set via VITE_BACKEND_URL env var.
 *  When deployed on Vercel itself, leave empty for same-origin API calls.
 *  For local dev, set to your Vercel deployment URL (e.g. https://lithium.vercel.app). */
const VERCEL_BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
const LOCAL_BACKEND = 'http://127.0.0.1:8734';

/** Get the primary backend URL (Vercel > local). */
export function getBackendUrl() {
  return VERCEL_BACKEND || LOCAL_BACKEND;
}

/** Public CORS proxies that return raw HTML. */
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

/** Try fetching from a single URL with a timeout. */
async function tryFetch(url, timeoutMs = 10000) {
  const res = await fetch(url, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 100) throw new Error('Empty response');
  return text;
}

/**
 * Fetch HTML through the proxy chain.
 * Tries backend first, then each public CORS proxy, then direct fetch.
 * Returns { html, source } where source is 'backend' | 'cors' | 'direct'.
 */
export async function fetchSearchHtml(url) {
  const backendUrl = getBackendUrl();

  // 1. Try the primary backend proxy (Vercel or local).
  try {
    const html = await tryFetch(`${backendUrl}/api/web/proxy?url=${encodeURIComponent(url)}`, 8000);
    return { html, source: 'vercel' };
  } catch { /* backend offline — fall through */ }

  // 2. If Vercel backend is set and differs from local, try local too.
  if (VERCEL_BACKEND && VERCEL_BACKEND !== LOCAL_BACKEND) {
    try {
      const html = await tryFetch(`${LOCAL_BACKEND}/api/web/proxy?url=${encodeURIComponent(url)}`, 5000);
      return { html, source: 'backend' };
    } catch { /* local backend offline — fall through */ }
  }

  // 3. Try public CORS proxies.
  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const html = await tryFetch(makeProxyUrl(url), 12000);
      return { html, source: 'cors' };
    } catch { /* this proxy failed — try next */ }
  }

  // 4. Direct fetch (will likely fail due to CORS, but worth trying).
  try {
    const html = await tryFetch(url, 10000);
    return { html, source: 'direct' };
  } catch (err) {
    throw new Error(`All proxies failed: ${err.message}`);
  }
}

/** Fetch HTML through the backend proxy (legacy — used by scrapeSearch). */
async function fetchViaProxy(url) {
  const { html } = await fetchSearchHtml(url);
  return html;
}

/** Parse an HTML string into a DOM Document. */
function parseHTML(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Clean up whitespace in scraped text. */
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

/** Extract a real URL from a DDG redirect (uddg param). */
function extractUddg(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    return u.searchParams.get('uddg') || href;
  } catch {
    return href;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider: DuckDuckGo (HTML version)                               */
/* ------------------------------------------------------------------ */

const duckduckgo = {
  label: 'DuckDuckGo',
  buildUrl: q => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,

  parse(html) {
    const doc = parseHTML(html);
    const results = [];

    // DDG HTML uses <a class="result__a"> with redirect URLs containing
    // the real destination in the `uddg` query parameter.
    const links = doc.querySelectorAll('a.result__a');
    for (const a of links) {
      const rawHref = a.getAttribute('href') || '';
      const url = extractUddg(rawHref);
      if (!url || url.startsWith('//duckduckgo.com') || url.startsWith('#')) continue;

      const title = clean(a.textContent);
      if (!title) continue;

      // Snippet lives in a sibling <a class="result__snippet">.
      let snippet = '';
      const container = a.closest('.result, .web-result, [data-testid="result"]');
      if (container) {
        const snip = container.querySelector('a.result__snippet, .result__snippet');
        if (snip) snippet = clean(snip.textContent);
      }
      results.push({ title, url, snippet });
    }
    return results;
  },
};

/* ------------------------------------------------------------------ */
/*  Provider: Brave Search                                            */
/* ------------------------------------------------------------------ */

const brave = {
  label: 'Brave',
  buildUrl: q => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`,

  parse(html) {
    const doc = parseHTML(html);
    const results = [];

    // Brave wraps each result in a <div class="snippet"> with data-pos.
    const snippets = doc.querySelectorAll('.snippet[data-pos]');
    for (const el of snippets) {
      // Title: look for .search-snippet-title or any heading element.
      const titleEl = el.querySelector('.search-snippet-title, .title h2, h2, h3');
      if (!titleEl) continue;

      // The actual link — first <a> with an external href inside the snippet.
      const linkEl = el.querySelector('a[href^="http"]');
      if (!linkEl) continue;
      const href = linkEl.getAttribute('href');
      if (!href || href.includes('search.brave.com')) continue;

      // Title text — prefer the title attribute (cleaner), fall back to text.
      const title = clean(
        titleEl.getAttribute('title') || titleEl.textContent,
      );
      if (!title) continue;

      // Snippet: .generic-snippet or .snippet-description.
      const descEl = el.querySelector(
        '.generic-snippet, .snippet-description, .snippet-content',
      );

      results.push({
        title,
        url: href,
        snippet: clean(descEl?.textContent || ''),
      });
    }
    return results;
  },
};

/* ------------------------------------------------------------------ */
/*  Provider: Bing                                                    */
/* ------------------------------------------------------------------ */

const bing = {
  label: 'Bing',
  buildUrl: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,

  parse(html) {
    const doc = parseHTML(html);
    const results = [];

    // Bing wraps each result in <li class="b_algo">.
    const items = doc.querySelectorAll('li.b_algo');
    for (const el of items) {
      // Title + link live inside <h2><a href="...">title</a></h2>.
      const titleA = el.querySelector('h2 a[href]');
      if (!titleA) continue;
      const href = titleA.getAttribute('href');
      const title = clean(titleA.textContent);
      if (!title || !href) continue;

      // Skip Bing internal redirect links when possible — try to
      // extract the real URL from the redirect.  Bing encodes the
      // destination after &u=a1 in a base64-like format.
      let url = href;
      if (href.includes('bing.com/ck/')) {
        const uMatch = href.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
        if (uMatch) {
          try {
            // Bing uses a URL-safe base64 variant.
            const b64 = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
            url = decodeURIComponent(
              atob(b64).split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join(''),
            );
          } catch { /* keep the redirect URL as fallback */ }
        }
      }

      // Snippet: <div class="b_caption"><p>text</p></div>.
      const snippetEl = el.querySelector('.b_caption p, .b_caption .b_lineclamp2');

      results.push({
        title,
        url,
        snippet: clean(snippetEl?.textContent || ''),
      });
    }
    return results;
  },
};

/* ------------------------------------------------------------------ */
/*  Provider: Mojeek                                                  */
/* ------------------------------------------------------------------ */

const mojeek = {
  label: 'Mojeek',
  buildUrl: q => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`,

  parse(html) {
    const doc = parseHTML(html);
    const results = [];

    // Mojeek uses <ul class="results-standard"> with <li> items.
    const items = doc.querySelectorAll('ul.results-standard > li');
    for (const el of items) {
      // Title + link: <a class="title" href="...">title</a> inside <h2>.
      const titleA = el.querySelector('h2 a.title, a.title');
      if (!titleA) continue;
      const href = titleA.getAttribute('href');
      const title = clean(titleA.textContent);
      if (!title || !href) continue;
      if (href.startsWith('https://www.mojeek.com/')) continue;

      // Snippet: <p class="s">text</p>.
      const snippetEl = el.querySelector('p.s, .desc, .snippet');

      results.push({
        title,
        url: href,
        snippet: clean(snippetEl?.textContent || ''),
      });
    }
    return results;
  },
};

/* ------------------------------------------------------------------ */
/*  Provider registry                                                 */
/* ------------------------------------------------------------------ */

export const SCRAPE_PROVIDERS = {
  duckduckgo,
  brave,
  bing,
  mojeek,
};

/**
 * Search for a query using the specified provider.
 *
 * @param {string} query  — the search terms
 * @param {string} providerKey — one of the SCRAPE_PROVIDERS keys
 * @returns {Promise<{ title: string, url: string, snippet: string }[]>}
 */
export async function scrapeSearch(query, providerKey = 'brave') {
  const provider = SCRAPE_PROVIDERS[providerKey] || duckduckgo;
  const url = provider.buildUrl(query);
  const html = await fetchViaProxy(url);
  return provider.parse(html);
}
