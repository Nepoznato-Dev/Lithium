/**
 * File list dispatcher — routes to FileGrid or FileTable based on viewMode.
 * Extracted from renderFiles() in the monolith.
 */
import { nav, viewMode, view, selectedItems, cloudItems, cloudLoading, cloudError, authIssue, draggingId } from '../../state/signals.jsx';
import { childrenOf, getEntry, isTrashed, TRASH_ID } from '../../../fileSystem.js';
import { PROVIDERS } from '../../../cloudDrives.js';
import FileGrid from './FileGrid.jsx';
import FileTable from './FileTable.jsx';
import Icon from '../../../../Components/Icon';

export default function FileList({ tree, drive, items, openItem, onItemContext, onEmptyContext, dragProps, dropTarget, togglePin, pins }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();

  if (view.value !== 'files') return null;

  if (cloudLoading.value) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-3 text-white/40">
        <Icon name="Loader2" size={18} className="animate-spin" /> Loading {drive?.label}…
      </div>
    );
  }

  if (authIssue.value && drive?.id === authIssue.value.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon name="Cloud" size={36} strokeWidth={1.2} style={{ color: PROVIDERS[drive.provider]?.color }} />
        <p className="text-sm font-medium text-white">{drive.label} sign-in expired</p>
        <p className="max-w-sm text-xs leading-relaxed text-white/45">
          The access token for this drive was rejected by {PROVIDERS[drive.provider]?.label}. Your local files are unaffected — update the token to keep using the drive, or disconnect it.
        </p>
      </div>
    );
  }

  if (cloudError.value) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
        <p className="text-sm text-red-300">{cloudError.value}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-white/30">
        <Icon name="Folder" size={40} strokeWidth={1} />
        <p className="text-xs">{isInTrash ? 'The Recycle Bin is empty.' : 'This folder is empty'}</p>
        {isInTrash && <p className="max-w-xs text-center text-[11px] text-white/25">Deleted items land here and can be restored to their original location.</p>}
      </div>
    );
  }

  if (viewMode.value === 'grid') {
    return (
      <div className="flex-1 overflow-y-auto p-3" onClick={() => selectedItems.value = new Set()} onContextMenu={onEmptyContext}>
        <FileGrid
          tree={tree} drive={drive} items={items}
          openItem={openItem} onItemContext={onItemContext}
          dragProps={dragProps} dropTarget={dropTarget}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3" onClick={() => selectedItems.value = new Set()} onContextMenu={onEmptyContext}>
      <FileTable
        tree={tree} drive={drive} items={items}
        openItem={openItem} onItemContext={onItemContext}
        dragProps={dragProps} dropTarget={dropTarget}
      />
    </div>
  );
}
