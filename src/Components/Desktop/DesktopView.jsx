import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import { useDesktopWindows } from './DesktopWindowManager';
import DesktopWindow from './DesktopWindow';
import ContextMenu, { useContextMenu } from './ContextMenu';
import CommandPalette from './CommandPalette';
import TaskView from './TaskView';
import { snapBounds } from '../../lib/desktop/ui';
import { AppIcon } from './DesktopApps';

/* Apps are lazy-loaded so the idle desktop only pays for the shell. */
const FileManagerApp = React.lazy(() => import('./Apps/FileManagerApp'));
const PhotosApp = React.lazy(() => import('./Apps/PhotosApp'));
const CalendarClockApp = React.lazy(() => import('./Apps/CalendarClockApp'));
const NotesApp = React.lazy(() => import('./Apps/NotesApp'));
const ModelHubApp = React.lazy(() => import('./Apps/ModelHubApp'));
const ApiManagerApp = React.lazy(() => import('./Apps/ApiManagerApp'));
const DownloaderApp = React.lazy(() => import('./Apps/DownloaderApp'));
const CodeStudioApp = React.lazy(() => import('./Apps/CodeStudioApp'));
const TaskManagerApp = React.lazy(() => import('./Apps/TaskManagerApp'));
const Games = React.lazy(() => import('../../pages/Games'));
const GamePlayer = React.lazy(() => import('../../pages/Games').then(m => ({ default: m.GamePlayer })));
const MusicPage = React.lazy(() => import('../../pages/Music'));
const Browser = React.lazy(() => import('../../pages/Browser'));
const CalculatorPage = React.lazy(() => import('../../pages/Calculator'));
const SettingsPage = React.lazy(() => import('../../pages/Settings'));
import { storage } from '../../lib/storage';
import {
  clearHistory,
  dismissNotification,
  markAllRead,
  markRead,
  notify,
  subscribeToHistory,
  subscribeToNotifications,
} from '../../lib/desktop/notify';
import { emitEvent, registerHandler } from '../../lib/ai/apiManager';
import { registerBuiltinHandlers } from '../../lib/ai/apiBuiltins';
import { startEnabledWidgets } from '../../lib/desktop/widgetRuntime';
import { syncDownloads, watchDownloads } from '../../lib/downloads';
import { useFileSystem, purgeTrash, trashedItems, createEntry, restoreEntry } from '../../lib/fileSystem';
import {
  buildWeatherReport,
  buildMsnWeatherUrl,
  fetchWeather,
  loadLastLocation,
  loadWeatherCache,
  locationPermission,
  preferredUnit,
  requestLocation,
  reverseGeocode,
  saveWeatherCache,
  summaryLine,
  unitSymbol,
  weatherDescription,
  weatherEmoji,
} from '../../lib/deviceContext';
import { AI_PROVIDERS, chatCompletion, loadKeys } from '../../lib/ai/providers';
import { useSettings } from '../SettingsContext';
import { SEARCH_ENGINES } from '../../lib/settings';
import { CalendarPopup, PerfFooterButton, PerfPopup, StartButton, StatusTime, TaskbarClock, useSystemMetrics } from './DesktopTickers';

/* ---------- Wallpapers ---------- */

const WALLPAPERS = {
  'nexus-default': {
    label: 'Lithium Default',
    style: {
      backgroundColor: '#1a1d2e',
      backgroundImage:
        'linear-gradient(0deg, #1a1d2e 24%, transparent 25%, transparent 75%, #1a1d2e 76%, #1a1d2e), linear-gradient(90deg, #1a1d2e 24%, transparent 25%, transparent 75%, #1a1d2e 76%, #1a1d2e)',
      backgroundSize: '40px 40px',
      backgroundPosition: '0 0, 20px 20px',
    },
  },
  'windows-7': {
    label: 'Windows 7',
    style: { background: 'radial-gradient(circle at 18% 20%, rgba(125, 202, 255, 0.55), rgba(12, 71, 145, 0.9) 55%, #031f56 100%)' },
  },
  'windows-8': {
    label: 'Windows 8',
    style: { background: 'linear-gradient(135deg, #1f6ed4 0%, #3b8ff1 35%, #6cb8ff 70%, #82d0ff 100%)' },
  },
  'windows-10': {
    label: 'Windows 10',
    style: { background: 'linear-gradient(120deg, #021f53 0%, #0a4ea6 35%, #0f7fdf 65%, #29a9ff 100%)' },
  },
  'season-halloween': {
    label: 'Halloween',
    style: { background: 'radial-gradient(circle at 20% 15%, rgba(255, 149, 0, 0.35), rgba(45, 20, 8, 0.9) 45%, #13090a 100%)' },
  },
  'season-christmas': {
    label: 'Christmas',
    style: { background: 'linear-gradient(145deg, #09291f 0%, #0f5132 35%, #7d1f1f 68%, #2f0b0b 100%)' },
  },
};

// useSystemMetrics is now re-exported from DesktopTickers for backward compat.
export { useSystemMetrics } from './DesktopTickers';

/* istanbul ignore next */

/** Debounced localStorage write — avoids thrashing storage on rapid state changes. */
function useDebouncedSave(key, value) {
  useEffect(() => {
    const timer = setTimeout(() => storage.set(key, value), 300);
    return () => clearTimeout(timer);
  }, [key, value]);
}

/* ---------- Desktop icons (grid-snapped, draggable, persisted) ---------- */

const ICON_SIZE = 100;
const GRID_SPACING = 10;
const GRID_SIZE = ICON_SIZE + GRID_SPACING;

function DesktopIcons({ apps, onLaunch, onIconContextMenu }) {
  const [positions, setPositions] = useState(() => storage.get('desktop-icon-positions', {}));
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const containerRef = useRef(null);
  const dragInfo = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const defaultPosition = index => ({
    x: 10 + (index % Math.max(1, Math.floor((window.innerWidth - 40) / GRID_SIZE))) * GRID_SIZE,
    y: 10 + Math.floor(index / Math.max(1, Math.floor((window.innerWidth - 40) / GRID_SIZE))) * GRID_SIZE,
  });

  const snap = (x, y) => ({
    x: Math.round((x - 10) / GRID_SIZE) * GRID_SIZE + 10,
    y: Math.round((y - 10) / GRID_SIZE) * GRID_SIZE + 10,
  });

  const onIconMouseDown = (event, app) => {
    if (event.button !== 0) return;
    const position = positions[app.id] || defaultPosition(apps.indexOf(app));
    dragInfo.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    setSelected(app.id);
    setDragging(app.id);
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = event => {
      const { startX, startY, originX, originY } = dragInfo.current;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragInfo.current.moved = true;
      const bounds = containerRef.current?.getBoundingClientRect();
      const maxX = (bounds?.width || window.innerWidth) - ICON_SIZE;
      const maxY = (bounds?.height || window.innerHeight) - ICON_SIZE - 48;
      setPositions(prev => ({
        ...prev,
        [dragging]: {
          x: Math.max(0, Math.min(originX + deltaX, maxX)),
          y: Math.max(0, Math.min(originY + deltaY, maxY)),
        },
      }));
    };
    const stop = () => {
      setPositions(prev => {
        const position = prev[dragging];
        const next = position ? { ...prev, [dragging]: snap(position.x, position.y) } : prev;
        storage.set('desktop-icon-positions', next);
        return next;
      });
      setDragging(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, [dragging]);

  return (
    <div ref={containerRef} className="absolute inset-0 bottom-12" onMouseDown={() => setSelected(null)}>
      {apps.map((app, index) => {
        const position = positions[app.id] || defaultPosition(index);
        return (
          <button
            key={app.id}
            className={`nx-icon ${selected === app.id ? 'selected' : ''} ${dragging === app.id ? 'dragging' : ''}`}
            style={{ left: position.x, top: position.y }}
            onMouseDown={event => { event.stopPropagation(); onIconMouseDown(event, app); }}
            onContextMenu={event => {
              event.stopPropagation();
              onIconContextMenu?.(event, app, () => {
                setPositions(prev => {
                  const next = { ...prev };
                  delete next[app.id];
                  storage.set('desktop-icon-positions', next);
                  return next;
                });
              });
            }}
            onDoubleClick={event => onLaunch(app, { newWindow: event.shiftKey })}
            title={`${app.name} (double-click to open, Shift+double-click for a new window)`}
          >
            <AppIcon icon={app.icon} color={app.color} />
            <span className="nx-icon-label">{app.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Desktop ---------- */

// StrictMode double-mount guard for the one-shot 'boot' widget event.
let bootEmitted = false;

function WeatherStat({ label, value }) {
  return (
    <div className="nx-wx-stat">
      <span className="nx-wx-stat-label">{label}</span>
      <span className="nx-wx-stat-value">{value}</span>
    </div>
  );
}

/** True when an entry lives inside the Notes vault (default-notes subtree). */
function inVault(tree, entry) {
  let current = entry;
  while (current && current.id !== 'root') {
    if (current.id === 'default-notes' || current.parentId === 'default-notes') return true;
    current = tree.find(item => item.id === current.parentId);
  }
  return false;
}

/** Human-friendly relative time, e.g. "just now", "3 min ago", "2 h ago". */
function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 min ago';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(ts).toLocaleDateString();
}

const TONE_COLORS = {
  info: '#22d3ee',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};

/** Notification center popup. Owns its own subscription so the desktop tree
 *  doesn't re-render when the history changes. */
function NotificationCenter({ onCtxMenu }) {
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem('lithium:notifications');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => subscribeToHistory(setHistory), []);
  const unread = history.filter(entry => !entry.read).length;
  return (
    <div className="nx-popup nx-notif-center" onClick={event => event.stopPropagation()}>
      <div className="nx-notif-header">
        <div className="nx-notif-header-left">
          <Icon name="Bell" size={14} />
          Notifications
          {unread > 0 && <span className="nx-notif-badge">{unread}</span>}
        </div>
        <div className="nx-notif-header-actions">
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} disabled={unread === 0} onClick={markAllRead} title="Mark all as read">
            <Icon name="RotateCw" size={12} />
          </button>
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} disabled={history.length === 0} onClick={clearHistory} title="Clear all">
            <Icon name="SquareX" size={12} />
          </button>
        </div>
      </div>
      <div className="nx-notif-list">
        {history.length === 0 ? (
          <div className="nx-notif-empty">You&apos;re all caught up.</div>
        ) : history.map(entry => (
          <div
            key={entry.id}
            className={`nx-notif-item${entry.read ? '' : ' unread'}`}
            onClick={() => { if (!entry.read) markRead(entry.id); }}
            onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
              { id: 'title', type: 'heading', label: entry.title },
              { id: 'read', label: entry.read ? 'Mark as unread' : 'Mark as read', icon: entry.read ? 'EyeOff' : 'Eye', action: () => { if (!entry.read) markRead(entry.id); } },
              { id: 'copy', label: 'Copy notification text', icon: 'Copy', action: () => navigator.clipboard?.writeText(`${entry.title}\n${entry.body || ''}`) },
              { id: 'dismiss', label: 'Dismiss', icon: 'SquareX', action: () => dismissNotification(entry.id) },
              { id: 'dismiss-all', label: 'Dismiss all', icon: 'Trash2', danger: true, action: clearHistory },
            ]); }}
          >
            <span aria-hidden className="nx-notif-dot" style={{ background: entry.read ? 'transparent' : (TONE_COLORS[entry.tone] || TONE_COLORS.info) }} />
            <div className="nx-notif-content">
              <div className="nx-notif-title-row">
                <span className="nx-notif-title" style={{ fontWeight: entry.read ? 400 : 600 }}>{entry.title}</span>
                <span className="nx-notif-time">{relativeTime(entry.ts)}</span>
              </div>
              {entry.body && <div className="nx-notif-body">{entry.body}</div>}
            </div>
            <button
              className="nx-footer-icon"
              style={{ width: 18, height: 18, alignSelf: 'center' }}
              onClick={event => { event.stopPropagation(); dismissNotification(entry.id); }}
              title="Dismiss"
            >
              <Icon name="SquareX" size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Quick Actions panel — Windows 11-style quick settings with toggles & sliders. */
function QuickActionsPanel({ settings, soundLevel, setSoundLevel, prevVolumeRef, online, netSpeed, battery, onClose, onOpenSettings }) {
  const isMuted = soundLevel === 0;

  const toggleMute = () => {
    if (isMuted) {
      setSoundLevel(prevVolumeRef.current || 50);
    } else {
      prevVolumeRef.current = soundLevel;
      setSoundLevel(0);
    }
  };

  return (
    <div className="nx-popup nx-quick-settings" onClick={event => event.stopPropagation()}>
      <div className="nx-qs-header">
        <span className="nx-qs-title">Quick settings</span>
        <button className="nx-footer-icon" onClick={() => { onClose(); onOpenSettings(); }} title="Open Settings">
          <Icon name="Settings" size={14} />
        </button>
      </div>

      <div className="nx-qs-grid">
        {/* Network */}
        <button className={`nx-qs-tile ${online ? 'active' : ''}`}>
          <Icon name={online ? 'Wifi' : 'WifiOff'} size={18} />
          <span className="nx-qs-tile-label">{online ? (netSpeed != null ? `${netSpeed} Mbps` : 'Connected') : 'Offline'}</span>
        </button>

        {/* Volume */}
        <button className={`nx-qs-tile ${!isMuted ? 'active' : ''}`} onClick={toggleMute}>
          <Icon name={isMuted ? 'VolumeX' : soundLevel < 50 ? 'Volume1' : 'Volume2'} size={18} />
          <span className="nx-qs-tile-label">{isMuted ? 'Muted' : `Volume ${soundLevel}%`}</span>
        </button>

        {/* Battery (only on devices with battery) */}
        {battery && (
          <button className={`nx-qs-tile ${battery.level > 20 ? 'active' : 'warning'}`}>
            <Icon name={battery.charging ? 'BatteryCharging' : 'Battery'} size={18} />
            <span className="nx-qs-tile-label">{battery.level}%{battery.charging ? ' \u26A1' : ''}</span>
          </button>
        )}

        {/* Focus mode placeholder */}
        <button className="nx-qs-tile">
          <Icon name="Moon" size={18} />
          <span className="nx-qs-tile-label">Focus</span>
        </button>

        {/* Brightness */}
        <button className="nx-qs-tile" style={{ opacity: 0.7, cursor: 'default' }}>
          <Icon name="Sun" size={18} />
          <span className="nx-qs-tile-label">{settings.display?.brightness ?? 100}%</span>
        </button>

        {/* Transparency toggle */}
        <button className={`nx-qs-tile ${settings.theme.transparency !== false ? 'active' : ''}`}>
          <Icon name="Eye" size={18} />
          <span className="nx-qs-tile-label">Transparency</span>
        </button>
      </div>

      {/* Volume slider */}
      <div className="nx-qs-slider-row">
        <Icon name={isMuted ? 'VolumeX' : 'Volume2'} size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <input
          type="range"
          className="nx-qs-slider"
          min={0}
          max={150}
          value={soundLevel}
          onChange={event => {
            const v = Number(event.target.value);
            setSoundLevel(v);
            if (v > 0) prevVolumeRef.current = v;
          }}
        />
        <span className="nx-qs-slider-val">{soundLevel}%</span>
      </div>

      {/* Brightness slider */}
      <div className="nx-qs-slider-row">
        <Icon name="Sun" size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <input
          type="range"
          className="nx-qs-slider"
          min={40}
          max={100}
          value={settings.display?.brightness ?? 100}
          readOnly
        />
        <span className="nx-qs-slider-val">{settings.display?.brightness ?? 100}%</span>
      </div>
    </div>
  );
}

export default function DesktopView() {
  const { windows, openWindow, updateWindow, focusWindow, closeWindow, closeApp, focusApp } = useDesktopWindows();
  const { settings } = useSettings();

  const apps = useMemo(() => [
    { id: 'games', name: 'Hydrux', icon: 'Gamepad2', color: '#ec4899', width: 1100, height: 750, component: <Games />, desc: 'Game library and launcher', category: 'media' },
    { id: 'media-player', name: 'Media Player', icon: 'Music', color: '#22d3ee', width: 1150, height: 720, component: <MusicPage />, desc: 'Music, radio & media player', category: 'media' },
    { id: 'browser', name: 'Browser', icon: 'Globe', color: '#06b6d4', width: 1000, height: 700, component: <Browser />, desc: 'Browse the web', category: 'tools' },
    { id: 'calculator', name: 'Calculator', icon: 'Calculator', color: '#3b82f6', width: 420, height: 640, component: <CalculatorPage />, desc: 'Quick calculations', category: 'tools' },
    { id: 'clock', name: 'Clock', icon: 'Clock', color: '#22c55e', width: 560, height: 620, component: <CalendarClockApp />, desc: 'Clock, calendar & pomodoro', category: 'productivity' },
    { id: 'files', name: 'File Explorer', icon: 'Folder', color: '#f59e0b', width: 880, height: 560, component: <FileManagerApp />, desc: 'Browse and manage files', category: 'productivity' },
    { id: 'photos', name: 'Gallery', icon: 'Image', color: '#f472b6', width: 860, height: 600, component: <PhotosApp />, desc: 'View photos and images', category: 'media' },
    { id: 'notepad', name: 'Notes', icon: 'FileText', color: '#8b5cf6', width: 900, height: 600, component: <NotesApp />, desc: 'Markdown note-taking', category: 'productivity' },
    { id: 'downloader', name: 'Downloader', icon: 'ArrowDownToLine', color: '#38bdf8', width: 880, height: 640, component: <DownloaderApp />, desc: 'Download files and models', category: 'tools' },
    { id: 'code-studio', name: 'Code Studio', icon: 'Code', color: '#4ade80', width: 1150, height: 720, component: <CodeStudioApp />, desc: 'Write and run code', category: 'productivity' },
    { id: 'ai-hub', name: 'Cortex', icon: 'BrainCircuit', color: '#06b6d4', width: 980, height: 700, component: <ModelHubApp />, desc: 'AI models and chat', category: 'tools' },
    { id: 'api-manager', name: 'API Manager', icon: 'Plug2', color: '#f59e0b', width: 960, height: 660, component: <ApiManagerApp />, desc: 'Manage API connections', category: 'tools' },
    { id: 'task-manager', name: 'Task Manager', icon: 'Activity', color: '#f59e0b', width: 640, height: 520, component: <TaskManagerApp />, desc: 'Monitor running processes', category: 'system', desktopIcon: false },
    { id: 'settings', name: 'Settings', icon: 'Settings', color: '#64748b', width: 900, height: 700, component: <SettingsPage />, desc: 'System preferences', category: 'system', showInStart: false, desktopIcon: false },
  ], []);

  const getApp = useCallback(id => apps.find(app => app.id === id), [apps]);

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
  const [weather, setWeather] = useState(() => loadWeatherCache());
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [aiOutlook, setAiOutlook] = useState('');
  const [locationInfo, setLocationInfo] = useState(() => storage.get('location-info', null));
  const [newsItems, setNewsItems] = useState([]);
  const [altTab, setAltTab] = useState(null); // { index }
  const [shutdown, setShutdown] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [netSpeed, setNetSpeed] = useState(null); // Mbps estimate
  const [battery, setBattery] = useState(null); // { level, charging, timeRemaining }
  const [recentApps, setRecentApps] = useState(() => storage.get('desktop-recent-apps', []));
  const [customGroups, setCustomGroups] = useState(() => storage.get('desktop-custom-groups', []));
  const [pinnedTaskbar, setPinnedTaskbar] = useState(() => storage.get('desktop-pinned-taskbar', []));
  const [soundLevel, setSoundLevel] = useState(() => storage.get('desktop-sound-level', 50));
  const [wallpaper, setWallpaper] = useState(() => storage.get('desktop-wallpaper', 'nexus-default')); // key kept for backward compat
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
  const altTabRef = useRef(null);

  useEffect(() => {
    const onWallpaper = () => {
      setWallpaper(storage.get('desktop-wallpaper', 'nexus-default')); // key kept for backward compat
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

  // Desktop notifications (reminders, etc.) + persistent history.
  useEffect(() => subscribeToNotifications(detail => {
    setToasts(prev => [...prev.slice(-3), detail]);
    setTimeout(() => setToasts(prev => prev.filter(toast => toast.id !== detail.id)), 7000);
  }), []);
  useEffect(() => subscribeToHistory(setNotifHistory), []);
  const notifUnread = notifHistory.filter(entry => !entry.read).length;

  /* ----- Taskbar weather widget (silent refresh on login) ----- */

  const refreshWeather = useCallback(async (interactive = false) => {
    let loc = loadLastLocation();
    if (!loc) {
      if (!interactive) return; // never prompt on load
      loc = await requestLocation();
    }
    if (!loc) return;
    try {
      const unit = preferredUnit();
      const data = await fetchWeather(loc.lat, loc.lon, unit);
      const payload = { data, unit, fetchedAt: Date.now() };
      setWeather(payload);
      saveWeatherCache(payload);
      // Fetch location info (city name) if not cached
      if (!locationInfo) {
        const info = await reverseGeocode(loc.lat, loc.lon);
        if (info) {
          setLocationInfo(info);
          storage.set('location-info', info);
        }
      }
    } catch { /* offline or service hiccup — keep cache */ }
  }, [locationInfo]);

  // Fetch news headlines when weather flyout opens
  useEffect(() => {
    if (!weatherOpen || newsItems.length > 0) return;
    const fetchNews = async () => {
      try {
        // Use DuckDuckGo instant answers for news
        const response = await fetch('https://api.duckduckgo.com/?q=top+news&format=json&no_html=1');
        if (!response.ok) return;
        const data = await response.json();
        const news = (data.RelatedTopics || [])
          .filter(t => t.Text && t.FirstURL)
          .slice(0, 5)
          .map(t => ({ title: t.Text, url: t.FirstURL }));
        setNewsItems(news);
      } catch { /* offline */ }
    };
    fetchNews();
  }, [weatherOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const state = await locationPermission();
      if (state === 'granted' || loadLastLocation()) refreshWeather(false);
    })();
    const timer = setInterval(() => refreshWeather(false), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshWeather]);

  // AI-written one-line outlook when the flyout opens (if any brain key is saved).
  useEffect(() => {
    if (!weatherOpen || !weather?.data) return undefined;
    const provider = Object.keys(loadKeys()).find(id => AI_PROVIDERS[id]);
    if (!provider) return undefined;
    let cancelled = false;
    setAiOutlook('');
    chatCompletion(provider, [
      { role: 'system', content: 'Write one friendly sentence (max 25 words) summarizing today’s weather outlook from the data. Plain text, no markdown.' },
      { role: 'user', content: buildWeatherReport(weather.data) },
    ])
      .then(text => { if (!cancelled && text) setAiOutlook(text.trim()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [weatherOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Other apps (e.g. Media Player) can deep-link into the Browser window.
  useEffect(() => {
    const onOpenBrowser = event => {
      const url = event.detail;
      const target = getApp('browser');
      if (!target) return;
      openWindow({ id: target.id, title: target.name, icon: <Icon name={target.icon} size={16} />, component: <Browser initialUrl={url} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
    };
    window.addEventListener('lithium:open-browser', onOpenBrowser);
    return () => window.removeEventListener('lithium:open-browser', onOpenBrowser);
  }, [getApp, openWindow, updateWindow]);

  // The "+" tab in window titlebars opens the Start menu.
  useEffect(() => {
    const onOpenStart = () => { closePopups(); setStartMenuOpen(true); };
    window.addEventListener('lithium:open-start', onOpenStart);
    return () => window.removeEventListener('lithium:open-start', onOpenStart);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrux launches games into their own window (Steam-style).
  useEffect(() => {
    const onOpenGame = event => {
      const game = event.detail;
      const id = `game-${game.id}`;
      openWindow({
        id,
        title: game.title,
        icon: <Icon name="Gamepad2" size={16} />,
        component: <GamePlayer embedded game={game} onClose={() => closeWindow(id)} />,
        newWindow: true,
        x: Math.max(20, window.innerWidth - 1060),
        y: 60,
        width: 1000,
        height: 700,
      });
    };
    window.addEventListener('lithium:open-game', onOpenGame);
    return () => window.removeEventListener('lithium:open-game', onOpenGame);
  }, [openWindow, closeWindow]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection); };
  }, []);

  // Network speed estimation via Network Information API + performance timing
  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return;
    const update = () => setNetSpeed(conn.downlink ?? null);
    update();
    conn.addEventListener('change', update);
    return () => conn.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!navigator.getBattery) return undefined;
    let manager;
    let cancelled = false;
    (async () => {
      try {
        manager = await navigator.getBattery();
        if (cancelled) return;
        const update = () => {
          const time = manager.charging ? manager.chargingTime : manager.dischargingTime;
          setBattery({ level: Math.round(manager.level * 100), charging: manager.charging, timeRemaining: isFinite(time) && time > 0 ? time : null });
        };
        update();
        manager.addEventListener('levelchange', update);
        manager.addEventListener('chargingchange', update);
        manager.addEventListener('dischargingtimechange', update);
        manager.addEventListener('chargingtimechange', update);
      } catch { /* Battery API is optional. */ }
    })();
    return () => {
      cancelled = true;
      if (manager) { manager.removeEventListener('levelchange', () => {}); manager.removeEventListener('chargingchange', () => {}); }
    };
  }, []);

  useDebouncedSave('desktop-recent-apps', recentApps);
  useDebouncedSave('desktop-custom-groups', customGroups);
  useDebouncedSave('desktop-pinned-taskbar', pinnedTaskbar);
  useDebouncedSave('desktop-sound-level', soundLevel);
  useDebouncedSave('desktop-wallpaper', wallpaper);
  useDebouncedSave('desktop-pinned-order', pinnedOrder);
  useDebouncedSave('desktop-app-freq', appFreq);
  useDebouncedSave('desktop-app-sort', sortMode);

  /* ----- Window launching ----- */

  const launchApp = useCallback((app, opts = {}) => {
    const target = typeof app === 'string' ? getApp(app) : app;
    if (!target) return;
    // If the app already has a window, just focus it (no duplicates).
    if (opts.newWindow !== true && windows.some(win => win.id === target.id || win.tabs.some(t => t.appId === target.id))) {
      focusApp(target.id);
    } else {
      openWindow({
        id: target.id,
        title: target.name,
        icon: <Icon name={target.icon} size={16} />,
        component: target.component,
        x: 110,
        y: 70,
        width: target.width || 900,
        height: target.height || 640,
        newWindow: true, // each app gets its own cascaded window
      });
    }
    setRecentApps(prev => [target.id, ...prev.filter(id => id !== target.id)].slice(0, 4));
    setAppFreq(prev => ({ ...prev, [target.id]: (prev[target.id] || 0) + 1 }));
    setStartMenuOpen(false);
    setSearchQuery('');
    setGridFocus(-1);
    emitEvent('app.opened', { id: target.id, name: target.name });
  }, [getApp, openWindow, focusApp, windows]);

  /* ----- API Manager integration ----- */

  const launchRef = useRef(launchApp);
  useEffect(() => { launchRef.current = launchApp; });

  // Built-in handlers (idempotent) + apps.* handlers backed by this desktop.
  useEffect(() => {
    registerBuiltinHandlers();
    registerHandler('apps.list', () => apps.map(app => ({ id: app.id, name: app.name })));
    registerHandler('apps.open', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}' — call apps.list for valid ids`);
      launchRef.current(id);
    });
    registerHandler('apps.close', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}' — call apps.list for valid ids`);
      closeApp(id);
    });
    registerHandler('apps.focus', ({ id }) => {
      if (!apps.some(app => app.id === id)) throw new Error(`unknown app '${id}' — call apps.list for valid ids`);
      focusApp(id);
    });

    const onCommand = event => {
      const { cmd, level } = event.detail || {};
      if (cmd === 'open_start_menu') setStartMenuOpen(true);
      if (cmd === 'close_start_menu') setStartMenuOpen(false);
      if (cmd === 'show_desktop') windows.forEach(item => updateWindow(item.id, { minimized: true }));
      if (cmd === 'set_volume') {
        setSoundLevel(Math.max(0, Math.min(100, Math.round(level ?? 50))));
      }
    };
    window.addEventListener('lithium:api-command', onCommand);

    startEnabledWidgets();
    if (!bootEmitted) {
      bootEmitted = true;
      emitEvent('boot');
    }
    // Keep the Downloads folder in sync with models, game cache and exports.
    watchDownloads();
    syncDownloads().catch(() => {});
    return () => window.removeEventListener('lithium:api-command', onCommand);
  }, [apps, closeWindow, focusWindow, updateWindow, windows]);

  // Desktop signals for widgets.
  useEffect(() => { emitEvent(startMenuOpen ? 'startMenu.opened' : 'startMenu.closed'); }, [startMenuOpen]);
  useEffect(() => { emitEvent('volume.changed', { level: soundLevel }); }, [soundLevel]);
  useEffect(() => { if (weather?.data) emitEvent('weather.updated', { fetchedAt: weather.fetchedAt }); }, [weather]);

  /* ----- Alt + Tab ----- */

  useEffect(() => {
    const onKeyDown = event => {
      if (event.altKey && event.key === 'Tab') {
        event.preventDefault();
        const visible = windows.filter(item => !item.minimized);
        if (!visible.length) return;
        setAltTab(prev => ({ index: prev ? (prev.index + 1) % visible.length : 0 }));
      } else if (event.key === 'Escape') {
        setAltTab(null);
        setStartMenuOpen(false);
        setPowerMenuOpen(false);
        setCalendarOpen(false);
        setVolumePopupOpen(false);
        setQuickSettingsOpen(false);
        setTaskViewOpen(false);
      }
    };
    const onKeyUp = event => {
      if (event.key === 'Alt' && altTabRef.current) {
        const visible = windows.filter(item => !item.minimized);
        const target = visible[altTabRef.current.index % visible.length];
        if (target) focusWindow(target.id);
        setAltTab(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [windows, focusWindow]);

  useEffect(() => { altTabRef.current = altTab; }, [altTab]);

  /* ----- Keyboard snapping (Ctrl + Alt + arrows) ----- */

  useEffect(() => {
    const onKeyDown = event => {
      if (!event.ctrlKey || !event.altKey || event.metaKey) return;
      const visible = windows.filter(item => !item.minimized);
      if (!visible.length) return;
      const top = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
      if (event.key === 'ArrowLeft') { event.preventDefault(); updateWindow(top.id, snapBounds('left')); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); updateWindow(top.id, snapBounds('right')); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); updateWindow(top.id, { maximized: true }); }
      else if (event.key === 'ArrowDown' && top.maximized) { event.preventDefault(); updateWindow(top.id, { maximized: false }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [windows, updateWindow]);

  /* ----- Context menus ----- */

  const togglePin = appId => {
    setPinnedTaskbar(prev => (prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]));
  };

  /* ---------- Desktop context menu (Windows 11 style) ---------- */
  const DESKTOP_FOLDER_ID = 'default-desktop';
  const wpIds = Object.keys(WALLPAPERS);
  const currentWpIdx = wpIds.indexOf(wallpaper);
  const nextWallpaper = () => setWallpaper(wpIds[(currentWpIdx + 1) % wpIds.length]);

  const desktopContextMenu = event => {
    // Don't show the desktop menu when the click is inside a window —
    // each app handles its own right-click context menus.
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

  /* ----- Power actions ----- */

  const closeAllWindows = () => windows.forEach(item => closeWindow(item.id));
  const handlePower = action => {
    setPowerMenuOpen(false);
    setStartMenuOpen(false);
    if (action === 'logout') closeAllWindows();
    else if (action === 'restart') window.location.reload();
    else if (action === 'shutdown') setShutdown(true);
  };

  /* ----- Derived UI data ----- */

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
  const APP_CATEGORIES = [
    { id: 'all', label: 'All', icon: 'LayoutGrid' },
    { id: 'productivity', label: 'Productivity', icon: 'Briefcase' },
    { id: 'media', label: 'Media', icon: 'Play' },
    { id: 'tools', label: 'Tools', icon: 'Wrench' },
    { id: 'system', label: 'System', icon: 'Cpu' },
  ];
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
    if (id === 'notepad') return null;
    if (id === 'games') return null;
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
  const visibleWindows = windows.filter(item => !item.minimized);
  const maxZ = visibleWindows.length ? Math.max(...visibleWindows.map(item => item.zIndex)) : 0;

  const volumeIconName = soundLevel === 0 ? 'VolumeX' : soundLevel < 50 ? 'Volume1' : 'Volume2';
  const volumeColor = soundLevel === 0 ? '#ef4444' : soundLevel < 50 ? '#f59e0b' : '#10b981';
  const batteryColor = battery ? (battery.level <= 20 ? '#ef4444' : battery.level <= 50 ? '#f59e0b' : '#10b981') : '#10b981';

  // Format battery time remaining
  const formatBatteryTime = (seconds) => {
    if (seconds == null) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const batteryTooltip = battery
    ? `Battery: ${battery.level}%${battery.charging ? ' (Charging)' : battery.timeRemaining ? ` — ~${formatBatteryTime(battery.timeRemaining)} remaining` : ''}`
    : 'Desktop (No Battery)';

  // Network speed tooltip
  const networkTooltip = online
    ? netSpeed != null ? `Network: connected \u2014 ~${netSpeed} Mbps` : 'Network: connected'
    : 'Network: offline';

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

  if (shutdown) {
    return (
      <div className="nx-shutdown" onClick={() => setShutdown(false)} title="Click to power on">
        It&apos;s now safe to turn off your computer.
      </div>
    );
  }

  return (
    <div
      className="nx-desktop"
      data-taskbar={taskbarPrefs.position}
      style={{
        ...(settings.background.enabled === false
          ? { backgroundColor: '#101014' }
          : wallpaper === 'custom' && customWallpaper
            ? { backgroundColor: '#0a0a0f', backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : WALLPAPERS[wallpaper]?.style || WALLPAPERS['nexus-default'].style),
        '--tb-left': taskbarPrefs.position === 'left' ? '58px' : '0px',
        '--tb-right': taskbarPrefs.position === 'right' ? '58px' : '0px',
        '--tb-bottom': taskbarPrefs.position === 'bottom' ? '48px' : '0px',
      }}
      onClick={closePopups}
      onContextMenu={desktopContextMenu}
    >
      {/* Wallpaper dimmer (Settings → Backgrounds → brightness) */}
      {settings.background.enabled !== false && settings.background.intensity < 1 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${(1 - settings.background.intensity) * 0.75})`, pointerEvents: 'none' }} />
      )}
      {/* Desktop icons */}
      <DesktopIcons
        apps={apps.filter(app => app.desktopIcon !== false)}
        onLaunch={launchApp}
        onIconContextMenu={(event, app, resetPosition) => openDynMenu(event, [
          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
          { id: 'sep-1', type: 'separator' },
          ...(app.id !== 'task-manager' && app.id !== 'settings' ? [
            { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: 'Pin', action: () => togglePin(app.id) },
          ] : []),
          { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
        ])}
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
        <TaskView
          windows={windows}
          onSelect={id => { updateWindow(id, { minimized: false }); focusWindow(id); setTaskViewOpen(false); }}
          onCloseWindow={id => closeWindow(id)}
          onCloseAll={() => { closeAllWindows(); setTaskViewOpen(false); }}
          onClose={() => setTaskViewOpen(false)}
        />
      )}

      {/* Command palette (Ctrl/Cmd+K) */}
      <CommandPalette
        apps={apps}
        onLaunch={launchApp}
        onLock={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}
        onEmptyTrash={async () => {
          if (fsTrashedCount === 0) { notify({ title: 'Recycle Bin is already empty', tone: 'info' }); return; }
          if (!window.confirm(`Permanently delete ${fsTrashedCount} item${fsTrashedCount === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
          try { setFsTree(await purgeTrash(fsTree)); } catch (err) { notify({ title: 'Could not empty Recycle Bin', body: err.message, tone: 'error' }); }
        }}
        onOpenSettings={() => launchApp('settings')}
        onOpenNotifications={() => { setNotifCenterOpen(true); }}
        onShowDesktop={() => windows.forEach(item => updateWindow(item.id, { minimized: true }))}
        onTaskView={() => setTaskViewOpen(true)}
      />

      {/* Desktop notifications */}
      <div className="nx-toast-container">
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
                {taskbarPrefs.buttons !== 'labels' && <Icon name={app.icon} size={18} />}
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
                <span className="nx-weather-emoji">{weatherEmoji(weather.data.current?.weather_code, weather.data.current?.is_day)}</span>
                <span className="nx-weather-text">
                  <span>{Math.round(weather.data.current.temperature_2m)}{unitSymbol(weather.unit)}</span>
                  <span className="nx-weather-cond">{weatherDescription(weather.data.current?.weather_code)}</span>
                </span>
              </>
            ) : (
              <span className="nx-weather-text">
                <span className="nx-weather-emoji">🌐</span>
                <span className="nx-weather-cond">Enable weather</span>
              </span>
            )}
          </button>

          {/* System tray — clicking any item opens Quick Settings */}
          <div className="nx-tray">
            <button className="nx-tray-item" title={networkTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              {online ? <Icon name="Wifi" size={16} color="#10b981" strokeWidth={2} /> : <Icon name="WifiOff" size={16} color="#ef4444" strokeWidth={2} />}
            </button>

            <button className="nx-tray-item" title={`Volume: ${soundLevel}%`} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              <Icon name={volumeIconName} size={16} strokeWidth={2} color={volumeColor} />
            </button>

            <button
              className={`nx-tray-item ${notifCenterOpen ? 'open' : ''}`}
              title={notifUnread > 0 ? `${notifUnread} unread notification${notifUnread === 1 ? '' : 's'}` : 'Notifications'}
              onClick={event => { event.stopPropagation(); setNotifCenterOpen(value => !value); setQuickSettingsOpen(false); }}
              style={{ position: 'relative' }}
            >
              <Icon name="Bell" size={15} strokeWidth={2} color={notifUnread > 0 ? '#22d3ee' : '#888'} />
              {notifUnread > 0 && (
                <span aria-label={`${notifUnread} unread`} className="nx-tray-badge">
                  {notifUnread > 9 ? '9+' : notifUnread}
                </span>
              )}
            </button>

            {/* Battery graphic — opens Quick Settings */}
            <button className="nx-tray-item" title={batteryTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              <span className="nx-battery">
                <span className="nx-battery-shell" style={{ border: `1.5px solid ${batteryColor}` }}>
                  <span className="nx-battery-fill" style={{ width: battery ? `${battery.level}%` : '100%', backgroundColor: batteryColor }}>
                    {!battery && <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 13, fontWeight: 'bold', transform: 'translateY(-1px)' }}>∞</span>}
                    {battery && battery.level > 20 && <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'bold', transform: 'translateY(-1px)' }}>{battery.level}</span>}
                  </span>
                </span>
                <span className="nx-battery-tip" style={{ backgroundColor: batteryColor }} />
              </span>
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
                    <Icon name={app.icon} size={15} color={app.color} />
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
        <div className="nx-weather-popup" onClick={event => event.stopPropagation()} onContextMenu={event => openDynMenu(event, [
          { id: 'refresh', label: 'Refresh weather', icon: 'RotateCw', action: () => refreshWeather(true) },
          { id: 'forecast', label: 'Open detailed forecast', icon: 'Cloud', action: () => {
            setWeatherOpen(false);
            const browser = getApp('browser');
            const msnUrl = locationInfo ? buildMsnWeatherUrl(locationInfo.city) : '';
            if (browser && msnUrl) openWindow({ id: browser.id, title: browser.name, icon: <Icon name={browser.icon} size={16} />, component: <Browser initialUrl={msnUrl} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
          }},
          { id: 'ai-report', label: 'AI weather report', icon: 'BrainCircuit', action: () => {
            setWeatherOpen(false);
            launchApp('ai-hub');
            setTimeout(() => window.dispatchEvent(new Event('lithium:ai-report')), 150);
          }},
        ])}>
          <div className="nx-wx-header">
            <div className="nx-wx-title">
              {locationInfo ? `${locationInfo.city}${locationInfo.state ? `, ${locationInfo.state}` : ''}` : 'Local weather'}
            </div>
            <div className="nx-wx-actions">
              <button className="nx-footer-icon" style={{ width: 24, height: 24 }} title="Refresh" onClick={() => refreshWeather(true)}><Icon name="RotateCw" size={12} /></button>
              <button className="nx-footer-icon" style={{ width: 24, height: 24 }} title="Close" onClick={() => setWeatherOpen(false)}>×</button>
            </div>
          </div>
          {weather?.data ? (() => {
            const current = weather.data.current || {};
            const daily = weather.data.daily || {};
            const deg = unitSymbol(weather.unit);
            const msnUrl = locationInfo ? buildMsnWeatherUrl(locationInfo.city) : '';
            return (
              <>
                <div className="nx-wx-current">
                  <span className="nx-wx-emoji">{weatherEmoji(current.weather_code, current.is_day)}</span>
                  <div style={{ flex: 1 }}>
                    <div className="nx-wx-temp">{Math.round(current.temperature_2m)}{deg}</div>
                    <div className="nx-wx-desc">{weatherDescription(current.weather_code)}</div>
                  </div>
                  <div className="nx-wx-hl">
                    <div>H: {Math.round(daily.temperature_2m_max?.[0])}{deg}</div>
                    <div>L: {Math.round(daily.temperature_2m_min?.[0])}{deg}</div>
                  </div>
                </div>
                <div className="nx-wx-grid">
                  <WeatherStat label="Feels like" value={`${Math.round(current.apparent_temperature)}${deg}`} />
                  <WeatherStat label="Humidity" value={`${current.relative_humidity_2m}%`} />
                  <WeatherStat label="Wind" value={`${current.wind_speed_10m} km/h`} />
                  <WeatherStat label="Pressure" value={`${Math.round(current.pressure_msl)} hPa`} />
                  <WeatherStat label="Clouds" value={`${current.cloud_cover}%`} />
                  <WeatherStat label="Rain chance" value={`${daily.precipitation_probability_max?.[0] ?? '—'}%`} />
                  <WeatherStat label="UV index" value={`${daily.uv_index_max?.[0] ?? '—'}`} />
                  <WeatherStat label="Sunrise / set" value={`${(daily.sunrise?.[0] || '').split('T')[1]?.slice(0, 5) || '—'} / ${(daily.sunset?.[0] || '').split('T')[1]?.slice(0, 5) || '—'}`} />
                </div>
                <p className="nx-wx-summary">
                  {aiOutlook ? `✨ ${aiOutlook}` : summaryLine(current, daily)}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {msnUrl && (
                    <button
                      className="nx-menu-item"
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 11 }}
                      onClick={() => {
                        setWeatherOpen(false);
                        const browser = getApp('browser');
                        if (browser) openWindow({ id: browser.id, title: browser.name, icon: <Icon name={browser.icon} size={16} />, component: <Browser initialUrl={msnUrl} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                      }}
                    >
                      <Icon name="Cloud" size={12} style={{ marginRight: 4 }} /> Detailed forecast
                    </button>
                  )}
                  <button
                    className="nx-menu-item"
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 11 }}
                    onClick={() => {
                      setWeatherOpen(false);
                      launchApp('ai-hub');
                      setTimeout(() => window.dispatchEvent(new Event('lithium:ai-report')), 150);
                    }}
                  >
                    <Icon name="BrainCircuit" size={12} style={{ marginRight: 4 }} /> AI report
                  </button>
                </div>
                {/* News section */}
                {newsItems.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top stories</div>
                    {newsItems.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="nx-menu-item"
                        style={{ padding: '6px 8px', borderRadius: 4, fontSize: 11, marginBottom: 2, textDecoration: 'none', color: 'rgba(255,255,255,0.75)', display: 'block' }}
                      >
                        {item.title.slice(0, 80)}{item.title.length > 80 ? '…' : ''}
                      </a>
                    ))}
                  </div>
                )}
              </>
            );
          })() : (
            <div className="nx-wx-enable">
              <p>Weather needs your general location. It is fetched from open-meteo and cached on this device only.</p>
              <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => refreshWeather(true)}>Enable location</button>
            </div>
          )}
        </div>
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
      {notifCenterOpen && <NotificationCenter onCtxMenu={openDynMenu} />}

      {/* Quick settings panel */}
      {quickSettingsOpen && (
        <>
          <div className="nx-qs-backdrop" onClick={closePopups} />
          <QuickActionsPanel
            settings={settings}
            soundLevel={soundLevel}
            setSoundLevel={setSoundLevel}
            prevVolumeRef={prevVolumeRef}
            online={online}
            netSpeed={netSpeed}
            battery={battery}
            onClose={() => setQuickSettingsOpen(false)}
            onOpenSettings={() => launchApp('settings')}
          />
        </>
      )}

      {/* Start menu */}
      {startMenuOpen && (
        <>
          <div className="nx-start-backdrop" onClick={closePopups} />
          <div className={`nx-start-menu ${taskbarPrefs.position === 'bottom' ? `align-${taskbarPrefs.startAlign}` : ''}`} data-category={appCategory} onClick={event => event.stopPropagation()}>
            {/* Search */}
            <div style={{ padding: '24px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="nx-start-search-wrap">
                <Icon name="Search" size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                <input
                  className="nx-start-search"
                  type="text"
                  placeholder="Search apps or web\u2026"
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
                          openWindow({ id: target.id, title: target.name, icon: <Icon name={target.icon} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} /> , replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
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
              {!query && (
                <div className="nx-pinned-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div className="nx-start-heading" style={{ margin: 0 }}>Pinned</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="nx-grid-toggle" onClick={() => setSortMode(m => m === 'alpha' ? 'freq' : 'alpha')} title={sortMode === 'alpha' ? 'Sort: A-Z' : 'Sort: Most used'}>
                        <Icon name={sortMode === 'alpha' ? 'ArrowDownAZ' : 'Flame'} size={12} />
                      </button>
                      <button className="nx-grid-toggle" onClick={() => setAppGridView(v => v === 'grid' ? 'list' : 'grid')} title={appGridView === 'grid' ? 'Switch to list view' : 'Switch to grid view'}>
                        <Icon name={appGridView === 'grid' ? 'List' : 'LayoutGrid'} size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="nx-pinned-grid">
                    {pinnedAppsOrdered.slice(0, 8).map((app, i) => (
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
                        <AppIcon icon={app.icon} color={app.color} size={20} />
                        <span className="nx-pinned-tile-label">{app.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category tabs */}
              {!query && (
                <div className="nx-category-tabs">
                  {APP_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      className={`nx-category-tab${appCategory === cat.id ? ' active' : ''}`}
                      onClick={() => setAppCategory(cat.id)}
                    >
                      <Icon name={cat.icon} size={11} />
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Body: Apps grid/list | Recent + Groups */}
              <div className="nx-start-body">
                <div className="nx-start-col">
                  {query ? (
                    <>
                      <div className="nx-start-heading" style={{ marginTop: 6 }}>Results</div>
                      {filteredApps.map(app => (
                        <button key={app.id} className="nx-app-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)} onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openDynMenu(event, [
                          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
                          { id: 'new-window', label: 'Open in new window', icon: 'ExternalLink', action: () => launchApp(app, { newWindow: true }) },
                          { id: 'sep', type: 'separator' },
                          { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                        ]); }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                            <Icon name={app.icon} size={18} color={app.color} />
                          </span>
                          <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                        </button>
                      ))}
                    </>
                  ) : appGridView === 'grid' ? (
                    <div className="nx-all-apps-grid">
                      {filteredApps.map((app, i) => (
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
                          <AppIcon icon={app.icon} color={app.color} size={20} />
                          <span className="nx-app-grid-name">{app.name}</span>
                        </button>
                      ))}
                      {filteredApps.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', padding: 20 }}>No apps in this category.</div>
                      )}
                    </div>
                  ) : (
                    <>
                      {filteredApps.map(app => (
                        <button key={app.id} className="nx-app-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)} onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openDynMenu(event, [
                          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
                          { id: 'new-window', label: 'Open in new window', icon: 'ExternalLink', action: () => launchApp(app, { newWindow: true }) },
                          { id: 'sep', type: 'separator' },
                          { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                        ]); }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                            <Icon name={app.icon} size={18} color={app.color} />
                          </span>
                          <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.desc}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* App preview card */}
                  {previewApp && !query && (
                    <div className="nx-app-preview-card">
                      <AppIcon icon={previewApp.icon} color={previewApp.color} size={24} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{previewApp.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{previewApp.desc}</div>
                      </div>
                      <button className="nx-grid-toggle" onClick={() => launchApp(previewApp)} title="Open">
                        <Icon name="ArrowRight" size={12} />
                      </button>
                    </div>
                  )}
                  {filteredApps.length === 0 && noteResults.length === 0 && fileResults.length === 0 && query && (
                    <>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>No app results for &ldquo;{searchQuery}&rdquo;</div>
                      <button className="nx-app-row" style={{ marginTop: 8 }} onClick={() => {
                        const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
                        const target = getApp('browser');
                        if (target) {
                          openWindow({ id: target.id, title: target.name, icon: <Icon name={target.icon} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                          setStartMenuOpen(false);
                          setSearchQuery('');
                        }
                      }}>
                        <Icon name="Globe" size={16} color="#06b6d4" />
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

                <div className="nx-start-col right">
                  {/* Recently updated */}
                  <div>
                    <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10 }}>What&apos;s new</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[{ id: 'code-studio', note: 'Code Studio now supports multi-file projects' }, { id: 'notepad', note: 'Notes got Obsidian-style wiki links' }, { id: 'games', note: 'Hydrux has 4 new HTML games' }].map(item => {
                        const app = getApp(item.id);
                        if (!app) return null;
                        return (
                          <button key={item.id} className="nx-app-row small" onClick={() => launchApp(app)} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                            <Icon name={app.icon} size={14} color={app.color} />
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>{item.note}</span>
                            <span className="nx-new-dot" style={{ position: 'static', width: 6, height: 6 }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recent */}
                  <div>
                    <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10 }}>Recent</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {recentApps.map(getApp).filter(Boolean).map(app => {
                        return (
                          <button key={app.id} className="nx-app-row small" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                            <Icon name={app.icon} size={18} color={app.color} />
                            <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                          </button>
                        );
                      })}
                      {recentApps.length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Launch an app and it will show up here.</div>}
                    </div>
                  </div>

                  {/* Custom groups */}
                  {customGroups.map((group, groupIndex) => (
                    <div key={group.name}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {group.name}
                        <button
                          onClick={() => setCustomGroups(prev => prev.filter((_, i) => i !== groupIndex))}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 10, padding: 2 }}
                          title="Delete group"
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {group.items.map(getApp).filter(Boolean).map(app => {
                          const Icon = app.icon;
                          return (
                            <button key={app.id} className="nx-app-row small" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                              <Icon size={18} color={app.color} />
                              <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <button
                    className="nx-new-group"
                    onClick={() => {
                      const groupName = window.prompt('Group name:');
                      if (groupName?.trim()) setCustomGroups(prev => [...prev, { name: groupName.trim(), items: [] }]);
                    }}
                  >
                    + New Group
                  </button>
                </div>
              </div>

              {/* Status bar */}
              <div className="nx-start-statusbar">
                <PerfFooterButton onClick={() => { setStartMenuOpen(false); setPerfOpen(value => !value); }} />
                {hoveredApp?.desc && <span className="nx-start-app-desc">✨ {hoveredApp.desc}</span>}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Icon name="Clock" size={14} />
                    <StatusTime />
                  </div>
                  {battery && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: battery.level < 20 ? '#ff6b6b' : '#fff' }}>
                      {battery.charging ? <Icon name="BatteryCharging" size={14} /> : <Icon name="Battery" size={14} />}
                      <span>{battery.level}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: profile, settings, power */}
              <div className="nx-start-footer">
                <button className="nx-profile-btn" onClick={() => launchApp('settings')} title="Open Settings to edit your profile">
                  {avatar ? (
                    <img src={avatar} alt="" className="nx-profile-avatar" style={{ objectFit: 'cover', background: 'transparent', fontSize: 0 }} />
                  ) : (
                    <span className="nx-profile-avatar">{settings.profile.username.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                  <span style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{settings.profile.username}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>Local user</span>
                  </span>
                </button>
                <button className="nx-footer-icon" onClick={() => launchApp('settings')} title="Settings">
                  <Icon name="Settings" size={18} />
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
