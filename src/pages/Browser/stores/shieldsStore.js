/**
 * Shields state — privacy protection stats and per-site controls.
 * Stats are accumulated per navigation and reset daily.
 * Per-site overrides are persisted to localStorage.
 */
import { signal, computed } from '@preact/signals';

const OVERRIDES_KEY = 'lithium:shields-overrides';
const UA_OVERRIDES_KEY = 'lithium:ua-overrides';

/** Load persisted overrides from localStorage. */
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY)) || {}; } catch {
    return {};
  }
}
function saveOverrides(val) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(val)); } catch {
    // Ignore storage failures for site overrides.
  }
}
function loadUaOverrides() {
  try { return JSON.parse(localStorage.getItem(UA_OVERRIDES_KEY)) || {}; } catch {
    return {};
  }
}
function saveUaOverrides(val) {
  try { localStorage.setItem(UA_OVERRIDES_KEY, JSON.stringify(val)); } catch {
    // Ignore storage failures for UA overrides.
  }
}

/** Global shields stats (accumulated across all sites). */
export const globalStats = signal({
  adsBlocked: 0,
  trackersBlocked: 0,
  httpsUpgrades: 0,
  scriptsBlocked: 0,
  dataSaved: 0,
  timeSaved: 0,
  lastReset: Date.now(),
});

/** Whether shields are enabled globally. */
export const shieldsEnabled = signal(true);

/** Per-site shield overrides: Map<hostname, { enabled, blockCookies, blockScripts }>. */
export const siteOverrides = signal(loadOverrides());

/** Computed: total items blocked this session. */
export const totalBlocked = computed(() => {
  const s = globalStats.value;
  return s.adsBlocked + s.trackersBlocked + s.scriptsBlocked;
});

/* ---------- Actions ---------- */

/** Increment stats after a page navigation (simulated blocking). */
export function incrementStats(ads = 0, trackers = 0, https = 0, scripts = 0, data = 0) {
  const s = globalStats.value;
  globalStats.value = {
    adsBlocked: (s.adsBlocked || 0) + ads,
    trackersBlocked: (s.trackersBlocked || 0) + trackers,
    httpsUpgrades: (s.httpsUpgrades || 0) + https,
    scriptsBlocked: (s.scriptsBlocked || 0) + scripts,
    dataSaved: (s.dataSaved || 0) + data,
    timeSaved: (s.timeSaved || 0) + (ads + trackers + scripts) * 50,
  };
}

/** Check and perform daily reset if needed. */
export function checkDailyReset() {
  const msPerDay = 86_400_000;
  const lastDay = Math.floor(globalStats.value.lastReset / msPerDay);
  const nowDay = Math.floor(Date.now() / msPerDay);
  if (lastDay < nowDay) {
    globalStats.value = {
      adsBlocked: 0, trackersBlocked: 0, httpsUpgrades: 0,
      scriptsBlocked: 0, dataSaved: 0, timeSaved: 0, lastReset: Date.now(),
    };
  }
}

/** Toggle shields on/off globally. */
export function toggleShields() {
  shieldsEnabled.value = !shieldsEnabled.value;
}

/** Set per-site override and persist. */
export function setSiteOverride(hostname, override) {
  const next = { ...siteOverrides.value, [hostname]: override };
  siteOverrides.value = next;
  saveOverrides(next);
}

/** Per-site User-Agent overrides: Map<hostname, uaString>. */
export const uaOverrides = signal(loadUaOverrides());

/** Set a per-site UA override. Empty string removes the override. */
export function setUaOverride(hostname, ua) {
  const next = { ...uaOverrides.value };
  if (ua) { next[hostname] = ua; } else { delete next[hostname]; }
  uaOverrides.value = next;
  saveUaOverrides(next);
}

/** Get the UA string for a given hostname (or null for default). */
export function getUaForHost(hostname) {
  return uaOverrides.value[hostname] || null;
}

/** Common UA presets. */
export const UA_PRESETS = {
  default: '',
  chrome_win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  chrome_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  firefox_win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  safari_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mobile_ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  mobile_android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

/** Get per-site override or defaults. */
export function getSiteOverride(hostname) {
  return siteOverrides.value[hostname] || {
    enabled: true,
    blockAds: true,
    blockTrackers: true,
    upgradeHttps: true,
    blockCookies: 'third-party',
    blockScripts: false,
    blockFingerprinting: true,
  };
}

/** Simulate random blocking on navigation. */
export function simulateBlocking() {
  if (!shieldsEnabled.value) return;
  const ads = Math.floor(Math.random() * 8) + 1;
  const trackers = Math.floor(Math.random() * 12) + 2;
  const https = Math.random() > 0.7 ? 1 : 0;
  const scripts = Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 0;
  const data = Math.floor(Math.random() * 50000) + 5000;
  incrementStats(ads, trackers, https, scripts, data);
}
