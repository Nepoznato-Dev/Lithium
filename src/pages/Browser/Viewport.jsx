/**
 * Viewport — the main page content area.
 * Renders the active tab's content based on viewport mode:
 *   normal (iframe), search, reader, rebuild, fullRender, or new tab.
 */
import { useEffect, useState, useRef } from 'preact/hooks';
import { activeTab, currentUrl, setTabLoading, setTabTitle, updateTab, activeTabMode, activeTabSearchData } from './stores/tabStore';
import { readerData, rebuildData, fullRenderData, setViewportMode, backendUp } from './stores/browserStore';
import { activeSearchProvider } from './stores/searchStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import { buildProxyUrl } from './io/network';
import { renderSearchResults } from '../../lib/searchResultsRenderer';
import { hoverUrl } from './StatusBar';
import NewTabPage from './NewTabPage';
import Icon from '../../Components/Icon';
import * as core from '../../lib/core';
import { useSettings } from '../../Components/SettingsContext';
import { authUser, getAuthEmail, initAuth } from './stores/authStore';

function hostname(url) {
  const result = core.browserHostnameSync(url);
  if (result) return result;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function Viewport() {
  const { settings } = useSettings();
  const tab = activeTab.value;
  const url = currentUrl.value;
  const mode = activeTabMode.value;
  const sp = activeTabSearchData.value;
  const proxyEnabled = Boolean(settings.browser?.proxyEnabled);
  const proxyBase = (settings.browser?.proxyUrl || '').replace(/\/+$/, '');
  const proxyOrigin = proxyEnabled && proxyBase ? proxyBase : '';
  const [captchaDetected, setCaptchaDetected] = useState(false);
  const [popupUrl, setPopupUrl] = useState(null);
  const [loginFormDetected, setLoginFormDetected] = useState(false);
  const iframeRef = useRef(null);

  // Initialise Supabase auth on first render
  useEffect(() => { initAuth(); }, []);

  // Re-fetch search results when navigating back to a search URL without cached data
  useEffect(() => {
    if (mode === 'search' && !sp && url) {
      let query = '';
      try { query = new URL(url).searchParams.get('q') || ''; } catch {}
      if (query) {
        const pKey = activeSearchProvider.value;
        updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey: pKey, searchUrl: url, loading: true } });
        (async () => {
          try {
            const result = await renderSearchResults(query, pKey);
            updateTab(tab.id, {
              searchData: { html: result.html, query, provider: result.provider, providerKey: result.providerKey, searchUrl: result.searchUrl, loading: false }
            });
          } catch (err) {
            updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey: pKey, searchUrl: url, loading: false, error: err.message } });
          }
        })();
      }
    }
  }, [mode, sp, url, tab.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle postMessage navigation from srcdoc iframes and search interactions
  useEffect(() => {
    const handler = async (event) => {
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'lithium-navigate' && data.url) {
        window.dispatchEvent(new CustomEvent('browser-navigate', { detail: { url: data.url } }));
      } else if (data.type === 'lithium-search' && data.query) {
        // Re-search from the injected top bar form
        const pKey = activeSearchProvider.value;
        const searchUrl = SCRAPE_PROVIDERS[pKey]?.buildUrl?.(data.query) || '';
        updateTab(tab.id, { searchData: { html: null, query: data.query, provider: '', providerKey: pKey, searchUrl: '', loading: true } });
        try {
          const result = await renderSearchResults(data.query, pKey);
          updateTab(tab.id, {
            searchData: {
              html: result.html,
              query: data.query,
              provider: result.provider,
              providerKey: result.providerKey,
              searchUrl: result.searchUrl,
              loading: false,
            }
          });
        } catch (err) {
          updateTab(tab.id, { searchData: { ...tab.searchData, html: null, loading: false, error: err.message } });
        }
      } else if (data.type === 'lithium-popup' && data.url) {
        // Login/OAuth popup — show in a modal overlay
        setPopupUrl(data.url);
      } else if (data.type === 'lithium-login-form') {
        // Login form detected in the proxied page
        setLoginFormDetected(true);
      } else if (data.type === 'lithium-switch-provider' && data.provider) {
        // Switch provider and re-run the current query
        activeSearchProvider.value = data.provider;
        const query = data.query || activeTabSearchData.value?.query || '';
        if (query) {
          updateTab(tab.id, { searchData: { ...tab.searchData, loading: true } });
          try {
            const result = await renderSearchResults(query, data.provider);
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
            updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message } });
          }
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Handle clicks inside the search results HTML (dangerouslySetInnerHTML)
  const handleSearchClick = async (event) => {
    // Provider tab clicks (data-lithium-provider attribute from injected top bar)
    const providerBtn = event.target.closest?.('[data-lithium-provider]');
    if (providerBtn) {
      event.preventDefault();
      event.stopPropagation();
      const newProvider = providerBtn.getAttribute('data-lithium-provider');
      const query = activeTabSearchData.value?.query || '';
      if (newProvider && query) {
        activeSearchProvider.value = newProvider;
        updateTab(tab.id, { searchData: { ...tab.searchData, loading: true } });
        try {
          const result = await renderSearchResults(query, newProvider);
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
          updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message } });
        }
      }
      return;
    }

    // Regular link clicks — navigate the browser
    const anchor = event.target.closest?.('a[href]');
    if (anchor) {
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        window.dispatchEvent(new CustomEvent('browser-navigate', { detail: { url: href } }));
      }
    }
  };

  // Handle form submissions inside search results HTML
  const handleSearchSubmit = async (event) => {
    const form = event.target.closest?.('.li-form') || event.target.closest?.('[data-lithium-search]');
    if (form) {
      event.preventDefault();
      event.stopPropagation();
      const input = form.querySelector('input[name="q"]');
      if (input && input.value.trim()) {
        const query = input.value.trim();
        const pKey = activeSearchProvider.value;
        updateTab(tab.id, { searchData: { ...tab.searchData, loading: true, query } });
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
          updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message } });
        }
      }
    }
  };

  const handleRebuiltClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor) {
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        window.dispatchEvent(new CustomEvent('browser-navigate', { detail: { url: href } }));
      }
    }
  };

  // lithium://newtab URL = new tab page (when not in a special mode)
  if (url === 'lithium://newtab' && mode === 'normal') {
    return <NewTabPage />;
  }

  const rd = readerData.value;
  const rb = rebuildData.value;
  const fr = fullRenderData.value;

  return (
    <div className="relative flex-1 bg-[#14141d]">
      {tab.isLoading && <div className="browser-progress" />}

      <div className="browser-view absolute inset-0">
        {/* Full Render mode (srcdoc iframe) */}
        {mode === 'fullRender' && fr ? (
          fr.loading ? (
            <LoadingState message="Fetching and rebuilding…" />
          ) : fr.error || !fr.srcdoc ? (
            <ErrorState message={fr.error || 'Could not render this page'} onDismiss={() => { fullRenderData.value = null; setViewportMode('normal'); }} />
          ) : (
            <iframe
              key={`fr-${tab.reloadKey}`}
              srcDoc={fr.srcdoc}
              title={`Rebuilt: ${hostname(url)}`}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          )
        ) : mode === 'rebuild' && rb ? (
          rb.loading ? (
            <LoadingState message="Rebuilding page…" />
          ) : rb.error || !rb.html ? (
            <ErrorState message={rb.error || 'Could not rebuild this page'} onDismiss={() => { rebuildData.value = null; setViewportMode('normal'); }} />
          ) : (
            <div
              className="search-page-viewport h-full w-full overflow-auto"
              onClick={handleRebuiltClick}
              dangerouslySetInnerHTML={{ __html: rb.html }}
            />
          )
        ) : mode === 'search' && sp ? (
          sp.loading ? (
            <LoadingState message={`Searching ${SCRAPE_PROVIDERS[sp.providerKey]?.label || sp.provider || ''}…`} />
          ) : sp.error || !sp.html ? (
            <ErrorState message={sp.error || 'No results'} subMessage="Try a different provider or query." />
          ) : (
            <div
              className="search-page-viewport h-full w-full overflow-auto bg-white"
              onClick={handleSearchClick}
              onSubmit={handleSearchSubmit}
              dangerouslySetInnerHTML={{ __html: sp.html }}
            />
          )
        ) : mode === 'reader' && rd ? (
          rd.loading ? (
            <LoadingState message="Fetching readable copy…" />
          ) : rd.error ? (
            <ErrorState message={rd.error} showOpenTab url={rd.url} />
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col bg-[#14141d]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-white/60">
                <Icon name="BookOpen" size={14} className="text-cyan-300" />
                <span className="min-w-0 flex-1 truncate">Reader mode · {hostname(rd.url)}</span>
                <button className="icon-btn h-7 w-7" onClick={() => { readerData.value = null; setViewportMode('normal'); }} aria-label="Close reader">
                  <Icon name="X" size={14} />
                </button>
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-5 font-sans text-[13px] leading-relaxed text-white/80">
                {rd.text}
              </pre>
            </div>
          )
        ) : (
          /* Normal iframe mode */
          <div className="relative h-full w-full">
            <iframe
              ref={iframeRef}
              key={tab.reloadKey}
              src={buildProxyUrl(url, proxyOrigin, backendUp.value)}
              title={hostname(url)}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                setTabLoading(tab.id, false);
                setLoginFormDetected(false); // reset on each new page load
                // Check for captcha elements in the iframe DOM
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc && (
                    doc.querySelector('.g-recaptcha') ||
                    doc.querySelector('.h-captcha') ||
                    doc.querySelector('[class*="recaptcha"]') ||
                    doc.querySelector('iframe[src*="recaptcha"]') ||
                    doc.querySelector('iframe[src*="hcaptcha"]')
                  )) {
                    setCaptchaDetected(true);
                    return;
                  }
                } catch {}
                setCaptchaDetected(false);
                // Extract real page title and favicon (like a real browser)
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc?.title) setTabTitle(tab.id, doc.title);
                } catch {}
                // Always derive a clean title from URL as fallback
                const h = hostname(url);
                if (h && h !== 'new tab') {
                  setTabTitle(tab.id, h.replace(/^www\./, '').split('.')[0]);
                }
                // Set favicon from Google's favicon service
                try {
                  const origin = new URL(url).origin;
                  updateTab(tab.id, { favicon: `https://www.google.com/s2/favicons?domain=${origin}&sz=32` });
                } catch {}
              }}
              onMouseOver={(e) => {
                const a = e.target.closest?.('a[href]');
                if (a) hoverUrl.value = a.getAttribute('href') || '';
              }}
              onMouseOut={() => { hoverUrl.value = ''; }}
            />
            {/* Login / OAuth popup modal */}
            {popupUrl && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="flex h-[70%] w-[55%] min-w-[360px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1e1e2a] shadow-2xl">
                  {/* Popup header */}
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                    <Icon name="KeyRound" size={14} className="shrink-0 text-cyan-300" />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/70">
                      Sign in — {hostname(popupUrl)}
                    </span>
                    <button
                      className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                      onClick={() => setPopupUrl(null)}
                      aria-label="Close sign-in popup"
                    >
                      <Icon name="X" size={14} />
                    </button>
                  </div>
                  {/* Popup iframe */}
                  <iframe
                    src={buildProxyUrl(popupUrl, proxyOrigin, backendUp.value)}
                    title={`Sign in: ${hostname(popupUrl)}`}
                    className="flex-1 border-0 bg-white"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                    allow="autoplay; encrypted-media"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            )}
            {/* Auto-fill login bar */}
            {loginFormDetected && authUser.value && (
              <div className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 bg-cyan-600/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm">
                <Icon name="KeyRound" size={16} className="shrink-0" />
                <span className="flex-1 truncate">
                  Login as <strong>{getAuthEmail()}</strong>?
                </span>
                <button
                  className="rounded bg-white px-3 py-0.5 text-xs font-medium text-cyan-700 hover:bg-white/90"
                  onClick={() => {
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: 'lithium-autofill', email: getAuthEmail() }, '*'
                    );
                    setLoginFormDetected(false);
                  }}
                >
                  Fill email
                </button>
                <button
                  className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
                  onClick={() => setLoginFormDetected(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {/* Captcha solving notification */}
            {captchaDetected && (
              <div className="absolute inset-x-0 top-0 z-50 flex items-center gap-3 bg-amber-500/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm">
                <Icon name="ShieldCheck" size={16} className="shrink-0" />
                <span className="flex-1 truncate">
                  Captcha detected — please solve it in the page below. Cookies will be saved automatically.
                </span>
                <button
                  className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
                  onClick={() => { setCaptchaDetected(false); }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState({ message }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 bg-[#141419] text-sm text-white/40">
      <Icon name="Loader2" size={16} className="animate-spin" /> {message}
    </div>
  );
}

function ErrorState({ message, subMessage, onDismiss, showOpenTab, url }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#141419] text-sm text-white/50">
      <p>{message}</p>
      {subMessage && <p className="text-xs text-white/30">{subMessage}</p>}
      {onDismiss && (
        <button className="btn-ghost rounded-lg px-3 py-1.5 text-xs" onClick={onDismiss}>Back to normal view</button>
      )}
      {showOpenTab && url && (
        <a className="btn-ghost px-3 py-1.5 text-xs" href={url} target="_blank" rel="noreferrer">Open in a real tab</a>
      )}
    </div>
  );
}
