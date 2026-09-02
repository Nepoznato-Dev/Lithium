/**
 * Toolbar — nav buttons, view toggles, action buttons.
 * Extracted from the monolith's toolbar section.
 */
import { useRef } from 'react';
import Icon from '../../../../Components/Icon';
import {
  view, nav, viewMode, selectedItems, cloudItems, cloudLoading,
  authIssue, cloudError, draggingId,
} from '../../state/signals.jsx';
import { getEntry, isTrashed, TRASH_ID } from '../../../fileSystem.js';

export default function Toolbar({
  tree, commit, drive, configs, selected,
  canBack, canForward, onBack, onForward,
  handleUpload, handleDelete, handleRestore, handleEmptyTrash,
  openNewFolderDialog, openNewFileDialog, openRenameDialog,
  setStorageOpen, setConnectOpen, refreshCloud, goDrive, updateConfigs, openReconnect,
}) {
  const uploadRef = useRef(null);
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();
  const isInsideTrash = isInTrash || isTrashSubfolder;
  const items = drive ? cloudItems.value : tree.filter(e => e.parentId === folderId);

  return (
    <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
      <button className="icon-btn h-8 w-8" disabled={!canBack} onClick={onBack} aria-label="Back">
        <Icon name="ArrowLeft" size={15} />
      </button>

      {/* Spacer for address bar */}
      <div className="flex-1" />

      <button className={`icon-btn h-8 w-8 ${viewMode.value === 'grid' ? 'acc-text' : ''}`} title="Grid view" onClick={() => viewMode.value = 'grid'}><Icon name="LayoutGrid" size={15} /></button>
      <button className={`icon-btn h-8 w-8 ${viewMode.value === 'list' ? 'acc-text' : ''}`} title="List view" onClick={() => viewMode.value = 'list'}><Icon name="List" size={15} /></button>
      {!isInsideTrash && <div className="mx-1 h-5 w-px bg-white/[0.08]" />}
      {!isInsideTrash && <button className="icon-btn h-8 w-8" title="New folder" onClick={openNewFolderDialog}><Icon name="FolderPlus" size={15} /></button>}
      {!drive && !isInsideTrash && view.value === 'files' && (
        <button className="icon-btn h-8 w-8" title="New text file" onClick={openNewFileDialog}><Icon name="Plus" size={15} /></button>
      )}
      {!isInsideTrash && <button className="icon-btn h-8 w-8" title="Upload file" onClick={() => uploadRef.current?.click()}><Icon name="Upload" size={15} /></button>}
      <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />
      {!isInsideTrash && <button className="icon-btn h-8 w-8" title="Rename" disabled={selectedItems.value.size === 0} onClick={() => {
        const id = [...selectedItems.value][0];
        const entry = tree.find(e => e.id === id);
        if (entry) openRenameDialog(entry);
      }}><Icon name="Pencil" size={14} /></button>}
      {isInsideTrash && <button className="icon-btn h-8 w-8" title="Restore" disabled={selectedItems.value.size === 0} onClick={() => handleRestore()}><Icon name="Undo2" size={14} /></button>}
      {isInsideTrash && <button className="icon-btn h-8 w-8 hover:bg-red-500/15 hover:text-red-300" title="Delete permanently" disabled={selectedItems.value.size === 0} onClick={() => handleDelete()}><Icon name="Trash2" size={14} /></button>}
      {!isInsideTrash && <button className="icon-btn h-8 w-8 hover:bg-red-500/15 hover:text-red-300" title="Delete" disabled={selectedItems.value.size === 0} onClick={() => handleDelete()}><Icon name="Trash2" size={14} /></button>}
      {isInsideTrash && items.length > 0 && (
        <button className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20" title="Permanently delete all items" onClick={handleEmptyTrash}>
          <Icon name="Trash2" size={13} /> Empty
        </button>
      )}
      <button className="icon-btn h-8 w-8" title="Storage manager" onClick={() => setStorageOpen(true)}><Icon name="Database" size={15} /></button>
      <button className="icon-btn h-8 w-8" title="Connect cloud storage" onClick={() => setConnectOpen(true)}><Icon name="Cloud" size={15} /></button>
    </div>
  );
}
