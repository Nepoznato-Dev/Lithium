/**
 * Dynamic .li App Store
 *
 * Manages .li applications that are created at runtime — either by
 * the AI agent or by the user through App Studio.  Unlike static apps
 * (declared in launcher.li and served from disk), dynamic apps live
 * entirely in localStorage: their manifest JSON and HTML source.
 *
 * The discovery pipeline (liLauncher.js) merges these with static
 * apps so the desktop treats them identically.
 */

import { validateManifest } from './liParser';

const STORAGE_KEY = 'lithium:li-dynamic-apps';

/**
 * Read all dynamic apps from localStorage.
 * Returns an array of { manifest, html, createdAt } objects.
 */
export function getDynamicApps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get a single dynamic app by ID.
 */
export function getDynamicApp(id) {
  return getDynamicApps().find(app => app.manifest.id === id) || null;
}

/**
 * Persist the full dynamic apps array to localStorage.
 */
function saveAll(apps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  window.dispatchEvent(new Event('lithium:li-dynamic-apps-changed'));
}

/**
 * Create or update a dynamic app.
 *
 * @param {object} manifest  Raw manifest JSON (will be validated).
 * @param {string} html      The app's HTML entry (srcdoc content).
 * @returns {object}         The validated manifest with _dynamic flag.
 */
export function addDynamicApp(manifest, html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('HTML content must be a non-empty string');
  }
  const validated = validateManifest(manifest);
  const apps = getDynamicApps();
  const existing = apps.findIndex(app => app.manifest.id === validated.id);
  const entry = {
    manifest: validated,
    html,
    createdAt: existing >= 0 ? apps[existing].createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  if (existing >= 0) {
    apps[existing] = entry;
  } else {
    apps.push(entry);
  }
  saveAll(apps);
  return validated;
}

/**
 * Remove a dynamic app by ID.
 * @returns {boolean} true if an app was removed.
 */
export function removeDynamicApp(id) {
  const apps = getDynamicApps();
  const filtered = apps.filter(app => app.manifest.id !== id);
  if (filtered.length === apps.length) return false;
  saveAll(filtered);
  return true;
}

/**
 * Check whether an app ID is a dynamic (runtime-created) app.
 */
export function isDynamicApp(id) {
  return getDynamicApps().some(app => app.manifest.id === id);
}
