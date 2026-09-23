import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { SEARCH_ENGINES } from '../../../lib/settings';
import { setUiModeOverride } from '../../../lib/desktop/phoneMode';
import useDesktopState from '../DesktopView/useDesktopState';
import useWallpaperStyle from './useWallpaperStyle';
import useMacShell from './useMacShell';
import MobileStatusBar from './MobileStatusBar';
import MacMenuBar from './MacMenuBar';
import MobileHome from './MobileHome';
import MobileDock from './MobileDock';
import MobileAppFrame from './MobileAppFrame';
import MobileAppSwitcher from './MobileAppSwitcher';
import MobileSpotlight from './MobileSpotlight';
import useMobileGestures from './useMobileGestures';
import './mobile.css';

/**
 * MobileShell — the touch-style sibling of DesktopView.
 *
 * It reuses the exact same `useDesktopState()` hook, so every app, the window
 * manager, wallpaper, theme, accent, glass, notifications and the .li launcher
 * behave identically to the desktop; only the presentation changes.
 *
 * That presentation has two faces, picked by `useMacShell()`:
 *  • on a phone — iOS: status bar, paged springboard, full-screen apps, dock,
 *    Spotlight, app switcher and home-indicator gestures.
 *  • on a desktop-sized screen — macOS: menu bar with working menus, floating
 *    draggable windows with traffic lights, Launchpad and an always-on Dock.
 * Same shell, same state; the wide screen simply gets desktop affordances.
 *
 * It mounts only when `usePhoneMode()` is true (see pages/Dashboard.jsx).
 */
export default function MobileShell() {
  const s = useDesktopState();
  const {
    getApp, startApps, pinnedAppsOrdered,
    windows, visibleWindows,
    launchApp, focusApp, updateWindow, focusWindow, closeWindow,
    settings, wallpaper, customWallpaper,
    online, battery, toasts,
  } = s;

  const mac = useMacShell();
  const [atHome, setAtHome] = useState(true);
  const [launchpad, setLaunchpad] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const homebarRef = useRef(null);
  const viewportRef = useRef(null);

  /* macOS windows are clamped to the box they actually live in — the viewport
     between the menu bar and the Dock — so one resize listener keeps every
     frame in sync when the window or the Dock changes size. */
  const [viewSize, setViewSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    if (!mac) return undefined;
    const measure = () => {
      const el = viewportRef.current;
      setViewSize(el
        ? { w: el.clientWidth, h: el.clientHeight }
        : { w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mac]);

  const wallpaperStyle = useWallpaperStyle({ wallpaper, customWallpaper, settings });

  const foreground = useMemo(
    () => (visibleWindows.length ? visibleWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)) : null),
    [visibleWindows],
  );

  const runningIds = useMemo(
    () => new Set(windows.flatMap(win => (win.tabs || []).map(tab => tab.appId))),
    [windows],
  );

  /* Window stacking uses dense ranks: the shell's own overlays (Launchpad,
     Mission Control, Spotlight, toasts) sit above every window. */
  const zRanks = useMemo(() => {
    const map = {};
    [...windows].sort((a, b) => a.zIndex - b.zIndex).forEach((win, i) => { map[win.id] = i + 1; });
    return map;
  }, [windows]);

  // Latest window list for stable callbacks, so app subtrees aren't rebuilt.
  const windowsRef = useRef(windows);
  useEffect(() => { windowsRef.current = windows; });

  // Nothing left in the foreground (closed or all minimized) → drop back home.
  useEffect(() => {
    if (!atHome && !foreground) setAtHome(true);
  }, [atHome, foreground]);

  // Leaving the app context always closes the transient layers.
  const dismissOverlays = useCallback(() => {
    setSwitcherOpen(false);
    setSpotlightOpen(false);
    setLaunchpad(false);
  }, []);

  const goHome = useCallback(() => {
    dismissOverlays();
    setAtHome(true);
  }, [dismissOverlays]);

  const handleLaunch = useCallback((app) => {
    if (!app) return;
    launchApp(app);
    setLaunchpad(false);
    setAtHome(false);
  }, [launchApp]);

  /* ── macOS window actions (real minimize / zoom / drag) ─────────────── */
  const minimizeWindow = useCallback(id => updateWindow(id, { minimized: true }), [updateWindow]);

  const toggleZoom = useCallback(id => {
    const win = windowsRef.current.find(w => w.id === id);
    updateWindow(id, { maximized: !win?.maximized, minimized: false });
  }, [updateWindow]);

  const moveWindow = useCallback((id, pos) => updateWindow(id, pos), [updateWindow]);

  const showDesktop = useCallback(() => {
    windowsRef.current.forEach(win => updateWindow(win.id, { minimized: true }));
    dismissOverlays();
    setAtHome(true);
  }, [updateWindow, dismissOverlays]);

  const openOverview = useCallback(() => {
    setSpotlightOpen(false);
    setLaunchpad(false);
    setSwitcherOpen(v => !v);
    setAtHome(true);
  }, []);

  const toggleLaunchpad = useCallback(() => {
    setSpotlightOpen(false);
    setSwitcherOpen(false);
    setAtHome(true);
    setLaunchpad(v => !v);
  }, []);

  const openFromSwitcher = useCallback((winId) => {
    const win = windows.find(w => w.id === winId);
    updateWindow(winId, { minimized: false });
    focusWindow(winId);
    if (win) focusApp(win.tabs?.[0]?.appId || winId);
    setSwitcherOpen(false);
    setLaunchpad(false);
    setAtHome(false);
  }, [windows, updateWindow, focusWindow, focusApp]);

  // Swipe left/right along the home indicator to jump between running apps.
  const cycleApp = useCallback((dir) => {
    if (switcherOpen || spotlightOpen || windows.length === 0) return;
    const curIdx = foreground ? windows.findIndex(w => w.id === foreground.id) : -1;
    let nextIdx;
    if (windows.length === 1) nextIdx = 0;
    else if (dir === 'next') nextIdx = (curIdx + 1) % windows.length;
    else nextIdx = (curIdx - 1 + windows.length) % windows.length;
    const win = windows[nextIdx];
    if (!win) return;
    updateWindow(win.id, { minimized: false });
    focusWindow(win.id);
    focusApp(win.tabs?.[0]?.appId || win.id);
    setAtHome(false);
  }, [windows, foreground, switcherOpen, spotlightOpen, updateWindow, focusWindow, focusApp]);

  useMobileGestures(homebarRef, { onHome: goHome, onCycle: cycleApp });

  const webSearch = useCallback((raw, engine) => {
    const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+/.test(raw);
    const template = SEARCH_ENGINES[engine]?.url || SEARCH_ENGINES.duckduckgo.url;
    const detail = isUrl ? raw : `${template}${encodeURIComponent(raw)}`;
    window.dispatchEvent(new CustomEvent('lithium:open-browser', { detail }));
    setAtHome(false);
  }, []);

  const hasOpenApps = windows.length > 0;

  /* ── macOS chrome: menu bar + Dock ──────────────────────────────────── */
  const foregroundTab = foreground ? (foreground.tabs || []).find(t => t.key === foreground.activeTab) || foreground.tabs?.[0] : null;
  const appName = foreground ? (foregroundTab?.title || foreground.title || null) : null;

  const openSettings = useCallback(() => handleLaunch(getApp('settings')), [handleLaunch, getApp]);

  const menus = useMemo(() => [
    {
      id: 'li',
      label: '',
      img: '/Li-Logo.svg',
      bold: true,
      items: [
        { label: 'About Lithium', action: openSettings },
        { label: 'System Settings…', action: openSettings },
        { separator: true },
        { label: 'Launchpad', action: toggleLaunchpad },
        { label: 'Mission Control', action: openOverview },
        { label: 'Show Desktop', action: showDesktop },
        { separator: true },
        { label: 'Restart Lithium', action: () => window.location.reload() },
        { label: 'Use Windows-style Desktop', action: () => setUiModeOverride('desktop') },
      ],
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        { label: 'Minimize', disabled: !foreground, action: () => foreground && minimizeWindow(foreground.id) },
        { label: foreground?.maximized ? 'Restore' : 'Zoom', disabled: !foreground, action: () => foreground && toggleZoom(foreground.id) },
        { separator: true },
        { label: 'Close Window', disabled: !foreground, action: () => foreground && closeWindow(foreground.id) },
      ],
    },
  ], [foreground, openSettings, toggleLaunchpad, openOverview, showDesktop, minimizeWindow, toggleZoom, closeWindow]);

  /* Dock = pinned apps, plus anything running that isn't pinned (as macOS does). */
  const dockApps = useMemo(() => {
    const base = (pinnedAppsOrdered && pinnedAppsOrdered.length ? pinnedAppsOrdered : startApps)
      .filter(Boolean).slice(0, 14);
    if (!mac) return base;
    const seen = new Set(base.map(app => app.id));
    const extra = [];
    windows.forEach(win => (win.tabs || []).forEach(tab => {
      if (!tab.appId || seen.has(tab.appId)) return;
      seen.add(tab.appId);
      const app = getApp(tab.appId);
      if (app) extra.push(app);
    }));
    return [...base, ...extra].slice(0, 20);
  }, [mac, pinnedAppsOrdered, startApps, windows, getApp]);

  const homeVisible = (mac ? launchpad : atHome) && !switcherOpen && !spotlightOpen;

  return (
    <div className={`mx-shell${mac ? ' mac' : ''}`} style={wallpaperStyle}>
      {/* Wallpaper brightness dimmer, matching the desktop shell. */}
      {settings.background?.enabled !== false && settings.background?.intensity < 1 && (
        <div
          aria-hidden
          className="mx-dim"
          style={{ background: `rgba(0,0,0,${(1 - settings.background.intensity) * 0.75})` }}
        />
      )}

      {mac
        ? <MacMenuBar online={online} battery={battery} appName={appName} menus={menus} onSpotlight={() => setSpotlightOpen(true)} />
        : <MobileStatusBar online={online} battery={battery} />}

      <div className="mx-viewport" ref={viewportRef}>
        {/* Running apps stay mounted so they keep their state, like iOS. In the
            macOS layout every non-minimized window is on screen at once. */}
        {windows.map(win => (
          <MobileAppFrame
            key={win.id}
            win={win}
            mac={mac}
            zIndex={zRanks[win.id] || 1}
            view={viewSize}
            active={mac ? !!foreground && win.id === foreground.id : (!atHome && !!foreground && win.id === foreground.id)}
            onHome={goHome}
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onToggleZoom={toggleZoom}
            onFocus={focusWindow}
            onMove={moveWindow}
          />
        ))}

        <MobileHome
          visible={homeVisible}
          apps={startApps}
          pinned={pinnedAppsOrdered}
          runningIds={runningIds}
          onLaunch={handleLaunch}
          onOpenSearch={() => setSpotlightOpen(true)}
          hideDock={mac}
        />

        {spotlightOpen && (
          <MobileSpotlight
            open={spotlightOpen}
            onClose={() => setSpotlightOpen(false)}
            apps={startApps}
            searchEngine={settings.browser?.searchEngine}
            onLaunch={handleLaunch}
            onWebSearch={webSearch}
          />
        )}

        {switcherOpen && (
          <MobileAppSwitcher
            windows={windows}
            getApp={getApp}
            onOpen={openFromSwitcher}
            onClose={closeWindow}
            mac={mac}
            onDismiss={mac ? dismissOverlays : goHome}
          />
        )}

        {/* Toasts (same data as the desktop notification stream). */}
        {toasts.length > 0 && (
          <div className="mx-toasts">
            {toasts.map(toast => (
              <div key={toast.id} className="mx-toast">
                <div className="mx-toast-title">{toast.title}</div>
                {toast.body && <div className="mx-toast-body">{toast.body}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom chrome: the macOS Dock, or the phone's home indicator strip.
          The strip stays mounted either way so the gesture binding is stable. */}
      {mac && (
        <MobileDock
          apps={dockApps}
          runningIds={runningIds}
          onLaunch={handleLaunch}
          launchpadOpen={launchpad}
          onLaunchpad={toggleLaunchpad}
          onOverview={openOverview}
          hasWindows={hasOpenApps}
        />
      )}
      <div className="mx-homebar" ref={homebarRef}>
        <button type="button" className="mx-homebar-pill" onClick={goHome} aria-label="Home" title="Home" />
        {hasOpenApps && !switcherOpen && (
          <button
            type="button"
            className="mx-overview-btn"
            onClick={openOverview}
            aria-label="Open apps"
            title="Open apps"
          >
            <Icon name="LayoutGrid" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
