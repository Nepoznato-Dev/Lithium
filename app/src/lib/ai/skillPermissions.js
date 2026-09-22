import { storage } from '../storage/localStorage';

/**
 * Skill permission store.
 *
 * Persists the global permission level and per-skill overrides in localStorage.
 * Session choices (from "Always allow" / "Always deny") are kept in memory and
 * cleared when the page reloads.
 *
 * Permission levels:
 *   'auto'  — run immediately without prompting
 *   'ask'   — show the permission dialog before running
 *   'block' — never run; also excluded from the tool list sent to the model
 *
 * Global levels (what the user chooses in Settings):
 *   'ask'   — default: each skill keeps its built-in level, 'ask' prompts
 *   'auto'  — "Auto-approve safe": 'auto' skills run silently, 'ask' still prompts
 *   'full'  — "Full access": everything except 'block' runs silently
 */

const STORAGE_KEY = 'skill-permissions';

const DEFAULTS = {
  global: 'ask',
  overrides: {},
};

// In-memory session state: resets on page reload, which is the correct scope.
const _session = { allowed: [], denied: [] };

// Pending permission prompts: requestId → { resolve, skillId }
const _pending = new Map();

/* ── Store helpers ── */

function _load() {
  return { ...DEFAULTS, ...storage.get(STORAGE_KEY, {}) };
}

function _save(state) {
  storage.set(STORAGE_KEY, state);
  window.dispatchEvent(new CustomEvent('lithium:skill-permissions-changed'));
}

/* ── Public API ── */

/**
 * Resolve the effective permission level for a skill, considering (in priority
 * order): session choices, explicit override, global level, built-in default.
 *
 * @param {string} skillId         — e.g. 'fs.read'
 * @param {string} [builtinDefault] — skill's built-in level from the registry
 * @returns {'auto'|'ask'|'block'}
 */
export function getPermission(skillId, builtinDefault = 'ask') {
  // Session-level choices override everything
  if (_session.allowed.includes(skillId)) return 'auto';
  if (_session.denied.includes(skillId)) return 'block';

  const state = _load();

  // Explicit per-skill override from the Settings UI
  if (state.overrides[skillId]) return state.overrides[skillId];

  // Global "Full access" promotes everything except block-listed skills
  if (state.global === 'full') return builtinDefault === 'block' ? 'block' : 'auto';

  // Global "Auto-approve safe" promotes only skills already marked 'auto'
  if (state.global === 'auto') return builtinDefault;

  // Global 'ask': use the skill's built-in level
  return builtinDefault;
}

/**
 * Whether this skill should appear in the tools list sent to the model.
 * Skills at 'block' level are excluded entirely so the model never sees them.
 *
 * @param {string} skillId
 * @param {string} [builtinDefault]
 * @returns {boolean}
 */
export function isOffered(skillId, builtinDefault = 'ask') {
  return getPermission(skillId, builtinDefault) !== 'block';
}

/**
 * Whether this skill can run immediately without showing the permission dialog.
 *
 * @param {string} skillId
 * @param {string} [builtinDefault]
 * @returns {boolean}
 */
export function isAutoApprove(skillId, builtinDefault = 'ask') {
  return getPermission(skillId, builtinDefault) === 'auto';
}

/**
 * Ask the user to approve a skill call via the PermissionDialog component.
 *
 * Dispatches `lithium:skill-permission-request` — the dialog resolves it by
 * calling `resolvePermissionRequest()`. Resolves `false` after a 5-minute
 * timeout so the tool loop can never hang indefinitely.
 *
 * @param {string} skillId
 * @param {string} skillName     — display name for the dialog
 * @param {string} skillDesc     — description shown in the dialog
 * @param {Object} params        — the arguments the model passed
 * @returns {Promise<boolean>}   — true = approved, false = denied
 */
export function askPermission(skillId, skillName, skillDesc, params) {
  return new Promise(resolve => {
    const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    _pending.set(requestId, { resolve, skillId });

    window.dispatchEvent(new CustomEvent('lithium:skill-permission-request', {
      detail: { requestId, skillId, skillName, skillDesc, params },
    }));

    // Safety timeout so a stale prompt never blocks the loop
    setTimeout(() => {
      if (_pending.has(requestId)) {
        _pending.delete(requestId);
        resolve(false);
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Called by PermissionDialog to resolve a pending request.
 *
 * @param {string}  requestId
 * @param {boolean} allowed   — true = approve, false = deny
 * @param {boolean} [always]  — when true, records the choice for this session
 */
export function resolvePermissionRequest(requestId, allowed, always = false) {
  const entry = _pending.get(requestId);
  if (!entry) return;
  _pending.delete(requestId);

  if (allowed && always) {
    if (!_session.allowed.includes(entry.skillId)) _session.allowed.push(entry.skillId);
  } else if (!allowed && always) {
    if (!_session.denied.includes(entry.skillId)) _session.denied.push(entry.skillId);
  }

  entry.resolve(allowed);
}

/**
 * Set the global permission level.
 * @param {'ask'|'auto'|'full'} level
 */
export function setGlobalLevel(level) {
  const state = _load();
  state.global = level;
  _save(state);
}

/**
 * Set or remove a per-skill permission override.
 * @param {string} skillId
 * @param {'auto'|'ask'|'block'|null} level — null clears the override
 */
export function setOverride(skillId, level) {
  const state = _load();
  if (level === null || level === undefined) {
    delete state.overrides[skillId];
  } else {
    state.overrides[skillId] = level;
  }
  _save(state);
}

/**
 * Read the full permission store for the Settings UI.
 * Includes in-memory session state so the audit view can display it.
 *
 * @returns {{ global: string, overrides: Object, session: { allowed: string[], denied: string[] } }}
 */
export function getPermissionStore() {
  return { ..._load(), session: { allowed: [..._session.allowed], denied: [..._session.denied] } };
}
