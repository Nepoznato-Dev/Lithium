/**
 * Status bar — item count, selection info, drive label.
 */
import { selectedItems, view, nav, cloudItems } from '../../state/signals.jsx';
import { childrenOf, trashedItems, getEntry, TRASH_ID } from '../../../fileSystem.js';

export default function StatusBar({ tree, drive, items }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && entry.parentId === TRASH_ID;
  })();

  const selectedCount = selectedItems.value.size;
  const selectedEntry = selectedCount === 1 ? tree.find(e => selectedItems.value.has(e.id)) : null;
  const itemCount = view.value === 'files'
    ? (drive ? cloudItems.value.length : items?.length || 0)
    : view.value === 'gallery'
      ? tree.filter(e => e.type === 'image').length
      : tree.filter(e => e.type !== 'folder').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12).length;

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
    <div className="border-t border-white/[0.06] px-4 py-1.5 text-[11px] text-white/40">
      {viewLabel}
      {selectedEntry ? ` · 1 selected (${selectedEntry.name})` : selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
      {driveLabel}
    </div>
  );
}
