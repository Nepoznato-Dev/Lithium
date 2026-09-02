/**
 * Shields state — privacy protection stats and per-site controls.
 * Stats are accumulated per navigation and reset daily.
 */
import { signal, computed } from '@preact/signals';
import * as core from '../../../lib/core';

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
export const siteOverrides = signal({});

/** Computed: total items blocked this session. */
export const totalBlocked = computed(() => {
  const s = globalStats.value;
  return s.adsBlocked + s.trackersBlocked + s.scriptsBlocked;
});

/* ---------- Actions ---------- */

/** Increment stats after a page navigation (simulated blocking). */
export function incrementStats(ads = 0, trackers = 0, https = 0, scripts = 0, data = 0) {
  const result = core.browserStatsIncrementSync(globalStats.value, ads, trackers, https, scripts, data);
  if (result) {
    globalStats.value = result;
  } else {
    // JS fallback
    const s = globalStats.value;
    globalStats.value = {
      ...s,
      adsBlocked: s.adsBlocked + ads,
      trackersBlocked: s.trackersBlocked + trackers,
      httpsUpgrades: s.httpsUpgrades + https,
      scriptsBlocked: s.scriptsBlocked + scripts,
      dataSaved: s.dataSaved + data,
      timeSaved: s.timeSaved + (ads + trackers + scripts) * 50,
    };
  }
}

/** Check and perform daily reset if needed. */
export function checkDailyReset() {
  const result = core.browserStatsDailyResetSync(globalStats.value, Date.now());
  if (result) {
    globalStats.value = result;
  } else {
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
}

/** Toggle shields on/off globally. */
export function toggleShields() {
  shieldsEnabled.value = !shieldsEnabled.value;
}

/** Set per-site override. */
export function setSiteOverride(hostname, override) {
  siteOverrides.value = { ...siteOverrides.value, [hostname]: override };
}

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
