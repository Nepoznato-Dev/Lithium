import { storage } from './storage/localStorage';
import { setLowEndMode } from './lowEnd';
import { setIconColor, resolveIconColorSetting, setColorfulMode, setIconColorMap } from './iconRecolor';

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

/**
 * Search engines organized by category.
 * All URLs support the %s placeholder for the search query.
 * Keywords are used for omnibox shortcuts (e.g. "g cats" → Google).
 */
export const SEARCH_ENGINES = {
  // ── General ──
  brave:      { label: 'Brave Search',  url: 'https://search.brave.com/search?q=%s',          keyword: 'br', category: 'general' },
  google:     { label: 'Google',        url: 'https://www.google.com/search?q=%s',            keyword: 'g',  category: 'general' },
  bing:       { label: 'Bing',          url: 'https://www.bing.com/search?q=%s',              keyword: 'b',  category: 'general' },
  duckduckgo: { label: 'DuckDuckGo',    url: 'https://duckduckgo.com/?q=%s',                  keyword: 'dd', category: 'general' },
  ecosia:     { label: 'Ecosia',        url: 'https://www.ecosia.org/search?q=%s',            keyword: 'ec', category: 'general' },
  yahoo:      { label: 'Yahoo',         url: 'https://search.yahoo.com/search?p=%s',          keyword: 'y',  category: 'general' },
  yandex:     { label: 'Yandex',        url: 'https://yandex.com/search/?text=%s',            keyword: 'ya', category: 'general' },
  // ── Privacy ──
  startpage:  { label: 'Startpage',     url: 'https://www.startpage.com/sp/search?query=%s',  keyword: 'sp', category: 'privacy' },
  mojeek:     { label: 'Mojeek',        url: 'https://www.mojeek.com/search?q=%s',            keyword: 'mj', category: 'privacy' },
  qwant:      { label: 'Qwant',         url: 'https://www.qwant.com/?q=%s',                   keyword: 'qw', category: 'privacy' },
  searx:      { label: 'SearX',         url: 'https://searx.be/search?q=%s',                  keyword: 'sx', category: 'privacy' },
  whoogle:    { label: 'Whoogle',       url: 'https://whoogle.io/search?q=%s',                keyword: 'wh', category: 'privacy' },
  // ── Developer ──
  github:     { label: 'GitHub',        url: 'https://github.com/search?q=%s',                keyword: 'gh', category: 'developer' },
  stackoverflow: { label: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s',     keyword: 'so', category: 'developer' },
  npm:        { label: 'NPM',           url: 'https://www.npmjs.com/search?q=%s',             keyword: 'npm', category: 'developer' },
  mdn:        { label: 'MDN Web Docs',  url: 'https://developer.mozilla.org/en-US/search?q=%s', keyword: 'mdn', category: 'developer' },
  crates:     { label: 'crates.io',     url: 'https://crates.io/search?q=%s',                 keyword: 'cr', category: 'developer' },
  archwiki:   { label: 'Arch Wiki',     url: 'https://wiki.archlinux.org/index.php?search=%s', keyword: 'aw', category: 'developer' },
  // ── Academic / Reference ──
  wikipedia:  { label: 'Wikipedia',     url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s', keyword: 'w', category: 'academic' },
  scholar:    { label: 'Google Scholar', url: 'https://scholar.google.com/scholar?q=%s',       keyword: 'gs', category: 'academic' },
  arxiv:      { label: 'arXiv',         url: 'https://arxiv.org/search/?query=%s',            keyword: 'ar', category: 'academic' },
  // ── Media ──
  youtube:    { label: 'YouTube',       url: 'https://www.youtube.com/results?search_query=%s', keyword: 'yt', category: 'media' },
  reddit:     { label: 'Reddit',        url: 'https://www.reddit.com/search/?q=%s',           keyword: 'rd', category: 'media' },
};

/** Category display labels for the UI. */
export const SEARCH_ENGINE_CATEGORIES = {
  general: 'General',
  privacy: 'Privacy-Focused',
  developer: 'Developer',
  academic: 'Academic & Reference',
  media: 'Media & Social',
};

export const DEFAULT_SETTINGS = {
  profile: { username: 'Player' },
  theme: { accent: '#22d3ee', contrast: 'normal', appTint: true, transparency: true, mode: 'dark', iconColor: 'default', iconColors: {}, seasonalMode: 'off', seasonalTheme: 'winter' },
  layout: { density: 'compact' },
  desktop: { iconSize: 'balanced' },
  motion: { animations: 'full' },
  background: { enabled: true, intensity: 0.7 },
  performance: { lowEndMode: false },
  games: { fullscreenOnLaunch: false, escToClose: true, volume: 80, controllerSupport: true, performanceOverlay: false, autoSave: true, notifications: true },
  browser: { searchEngine: 'brave', proxyEnabled: false, proxyUrl: '', scrapeProvider: 'brave', userAgent: '', siteUaOverrides: {}, showBookmarksBar: true, showStatusBar: false, compactTabs: false, blockThirdPartyCookies: true, doNotTrack: true, preventFingerprinting: true, askBeforeDownload: true, fontScale: 100, searchSuggestions: true },
  window: { snapAssist: false, titlebarTranslucent: true },
  display: { fontSize: 14, brightness: 100, glassEffect: 30 },
  power: { batterySaver: false, autoDimOnLow: true, lowBatteryThreshold: 20, stopBackgroundProcesses: true, darkenLightUI: true, solidGlassEffects: true, autoSaverThreshold: 15 },
  security: { autoLockMinutes: 0 },
  notifications: { enabled: true, sound: true, position: 'top-right', duration: 3, dndEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', grouped: true },
  privacy: { shieldLevel: 'standard', gpcEnabled: true, stripTrackingParams: true, cosmeticFilters: true, customRules: [], redirectTrackers: true, blockWebRTC: false, blockCamMic: true, filterLists: ['easylist'] },
  ai: { defaultModel: null, defaultProvider: null, systemPrompt: '', contextPermissions: 'all', memoryEnabled: true },
  profiles: { activeId: 'default', list: [{ id: 'default', name: 'Player', avatar: null }] },
  storage: { maxUploadMB: 500 },
};

/** Deep-merge stored settings over defaults so new fields always exist. */
const _SETTINGS_DEFAULTS = {
  profile: { username: 'Player' },
  theme: { accent: '#22d3ee', contrast: 'normal', appTint: true, transparency: true },
  layout: { density: 'compact' },
  desktop: { iconSize: 'balanced' },
  motion: { animations: 'full' },
  background: { enabled: true, intensity: 0.7 },
  performance: { lowEndMode: false },
  games: { fullscreenOnLaunch: false, escToClose: true, volume: 80, controllerSupport: true, performanceOverlay: false, autoSave: true, notifications: true },
  browser: { searchEngine: 'brave', proxyEnabled: false, proxyUrl: '', scrapeProvider: 'brave', showBookmarksBar: true, showStatusBar: false, compactTabs: false, blockThirdPartyCookies: true, doNotTrack: true, preventFingerprinting: true, askBeforeDownload: true, fontScale: 100, searchSuggestions: true },
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
  power: { batterySaver: false, autoDimOnLow: true, lowBatteryThreshold: 20, stopBackgroundProcesses: true, darkenLightUI: true, solidGlassEffects: true, autoSaverThreshold: 15 },
  security: { autoLockMinutes: 0 },
  notifications: { enabled: true, sound: true, position: 'top-right', duration: 3 },
  privacy: { shieldLevel: 'standard', gpcEnabled: true, stripTrackingParams: true, cosmeticFilters: true, customRules: [], redirectTrackers: true, blockWebRTC: false, blockCamMic: true, filterLists: ['easylist'] },
  storage: { maxUploadMB: 500 },
};

function mergeSettings(defaults, stored) {
  if (Array.isArray(defaults)) return Array.isArray(stored) ? stored : [...defaults];
  if (defaults && typeof defaults === 'object') {
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const result = {};
    for (const key of new Set([...Object.keys(defaults), ...Object.keys(source)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      result[key] = mergeSettings(defaults[key], source[key]);
    }
    return result;
  }
  if (stored === undefined) return defaults;
  if (defaults != null && (typeof stored !== typeof defaults || (typeof stored === 'number' && !Number.isFinite(stored)))) return defaults;
  return stored;
}

export function normalizeSettings(stored) {
  return mergeSettings({ ..._SETTINGS_DEFAULTS, ...DEFAULT_SETTINGS }, stored);
}

export function loadSettings() {
  return normalizeSettings(storage.get('settings', {}));
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

/** Compute the hue-complement of a hex color (rotate 180° in HSL). */
function complementHex(hex) {
  const clean = hex.replace('#', '');
  const n = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return hex; // achromatic — no meaningful complement
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  // Rotate 180°
  h = (h + 0.5) % 1;
  // HSL → hex
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let rr, gg, bb;
  if (s === 0) { rr = gg = bb = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue2rgb(p, q, h + 1/3);
    gg = hue2rgb(p, q, h);
    bb = hue2rgb(p, q, h - 1/3);
  }
  const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

/** Push settings to the DOM: accent variable, complement, density, motion, contrast, tint, transparency, low-end. */
export function applySettings(settings) {
  const root = document.documentElement;
  // Theme mode (dark / light / system)
  const resolved = resolveThemeMode(settings.theme.mode);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.style.setProperty('--accent', settings.theme.accent);
  // Credits ring uses the opposite hue so it never blends with the accent
  root.style.setProperty('--accent-complement', complementHex(settings.theme.accent));

  // Icon color: exact recoloring of silhouette PNG icons (canvas-based, shared
  // via the iconColor signal so every icon surface re-renders on change).
  // In 'colorful' mode there is no global tint — each icon reads its own color
  // from the iconColorMap instead.
  const iconMode = settings.theme.iconColor;
  const isColorful = iconMode === 'colorful';
  setColorfulMode(isColorful);
  setIconColorMap(isColorful ? (settings.theme.iconColors || {}) : {});
  setIconColor(resolveIconColorSetting(iconMode, settings.theme.accent));

  root.dataset.density = settings.layout.density;
  root.dataset.motion = settings.motion.animations;
  root.dataset.contrast = settings.theme.contrast;
  root.dataset.tint = String(settings.theme.appTint !== false);
  root.dataset.transparency = String(settings.theme.transparency !== false);
  // Low-end mode: `setLowEndMode` owns the class *and* notifies the Solid
  // islands, so the CSS tiering and the runtime implementation swap cannot
  // drift apart.
  setLowEndMode(settings.performance.lowEndMode);
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

  // ── Battery Saver ──────────────────────────────────────────────────────
  const saverOn = Boolean(settings.power?.batterySaver);
  root.dataset.batterySaver = String(saverOn);
  if (saverOn) {
    // Force solid glass (no blur) when battery saver is active
    if (settings.power?.solidGlassEffects !== false) {
      root.style.setProperty('--glass-blur', '0px');
      root.style.setProperty('--glass-opacity', '1');
      root.style.setProperty('--glass-bg', 'rgba(15, 15, 20, 0.98)');
    }
    // Cap brightness at 60% in saver mode
    if (settings.power?.autoDimOnLow !== false) {
      const saverBright = Math.min(settings.display?.brightness ?? 100, 60) / 100;
      root.style.setProperty('--display-brightness', String(saverBright));
    }
    // Kill animations
    root.dataset.motion = 'none';
  }

  // ── Seasonal Themes ──────────────────────────────────────────────────
  const seasonalMode = settings.theme?.seasonalMode || 'off';
  if (seasonalMode === 'auto') {
    const month = new Date().getMonth() + 1;
    const season = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
    root.dataset.season = season;
  } else if (seasonalMode === 'manual' && settings.theme?.seasonalTheme) {
    root.dataset.season = settings.theme.seasonalTheme;
  } else {
    root.removeAttribute('data-season');
  }

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
