/**
 * Tab state — central store for open tabs, active tab, and per-tab navigation.
 * Uses @preact/signals for fine-grained reactivity.
 */
import { signal, computed } from '@preact/signals';

let tabCounter = 0;

const NEWTAB_URL = 'lithium://newtab';

/** Create a fresh tab object. */
export function createTab(url) {
  const initialUrl = url || NEWTAB_URL;
  const tab = {
    id: `tab-${++tabCounter}`,
    title: 'New tab',
    favicon: null,
    isLoading: false,
    isPinned: false,
    isMuted: false,
    groupId: null,
    history: [{ url: initialUrl, mode: 'normal' }],
    index: 0,
    reloadKey: 0,
    mode: 'normal',
    searchData: null,
  };
  return tab;
}

/** All open tabs. */
export const tabs = signal([createTab()]);

/** Currently active tab id. */
export const activeTabId = signal(tabs.value[0].id);

/** Computed: the active tab object. */
export const activeTab = computed(() =>
  tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
);

/** Computed: current URL of the active tab. */
export const currentUrl = computed(() => {
  const tab = activeTab.value;
  if (!tab || tab.index < 0) return null;
  const entry = tab.history[tab.index];
  return typeof entry === 'object' ? entry?.url : entry;
});

/** Computed: active tab's viewport mode ('normal' | 'search' | 'reader' | 'rebuild' | 'fullRender'). */
export const activeTabMode = computed(() => activeTab.value?.mode || 'normal');

/** Computed: active tab's search result data. */
export const activeTabSearchData = computed(() => activeTab.value?.searchData || null);

/* ---------- Actions ---------- */

export function addTab(url) {
  const tab = createTab(url);
  tabs.value = [...tabs.value, tab];
  activeTabId.value = tab.id;
  return tab.id;
}

export function closeTab(id) {
  const remaining = tabs.value.filter(t => t.id !== id);
  if (remaining.length === 0) {
    const fresh = createTab();
    tabs.value = [fresh];
    activeTabId.value = fresh.id;
    return;
  }
  if (id === activeTabId.value) {
    const idx = tabs.value.findIndex(t => t.id === id);
    const next = remaining[Math.min(idx, remaining.length - 1)];
    activeTabId.value = next.id;
  }
  tabs.value = remaining;
}

export function setActiveTab(id) {
  activeTabId.value = id;
}

export function updateTab(id, patch) {
  tabs.value = tabs.value.map(t => t.id === id ? { ...t, ...patch } : t);
}

export function navigateTab(id, url, mode = 'normal') {
  tabs.value = tabs.value.map(t => {
    if (t.id !== id) return t;
    const history = [...t.history.slice(0, t.index + 1), { url, mode }];
    return { ...t, history, index: history.length - 1, reloadKey: t.reloadKey + 1, isLoading: true, mode };
  });
}

export function goBack(id) {
  tabs.value = tabs.value.map(t => {
    if (t.id !== id || t.index <= 0) return t;
    const newIndex = t.index - 1;
    const entry = t.history[newIndex];
    const mode = typeof entry === 'object' ? (entry.mode || 'normal') : 'normal';
    return { ...t, index: newIndex, reloadKey: t.reloadKey + 1, mode };
  });
}

export function goForward(id) {
  tabs.value = tabs.value.map(t => {
    if (t.id !== id || t.index >= t.history.length - 1) return t;
    const newIndex = t.index + 1;
    const entry = t.history[newIndex];
    const mode = typeof entry === 'object' ? (entry.mode || 'normal') : 'normal';
    return { ...t, index: newIndex, reloadKey: t.reloadKey + 1, mode };
  });
}

export function reloadTab(id) {
  tabs.value = tabs.value.map(t =>
    t.id === id ? { ...t, reloadKey: t.reloadKey + 1, isLoading: true } : t
  );
}

export function pinTab(id) {
  tabs.value = tabs.value.map(t =>
    t.id === id ? { ...t, isPinned: !t.isPinned } : t
  );
}

export function duplicateTab(id) {
  const source = tabs.value.find(t => t.id === id);
  if (!source) return;
  const entry = source.index >= 0 ? source.history[source.index] : null;
  const url = typeof entry === 'object' ? entry?.url : entry;
  addTab(url && url !== NEWTAB_URL ? url : undefined);
}

export function reorderTabs(fromIndex, toIndex) {
  const arr = [...tabs.value];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  tabs.value = arr;
}

export function setTabLoading(id, loading) {
  updateTab(id, { isLoading: loading });
}

export function setTabTitle(id, title) {
  updateTab(id, { title });
}

export function closeOtherTabs(id) {
  const keep = tabs.value.find(t => t.id === id);
  if (!keep) return;
  tabs.value = [keep];
  activeTabId.value = id;
}

export function closeTabsToRight(id) {
  const idx = tabs.value.findIndex(t => t.id === id);
  if (idx < 0) return;
  const keep = tabs.value.slice(0, idx + 1);
  tabs.value = keep;
  if (!keep.find(t => t.id === activeTabId.value)) {
    activeTabId.value = keep[keep.length - 1].id;
  }
}
