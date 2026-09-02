/**
 * NewTabPage — Brave-style flex column layout.
 *
 * Structure (matches Brave's app.tsx):
 *   - Clock: absolutely positioned top-left
 *   - Settings gear: absolutely positioned top-right
 *   - Top Sites: centered in flow
 *   - Search box: centered below top sites
 *   - Spacer: flex: 1 pushes widgets to bottom
 *   - Stats widget: at bottom
 *   - Footer (photo credits): at very bottom
 *
 * Provider tabs are in the floating BackgroundControls bar at the bottom.
 */
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { currentUrl, navigateTab, activeTab, updateTab } from './stores/tabStore';
import { clearAllModes } from './stores/browserStore';
import { activeSearchProvider } from './stores/searchStore';
import { topSites, currentBackground, showTopSites, showClock, showStatsWidget, showNewsWidget } from './stores/newTabStore';
import { checkDailyReset } from './stores/shieldsStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import { renderSearchResults } from '../../lib/searchResultsRenderer';
import { startRotation, cleanupRotation } from './io/backgrounds';
import { SEARCH_ENGINES } from '../../lib/settings';
import { useSettings } from '../../Components/SettingsContext';
import BackgroundImage from './BackgroundImage';
import BackgroundControls from './BackgroundControls';
import SearchWidget from './SearchWidget';
import TopSitesGrid from './TopSitesGrid';
import BraveStatsWidget from './BraveStatsWidget';
import ClockWidget from './ClockWidget';
import NewsWidget from './NewsWidget';
import WidgetStack from './WidgetStack';
import NtpSettingsModal from './NtpSettingsModal';
import * as core from '../../lib/core';

export default function NewTabPage() {
  const { settings } = useSettings();
  const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
  const [value, setValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeProvider = activeSearchProvider.value;

  // Scroll-linked background fade: --ntp-scroll-progress 0→1
  const handleScroll = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const progress = Math.min(el.scrollTop / 400, 1);
    el.style.setProperty('--ntp-scroll-progress', String(progress));
  }, []);

  // Daily reset check + background rotation
  useEffect(() => {
    checkDailyReset();
    startRotation();
    return () => cleanupRotation();
  }, []);

  const handleNavigate = useCallback((url) => {
    const tab = activeTab.value;
    clearAllModes();
    navigateTab(tab.id, url);
  }, []);

  const handleSearch = useCallback(async (query) => {
    const pKey = activeSearchProvider.value;
    const tab = activeTab.value;
    const provider = SCRAPE_PROVIDERS[pKey] || SCRAPE_PROVIDERS.duckduckgo;
    const searchUrl = provider.buildUrl(query);

    // Navigate tab to the real search URL with search mode (shows in omnibox)
    navigateTab(tab.id, searchUrl, 'search');
    updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey: pKey, searchUrl, loading: true } });

    try {
      const result = await renderSearchResults(query, pKey);
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
      updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey: pKey, searchUrl, loading: false, error: err.message } });
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    const trimmed = value.trim();
    // Resolve via Rust
    const resolved = core.browserResolveInputSync(trimmed, searchUrl);
    if (resolved) {
      if (resolved.kind === 'url') {
        handleNavigate(resolved.value);
      } else {
        handleSearch(trimmed);
      }
    } else {
      // JS fallback
      const looksLikeUrl = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(trimmed) || /^https?:\/\//i.test(trimmed);
      if (looksLikeUrl) {
        const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        handleNavigate(finalUrl);
      } else {
        handleSearch(trimmed);
      }
    }
    setValue('');
  };

  const bg = currentBackground.value;

  return (
    <div className="ntp-root" ref={rootRef} onScroll={handleScroll}>
      {/* Background image layer */}
      <BackgroundImage />

      {/* Scroll-linked darkening/blur overlay */}
      <div className="ntp-bg-overlay" />

      {/* CSS Grid content layer — matches Brave's Page grid */}
      <div className={`ntp-page${searchFocused ? ' ntp-search-focused' : ''}`}>
        {/* Clock — top-left corner (matches Brave .clock) */}
        {showClock.value && (
          <div className="ntp-clock-pos">
            <ClockWidget />
          </div>
        )}

        {/* Settings gear — top-right corner (matches Brave .settings) */}
        <button className="ntp-settings-pos ntp-nav-btn" title="Customize this page" aria-label="New tab settings" onClick={() => setSettingsOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Top Sites — centered in flow */}
        {showTopSites.value && (
          <section className="ntp-grid-top-sites">
            <TopSitesGrid onNavigate={handleNavigate} />
          </section>
        )}

        {/* Search — centered below top sites */}
        <section className="ntp-grid-search">
          <SearchWidget
            value={value}
            onInput={setValue}
            onSubmit={handleSubmit}
            activeProvider={activeProvider}
            onProviderChange={(key) => { activeSearchProvider.value = key; }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </section>

        {/* Spacer — pushes widgets to bottom (matches Brave .spacer) */}
        <div className="ntp-spacer" />

        {/* Widget row — tabbed stacks (matches Brave .widget-container) */}
        {(showStatsWidget.value || showNewsWidget.value) && (
          <div className="ntp-widget-row">
            <WidgetStack tabs={['stats', 'news'].filter(t => t === 'stats' ? showStatsWidget.value : showNewsWidget.value)}>
              {{ key: 'stats', content: <BraveStatsWidget /> }}
              {{ key: 'news', content: <NewsWidget /> }}
            </WidgetStack>
          </div>
        )}

        {/* Footer — photo credits at bottom */}
        <footer className="ntp-footer">
          <div className="ntp-credits">
            {bg?.author && (
              <span className="ntp-credits-text">
                {bg.title}{bg.author && <> by {bg.author}</>}{bg.attribution && <> / {bg.attribution}</>}
              </span>
            )}
          </div>
        </footer>
      </div>

      {/* Floating bottom controls: provider pills + background rotation */}
      <BackgroundControls />

      {/* NTP Settings Modal */}
      <NtpSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
