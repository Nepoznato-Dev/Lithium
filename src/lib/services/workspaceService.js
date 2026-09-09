/**
 * WorkspaceService — save and restore window layouts as named workspaces.
 *
 * A workspace captures:
 *   - Which apps are open (tab structure per window)
 *   - Window positions, sizes, z-order, minimized/maximized state
 *
 * Workspaces are persisted to localStorage and can be restored to recreate
 * the exact desktop layout.
 */

import { storage } from '../storage/localStorage';

const WORKSPACES_KEY = 'lithium:workspaces';
const ACTIVE_WORKSPACE_KEY = 'lithium:active-workspace';

/** Load all saved workspaces. */
export function listWorkspaces() {
  try { return storage.get(WORKSPACES_KEY, []); } catch { return []; }
}

/** Save a workspace layout. */
export function saveWorkspace(name, windows) {
  const workspaces = listWorkspaces();
  const layout = captureLayout(windows);
  const existing = workspaces.findIndex(w => w.name === name);
  const entry = {
    name,
    layout,
    windowCount: windows.length,
    savedAt: Date.now(),
  };
  if (existing >= 0) {
    workspaces[existing] = entry;
  } else {
    workspaces.push(entry);
  }
  storage.set(WORKSPACES_KEY, workspaces);
  storage.set(ACTIVE_WORKSPACE_KEY, name);
  window.dispatchEvent(new CustomEvent('lithium:workspace-saved', { detail: { name } }));
  return entry;
}

/** Load a workspace layout by name. Returns the layout or null. */
export function loadWorkspace(name) {
  const workspaces = listWorkspaces();
  const ws = workspaces.find(w => w.name === name);
  if (!ws) return null;
  storage.set(ACTIVE_WORKSPACE_KEY, name);
  return ws.layout;
}

/** Delete a workspace by name. */
export function deleteWorkspace(name) {
  const workspaces = listWorkspaces().filter(w => w.name !== name);
  storage.set(WORKSPACES_KEY, workspaces);
  if (storage.get(ACTIVE_WORKSPACE_KEY, null) === name) {
    storage.remove(ACTIVE_WORKSPACE_KEY);
  }
}

/** Get the currently active workspace name. */
export function getActiveWorkspace() {
  return storage.get(ACTIVE_WORKSPACE_KEY, null);
}

/** Rename a workspace. */
export function renameWorkspace(oldName, newName) {
  const workspaces = listWorkspaces();
  const ws = workspaces.find(w => w.name === oldName);
  if (ws) {
    ws.name = newName;
    storage.set(WORKSPACES_KEY, workspaces);
    if (storage.get(ACTIVE_WORKSPACE_KEY, null) === oldName) {
      storage.set(ACTIVE_WORKSPACE_KEY, newName);
    }
  }
}

/** Capture the current window state into a serializable layout. */
function captureLayout(windows) {
  return windows.map(win => ({
    id: win.id,
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
    minimized: win.minimized,
    maximized: win.maximized,
    tabs: win.tabs.map(tab => ({
      appId: tab.appId,
      title: tab.title,
    })),
    activeTab: win.activeTab,
  }));
}

/** Apply a saved layout to the window manager.
 *  Returns an array of app IDs that should be opened. */
export function getAppsFromLayout(layout) {
  const appIds = new Set();
  for (const win of layout) {
    for (const tab of win.tabs) {
      if (tab.appId) appIds.add(tab.appId);
    }
  }
  return [...appIds];
}

/** Get position/size overrides from a layout for a specific window. */
export function getLayoutPosition(layout, appId) {
  for (const win of layout) {
    if (win.tabs.some(t => t.appId === appId)) {
      return {
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
        maximized: win.maximized,
        minimized: win.minimized,
      };
    }
  }
  return null;
}
