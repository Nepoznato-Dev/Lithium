import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { storage, scheduleStorageSave, cancelStorageSaves } from '../../lib/storage/localStorage';
import WinControls from '../../Components/Desktop/WinControls';
import { useSettings } from '../../Components/SettingsContext';
import { BUILD_VERSION, DEFAULT_SETTINGS } from '../../lib/settings';
import { createBackupZip, restoreBackupZip, downloadBlob as downloadZipBlob } from '../../lib/storage/zipArchive';
import { registerSavedFile } from '../../lib/downloads';
import Icon from '../../Components/Icon';
import { getExtensionPages } from '../../lib/extensions/extSettingsRegistry';
import ExtPageRenderer from './ExtPageRenderer';
import { getAppPages } from '../../lib/li-apps/appSettingsRegistry';
import AppPageRenderer from './AppPageRenderer';
import AppSettingsOverview from './AppSettingsOverview';

// Lazy-load all 18 section components to reduce initial bundle size
const SecuritySection = lazy(() => import('./sections/SecuritySection'));
const ProfileSection = lazy(() => import('./sections/ProfileSection'));
const AppearanceSection = lazy(() => import('./sections/AppearanceSection'));
const DisplaySection = lazy(() => import('./sections/DisplaySection'));
const MotionSection = lazy(() => import('./sections/MotionSection'));
const BackgroundSection = lazy(() => import('./sections/BackgroundSection'));
const PowerSection = lazy(() => import('./sections/PowerSection'));
const NotificationsSection = lazy(() => import('./sections/NotificationsSection'));
const WindowSection = lazy(() => import('./sections/WindowSection'));
const GamesSection = lazy(() => import('./sections/GamesSection'));
const BrowserSection = lazy(() => import('./sections/BrowserSection'));
const DataSection = lazy(() => import('./sections/DataSection'));
const AboutSection = lazy(() => import('./sections/AboutSection'));
const YukisCustomizationSection = lazy(() => import('./sections/YukisCustomizationSection'));
const PrivacySettingsSection = lazy(() => import('./sections/PrivacySettingsSection'));
const AiSection = lazy(() => import('./sections/AiSection'));
const SearchEnginesSection = lazy(() => import('./sections/SearchEnginesSection'));
const ExtensionsSection = lazy(() => import('./sections/ExtensionsSection'));
const FileSystemSection = lazy(() => import('./sections/FileSystemSection'));
const UpdatesSection = lazy(() => import('./sections/UpdatesSection'));

/* ================================================================
   Section definitions
   ================================================================ */

/** Section groups for the sidebar navigation. */
const SECTION_GROUPS = [
  {
    label: 'Personal',
    sections: [
      { id: 'profile', title: 'Profile', icon: 'User', keywords: ['profile', 'username', 'name', 'account', 'avatar', 'switch'] },
      { id: 'appearance', title: 'Appearance', icon: 'Palette', keywords: ['theme', 'color', 'accent', 'contrast', 'dark', 'transparency'] },
    ],
  },
  {
    label: 'System',
    sections: [
      { id: 'display', title: 'Display', icon: 'Monitor', keywords: ['display', 'font', 'size', 'brightness', 'blur', 'density', 'scaling'] },
      { id: 'power', title: 'Power & Battery', icon: 'Battery', keywords: ['battery', 'power', 'energy', 'saver', 'lock', 'auto-lock'] },
      { id: 'notifications', title: 'Notifications', icon: 'Bell', keywords: ['notification', 'toast', 'sound', 'alert'] },
      { id: 'window', title: 'Windows', icon: 'PanelRight', keywords: ['window', 'snap', 'assist', 'drag'] },
      { id: 'motion', title: 'Motion & Perf', icon: 'Sparkles', keywords: ['animation', 'motion', 'transition', 'performance', 'low end', 'speed'] },
    ],
  },
  {
    label: 'Privacy',
    sections: [
      { id: 'privacy', title: 'Privacy & Security', icon: 'ShieldCheck', keywords: ['privacy', 'shield', 'tracker', 'ad block', 'gpc', 'security'] },
      { id: 'security', title: 'Security', icon: 'Shield', keywords: ['security', 'pin', 'lock', 'password'] },
    ],
  },
  {
    label: 'Apps',
    sections: [
      { id: 'browser', title: 'Browser', icon: 'Globe', keywords: ['browser', 'search', 'engine'] },
      { id: 'games', title: 'Games', icon: 'Gamepad2', keywords: ['games', 'fullscreen', 'esc', 'player'] },
      { id: 'app-settings', title: 'App Settings', icon: 'SlidersHorizontal', keywords: ['app', 'settings', 'li', 'preferences'] },
      { id: 'extensions', title: 'Extensions', icon: 'Puzzle', keywords: ['extension', 'plugin', 'addon', 'permission'] },
    ],
  },
  {
    label: 'Customization',
    sections: [
      { id: 'background', title: 'Backgrounds', icon: 'Image', keywords: ['background', 'wallpaper', 'ambient'] },
      { id: 'yuki-customization', title: "Yuki's Customization", icon: 'Sparkles', keywords: ['yuki', 'customization', 'cursor', 'wallpaper', 'gradient'] },
    ],
  },
  {
    label: 'Data & Other',
    sections: [
      { id: 'search-engines', title: 'Search Engines', icon: 'Search', keywords: ['search', 'engine', 'keyword', 'omnibox'] },
      { id: 'ai', title: 'AI & Intelligence', icon: 'BrainCircuit', keywords: ['ai', 'model', 'provider', 'prompt', 'context', 'memory'] },
      { id: 'data', title: 'Data & Backup', icon: 'Download', keywords: ['data', 'backup', 'export', 'import', 'delete', 'reset'] },
      { id: 'filesystem', title: 'Local File System', icon: 'HardDrive', keywords: ['file', 'system', 'local', 'sync', 'folder', 'directory', 'disk'] },
      { id: 'updates', title: 'Updates', icon: 'Package', keywords: ['update', 'version', 'upgrade', 'rollback', 'install', 'release'] },
      { id: 'about', title: 'About', icon: 'Info', keywords: ['about', 'version', 'privacy', 'info'] },
    ],
  },
];

/** Flat list of all sections (derived from groups) for search/filter. */
const SECTIONS = SECTION_GROUPS.flatMap(g => g.sections);

function getSectionDescription(id) {
  const descriptions = {
    profile: 'Manage your account name and avatar',
    appearance: 'Customize colors, contrast, and visual style',
    display: 'Adjust text size, brightness, and layout density',
    motion: 'Control animations and performance settings',
    background: 'Configure desktop wallpaper and ambient effects',
    'yuki-customization': "Configure Yuki's wallpaper and cursor customization",
    power: 'Battery saver, auto-dim & power management',
    notifications: 'Toast position, duration, and sound preferences',
    window: 'Window snapping, keyboard shortcuts & title bar style',
    games: 'Fullscreen and ESC behavior for the game player',
    'app-settings': 'Settings pages registered by installed apps',
    browser: 'Search engine and browsing preferences',
    security: 'Lock-screen PIN, auto-lock & security options',
    privacy: 'Shields, tracking protection, GPC & privacy stats',
    ai: 'AI model, provider, system prompt & context settings',
    'search-engines': 'Manage search engines, add custom engines & keyword shortcuts',
    profiles: 'Multi-user profiles with isolated data and settings (merged into Profile)',
    data: 'Export, import, or delete your settings and data',
    filesystem: 'Sync data with a local folder via the File System Access API',
    updates: 'Install, switch, or roll back Lithium versions',
    extensions: 'Install, enable and manage extensions',
    about: 'Version info, features, tech stack & privacy',
  };
  return descriptions[id] || '';
}

/* ================================================================
   Main Page
   ================================================================ */

export default function Settings({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { settings, updateSetting, replaceSettings } = useSettings();
  const [savedUi] = useState(() => storage.get('settings-ui:v1', {}));
  const [activeSection, setActiveSection] = useState(() => typeof savedUi?.activeSection === 'string' ? savedUi.activeSection : 'profile');
  const [searchQuery, setSearchQuery] = useState(() => typeof savedUi?.searchQuery === 'string' ? savedUi.searchQuery : '');
  useLayoutEffect(() => {
    scheduleStorageSave('settings-ui:v1', { activeSection, searchQuery });
  }, [activeSection, searchQuery]);
  const [saveNotification, setSaveNotification] = useState('');
  const saveTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const notifySaved = useCallback(message => {
    clearTimeout(saveTimer.current);
    setSaveNotification(message);
    saveTimer.current = setTimeout(() => setSaveNotification(''), 1800);
  }, []);
  const [extPages, setExtPages] = useState(() => getExtensionPages());
  const [appPages, setAppPages] = useState(() => getAppPages());

  // Track extension-registered settings pages reactively.
  useEffect(() => {
    const sync = () => setExtPages(getExtensionPages());
    window.addEventListener('lithium:ext-settings-pages-changed', sync);
    return () => window.removeEventListener('lithium:ext-settings-pages-changed', sync);
  }, []);

  // Track app-registered settings pages reactively.
  useEffect(() => {
    const sync = () => setAppPages(getAppPages());
    window.addEventListener('lithium:app-settings-pages-changed', sync);
    return () => window.removeEventListener('lithium:app-settings-pages-changed', sync);
  }, []);

  const update = useCallback((path, value) => {
    updateSetting(path, value);
    notifySaved('Saved');
  }, [updateSetting, notifySaved]);

  const exportSettings = useCallback(() => {
    const payload = { version: BUILD_VERSION, timestamp: Date.now(), settings };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lithium-settings-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    registerSavedFile(anchor.download, json);
  }, [settings]);

  const importSettings = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = readEvent => {
        try {
          const imported = JSON.parse(readEvent.target.result);
          if (!imported.settings) throw new Error('invalid file');
          const merged = { ...DEFAULT_SETTINGS };
          for (const key of Object.keys(DEFAULT_SETTINGS)) {
            merged[key] = { ...DEFAULT_SETTINGS[key], ...(imported.settings[key] || {}) };
          }
          replaceSettings(merged);
          notifySaved('Settings imported');
        } catch {
          alert('Invalid settings file. Please check the file and try again.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [replaceSettings, notifySaved]);

  const exportAllData = useCallback(() => {
    const dump = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key.startsWith('lithium:')) dump[key] = localStorage.getItem(key);
    }
    const json = JSON.stringify(dump, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lithium-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    registerSavedFile(anchor.download, json);
  }, []);

  const [zipBusy, setZipBusy] = useState(false);

  const exportFullZip = useCallback(async () => {
    setZipBusy(true);
    try {
      const { getTree } = await import('../../lib/storage/unifiedStore');
      const tree = getTree();
      const blob = await createBackupZip(tree);
      const name = `lithium-full-backup-${Date.now()}.zip`;
      downloadZipBlob(blob, name);
    } catch { /* user can retry */ }
    setZipBusy(false);
  }, []);

  const importFullZip = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!window.confirm('Restore from this ZIP backup? Current files and settings will be replaced.')) return;
      setZipBusy(true);
      try {
        cancelStorageSaves();
        const result = await restoreBackupZip(file, { replace: true });
        const { setTree } = await import('../../lib/storage/unifiedStore');
        setTree(result.tree);
        window.location.reload();
      } catch {
        alert('Failed to restore from ZIP backup.');
      }
      setZipBusy(false);
    };
    input.click();
  }, []);

  const deleteAllData = useCallback(() => {
    if (!window.confirm('Delete ALL Lithium data? This cannot be undone.')) return;
    cancelStorageSaves();
    Object.keys(localStorage)
      .filter(key => key.startsWith('lithium:'))
      .forEach(key => localStorage.removeItem(key));
    window.location.reload();
  }, []);

  // Build the full section list: built-ins with extension pages injected
  // before the 'about' entry, plus the 'extensions' management section.
  const allSections = useMemo(() => {
    const extSections = extPages.map(p => ({
      id: `ext:${p.extId}:${p.id}`,
      title: p.title,
      icon: p.icon,
      keywords: ['extension', ...p.keywords],
      _extPage: p,
    }));
    const appSections = appPages.map(p => ({
      id: `app:${p.appId}:${p.id}`,
      title: p.title,
      icon: p.icon,
      keywords: ['app', ...p.keywords],
      _appPage: p,
    }));
    const injectAt = SECTIONS.findIndex(s => s.id === 'about');
    if (injectAt < 0) return [...SECTIONS, ...extSections, ...appSections];
    return [...SECTIONS.slice(0, injectAt), ...extSections, ...appSections, ...SECTIONS.slice(injectAt)];
  }, [extPages, appPages]);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return allSections;
    const query = searchQuery.toLowerCase();
    return allSections.filter(s => s.title.toLowerCase().includes(query) || s.keywords?.some(k => k.includes(query)));
  }, [allSections, searchQuery]);

  const currentSection = filteredSections.find(s => s.id === activeSection) || filteredSections[0];

  // Auto-select first match when searching
  useEffect(() => {
    if (searchQuery.trim() && filteredSections.length > 0 && !filteredSections.find(s => s.id === activeSection)) {
      setActiveSection(filteredSections[0].id);
    }
  }, [filteredSections, searchQuery, activeSection]);

  const renderSection = () => {
    const fallback = null;
    // Extension-owned pages render through the shared ExtPageRenderer.
    if (currentSection?._extPage) {
      return (
        <ExtPageRenderer
          page={currentSection._extPage}
          settings={settings}
          update={update}
        />
      );
    }
    // App-owned pages render through the shared AppPageRenderer.
    if (currentSection?._appPage) {
      return <AppPageRenderer page={currentSection._appPage} />;
    }
    switch (currentSection?.id) {
      case 'profile': return <Suspense fallback={fallback}><ProfileSection settings={settings} update={update} /></Suspense>;
      case 'appearance': return <Suspense fallback={fallback}><AppearanceSection settings={settings} update={update} /></Suspense>;
      case 'display': return <Suspense fallback={fallback}><DisplaySection settings={settings} update={update} /></Suspense>;
      case 'motion': return <Suspense fallback={fallback}><MotionSection settings={settings} update={update} /></Suspense>;
      case 'background': return <Suspense fallback={fallback}><BackgroundSection settings={settings} update={update} /></Suspense>;
      case 'yuki-customization': return <Suspense fallback={fallback}><YukisCustomizationSection settings={settings} update={update} /></Suspense>;
      case 'power': return <Suspense fallback={fallback}><PowerSection settings={settings} update={update} /></Suspense>;
      case 'notifications': return <Suspense fallback={fallback}><NotificationsSection settings={settings} update={update} /></Suspense>;
      case 'window': return <Suspense fallback={fallback}><WindowSection settings={settings} update={update} /></Suspense>;
      case 'games': return <Suspense fallback={fallback}><GamesSection settings={settings} update={update} /></Suspense>;
      case 'app-settings': return <AppSettingsOverview appPages={appPages} onNavigate={(id) => setActiveSection(id)} />;
      case 'browser': return <Suspense fallback={fallback}><BrowserSection settings={settings} update={update} /></Suspense>;
      case 'security': return <Suspense fallback={fallback}><SecuritySection settings={settings} update={update} /></Suspense>;
      case 'privacy': return <Suspense fallback={fallback}><PrivacySettingsSection settings={settings} update={update} /></Suspense>;
      case 'ai': return <Suspense fallback={fallback}><AiSection settings={settings} update={update} /></Suspense>;
      case 'search-engines': return <Suspense fallback={fallback}><SearchEnginesSection settings={settings} update={update} /></Suspense>;
      case 'data': return <Suspense fallback={fallback}><DataSection exportSettings={exportSettings} importSettings={importSettings} exportAllData={exportAllData} exportFullZip={exportFullZip} importFullZip={importFullZip} zipBusy={zipBusy} deleteAllData={deleteAllData} /></Suspense>;
      case 'filesystem': return <Suspense fallback={fallback}><FileSystemSection /></Suspense>;
      case 'updates': return <Suspense fallback={fallback}><UpdatesSection /></Suspense>;
      case 'extensions': return <Suspense fallback={fallback}><ExtensionsSection /></Suspense>;
      case 'about': return <Suspense fallback={fallback}><AboutSection /></Suspense>;
      default: return null;
    }
  };

  return (
    <div className="settings-page flex h-full min-w-0 flex-col">
      {/* Top bar: search + window controls */}
      <div className="settings-topbar">
        <div className="settings-app-title"><Icon name="Settings" size={17} /><span>Settings</span></div>
        <div className="relative flex-1 max-w-xs settings-search-wrap">
          <Icon name="Search" className="settings-search-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            className="text-input py-1.5 pl-9 text-xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            name="settings-search"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <span className="settings-save-status" role="status" aria-live="polite">{saveNotification}</span>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Shell: sidebar + content */}
      <div className="settings-shell flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="settings-sidebar" aria-label="Settings sections">
          {searchQuery.trim() ? (
            /* Flat list when searching */
            filteredSections.map(section => (
              <button
                key={section.id}
                className={`settings-nav-item ${currentSection?.id === section.id ? 'active' : ''}`}
                type="button"
                title={section.title}
                aria-label={section.title}
                aria-current={currentSection?.id === section.id ? 'page' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-icon">
                  <Icon name={section.icon} className="h-4 w-4" />
                </span>
                <span>{section.title}</span>
              </button>
            ))
          ) : (
            /* Grouped sidebar when not searching */
            SECTION_GROUPS.map(group => (
              <div key={group.label}>
                <div className="settings-sidebar-group-label">{group.label}</div>
                {group.sections.map(section => (
                  <button
                    key={section.id}
                    className={`settings-nav-item ${currentSection?.id === section.id ? 'active' : ''}`}
                    type="button"
                    title={section.title}
                    aria-label={section.title}
                    aria-current={currentSection?.id === section.id ? 'page' : undefined}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span className="settings-nav-icon">
                      <Icon name={section.icon} className="h-4 w-4" />
                    </span>
                    <span>{section.title}</span>
                  </button>
                ))}
              </div>
            ))
          )}
          {filteredSections.length === 0 && (
            <div className="settings-search-empty">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </nav>

        {/* Content */}
        <main className="settings-content">
          <div className="settings-section-header">
            <h2>{currentSection?.title || 'No settings found'}</h2>
            <p>{currentSection ? getSectionDescription(currentSection.id) : 'Try a different search, such as theme, display, or privacy.'}</p>
          </div>
          <div key={currentSection?.id} className="settings-section-body">
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}
