import { storage } from './storage/localStorage';

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
  theme: { accent: '#22d3ee', contrast: 'normal', appTint: true, transparency: true, mode: 'dark' },
  layout: { density: 'compact' },
  motion: { animations: 'full' },
  background: { enabled: true, intensity: 0.7 },
  performance: { lowEndMode: false },
  games: { fullscreenOnLaunch: false, escToClose: true },
  browser: { searchEngine: 'brave', proxyEnabled: false, proxyUrl: '', scrapeProvider: 'brave', userAgent: '', siteUaOverrides: {} },
  window: { snapAssist: false, titlebarTranslucent: true },
  display: { fontSize: 14, brightness: 100, glassEffect: 30 },
  power: { batterySaver: false, autoDimOnLow: true, lowBatteryThreshold: 20 },
  security: { autoLockMinutes: 0 },
  notifications: { enabled: true, sound: true, position: 'top-right', duration: 3, dndEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', grouped: true },
  privacy: { shieldLevel: 'standard', gpcEnabled: true, stripTrackingParams: true, cosmeticFilters: true, customRules: [] },
  ai: { defaultModel: null, defaultProvider: null, systemPrompt: '', contextPermissions: 'all', memoryEnabled: true },
  profiles: { activeId: 'default', list: [{ id: 'default', name: 'Player', avatar: null }] },
  storage: { maxUploadMB: 500 },
};

/** Deep-merge stored settings over defaults so new fields always exist. */
const _SETTINGS_DEFAULTS = {
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
  customization: {
    wallpaper: {
      enabled: true,
      type: 'color',
      path: null,
      url: null,
      backgroundColor: '#0f1117',
      gradient: 'linear-gradient(135deg, #0f1117, #1e1b4b)',
      blur: 0,
      brightness: 1,
      contrast: 1,
      opacity: 1,
    },
    cursor: {
      enabled: true,
      type: 'system',
      path: null,
      url: null,
      hotspotX: 0,
      hotspotY: 0,
      size: 32,
      fallback: 'auto',
    },
  },
  power: { batterySaver: false, autoDimOnLow: true, lowBatteryThreshold: 20 },
  security: { autoLockMinutes: 0 },
  notifications: { enabled: true, sound: true, position: 'top-right', duration: 3 },
  storage: { maxUploadMB: 500 },
};

export function loadSettings() {
  const stored = storage.get('settings', {});
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  const merged = {};
  for (const [key, defVal] of Object.entries(DEFAULT_SETTINGS)) {
    if (defVal && typeof defVal === 'object' && !Array.isArray(defVal)) {
      const storedSection = stored[key];
      if (storedSection && typeof storedSection === 'object') {
        merged[key] = { ...defVal };
        for (const [fk, fv] of Object.entries(storedSection)) { merged[key][fk] = fv; }
      } else { merged[key] = { ...defVal }; }
    } else { merged[key] = stored[key] !== undefined ? stored[key] : defVal; }
  }
  return merged;
}

export function saveSettings(settings) {
  storage.set('settings', settings);
}

/** Immutable set at a dotted path, e.g. setAtPath(s, 'theme.accent', '#fff'). */
export function setAtPath(settings, path, value) {
  if (!settings || !path) return settings;
  const keys = path.split('.');
  const result = JSON.parse(JSON.stringify(settings));
  let cur = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') return settings;
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return result;
}

/** Resolve 'system' to the actual OS preference. */
function resolveThemeMode(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode || 'dark';
}

/** Push settings to the DOM: accent variable, density, motion, contrast, tint, transparency, low-end. */
export function applySettings(settings) {
  const root = document.documentElement;
  // Theme mode (dark / light / system)
  const resolved = resolveThemeMode(settings.theme.mode);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
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
    const isLight = resolved === 'light';
    const base = isLight ? '0,0,0' : '255,255,255';
    root.style.setProperty('--text-primary', `rgba(${base},${Math.min(1, textAlpha + 0.2).toFixed(2)})`);
    root.style.setProperty('--text-secondary', `rgba(${base},${Math.min(1, textAlpha).toFixed(2)})`);
    root.style.setProperty('--text-muted', `rgba(${base},${Math.min(0.85, textAlpha - 0.1).toFixed(2)})`);
  }
  // Glass effect: 0 = full blur/frosted, 100 = full glass/clear
  if (settings.display?.glassEffect != null) {
    const g = settings.display.glassEffect / 100;
    const isLight = resolved === 'light';
    const glassBase = isLight ? '255,255,255' : '26,26,26';
    root.style.setProperty('--glass-blur', `${Math.round(30 - g * 25)}px`);
    root.style.setProperty('--glass-opacity', String(0.92 - g * 0.22));
    root.style.setProperty('--glass-bg', `rgba(${glassBase},${(0.92 - g * 0.22).toFixed(2)})`);
  }
  // Window titlebar translucency
  root.dataset.titlebar = String(settings.window?.titlebarTranslucent !== false);

  const cursor = settings.customization?.cursor;
  const cursorSource = cursor?.path || cursor?.url;
  const safeCursorSource = typeof cursorSource === 'string'
    && /^(data:image\/|https?:\/\/)/i.test(cursorSource)
    ? cursorSource
    : null;
  root.dataset.yukiCursor = String(Boolean(cursor?.enabled && cursor?.type === 'custom' && safeCursorSource));
  if (safeCursorSource) {
    root.style.setProperty(
      '--yuki-cursor',
      `url("${safeCursorSource.replaceAll('"', '%22')}") ${cursor.hotspotX || 0} ${cursor.hotspotY || 0}, ${cursor.fallback || 'auto'}`,
    );
    root.style.setProperty('--yuki-cursor-size', `${cursor.size || 32}px`);
  } else {
    root.style.removeProperty('--yuki-cursor');
    root.style.removeProperty('--yuki-cursor-size');
  }
}
