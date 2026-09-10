/**
 * File operation actions — wraps OperationQueue.
 * Each action enqueues an operation and returns immediately.
 */
import { useCallback } from 'react';
import { operationQueue } from '../shell/operations.jsx';
import { selectedItems, clipboard, dialog } from '../state/signals.jsx';

export function useFileOperations(tree, commit) {
  const copy = useCallback((ids) => {
    const items = ids || [...selectedItems.value];
    if (items.length === 0) return;
    clipboard.value = { op: 'copy', id: items[0] };
  }, []);

  const cut = useCallback((ids) => {
    const items = ids || [...selectedItems.value];
    if (items.length === 0) return;
    clipboard.value = { op: 'cut', id: items[0] };
  }, []);

  const paste = useCallback((destId) => {
    const cb = clipboard.value;
    if (!cb) return;
    const ids = [cb.id];
    if (cb.op === 'copy') {
      operationQueue.execute({ type: 'copy', tree, commit, ids, parentId: destId });
    } else {
      operationQueue.execute({ type: 'move', tree, commit, ids, parentId: destId });
      clipboard.value = null;
    }
  }, [tree, commit]);

  const deleteItems = useCallback((ids, permanent = false) => {
    const items = ids || [...selectedItems.value];
    if (items.length === 0) return;
    operationQueue.execute({
      type: 'delete', tree, commit, ids: items,
      permanent, trashId: 'default-trash',
    });
    selectedItems.value = new Set();
  }, [tree, commit]);

  const rename = useCallback((id, name) => {
    operationQueue.execute({ type: 'rename', tree, commit, id, name });
  }, [tree, commit]);

  const createFolder = useCallback((parentId, name) => {
    operationQueue.execute({ type: 'create', tree, commit, parentId, name, entryType: 'folder' });
  }, [tree, commit]);

  const createFile = useCallback((parentId, name) => {
    operationQueue.execute({ type: 'create', tree, commit, parentId, name, entryType: 'text' });
  }, [tree, commit]);

  const undo = useCallback(() => {
    operationQueue.undo(tree, commit);
  }, [tree, commit]);

  const openRenameDialog = useCallback((entry) => {
    dialog.value = { mode: 'rename', entry };
  }, []);

  const openNewFolderDialog = useCallback(() => {
    dialog.value = { mode: 'folder' };
  }, []);

  const openNewFileDialog = useCallback(() => {
    dialog.value = { mode: 'file' };
  }, []);

  return {
    copy, cut, paste, deleteItems, rename, createFolder, createFile,
    undo, openRenameDialog, openNewFolderDialog, openNewFileDialog,
    canUndo: operationQueue.canUndo(),
  };
}
