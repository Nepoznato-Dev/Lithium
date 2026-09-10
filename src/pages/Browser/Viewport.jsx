/**
 * Viewport — the main page content area.
 * Renders the active tab's content based on viewport mode:
 *   normal (iframe), search, reader, rebuild, fullRender, or new tab.
 */
import { useEffect, useState, useRef, useCallback } from 'preact/hooks';
import { activeTab, currentUrl, setTabLoading, setTabTitle, updateTab, activeTabMode, activeTabSearchData, goBack, goForward, reloadTab } from './stores/tabStore';
import { readerData, rebuildData, fullRenderData, setViewportMode, backendUp, articleDetected } from './stores/browserStore';
import { activeSearchProvider } from './stores/searchStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import { buildProxyUrl, rebuildPageContent } from './io/network';
import { renderSearchResults } from '../../lib/searchResultsRenderer';
import { hoverUrl } from './StatusBar';
import ContextMenu from './ContextMenu';
import Icon from '../../Components/Icon';
import { useSettings } from '../../Components/SettingsContext';
import { authUser, getAuthEmail, initAuth } from './stores/authStore';
import { notify as notifyService } from '../../lib/services/notificationService';

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
  const [pageCtxMenu, setPageCtxMenu] = useState(null); // { x, y }
  const captchaNotifiedRef = useRef(new Set());
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
            updateTab(tab.id, { searchData: { html: null, query, provider: '', providerKey: pKey, searchUrl: url, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
            if (err.isCaptchaError && !captchaNotifiedRef.current.has('search')) {
              captchaNotifiedRef.current.add('search');
              notifyService({ title: 'Storage Required — Brave Search', body: err.message, tone: 'warning' });
            }
          }
        })();
      }
    }
  }, [mode, sp, url, tab.id]);  

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
          updateTab(tab.id, { searchData: { ...tab.searchData, html: null, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
          if (err.isCaptchaError && !captchaNotifiedRef.current.has('msg-search')) {
            captchaNotifiedRef.current.add('msg-search');
            notifyService({ title: 'Storage Required — Brave Search', body: err.message, tone: 'warning' });
          }
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
            updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
            if (err.isCaptchaError && !captchaNotifiedRef.current.has('switch-provider')) {
              captchaNotifiedRef.current.add('switch-provider');
              notifyService({ title: 'Storage Required — Brave Search', body: err.message, tone: 'warning' });
            }
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
          updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
          if (err.isCaptchaError && !captchaNotifiedRef.current.has('click-provider')) {
            captchaNotifiedRef.current.add('click-provider');
            notifyService({ title: 'Storage Required — Brave Search', body: err.message, tone: 'warning' });
          }
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
          updateTab(tab.id, { searchData: { ...tab.searchData, loading: false, error: err.message, isCaptchaError: err.isCaptchaError } });
          if (err.isCaptchaError && !captchaNotifiedRef.current.has('nav-provider')) {
            captchaNotifiedRef.current.add('nav-provider');
            notifyService({ title: 'Storage Required — Brave Search', body: err.message, tone: 'warning' });
          }
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

  const rd = readerData.value;
  const rb = rebuildData.value;
  const fr = fullRenderData.value;

  return (
    <div className="relative flex-1 bg-[#14141d]" onContextMenu={(e) => {
      if (url && url !== 'lithium://newtab') {
        e.preventDefault();
        setPageCtxMenu({ x: e.clientX, y: e.clientY });
      }
    }}>
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
            <ErrorState message={sp.error || 'No results'} subMessage="Try a different provider or query." isCaptchaError={sp.isCaptchaError} />
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
                // Article detection for reader mode trigger (C4)
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc) {
                    const article = doc.querySelector('article, [role="main"], main');
                    const hasLongContent = article && article.textContent.trim().length > 600;
                    const hasArticleClass = doc.querySelector('.article, .post, .entry-content, .article-body, .story-body, [itemprop="articleBody"]');
                    articleDetected.value = !!(hasLongContent || hasArticleClass);
                  } else {
                    articleDetected.value = false;
                  }
                } catch {
                  articleDetected.value = false;
                }
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

      {/* Page context menu (C5: Wayback Machine + actions) */}
      {pageCtxMenu && (
        <ContextMenu
          x={pageCtxMenu.x}
          y={pageCtxMenu.y}
          onClose={() => setPageCtxMenu(null)}
          items={[
            { icon: 'ArrowLeft', label: 'Back', shortcut: 'Alt+\u2190', action: () => goBack(tab.id) },
            { icon: 'ArrowRight', label: 'Forward', shortcut: 'Alt+\u2192', action: () => goForward(tab.id) },
            { icon: 'RotateCw', label: 'Reload', shortcut: 'Ctrl+R', action: () => reloadTab(tab.id) },
            { separator: true },
            { icon: 'Clock', label: 'View on Wayback Machine', action: () => { if (url) window.open(`https://web.archive.org/web/${url}`, '_blank'); } },
            { icon: 'ExternalLink', label: 'Open in external browser', action: () => { if (url) window.open(url, '_blank'); } },
            { separator: true },
            { icon: 'BookOpen', label: 'Reader mode', action: () => {
              if (readerData.value) { readerData.value = null; setViewportMode('normal'); return; }
              if (!url) return;
              readerData.value = { url, text: null, error: '', loading: true };
              setViewportMode('reader');
              fetch(`https://r.jina.ai/${url}`).then(r => r.text()).then(text => { readerData.value = { url, text, error: '', loading: false }; }).catch(() => { readerData.value = { url, text: null, error: 'Could not fetch readable copy.', loading: false }; });
            } },
            { icon: 'FileText', label: 'Rebuild page', action: async () => {
              if (rebuildData.value) { rebuildData.value = null; setViewportMode('normal'); return; }
              if (!url) return;
              rebuildData.value = { html: null, title: '', source: '', readerable: false, loading: true };
              setViewportMode('rebuild');
              try {
                const result = await rebuildPageContent(url);
                rebuildData.value = { ...result, loading: false };
              } catch (err) {
                rebuildData.value = { html: null, title: '', source: '', readerable: false, loading: false, error: err.message };
              }
            } },
            { separator: true },
            { icon: 'BrainCircuit', label: 'Ask AI about this page', action: () => {
              import('../../lib/services/aiContext').then(({ collectBrowserContext, askAboutContext }) => {
                const ctx = collectBrowserContext({ pageUrl: url, pageTitle: tab.title });
                askAboutContext('What is this page about? Summarize it.', ctx);
              }).catch(() => {});
            }},
            { icon: 'FileText', label: 'Summarize this page', action: () => {
              import('../../lib/services/aiContext').then(({ collectBrowserContext, summarizeAction }) => {
                const ctx = collectBrowserContext({ pageUrl: url, pageTitle: tab.title });
                summarizeAction(ctx);
              }).catch(() => {});
            }},
          ]}
        />
      )}
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

function ErrorState({ message, subMessage, onDismiss, showOpenTab, url, isCaptchaError }) {
  if (isCaptchaError) {
    // Split the message into paragraphs for readable rendering.
    const sections = message.split('\n\n');
    const intro = sections[0] || '';
    const steps = (sections[1] || '').split('\n').filter(Boolean);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#141419] px-6 text-sm text-white/50">
        <div className="flex items-center gap-2 text-amber-400">
          <Icon name="ShieldAlert" size={20} />
          <span className="text-base font-medium text-amber-300">Storage Permission Required</span>
        </div>
        <p className="max-w-lg text-center leading-relaxed text-white/60">{intro}</p>
        {steps.length > 0 && (
          <div className="w-full max-w-md space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 text-left text-xs text-white/50">
            <p className="mb-1 font-medium text-white/70">Troubleshooting steps:</p>
            {steps.map((step, i) => (
              <p key={i} className="leading-relaxed">{step.replace(/^\d+\.\s*/, '')}</p>
            ))}
          </div>
        )}
        {onDismiss && (
          <button className="btn-ghost rounded-lg px-3 py-1.5 text-xs" onClick={onDismiss}>Back to normal view</button>
        )}
        {showOpenTab && url && (
          <a className="btn-ghost px-3 py-1.5 text-xs" href={url} target="_blank" rel="noreferrer">Open in a real tab</a>
        )}
      </div>
    );
  }
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
