/**
 * .li App Launcher
 *
 * The launcher.li file is the single source of truth for which .li
 * apps exist and what they can do.  The Lithium core never hardcodes
 * individual app IDs — it reads the launcher instead.
 *
 * Each app entry in launcher.li declares:
 *   - enabled:    whether the app is active at all
 *   - permissions: what system APIs the app may access
 *   - capabilities: visibility flags (showInStart, desktopIcon, etc.)
 *
 * This module loads the launcher, validates it, and provides helpers
 * to query app capabilities.
 */

import { loadManifest } from './liParser';
import { getDynamicApps } from './liDynamicApps';

const LAUNCHER_URL = '/li-apps/../launcher.li';
// The Vite middleware serves apps/src/ at /li-apps/, but launcher.li
// lives one level up.  We'll serve it separately via a dedicated path.
const LAUNCHER_PATH = '/li-apps-launcher/launcher.li';

/** Default capability flags applied when the launcher omits them. */
const DEFAULT_CAPABILITIES = {
  showInStart: true,
  desktopIcon: true,
  searchable: true,
};

/**
 * Load and validate the launcher.li file.
 * Returns the parsed launcher config with normalised app entries.
 * Retries on failure so first-load succeeds even when the dev
 * server is still warming up.
 */
export async function loadLauncher() {
  let res;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      res = await fetch(LAUNCHER_PATH);
      if (res.ok) break;
    } catch {
      // Network error — will retry.
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`Failed to load launcher.li: ${res?.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.apps)) {
    throw new Error('launcher.li must contain an "apps" array');
  }
  // Normalise each app entry with default capabilities.
  json.apps = json.apps.map(app => ({
    ...app,
    enabled: app.enabled !== false, // default to true if omitted
    permissions: Array.isArray(app.permissions) ? app.permissions : [],
    capabilities: { ...DEFAULT_CAPABILITIES, ...(app.capabilities || {}) },
  }));
  return json;
}

/**
 * Check whether a specific app is enabled in the launcher.
 */
export function isAppEnabled(launcher, appId) {
  const entry = launcher.apps.find(a => a.id === appId);
  return entry ? entry.enabled !== false : false;
}

/**
 * Get the capability flags for an app from the launcher.
 * Returns default flags if the app isn't declared.
 */
export function getAppCapabilities(launcher, appId) {
  const entry = launcher.apps.find(a => a.id === appId);
  if (!entry) return { ...DEFAULT_CAPABILITIES };
  return { ...DEFAULT_CAPABILITIES, ...(entry.capabilities || {}) };
}

/**
 * Get the permissions granted to an app by the launcher.
 * These override whatever the app's manifest.json requests.
 */
export function getAppPermissions(launcher, appId) {
  const entry = launcher.apps.find(a => a.id === appId);
  return entry ? (entry.permissions || []) : [];
}

/**
 * Discover all .li apps by merging two sources:
 *
 * 1. Static apps — declared in launcher.li and loaded from disk.
 * 2. Dynamic apps — created at runtime (by AI or user) and stored
 *    in localStorage.
 *
 * Returns an array of manifest descriptors, each augmented with
 * _capabilities and _launcherPermissions.
 */
export async function discoverAppsFromLauncher() {
  // --- Static apps from launcher.li ---
  const staticManifests = [];
  try {
    const launcher = await loadLauncher();
    const enabledApps = launcher.apps.filter(app => app.enabled !== false);
    const results = await Promise.allSettled(
      enabledApps.map(app => loadManifest(`/li-apps/${app.id}`)),
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const manifest = r.value;
      const launcherEntry = enabledApps.find(a => a.id === manifest.id);
      manifest._capabilities = launcherEntry
        ? { ...DEFAULT_CAPABILITIES, ...(launcherEntry.capabilities || {}) }
        : { ...DEFAULT_CAPABILITIES };
      manifest._launcherPermissions = launcherEntry?.permissions || [];
      staticManifests.push(manifest);
    }
  } catch {
    // Launcher fetch failure is non-fatal — dynamic apps still load.
  }

  // --- Dynamic apps from localStorage ---
  const dynamicManifests = getDynamicApps().map(entry => {
    const manifest = { ...entry.manifest };
    // Dynamic apps carry their HTML inline — no fetch needed.
    manifest._storedHtml = entry.html;
    manifest._capabilities = { ...DEFAULT_CAPABILITIES };
    manifest._launcherPermissions = manifest.permissions || [];
    manifest._dynamic = true;
    return manifest;
  });

  // Dynamic apps override static ones with the same ID.
  const dynamicIds = new Set(dynamicManifests.map(m => m.id));
  return [
    ...staticManifests.filter(m => !dynamicIds.has(m.id)),
    ...dynamicManifests,
  ];
}
