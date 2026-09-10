/**
 * Archive actions: Compress (folders / multi-select) and Extract (archives).
 *
 * Delegates to the ExplorerShell's compress / extract handlers via the
 * `archiveDialog` signal so the existing ZIP/TAR logic is reused.
 */

import { ActionRegistry } from '../ActionRegistry';

const ARCHIVE_RE = /\.(zip|tar\.gz|tgz|gz|7z|bz2)$/i;

/** Check whether an entry is an archive. */
function isArchive(entry) {
  return entry.idb && ARCHIVE_RE.test(entry.name);
}

/* ------------------------------------------------------------------ */
/*  fs.compress — lazy submenu of archive formats                      */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.compress',
  category: 'file',
  label: (entries) => {
    const folders = entries.filter(e => e.type === 'folder');
    if (folders.length > 1) return `Compress ${folders.length} folders`;
    return 'Compress';
  },
  icon: 'PackageOpen',
  group: 'archive',
  order: 40,
  when: (ctx) => {
    if (ctx.drive) return false;
    const hasFolders = ctx.selectedEntries.some(e => e.type === 'folder');
    return hasFolders || ctx.selectedEntries.length > 1;
  },
  children(entries, ctx) {
    const folders = entries.filter(e => e.type === 'folder');
    const targets = folders.length > 0 ? folders : entries;
    const formats = [
      { id: 'zip', label: 'ZIP (.zip)', icon: 'PackageOpen' },
      { id: 'tar', label: 'TAR.GZ (.tar.gz)', icon: 'PackageOpen' },
      { id: 'gzip', label: 'GZip (.gz)', icon: 'Archive' },
      { id: '7z', label: '7-Zip (.7z)', icon: 'Archive' },
      { id: 'bzip2', label: 'BZip2 (.bz2)', icon: 'Archive' },
    ];
    return formats.map(fmt => ({
      id: `compress-${fmt.id}`,
      label: fmt.label,
      icon: fmt.icon,
      action: () => {
        if (ctx.archiveDialog) {
          ctx.archiveDialog.value = { mode: 'compress', entries: targets, format: fmt.id };
        }
      },
    }));
  },
  execute() {
    // Parent — submenu handles execution.
  },
});

/* ------------------------------------------------------------------ */
/*  fs.extract — extract archive(s) into current folder                */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.extract',
  category: 'file',
  label: (entries) => {
    const archives = entries.filter(isArchive);
    if (archives.length > 1) return `Extract ${archives.length} archives`;
    return 'Extract here';
  },
  icon: 'Archive',
  group: 'archive',
  order: 42,
  when: (ctx) => {
    if (ctx.drive) return false;
    return ctx.selectedEntries.some(isArchive);
  },
  execute(entries, ctx) {
    const archives = entries.filter(isArchive);
    if (archives.length === 0) return;
    if (ctx.archiveDialog) {
      ctx.archiveDialog.value = { mode: 'extract', entries: archives };
    }
  },
});

/* ------------------------------------------------------------------ */
/*  fs.download — download IDB-backed file to disk                     */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.download',
  category: 'tools',
  label: 'Download',
  icon: 'ArrowDownToLine',
  group: 'archive',
  order: 44,
  when: (ctx) => {
    if (ctx.drive || ctx.selectedEntries.length !== 1) return false;
    const e = ctx.selectedEntries[0];
    return e.idb && (ARCHIVE_RE.test(e.name) || e.type === 'file');
  },
  async execute(entries, ctx) {
    if (ctx.handleDownload) {
      ctx.handleDownload(entries[0]);
    }
  },
});
