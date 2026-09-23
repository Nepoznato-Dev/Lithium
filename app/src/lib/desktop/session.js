import { storage } from '../storage/localStorage.js';

export const DESKTOP_SESSION_KEY = 'desktop-session:v1';
const MAX_WINDOWS = 40;
const MAX_TABS = 20;
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

/** Keep restored window controls reachable on a different-sized display. */
export function fitWindow(bounds = {}, viewport = {}) {
  const screenWidth = Math.max(1, finite(viewport.width, globalThis.window?.innerWidth || 1920));
  const screenHeight = Math.max(1, finite(viewport.height, globalThis.window?.innerHeight || 1080) - 48);
  const width = Math.min(screenWidth, Math.max(320, finite(bounds.width, 900)));
  const height = Math.min(screenHeight, Math.max(220, finite(bounds.height, 640)));
  return {
    x: Math.max(0, Math.min(finite(bounds.x, 110), screenWidth - width)),
    y: Math.max(0, Math.min(finite(bounds.y, 70), screenHeight - height)),
    width,
    height,
    maximized: bounds.maximized === true,
  };
}

/** Validate stored JSON. Components, props, and executable app data never go to disk. */
export function normalizeDesktopSession(value) {
  const empty = { version: 1, windows: [], placements: {} };
  if (value?.version !== 1 || !Array.isArray(value.windows)) return empty;
  const windowIds = new Set();
  const windows = [];
  for (const win of value.windows.slice(0, MAX_WINDOWS)) {
    if (!win || !isId(win.id) || windowIds.has(win.id) || !Array.isArray(win.tabs)) continue;
    const tabKeys = new Set();
    const tabs = win.tabs.slice(0, MAX_TABS).flatMap(tab => {
      if (!tab || !isId(tab.key) || !isId(tab.appId) || tabKeys.has(tab.key)) return [];
      tabKeys.add(tab.key);
      return [{ key: tab.key, appId: tab.appId }];
    });
    if (!tabs.length) continue;
    windowIds.add(win.id);
    windows.push({
      id: win.id,
      ...fitWindow(win),
      minimized: win.minimized === true,
      zIndex: finite(win.zIndex, 10),
      tabs,
      activeTab: tabs.some(tab => tab.key === win.activeTab) ? win.activeTab : tabs[0].key,
    });
  }
  const placements = {};
  if (value.placements && typeof value.placements === 'object' && !Array.isArray(value.placements)) {
    for (const [appId, bounds] of Object.entries(value.placements).slice(-200)) {
      if (isId(appId) && bounds && typeof bounds === 'object') {
        Object.defineProperty(placements, appId, { value: fitWindow(bounds), enumerable: true, configurable: true, writable: true });
      }
    }
  }
  return { version: 1, windows, placements };
}

export function loadDesktopSession() {
  return normalizeDesktopSession(storage.get(DESKTOP_SESSION_KEY));
}

export function captureDesktopSession(windows, placements = {}) {
  return normalizeDesktopSession({
    version: 1,
    placements,
    windows: windows.map(win => ({
      id: win.id,
      x: win.x, y: win.y, width: win.width, height: win.height,
      maximized: win.maximized, minimized: win.minimized, zIndex: win.zIndex,
      activeTab: win.activeTab,
      tabs: win.tabs.map(tab => ({ key: tab.key, appId: tab.appId })),
    })),
  });
}

/** Rehydrate only apps from the current registry; removed apps are safely skipped. */
export function restoreDesktopWindows(session, apps) {
  const registry = new Map(apps.map(app => [app.id, app]));
  return session.windows.flatMap(win => {
    const tabs = win.tabs.flatMap(tab => {
      const app = registry.get(tab.appId);
      return app ? [{ ...tab, title: app.title, icon: app.icon, component: app.component }] : [];
    });
    if (!tabs.length) return [];
    return [{ ...win, ...fitWindow(win), tabs, activeTab: tabs.some(tab => tab.key === win.activeTab) ? win.activeTab : tabs[0].key }];
  }).sort((a, b) => a.zIndex - b.zIndex).map((win, index) => ({ ...win, zIndex: 11 + index }));
}
