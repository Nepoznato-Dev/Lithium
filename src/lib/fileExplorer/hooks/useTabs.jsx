/**
 * Tab management — add, close, switch tabs, sync nav state.
 */
import { useCallback } from 'react';
import { tabs, activeTabId, nav, view, clearSelection } from '../state/signals.jsx';

export function useTabs() {
  const addTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}`,
      driveId: 'local',
      stack: [{ id: 'root', name: 'Local Disk (C:)' }],
      view: 'files',
    };
    tabs.value = [...tabs.value, newTab];
    activeTabId.value = newTab.id;
    nav.value = { driveId: newTab.driveId, stack: newTab.stack };
    view.value = newTab.view;
    clearSelection();
  }, []);

  const closeTab = useCallback((tabId) => {
    const current = tabs.value;
    if (current.length <= 1) return;
    const next = current.filter(t => t.id !== tabId);
    if (activeTabId.value === tabId) {
      const newActive = next[next.length - 1];
      activeTabId.value = newActive.id;
      nav.value = { driveId: newActive.driveId, stack: newActive.stack };
      view.value = newActive.view;
      clearSelection();
    }
    tabs.value = next;
  }, []);

  const switchTab = useCallback((tabId) => {
    // Save current nav state to the active tab
    tabs.value = tabs.value.map(t =>
      t.id === activeTabId.value
        ? { ...t, driveId: nav.value.driveId, stack: nav.value.stack, view: view.value }
        : t
    );
    // Switch to new tab
    const tab = tabs.value.find(t => t.id === tabId);
    if (tab) {
      activeTabId.value = tabId;
      nav.value = { driveId: tab.driveId, stack: tab.stack };
      view.value = tab.view;
      clearSelection();
    }
  }, []);

  /** Sync nav changes back to the active tab (call in useEffect). */
  const syncNav = useCallback(() => {
    tabs.value = tabs.value.map(t =>
      t.id === activeTabId.value
        ? { ...t, driveId: nav.value.driveId, stack: nav.value.stack, view: view.value }
        : t
    );
  }, []);

  return { addTab, closeTab, switchTab, syncNav };
}
