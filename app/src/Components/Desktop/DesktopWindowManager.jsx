import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { scheduleStorageSave, flushStorageSaves } from '../../lib/storage/localStorage';
import { DESKTOP_SESSION_KEY, captureDesktopSession, fitWindow, loadDesktopSession, restoreDesktopWindows } from '../../lib/desktop/session';

const NO_WINDOWS = [];

/**
 * Two contexts on purpose.
 *
 * `WindowActionsContext` holds the (permanently stable) action callbacks, so
 * components that only *drive* windows — window chrome, drag handles, the app
 * bridge — never re-render because window data changed.
 *
 * `WindowListContext` holds the list itself. Only components that actually
 * render window data subscribe to churn there. Sharing one context object for
 * both meant a fresh literal on every provider render, so a single window
 * update re-rendered every consumer in the shell.
 */
const WindowActionsContext = createContext(null);
const WindowListContext = createContext(NO_WINDOWS);

/** Actions only — never re-renders on window state changes. */
export function useDesktopActions() {
  const actions = useContext(WindowActionsContext);
  if (!actions) throw new Error('useDesktopActions must be used inside DesktopWindowProvider');
  return actions;
}

/** Actions + the live window list. Prefer `useDesktopActions()` when the list
 *  is not rendered. */
export function useDesktopWindows() {
  const windows = useContext(WindowListContext);
  const actions = useDesktopActions();
  return useMemo(() => ({ windows, ...actions }), [windows, actions]);
}

const newTabKey = () => `tab-${crypto.randomUUID()}`;

const activeTabOf = win => win.tabs.find(tab => tab.key === win.activeTab) || win.tabs[0];

/** Expose the active tab's title/icon/component at window level for legacy consumers. */
const mirror = win => {
  const tab = activeTabOf(win);
  return { ...win, title: tab?.title || '', icon: tab?.icon, component: tab?.component };
};

/**
 * Window manager where each window hosts one or more app TABS (browser-style
 * multitasking inside a single window). Launching an app reuses its existing
 * tab, otherwise adds a tab to the topmost window, otherwise creates a window.
 * `newWindow: true` always spawns a separate window (Steam-style game windows).
 *
 * New windows are automatically cascaded so they never stack directly on top
 * of each other.  The cascade offset is derived from the number of windows
 * already open at the time of creation.
 */
export function DesktopWindowProvider({ children }) {
  const [windows, setWindowState] = useState(NO_WINDOWS);
  const [initialSession] = useState(loadDesktopSession);
  const windowsRef = useRef(NO_WINDOWS);
  const placements = useRef(initialSession.placements);
  const restored = useRef(false);
  const nextZIndex = useRef(10);

  // Queue the snapshot in the action itself, before a reload can interrupt rendering.
  const setWindows = useCallback(updater => {
    const next = updater(windowsRef.current);
    const nextPlacements = { ...placements.current };
    for (const win of next) {
      for (const tab of win.tabs) {
        Object.defineProperty(nextPlacements, tab.appId, { value: fitWindow(win), enumerable: true, configurable: true, writable: true });
      }
    }
    placements.current = nextPlacements;
    windowsRef.current = next;
    if (restored.current) {
      scheduleStorageSave(DESKTOP_SESSION_KEY, captureDesktopSession(next, nextPlacements));
    }
    setWindowState(next);
  }, []);

  const restoreSession = useCallback(apps => {
    if (restored.current) return;
    restored.current = true;
    const saved = restoreDesktopWindows(initialSession, apps).map(mirror);
    nextZIndex.current = Math.max(nextZIndex.current, ...saved.map(win => win.zIndex));
    const current = windowsRef.current;
    const next = [...saved.filter(win => !current.some(item => item.id === win.id)), ...current];
    windowsRef.current = next;
    setWindowState(next);
  }, [initialSession]);

  useEffect(() => () => flushStorageSaves(), []);
  /** Topmost window id — refocusing it is a no-op (see focusWindow). */
  const topWindow = useRef(null);

  const focusWindow = useCallback(id => {
    // A click inside an already-focused window used to bump zIndex and
    // re-render the whole shell. Nothing to do when it is already on top.
    if (topWindow.current === id) return;
    topWindow.current = id;
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.id === id ? { ...win, zIndex: z } : win)));
  }, [setWindows]);

  const openWindow = useCallback(config => {
    const makeTab = () => ({
      key: newTabKey(),
      appId: config.id,
      title: config.title,
      icon: config.icon,
      component: config.component,
    });
    nextZIndex.current += 1;
    const z = nextZIndex.current;

    setWindows(current => {
      if (!config.newWindow) {
        const existing = current.find(win => win.tabs.some(tab => tab.appId === config.id));
        if (existing) {
          // Replace the tab's content (deep links) or just focus it.
          return current.map(win => (win.id === existing.id
            ? mirror({
              ...win,
              minimized: false,
              zIndex: z,
              activeTab: existing.tabs.find(tab => tab.appId === config.id).key,
              tabs: config.replaceTab
                ? win.tabs.map(tab => (tab.appId === config.id ? { ...tab, component: config.component, title: config.title || tab.title } : tab))
                : win.tabs,
            })
            : win));
        }
        const top = current.length ? current.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)) : null;
        if (top) {
          const tab = makeTab();
          return current.map(win => (win.id === top.id
            ? mirror({ ...win, minimized: false, zIndex: z, tabs: [...win.tabs, tab], activeTab: tab.key })
            : win));
        }
      }
      const tab = makeTab();
      const id = config.newWindow && !current.some(win => win.id === config.id) ? config.id : `${config.id}-${crypto.randomUUID()}`;
      /* Cascade new windows so they don't stack on top of each other. */
      const cascadeStep = current.length * 28;
      const savedPlacement = Object.hasOwn(placements.current, config.id) && !current.some(win => win.tabs.some(t => t.appId === config.id))
        ? fitWindow(placements.current[config.id]) : null;
      const baseX = config.x ?? 110;
      const baseY = config.y ?? 70;
      const winW = config.width || 900;
      const winH = config.height || 640;
      const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1920) - winW - 20;
      const maxY = (typeof window !== 'undefined' ? window.innerHeight : 1080) - winH - 60;
      return [...current, mirror({
        id,
        x: Math.max(20, Math.min(baseX + cascadeStep, maxX)),
        y: Math.max(20, Math.min(baseY + cascadeStep, maxY)),
        width: winW,
        height: winH,
        zIndex: z,
        minimized: false,
        maximized: false,
        ...savedPlacement,
        tabs: [tab],
        activeTab: tab.key,
      })];
    });
  }, [setWindows]);

  const updateWindow = useCallback((id, changes) => {
    setWindows(current => current.map(win => (win.id === id ? { ...win, ...changes } : win)));
  }, [setWindows]);

  const closeWindow = useCallback(id => {
    // The cached "already on top" marker must not outlive the window.
    if (topWindow.current === id) topWindow.current = null;
    setWindows(current => current.filter(win => win.id !== id));
  }, [setWindows]);

  const addTab = useCallback((windowId, config) => {
    const tab = { key: newTabKey(), appId: config.appId, title: config.title, icon: config.icon, component: config.component };
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.id === windowId
      ? mirror({ ...win, zIndex: z, tabs: [...win.tabs, tab], activeTab: tab.key })
      : win)));
  }, [setWindows]);

  const closeTab = useCallback((windowId, key) => {
    setWindows(current => current.flatMap(win => {
      if (win.id !== windowId) return [win];
      const tabs = win.tabs.filter(tab => tab.key !== key);
      if (!tabs.length) return []; // last tab closed → window closes
      const activeTab = win.activeTab === key ? tabs[tabs.length - 1].key : win.activeTab;
      return [mirror({ ...win, tabs, activeTab })];
    }));
  }, [setWindows]);

  const setActiveTab = useCallback((windowId, key) => {
    setWindows(current => current.map(win => (win.id === windowId ? mirror({ ...win, activeTab: key }) : win)));
  }, [setWindows]);

  /** Close whichever tab hosts the given app (used by apps.close). */
  const closeApp = useCallback(appId => {
    setWindows(current => current.flatMap(win => {
      const tabs = win.tabs.filter(tab => tab.appId !== appId);
      if (tabs.length === win.tabs.length) return [win];
      if (!tabs.length) return [];
      const activeTab = tabs.some(tab => tab.key === win.activeTab) ? win.activeTab : tabs[tabs.length - 1].key;
      return [mirror({ ...win, tabs, activeTab })];
    }));
  }, [setWindows]);

  /** Focus the window + tab hosting the given app (used by apps.focus). */
  const focusApp = useCallback(appId => {
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.tabs.some(tab => tab.appId === appId)
      ? mirror({ ...win, minimized: false, zIndex: z, activeTab: win.tabs.find(tab => tab.appId === appId).key })
      : win)));
  }, [setWindows]);

  // Every action below is useCallback'd with no dependencies, so this object is
  // created once and keeps its identity for the lifetime of the provider.
  const actions = useMemo(() => ({
    openWindow, updateWindow, focusWindow, closeWindow, addTab, closeTab, setActiveTab, closeApp, focusApp, restoreSession,
  }), [openWindow, updateWindow, focusWindow, closeWindow, addTab, closeTab, setActiveTab, closeApp, focusApp, restoreSession]);

  return (
    <WindowActionsContext.Provider value={actions}>
      <WindowListContext.Provider value={windows}>
        {children}
      </WindowListContext.Provider>
    </WindowActionsContext.Provider>
  );
}
