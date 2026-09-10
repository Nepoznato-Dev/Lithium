/**
 * Shortcut manager — registers system-wide keyboard shortcuts for
 * file-explorer actions when the explorer (or desktop) is focused.
 *
 * Usage in ExplorerShell:
 *   import { useExplorerShortcuts } from './shortcutManager';
 *   useExplorerShortcuts({ tree, commit, selectedEntries, ctx });
 */

import { useEffect, useCallback } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { getEntry, isTrashed } from '../../fileSystem.js';

/**
 * Build a normalised key string from a KeyboardEvent.
 * e.g. "ctrl+c", "shift+delete", "f2"
 */
function keyString(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  const key = event.key.toLowerCase();
  // Avoid duplicating modifier keys.
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
    parts.push(key);
  }
  return parts.join('+');
}

/**
 * React hook: listen for keyboard shortcuts and dispatch the matching
 * ActionRegistry action.
 *
 * @param {object} opts
 * @param {object} opts.tree         Current FS tree.
 * @param {Function} opts.commit     Tree commit function.
 * @param {object} opts.selectedItems  Signal<Set<string>> of selected IDs.
 * @param {object} opts.ctx          ActionContext (clipboard, drive, folderId, etc.)
 * @param {boolean} opts.enabled     Whether shortcuts are active (default true).
 */
export function useExplorerShortcuts({ tree, commit, selectedItems, ctx, enabled = true }) {
  const handler = useCallback((event) => {
    // Don't intercept when the user is typing in an input.
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;

    const combo = keyString(event);
    const hotkeys = ActionRegistry.hotkeyMap();
    const actionId = hotkeys.get(combo);
    if (!actionId) return;

    // Resolve selected entries.
    const ids = selectedItems.value;
    const entries = [...ids].map(id => getEntry(tree, id)).filter(Boolean);
    if (entries.length === 0 && actionId !== 'fs.paste') return;

    event.preventDefault();
    event.stopPropagation();

    // Build a minimal context for the action.
    const actionCtx = {
      tree,
      commit,
      selectedEntries: entries,
      selectedItems,
      ...ctx,
    };

    ActionRegistry.execute(actionId, entries, actionCtx);
  }, [tree, commit, selectedItems, ctx]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler, enabled]);
}
