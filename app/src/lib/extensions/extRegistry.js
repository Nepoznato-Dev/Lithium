/**
 * Extension Registry
 *
 * Persists extension state to localStorage: which extensions are installed,
 * whether they are enabled, and which permissions the user has approved.
 *
 * The registry is the authority for trust decisions — an extension only
 * receives the permissions the user has explicitly approved, even if the
 * manifest requests more.
 */

const STORAGE_KEY = 'lithium:extensions-registry';

/** Shape: { extensions: [{ id, enabled, approvedPermissions, installedAt }] } */

function readRegistry() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { extensions: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.extensions)) return { extensions: [] };
    return parsed;
  } catch {
    return { extensions: [] };
  }
}

function writeRegistry(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('lithium:extensions-changed', { detail: data }));
}

/** Find a single entry by extension id. */
function findEntry(reg, id) {
  return reg.extensions.find(e => e.id === id) || null;
}

/**
 * Get the full registry snapshot.
 * @returns {{ extensions: Array<object> }}
 */
export function getRegistry() {
  return readRegistry();
}

/**
 * Get the registry entry for a single extension.
 * @param {string} id
 * @returns {object|null}
 */
export function getExtensionEntry(id) {
  return findEntry(readRegistry(), id);
}

/**
 * Ensure an extension has a registry entry. Creates a default
 * (disabled, no permissions approved) entry if one does not exist.
 *
 * @param {string} id  Extension id.
 * @returns {object}  The registry entry.
 */
export function ensureEntry(id) {
  const reg = readRegistry();
  let entry = findEntry(reg, id);
  if (!entry) {
    entry = { id, enabled: false, approvedPermissions: [], installedAt: Date.now() };
    reg.extensions.push(entry);
    writeRegistry(reg);
  }
  return entry;
}

/**
 * Enable or disable an extension.
 * @param {string} id
 * @param {boolean} enabled
 */
export function setExtensionEnabled(id, enabled) {
  const reg = readRegistry();
  const entry = findEntry(reg, id);
  if (!entry) {
    const newEntry = { id, enabled: Boolean(enabled), approvedPermissions: [], installedAt: Date.now() };
    reg.extensions.push(newEntry);
  } else {
    entry.enabled = Boolean(enabled);
  }
  writeRegistry(reg);
}

/**
 * Set the approved permissions for an extension.
 * @param {string} id
 * @param {string[]} perms  Array of permission strings.
 */
export function setApprovedPermissions(id, perms) {
  const reg = readRegistry();
  const entry = findEntry(reg, id);
  if (!entry) {
    const newEntry = { id, enabled: true, approvedPermissions: Array.isArray(perms) ? [...perms] : [], installedAt: Date.now() };
    reg.extensions.push(newEntry);
  } else {
    entry.approvedPermissions = Array.isArray(perms) ? [...perms] : [];
  }
  writeRegistry(reg);
}

/**
 * Remove an extension from the registry entirely.
 * @param {string} id
 * @returns {boolean} true if an entry was removed.
 */
export function removeExtension(id) {
  const reg = readRegistry();
  const before = reg.extensions.length;
  reg.extensions = reg.extensions.filter(e => e.id !== id);
  if (reg.extensions.length === before) return false;
  writeRegistry(reg);
  return true;
}

/**
 * Check whether an extension is enabled and has a given permission approved.
 * @param {string} id
 * @param {string} permission
 * @returns {boolean}
 */
export function hasApprovedPermission(id, permission) {
  const entry = findEntry(readRegistry(), id);
  if (!entry || !entry.enabled) return false;
  return Array.isArray(entry.approvedPermissions) && entry.approvedPermissions.includes(permission);
}
