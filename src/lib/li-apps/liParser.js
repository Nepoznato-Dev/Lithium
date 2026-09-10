/**
 * .li App Manifest Parser
 *
 * Loads, validates, and normalises JSON manifests that describe
 * standalone Lithium (.li) applications.  Manifests live at
 * lithiumApps/src/<app-id>/manifest.json and are served by the
 * Vite dev-server under /li-apps/<app-id>/manifest.json.
 */

const REQUIRED_FIELDS = ['id', 'name', 'entry'];

const DEFAULTS = {
  version: '1.0.0',
  description: '',
  author: '',
  icon: 'AppWindow',
  color: '#6366f1',
  category: 'tools',
  width: 800,
  height: 600,
  permissions: [],
};

const VALID_CATEGORIES = new Set([
  'productivity', 'media', 'tools', 'system',
]);

/**
 * Validate raw manifest JSON and return a normalised descriptor.
 * Throws with a descriptive message when required fields are missing.
 */
export function validateManifest(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('.li manifest must be a JSON object');
  }
  for (const field of REQUIRED_FIELDS) {
    if (typeof json[field] !== 'string' || !json[field].trim()) {
      throw new Error(`.li manifest missing required field: "${field}"`);
    }
  }
  const manifest = { ...DEFAULTS, ...json };
  if (!VALID_CATEGORIES.has(manifest.category)) {
    manifest.category = 'tools';
  }
  manifest.width = Math.max(320, Math.min(2400, Number(manifest.width) || DEFAULTS.width));
  manifest.height = Math.max(240, Math.min(1800, Number(manifest.height) || DEFAULTS.height));
  if (!Array.isArray(manifest.permissions)) manifest.permissions = [];
  return manifest;
}

/**
 * Fetch and parse a manifest from the given app directory path.
 * Includes retry logic so first-load succeeds even when the dev
 * server is still warming up.
 * @param {string} appDir  e.g. "/li-apps/hello-world"
 * @returns {Promise<object>} validated manifest descriptor
 */
export async function loadManifest(appDir) {
  const url = `${appDir.replace(/\/$/, '')}/manifest.json`;
  let res;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      res = await fetch(url);
      if (res.ok) break;
    } catch {
      // Network error — will retry.
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`Failed to load .li manifest: ${url} (${res?.status})`);
  const json = await res.json();
  const manifest = validateManifest(json);
  // Resolve the entry point to an absolute URL relative to the manifest directory.
  const base = url.replace(/manifest\.json$/, '');
  manifest._appDir = appDir;
  manifest._entryUrl = `${base}${manifest.entry}`;
  return manifest;
}
