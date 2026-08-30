import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const WindowContext = createContext(null);

export function useDesktopWindows() {
  const context = useContext(WindowContext);
  if (!context) throw new Error('useDesktopWindows must be used inside DesktopWindowProvider');
  return context;
}

let tabSerial = 1;
let winSerial = 1;

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
  const [windows, setWindows] = useState([]);
  const nextZIndex = useRef(10);

  const focusWindow = useCallback(id => {
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.id === id ? { ...win, zIndex: z } : win)));
  }, []);

  const openWindow = useCallback(config => {
    const makeTab = () => ({
      key: `tab-${tabSerial++}`,
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
      const id = config.newWindow && !current.some(win => win.id === config.id) ? config.id : `${config.id}-${winSerial++}`;
      /* Cascade new windows so they don't stack on top of each other. */
      const cascadeStep = current.length * 28;
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
        tabs: [tab],
        activeTab: tab.key,
      })];
    });
  }, []);

  const updateWindow = useCallback((id, changes) => {
    setWindows(current => current.map(win => (win.id === id ? { ...win, ...changes } : win)));
  }, []);

  const closeWindow = useCallback(id => {
    setWindows(current => current.filter(win => win.id !== id));
  }, []);

  const addTab = useCallback((windowId, config) => {
    const tab = { key: `tab-${tabSerial++}`, appId: config.appId, title: config.title, icon: config.icon, component: config.component };
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.id === windowId
      ? mirror({ ...win, zIndex: z, tabs: [...win.tabs, tab], activeTab: tab.key })
      : win)));
  }, []);

  const closeTab = useCallback((windowId, key) => {
    setWindows(current => current.flatMap(win => {
      if (win.id !== windowId) return [win];
      const tabs = win.tabs.filter(tab => tab.key !== key);
      if (!tabs.length) return []; // last tab closed → window closes
      const activeTab = win.activeTab === key ? tabs[tabs.length - 1].key : win.activeTab;
      return [mirror({ ...win, tabs, activeTab })];
    }));
  }, []);

  const setActiveTab = useCallback((windowId, key) => {
    setWindows(current => current.map(win => (win.id === windowId ? mirror({ ...win, activeTab: key }) : win)));
  }, []);

  /** Close whichever tab hosts the given app (used by apps.close). */
  const closeApp = useCallback(appId => {
    setWindows(current => current.flatMap(win => {
      const tabs = win.tabs.filter(tab => tab.appId !== appId);
      if (tabs.length === win.tabs.length) return [win];
      if (!tabs.length) return [];
      const activeTab = tabs.some(tab => tab.key === win.activeTab) ? win.activeTab : tabs[tabs.length - 1].key;
      return [mirror({ ...win, tabs, activeTab })];
    }));
  }, []);

  /** Focus the window + tab hosting the given app (used by apps.focus). */
  const focusApp = useCallback(appId => {
    nextZIndex.current += 1;
    const z = nextZIndex.current;
    setWindows(current => current.map(win => (win.tabs.some(tab => tab.appId === appId)
      ? mirror({ ...win, minimized: false, zIndex: z, activeTab: win.tabs.find(tab => tab.appId === appId).key })
      : win)));
  }, []);

  return (
    <WindowContext.Provider value={{ windows, openWindow, updateWindow, focusWindow, closeWindow, addTab, closeTab, setActiveTab, closeApp, focusApp }}>
      {children}
    </WindowContext.Provider>
  );
}
