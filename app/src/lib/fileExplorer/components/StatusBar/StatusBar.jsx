/**
 * Status bar — item count, selection info, drive label.
 */
import { memo, useMemo } from 'react';
import { selectedItems, view, nav, cloudItems } from '../../state/signals.jsx';
import { getEntry, TRASH_ID } from '../../../fileSystem.js';

export default memo(function StatusBar({ tree, drive, items }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && entry.parentId === TRASH_ID;
  })();

  const selectedCount = selectedItems.value.size;

  // Memoize expensive tree lookups — tree.find and tree.filter scan the
  // entire flat array on every render.  Caching by [tree, selectedItems.value]
  // ensures we only recompute when the tree mutates or selection changes.
  const selectedEntry = useMemo(() => {
    if (selectedCount !== 1) return null;
    const id = selectedItems.value.values().next().value;
    return tree.find(e => e.id === id) || null;
  }, [tree, selectedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemCount = useMemo(() => {
    const v = view.value;
    if (v === 'files') return drive ? cloudItems.value.length : items?.length || 0;
    if (v === 'gallery') return tree.reduce((n, e) => n + (e.type === 'image' ? 1 : 0), 0);
    // home — count non-folder entries, capped at 12
    let n = 0;
    for (const e of tree) { if (e.type !== 'folder' && ++n >= 12) break; }
    return n;
  }, [tree, drive, items?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewLabel = view.value === 'files'
    ? `${itemCount} item${itemCount === 1 ? '' : 's'}`
    : view.value === 'gallery'
      ? `${itemCount} pictures`
      : `${itemCount} recent files`;

  const driveLabel = isInTrash
    ? ' · Recycle Bin'
    : isTrashSubfolder
      ? ' · in Recycle Bin'
      : drive
        ? ` · ${drive.label} (${drive.letter}:)`
        : ' · Local Disk (C:)';

  return (
    <div className="border-t border-white/[0.08] px-4 py-2 text-[11px] text-white/45">
      {viewLabel}
      {selectedEntry ? ` · 1 selected (${selectedEntry.name})` : selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
      {driveLabel}
    </div>
  );
});
