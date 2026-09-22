/**
 * ContextMenuRegistry — central registry for system context menu contributions.
 *
 * Apps (built-in, .li, extensions) register entries that are appended to the
 * desktop context menus.  Users can also set a full override for any scope,
 * completely replacing the default menu with custom entries.
 *
 * Scopes:
 *   'desktop'      — right-click on empty desktop area
 *   'taskbar'      — right-click on taskbar empty area
 *   'pinned-app'   — right-click on a pinned taskbar app button
 *   'window'       — right-click on a window titlebar / taskbar button
 *   'file-entry'   — right-click on a file/folder in File Explorer
 *   'file-empty'   — right-click on empty space in File Explorer
 *   'file-multi'   — right-click when multiple items selected
 *
 * Entry shape:
 *   {
 *     id: string,              — unique contribution id (e.g. 'ext:my-ext:action')
 *     scope: string | string[],— which scope(s) this entry appears in
 *     label: string,
 *     icon?: string,           — Lucide icon name
 *     iconFile?: string,       — PNG icon from /icons/
 *     shortcut?: string,       — keyboard shortcut hint text
 *     disabled?: boolean,
 *     danger?: boolean,
 *     checked?: boolean,
 *     order?: number,          — sort weight (lower = earlier, default 50)
 *     group?: string,          — group name for separator insertion
 *     items?: MenuItem[],      — submenu items (static)
 *     action?: string,         — action id dispatched to the contributor on click
 *     source: { type, id },    — { type: 'extension'|'li-app'|'builtin', id: string }
 *   }
 *
 * Override shape:
 *   {
 *     id: string,
 *     scope: string,
 *     builder: (ctx) => MenuItem[],  — function that returns the full menu
 *     source: { type, id },
 *   }
 */

import { storage } from '../storage';

/* ------------------------------------------------------------------ */
/*  Internal stores                                                     */
/* ------------------------------------------------------------------ */

/** @type {Map<string, ContextMenuEntry>} */
const entries = new Map();

/** @type {Map<string, OverrideEntry>} keyed by scope */
const overrides = new Map();

/** Change listeners — called on register/unregister/override. */
const listeners = new Set();

/* ------------------------------------------------------------------ */
/*  Persistence                                                         */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'context-menu-overrides';

/**
 * Load persisted user overrides.  These are serialized item arrays
 * (not live functions) so we store them as static menu templates.
 */
function loadPersistedOverrides() {
  try {
    const data = storage.get(STORAGE_KEY, {});
    for (const [scope, override] of Object.entries(data)) {
      if (override && Array.isArray(override.items)) {
        overrides.set(scope, {
          id: override.id || `user:${scope}`,
          scope,
          items: override.items,
          source: { type: 'user', id: 'user' },
        });
      }
    }
  } catch { /* ignore */ }
}

function persistOverrides() {
  const data = {};
  for (const [scope, override] of overrides.entries()) {
    if (override.source?.type === 'user') {
      data[scope] = { id: override.id, items: override.items };
    }
  }
  storage.set(STORAGE_KEY, data);
}

// Load on module init.
loadPersistedOverrides();

/* ------------------------------------------------------------------ */
/*  Notification                                                        */
/* ------------------------------------------------------------------ */

function notifyChange() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent('lithium:context-menu-registry-changed'));
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export const ContextMenuRegistry = {

  /* -------- Change subscription -------- */

  /**
   * Subscribe to registry changes.
   * @param {Function} fn
   * @returns {Function} unsubscribe
   */
  onChange(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /* -------- Entry registration -------- */

  /**
   * Register (or override) a context menu entry.
   *
   * @param {ContextMenuEntry} descriptor
   */
  register(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn('[ContextMenuRegistry] register() requires a descriptor with an `id`');
      return;
    }
    entries.set(descriptor.id, {
      order: 50,
      group: 'custom',
      ...descriptor,
    });
    notifyChange();
  },

  /**
   * Register multiple entries at once.
   * @param {ContextMenuEntry[]} descriptors
   */
  registerMany(descriptors) {
    if (!Array.isArray(descriptors)) return;
    for (const d of descriptors) {
      if (!d || !d.id) continue;
      entries.set(d.id, { order: 50, group: 'custom', ...d });
    }
    notifyChange();
  },

  /**
   * Remove a previously registered entry.
   * @param {string} id
   */
  unregister(id) {
    if (entries.delete(id)) notifyChange();
  },

  /**
   * Remove all entries from a specific source.
   * @param {string} sourceType  'extension' | 'li-app' | 'builtin'
   * @param {string} sourceId    The extension/app id.
   */
  unregisterAll(sourceType, sourceId) {
    let changed = false;
    for (const [id, entry] of entries) {
      if (entry.source?.type === sourceType && entry.source?.id === sourceId) {
        entries.delete(id);
        changed = true;
      }
    }
    if (changed) notifyChange();
  },

  /**
   * Check whether an entry is registered.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return entries.has(id);
  },

  /**
   * Retrieve a raw entry descriptor.
   * @param {string} id
   * @returns {ContextMenuEntry|undefined}
   */
  get(id) {
    return entries.get(id);
  },

  /**
   * Return all registered entries.
   * @returns {ContextMenuEntry[]}
   */
  all() {
    return [...entries.values()];
  },

  /* -------- Override management -------- */

  /**
   * Set a user override for a scope.  When an override is active,
   * the default menu for that scope is completely replaced by the
   * override's items (or builder output).
   *
   * @param {string} scope
   * @param {object} override  { id, items?, builder?, source }
   */
  setOverride(scope, override) {
    if (!scope) return;
    overrides.set(scope, {
      id: override.id || `override:${scope}`,
      scope,
      items: override.items || null,
      builder: override.builder || null,
      source: override.source || { type: 'user', id: 'user' },
    });
    // Persist user overrides.
    if ((override.source?.type || 'user') === 'user') {
      persistOverrides();
    }
    notifyChange();
  },

  /**
   * Remove the override for a scope, restoring the default menu.
   * @param {string} scope
   */
  removeOverride(scope) {
    if (overrides.delete(scope)) {
      persistOverrides();
      notifyChange();
    }
  },

  /**
   * Get the active override for a scope, if any.
   * @param {string} scope
   * @returns {OverrideEntry|undefined}
   */
  getOverride(scope) {
    return overrides.get(scope);
  },

  /**
   * Check whether a scope has an active override.
   * @param {string} scope
   * @returns {boolean}
   */
  hasOverride(scope) {
    return overrides.has(scope);
  },

  /**
   * Return all active overrides.
   * @returns {OverrideEntry[]}
   */
  allOverrides() {
    return [...overrides.values()];
  },

  /* -------- Menu building -------- */

  /**
   * Build the additional menu items contributed by registered entries
   * for a given scope.  Returns items sorted by group/order with
   * separators between groups.
   *
   * If a user override is active for the scope, returns the override
   * items instead (completely replacing the default).
   *
   * @param {string} scope       The context scope.
   * @param {object} ctx         Context object passed to dynamic labels/actions.
   * @returns {{ items: MenuItem[], isOverride: boolean }}
   */
  buildForScope(scope, ctx) {
    // Check for override first.
    const override = overrides.get(scope);
    if (override) {
      if (typeof override.builder === 'function') {
        try {
          return { items: override.builder(ctx || {}), isOverride: true };
        } catch (err) {
          console.error('[ContextMenuRegistry] Override builder error:', err);
          return { items: [], isOverride: true };
        }
      }
      if (Array.isArray(override.items)) {
        return { items: override.items, isOverride: true };
      }
      return { items: [], isOverride: true };
    }

    // Collect entries matching this scope.
    const matching = [];
    for (const entry of entries.values()) {
      const scopes = Array.isArray(entry.scope) ? entry.scope : [entry.scope];
      if (!scopes.includes(scope)) continue;

      const label = typeof entry.label === 'function' ? entry.label(ctx || {}) : entry.label;
      const icon = typeof entry.icon === 'function' ? entry.icon(ctx || {}) : entry.icon;

      let disabled = entry.disabled || false;
      if (typeof entry.disabled === 'function') {
        try { disabled = entry.disabled(ctx || {}); } catch { disabled = true; }
      }

      const item = {
        id: entry.id,
        label,
        icon: icon || undefined,
        iconFile: entry.iconFile || undefined,
        shortcut: entry.shortcut || undefined,
        disabled,
        danger: entry.danger || false,
        checked: typeof entry.checked === 'function' ? entry.checked(ctx || {}) : entry.checked,
        _group: entry.group,
        _order: entry.order,
        _source: entry.source,
      };

      // Static submenu.
      if (Array.isArray(entry.items) && entry.items.length > 0) {
        item.items = entry.items;
      }

      // Action callback — dispatches an event for the contributor.
      if (entry.action) {
        item.action = disabled ? undefined : () => {
          ContextMenuRegistry.dispatchAction(entry, ctx || {});
        };
      } else if (typeof entry.actionFn === 'function') {
        item.action = disabled ? undefined : () => entry.actionFn(ctx || {});
      }

      matching.push(item);
    }

    // Sort by group order, then by order within group.
    matching.sort((a, b) => {
      if (a._group !== b._group) return (a._group || '').localeCompare(b._group || '');
      return (a._order || 50) - (b._order || 50);
    });

    // Insert separators between groups and strip internal keys.
    const result = [];
    let lastGroup = null;
    for (const item of matching) {
      if (lastGroup !== null && item._group !== lastGroup) {
        result.push({ id: `ctx-sep-${lastGroup}-${item._group}`, type: 'separator' });
      }
      lastGroup = item._group;
      const { _group, _order, _source, ...clean } = item; // eslint-disable-line no-unused-vars
      result.push(clean);
    }

    return { items: result, isOverride: false };
  },

  /* -------- Action dispatch -------- */

  /**
   * Dispatch a context menu action to its contributor.
   * Fires a CustomEvent that the contributor listens for.
   *
   * @param {ContextMenuEntry} entry
   * @param {object} ctx
   */
  dispatchAction(entry, ctx) {
    const actionId = typeof entry.action === 'string' ? entry.action : entry.id;
    const detail = {
      actionId,
      entryId: entry.id,
      source: entry.source,
      context: ctx || {},
    };

    // Extension actions: dispatch as ext-namespaced event.
    if (entry.source?.type === 'extension') {
      window.dispatchEvent(new CustomEvent(`ext:${entry.source.id}:context-menu-action`, { detail }));
    }

    // .li app actions: dispatch for the runtime to forward via postMessage.
    if (entry.source?.type === 'li-app') {
      window.dispatchEvent(new CustomEvent('lithium:context-menu-action', { detail }));
    }

    // Builtin actions: generic event.
    if (entry.source?.type === 'builtin') {
      window.dispatchEvent(new CustomEvent('lithium:context-menu-action', { detail }));
    }
  },

  /* -------- Introspection -------- */

  /**
   * Return all valid scope names.
   * @returns {string[]}
   */
  scopes() {
    return ['desktop', 'taskbar', 'pinned-app', 'window', 'file-entry', 'file-empty', 'file-multi'];
  },

  /**
   * Return all entries for a given scope.
   * @param {string} scope
   * @returns {ContextMenuEntry[]}
   */
  entriesForScope(scope) {
    return [...entries.values()].filter(e => {
      const scopes = Array.isArray(e.scope) ? e.scope : [e.scope];
      return scopes.includes(scope);
    });
  },
};
