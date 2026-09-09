/**
 * Open / Preview / Run actions for the file-explorer context menu.
 *
 * These actions are visible when the user right-clicks one or more entries.
 * "Open with" builds a lazy submenu from FILE_ASSOCIATIONS.
 */

import { ActionRegistry } from '../ActionRegistry';
import { getDefaultApp, FILE_ASSOCIATIONS, getAppIconInfo } from '../../../fileSystem/fileAssociations.js';

/* ------------------------------------------------------------------ */
/*  fs.open                                                            */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.open',
  category: 'navigation',
  label: 'Open',
  icon: 'Folder',
  shortcut: 'Enter',
  hotkey: 'enter',
  group: 'open',
  order: 10,
  when: (ctx) => ctx.selectedEntries.length === 1,
  enabled: (ctx) => Boolean(ctx.openItem),
  execute(entries, ctx) {
    if (ctx.openItem) ctx.openItem(entries[0]);
  },
});

/* ------------------------------------------------------------------ */
/*  fs.preview — inline image / video preview                         */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.preview',
  category: 'navigation',
  label: 'Preview',
  icon: 'Eye',
  group: 'open',
  order: 12,
  when: (ctx) => {
    if (ctx.drive || ctx.selectedEntries.length !== 1) return false;
    const e = ctx.selectedEntries[0];
    return e.type === 'image' || e.type === 'video';
  },
  execute(entries, ctx) {
    // Delegate to the same handler as "Open" — the explorer's openItem
    // already routes images/videos to the preview pane.
    if (ctx.openItem) ctx.openItem(entries[0]);
  },
});

/* ------------------------------------------------------------------ */
/*  fs.run — execute scripts via Code Studio / terminal                */
/* ------------------------------------------------------------------ */

const RUNNABLE_EXTS = new Set(['.js', '.py', '.sh', '.bash', '.bat', '.ps1', '.rs']);

ActionRegistry.register({
  id: 'fs.run',
  category: 'navigation',
  label: 'Run',
  icon: 'Play',
  group: 'open',
  order: 14,
  when: (ctx) => {
    if (ctx.drive || ctx.selectedEntries.length !== 1) return false;
    const e = ctx.selectedEntries[0];
    if (e.type === 'folder') return false;
    const dot = e.name.lastIndexOf('.');
    if (dot < 0) return false;
    return RUNNABLE_EXTS.has(e.name.slice(dot).toLowerCase());
  },
  execute(entries, ctx) {
    const entry = entries[0];
    window.dispatchEvent(
      new CustomEvent('lithium:launch-app', {
        detail: { appId: 'code-studio', fileEntry: entry },
      }),
    );
  },
});

/* ------------------------------------------------------------------ */
/*  fs.open-with — lazy submenu built from FILE_ASSOCIATIONS           */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.open-with',
  category: 'navigation',
  label: 'Open with',
  icon: 'ExternalLink',
  group: 'open',
  order: 16,
  when: (ctx) => {
    if (ctx.drive || ctx.selectedEntries.length !== 1) return false;
    const e = ctx.selectedEntries[0];
    if (e.type === 'folder') return false;
    // At least one association must match.
    return Object.keys(FILE_ASSOCIATIONS).some(ext =>
      e.name.toLowerCase().endsWith(ext.replace('*', '')),
    );
  },
  children(entries) {
    const entry = entries[0];
    const seen = new Set();
    return Object.entries(FILE_ASSOCIATIONS)
      .filter(([ext]) => entry.name.toLowerCase().endsWith(ext.replace('*', '')))
      .map(([ext, assoc]) => {
        if (seen.has(assoc.appId)) return null;
        seen.add(assoc.appId);
        const info = getAppIconInfo(assoc.appId);
        return {
          id: `ow-${assoc.appId}`,
          label: assoc.label,
          icon: info ? info.icon : 'ExternalLink',
          iconFile: info?.iconFile,
          iconColor: info?.color,
          action: () => {
            window.dispatchEvent(
              new CustomEvent('lithium:launch-app', {
                detail: { appId: assoc.appId, fileEntry: entry },
              }),
            );
          },
        };
      })
      .filter(Boolean);
  },
  execute() {
    // Parent item — submenu handles execution.
  },
});
