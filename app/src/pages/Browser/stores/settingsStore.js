/**
 * Browser-specific settings — theme, UI toggles, search engine, shields defaults.
 * These are scoped to the browser component and stored separately from global Lithium settings.
 */
import { signal } from '@preact/signals';

const DEFAULT_BROWSER_SETTINGS = {
  theme: 'dark',           // 'dark' | 'light' | 'system'
  showBookmarksBar: true,
  showTopSites: true,
  showStats: true,
  showSearchWidget: true,
  showClock: false,
  showStatusBar: false,
  backgroundRotation: true,
  backgroundInterval: 60,  // seconds
  defaultSearchEngine: 'brave',
  shieldsDefaults: {
    blockAds: true,
    blockTrackers: true,
    upgradeHttps: true,
    blockFingerprinting: true,
    blockCookies: 'third-party',
    blockScripts: false,
  },
  downloadPath: '',
  askBeforeDownload: true,
  fontSize: 13,
  zoomLevel: 100,
  hardwareAcceleration: true,
};

/** Browser settings signal. */
export const browserSettings = signal({ ...DEFAULT_BROWSER_SETTINGS });

/* ---------- Actions ---------- */

export function updateBrowserSetting(key, value) {
  browserSettings.value = { ...browserSettings.value, [key]: value };
}

export function updateShieldsDefault(key, value) {
  browserSettings.value = {
    ...browserSettings.value,
    shieldsDefaults: { ...browserSettings.value.shieldsDefaults, [key]: value },
  };
}

export function resetBrowserSettings() {
  browserSettings.value = { ...DEFAULT_BROWSER_SETTINGS };
}

export function loadBrowserSettings(data) {
  if (data) {
    browserSettings.value = { ...DEFAULT_BROWSER_SETTINGS, ...data };
  }
}
