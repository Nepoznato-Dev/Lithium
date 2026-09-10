import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { AppIcon } from '../DesktopApps';
import { useDesktopWindows } from '../DesktopWindowManager';
import { useContextMenu } from '../ContextMenu';
import { storage } from '../../../lib/storage';
import { notify, subscribeToNotifications, subscribeToHistory } from '../../../lib/desktop/notify';
import { emitEvent, registerHandler } from '../../../lib/ai/apiManager';
import { registerBuiltinHandlers } from '../../../lib/ai/apiBuiltins';
import { startEnabledWidgets } from '../../../lib/desktop/widgetRuntime';
import { syncDownloads, watchDownloads } from '../../../lib/downloads';
import { useFileSystem, trashedItems } from '../../../lib/fileSystem';
import { useSettings } from '../../SettingsContext';
import { WALLPAPERS, useDebouncedSave, inVault } from './wallpapers';
import { weatherEmoji, unitSymbol, weatherDescription } from '../../../lib/deviceContext';
import useDeviceDetection from './useDeviceDetection';
import useWeather from './useWeather';
import useKeyboardShortcuts from './useKeyboardShortcuts';
import useContextMenus from './useContextMenus';
import { discoverAppsFromLauncher } from '../../../lib/li-apps/liLauncher';
import { getInstalledApps, registerApp } from '../../../lib/li-apps/liRegistry';

/* Lazy app components — imported here so the apps array can live inside the hook. */
const FileManagerApp = React.lazy(() => import('../Apps/FileManagerApp'));
const PhotosApp = React.lazy(() => import('../Apps/PhotosApp'));
const CalendarClockApp = React.lazy(() => import('../Apps/CalendarClockApp'));
const NotesApp = React.lazy(() => import('../Apps/NotesApp'));
const ModelHubApp = React.lazy(() => import('../Apps/ModelHubApp'));
const ApiManagerApp = React.lazy(() => import('../Apps/ApiManagerApp'));
const DownloaderApp = React.lazy(() => import('../Apps/DownloaderApp'));
const CodeStudioApp = React.lazy(() => import('../Apps/CodeStudioApp'));
const TaskManagerApp = React.lazy(() => import('../Apps/TaskManagerApp'));
const MusicPage = React.lazy(() => import('../../../pages/Music'));
const Browser = React.lazy(() => import('../../../pages/Browser'));
const CalculatorPage = React.lazy(() => import('../../../pages/Calculator'));
const SettingsPage = React.lazy(() => import('../../../pages/Settings'));
const OnboardingApp = React.lazy(() => import('../Apps/OnboardingApp'));
const LiAppHost = React.lazy(() => import('../Apps/LiAppHost'));
const AppStudioApp = React.lazy(() => import('../Apps/AppStudioApp'));

// StrictMode double-mount guard for the one-shot 'boot' widget event.
let bootEmitted = false;

/** Master state hook for the Desktop shell.  Returns every piece of state,
 *  derived value, and handler the JSX renderer needs. */
export default function useDesktopState() {
  const { windows, openWindow, updateWindow, focusWindow, closeWindow, closeApp, focusApp } = useDesktopWindows();
  const { settings, updateSetting } = useSettings();

  /* --- .li app discovery (via launcher.li + dynamic apps) --- */
  const [liApps, setLiApps] = useState([]);

  const refreshLiApps = useCallback(async () => {
    try {
      const discovered = await discoverAppsFromLauncher();
      setLiApps(discovered);
    } catch {
      // Non-fatal.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const installed = getInstalledApps();
        const discovered = await discoverAppsFromLauncher();
        for (const app of discovered) {
          if (!installed.some(a => a.id === app.id)) registerApp(app);
        }
        if (!cancelled) setLiApps(discovered.length ? discovered : installed);
      } catch {
        // Launcher failure is non-fatal — built-in apps still work.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-discover when dynamic apps change (created/updated/deleted).
  useEffect(() => {
    const onChange = () => refreshLiApps();
    window.addEventListener('lithium:li-dynamic-apps-changed', onChange);
    return () => window.removeEventListener('lithium:li-dynamic-apps-changed', onChange);
  }, [refreshLiApps]);

  /* --- App registry (built-in + .li) --- */
  const builtinApps = useMemo(() => [
    { id: 'media-player', name: 'Media Player', icon: 'Music', iconFile: 'media-player', color: '#22d3ee', width: 1150, height: 720, component: <MusicPage />, desc: 'Music, radio & media player', category: 'media' },
    { id: 'browser', name: 'Browser', icon: 'Globe', iconFile: 'browser', color: '#06b6d4', width: 1000, height: 700, component: <Browser />, desc: 'Browse the web', category: 'tools' },
    { id: 'calculator', name: 'Calculator', icon: 'Calculator', iconFile: 'calculator', color: '#3b82f6', width: 420, height: 640, component: <CalculatorPage />, desc: 'Quick calculations', category: 'tools' },
    { id: 'clock', name: 'Clock', icon: 'Clock', iconFile: 'clock', color: '#22c55e', width: 560, height: 620, component: <CalendarClockApp />, desc: 'Clock, calendar & pomodoro', category: 'productivity' },
    { id: 'files', name: 'File Explorer', icon: 'Folder', iconFile: 'files', color: '#f59e0b', width: 880, height: 560, component: <FileManagerApp />, desc: 'Browse and manage files', category: 'productivity' },
    { id: 'photos', name: 'Gallery', icon: 'Image', iconFile: 'gallery', color: '#f472b6', width: 860, height: 600, component: <PhotosApp />, desc: 'View photos and images', category: 'media' },
    { id: 'notepad', name: 'Notes', icon: 'FileText', iconFile: 'notes', color: '#8b5cf6', width: 900, height: 600, component: <NotesApp />, desc: 'Markdown note-taking', category: 'productivity' },
    { id: 'downloader', name: 'Downloader', icon: 'ArrowDownToLine', iconFile: 'downloader', color: '#38bdf8', width: 880, height: 640, component: <DownloaderApp />, desc: 'Download files and models', category: 'tools' },
    { id: 'code-studio', name: 'Code Studio', icon: 'Code', iconFile: 'code-studio', color: '#4ade80', width: 1150, height: 720, component: <CodeStudioApp />, desc: 'Write and run code', category: 'productivity' },
    { id: 'app-studio', name: 'App Studio', icon: 'Blocks', color: '#a78bfa', width: 1050, height: 680, component: <AppStudioApp />, desc: 'Create and edit .li apps', category: 'productivity' },
    { id: 'ai-hub', name: 'Cortex', icon: 'BrainCircuit', iconFile: 'cortex', color: '#06b6d4', width: 980, height: 700, component: <ModelHubApp />, desc: 'AI models and chat', category: 'tools' },
    { id: 'api-manager', name: 'API Manager', icon: 'Plug2', iconFile: 'api-manager', color: '#f59e0b', width: 960, height: 660, component: <ApiManagerApp />, desc: 'Manage API connections', category: 'tools' },

    { id: 'onboarding', name: 'Setup Wizard', icon: 'Sparkles', color: '#22d3ee', width: 640, height: 520, component: <OnboardingApp />, desc: 'First-run setup wizard', category: 'system', desktopIcon: false, showInStart: false },
    { id: 'task-manager', name: 'Task Manager', icon: 'Activity', iconFile: 'task-manager', color: '#f59e0b', width: 640, height: 520, component: <TaskManagerApp />, desc: 'Monitor running processes', category: 'system', desktopIcon: false },
    { id: 'settings', name: 'Settings', icon: 'Settings', iconFile: 'settings', color: '#64748b', width: 900, height: 700, component: <SettingsPage />, desc: 'System preferences', category: 'system', showInStart: false, desktopIcon: false },
  ], []);

  const apps = useMemo(() => {
    const liEntries = liApps.map(m => {
      const caps = m._capabilities || {};
      return {
        id: `li-${m.id}`,
        name: m.name,
        icon: m.icon,
        color: m.color,
        width: m.width,
        height: m.height,
        desc: m.description,
        category: m.category,
        component: <LiAppHost manifest={m} />,
        isLiApp: true,
        // Capability flags from launcher.li — the core reads these
        // to decide visibility without knowing the app's internals.
        showInStart: caps.showInStart !== false,
        desktopIcon: caps.desktopIcon !== false,
      };
    });
    return [...builtinApps, ...liEntries];
  }, [builtinApps, liApps]);

  const getApp = useCallback(id => apps.find(app => app.id === id), [apps]);

  /* --- Sub-hooks (self-contained slices) --- */
  const { online, netSpeed, battery, batteryTooltip, networkTooltip } = useDeviceDetection();
  const { weather, weatherOpen, setWeatherOpen, aiOutlook, locationInfo, newsItems, refreshWeather } = useWeather();

  /* --- Popup / UI state --- */
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [powerMenuOpen, setPowerMenuOpen] = useState(false);
  const [volumePopupOpen, setVolumePopupOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const prevVolumeRef = useRef(50);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dynMenu, openDynMenu, closeDynMenu] = useContextMenu();
  const [taskbarSettingsOpen, setTaskbarSettingsOpen] = useState(false);
  const [taskbarPrefs, setTaskbarPrefs] = useState(() => storage.get('taskbar-prefs', { buttons: 'both', position: 'bottom', startAlign: 'center' }));
  useEffect(() => storage.set('taskbar-prefs', taskbarPrefs), [taskbarPrefs]);
  const [perfOpen, setPerfOpen] = useState(false);
  const [fsTree, setFsTree] = useFileSystem();
  const fsTrashedCount = trashedItems(fsTree).length;
  const [shutdown, setShutdown] = useState(false);
  const [recentApps, setRecentApps] = useState(() => storage.get('desktop-recent-apps', []));
  const [customGroups, setCustomGroups] = useState(() => storage.get('desktop-custom-groups', []));
  const [pinnedTaskbar, setPinnedTaskbar] = useState(() => storage.get('desktop-pinned-taskbar', []));
  const [soundLevel, setSoundLevel] = useState(() => storage.get('desktop-sound-level', 50));
  const [wallpaper, setWallpaper] = useState(() => storage.get('desktop-wallpaper', 'nexus-default'));
  const [customWallpaper, setCustomWallpaper] = useState(() => storage.get('desktop-wallpaper-custom', null));
  const [avatar, setAvatar] = useState(() => storage.get('profile-avatar', null));
  const [toasts, setToasts] = useState([]);
  const [appGridView, setAppGridView] = useState('grid');
  const [appCategory, setAppCategory] = useState('all');
  const [hoveredApp, setHoveredApp] = useState(null);
  const [pinnedOrder, setPinnedOrder] = useState(() => storage.get('desktop-pinned-order', null));
  const [appFreq, setAppFreq] = useState(() => storage.get('desktop-app-freq', {}));
  const [gridFocus, setGridFocus] = useState(-1);
  const [previewApp, setPreviewApp] = useState(null);
  const [sortMode, setSortMode] = useState(() => storage.get('desktop-app-sort', 'alpha'));
  const [dragPinned, setDragPinned] = useState(null);
  const previewTimer = useRef(null);
  const NEW_APP_IDS = new Set(['code-studio', 'api-manager', 'downloader']);
  const [notifHistory, setNotifHistory] = useState([]);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [taskViewOpen, setTaskViewOpen] = useState(false);

  /* --- closePopups must be defined before sub-hooks that need it --- */
  const closePopups = () => {
    setStartMenuOpen(false);
    setPowerMenuOpen(false);
    setVolumePopupOpen(false);
    setQuickSettingsOpen(false);
    setCalendarOpen(false);
    setTaskbarSettingsOpen(false);
    setPerfOpen(false);
    setWeatherOpen(false);
    setNotifCenterOpen(false);
    setTaskViewOpen(false);
  };

  /* --- Keyboard shortcuts (needs closePopups + state) --- */
  const { altTab, altTabRef } = useKeyboardShortcuts(windows, focusWindow, updateWindow, closePopups);
  const togglePin = appId => {
    setPinnedTaskbar(prev => (prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]));
  };
  const closeAllWindows = () => windows.forEach(item => closeWindow(item.id));

  /* --- Wallpaper / avatar event subscriptions --- */
  useEffect(() => {
    const onWallpaper = () => {
      setWallpaper(storage.get('desktop-wallpaper', 'nexus-default'));
      setCustomWallpaper(storage.get('desktop-wallpaper-custom', null));
    };
    const onAvatar = () => setAvatar(storage.get('profile-avatar', null));
    window.addEventListener('lithium:wallpaper-changed', onWallpaper);
    window.addEventListener('lithium:avatar-changed', onAvatar);
    return () => {
      window.removeEventListener('lithium:wallpaper-changed', onWallpaper);
      window.removeEventListener('lithium:avatar-changed', onAvatar);
    };
  }, []);

  /* --- Notifications --- */
  useEffect(() => subscribeToNotifications(detail => {
    setToasts(prev => [...prev.slice(-3), detail]);
    setTimeout(() => setToasts(prev => prev.filter(toast => toast.id !== detail.id)), 7000);
  }), []);
  useEffect(() => subscribeToHistory(setNotifHistory), []);
  const notifUnread = notifHistory.filter(entry => !entry.read).length;

  /* --- Debounced persistence --- */
  useDebouncedSave('desktop-recent-apps', recentApps);
  useDebouncedSave('desktop-custom-groups', customGroups);
  useDebouncedSave('desktop-pinned-taskbar', pinnedTaskbar);
  useDebouncedSave('desktop-sound-level', soundLevel);
  useDebouncedSave('desktop-wallpaper', wallpaper);
  useDebouncedSave('desktop-pinned-order', pinnedOrder);
  useDebouncedSave('desktop-app-freq', appFreq);
  useDebouncedSave('desktop-app-sort', sortMode);

  /* --- App launching --- */
  const launchApp = useCallback((app, opts = {}) => {
    const target = typeof app === 'string' ? getApp(app) : app;
    if (!target) return;
    if (opts.newWindow !== true && windows.some(win => win.id === target.id || win.tabs.some(t => t.appId === target.id))) {
      focusApp(target.id);
    } else {
      openWindow({
        id: target.id, title: target.name,
        icon: <AppIcon icon={target.icon} iconFile={target.iconFile} color={target.color} size={14} />,
        component: target.component,
        x: 110, y: 70,
        width: target.width || 900, height: target.height || 640,
        newWindow: true,
      });
    }
    setRecentApps(prev => [target.id, ...prev.filter(id => id !== target.id)].slice(0, 4));
    setAppFreq(prev => ({ ...prev, [target.id]: (prev[target.id] || 0) + 1 }));
    setStartMenuOpen(false);
    setSearchQuery('');
    setGridFocus(-1);
    emitEvent('app.opened', { id: target.id, name: target.name });
  }, [getApp, openWindow, focusApp, windows]);

  /* --- Context menus (needs launchApp) --- */
  const { desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu } = useContextMenus({
    apps, windows, fsTree, wallpaper, pinnedTaskbar, launchApp, closeAllWindows, openDynMenu,
    setTaskViewOpen, setTaskbarSettingsOpen, togglePin, setFsTree, setWallpaper, closeWindow, updateWindow,
  });

  /* --- API Manager integration --- */
  const launchRef = useRef(launchApp);
  useEffect(() => { launchRef.current = launchApp; });

  useEffect(() => {
    registerBuiltinHandlers();
    registerHandler('apps.list', () => apps.map(app => ({ id: app.id, name: app.name })));
    registerHandler('apps.open', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}'`);
      launchRef.current(id);
    });
    registerHandler('apps.close', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}'`);
      closeApp(id);
    });
    registerHandler('apps.focus', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}'`);
      focusApp(id);
    });
    const onCommand = event => {
      const { cmd, level } = event.detail || {};
      if (cmd === 'open_start_menu') setStartMenuOpen(true);
      if (cmd === 'close_start_menu') setStartMenuOpen(false);
      if (cmd === 'show_desktop') windows.forEach(item => updateWindow(item.id, { minimized: true }));
      if (cmd === 'set_volume') setSoundLevel(Math.max(0, Math.min(100, Math.round(level ?? 50))));
    };
    window.addEventListener('lithium:api-command', onCommand);
    // Handle app launch requests from file explorer (file associations)
    const onLaunchApp = event => {
      const { appId, fileEntry } = event.detail || {};
      if (!appId) return;
      launchRef.current(appId);
      // Forward the file entry to the app after a short delay for mount
      if (fileEntry) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('lithium:open-file-entry', { detail: { fileEntry, appId } }));
        }, 150);
      }
    };
    window.addEventListener('lithium:launch-app', onLaunchApp);
    // Handle workspace restore requests
    const onRestoreWorkspace = async event => {
      const { name } = event.detail || {};
      if (!name) return;
      try {
        const { loadWorkspace, getAppsFromLayout } = await import('../../../lib/services/workspaceService');
        const layout = loadWorkspace(name);
        if (!layout) return;
        const appIds = getAppsFromLayout(layout);
        // Open each app from the layout
        for (const appId of appIds) {
          const app = apps.find(a => a.id === appId);
          if (app) launchRef.current(appId);
        }
      } catch {
        // Workspace restore is best-effort and may fail if the saved layout is incomplete.
      }
    };
    window.addEventListener('lithium:restore-workspace', onRestoreWorkspace);
    startEnabledWidgets();
    if (!bootEmitted) { bootEmitted = true; emitEvent('boot'); }
    watchDownloads();
    syncDownloads().catch(() => {});
    return () => {
      window.removeEventListener('lithium:api-command', onCommand);
      window.removeEventListener('lithium:launch-app', onLaunchApp);
      window.removeEventListener('lithium:restore-workspace', onRestoreWorkspace);
    };
  }, [apps, closeWindow, focusWindow, updateWindow, windows]);

  /* --- Desktop signals for widgets --- */
  useEffect(() => { emitEvent(startMenuOpen ? 'startMenu.opened' : 'startMenu.closed'); }, [startMenuOpen]);
  useEffect(() => { emitEvent('volume.changed', { level: soundLevel }); }, [soundLevel]);
  useEffect(() => { if (weather?.data) emitEvent('weather.updated', { fetchedAt: weather.fetchedAt }); }, [weather]);

  /* --- Browser / start deep-link listeners --- */
  useEffect(() => {
    const onOpenBrowser = event => {
      const url = event.detail;
      const target = getApp('browser');
      if (!target) return;
      openWindow({ id: target.id, title: target.name, icon: <AppIcon icon={target.icon} iconFile={target.iconFile} color={target.color} size={16} />, component: <Browser initialUrl={url} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
    };
    window.addEventListener('lithium:open-browser', onOpenBrowser);
    return () => window.removeEventListener('lithium:open-browser', onOpenBrowser);
  }, [getApp, openWindow, updateWindow]);

  useEffect(() => {
    const onOpenStart = () => { closePopups(); setStartMenuOpen(true); };
    window.addEventListener('lithium:open-start', onOpenStart);
    return () => window.removeEventListener('lithium:open-start', onOpenStart);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Derived UI data --- */
  const startApps = apps.filter(app => app.showInStart !== false);
  const query = searchQuery.trim().toLowerCase();
  const sortedStartApps = query
    ? startApps.filter(app => app.name.toLowerCase().includes(query))
    : [...startApps].sort((a, b) => a.name.localeCompare(b.name));
  const noteResults = query ? fsTree.filter(entry => entry.type === 'text' && !entry.name.startsWith('.') && inVault(fsTree, entry) && entry.name.toLowerCase().includes(query)).slice(0, 5) : [];
  const fileResults = query ? fsTree.filter(entry => entry.type !== 'folder' && !(entry.type === 'text' && inVault(fsTree, entry)) && entry.name.toLowerCase().includes(query)).slice(0, 5) : [];
  const openNoteResult = id => {
    setStartMenuOpen(false); setSearchQuery(''); launchApp('notepad');
    setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-note', { detail: id })), 120);
  };
  const openFileResult = id => {
    setStartMenuOpen(false); setSearchQuery(''); launchApp('files');
    setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: id })), 120);
  };
  const pinnedApps = pinnedTaskbar.map(getApp).filter(Boolean);

  const fuzzyMatch = useCallback((q, text) => {
    if (!q) return 1;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    if (lower.includes(ql)) return 2;
    let qi = 0;
    for (let i = 0; i < lower.length && qi < ql.length; i++) { if (lower[i] === ql[qi]) qi++; }
    return qi === ql.length ? 1 : 0;
  }, []);

  const getAppBadge = useCallback(id => {
    if (id === 'downloader') {
      const dl = storage.get('lithium-downloads', []);
      const active = dl.filter(d => d.status === 'downloading').length;
      return active > 0 ? active : null;
    }
    return null;
  }, []);

  const filteredApps = useMemo(() => {
    let result = appCategory === 'all' ? startApps : startApps.filter(app => app.category === appCategory);
    if (query) {
      result = result.map(app => ({ app, score: fuzzyMatch(query, app.name) * 2 + fuzzyMatch(query, app.desc || '') })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.app);
    } else if (sortMode === 'freq') {
      result = [...result].sort((a, b) => (appFreq[b.id] || 0) - (appFreq[a.id] || 0));
    }
    return result;
  }, [startApps, appCategory, query, sortMode, appFreq, fuzzyMatch]);

  const pinnedAppsOrdered = useMemo(() => {
    if (!pinnedOrder) return pinnedApps;
    const ordered = pinnedOrder.map(getApp).filter(Boolean);
    const remaining = pinnedApps.filter(app => !pinnedOrder.includes(app.id));
    return [...ordered, ...remaining];
  }, [pinnedApps, pinnedOrder, getApp]);

  /* --- Start-menu keyboard navigation + preview timer --- */
  useEffect(() => { setGridFocus(-1); }, [query, appCategory]);
  useEffect(() => {
    if (!startMenuOpen || query) return;
    const handler = event => {
      const len = filteredApps.length;
      if (!len) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); setGridFocus(prev => Math.min(prev + 1, len - 1)); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setGridFocus(prev => Math.max(prev - 1, 0)); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setGridFocus(prev => Math.min(prev + 4, len - 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setGridFocus(prev => Math.max(prev - 4, 0)); }
      else if (event.key === 'Enter' && gridFocus >= 0 && gridFocus < len) { event.preventDefault(); launchApp(filteredApps[gridFocus]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [startMenuOpen, query, filteredApps, gridFocus, launchApp]);

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (!hoveredApp) { setPreviewApp(null); return; }
    previewTimer.current = setTimeout(() => setPreviewApp(hoveredApp), 500);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [hoveredApp]);

  /* --- Computed display values --- */
  const visibleWindows = windows.filter(item => !item.minimized);
  const maxZ = visibleWindows.length ? Math.max(...visibleWindows.map(item => item.zIndex)) : 0;
  const volumeIconName = soundLevel === 0 ? 'VolumeX' : soundLevel < 50 ? 'Volume1' : 'Volume2';
  const volumeColor = soundLevel === 0 ? '#ef4444' : soundLevel < 50 ? '#f59e0b' : '#10b981';
  const batteryColor = battery ? (battery.level <= 20 ? '#ef4444' : battery.level <= 50 ? '#f59e0b' : '#10b981') : '#10b981';

  const handlePower = action => {
    setPowerMenuOpen(false);
    setStartMenuOpen(false);
    if (action === 'logout') { closeAllWindows(); window.dispatchEvent(new CustomEvent('lithium:lock-screen')); }
    else if (action === 'restart') window.location.reload();
    else if (action === 'shutdown') setShutdown(true);
  };

  const APP_CATEGORIES = [
    { id: 'all', label: 'All', icon: 'LayoutGrid' },
    { id: 'productivity', label: 'Productivity', icon: 'Briefcase' },
    { id: 'media', label: 'Media', icon: 'Play' },
    { id: 'tools', label: 'Tools', icon: 'Wrench' },
    { id: 'system', label: 'System', icon: 'Cpu' },
  ];

  return {
    // Window management
    windows, openWindow, updateWindow, focusWindow, closeWindow, closeApp, focusApp,
    apps, getApp,
    // Settings
    settings, updateSetting,
    // Sub-hook: device
    online, netSpeed, battery, batteryTooltip, networkTooltip,
    // Sub-hook: weather
    weather, weatherOpen, setWeatherOpen, aiOutlook, locationInfo, newsItems, refreshWeather,
    // Sub-hook: keyboard
    altTab, altTabRef,
    // Sub-hook: context menus
    desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu,
    // Popup state
    startMenuOpen, setStartMenuOpen, searchQuery, setSearchQuery,
    powerMenuOpen, setPowerMenuOpen, volumePopupOpen, setVolumePopupOpen,
    quickSettingsOpen, setQuickSettingsOpen, prevVolumeRef,
    calendarOpen, setCalendarOpen, dynMenu, openDynMenu, closeDynMenu,
    taskbarSettingsOpen, setTaskbarSettingsOpen, taskbarPrefs, setTaskbarPrefs,
    perfOpen, setPerfOpen,
    // File system
    fsTree, setFsTree, fsTrashedCount,
    // Desktop state
    shutdown, setShutdown, recentApps, customGroups, pinnedTaskbar,
    soundLevel, setSoundLevel, wallpaper, customWallpaper, avatar,
    toasts, appGridView, setAppGridView, appCategory, setAppCategory,
    hoveredApp, setHoveredApp, pinnedOrder, setPinnedOrder,
    appFreq, gridFocus, setGridFocus, previewApp, sortMode,
    dragPinned, setDragPinned, NEW_APP_IDS,
    notifHistory, notifCenterOpen, setNotifCenterOpen, notifUnread,
    taskViewOpen, setTaskViewOpen,
    // Handlers
    launchApp, closeAllWindows, handlePower, togglePin, closePopups,
    openNoteResult, openFileResult,
    // Derived
    startApps, query, sortedStartApps, noteResults, fileResults,
    pinnedApps, pinnedAppsOrdered, filteredApps, getAppBadge,
    APP_CATEGORIES, visibleWindows, maxZ,
    volumeIconName, volumeColor, batteryColor,
    // Weather display helpers (re-exported for JSX)
    weatherEmoji, unitSymbol, weatherDescription,
  };
}
