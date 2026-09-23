/**
 * Shields state — privacy protection stats and per-site controls.
 * Stats are accumulated from real ad/tracker blocking via adBlocker.js.
 * Per-site overrides are persisted to localStorage.
 */
import { signal, computed } from '@preact/signals';
import { scanDocument, applyBlocking, classifyUrl, shouldBlock } from '../../../lib/services/adBlocker';

const OVERRIDES_KEY = 'lithium:shields-overrides';
const UA_OVERRIDES_KEY = 'lithium:ua-overrides';

/** Load persisted overrides from localStorage. */
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY)) || {}; } catch { return {}; }
}
function saveOverrides(val) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(val)); } catch { /* quota exceeded */ }
}
function loadUaOverrides() {
  try { return JSON.parse(localStorage.getItem(UA_OVERRIDES_KEY)) || {}; } catch { return {}; }
}
function saveUaOverrides(val) {
  try { localStorage.setItem(UA_OVERRIDES_KEY, JSON.stringify(val)); } catch { /* quota exceeded */ }
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

/**
 * Process a parsed document for real ad/tracker blocking.
 * Scans the document, removes classified elements, and records stats.
 *
 * @param {Document} doc — DOMParser document to scan and clean
 * @param {string} pageUrl — the page URL being rendered
 * @returns {{ ads: number, trackers: number, scripts: number, dataSaved: number }}
 */
export function processDocument(doc, pageUrl) {
  if (!shieldsEnabled.value) return { ads: 0, trackers: 0, scripts: 0, dataSaved: 0 };

  // Check per-site override
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { /* invalid URL */ }
  const siteOverride = pageHost ? getSiteOverride(pageHost) : null;
  if (siteOverride && !siteOverride.enabled) {
    return { ads: 0, trackers: 0, scripts: 0, dataSaved: 0 };
  }

  // Scan the document for classified resources
  const scan = scanDocument(doc, pageUrl);

  // Apply blocking (remove elements from DOM)
  applyBlocking(doc, scan);

  // Record real stats
  const adsCount = scan.ads.length;
  const trackersCount = scan.trackers.length;
  const scriptsCount = scan.ads.filter(el => el.tagName === 'SCRIPT').length
    + scan.trackers.filter(el => el.tagName === 'SCRIPT').length;
  const dataSaved = scan.dataSaved;

  if (adsCount + trackersCount + scan.mining.length + scan.social.length > 0) {
    incrementStats(adsCount, trackersCount, 0, scriptsCount, dataSaved);
  }

  return { ads: adsCount, trackers: trackersCount, scripts: scriptsCount, dataSaved };
}

/**
 * Classify a single URL and return whether it should be blocked.
 * Convenience wrapper around adBlocker.classifyUrl for use in components.
 */
export function classifyResource(url) {
  return classifyUrl(url);
}

/** Quick check: should this URL be blocked? */
export function isBlocked(url) {
  return shouldBlock(url);
}
