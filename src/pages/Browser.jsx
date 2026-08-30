import React, { useEffect, useMemo, useRef, useState } from 'react';

import { storage } from '../lib/storage/localStorage';
import { SEARCH_ENGINES } from '../lib/settings';
import { useSettings } from '../Components/SettingsContext';
import { SCRAPE_PROVIDERS, fetchSearchHtml, getBackendUrl } from '../lib/searchProxy';
import { rebuildPage } from '../lib/pageRebuilder';
import { fullRender } from '../lib/fullRenderer';
import Icon from '../Components/Icon';
import WinControls from '../Components/Desktop/WinControls';

const QUICK_LINKS = [
  { title: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#e2e8f0' },
  { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org', color: '#86efac' },
  { title: 'Internet Archive', url: 'https://archive.org', color: '#fca5a5' },
  { title: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000' },
  { title: 'GitHub', url: 'https://github.com', color: '#c4b5fd' },
  { title: 'Reddit', url: 'https://www.reddit.com', color: '#fdba74' },
  { title: 'Twitch', url: 'https://www.twitch.tv', color: '#a78bfa' },
  { title: 'CF Docs', url: 'https://developers.cloudflare.com/', color: '#f48120' },
  { title: 'Google', url: 'https://www.google.com/webhp?igu=1', color: '#7dd3fc' },
];

let tabCounter = 0;
const newTab = () => ({ id: `tab-${++tabCounter}`, history: [], index: -1, reloadKey: 0 });

/** Convert address-bar input into a navigable URL. */
function resolveInput(input, searchUrl) {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`;
  return searchUrl + encodeURIComponent(value);
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** When the Cloudflare proxy is active, every target URL is rewritten to
 *  route through the Worker so CSP / X-Frame-Options restrictions are
 *  bypassed.  The helper below simply prefixes the proxy base. */

/** Route iframe URLs through backend proxy for CSP stripping. */
function toProxyUrl(url, proxyOrigin) {
  if (!url) return url;
  // If we have a Cloudflare Worker proxy, use it.
  if (proxyOrigin) return `${proxyOrigin}/proxy/${url}`;
  // Use the configured backend (Vercel or local).
  return `${getBackendUrl()}/api/web/proxy?url=${encodeURIComponent(url)}`;
}

// Backend proxy strips CSP restrictions, so nothing is truly blocked.
const isBlockedEmbed = () => false;

function BlockedEmbed({ url }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#141419] p-6 text-center">
      <Icon name="Globe" size={40} className="text-white/25" strokeWidth={1.2} />
      <h3 className="text-sm font-semibold text-white">{hostname(url)} can’t be embedded</h3>
      <p className="max-w-sm text-xs leading-relaxed text-white/45">
        This service blocks being shown inside other apps. Open it in a real browser tab instead —
        your Lithium tabs and bookmarks stay right here.
      </p>
      <a className="btn-primary px-4 py-2 text-xs" href={url} target="_blank" rel="noreferrer">
        <Icon name="ExternalLink" size={13} /> Open in new tab
      </a>
    </div>
  );
}

function NewTabPage({ onNavigate, searchUrl, scrapeProvider, onSearch }) {
  const [value, setValue] = useState('');
  const [activeProvider, setActiveProvider] = useState(scrapeProvider || 'duckduckgo');

  const providerKeys = Object.keys(SCRAPE_PROVIDERS);
  const providerLabel = SCRAPE_PROVIDERS[activeProvider]?.label || activeProvider;

  /* ---- Scraping search mode ---- */
  if (scrapeProvider) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto p-6">
        <div className="text-center">
          <span className="accent-soft-bg accent-text mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <Icon name="Search" className="h-7 w-7" />
          </span>
          <h2 className="text-xl font-bold text-white">{providerLabel}</h2>
          <p className="mt-1 text-sm text-white/40">Search the web or jump to a quick link</p>
        </div>

        {/* Provider tabs */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {providerKeys.map(key => (
            <button
              key={key}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                activeProvider === key
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/60'
              }`}
              onClick={() => setActiveProvider(key)}
            >
              {SCRAPE_PROVIDERS[key].label}
            </button>
          ))}
        </div>

        <form
          className="relative w-full max-w-lg"
          onSubmit={event => {
            event.preventDefault();
            if (value.trim()) onSearch(value.trim(), activeProvider);
          }}
        >
          <Icon name="Search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            autoFocus
            className="text-input rounded-full py-3 pl-11"
            placeholder={`Search ${providerLabel}…`}
            value={value}
            onChange={event => setValue(event.target.value)}
            aria-label={`Search ${providerLabel}`}
          />
        </form>

        <div className="grid w-full max-w-lg grid-cols-4 gap-3">
          {QUICK_LINKS.map((link, index) => (
            <button
              key={link.url}
              className="quick-link glass glass-hover flex flex-col items-center gap-2 p-3"
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onNavigate(link.url)}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold"
                style={{ backgroundColor: `${link.color}1a`, color: link.color }}
              >
                {link.title[0]}
              </span>
              <span className="w-full truncate text-center text-[11px] text-white/60">{link.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Default new tab ---- */
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto p-6">
      <div className="text-center">
        <span className="accent-soft-bg accent-text mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon name="Globe" className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-bold text-white">New tab</h2>
        <p className="mt-1 text-sm text-white/40">Search the web or jump to a quick link</p>
      </div>

      <form
        className="relative w-full max-w-lg"
        onSubmit={event => {
          event.preventDefault();
          if (!value.trim()) return;
          // If it looks like a URL or domain, navigate directly.
          const looksLikeUrl = /^[\w-]+(\.[\w-]+)+([/?].*)?$/.test(value.trim()) || value.trim().includes('://');
          if (looksLikeUrl) {
            const url = resolveInput(value, searchUrl);
            if (url) onNavigate(url);
          } else {
            // Otherwise, search using the clean search page.
            onSearch(value.trim(), 'duckduckgo');
          }
        }}
      >
        <Icon name="Search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          autoFocus
          className="text-input rounded-full py-3 pl-11"
          placeholder="Search or enter a website…"
          value={value}
          onChange={event => setValue(event.target.value)}
          aria-label="Search or enter a website"
        />
      </form>

      <div className="grid w-full max-w-lg grid-cols-4 gap-3">
        {QUICK_LINKS.map((link, index) => (
          <button
            key={link.url}
            className="quick-link glass glass-hover flex flex-col items-center gap-2 p-3"
            style={{ animationDelay: `${index * 40}ms` }}
            onClick={() => onNavigate(link.url)}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold"
              style={{ backgroundColor: `${link.color}1a`, color: link.color }}
            >
              {link.title[0]}
            </span>
            <span className="w-full truncate text-center text-[11px] text-white/60">{link.title}</span>
          </button>
        ))}
      </div>

      <p className="max-w-md text-center text-xs leading-relaxed text-white/25">
        Some sites block embedded viewing. If a page stays blank, use the open-in-new-tab button in
        the toolbar.
      </p>
    </div>
  );
}

export default function Browser({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized, initialUrl = null }) {
  const { settings } = useSettings();
  const searchUrl = SEARCH_ENGINES[settings.browser.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
  const proxyEnabled = Boolean(settings.browser?.proxyEnabled);
  const proxyBase = (settings.browser?.proxyUrl || '').replace(/\/+$/, '');
  const proxyOrigin = proxyEnabled && proxyBase ? proxyBase : '';
  const scrapeProvider = settings.browser?.scrapeProvider || '';
  const [tabs, setTabs] = useState(() => [newTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [addressDraft, setAddressDraft] = useState('');
  const [bookmarks, setBookmarks] = useState(() => storage.get('browser-bookmarks', []));
  const [loading, setLoading] = useState(false);
  const [reader, setReader] = useState(null); // { url, text, error }
  const [searchPage, setSearchPage] = useState(null); // { html, query, provider, providerKey, searchUrl }
  const [rebuiltPage, setRebuiltPage] = useState(null); // { html, title, source, readerable }
  const [fullRenderPage, setFullRenderPage] = useState(null); // { srcdoc, title, source }
  const [backendUp, setBackendUp] = useState(false);
  const draftRef = useRef(null);

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeId) || tabs[0], [tabs, activeId]);
  const currentUrl = activeTab.index >= 0 ? activeTab.history[activeTab.index] : null;

  useEffect(() => storage.set('browser-bookmarks', bookmarks), [bookmarks]);

  // Periodically check if the backend proxy is reachable.
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/web/proxy?url=${encodeURIComponent('https://example.com')}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000),
        });
        setBackendUp(res.ok);
      } catch {
        setBackendUp(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setAddressDraft(currentUrl || '');
    setReader(null);
    setSearchPage(null);
    setRebuiltPage(null);
    setFullRenderPage(null);
  }, [activeId, currentUrl]);

  // Deep-link support: other apps can open the browser at a URL.
  useEffect(() => {
    if (initialUrl) navigateActive(initialUrl);
  }, [initialUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTab = (id, updater) =>
    setTabs(prev => prev.map(tab => (tab.id === id ? updater(tab) : tab)));

  const navigateActive = url => {
    setSearchPage(null);
    setRebuiltPage(null);
    setFullRenderPage(null);
    setLoading(true);
    updateTab(activeTab.id, tab => ({
      ...tab,
      history: [...tab.history.slice(0, tab.index + 1), url],
      index: tab.index + 1,
      reloadKey: tab.reloadKey + 1,
    }));
  };

  /** Fetch search results and build a clean page inside the browser. */
  const handleSearch = async (query, providerKey = 'duckduckgo') => {
    const provider = SCRAPE_PROVIDERS[providerKey] || SCRAPE_PROVIDERS.duckduckgo;
    const searchUrl = provider.buildUrl(query);
    setAddressDraft(searchUrl);
    setSearchPage({ html: null, query, provider: provider.label, providerKey, searchUrl, loading: true });
    try {
      const { html: rawHtml, source } = await fetchSearchHtml(searchUrl);

      // Parse results using the provider's extractor.
      const results = provider.parse(rawHtml);

      // Build a clean search results page.
      const providerKeys = Object.keys(SCRAPE_PROVIDERS);
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const tabsHtml = providerKeys.map(key => {
        const lbl = SCRAPE_PROVIDERS[key].label;
        const active = key === providerKey;
        return `<button type="button" data-provider="${key}" class="sp-tab ${active ? 'sp-tab-active' : ''}">${lbl}</button>`;
      }).join('');

      const resultsHtml = results.length > 0
        ? results.map((r, i) => {
            let domain = '';
            try { domain = new URL(r.url).hostname.replace(/^www\./, ''); } catch { domain = r.url; }
            return `<a class="sp-result" href="${esc(r.url)}" data-index="${i}">
              <span class="sp-domain">${esc(domain)}</span>
              <span class="sp-title">${esc(r.title)}</span>
              ${r.snippet ? `<span class="sp-snippet">${esc(r.snippet)}</span>` : ''}
            </a>`;
          }).join('')
        : `<div class="sp-empty">
            <p>No results found</p>
            <p class="sp-empty-sub">Try a different query or switch provider above.</p>
           </div>`;

      const html = `<div class="sp-page">
        <div class="sp-accent"></div>
        <div class="sp-header">
          <form class="sp-search-form">
            <input class="sp-input" name="q" value="${esc(query)}" placeholder="Search the web…" autocomplete="off" />
          </form>
          <div class="sp-tabs">${tabsHtml}</div>
        </div>
        <div class="sp-body">
          <p class="sp-meta">${results.length} result${results.length !== 1 ? 's' : ''} via ${esc(provider.label)} · ${source}</p>
          <div class="sp-results">${resultsHtml}</div>
        </div>
      </div>
      <style>
        .sp-page{font-family:system-ui,-apple-system,sans-serif;background:#0f0f17;color:#fff;min-height:100vh}
        .sp-accent{height:3px;background:linear-gradient(90deg,#7c3aed,#06b6d4)}
        .sp-header{padding:20px 24px 0;max-width:720px;margin:0 auto}
        .sp-search-form{display:flex;gap:8px}
        .sp-input{flex:1;background:#1a1a26;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:10px 18px;color:#fff;font-size:14px;outline:none;transition:border-color .15s}
        .sp-input:focus{border-color:#7c3aed}
        .sp-tabs{display:flex;gap:4px;margin-top:12px;overflow-x:auto;padding-bottom:8px}
        .sp-tab{background:none;border:none;color:rgba(255,255,255,.4);font-size:12px;padding:6px 14px;border-radius:16px;cursor:pointer;white-space:nowrap;transition:all .15s}
        .sp-tab:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.7)}
        .sp-tab-active{background:rgba(124,58,237,.15);color:#a78bfa}
        .sp-body{max-width:720px;margin:0 auto;padding:16px 24px 40px}
        .sp-meta{font-size:12px;color:rgba(255,255,255,.25);margin-bottom:16px}
        .sp-results{display:flex;flex-direction:column;gap:2px}
        .sp-result{display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:12px;text-decoration:none;transition:background .12s}
        .sp-result:hover{background:rgba(255,255,255,.04)}
        .sp-domain{font-size:11px;color:rgba(255,255,255,.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sp-title{font-size:15px;font-weight:500;color:#8ab4f8}
        .sp-result:hover .sp-title{text-decoration:underline}
        .sp-snippet{font-size:13px;color:rgba(255,255,255,.45);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .sp-empty{text-align:center;padding:60px 20px;color:rgba(255,255,255,.35);font-size:14px}
        .sp-empty-sub{font-size:12px;color:rgba(255,255,255,.2);margin-top:6px}
      </style>`;

      setSearchPage(prev => ({ ...prev, html, loading: false }));
    } catch (err) {
      setSearchPage(prev => ({ ...prev, html: null, loading: false, error: err.message }));
    }
  };

  /** Handle clicks inside the search page div. */
  const handleSearchPageClick = (event) => {
    // Provider tab click — re-search with that provider.
    const tab = event.target.closest?.('[data-provider]');
    if (tab) {
      event.preventDefault();
      const key = tab.getAttribute('data-provider');
      if (key && searchPage?.query) handleSearch(searchPage.query, key);
      return;
    }
    // Result link click — navigate the browser.
    const anchor = event.target.closest?.('a[href]');
    if (anchor) {
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        navigateActive(href);
      }
    }
  };

  /** Handle form submissions inside the search page div. */
  const handleSearchPageSubmit = (event) => {
    const form = event.target.closest?.('.sp-search-form');
    if (form) {
      event.preventDefault();
      event.stopPropagation();
      const input = form.querySelector('input[name="q"]');
      const q = input?.value?.trim();
      if (q) handleSearch(q, searchPage?.providerKey || 'duckduckgo');
    }
  };

  const stepActive = direction =>
    updateTab(activeTab.id, tab => ({
      ...tab,
      index: Math.min(Math.max(tab.index + direction, 0), tab.history.length - 1),
      reloadKey: tab.reloadKey + 1,
    }));

  const reloadActive = () => updateTab(activeTab.id, tab => ({ ...tab, reloadKey: tab.reloadKey + 1 }));

  const goHome = () => {
    setSearchPage(null);
    setRebuiltPage(null);
    setFullRenderPage(null);
    updateTab(activeTab.id, tab => ({ ...tab, history: [], index: -1, reloadKey: tab.reloadKey + 1 }));
  };

  const addTab = () => {
    const tab = newTab();
    setTabs(prev => [...prev, tab]);
    setActiveId(tab.id);
  };

  const closeTab = id => {
    setTabs(prev => {
      const remaining = prev.filter(tab => tab.id !== id);
      if (remaining.length === 0) {
        const fresh = newTab();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(remaining[remaining.length - 1].id);
      return remaining;
    });
  };

  const submitAddress = event => {
    event.preventDefault();
    if (!addressDraft.trim()) return;
    // If it looks like a URL or domain, navigate directly.
    const looksLikeUrl = /^[\w-]+(\.[\w-]+)+([/?].*)?$/.test(addressDraft.trim()) || addressDraft.trim().includes('://');
    if (looksLikeUrl) {
      const url = resolveInput(addressDraft, searchUrl);
      if (url) navigateActive(url);
    } else {
      // Otherwise, search using the clean search page.
      handleSearch(addressDraft.trim(), scrapeProvider || 'duckduckgo');
    }
    draftRef.current?.blur();
  };

  const isBookmarked = currentUrl && bookmarks.some(mark => mark.url === currentUrl);

  /** Rebuild the current page using Readability. */
  const openRebuild = async () => {
    if (!currentUrl) return;
    setRebuiltPage({ html: null, title: '', source: '', readerable: false, loading: true });
    try {
      const result = await rebuildPage(currentUrl);
      setRebuiltPage({ ...result, loading: false });
    } catch (err) {
      setRebuiltPage({ html: null, title: '', source: '', readerable: false, loading: false, error: err.message });
    }
  };

  /** Handle clicks inside the rebuilt page — navigate links. */
  const handleRebuiltPageClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor) {
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        navigateActive(href);
      }
    }
  };

  /** Full render: fetch page, rewrite URLs, load in srcdoc iframe. */
  const openFullRender = async () => {
    if (!currentUrl) return;
    setFullRenderPage({ srcdoc: null, title: '', source: '', loading: true });
    try {
      const result = await fullRender(currentUrl);
      setFullRenderPage({ ...result, loading: false });
    } catch (err) {
      setFullRenderPage({ srcdoc: null, title: '', source: '', loading: false, error: err.message });
    }
  };

  /** Listen for navigation messages from the srcdoc iframe. */
  useEffect(() => {
    const handler = (event) => {
      const data = event.data;
      if (data?.type === 'lithium-navigate' && data.url) {
        navigateActive(data.url);
      } else if (data?.type === 'lithium-reload') {
        openFullRender();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [currentUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Reader fallback — uses Cloudflare proxy, scraping, or r.jina.ai. */
  const openReader = async () => {
    if (!currentUrl) return;
    setReader({ url: currentUrl, text: null, error: '' });
    try {
      if (proxyOrigin) {
        // Cloudflare proxy mode: fetch through the Worker
        const response = await fetch(toProxyUrl(currentUrl, proxyOrigin));
        const text = await response.text();
        setReader({ url: currentUrl, text, error: '' });
      } else if (scrapeProvider) {
        // Scraping mode: use the CORS proxy reader (r.jina.ai)
        const response = await fetch(`https://r.jina.ai/${currentUrl}`);
        const text = await response.text();
        setReader({ url: currentUrl, text, error: '' });
      } else {
        // Default: use Jina reader
        const response = await fetch(`https://r.jina.ai/${currentUrl}`);
        const text = await response.text();
        setReader({ url: currentUrl, text, error: '' });
      }
    } catch {
      setReader({ url: currentUrl, text: null, error: 'Could not fetch a readable copy.' });
    }
  };

  const toggleBookmark = () => {
    if (!currentUrl) return;
    setBookmarks(prev =>
      prev.some(mark => mark.url === currentUrl)
        ? prev.filter(mark => mark.url !== currentUrl)
        : [...prev, { title: hostname(currentUrl), url: currentUrl }]
    );
  };

  return (
    <div className={windowed ? 'flex h-full min-h-0 min-w-0 flex-col' : 'flex h-[calc(100dvh-57px)] min-w-0 flex-col md:h-dvh'}>
      {/* Tab strip */}
      <div className="flex min-w-0 items-center gap-1 overflow-hidden border-b border-white/[0.06] bg-[#0b0b12]/80 px-2 pt-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const url = tab.index >= 0 ? tab.history[tab.index] : null;
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`group flex max-w-52 min-w-36 cursor-pointer items-center gap-2 rounded-t-lg px-3 py-2 text-xs transition-colors ${
                  active ? 'bg-[#14141d] text-white' : 'text-white/45 hover:bg-white/5'
                }`}
                onClick={() => setActiveId(tab.id)}
              >
                <Icon name="Globe" className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{url ? hostname(url) : 'New tab'}</span>
                <button
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                  onClick={event => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  aria-label="Close tab"
                >
                  <Icon name="X" className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <button className="icon-btn mb-1 h-7 w-7 shrink-0" onClick={addTab} aria-label="New tab">
            <Icon name="Plus" className="h-4 w-4" />
          </button>
        </div>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-[#0b0b12]/80 px-3 py-2 backdrop-blur">
        <button className="icon-btn h-8 w-8" onClick={() => stepActive(-1)} disabled={activeTab.index <= 0} aria-label="Back">
          <Icon name="ArrowLeft" className="h-4 w-4" />
        </button>
        <button
          className="icon-btn h-8 w-8"
          onClick={() => stepActive(1)}
          disabled={activeTab.index >= activeTab.history.length - 1}
          aria-label="Forward"
        >
          <Icon name="ArrowRight" className="h-4 w-4" />
        </button>
        <button className="icon-btn h-8 w-8" onClick={reloadActive} disabled={!currentUrl} aria-label="Reload">
          <Icon name="RotateCw" className="h-4 w-4" />
        </button>
        <button className="icon-btn h-8 w-8" onClick={goHome} aria-label="Home">
          <Icon name="Home" className="h-4 w-4" />
        </button>

        <form className="relative flex-1" onSubmit={submitAddress}>
          <Icon name="Globe" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            ref={draftRef}
            className="text-input rounded-full py-1.5 pl-9 text-xs"
            value={addressDraft}
            onChange={event => setAddressDraft(event.target.value)}
            placeholder="Search or enter a URL"
            aria-label="Address bar"
            spellCheck={false}
          />
        </form>

        <button
          className={`icon-btn h-8 w-8 ${isBookmarked ? 'text-yellow-300' : ''}`}
          onClick={toggleBookmark}
          disabled={!currentUrl}
          aria-label="Bookmark this page"
        >
          <Icon name="Star" className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>
        <button
          className={`icon-btn h-8 w-8 ${reader ? 'text-cyan-300' : ''}`}
          onClick={() => (reader ? setReader(null) : openReader())}
          disabled={!currentUrl}
          title="Reader mode — for sites that show a blank page"
          aria-label="Reader mode"
        >
          <Icon name="BookOpen" className="h-4 w-4" />
        </button>
        <button
          className={`icon-btn h-8 w-8 ${rebuiltPage ? 'text-purple-300' : ''}`}
          onClick={() => (rebuiltPage ? setRebuiltPage(null) : openRebuild())}
          disabled={!currentUrl}
          title="Rebuild mode — extract and re-render page content"
          aria-label="Rebuild mode"
        >
          <Icon name="Layout" className="h-4 w-4" />
        </button>
        <button
          className={`icon-btn h-8 w-8 ${fullRenderPage ? 'text-green-300' : ''}`}
          onClick={() => (fullRenderPage ? setFullRenderPage(null) : openFullRender())}
          disabled={!currentUrl}
          title="Full render — fetch and rebuild with URL rewriting"
          aria-label="Full render"
        >
          <Icon name="Eye" className="h-4 w-4" />
        </button>
        {currentUrl && (
          <a className="icon-btn h-8 w-8" href={currentUrl} target="_blank" rel="noreferrer" aria-label="Open in new tab">
            <Icon name="ExternalLink" className="h-4 w-4" />
          </a>
        )}
        {proxyEnabled && (
          <span className="flex h-7 items-center gap-1 rounded-full bg-cyan-500/10 px-2 text-[10px] font-medium text-cyan-300" title="Cloudflare proxy active">
            <Icon name="Shield" className="h-3 w-3" /> CF
          </span>
        )}
        {scrapeProvider && (
          <span className="flex h-7 items-center gap-1 rounded-full bg-orange-500/10 px-2 text-[10px] font-medium text-orange-300" title={`${SCRAPE_PROVIDERS[scrapeProvider]?.label || scrapeProvider} scraping active`}>
            <Icon name="Search" className="h-3 w-3" /> {SCRAPE_PROVIDERS[scrapeProvider]?.label?.slice(0, 4) || 'Web'}
          </span>
        )}
        <span
          className={`flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-medium ${
            backendUp
              ? 'bg-green-500/10 text-green-300'
              : 'bg-red-500/10 text-red-300'
          }`}
          title={backendUp ? 'Backend proxy online' : 'Backend offline — using public CORS proxies'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${backendUp ? 'bg-green-400' : 'bg-red-400'}`} />
          {backendUp ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Bookmark bar */}
      {bookmarks.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-[#0b0b12]/60 px-3 py-1.5">
          <Icon name="Bookmark" className="mr-1 h-3.5 w-3.5 shrink-0 text-white/25" />
          {bookmarks.map(mark => (
            <span key={mark.url} className="group flex shrink-0 items-center">
              <button
                className="rounded-lg px-2.5 py-1 text-xs text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => navigateActive(mark.url)}
              >
                {mark.title}
              </button>
              <button
                className="rounded p-0.5 text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                onClick={() => setBookmarks(prev => prev.filter(item => item.url !== mark.url))}
                aria-label={`Remove bookmark ${mark.title}`}
              >
                <Icon name="X" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Viewport */}
      <div className="relative flex-1 bg-[#14141d]">
        {loading && <div className="browser-progress" />}
        {tabs.map(tab => {
          const url = tab.index >= 0 ? tab.history[tab.index] : null;
          const active = tab.id === activeId;
          if (!active) return null;
          return (
            <div key={tab.id} className="browser-view absolute inset-0">
              {fullRenderPage ? (
                fullRenderPage.loading ? (
                  <div className="flex h-full items-center justify-center gap-2 bg-[#141419] text-sm text-white/40">
                    <Icon name="Loader2" size={16} className="animate-spin" /> Fetching and rebuilding…
                  </div>
                ) : fullRenderPage.error || !fullRenderPage.srcdoc ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#141419] text-sm text-white/50">
                    <p>{fullRenderPage.error || 'Could not render this page'}</p>
                    <button className="btn-ghost rounded-lg px-3 py-1.5 text-xs" onClick={() => setFullRenderPage(null)}>Back to normal view</button>
                  </div>
                ) : (
                  <iframe
                    key={`fr-${tab.reloadKey}`}
                    srcDoc={fullRenderPage.srcdoc}
                    title={`Rebuilt: ${hostname(url || '')}`}
                    className="h-full w-full border-0 bg-white"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                  />
                )
              ) : rebuiltPage ? (
                rebuiltPage.loading ? (
                  <div className="flex h-full items-center justify-center gap-2 bg-[#141419] text-sm text-white/40">
                    <Icon name="Loader2" size={16} className="animate-spin" /> Rebuilding page…
                  </div>
                ) : rebuiltPage.error || !rebuiltPage.html ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#141419] text-sm text-white/50">
                    <p>{rebuiltPage.error || 'Could not rebuild this page'}</p>
                    <button className="btn-ghost rounded-lg px-3 py-1.5 text-xs" onClick={() => setRebuiltPage(null)}>Back to normal view</button>
                  </div>
                ) : (
                  <div
                    className="search-page-viewport h-full w-full overflow-auto"
                    onClick={handleRebuiltPageClick}
                    dangerouslySetInnerHTML={{ __html: rebuiltPage.html }}
                  />
                )
              ) : searchPage ? (
                searchPage.loading ? (
                  <div className="flex h-full items-center justify-center gap-2 bg-[#141419] text-sm text-white/40">
                    <Icon name="Loader2" size={16} className="animate-spin" /> Searching {searchPage.provider}…
                  </div>
                ) : searchPage.error || !searchPage.html ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#141419] text-sm text-white/50">
                    <p>{searchPage.error || 'No results'}</p>
                    <p className="text-xs text-white/30">Try a different provider or query.</p>
                  </div>
                ) : (
                  <div
                    className="search-page-viewport h-full w-full overflow-auto bg-white"
                    onClick={handleSearchPageClick}
                    onSubmit={handleSearchPageSubmit}
                    dangerouslySetInnerHTML={{ __html: searchPage.html }}
                  />
                )
              ) : url ? (
                isBlockedEmbed(url, proxyEnabled) ? (
                  <BlockedEmbed url={url} />
                ) : (
                  <iframe
                  key={tab.reloadKey}
                  src={backendUp ? toProxyUrl(url, proxyOrigin) : (proxyOrigin ? `${proxyOrigin}/proxy/${url}` : url)}
                  title={hostname(url)}
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="no-referrer"
                  onLoad={() => setLoading(false)}
                  />
                )
              ) : (
                <NewTabPage onNavigate={navigateActive} searchUrl={searchUrl} scrapeProvider={scrapeProvider} onSearch={handleSearch} />
              )}
            </div>
          );
        })}

        {/* Reader mode overlay */}
        {reader && (
          <div className="absolute inset-0 z-10 flex flex-col bg-[#14141d]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-white/60">
              <Icon name="BookOpen" size={14} className="text-cyan-300" />
              <span className="min-w-0 flex-1 truncate">Reader mode · {hostname(reader.url)}</span>
              <button className="icon-btn h-7 w-7" onClick={() => setReader(null)} aria-label="Close reader"><Icon name="X" size={14} /></button>
            </div>
            {reader.text === null && !reader.error ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-white/40"><Icon name="Loader2" size={16} className="animate-spin" /> Fetching readable copy…</div>
            ) : reader.error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/50">
                {reader.error}
                <a className="btn-ghost px-3 py-1.5 text-xs" href={reader.url} target="_blank" rel="noreferrer">Open in a real tab</a>
              </div>
            ) : (
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-5 font-sans text-[13px] leading-relaxed text-white/80">{reader.text}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
