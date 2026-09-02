import { storage } from './storage/localStorage';
import * as core from './core';

export const BUILD_VERSION = 'v2.0.0';

export const ACCENT_OPTIONS = [
  { value: '#22d3ee', label: '🔵 Cyan (Default)' },
  { value: '#a78bfa', label: '🟣 Purple' },
  { value: '#34d399', label: '🟢 Green' },
  { value: '#f87171', label: '🔴 Red' },
  { value: '#fb923c', label: '🟠 Orange' },
  { value: '#facc15', label: '🟡 Yellow' },
  { value: '#60a5fa', label: '🔵 Blue' },
  { value: '#f472b6', label: '🟣 Pink' },
];

/** Iframe-friendly search engines used by the built-in browser. */
export const SEARCH_ENGINES = {
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo Lite', url: 'https://lite.duckduckgo.com/lite/?q=' },
  qwant: { label: 'Qwant Lite', url: 'https://lite.qwant.com/?q=' },
  mojeek: { label: 'Mojeek', url: 'https://www.mojeek.com/search?q=' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
};

export const DEFAULT_SETTINGS = {
  profile: { username: 'Player' },
  theme: { accent: '#22d3ee', contrast: 'normal', appTint: true, transparency: true },
  layout: { density: 'compact' },
  motion: { animations: 'full' },
  background: { enabled: true, intensity: 0.7 },
  performance: { lowEndMode: false },
  games: { fullscreenOnLaunch: false, escToClose: true },
  browser: { searchEngine: 'brave', proxyEnabled: false, proxyUrl: '', scrapeProvider: 'brave' },
  window: { snapAssist: false, titlebarTranslucent: true },
  display: { fontSize: 14, brightness: 100, glassEffect: 30 },
  power: { batterySaver: false, autoDimOnLow: true, lowBatteryThreshold: 20 },
  security: { autoLockMinutes: 0 },
  notifications: { enabled: true, sound: true, position: 'top-right', duration: 3 },
};

/** Deep-merge stored settings over defaults so new fields always exist. */
export function loadSettings() {
  const stored = storage.get('settings', {});
  return core.settingsMergeSync(stored) || { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  storage.set('settings', settings);
}

/** Immutable set at a dotted path, e.g. setAtPath(s, 'theme.accent', '#fff'). */
export function setAtPath(settings, path, value) {
  return core.settingsSetAtPathSync(settings, path, value) || settings;
}

/** Push settings to the DOM: accent variable, density, motion, contrast, tint, transparency, low-end. */
export function applySettings(settings) {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.theme.accent);
  root.dataset.density = settings.layout.density;
  root.dataset.motion = settings.motion.animations;
  root.dataset.contrast = settings.theme.contrast;
  root.dataset.tint = String(settings.theme.appTint !== false);
  root.dataset.transparency = String(settings.theme.transparency !== false);
  root.classList.toggle('lithium-low-end', Boolean(settings.performance.lowEndMode));
  // Display settings
  if (settings.display?.fontSize) {
    root.style.setProperty('--base-font-size', `${settings.display.fontSize}px`);
  }
  if (settings.display?.brightness != null) {
    const b = settings.display.brightness / 100;
    root.style.setProperty('--display-brightness', String(b));
    // When UI is darker, boost text lightness for readability
    const textAlpha = b < 0.7 ? 0.55 + (1 - b) * 0.6 : 0.7;
    root.style.setProperty('--text-primary', `rgba(255,255,255,${Math.min(1, textAlpha + 0.2).toFixed(2)})`);
    root.style.setProperty('--text-secondary', `rgba(255,255,255,${Math.min(1, textAlpha).toFixed(2)})`);
    root.style.setProperty('--text-muted', `rgba(255,255,255,${Math.min(0.85, textAlpha - 0.1).toFixed(2)})`);
  }
  // Glass effect: 0 = full blur/frosted, 100 = full glass/clear
  if (settings.display?.glassEffect != null) {
    const g = settings.display.glassEffect / 100;
    root.style.setProperty('--glass-blur', `${Math.round(30 - g * 25)}px`);
    root.style.setProperty('--glass-opacity', String(0.92 - g * 0.22));
    root.style.setProperty('--glass-bg', `rgba(26,26,26,${(0.92 - g * 0.22).toFixed(2)})`);
  }
  // Window titlebar translucency
  root.dataset.titlebar = String(settings.window?.titlebarTranslucent !== false);
}
