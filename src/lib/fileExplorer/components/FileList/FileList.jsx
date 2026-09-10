/**
 * File list dispatcher — routes to FileGrid or FileTable based on viewMode.
 * Extracted from renderFiles() in the monolith.
 */
import { memo } from 'react';
import { nav, viewMode, view, selectedItems, cloudLoading, cloudError, authIssue } from '../../state/signals.jsx';
import { getEntry, isTrashed, TRASH_ID } from '../../../fileSystem.js';
import { PROVIDERS } from '../../../cloudDrives.js';
import FileGrid from './FileGrid.jsx';
import FileTable from './FileTable.jsx';
import { PngIcon } from '../common/PngIcon.jsx';
import { iconUrl } from '../../../iconUrl.js';

export default memo(function FileList({ treeRef, drive, items, openItem, onItemContext, onEmptyContext, dragProps, dropTarget }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(treeRef.current, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();

  if (view.value !== 'files') return null;

  if (cloudLoading.value) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-4 text-white/45">
        <PngIcon name="Loader2" size={18} className="animate-spin" /> Loading {drive?.label}…
      </div>
    );
  }

  if (authIssue.value && drive?.id === authIssue.value.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <PngIcon name="Cloud" size={36} strokeWidth={1.2} style={{ color: PROVIDERS[drive.provider]?.color }} />
        <p className="text-sm font-medium text-white">{drive.label} sign-in expired</p>
        <p className="max-w-sm text-xs leading-relaxed text-white/50">
          The access token for this drive was rejected by {PROVIDERS[drive.provider]?.label}. Your local files are unaffected — update the token to keep using the drive, or disconnect it.
        </p>
      </div>
    );
  }

  if (cloudError.value) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-red-300">{cloudError.value}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-white/35">
        <img src={iconUrl('files')} alt="" style={{ width: 40, height: 40 }} className="object-contain opacity-40" />
        <p className="text-xs">{isInTrash ? 'The Recycle Bin is empty.' : 'This folder is empty'}</p>
        {isInTrash && <p className="max-w-xs text-center text-[11px] text-white/30">Deleted items land here and can be restored to their original location.</p>}
      </div>
    );
  }

  if (viewMode.value === 'grid') {
    return <FileGrid
      treeRef={treeRef} drive={drive} items={items}
      openItem={openItem} onItemContext={onItemContext}
      dragProps={dragProps} dropTarget={dropTarget}
    />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-3" onClick={() => selectedItems.value = new Set()} onContextMenu={onEmptyContext}>
      <FileTable
        treeRef={treeRef} drive={drive} items={items}
        openItem={openItem} onItemContext={onItemContext}
        dragProps={dragProps} dropTarget={dropTarget}
      />
    </div>
  );
});
