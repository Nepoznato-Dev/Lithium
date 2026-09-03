import { useState, useEffect, useCallback, useMemo } from 'react';
import WinControls from '../../Components/Desktop/WinControls';
import { useSettings } from '../../Components/SettingsContext';
import { BUILD_VERSION, DEFAULT_SETTINGS } from '../../lib/settings';
import { createBackupZip, restoreBackupZip, downloadBlob as downloadZipBlob } from '../../lib/storage/zipArchive';
import { registerSavedFile } from '../../lib/downloads';
import Icon from '../../Components/Icon';

import SecuritySection from './sections/SecuritySection';
import ProfileSection from './sections/ProfileSection';
import AppearanceSection from './sections/AppearanceSection';
import DisplaySection from './sections/DisplaySection';
import MotionSection from './sections/MotionSection';
import BackgroundSection from './sections/BackgroundSection';
import PowerSection from './sections/PowerSection';
import NotificationsSection from './sections/NotificationsSection';
import WindowSection from './sections/WindowSection';
import GamesSection from './sections/GamesSection';
import BrowserSection from './sections/BrowserSection';
import DataSection from './sections/DataSection';
import AboutSection from './sections/AboutSection';

/* ================================================================
   Section definitions
   ================================================================ */

const SECTIONS = [
  { id: 'profile', title: 'Profile', icon: 'User', keywords: ['profile', 'username', 'name', 'account'] },
  { id: 'appearance', title: 'Appearance', icon: 'Palette', keywords: ['theme', 'color', 'accent', 'contrast', 'dark', 'transparency'] },
  { id: 'display', title: 'Display', icon: 'Monitor', keywords: ['display', 'font', 'size', 'brightness', 'blur', 'density', 'scaling'] },
  { id: 'motion', title: 'Motion & Perf', icon: 'Sparkles', keywords: ['animation', 'motion', 'transition', 'performance', 'low end', 'speed'] },
  { id: 'background', title: 'Backgrounds', icon: 'Image', keywords: ['background', 'wallpaper', 'ambient'] },
  { id: 'power', title: 'Power & Battery', icon: 'Battery', keywords: ['battery', 'power', 'energy', 'saver', 'lock', 'auto-lock'] },
  { id: 'notifications', title: 'Notifications', icon: 'Bell', keywords: ['notification', 'toast', 'sound', 'alert'] },
  { id: 'window', title: 'Windows', icon: 'PanelRight', keywords: ['window', 'snap', 'assist', 'drag'] },
  { id: 'games', title: 'Games', icon: 'Gamepad2', keywords: ['games', 'fullscreen', 'esc', 'player'] },
  { id: 'browser', title: 'Browser', icon: 'Globe', keywords: ['browser', 'search', 'engine'] },
  { id: 'security', title: 'Security', icon: 'Shield', keywords: ['security', 'pin', 'lock', 'password'] },
  { id: 'data', title: 'Data & Backup', icon: 'Download', keywords: ['data', 'backup', 'export', 'import', 'delete', 'reset'] },
  { id: 'about', title: 'About', icon: 'Info', keywords: ['about', 'version', 'privacy', 'info'] },
];

function getSectionDescription(id) {
  const descriptions = {
    profile: 'Manage your account name and avatar',
    appearance: 'Customize colors, contrast, and visual style',
    display: 'Adjust text size, brightness, and layout density',
    motion: 'Control animations and performance settings',
    background: 'Configure desktop wallpaper and ambient effects',
    power: 'Battery saver, auto-dim & power management',
    notifications: 'Toast position, duration, and sound preferences',
    window: 'Window snapping, keyboard shortcuts & title bar style',
    games: 'Fullscreen and ESC behavior for the game player',
    browser: 'Search engine and browsing preferences',
    security: 'Lock-screen PIN, auto-lock & security options',
    data: 'Export, import, or delete your settings and data',
    about: 'Version info, features, tech stack & privacy',
  };
  return descriptions[id] || '';
}

/* ================================================================
   Main Page
   ================================================================ */

export default function Settings({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { settings, updateSetting, replaceSettings } = useSettings();
  const [activeSection, setActiveSection] = useState('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveNotification, setSaveNotification] = useState('');

  const update = useCallback((path, value) => {
    updateSetting(path, value);
    setSaveNotification('Saved');
    setTimeout(() => setSaveNotification(''), 1000);
  }, [updateSetting]);

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
          setSaveNotification('Settings imported');
          setTimeout(() => setSaveNotification(''), 1800);
        } catch {
          alert('Invalid settings file. Please check the file and try again.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [replaceSettings]);

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
    Object.keys(localStorage)
      .filter(key => key.startsWith('lithium:'))
      .forEach(key => localStorage.removeItem(key));
    window.location.reload();
  }, []);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const query = searchQuery.toLowerCase();
    return SECTIONS.filter(s => s.title.toLowerCase().includes(query) || s.keywords?.some(k => k.includes(query)));
  }, [searchQuery]);

  const currentSection = filteredSections.find(s => s.id === activeSection) || filteredSections[0];

  // Auto-select first match when searching
  useEffect(() => {
    if (searchQuery.trim() && filteredSections.length > 0 && !filteredSections.find(s => s.id === activeSection)) {
      setActiveSection(filteredSections[0].id);
    }
  }, [filteredSections, searchQuery, activeSection]);

  const renderSection = () => {
    switch (currentSection?.id) {
      case 'profile': return <ProfileSection settings={settings} update={update} />;
      case 'appearance': return <AppearanceSection settings={settings} update={update} />;
      case 'display': return <DisplaySection settings={settings} update={update} />;
      case 'motion': return <MotionSection settings={settings} update={update} />;
      case 'background': return <BackgroundSection settings={settings} update={update} />;
      case 'power': return <PowerSection settings={settings} update={update} />;
      case 'notifications': return <NotificationsSection settings={settings} update={update} />;
      case 'window': return <WindowSection settings={settings} update={update} />;
      case 'games': return <GamesSection settings={settings} update={update} />;
      case 'browser': return <BrowserSection settings={settings} update={update} />;
      case 'security': return <SecuritySection settings={settings} update={update} />;
      case 'data': return <DataSection exportSettings={exportSettings} importSettings={importSettings} exportAllData={exportAllData} exportFullZip={exportFullZip} importFullZip={importFullZip} zipBusy={zipBusy} deleteAllData={deleteAllData} />;
      case 'about': return <AboutSection />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0f1117]">
      {/* Top bar: search + window controls */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="relative flex-1 max-w-xs">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            className="text-input py-1.5 pl-9 text-xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
          />
        </div>
        <span className="hidden font-mono text-[10px] text-white/25 sm:block">{BUILD_VERSION}</span>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Saved toast */}
      {saveNotification && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
          <Icon name="Check" className="h-4 w-4" /> {saveNotification}
        </div>
      )}

      {/* Shell: sidebar + content */}
      <div className="settings-shell flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="settings-sidebar">
          {filteredSections.map(section => (
            <button
              key={section.id}
              className={`settings-nav-item ${currentSection?.id === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings-nav-icon">
                <Icon name={section.icon} className="h-4 w-4" />
              </span>
              <span>{section.title}</span>
            </button>
          ))}
          {filteredSections.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-white/30">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </nav>

        {/* Content */}
        <main className="settings-content">
          <div className="settings-section-header">
            <h2>{currentSection?.title}</h2>
            <p>{getSectionDescription(currentSection?.id)}</p>
          </div>
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
