import { snapBounds } from '../../../lib/desktop/ui';
import { storage } from '../../../lib/storage';
import { trashedItems, createEntry, restoreEntry } from '../../../lib/fileSystem';
import { WALLPAPERS } from './wallpapers';

/** Builds the four desktop context menus: desktop, taskbar, pinned-app, window-button. */
export default function useContextMenus({ apps, windows, fsTree, wallpaper, pinnedTaskbar, launchApp, closeAllWindows, openDynMenu, setTaskViewOpen, setTaskbarSettingsOpen, togglePin, setFsTree, setWallpaper, closeWindow, updateWindow }) {
  const DESKTOP_FOLDER_ID = 'default-desktop';
  const wpIds = Object.keys(WALLPAPERS);
  const currentWpIdx = wpIds.indexOf(wallpaper);
  const nextWallpaper = () => setWallpaper(wpIds[(currentWpIdx + 1) % wpIds.length]);

  const desktopContextMenu = event => {
    if (event.target.closest('.nx-window')) return;
    event.preventDefault();

    const trashed = trashedItems(fsTree);
    const lastTrash = trashed.length ? trashed.reduce((a, b) => ((a.updatedAt || 0) > (b.updatedAt || 0) ? a : b)) : null;

    openDynMenu(event, [
      { id: 'view', label: 'View', icon: 'LayoutGrid', items: [
        { id: 'icons-large', label: 'Large icons', icon: 'LayoutGrid', action: () => storage.set('desktop-icon-size', 'large') },
        { id: 'icons-medium', label: 'Medium icons', icon: 'LayoutGrid', action: () => storage.set('desktop-icon-size', 'medium') },
        { id: 'icons-small', label: 'Small icons', icon: 'LayoutGrid', action: () => storage.set('desktop-icon-size', 'small') },
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
          setFsTree(createEntry(fsTree, { name: 'New folder', type: 'folder', parentId: DESKTOP_FOLDER_ID }));
        }},
        { id: 'new-text', label: 'Text Document', icon: 'FileText', action: () => {
          setFsTree(createEntry(fsTree, { name: 'New Document.txt', type: 'text', parentId: DESKTOP_FOLDER_ID }));
        }},
        { id: 'new-md', label: 'Markdown File', icon: 'FileText', action: () => {
          setFsTree(createEntry(fsTree, { name: 'New Notes.md', type: 'text', parentId: DESKTOP_FOLDER_ID }));
        }},
        { id: 'new-code', label: 'Code File', icon: 'SquareTerminal', action: () => {
          setFsTree(createEntry(fsTree, { name: 'script.js', type: 'text', parentId: DESKTOP_FOLDER_ID }));
        }},
      ]},
      { id: 'display', label: 'Display settings', icon: 'Monitor', action: () => launchApp('settings') },
      { id: 'personalize', label: 'Personalize', icon: 'Palette', action: () => launchApp('settings') },
      { id: 'sep2', type: 'separator' },
      { id: 'terminal', label: 'Open in Terminal', icon: 'SquareTerminal', action: () => launchApp('code-studio') },
      { id: 'more', label: 'Show more options', icon: 'Menu', shortcut: 'Shift+F10', action: () => launchApp('settings') },
    ]);
  };

  const taskbarContextMenu = event => {
    openDynMenu(event, [
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
    ]);
  };

  const pinnedAppContextMenu = (event, app) => {
    const running = windows.find(item => item.id === app.id);
    openDynMenu(event, [
      { id: 'open', label: app.name, icon: app.icon, action: () => launchApp(app) },
      { id: 'sep-1', type: 'separator' },
      ...(running ? [{ id: 'close', label: 'Close window', icon: 'SquareX', action: () => closeWindow(app.id) }] : []),
      { id: 'unpin', label: 'Unpin from taskbar', icon: 'Pin', action: () => togglePin(app.id) },
    ]);
  };

  const windowButtonContextMenu = (event, item) => {
    openDynMenu(event, [
      { id: 'heading', type: 'heading', label: item.title },
      { id: 'toggle-min', label: item.minimized ? 'Restore' : 'Minimize', icon: 'Eye', action: () => updateWindow(item.id, { minimized: !item.minimized }) },
      { id: 'toggle-max', label: item.maximized ? 'Restore down' : 'Maximize', icon: 'SquareX', action: () => updateWindow(item.id, { maximized: !item.maximized, minimized: false }) },
      { id: 'snap-left', label: 'Snap to left half', icon: 'PanelLeft', action: () => updateWindow(item.id, { ...snapBounds('left'), minimized: false }) },
      { id: 'snap-right', label: 'Snap to right half', icon: 'PanelRight', action: () => updateWindow(item.id, { ...snapBounds('right'), minimized: false }) },
      { id: 'sep-1', type: 'separator' },
      { id: 'close', label: 'Close window', icon: 'SquareX', danger: true, action: () => closeWindow(item.id) },
      { id: 'close-all', label: 'Close all windows', icon: 'SquareX', disabled: windows.length <= 1, action: closeAllWindows },
    ]);
  };

  return { desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu };
}
