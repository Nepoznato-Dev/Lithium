/**
 * Empty-space actions: New folder, New text file, Upload, Import archive,
 * View mode submenu, Refresh (cloud drives), Pin to Quick access.
 *
 * These are visible only when the user right-clicks on empty space in the
 * file explorer (scope === 'empty').
 */

import { ActionRegistry } from '../ActionRegistry';
import { childrenOf } from '../../../fileSystem.js';

/* ------------------------------------------------------------------ */
/*  fs.new-folder                                                      */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.new-folder',
  category: 'file',
  label: 'New folder',
  icon: 'FolderPlus',
  group: 'view',
  order: 60,
  when: (ctx) => ctx.scope === 'empty',
  execute(_entries, ctx) {
    if (ctx.dialog) ctx.dialog.value = { mode: 'folder' };
  },
});

/* ------------------------------------------------------------------ */
/*  fs.new-file                                                        */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.new-file',
  category: 'file',
  label: 'New text file',
  icon: 'Plus',
  group: 'view',
  order: 62,
  when: (ctx) => ctx.scope === 'empty' && !ctx.drive,
  execute(_entries, ctx) {
    if (ctx.dialog) ctx.dialog.value = { mode: 'file' };
  },
});

/* ------------------------------------------------------------------ */
/*  fs.upload                                                          */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.upload',
  category: 'file',
  label: 'Upload file\u2026',
  icon: 'Upload',
  group: 'view',
  order: 64,
  when: (ctx) => ctx.scope === 'empty',
  execute(_entries, ctx) {
    // The ExplorerShell wires a hidden <input type="file"> ref.
    // We dispatch a custom event so the shell can click it.
    window.dispatchEvent(new CustomEvent('lithium:explorer-upload'));
  },
});

/* ------------------------------------------------------------------ */
/*  fs.import-archive                                                  */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.import-archive',
  category: 'file',
  label: 'Import archive\u2026',
  icon: 'FolderPlus',
  group: 'view',
  order: 66,
  when: (ctx) => ctx.scope === 'empty' && !ctx.drive,
  execute(_entries, ctx) {
    if (ctx.handleImportArchive) ctx.handleImportArchive();
  },
});

/* ------------------------------------------------------------------ */
/*  fs.refresh — cloud drive refresh                                   */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.refresh',
  category: 'navigation',
  label: 'Refresh',
  icon: 'RefreshCw',
  group: 'view',
  order: 68,
  when: (ctx) => ctx.scope === 'empty' && Boolean(ctx.drive),
  execute(_entries, ctx) {
    if (ctx.refreshCloud) ctx.refreshCloud(ctx.drive, ctx.folderId);
  },
});

/* ------------------------------------------------------------------ */
/*  fs.view-mode — lazy submenu for grid / list toggle                 */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.view-mode',
  category: 'navigation',
  label: 'View',
  icon: 'LayoutGrid',
  group: 'view',
  order: 70,
  when: (ctx) => ctx.scope === 'empty',
  children(_entries, ctx) {
    return [
      {
        id: 'view-grid',
        label: 'Large icons',
        icon: 'LayoutGrid',
        checked: ctx.viewMode?.value === 'grid',
        action: () => { if (ctx.viewMode) ctx.viewMode.value = 'grid'; },
      },
      {
        id: 'view-list',
        label: 'Details',
        icon: 'List',
        checked: ctx.viewMode?.value === 'list',
        action: () => { if (ctx.viewMode) ctx.viewMode.value = 'list'; },
      },
    ];
  },
  execute() {
    // Parent — submenu handles execution.
  },
});

/* ------------------------------------------------------------------ */
/*  fs.pin — toggle Quick-access pin for a folder                      */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.pin',
  category: 'file',
  label: (entries, ctx) => {
    if (entries.length !== 1) return 'Add to Quick access';
    return (ctx.pins?.value ?? ctx.pins)?.includes(entries[0].id)
      ? 'Remove from Quick access'
      : 'Add to Quick access';
  },
  icon: 'Pin',
  group: 'organize',
  order: 40,
  when: (ctx) => {
    if (ctx.drive) return false;
    if (ctx.scope === 'empty') return false;
    // Only for folders.
    return ctx.selectedEntries.length === 1 && ctx.selectedEntries[0].type === 'folder';
  },
  execute(entries, ctx) {
    if (!ctx.togglePin || entries.length !== 1) return;
    ctx.togglePin(entries[0].id);
  },
});
