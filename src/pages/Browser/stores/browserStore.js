/**
 * Browser mode state — viewport mode is derived from the active tab's per-tab mode.
 * Also tracks backend health, find bar state, and other browser-level UI state.
 */
import { signal } from '@preact/signals';
import { activeTab, activeTabMode, activeTabSearchData, updateTab } from './tabStore';

/** Current viewport mode — derived from the active tab. */
export const viewportMode = activeTabMode;

/** Search page data — derived from the active tab's searchData. */
export const searchPage = activeTabSearchData;

/** Reader mode data: { url, text, error, loading } */
export const readerData = signal(null);

/** Rebuild mode data: { html, title, source, readerable, loading, error } */
export const rebuildData = signal(null);

/** Full render data: { srcdoc, title, source, loading, error } */
export const fullRenderData = signal(null);

/** Whether the backend proxy is reachable. */
export const backendUp = signal(false);

/** Whether the find bar is visible. */
export const findBarOpen = signal(false);

/** Find bar query text. */
export const findQuery = signal('');

/** Hash-based internal route (e.g. '#/settings', '#/history'). */
export const internalRoute = signal('');

/** Menu dropdown open state. */
export const menuOpen = signal(false);

/** Shields panel open state. */
export const shieldsPanelOpen = signal(false);

/* ---------- Actions ---------- */

export function setViewportMode(mode) {
  const tab = activeTab.value;
  if (!tab) return;
  updateTab(tab.id, { mode });
  // Clear irrelevant mode data when switching away
  if (mode !== 'search') updateTab(tab.id, { searchData: null });
  if (mode !== 'reader') readerData.value = null;
  if (mode !== 'rebuild') rebuildData.value = null;
  if (mode !== 'fullRender') fullRenderData.value = null;
}

export function clearAllModes() {
  const tab = activeTab.value;
  if (!tab) return;
  updateTab(tab.id, { mode: 'normal', searchData: null });
}

export function toggleFindBar() {
  findBarOpen.value = !findBarOpen.value;
  if (!findBarOpen.value) findQuery.value = '';
}

export function navigateInternal(route) {
  internalRoute.value = route;
}
