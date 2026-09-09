/**
 * Core file-operation actions: Copy, Cut, Paste, Duplicate, Move,
 * Rename, Delete, Delete permanently, Restore.
 *
 * All mutations go through the validation layer (fsValidation.js) and
 * are wrapped with withErrorBoundary so that failures surface as toasts
 * instead of unhandled rejections.
 */

import { ActionRegistry } from '../ActionRegistry';
import {
  childrenOf, getEntry, isTrashed, moveEntry, duplicateSubtreeDeep,
  subtreeFolderIds, trashEntry, restoreEntry, removeEntryDeep,
  updateEntry, TRASH_ID,
} from '../../../fileSystem.js';
import {
  FsError, FsErrorCode, validateMove, validateTrash,
  resolveDuplicateName, withErrorBoundary,
} from '../fsValidation.js';
import { notify } from '../../../../lib/desktop/notify.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Normalise clipboard to always expose an `ids` array. */
function clipboardIds(clip) {
  if (!clip) return [];
  if (Array.isArray(clip.ids)) return clip.ids;
  if (clip.id) return [clip.id];
  return [];
}

const safeNotify = withErrorBoundary(async (fn) => fn(), notify);

/* ------------------------------------------------------------------ */
/*  fs.copy                                                            */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.copy',
  category: 'file',
  label: (entries) => entries.length > 1 ? `Copy ${entries.length} items` : 'Copy',
  icon: 'Copy',
  shortcut: 'Ctrl+C',
  hotkey: 'ctrl+c',
  group: 'clipboard',
  order: 20,
  when: (ctx) => !ctx.drive && !ctx.selectedEntries.some(e => isTrashed(e)),
  execute(entries, ctx) {
    ctx.clipboard.value = { op: 'copy', ids: entries.map(e => e.id) };
  },
});

/* ------------------------------------------------------------------ */
/*  fs.cut                                                             */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.cut',
  category: 'file',
  label: (entries) => entries.length > 1 ? `Cut ${entries.length} items` : 'Cut',
  icon: 'Scissors',
  shortcut: 'Ctrl+X',
  hotkey: 'ctrl+x',
  group: 'clipboard',
  order: 22,
  when: (ctx) => !ctx.drive && !ctx.selectedEntries.some(e => isTrashed(e)),
  execute(entries, ctx) {
    ctx.clipboard.value = { op: 'cut', ids: entries.map(e => e.id) };
  },
});

/* ------------------------------------------------------------------ */
/*  fs.paste                                                           */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.paste',
  category: 'file',
  label: 'Paste',
  icon: 'ClipboardPaste',
  shortcut: 'Ctrl+V',
  hotkey: 'ctrl+v',
  group: 'clipboard',
  order: 24,
  when: (ctx) => ctx.scope === 'empty' && !ctx.drive,
  enabled: (ctx) => {
    const clip = ctx.clipboard.value;
    if (!clip) return false;
    const ids = clipboardIds(clip);
    if (ids.length === 0) return false;
    // Cut: cannot paste into own descendant.
    if (clip.op === 'cut') {
      const subfolders = ids.flatMap(id => subtreeFolderIds(ctx.tree, id));
      if (subfolders.includes(ctx.folderId)) return false;
    }
    // Copy: always ok (will duplicate).  Cut: not into same parent.
    if (clip.op === 'cut' && ids.length === 1) {
      const entry = getEntry(ctx.tree, ids[0]);
      if (entry && entry.parentId === ctx.folderId) return false;
    }
    return true;
  },
  async execute(_entries, ctx) {
    const clip = ctx.clipboard.value;
    if (!clip) return;
    const ids = clipboardIds(clip);
    let next = ctx.tree;

    for (const id of ids) {
      if (clip.op === 'copy') {
        // Duplicate with conflict resolution.
        const entry = getEntry(next, id);
        if (!entry) continue;
        const siblings = childrenOf(next, ctx.folderId);
        const conflict = siblings.find(s => s.name === entry.name && s.id !== id);
        if (conflict) {
          const newName = resolveDuplicateName(entry.name, siblings);
          const suffix = newName.slice(entry.name.lastIndexOf('.') > 0 ? entry.name.lastIndexOf('.') : entry.name.length);
          const n = parseInt(suffix.match(/\d+/)?.[0] || '2', 10);
          next = await duplicateSubtreeDeep(next, id, ctx.folderId, ` (${n})`);
          notify({ title: `Duplicated as "${newName}"`, tone: 'info' });
        } else {
          next = await duplicateSubtreeDeep(next, id, ctx.folderId);
        }
      } else {
        // Cut — move.
        next = moveEntry(next, id, ctx.folderId);
      }
    }

    if (clip.op === 'cut') ctx.clipboard.value = null;
    ctx.commit(next);
  },
});

/* ------------------------------------------------------------------ */
/*  fs.duplicate                                                       */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.duplicate',
  category: 'file',
  label: (entries) => entries.length > 1 ? `Duplicate ${entries.length} items` : 'Duplicate',
  icon: 'Copy',
  shortcut: 'Ctrl+D',
  hotkey: 'ctrl+d',
  group: 'clipboard',
  order: 26,
  when: (ctx) => !ctx.drive && !ctx.selectedEntries.some(e => isTrashed(e)),
  async execute(entries, ctx) {
    let next = ctx.tree;
    for (const entry of entries) {
      const siblings = childrenOf(next, entry.parentId);
      const conflict = siblings.find(s => s.name === entry.name && s.id !== entry.id);
      if (conflict) {
        const newName = resolveDuplicateName(entry.name, siblings);
        const dot = entry.name.lastIndexOf('.');
        const base = dot > 0 ? entry.name.slice(0, dot) : entry.name;
        const ext = dot > 0 ? entry.name.slice(dot) : '';
        const match = newName.match(/\((\d+)\)/);
        const n = match ? match[1] : '2';
        next = await duplicateSubtreeDeep(next, entry.id, entry.parentId, ` (${n})`);
        notify({ title: `Duplicated as "${newName}"`, tone: 'info' });
      } else {
        next = await duplicateSubtreeDeep(next, entry.id, entry.parentId);
      }
    }
    ctx.commit(next);
  },
});

/* ------------------------------------------------------------------ */
/*  fs.rename                                                          */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.rename',
  category: 'file',
  label: 'Rename',
  icon: 'Pencil',
  hotkey: 'f2',
  group: 'modify',
  order: 30,
  when: (ctx) => ctx.selectedEntries.length === 1 && !ctx.selectedEntries[0].system,
  execute(entries, ctx) {
    if (ctx.dialog) ctx.dialog.value = { mode: 'rename', entry: entries[0] };
  },
});

/* ------------------------------------------------------------------ */
/*  fs.move — lazy submenu of root folders                             */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.move',
  category: 'file',
  label: 'Move to',
  icon: 'Folder',
  group: 'modify',
  order: 32,
  when: (ctx) => !ctx.drive && !ctx.selectedEntries.some(e => isTrashed(e) || e.system),
  children(entries, ctx) {
    const roots = childrenOf(ctx.tree, 'root').filter(f => f.type === 'folder');
    // Exclude the current parent of single-selected entries.
    const parentId = entries.length === 1 ? entries[0].parentId : null;
    return roots
      .filter(f => f.id !== parentId && f.id !== TRASH_ID)
      .map(folder => ({
        id: `mv-${folder.id}`,
        label: folder.name,
        icon: 'Folder',
        action: () => {
          let next = ctx.tree;
          for (const entry of entries) {
            try {
              validateMove(next, entry.id, folder.id);
              next = moveEntry(next, entry.id, folder.id);
            } catch (err) {
              if (err instanceof FsError) {
                notify({ title: err.message, tone: 'error' });
              }
            }
          }
          ctx.commit(next);
        },
      }));
  },
  execute() {
    // Parent — submenu handles execution.
  },
});

/* ------------------------------------------------------------------ */
/*  fs.delete — move to trash (or permanent for trashed items)         */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.delete',
  category: 'file',
  label: (entries, ctx) => {
    if (entries.length === 1 && isTrashed(entries[0])) return 'Delete permanently';
    return entries.length > 1 ? `Delete ${entries.length} items` : 'Delete';
  },
  icon: 'Trash2',
  shortcut: 'Del',
  hotkey: 'delete',
  danger: true,
  group: 'modify',
  order: 34,
  when: (ctx) => ctx.selectedEntries.length >= 1,
  async execute(entries, ctx) {
    // If all entries are trashed, permanently delete.
    const allTrashed = entries.every(e => isTrashed(e));
    if (allTrashed) {
      const names = entries.map(e => `"${e.name}"`).join(', ');
      if (!window.confirm(`Permanently delete ${names}? This cannot be undone.`)) return;
      let next = ctx.tree;
      for (const entry of entries) {
        next = await removeEntryDeep(next, entry.id);
      }
      ctx.commit(next);
      if (ctx.selectedItems) ctx.selectedItems.value = new Set();
      return;
    }

    // Normal delete — move to trash.
    let next = ctx.tree;
    for (const entry of entries) {
      try {
        validateTrash(next, entry.id);
        next = trashEntry(next, entry.id);
      } catch (err) {
        if (err instanceof FsError) {
          notify({ title: err.message, tone: 'error' });
        }
      }
    }
    ctx.commit(next);
    if (ctx.selectedItems) ctx.selectedItems.value = new Set();
  },
});

/* ------------------------------------------------------------------ */
/*  fs.delete-permanent — Shift+Delete permanent removal               */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.delete-permanent',
  category: 'file',
  label: (entries) => entries.length > 1
    ? `Permanently delete ${entries.length} items`
    : 'Delete permanently',
  icon: 'Trash2',
  shortcut: 'Shift+Del',
  hotkey: 'shift+delete',
  danger: true,
  group: 'modify',
  order: 36,
  when: (ctx) => ctx.selectedEntries.length >= 1 && !ctx.drive,
  async execute(entries, ctx) {
    const names = entries.map(e => `"${e.name}"`).join(', ');
    if (!window.confirm(`Permanently delete ${names}? This cannot be undone.`)) return;
    let next = ctx.tree;
    for (const entry of entries) {
      next = await removeEntryDeep(next, entry.id);
    }
    ctx.commit(next);
    if (ctx.selectedItems) ctx.selectedItems.value = new Set();
  },
});

/* ------------------------------------------------------------------ */
/*  fs.restore — restore trashed entries                               */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.restore',
  category: 'file',
  label: (entries) => entries.length > 1 ? `Restore ${entries.length} items` : 'Restore',
  icon: 'Undo2',
  group: 'modify',
  order: 38,
  when: (ctx) => ctx.selectedEntries.length >= 1 && ctx.selectedEntries.every(e => isTrashed(e)),
  execute(entries, ctx) {
    let next = ctx.tree;
    for (const entry of entries) {
      next = restoreEntry(next, entry.id);
    }
    ctx.commit(next);
    if (ctx.selectedItems) ctx.selectedItems.value = new Set();
  },
});
