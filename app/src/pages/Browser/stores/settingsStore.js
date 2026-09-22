/**
 * Browser-specific settings — synced with global Lithium settings.
 *
 * The signal remains the reactive source for Browser components (Preact),
 * but all reads/writes are bridged to the global settings system so that
 * changing a setting in Lithium Settings also updates the Browser and
 * vice-versa.
 */
import { signal } from '@preact/signals';
import { loadSettings, saveSettings, setAtPath } from '../../../lib/settings';

const SYNC_EVENT = 'lithium:browser-settings-sync';

/** Default values for browser-specific settings (merged into global defaults). */
const BROWSER_DEFAULTS = {
  showBookmarksBar: true,
  showTopSites: true,
  showStats: true,
  showSearchWidget: true,
  showClock: false,
  showStatusBar: false,
  backgroundRotation: true,
  backgroundInterval: 60,
  downloadPath: '',
  hardwareAcceleration: true,
  zoomLevel: 100,
};

/** Browser settings signal — kept in sync with global settings.browser.* */
export const browserSettings = signal({ ...BROWSER_DEFAULTS });

/** Load browser settings from the global settings store. */
export function loadBrowserSettings(data) {
  const global = data || loadSettings();
  const browser = global.browser || {};
  browserSettings.value = {
    ...BROWSER_DEFAULTS,
    ...browser,
    // Map global keys to browser-internal keys
    theme: global.theme?.mode || 'dark',
    searchEngine: browser.searchEngine || 'brave',
    scrapeProvider: browser.scrapeProvider || '',
    shieldsDefaults: {
      blockAds: true,
      blockTrackers: true,
      upgradeHttps: true,
      blockFingerprinting: true,
      blockCookies: 'third-party',
      blockScripts: false,
    },
  };
}

/** Update a browser setting — writes through to global settings. */
export function updateBrowserSetting(key, value) {
  // Update the signal immediately for instant UI feedback
  browserSettings.value = { ...browserSettings.value, [key]: value };

  // Map browser-internal keys to global settings paths
  const keyMap = {
    theme: 'theme.mode',
    searchEngine: 'browser.searchEngine',
    scrapeProvider: 'browser.scrapeProvider',
    showBookmarksBar: 'browser.showBookmarksBar',
    showStatusBar: 'browser.showStatusBar',
    compactTabs: 'browser.compactTabs',
    blockThirdPartyCookies: 'browser.blockThirdPartyCookies',
    doNotTrack: 'browser.doNotTrack',
    preventFingerprinting: 'browser.preventFingerprinting',
    askBeforeDownload: 'browser.askBeforeDownload',
    fontScale: 'browser.fontScale',
    proxyEnabled: 'browser.proxyEnabled',
    hardwareAcceleration: 'browser.hardwareAcceleration',
  };

  const globalPath = keyMap[key];
  if (globalPath) {
    // Write through to global settings
    const global = loadSettings();
    const updated = setAtPath(global, globalPath, value);
    saveSettings(updated);
    // Notify SettingsContext to pick up the change
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { path: globalPath, value } }));
  }
}

/** Update a shields default sub-key. */
export function updateShieldsDefault(key, value) {
  const current = browserSettings.value;
  browserSettings.value = {
    ...current,
    shieldsDefaults: { ...current.shieldsDefaults, [key]: value },
  };
}

/** Reset browser settings to defaults. */
export function resetBrowserSettings() {
  browserSettings.value = { ...BROWSER_DEFAULTS };
}

/** Listen for external global settings changes and refresh the signal. */
export function subscribeToGlobalSettings(handler) {
  window.addEventListener(SYNC_EVENT, handler);
  window.addEventListener('lithium:settings-changed', handler);
  return () => {
    window.removeEventListener(SYNC_EVENT, handler);
    window.removeEventListener('lithium:settings-changed', handler);
  };
}
