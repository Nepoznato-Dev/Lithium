import React, { lazy, Suspense, useEffect, useState } from 'react';
import Icon from '../../Icon';
import DesktopWindow from '../DesktopWindow';
import ContextMenu from '../ContextMenu';
import { AppIcon, PngIcon } from '../DesktopApps';
import { notify } from '../../../lib/desktop/notify';
import { childrenOf, createEntry, ensureTrashFolder, getEntry, TRASH_ID } from '../../../lib/fileSystem';
import { getDefaultApp } from '../../../lib/fileSystem/fileAssociations';

import { storage as localStorageStorage } from '../../../lib/storage';
import { weatherPng } from '../../../lib/deviceContext';
import { SEARCH_ENGINES } from '../../../lib/settings';
import { CalendarPopup, PerfPopup, StartButton, TaskbarClock } from '../DesktopTickers';
import { WALLPAPERS, ART_GALLERY } from './wallpapers';
import { isAnimatedWallpaper, getAnimatedComponent } from '../Backgrounds';
import DesktopIcons, { readFolderShortcuts, writeFolderShortcuts } from './DesktopIcons';
import { DEFAULT_ICON_MODE } from '../../../lib/desktop/iconGrid';
import useDesktopState from './useDesktopState';
import BatteryIcon from '../BatteryIcon';

// Lazy-load overlay components (only rendered when their popups are open)
const CommandPalette = lazy(() => import('../CommandPalette'));
const NotificationCenter = lazy(() => import('./NotificationCenter'));
const QuickActionsPanel = lazy(() => import('./QuickActionsPanel'));
const HiddenIconsPanel = lazy(() => import('./HiddenIconsPanel'));
const WeatherFlyout = lazy(() => import('./WeatherFlyout'));
const TaskView = lazy(() => import('../TaskView'));
const Browser = lazy(() => import('../../../pages/Browser'));

/* ── Window Controls Overlay detection ───────────────────────────────
 * When Lithium runs as an installed PWA with display_override containing
 * "window-controls-overlay", the OS draws its own titlebar buttons over
 * the page. We detect this and apply the .wco-active class so CSS can
 * push our chrome out of the reserved area.
 */
function useWindowControlsOverlay() {
  const [active, setActive] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return Boolean(navigator.windowControlsOverlay?.visible);
  });
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.windowControlsOverlay) return;
    const wco = navigator.windowControlsOverlay;
    // Initial state
    setActive(Boolean(wco.visible));
    const onChange = () => setActive(Boolean(wco.visible));
    wco.addEventListener('geometrychange', onChange);
    return () => wco.removeEventListener('geometrychange', onChange);
  }, []);
  return active;
}

// useSystemMetrics is re-exported for backward compat.
export { useSystemMetrics } from '../DesktopTickers';

export default function DesktopView() {
  const s = useDesktopState();
  const {
    windows, apps, getApp, settings, updateSetting, openWindow, updateWindow, focusWindow, closeWindow,
    online, netSpeed, battery, batteryTooltip, networkTooltip,
    weather, weatherOpen, setWeatherOpen, aiOutlook, locationInfo, newsItems, refreshWeather,
    altTab,
    desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu,
    startMenuOpen, setStartMenuOpen, searchQuery, setSearchQuery,
    powerMenuOpen, setPowerMenuOpen, volumePopupOpen, setVolumePopupOpen,
    quickSettingsOpen, setQuickSettingsOpen, prevVolumeRef,
    calendarOpen, setCalendarOpen, dynMenu, openDynMenu, closeDynMenu,
    taskbarSettingsOpen, setTaskbarSettingsOpen, taskbarPrefs, setTaskbarPrefs,
    perfOpen, setPerfOpen,
    hiddenIconsOpen, setHiddenIconsOpen, hiddenTrayItems, removeFromHiddenTray,
    fsTree, setFsTree, fsTrashedCount,
    shutdown, setShutdown, recentApps, pinnedTaskbar, setPinnedTaskbar,
    soundLevel, setSoundLevel, wallpaper, customWallpaper, avatar,
    toasts, appCategory,
    setHoveredApp, setPinnedOrder,
    gridFocus,
    dragPinned, setDragPinned, NEW_APP_IDS,
    notifCenterOpen, setNotifCenterOpen, notifUnread,
    taskViewOpen, setTaskViewOpen,
    launchApp, closeAllWindows, handlePower, togglePin, closePopups,
    openNoteResult, openFileResult,
    startApps, query, noteResults, fileResults,
    pinnedApps, pinnedAppsOrdered, filteredApps, getAppBadge,
    visibleWindows, maxZ,
    volumeIconName, volumeColor,
    unitSymbol, weatherDescription,
  } = s;

  /* --- Resolve wallpaper style from any source (gradients, art gallery, custom uploads) --- */
  const [customBlobUrl, setCustomBlobUrl] = useState(null);
  const wcoActive = useWindowControlsOverlay();
  useEffect(() => {
    if (!wallpaper || wallpaper.startsWith('art-') || wallpaper === 'custom') return;
    if (!wallpaper.startsWith('custom-')) { setCustomBlobUrl(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const req = indexedDB.open('lithium-kv');
        const blob = await new Promise((resolve) => {
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('blobs')) { resolve(null); return; }
            const tx = db.transaction('blobs', 'readonly');
            const g = tx.objectStore('blobs').get('wallpaper-blob:' + wallpaper);
            g.onsuccess = () => resolve(g.result);
            g.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
        });
        if (!cancelled && blob) setCustomBlobUrl(blob);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [wallpaper]);

  function resolveWallpaperStyle(wallId) {
    if (isAnimatedWallpaper(wallId)) return { backgroundColor: '#07070c' };
    if (WALLPAPERS[wallId]) return WALLPAPERS[wallId].style;
    const artEntry = ART_GALLERY.find(a => a.id === wallId);
    if (artEntry) return artEntry.style;
    if (wallId === 'custom' && customWallpaper) {
      return { backgroundColor: '#0a0a0f', backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (wallId?.startsWith('custom-') && customBlobUrl) {
      return { backgroundColor: '#0a0a0f', backgroundImage: `url("${customBlobUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    return null;
  }

  const AnimatedBgComponent = isAnimatedWallpaper(wallpaper) ? getAnimatedComponent(wallpaper) : null;

  const yukiWallpaper = settings.customization?.wallpaper;
  const yukiImageCandidate = yukiWallpaper?.path || yukiWallpaper?.url;
  const yukiImage = typeof yukiImageCandidate === 'string'
    && /^(data:image\/|https?:\/\/)/i.test(yukiImageCandidate)
    ? yukiImageCandidate
    : null;
  const yukiWallpaperStyle = yukiWallpaper?.enabled !== false && yukiWallpaper
    ? yukiWallpaper.type === 'image' && yukiImage
    ? { backgroundImage: `url("${yukiImage.replaceAll('"', '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : yukiWallpaper.type === 'gradient'
        ? { backgroundImage: yukiWallpaper.gradient || 'linear-gradient(135deg, #0f1117, #1e1b4b)' }
        : { backgroundColor: yukiWallpaper.backgroundColor || '#0f1117' }
    : {};

  /* Profile switcher dropdown state */
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  /* Current folder being browsed on the desktop (null = root desktop). */
  const [currentDesktopFolder, setCurrentDesktopFolder] = useState(null);

  /** Pure-JS trash: reparent an entry into the Recycle Bin without WASM. */
  function desktopTrash(tree, id) {
    let next = ensureTrashFolder(tree);
    return next.map(entry => {
      if (entry.id === id) {
        return { ...entry, parentId: TRASH_ID, originalParentId: entry.parentId, trashedAt: Date.now(), updatedAt: Date.now() };
      }
      return entry;
    });
  }

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

  /* All apps overlay in start menu */
  const [allAppsView, setAllAppsView] = useState(false);

  /* Command palette (Ctrl/Cmd+K) — lazy-loaded */
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (shutdown) {
    return (
      <div className="nx-shutdown" onClick={() => setShutdown(false)} title="Click to power on">
        It&apos;s now safe to turn off your computer.
      </div>
    );
  }
  return (
    <div
      className={`nx-desktop${wcoActive ? ' wco-active' : ''}`}
      data-taskbar={taskbarPrefs.position}
      style={{
        ...(yukiWallpaper && yukiWallpaper.enabled !== false
          ? yukiWallpaperStyle
          : settings.background.enabled === false
            ? { backgroundColor: '#101014' }
            : resolveWallpaperStyle(wallpaper) || WALLPAPERS['lithium-default'].style),
        '--tb-left': taskbarPrefs.position === 'left' ? '58px' : '0px',
        '--tb-right': taskbarPrefs.position === 'right' ? '58px' : '0px',
        '--tb-bottom': taskbarPrefs.position === 'bottom' ? '48px' : '0px',
      }}
      onClick={closePopups}
      onContextMenu={desktopContextMenu}
    >
      {/* Window Controls Overlay drag handle — invisible bar the OS uses for window dragging */}
      {wcoActive && <div className="wco-drag-handle" aria-hidden />}
      {/* Wallpaper dimmer (Settings → Backgrounds → brightness) */}
      {yukiWallpaper && yukiWallpaper.enabled !== false && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backdropFilter: `blur(${yukiWallpaper?.blur || 0}px) brightness(${yukiWallpaper?.brightness || 1}) contrast(${yukiWallpaper?.contrast || 1})`,
            opacity: yukiWallpaper?.opacity ?? 1,
          }}
        />
      )}
      {settings.background.enabled !== false && settings.background.intensity < 1 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${(1 - settings.background.intensity) * 0.75})`, pointerEvents: 'none' }} />
      )}
      {/* Animated wallpaper canvas overlay */}
      {settings.background.enabled !== false && AnimatedBgComponent && (
        <AnimatedBgComponent lowEndMode={settings.performance.lowEndMode} />
      )}
      {/* Desktop icons */}
      <DesktopIcons
        apps={apps.filter(app => app.desktopIcon !== false)}
        onLaunch={launchApp}
        taskbarPosition={taskbarPrefs.position}
        iconSizeMode={settings.desktop?.iconSize || DEFAULT_ICON_MODE}
        fsTree={fsTree}
        onDesktopFolderChange={setCurrentDesktopFolder}
        onOpenFolder={(entry) => {
          if (entry.type === 'folder') return;
          const def = getDefaultApp(entry.name);
          if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
            launchApp('notepad', { entryId: entry.id });
          } else if (def) {
            window.dispatchEvent(new CustomEvent('lithium:launch-app', {
              detail: { appId: def.appId, fileEntry: entry },
            }));
          } else {
            launchApp('files');
            setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entry.parentId })), 120);
          }
        }}
        onIconContextMenu={(event, item, resetPosition) => {
          /* Desktop background context menu (also fires for folder browsed bg). */
          if (item.kind === '_bg_') {
            const parentFolder = item.folderId || 'default-desktop';
            const siblings = childrenOf(fsTree, parentFolder);
            return openDynMenu(event, [
              { id: 'new-folder', label: 'New folder', icon: 'FolderPlus', action: () => {
                const name = uniqueName('New folder', siblings);
                setFsTree(createEntry(fsTree, { name, type: 'folder', parentId: parentFolder }));
                notify({ title: `Folder "${name}" created`, tone: 'info' });
              }},
              { id: 'new-text', label: 'New text document', icon: 'FileText', action: () => {
                const name = uniqueName('New Document.txt', siblings);
                setFsTree(createEntry(fsTree, { name, type: 'text', parentId: parentFolder, content: '' }));
                notify({ title: `"${name}" created`, tone: 'info' });
              }},
              ...(parentFolder !== 'default-desktop' ? [{ id: 'new-shortcut', label: 'New shortcut', icon: 'ExternalLink', action: () => {
                const visibleApps = apps.filter(a => a.desktopIcon !== false && a.id !== 'recycle-bin');
                openDynMenu(event, visibleApps.map(app => ({
                  id: `sc-${app.id}`, label: app.name, icon: app.icon,
                  action: () => {
                    const folderEntry = getEntry(fsTree, parentFolder);
                    const existing = readFolderShortcuts(folderEntry);
                    if (existing.some(s => s.appId === app.id)) { notify({ title: 'Shortcut already exists', tone: 'info' }); return; }
                    setFsTree(writeFolderShortcuts(fsTree, parentFolder, [...existing, { appId: app.id }]));
                    notify({ title: `Shortcut to "${app.name}" added`, tone: 'info' });
                  },
                })));
              }}] : []),
              { id: 'sep-bg', type: 'separator' },
              { id: 'refresh', label: 'Refresh', icon: 'RefreshCw', action: () => window.dispatchEvent(new Event('lithium:fs-changed')) },
            ]);
          }
          /* App icon context menu. */
          if (item.kind === 'app') {
            const app = item.data;
            if (app.id === 'recycle-bin') {
              const count = fsTrashedCount;
              return openDynMenu(event, [
                { id: 'open', label: 'Open Recycle Bin', icon: app.icon, action: () => launchApp(app) },
                { id: 'empty', label: count > 0 ? `Empty Recycle Bin (${count} item${count === 1 ? '' : 's'})` : 'Recycle Bin is empty', icon: 'Trash2', danger: count > 0, disabled: count === 0, action: async () => {
                  if (!window.confirm(`Permanently delete ${count} item${count === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
                  try {
                    const { purgeTrash } = await import('../../../lib/fileSystem');
                    setFsTree(await purgeTrash(fsTree));
                    notify({ title: 'Recycle Bin emptied', tone: 'info' });
                  } catch (err) { notify({ title: 'Could not empty Recycle Bin', body: err.message, tone: 'error' }); }
                }},
                { id: 'sep-1', type: 'separator' },
                { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
              ]);
            }
            return openDynMenu(event, [
              { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
              { id: 'sep-1', type: 'separator' },
              ...(app.id !== 'task-manager' && app.id !== 'settings' ? [
                { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: 'Pin', action: () => togglePin(app.id) },
              ] : []),
              { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
            ]);
          }
          /* File entry context menu. */
          if (item.kind === 'file') {
            const entry = item.data;
            if (entry.type === 'folder') {
              return openDynMenu(event, [
                { id: 'open', label: `Open ${entry.name}`, icon: 'Folder', action: () => {
                  /* Navigate into this folder on the desktop. */
                  setCurrentDesktopFolder(entry.id);
                }},
                { id: 'open-explorer', label: 'Open in File Explorer', icon: 'FolderOpen', action: () => {
                  launchApp('files');
                  setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entry.id })), 120);
                }},
                { id: 'new-shortcut', label: 'New shortcut', icon: 'ExternalLink', action: () => {
                  const visibleApps = apps.filter(a => a.desktopIcon !== false && a.id !== 'recycle-bin');
                  openDynMenu(event, visibleApps.map(app => ({
                    id: `sc-${app.id}`, label: app.name, icon: app.icon,
                    action: () => {
                      const existing = readFolderShortcuts(entry);
                      if (existing.some(s => s.appId === app.id)) { notify({ title: 'Shortcut already exists', tone: 'info' }); return; }
                      setFsTree(writeFolderShortcuts(fsTree, entry.id, [...existing, { appId: app.id }]));
                      notify({ title: `Shortcut to "${app.name}" added`, tone: 'info' });
                    },
                  })));
                }},
                { id: 'sep-1', type: 'separator' },
                { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => {
                  setFsTree(desktopTrash(fsTree, entry.id));
                  notify({ title: `"${entry.name}" moved to Recycle Bin`, tone: 'info' });
                }},
                { id: 'sep-2', type: 'separator' },
                { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
              ]);
            }
            /* Regular file. */
            return openDynMenu(event, [
              { id: 'open', label: `Open ${entry.name}`, icon: 'FileText', action: () => {
                if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
                  launchApp('notepad', { entryId: entry.id });
                } else {
                  const def = getDefaultApp(entry.name);
                  if (def) {
                    window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: def.appId, fileEntry: entry } }));
                  } else {
                    launchApp('files');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entry.parentId })), 120);
                  }
                }
              }},
              { id: 'sep-1', type: 'separator' },
              { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => {
                setFsTree(desktopTrash(fsTree, entry.id));
                notify({ title: `"${entry.name}" moved to Recycle Bin`, tone: 'info' });
              }},
              { id: 'sep-2', type: 'separator' },
              { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
            ]);
          }
          /* Shortcut context menu. */
          if (item.kind === 'shortcut') {
            const app = item.data.app;
            return openDynMenu(event, [
              { id: 'open', label: `Open ${app?.name || 'App'}`, icon: app?.icon || 'ExternalLink', action: () => { if (app) launchApp(app); } },
              { id: 'remove', label: 'Remove shortcut', icon: 'X', action: () => {
                const folderEntry = getEntry(fsTree, currentDesktopFolder);
                if (!folderEntry) return;
                const shortcuts = readFolderShortcuts(folderEntry);
                setFsTree(writeFolderShortcuts(fsTree, currentDesktopFolder, shortcuts.filter(s => s.appId !== item.data.appId)));
                notify({ title: 'Shortcut removed', tone: 'info' });
              }},
              { id: 'sep-1', type: 'separator' },
              { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
            ]);
          }
        }}
      />

      {/* Windows */}
      {windows.map(item => <DesktopWindow key={item.id} item={item} apps={apps} />)}

      {/* Alt+Tab switcher */}
      {altTab && visibleWindows.length > 0 && (
        <div className="nx-alttab-backdrop">
          <div className="nx-alttab-panel">
            <div className="nx-alttab-hint">Alt + Tab to switch windows</div>
            <div className="nx-alttab-grid">
              {visibleWindows.map((item, index) => (
                <div key={item.id} className={`nx-alttab-item ${index === altTab.index % visibleWindows.length ? 'active' : ''}`}>
                  <div className="nx-alttab-icon">{item.icon}</div>
                  <div className="nx-alttab-title" style={{ fontWeight: index === altTab.index % visibleWindows.length ? 600 : 400 }}>
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task view overlay */}
      {taskViewOpen && (
        <Suspense fallback={null}>
          <TaskView
            windows={windows}
            onSelect={id => { updateWindow(id, { minimized: false }); focusWindow(id); setTaskViewOpen(false); }}
            onCloseWindow={id => closeWindow(id)}
            onCloseAll={() => { closeAllWindows(); setTaskViewOpen(false); }}
            onClose={() => setTaskViewOpen(false)}
          />
        </Suspense>
      )}

      {/* Command palette (Ctrl/Cmd+K) — lazy-loaded */}
      {cmdPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={cmdPaletteOpen}
            onClose={() => setCmdPaletteOpen(false)}
            apps={apps}
            onLaunch={launchApp}
            onLock={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}
            onEmptyTrash={async () => {
              if (fsTrashedCount === 0) { notify({ title: 'Recycle Bin is already empty', tone: 'info' }); return; }
              if (!window.confirm(`Permanently delete ${fsTrashedCount} item${fsTrashedCount === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
              try {
                const { purgeTrash } = await import('../../../lib/fileSystem');
                setFsTree(await purgeTrash(fsTree));
              } catch (err) { notify({ title: 'Could not empty Recycle Bin', body: err.message, tone: 'error' }); }
            }}
            onOpenSettings={() => launchApp('settings')}
            onOpenNotifications={() => { setNotifCenterOpen(true); }}
            onShowDesktop={() => windows.forEach(item => updateWindow(item.id, { minimized: true }))}
            onTaskView={() => setTaskViewOpen(true)}
          />
        </Suspense>
      )}

      {/* Desktop notifications */}
      <div className="nx-toast-container" data-position={settings.notifications?.position || 'bottom-right'}>
        {toasts.map(toast => (
          <div key={toast.id} className="nx-popup nx-toast">
            <div className="nx-toast-title" style={{ marginBottom: toast.body ? 4 : 0 }}>{toast.title}</div>
            {toast.body && <div className="nx-toast-body">{toast.body}</div>}
          </div>
        ))}
      </div>

      {/* Taskbar */}
      <div className="nx-taskbar" data-pos={taskbarPrefs.position} data-mode={taskbarPrefs.buttons} onClick={event => event.stopPropagation()} onContextMenu={taskbarContextMenu}>
        <div className="nx-taskbar-group">
          {/* Start button with system stats indicator */}
          <StartButton
            open={startMenuOpen}
            onClick={() => { setStartMenuOpen(value => !value); setPowerMenuOpen(false); }}
          />

          {/* Task view — bird's-eye of all open windows */}
          <button
            className={`nx-pinned-btn ${taskViewOpen ? 'open' : ''}`}
            title="Task view — see all open windows"
            style={{ opacity: windows.length ? 1 : 0.5 }}
            onClick={() => setTaskViewOpen(value => !value)}
          >
            <Icon name="LayoutGrid" size={18} />
          </button>

          {pinnedApps.length > 0 && windows.length > 0 && <div className="nx-taskbar-sep" />}

          {/* Pinned apps */}
          {pinnedApps.map(app => {
            return (
              <button key={app.id} className="nx-pinned-btn" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onContextMenu={event => pinnedAppContextMenu(event, app)} title={`${app.name} (Shift+Click opens a new window, right-click for options)`}>
                {taskbarPrefs.buttons !== 'labels' && <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={16} />}
                {taskbarPrefs.buttons !== 'icons' && <span className="nx-task-label">{app.name}</span>}
              </button>
            );
          })}

          {/* Open windows */}
          {windows.map(item => {
            const isTop = !item.minimized && item.zIndex === maxZ;
            return (
              <button
                key={item.id}
                className={`nx-task-window ${item.minimized ? 'minimized' : ''}`}
                data-accent={isTop ? '' : undefined}
                style={isTop ? { '--task-accent': settings.theme.accent } : undefined}
                onClick={() => {
                  if (item.minimized) updateWindow(item.id, { minimized: false });
                  else if (!isTop) focusWindow(item.id);
                  else updateWindow(item.id, { minimized: true });
                }}
                onContextMenu={event => windowButtonContextMenu(event, item)}
              >
                {taskbarPrefs.buttons !== 'labels' && item.icon}
                {taskbarPrefs.buttons !== 'icons' && <span>{item.title}</span>}
              </button>
            );
          })}
        </div>

        <div className="nx-taskbar-right">
          {/* Weather widget (Windows-style, right of the tray) */}
          <button
            className="nx-weather"
            title="Local weather"
            onClick={event => { event.stopPropagation(); setWeatherOpen(value => !value); }}
          >
            {weather?.data ? (
              <>
                <PngIcon name={weatherPng(weather.data.current?.weather_code, weather.data.current?.is_day)} size={20} />
                <span className="nx-weather-text">
                  <span>{Math.round(weather.data.current.temperature_2m)}{unitSymbol(weather.unit)}</span>
                  <span className="nx-weather-cond">{weatherDescription(weather.data.current?.weather_code)}</span>
                </span>
              </>
            ) : (
              <span className="nx-weather-text">
                <PngIcon name="weather-fog" size={20} />
                <span className="nx-weather-cond">Enable weather</span>
              </span>
            )}
          </button>

          {/* Compact system tray — wifi + battery/leaf, overflow chevron for hidden items */}
          <div className="nx-tray">
            <button className="nx-tray-item" title={networkTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); setHiddenIconsOpen(false); }}>
              <PngIcon name={online ? 'wifi-on' : 'wifi-off'} size={16} />
            </button>

            {/* Battery or leaf (battery saver) — opens Quick Settings */}
            <button className="nx-tray-item" title={batteryTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); setHiddenIconsOpen(false); }}>
              {settings.power?.batterySaver ? (
                <Icon name="Leaf" size={15} strokeWidth={2} />
              ) : (
                <BatteryIcon level={battery?.level ?? 100} charging={battery?.charging} />
              )}
            </button>

            {/* Overflow chevron — opens Hidden Icons panel */}
            <button
              className={`nx-tray-item nx-tray-overflow ${hiddenIconsOpen ? 'open' : ''}`}
              title={`${hiddenTrayItems.length > 0 ? `${hiddenTrayItems.length} hidden` : 'Hidden icons'}`}
              onClick={event => { event.stopPropagation(); setHiddenIconsOpen(v => !v); setQuickSettingsOpen(false); setNotifCenterOpen(false); }}
              style={{ position: 'relative' }}
            >
              <Icon name="ChevronUp" size={14} strokeWidth={2.5} />
              {hiddenTrayItems.length > 0 && (
                <span aria-label={`${hiddenTrayItems.length} hidden`} className="nx-tray-badge">
                  {hiddenTrayItems.length > 9 ? '9+' : hiddenTrayItems.length}
                </span>
              )}
            </button>
          </div>

          {/* Clock */}
          <TaskbarClock
            suppressTooltip={calendarOpen}
            onClick={event => { event.stopPropagation(); setCalendarOpen(value => !value); }}
          />
        </div>
      </div>

      {/* Taskbar settings panel */}
      {taskbarSettingsOpen && (
        <div className="nx-popup nx-taskbar-settings" onClick={event => event.stopPropagation()}>
          <div className="nx-settings-header">
            <div className="nx-settings-title">
              <Icon name="SlidersHorizontal" size={14} /> Taskbar settings
            </div>
            <button className="nx-footer-icon" style={{ width: 24, height: 24 }} onClick={() => setTaskbarSettingsOpen(false)} title="Close">×</button>
          </div>
          <div className="nx-settings-label">Pinned apps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {apps.filter(app => app.id !== 'settings').map(app => {
              const pinned = pinnedTaskbar.includes(app.id);
              return (
                <button key={app.id} className="nx-menu-item" style={{ padding: '7px 10px', borderRadius: 6 }} onClick={() => togglePin(app.id)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={15} />
                    <span style={{ fontSize: 12 }}>{app.name}</span>
                  </span>
                  <span style={{ color: pinned ? '#22d3ee' : 'rgba(255,255,255,0.25)', fontSize: 12 }}>{pinned ? '✓' : '—'}</span>
                </button>
              );
            })}
          </div>
          <div className="nx-menu-sep" style={{ margin: '10px 0' }} />
          <button
            className="nx-menu-item"
            style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}
            onClick={() => setPinnedTaskbar(['games', 'media-player', 'browser', 'calculator'])}
          >
            Restore default pins
          </button>
          <div className="nx-menu-sep" style={{ margin: '10px 0' }} />
          {[
            { key: 'buttons', label: 'Taskbar buttons', options: [['icons', 'Icons'], ['both', 'Icons + name'], ['labels', 'Name']] },
            { key: 'position', label: 'Taskbar position', options: [['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']] },
            { key: 'startAlign', label: 'Start menu opens', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
          ].map(group => (
            <div key={group.key} className="nx-settings-group">
              <div className="nx-settings-group-label">{group.label}</div>
              <div className="nx-settings-options">
                {group.options.map(([value, label]) => (
                  <button
                    key={value}
                    className="nx-menu-item"
                    style={{ flex: 1, justifyContent: 'center', padding: '6px 4px', borderRadius: 6, fontSize: 11, background: taskbarPrefs[group.key] === value ? 'rgba(255,255,255,0.14)' : 'transparent' }}
                    onClick={() => setTaskbarPrefs(prev => ({ ...prev, [group.key]: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weather flyout */}
      {weatherOpen && (
        <Suspense fallback={null}>
          <WeatherFlyout
            weather={weather}
            locationInfo={locationInfo}
            aiOutlook={aiOutlook}
            newsItems={newsItems}
            refreshWeather={refreshWeather}
            setWeatherOpen={setWeatherOpen}
            getApp={getApp}
            openWindow={openWindow}
            launchApp={launchApp}
            openDynMenu={openDynMenu}
          />
        </Suspense>
      )}

      {/* Slide-up performance popup */}
      {perfOpen && (
        <PerfPopup
          onClose={() => setPerfOpen(false)}
          onOpenTaskManager={() => { setPerfOpen(false); launchApp('task-manager'); }}
        />
      )}

      {/* Volume popup */}
      {volumePopupOpen && (
        <div className="nx-popup nx-volume-popup" onClick={event => event.stopPropagation()} onContextMenu={event => openDynMenu(event, [
          { id: 'mute', label: soundLevel === 0 ? 'Unmute' : 'Mute', icon: soundLevel === 0 ? 'Volume2' : 'VolumeX', action: () => setSoundLevel(soundLevel === 0 ? 50 : 0) },
          { id: 'settings', label: 'Open Settings', icon: 'Settings', action: () => { setVolumePopupOpen(false); launchApp('settings'); } },
        ])}>
          <div className="nx-volume-header">
            <Icon name={volumeIconName} size={18} color={volumeColor} />
            <span className="nx-volume-label">{soundLevel === 0 ? 'Muted' : `Volume ${soundLevel}%`}</span>
            <button className="nx-footer-icon" onClick={() => { if (soundLevel === 0) { setSoundLevel(prevVolumeRef.current || 50); } else { prevVolumeRef.current = soundLevel; setSoundLevel(0); } }} title={soundLevel === 0 ? 'Unmute' : 'Mute'} style={{ width: 24, height: 24 }}>
              <Icon name={soundLevel === 0 ? 'Volume2' : 'VolumeX'} size={14} />
            </button>
          </div>
          <input type="range" min="0" max="150" value={soundLevel} onChange={event => { const v = Number(event.target.value); setSoundLevel(v); if (v > 0) prevVolumeRef.current = v; }} className="nx-volume-slider" />
          <div className="nx-volume-range">
            <span>0%</span><span>150%</span>
          </div>
        </div>
      )}

      {/* Calendar popup */}
      {calendarOpen && <CalendarPopup />}

      {/* Notification center */}
      {notifCenterOpen && (
        <Suspense fallback={null}>
          <NotificationCenter onCtxMenu={openDynMenu} />
        </Suspense>
      )}

      {/* Quick settings panel */}
      {quickSettingsOpen && (
        <>
          <div className="nx-qs-backdrop" onClick={closePopups} />
          <Suspense fallback={null}>
            <QuickActionsPanel
              settings={settings}
              update={(path, value) => updateSetting(path, value)}
              soundLevel={soundLevel}
              setSoundLevel={setSoundLevel}
              prevVolumeRef={prevVolumeRef}
              online={online}
              netSpeed={netSpeed}
              battery={battery}
              onClose={() => setQuickSettingsOpen(false)}
              onOpenSettings={() => launchApp('settings')}
              windows={windows}
            />
          </Suspense>
        </>
      )}

      {/* Hidden icons panel */}
      {hiddenIconsOpen && (
        <>
          <div className="nx-qs-backdrop" onClick={closePopups} />
          <Suspense fallback={null}>
            <HiddenIconsPanel
              settings={settings}
              update={(path, value) => updateSetting(path, value)}
              soundLevel={soundLevel}
              setSoundLevel={setSoundLevel}
              prevVolumeRef={prevVolumeRef}
              online={online}
              netSpeed={netSpeed}
              battery={battery}
              notifCenterOpen={notifCenterOpen}
              setNotifCenterOpen={setNotifCenterOpen}
              notifUnread={notifUnread}
              hiddenTrayItems={hiddenTrayItems}
              removeFromHiddenTray={removeFromHiddenTray}
              onClose={() => setHiddenIconsOpen(false)}
              onOpenSettings={() => launchApp('settings')}
              launchApp={launchApp}
            />
          </Suspense>
        </>
      )}

      {/* Start menu */}
      {startMenuOpen && (
        <>
          <div className="nx-start-backdrop" onClick={closePopups} />
          <div className={`nx-start-menu ${taskbarPrefs.position === 'bottom' ? `align-${taskbarPrefs.startAlign}` : ''}`} data-category={appCategory} onClick={event => event.stopPropagation()}>
            {/* Search */}
            <div style={{ padding: '28px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="nx-start-search-wrap">
                <Icon name="Search" size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                <input
                  className="nx-start-search"
                  type="text"
                  placeholder="Search apps or web…"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      if (filteredApps.length > 0) {
                        launchApp(filteredApps[0]);
                      } else if (query) {
                        // No app matches \u2014 search the web instead
                        const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
                        const target = getApp('browser');
                        if (target) {
                          openWindow({ id: target.id, title: target.name, icon: <AppIcon icon={target.icon} iconFile={target.iconFile} color={target.color} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} /> , replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                          setStartMenuOpen(false);
                          setSearchQuery('');
                        }
                      }
                    }
                  }}
                  autoFocus
                />
              </div>

              {/* Pinned apps grid */}
              {!query && !allAppsView && (
                <div className="nx-pinned-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div className="nx-start-heading" style={{ margin: 0 }}>Pinned</div>
                    <button className="nx-start-all-apps-btn" onClick={() => setAllAppsView(true)}>
                      All apps <Icon name="ChevronRight" size={12} />
                    </button>
                  </div>
                  <div className="nx-pinned-grid">
                    {pinnedAppsOrdered.slice(0, 12).map((app, i) => (
                      <button
                        key={app.id}
                        className={`nx-pinned-tile${dragPinned === app.id ? ' dragging' : ''}${NEW_APP_IDS.has(app.id) ? ' is-new' : ''}`}
                        style={{ animationDelay: `${i * 30}ms` }}
                        onClick={event => launchApp(app, { newWindow: event.shiftKey })}
                        onMouseEnter={() => setHoveredApp(app)}
                        onMouseLeave={() => setHoveredApp(null)}
                        draggable
                        onDragStart={() => setDragPinned(app.id)}
                        onDragOver={event => event.preventDefault()}
                        onDrop={() => {
                          if (dragPinned && dragPinned !== app.id) {
                            const order = pinnedAppsOrdered.map(a => a.id);
                            const from = order.indexOf(dragPinned);
                            const to = order.indexOf(app.id);
                            order.splice(from, 1);
                            order.splice(to, 0, dragPinned);
                            setPinnedOrder(order);
                          }
                          setDragPinned(null);
                        }}
                        onDragEnd={() => setDragPinned(null)}
                        onContextMenu={event => {
                          event.stopPropagation();
                          event.preventDefault();
                          openDynMenu(event, [
                            { id: 'unpin', label: 'Unpin from Start', icon: 'Pin', action: () => togglePin(app.id) },
                          ]);
                        }}
                      >
                        {getAppBadge(app.id) != null && <span className="nx-app-badge">{getAppBadge(app.id)}</span>}
                        {NEW_APP_IDS.has(app.id) && <span className="nx-new-dot" />}
                        <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={24} />
                        <span className="nx-pinned-tile-label">{app.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search results */}
              {query && (
                <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="nx-start-heading" style={{ marginTop: 6 }}>Results</div>
                  {filteredApps.map(app => (
                    <button key={app.id} className="nx-app-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)} onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openDynMenu(event, [
                      { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
                      { id: 'new-window', label: 'Open in new window', icon: 'ExternalLink', action: () => launchApp(app, { newWindow: true }) },
                      { id: 'sep', type: 'separator' },
                      { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                    ]); }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                        <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={18} />
                      </span>
                      <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                    </button>
                  ))}
                  {filteredApps.length === 0 && noteResults.length === 0 && fileResults.length === 0 && (
                    <>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>No app results for &ldquo;{searchQuery}&rdquo;</div>
                      <button className="nx-app-row" style={{ marginTop: 8 }} onClick={() => {
                        const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
                        const target = getApp('browser');
                        if (target) {
                          openWindow({ id: target.id, title: target.name, icon: <AppIcon icon={target.icon} iconFile={target.iconFile} color={target.color} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                          setStartMenuOpen(false);
                          setSearchQuery('');
                        }
                      }}>
                        <PngIcon name="browser" size={16} />
                        <span style={{ flex: 1, fontWeight: 400 }}>Search the web</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Enter \u21B5</span>
                      </button>
                    </>
                  )}
                  {noteResults.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 6 }}>Notes</div>
                      {noteResults.map(entry => (
                        <button key={entry.id} className="nx-app-row" onClick={() => openNoteResult(entry.id)}>
                          <Icon name="FileText" size={16} color="#a78bfa" />
                          <span style={{ flex: 1, fontWeight: 400 }}>{entry.name.replace(/\.(md|txt)$/i, '')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {fileResults.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 6 }}>Files</div>
                      {fileResults.map(entry => (
                        <button key={entry.id} className="nx-app-row" onClick={() => openFileResult(entry.id)}>
                          <Icon name="Image" size={16} color="#f472b6" />
                          <span style={{ flex: 1, fontWeight: 400 }}>{entry.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommended section */}
              {!query && (
                <div className="nx-start-recommended">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', marginBottom: 10 }}>
                    <div className="nx-start-heading" style={{ margin: 0 }}>Recommended</div>
                  </div>
                  <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {recentApps.map(getApp).filter(Boolean).slice(0, 6).map(app => (
                      <button key={app.id} className="nx-start-recommended-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                        <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={20} />
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{app.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.desc}</div>
                        </div>
                      </button>
                    ))}
                    {recentApps.length === 0 && <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.35)', fontSize: 12, padding: '8px 0' }}>Launch an app and it will show up here.</div>}
                  </div>
                </div>
              )}

              {/* What's new */}
              {!query && (
                <div style={{ padding: '12px 24px 0' }}>
                  <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10 }}>What&apos;s new</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[{ id: 'code-studio', note: 'Code Studio now supports multi-file projects' }, { id: 'notepad', note: 'Notes got Obsidian-style wiki links' }, { id: 'games', note: 'Hydrux has 4 new HTML games' }].map(item => {
                      const app = getApp(item.id);
                      if (!app) return null;
                      return (
                        <button key={item.id} className="nx-app-row small" onClick={() => launchApp(app)} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                          <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={14} />
                          <span style={{ flex: 1, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>{item.note}</span>
                          <span className="nx-new-dot" style={{ position: 'static', width: 6, height: 6 }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All apps overlay */}
              {allAppsView && (
                <div className="nx-all-apps-overlay">
                  <div className="nx-all-apps-overlay-header">
                    <button className="nx-all-apps-overlay-back" onClick={() => setAllAppsView(false)}>
                      <Icon name="ChevronLeft" size={14} />
                    </button>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>All apps</span>
                  </div>
                  <div className="nx-all-apps-overlay-body">
                    <div className="nx-all-apps-grid">
                      {startApps.map((app, i) => (
                        <button
                          key={app.id}
                          className={`nx-app-grid-tile${gridFocus === i ? ' focused' : ''}${NEW_APP_IDS.has(app.id) ? ' is-new' : ''}`}
                          style={{ animationDelay: `${i * 25}ms` }}
                          onClick={event => launchApp(app, { newWindow: event.shiftKey })}
                          onMouseEnter={() => setHoveredApp(app)}
                          onMouseLeave={() => setHoveredApp(null)}
                          onContextMenu={event => {
                            event.stopPropagation();
                            event.preventDefault();
                            openDynMenu(event, [
                              { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                            ]);
                          }}
                        >
                          {getAppBadge(app.id) != null && <span className="nx-app-badge">{getAppBadge(app.id)}</span>}
                          {NEW_APP_IDS.has(app.id) && <span className="nx-new-dot" />}
                          <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={24} />
                          <span className="nx-app-grid-name">{app.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer: profile, settings, power */}
              <div className="nx-start-footer">
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <button className="nx-profile-btn" style={{ flex: 1 }} onClick={() => setProfileDropdownOpen(v => !v)} title="Switch profile">
                    {avatar ? (
                      <img src={avatar} alt="" className="nx-profile-avatar" style={{ objectFit: 'cover', background: 'transparent', fontSize: 0 }} />
                    ) : (
                      <span className="nx-profile-avatar">{settings.profile.username.charAt(0).toUpperCase() || 'U'}</span>
                    )}
                    <span style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{settings.profile.username}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{settings.profiles?.list?.length > 1 ? `${settings.profiles.list.length} profiles` : 'Local user'}</span>
                    </span>
                    <Icon name="ChevronUp" size={12} style={{ marginLeft: 'auto', opacity: 0.4 }} />
                  </button>

                  {/* Profile dropdown */}
                  {profileDropdownOpen && (
                    <div className="nx-popup" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, minWidth: 'unset', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                      {(settings.profiles?.list || []).map(profile => (
                        <button key={profile.id} className="nx-menu-item" style={{ padding: '6px 10px', gap: 8 }} onClick={() => {
                          if (profile.id !== settings.profiles.activeId) {
                            updateSetting('profiles.activeId', profile.id);
                            localStorageStorage.set('profile-avatar', profile.avatar || null);
                            window.dispatchEvent(new CustomEvent('lithium:profile-changed', { detail: { profileId: profile.id } }));
                          }
                          setProfileDropdownOpen(false);
                        }}>
                          <span style={{ width: 24, height: 24, borderRadius: '50%', background: profile.avatar ? `url(${profile.avatar}) center/cover` : `linear-gradient(135deg, ${settings.theme?.accent || '#22d3ee'} 0%, #6366f1 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: profile.avatar ? 'transparent' : '#000', flexShrink: 0 }}>
                            {profile.avatar || profile.name.charAt(0).toUpperCase()}
                          </span>
                          <span style={{ flex: 1, fontSize: 12 }}>{profile.name}</span>
                          {profile.id === settings.profiles.activeId ? (
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontWeight: 600 }}>Active</span>
                          ) : (
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Switch</span>
                          )}
                        </button>
                      ))}
                      <button className="nx-menu-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }} onClick={() => { setProfileDropdownOpen(false); launchApp('settings'); }}>
                        <span className="flex items-center gap-2"><PngIcon name="settings" size={12} /> Manage profiles</span>
                      </button>
                    </div>
                  )}
                </div>
                <button className="nx-footer-icon" onClick={() => launchApp('settings')} title="Settings">
                  <PngIcon name="settings" size={18} />
                </button>
                <button className="nx-footer-icon danger" onClick={event => { event.stopPropagation(); setPowerMenuOpen(value => !value); }} title="Power menu">
                  <Icon name="Power" size={18} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Power menu */}
      {powerMenuOpen && (
        <div className="nx-popup" style={{ bottom: 72, right: 20, minWidth: 200, overflow: 'hidden' }} onClick={event => event.stopPropagation()}>
          <button className="nx-menu-item" onClick={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}>
            <span className="flex items-center gap-2"><Icon name="Lock" size={14} /> Lock</span>
          </button>
          <button className="nx-menu-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={() => handlePower('logout')}>
            <span className="flex items-center gap-2"><Icon name="LogOut" size={14} /> Log out</span>
          </button>
          <button className="nx-menu-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={() => handlePower('shutdown')}>
            <span className="flex items-center gap-2"><Icon name="Power" size={14} /> Shutdown</span>
          </button>
          <button className="nx-menu-item" onClick={() => handlePower('restart')}>
            <span className="flex items-center gap-2"><Icon name="Activity" size={14} /> Restart</span>
          </button>
        </div>
      )}

      {/* Context menus (desktop, taskbar, windows, pinned apps) */}
      {dynMenu && <ContextMenu menu={dynMenu} onClose={closeDynMenu} />}
    </div>
  );
}
