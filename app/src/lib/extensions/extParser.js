/**
 * Extension Manifest Parser
 *
 * Validates extension.json manifests against the Lithium extension schema.
 * Ensures required fields exist, permission names are recognized, and
 * normalizes optional fields (settingsPages, hooks) to consistent shapes.
 */

/** The set of permission strings an extension may request. */
export const KNOWN_PERMISSIONS = [
  'settings-page',
  'background',
  'theme',
  'apps',
  'events',
  'filesystem',
  'network',
  'notifications',
  'desktop-modify',
  'custom-css',
  'provide-api',
  'context-menu',
];

/** Human-readable descriptions for each permission, used in the approval UI. */
export const PERMISSION_DESCRIPTIONS = {
  'settings-page': 'Add custom pages to Settings',
  'background': 'Change desktop background and wallpaper',
  'theme': 'Modify accent colors, dark/light mode',
  'apps': 'Register and manage desktop apps',
  'events': 'Listen to system events',
  'filesystem': 'Read and write files in the virtual filesystem',
  'network': 'Make network requests through the proxy',
  'notifications': 'Show notifications',
  'desktop-modify': 'Modify desktop icons and layout',
  'custom-css': 'Inject custom CSS into the site',
  'provide-api': 'Expose APIs that .li apps can call (needs per-app approval)',
  'context-menu': 'Add items to system context menus or override them entirely',
};

/**
 * Validate and normalize an extension manifest.
 *
 * @param {object} raw  Parsed JSON from extension.json.
 * @returns {object}    Normalized manifest.
 * @throws {Error}      If a required field is missing or invalid.
 */
export function validateExtManifest(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Extension manifest must be a non-null object');
  }

  const manifest = { ...raw };

  // ── Required fields ────────────────────────────────────────────────
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
    throw new Error('Manifest missing required field: id');
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('Manifest missing required field: name');
  }
  if (typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
    throw new Error('Manifest missing required field: entry');
  }
  if (!Array.isArray(manifest.permissions)) {
    throw new Error('Manifest missing required field: permissions (array)');
  }

  // ── Normalize optional fields ──────────────────────────────────────
  manifest.version = typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  manifest.description = typeof manifest.description === 'string' ? manifest.description : '';
  manifest.author = typeof manifest.author === 'string' ? manifest.author : 'Unknown';
  manifest.icon = typeof manifest.icon === 'string' ? manifest.icon : 'Puzzle';

  // Filter unknown permissions, keep only recognized ones
  manifest.permissions = manifest.permissions.filter(p => {
    if (KNOWN_PERMISSIONS.includes(p)) return true;
    console.warn(`[Extension ${manifest.id}] Unknown permission "${p}" — ignored`);
    return false;
  });

  // Normalize settingsPages entries
  if (Array.isArray(manifest.settingsPages)) {
    manifest.settingsPages = manifest.settingsPages
      .filter(p => p && typeof p.id === 'string' && typeof p.title === 'string')
      .map(p => ({
        id: p.id,
        title: p.title,
        icon: typeof p.icon === 'string' ? p.icon : 'Settings',
        component: typeof p.component === 'string' ? p.component : null,
      }));
  } else {
    manifest.settingsPages = [];
  }

  // Normalize hooks
  if (Array.isArray(manifest.hooks)) {
    manifest.hooks = manifest.hooks.filter(h => typeof h === 'string');
  } else {
    manifest.hooks = [];
  }

  return manifest;
}

/**
 * Fetch and validate an extension manifest by directory name.
 *
 * @param {string} dirName  The folder name under /extensions/.
 * @returns {Promise<object>}  Validated manifest.
 */
export async function loadExtManifest(dirName) {
  const url = `/extensions/${encodeURIComponent(dirName)}/extension.json`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Failed to fetch manifest for "${dirName}": ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Manifest fetch returned ${res.status} for "${dirName}"`);
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Invalid JSON in extension.json for "${dirName}"`);
  }
  const manifest = validateExtManifest(json);
  // Attach source info for the loader
  manifest._sourceDir = dirName;
  manifest._manifestUrl = url;
  return manifest;
}
