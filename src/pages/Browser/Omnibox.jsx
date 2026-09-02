/**
 * Omnibox — Brave-style address bar.
 * Pill-shaped with a security/lock icon on the left.
 * Shows suggestions dropdown with history, bookmarks, and top sites.
 */
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { navigateTab, currentUrl, updateTab, activeTab } from './stores/tabStore';
import { historyEntries } from './stores/historyStore';
import { bookmarks } from './stores/bookmarksStore';
import { topSites } from './stores/newTabStore';
import { clearAllModes } from './stores/browserStore';
import { activeSearchProvider } from './stores/searchStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import { renderSearchResults } from '../../lib/searchResultsRenderer';
import * as core from '../../lib/core';
import Icon from '../../Components/Icon';
import { SEARCH_ENGINES } from '../../lib/settings';
import { useSettings } from '../../Components/SettingsContext';

function hostname(url) {
  const result = core.browserHostnameSync(url);
  if (result) return result;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function isSecure(url) {
  return url && (url.startsWith('https://') || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('lithium://'));
}

export default function Omnibox({ inputRef, onNavigate }) {
  const { settings } = useSettings();
  const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
  const url = currentUrl.value;

  // Display: hide internal lithium://newtab URL from the user
  const displayUrl = url === 'lithium://newtab' ? '' : url;

  const [draft, setDraft] = useState(displayUrl || '');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  // Sync draft with current URL when tab changes
  useEffect(() => { setDraft(displayUrl || ''); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced suggestion ranking
  useEffect(() => {
    if (!focused || !draft.trim()) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      const result = core.browserOmniboxRankSync(
        draft.toLowerCase(),
        historyEntries.value.slice(0, 50),
        bookmarks.value,
        topSites.value
      );
      setSuggestions(result || []);
      setSelectedIdx(-1);
    }, 150);
    return () => clearTimeout(timer);
  }, [draft, focused]);

  const submit = useCallback((value) => {
    const trimmed = (value || draft).trim();
    if (!trimmed) return;
    const resolved = core.browserResolveInputSync(trimmed, searchUrl);
    if (resolved) {
      if (resolved.kind === 'url') {
        clearAllModes();
        onNavigate(resolved.value);
      } else {
        handleSearch(trimmed);
      }
    } else {
      const looksLikeUrl = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(trimmed) || /^https?:\/\//i.test(trimmed);
      if (looksLikeUrl) {
        const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
      updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey, searchUrl, loading: false, error: err.message } });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        const s = suggestions[selectedIdx];
        if (s.type === 'history' || s.type === 'topsite') {
          clearAllModes();
          onNavigate(s.url);
        } else {
          submit(s.title);
        }
      } else {
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
              key={`${s.type}-${s.url}-${i}`}
              className={`browser-dropdown-item ${i === selectedIdx ? 'bg-white/[0.08] text-white' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                if (s.type === 'history' || s.type === 'topsite') {
                  clearAllModes();
                  onNavigate(s.url);
                } else {
                  submit(s.title);
                }
                setFocused(false);
              }}
            >
              <Icon
                name={s.type === 'bookmark' ? 'Star' : s.type === 'history' ? 'Clock' : 'Globe'}
                className="h-3.5 w-3.5 shrink-0 opacity-40"
              />
              <span className="flex-1 truncate">{s.title || s.url}</span>
              <span className="shrink-0 text-[10px] opacity-30">{s.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
