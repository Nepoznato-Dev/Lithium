/**
 * Omnibox — Brave-style address bar with rich suggestions.
 * Pill-shaped with a security/lock icon on the left.
 * Shows unified suggestions: history, bookmarks, top sites,
 * search engine keywords, calculator, and open tabs.
 */
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { navigateTab, currentUrl, updateTab, activeTab, tabs, setActiveTab } from './stores/tabStore';
import { historyEntries } from './stores/historyStore';
import { bookmarks } from './stores/bookmarksStore';
import { topSites } from './stores/newTabStore';
import { clearAllModes } from './stores/browserStore';
import { activeSearchProvider } from './stores/searchStore';
import { engines, resolveKeyword, buildSearchUrl } from './stores/searchEngineStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import { renderSearchResults } from '../../lib/searchResultsRenderer';
import Icon from '../../Components/Icon';
import { SEARCH_ENGINES } from '../../lib/settings';
import { useSettings } from '../../Components/SettingsContext';

function hostname(url) {
  if (!url) return '';
  let s = url;
  const schemeIdx = s.indexOf('://');
  if (schemeIdx >= 0) s = s.slice(schemeIdx + 3);
  s = s.split(/[/?#]/)[0];
  if (s.startsWith('www.')) s = s.slice(4);
  s = s.split(':')[0];
  return s;
}

function isSecure(url) {
  return url && (url.startsWith('https://') || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('lithium://'));
}

export default function Omnibox({ inputRef, onNavigate }) {
  const { settings } = useSettings();
  const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
  const url = currentUrl.value;

  // Display: hide internal lithium://newtab URL from the user; show other lithium:// pages as-is
  const displayUrl = url === 'lithium://newtab' ? '' : url;

  const [draft, setDraft] = useState(displayUrl || '');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  // Sync draft with current URL when tab changes
  useEffect(() => { setDraft(displayUrl || ''); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced suggestion ranking (C3: rich omnibox with unified suggestions)
  useEffect(() => {
    if (!focused || !draft.trim()) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      const query = draft.toLowerCase();
      const results = [];

      // 1. Keyword shortcut detection (C2): "yt cats" → YouTube search
      const firstSpace = draft.indexOf(' ');
      if (firstSpace > 0) {
        const potentialKw = draft.slice(0, firstSpace);
        const kwEngine = resolveKeyword(potentialKw);
        if (kwEngine) {
          const searchQuery = draft.slice(firstSpace + 1).trim();
          results.push({
            type: 'keyword',
            title: `Search ${kwEngine.label} for "${searchQuery}"`,
            url: buildSearchUrl(kwEngine, searchQuery),
            keyword: kwEngine.keyword,
            engine: kwEngine,
            searchQuery,
          });
        }
      }

      // 2. Keyword suggestions — show engines that match the typed prefix
      const allEngines = engines.value;
      for (const eng of allEngines) {
        if (eng.keyword && eng.keyword.startsWith(query)) {
          results.push({
            type: 'engine',
            title: `${eng.label} (type ${eng.keyword} + space to search)`,
            url: '',
            keyword: eng.keyword,
            engine: eng,
          });
        }
      }

      // 3. Calculator — simple arithmetic
      try {
        if (/^[\d\s+\-*/().]+$/.test(draft) && /\d/.test(draft)) {
           
          const calcResult = Function(`"use strict"; return (${draft})`)();
          if (typeof calcResult === 'number' && isFinite(calcResult)) {
            results.push({ type: 'calc', title: `= ${calcResult}`, url: '', value: String(calcResult) });
          }
        }
      } catch {}

      // 4. Open tabs
      const openTabs = tabs.value.filter(t => {
        const tabUrl = t.history[t.index]?.url || '';
        return tabUrl && tabUrl !== 'lithium://newtab' && (
          (t.title && t.title.toLowerCase().includes(query)) ||
          tabUrl.toLowerCase().includes(query)
        );
      });
      for (const t of openTabs.slice(0, 3)) {
        const tabUrl = t.history[t.index]?.url || '';
        results.push({ type: 'tab', title: t.title || tabUrl, url: tabUrl, tabId: t.id });
      }

      // 5. Omnibox ranking for history, bookmarks, top sites
      const q = draft.toLowerCase();
      const scored = [];
      const _rankItem = (title, url, query, weight) => {
        if (!query) return weight * 0.5;
        const tl = (title || '').toLowerCase(), ul = (url || '').toLowerCase();
        if (tl.startsWith(query)) return weight * 3;
        if (ul.startsWith(query)) return weight * 2.5;
        if (tl.includes(query)) return weight * 2;
        if (ul.includes(query)) return weight * 1.5;
        for (const w of tl.split(/\s+/)) { if (w.startsWith(query)) return weight * 1.8; }
        return 0;
      };
      if (Array.isArray(bookmarks.value)) for (const b of bookmarks.value) {
        const s = _rankItem(b.title, b.url, q, 1.5);
        if (s > 0) scored.push({ title: b.title || '', url: b.url || '', type: 'bookmark', score: s });
      }
      if (Array.isArray(historyEntries.value)) for (const h of historyEntries.value.slice(0, 50)) {
        const recency = 1 + Math.max(0, Math.min(30, (h.timestamp || 0) / 86400000)) / 30;
        const s = _rankItem(h.title, h.url, q, 1.2) * recency;
        if (s > 0) scored.push({ title: h.title || '', url: h.url || '', type: 'history', score: s });
      }
      if (Array.isArray(topSites.value)) for (const t of topSites.value) {
        const s = _rankItem(t.title, t.url, q, 2.0);
        if (s > 0) scored.push({ title: t.title || '', url: t.url || '', type: 'topsite', score: s });
      }
      scored.sort((a, b) => b.score - a.score);
      const wasmResult = scored.slice(0, 8);
      if (wasmResult) results.push(...wasmResult);

      setSuggestions(results.slice(0, 12));
      setSelectedIdx(-1);
    }, 120);
    return () => clearTimeout(timer);
  }, [draft, focused]);

  const submit = useCallback((value) => {
    const trimmed = (value || draft).trim();
    if (!trimmed) return;
    // Resolve input: URL or search
    let resolved;
    {
      const t = trimmed;
      if (/^lithium:\/\//.test(t)) resolved = { kind: 'url', value: t };
      else if (/^https?:\/\//.test(t)) resolved = { kind: 'url', value: t };
      else {
        const host = t.split(/[/:?]/)[0];
        const dots = host.split('.');
        if (dots.length >= 2 && dots.every(s => s.length > 0 && /^[a-zA-Z0-9-]+$/.test(s)) && t.length >= 4) {
          resolved = { kind: 'url', value: `https://${t}` };
        } else {
          resolved = { kind: 'search', value: `${searchUrl}${t}` };
        }
      }
    }
    if (resolved) {
      if (resolved.kind === 'url') {
        clearAllModes();
        onNavigate(resolved.value);
      } else {
        handleSearch(trimmed);
      }
    } else {
      const looksLikeUrl = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(trimmed) || /^(https?|lithium):\/\//i.test(trimmed);
      if (looksLikeUrl) {
        const finalUrl = /^(https?|lithium):\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        clearAllModes();
        onNavigate(finalUrl);
      } else {
        handleSearch(trimmed);
      }
    }
    setFocused(false);
    inputRef.current?.blur();
  }, [draft, searchUrl, onNavigate]);

  const handleSearch = async (query) => {
    const providerKey = activeSearchProvider.value;
    const tab = activeTab.value;
    const provider = SCRAPE_PROVIDERS[providerKey] || SCRAPE_PROVIDERS.duckduckgo;
    const searchUrl = provider.buildUrl(query);

    // Navigate tab to the real search URL with search mode (shows in omnibox)
    navigateTab(tab.id, searchUrl, 'search');
    updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey, searchUrl, loading: true } });

    try {
      const result = await renderSearchResults(query, providerKey);
      updateTab(tab.id, {
        searchData: {
          html: result.html,
          query,
          provider: result.provider,
          providerKey: result.providerKey,
          searchUrl: result.searchUrl,
          loading: false,
        }
      });
    } catch (err) {
      updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey, searchUrl, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
    }
  };

  /** Search using a specific engine (keyword shortcut). */
  const handleKeywordSearch = async (engine, query) => {
    if (!query || !engine) return;
    const searchUrl = buildSearchUrl(engine, query);
    clearAllModes();
    // If the engine URL is a standard search URL, use search mode
    const tab = activeTab.value;
    navigateTab(tab.id, searchUrl, 'search');
    // Try to use the scrape proxy for results
    const providerKey = activeSearchProvider.value;
    updateTab(tab.id, { searchData: { html: null, query, provider: engine.label, providerKey, searchUrl, loading: true } });
    try {
      const result = await renderSearchResults(query, providerKey);
      updateTab(tab.id, {
        searchData: {
          html: result.html, query, provider: result.provider,
          providerKey: result.providerKey, searchUrl: result.searchUrl, loading: false,
        }
      });
    } catch (err) {
      if (err.isCaptchaError) {
        updateTab(tab.id, { searchData: { html: null, query, provider: engine.label, providerKey, searchUrl, loading: false, error: err.message, isCaptchaError: true } });
        return;
      }
      // Fallback: just navigate to the engine's search URL directly
      clearAllModes();
      onNavigate(searchUrl);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        const s = suggestions[selectedIdx];
        if (s.type === 'keyword') {
          // Keyword search: navigate to the search URL
          clearAllModes();
          handleKeywordSearch(s.engine, s.searchQuery);
        } else if (s.type === 'tab') {
          // Switch to open tab
          setActiveTab(s.tabId);
        } else if (s.type === 'calc') {
          // Copy result to clipboard
          try { navigator.clipboard?.writeText(s.value); } catch {}
          setFocused(false);
          inputRef.current?.blur();
          return;
        } else if (s.type === 'engine') {
          // Just set the keyword as draft with trailing space
          setDraft(s.keyword + ' ');
          return;
        } else if (s.type === 'history' || s.type === 'topsite') {
          clearAllModes();
          onNavigate(s.url);
        } else {
          submit(s.title);
        }
      } else {
        // Check if the draft starts with a keyword
        const firstSpace = draft.indexOf(' ');
        if (firstSpace > 0) {
          const kw = resolveKeyword(draft.slice(0, firstSpace));
          if (kw) {
            handleKeywordSearch(kw, draft.slice(firstSpace + 1).trim());
            setFocused(false);
            inputRef.current?.blur();
            return;
          }
        }
        submit();
      }
      setFocused(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setFocused(false);
      setDraft(displayUrl || '');
      inputRef.current?.blur();
    }
  };

  const secure = isSecure(url);

  return (
    <div className="relative flex-1">
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="browser-omnibox-bar">
        {/* Left: search engine / search icon */}
        <button type="button" className="browser-omnibox-btn" title="Search provider" aria-label="Search provider">
          <Icon name="Search" className="h-3.5 w-3.5" />
        </button>

        {/* Center: text input */}
        <input
          ref={inputRef}
          className="browser-omnibox"
          value={draft}
          onInput={e => setDraft(e.target.value)}
          onFocus={() => { setFocused(true); inputRef.current?.select(); }}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter a URL"
          aria-label="Address bar"
          spellCheck={false}
        />

        {/* Right: site identity */}
        <button type="button" className="browser-omnibox-btn" title={url ? (secure ? 'Secure connection' : 'Not secure') : ''} aria-label="Site identity">
          {url ? (
            secure
              ? <Icon name="Lock" className="h-3.5 w-3.5 text-green-400/70" />
              : <Icon name="AlertCircle" className="h-3.5 w-3.5 text-orange-400/70" />
          ) : (
            <Icon name="Info" className="h-3.5 w-3.5 text-white/25" />
          )}
        </button>
      </form>

      {/* Suggestions dropdown */}
      {focused && suggestions.length > 0 && (
        <div className="browser-dropdown absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto py-1">
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.url || s.keyword || i}-${i}`}
              className={`browser-dropdown-item ${i === selectedIdx ? 'bg-white/[0.08] text-white' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                if (s.type === 'keyword') {
                  clearAllModes();
                  handleKeywordSearch(s.engine, s.searchQuery);
                } else if (s.type === 'tab') {
                  setActiveTab(s.tabId);
                } else if (s.type === 'calc') {
                  try { navigator.clipboard?.writeText(s.value); } catch {}
                } else if (s.type === 'engine') {
                  setDraft(s.keyword + ' ');
                  return;
                } else if (s.type === 'history' || s.type === 'topsite') {
                  clearAllModes();
                  onNavigate(s.url);
                } else {
                  submit(s.title);
                }
                setFocused(false);
              }}
            >
              <Icon
                name={
                  s.type === 'bookmark' ? 'Star' :
                  s.type === 'history' ? 'Clock' :
                  s.type === 'tab' ? 'Monitor' :
                  s.type === 'keyword' ? 'Search' :
                  s.type === 'engine' ? 'Hash' :
                  s.type === 'calc' ? 'Calculator' :
                  'Globe'
                }
                className="h-3.5 w-3.5 shrink-0 opacity-40"
              />
              <span className="flex-1 truncate">{s.title || s.url}</span>
              <span className="shrink-0 text-[10px] opacity-30">
                {s.type === 'keyword' ? s.keyword :
                 s.type === 'engine' ? 'engine' :
                 s.type === 'tab' ? 'tab' :
                 s.type === 'calc' ? '=' :
                 s.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
