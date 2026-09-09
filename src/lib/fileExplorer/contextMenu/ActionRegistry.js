/**
 * ActionRegistry — central, plugin-extensible registry for context-menu actions.
 *
 * Built-in actions register themselves at module load time.  Third-party
 * plugins (or future features) can call `ActionRegistry.register()` to add
 * new entries, or re-register with an existing `id` to override built-ins.
 *
 * Usage:
 *   import { ActionRegistry } from './ActionRegistry';
 *   ActionRegistry.register({ id: 'fs.copy', ... });
 *   const items = ActionRegistry.buildMenu(entries, ctx, scope);
 *   await ActionRegistry.execute('fs.copy', entries, ctx);
 */

/* ------------------------------------------------------------------ */
/*  Internal store                                                     */
/* ------------------------------------------------------------------ */

/** @type {Map<string, ActionDescriptor>} */
const actions = new Map();

/**
 * Canonical group ordering.  Groups not listed here are appended after
 * the known ones in registration order.
 */
const GROUP_ORDER = [
  'open',
  'clipboard',
  'modify',
  'organize',
  'archive',
  'tools',
  'view',
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const ActionRegistry = {
  /* -------- Registration -------- */

  /**
   * Register (or override) an action.
   *
   * @param {ActionDescriptor} descriptor
   */
  register(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn('[ActionRegistry] register() requires a descriptor with an `id`');
      return;
    }
    actions.set(descriptor.id, {
      // Defaults
      category: 'custom',
      when: () => true,
      enabled: () => true,
      danger: false,
      order: 50,
      group: 'tools',
      // Caller overrides
      ...descriptor,
    });
  },

  /**
   * Remove a previously registered action by id.
   * @param {string} id
   */
  unregister(id) {
    actions.delete(id);
  },

  /**
   * Check whether an action is registered.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return actions.has(id);
  },

  /**
   * Retrieve a raw descriptor (for testing / introspection).
   * @param {string} id
   * @returns {ActionDescriptor|undefined}
   */
  get(id) {
    return actions.get(id);
  },

  /**
   * Return all registered descriptors.
   * @returns {ActionDescriptor[]}
   */
  all() {
    return [...actions.values()];
  },

  /* -------- Menu building -------- */

  /**
   * Build a sorted, filtered array of ContextMenu items for the given
   * entries and context.
   *
   * @param {Entry[]}  entries  The selected file-system entries.
   * @param {ActionContext} ctx  Everything an action needs to decide/execute.
   * @param {string}   scope    'entry' | 'empty' | 'multi' — controls which
   *                            actions are visible (e.g. "New folder" only in
   *                            'empty' scope).
   * @returns {MenuItem[]}      Ready-to-render items for <ContextMenu>.
   */
  buildMenu(entries, ctx, scope) {
    const enriched = { ...ctx, selectedEntries: entries, scope };
    const visible = [];

    for (const action of actions.values()) {
      // Scope filtering: 'view' group actions are empty-space only.
      if (action.group === 'view' && scope !== 'empty') continue;
      // Non-view actions should not appear in empty-space scope unless
      // they explicitly opt in via when().
      if (scope === 'empty' && action.group !== 'view') continue;

      // Visibility predicate.
      try {
        if (typeof action.when === 'function' && !action.when(enriched)) continue;
      } catch { continue; }

      // Resolve dynamic label / icon.
      const label = typeof action.label === 'function' ? action.label(entries, enriched) : action.label;
      const icon = typeof action.icon === 'function' ? action.icon(entries, enriched) : action.icon;

      // Resolve enabled state.
      let disabled = false;
      try {
        if (typeof action.enabled === 'function') disabled = !action.enabled(enriched);
      } catch { disabled = true; }

      // Build the menu item.
      const item = {
        id: action.id,
        label,
        icon: icon || undefined,
        shortcut: action.shortcut || undefined,
        disabled,
        danger: action.danger || false,
        checked: action.checked ? (typeof action.checked === 'function' ? action.checked(enriched) : action.checked) : undefined,
      };

      // Lazy submenu (children is a function — called only when flyout opens).
      if (typeof action.children === 'function') {
        item.items = null; // sentinel — MenuList will call _resolveChildren
        item._actionId = action.id; // so we can look up the builder later
      } else if (Array.isArray(action.items)) {
        item.items = action.items;
      }

      // Action executor.
      item.action = disabled ? undefined : () => {
        ActionRegistry.execute(action.id, entries, enriched);
      };

      // Stash group + order for sorting, then strip before returning.
      item._group = action.group;
      item._order = action.order;
      visible.push(item);
    }

    // Sort: by group rank, then by order within group.
    visible.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a._group);
      const gb = GROUP_ORDER.indexOf(b._group);
      const rankA = ga >= 0 ? ga : GROUP_ORDER.length;
      const rankB = gb >= 0 ? gb : GROUP_ORDER.length;
      if (rankA !== rankB) return rankA - rankB;
      return a._order - b._order;
    });

    // Insert separators between groups and strip internal keys.
    const result = [];
    let lastGroup = null;
    for (const item of visible) {
      if (lastGroup !== null && item._group !== lastGroup) {
        result.push({ id: `sep-${lastGroup}-${item._group}`, type: 'separator' });
      }
      lastGroup = item._group;
      const { _group, _order, _actionId, ...clean } = item;
      // Preserve _actionId for lazy children resolution.
      if (_actionId) clean._actionId = _actionId;
      result.push(clean);
    }

    return result;
  },

  /**
   * Resolve a lazy submenu for a given action id.
   * Called by the ContextMenu's SubFlyout when the user hovers over an item
   * whose `items` was null (lazy sentinel).
   *
   * @param {string} actionId
   * @param {Entry[]} entries
   * @param {ActionContext} ctx
   * @returns {MenuItem[]}
   */
  resolveChildren(actionId, entries, ctx) {
    const action = actions.get(actionId);
    if (!action || typeof action.children !== 'function') return [];
    try {
      return action.children(entries, ctx);
    } catch (err) {
      console.error('[ActionRegistry] resolveChildren error:', err);
      return [];
    }
  },

  /* -------- Execution -------- */

  /**
   * Execute a registered action by id.
   *
   * @param {string} id
   * @param {Entry[]} entries
   * @param {ActionContext} ctx
   * @returns {Promise<void>|void}
   */
  async execute(id, entries, ctx) {
    const action = actions.get(id);
    if (!action) {
      console.warn(`[ActionRegistry] Unknown action: ${id}`);
      return;
    }
    try {
      await action.execute(entries, ctx);
    } catch (err) {
      // If the action itself didn't handle the error, surface it.
      if (ctx && typeof ctx.notify === 'function') {
        ctx.notify({ title: err.message || 'Action failed', tone: 'error' });
      } else {
        console.error(`[ActionRegistry] Action "${id}" threw:`, err);
      }
    }
  },

  /* -------- Hotkey lookup -------- */

  /**
   * Build a Map<hotkeyString, actionId> for all actions that declare a `hotkey`.
   * @returns {Map<string, string>}
   */
  hotkeyMap() {
    const map = new Map();
    for (const action of actions.values()) {
      if (action.hotkey) {
        map.set(action.hotkey.toLowerCase(), action.id);
      }
    }
    return map;
  },
};
