import { snapBounds } from '../../../lib/desktop/ui';
import { storage } from '../../../lib/storage';
import { trashedItems, createEntry, restoreEntry, childrenOf } from '../../../lib/fileSystem';
import { notify } from '../../../lib/desktop/notify';
import { WALLPAPERS } from './wallpapers';
import { ContextMenuRegistry } from '../../../lib/desktop/contextMenuRegistry';

/** Resolve a unique file name by appending (2), (3), … when siblings collide. */
function uniqueName(baseName, siblings) {
  const dot = baseName.lastIndexOf('.');
  const base = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  const existing = new Set(siblings.map(s => s.name));
  if (!existing.has(baseName)) return baseName;
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (existing.has(candidate)) { candidate = `${base} (${++n})${ext}`; }
  return candidate;
}

/**
 * Merge registered context menu contributions into default items.
 * If a user override is active for the scope, replaces the entire menu.
 * Otherwise appends contributed items after a separator.
 */
function mergeRegisteredItems(defaultItems, scope, ctx) {
  const { items: contributed, isOverride } = ContextMenuRegistry.buildForScope(scope, ctx);
  if (isOverride) return contributed;
  if (contributed.length === 0) return defaultItems;
  return [
    ...defaultItems,
    { id: `ctx-registry-sep-${scope}`, type: 'separator' },
    ...contributed,
  ];
}

/** Builds the four desktop context menus: desktop, taskbar, pinned-app, window-button. */
export default function useContextMenus({ apps, windows, fsTree, wallpaper, pinnedTaskbar, launchApp, closeAllWindows, openDynMenu, setTaskViewOpen, setTaskbarSettingsOpen, togglePin, setFsTree, setWallpaper, closeWindow, updateWindow, iconSizeMode, setIconSizeMode }) {
  const DESKTOP_FOLDER_ID = 'default-desktop';
  const wpIds = Object.keys(WALLPAPERS);
  const currentWpIdx = wpIds.indexOf(wallpaper);
  const nextWallpaper = () => setWallpaper(wpIds[(currentWpIdx + 1) % wpIds.length]);

  const desktopContextMenu = event => {
    if (event.target.closest('.nx-window')) return;
    event.preventDefault();

    const trashed = trashedItems(fsTree);
    const lastTrash = trashed.length ? trashed.reduce((a, b) => ((a.updatedAt || 0) > (b.updatedAt || 0) ? a : b)) : null;

    openDynMenu(event, mergeRegisteredItems([
      { id: 'view', label: 'View', icon: 'LayoutGrid', items: [
        { id: 'icons-large', label: 'Large icons', icon: 'LayoutGrid', checked: iconSizeMode === 'large', action: () => setIconSizeMode?.('large') },
        { id: 'icons-balanced', label: 'Balanced icons', icon: 'LayoutGrid', checked: iconSizeMode === 'balanced', action: () => setIconSizeMode?.('balanced') },
        { id: 'icons-compact', label: 'Compact icons', icon: 'LayoutGrid', checked: iconSizeMode === 'compact', action: () => setIconSizeMode?.('compact') },
        { id: 'vsep', type: 'separator' },
        { id: 'auto-arrange', label: 'Auto arrange icons', icon: 'Blocks', action: () => storage.set('desktop-auto-arrange', !storage.get('desktop-auto-arrange', false)) },
      ]},
      { id: 'sort-by', label: 'Sort by', icon: 'ArrowLeftRight', items: [
        { id: 'sort-name', label: 'Name', icon: 'ArrowLeftRight', action: () => storage.set('desktop-sort', 'name') },
        { id: 'sort-type', label: 'Type', icon: 'FileText', action: () => storage.set('desktop-sort', 'type') },
        { id: 'sort-date', label: 'Date modified', icon: 'Clock', action: () => storage.set('desktop-sort', 'date') },
      ]},
      { id: 'refresh', label: 'Refresh', icon: 'RefreshCw', action: () => {
        window.dispatchEvent(new Event('lithium:fs-changed'));
      }},
      { id: 'sep1', type: 'separator' },
      { id: 'next-bg', label: 'Next desktop background', icon: 'Image', action: nextWallpaper },
      { id: 'undo-del', label: 'Undo Delete', icon: 'RotateCcw', shortcut: 'Ctrl+Z',
        disabled: !lastTrash,
        action: () => { if (lastTrash) setFsTree(restoreEntry(fsTree, lastTrash.id)); } },
      { id: 'new', label: 'New', icon: 'Plus', items: [
        { id: 'new-folder', label: 'Folder', icon: 'FolderPlus', action: () => {
          const siblings = childrenOf(fsTree, DESKTOP_FOLDER_ID);
          const name = uniqueName('New folder', siblings);
          setFsTree(createEntry(fsTree, { name, type: 'folder', parentId: DESKTOP_FOLDER_ID }));
          notify({ title: `Folder "${name}" created`, tone: 'info' });
        }},
        { id: 'new-text', label: 'Text Document', icon: 'FileText', action: () => {
          const siblings = childrenOf(fsTree, DESKTOP_FOLDER_ID);
          const name = uniqueName('New Document.txt', siblings);
          setFsTree(createEntry(fsTree, { name, type: 'text', parentId: DESKTOP_FOLDER_ID, content: '' }));
          notify({ title: `"${name}" created on Desktop`, tone: 'info' });
        }},
        { id: 'new-md', label: 'Markdown File', icon: 'FileText', action: () => {
          const siblings = childrenOf(fsTree, DESKTOP_FOLDER_ID);
          const name = uniqueName('New Notes.md', siblings);
          setFsTree(createEntry(fsTree, { name, type: 'text', parentId: DESKTOP_FOLDER_ID, content: '' }));
          notify({ title: `"${name}" created on Desktop`, tone: 'info' });
        }},
        { id: 'new-code', label: 'Code File', icon: 'SquareTerminal', action: () => {
          const siblings = childrenOf(fsTree, DESKTOP_FOLDER_ID);
          const name = uniqueName('script.js', siblings);
          setFsTree(createEntry(fsTree, { name, type: 'text', parentId: DESKTOP_FOLDER_ID, content: '' }));
          notify({ title: `"${name}" created on Desktop`, tone: 'info' });
        }},
      ]},
      { id: 'display', label: 'Display settings', icon: 'Monitor', action: () => launchApp('settings') },
      { id: 'personalize', label: 'Personalize', icon: 'Palette', action: () => launchApp('settings') },
      { id: 'sep2', type: 'separator' },
      { id: 'terminal', label: 'Open in Terminal', icon: 'SquareTerminal', action: () => launchApp('code-studio') },
      { id: 'ai-sep', type: 'separator' },
      { id: 'ai', label: 'AI', icon: 'BrainCircuit', items: [
        { id: 'ai-ask', label: 'Ask AI', icon: 'BrainCircuit', action: () => launchApp('ai-hub') },
        { id: 'ai-summarize', label: 'Summarize selection', icon: 'FileText', action: () => {
          const sel = window.getSelection?.()?.toString()?.trim();
          if (sel) {
            import('../../../lib/services/aiContext').then(({ summarizeAction, collectSelectionContext }) => {
              summarizeAction(collectSelectionContext());
              launchApp('ai-hub');
            });
          } else { launchApp('ai-hub'); }
        }},
        { id: 'ai-explain', label: 'Explain selection', icon: 'HelpCircle', action: () => {
          const sel = window.getSelection?.()?.toString()?.trim();
          if (sel) {
            import('../../../lib/services/aiContext').then(({ explainAction, collectSelectionContext }) => {
              explainAction(collectSelectionContext());
              launchApp('ai-hub');
            });
          } else { launchApp('ai-hub'); }
        }},
        { id: 'ai-translate', label: 'Translate selection', icon: 'Globe', action: () => {
          const sel = window.getSelection?.()?.toString()?.trim();
          if (sel) {
            import('../../../lib/services/aiContext').then(({ translateAction, collectSelectionContext }) => {
              translateAction(collectSelectionContext());
              launchApp('ai-hub');
            });
          } else { launchApp('ai-hub'); }
        }},
      ]},
      { id: 'more', label: 'Show more options', icon: 'Menu', shortcut: 'Shift+F10', action: () => launchApp('settings') },
    ], 'desktop', { scope: 'desktop' }));
  };

  const taskbarContextMenu = event => {
    openDynMenu(event, mergeRegisteredItems([
      { id: 'task-manager', label: 'Task manager', icon: 'Activity', action: () => launchApp('task-manager') },
      { id: 'task-view', label: 'Task view', icon: 'LayoutGrid', action: () => setTaskViewOpen(true) },
      { id: 'taskbar-settings', label: 'Taskbar settings', icon: 'SlidersHorizontal', action: () => setTaskbarSettingsOpen(true) },
      { id: 'sep-1', type: 'separator' },
      { id: 'show-desktop', label: 'Show desktop', icon: 'Eye', action: () => windows.forEach(item => updateWindow(item.id, { minimized: true })) },
      { id: 'close-all', label: 'Close all windows', icon: 'SquareX', disabled: windows.length === 0, action: closeAllWindows },
      { id: 'sep-2', type: 'separator' },
      {
        id: 'pins', label: 'Pin / unpin apps', icon: 'Pin',
        items: apps.filter(app => app.id !== 'settings').map(app => ({
          id: `pin-${app.id}`,
          label: app.name,
          icon: app.icon,
          checked: pinnedTaskbar.includes(app.id),
          action: () => togglePin(app.id),
        })),
      },
    ], 'taskbar', { scope: 'taskbar' }));
  };

  const pinnedAppContextMenu = (event, app) => {
    const running = windows.find(item => item.id === app.id);
    openDynMenu(event, mergeRegisteredItems([
      { id: 'open', label: app.name, icon: app.icon, action: () => launchApp(app) },
      { id: 'sep-1', type: 'separator' },
      ...(running ? [{ id: 'close', label: 'Close window', icon: 'SquareX', action: () => closeWindow(app.id) }] : []),
      { id: 'unpin', label: 'Unpin from taskbar', icon: 'Pin', action: () => togglePin(app.id) },
    ], 'pinned-app', { scope: 'pinned-app', app }));
  };

  const windowButtonContextMenu = (event, item) => {
    openDynMenu(event, mergeRegisteredItems([
      { id: 'heading', type: 'heading', label: item.title },
      { id: 'toggle-min', label: item.minimized ? 'Restore' : 'Minimize', icon: 'Eye', action: () => updateWindow(item.id, { minimized: !item.minimized }) },
      { id: 'toggle-max', label: item.maximized ? 'Restore down' : 'Maximize', icon: 'SquareX', action: () => updateWindow(item.id, { maximized: !item.maximized, minimized: false }) },
      { id: 'snap-left', label: 'Snap to left half', icon: 'PanelLeft', action: () => updateWindow(item.id, { ...snapBounds('left'), minimized: false }) },
      { id: 'snap-right', label: 'Snap to right half', icon: 'PanelRight', action: () => updateWindow(item.id, { ...snapBounds('right'), minimized: false }) },
      { id: 'sep-1', type: 'separator' },
      { id: 'close', label: 'Close window', icon: 'SquareX', danger: true, action: () => closeWindow(item.id) },
      { id: 'close-all', label: 'Close all windows', icon: 'SquareX', disabled: windows.length <= 1, action: closeAllWindows },
    ], 'window', { scope: 'window', window: item }));
  };

  return { desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu };
}
