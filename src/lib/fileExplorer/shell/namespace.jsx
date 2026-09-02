/**
 * ShellNamespace — unified API over local tree + cloud drives.
 * Does NOT replace the tree — wraps it. Delegates to localProvider or
 * cloudProvider based on PIDL prefix.
 */
import { isCloudPidl } from './pidl.jsx';
import * as localProvider from '../providers/localProvider.jsx';
import * as cloudProvider from '../providers/cloudProvider.jsx';

const changeListeners = new Set();

function notifyChange(pidl) {
  for (const fn of changeListeners) fn(pidl);
}

export const ShellNamespace = {
  /** Get children of a folder. */
  getChildren(tree, folderPidl, configs) {
    if (isCloudPidl(folderPidl) || (configs && configs.length > 0)) {
      // Cloud path — handled externally by the component
      return [];
    }
    return localProvider.enumerateChildren(tree, folderPidl);
  },

  /** Get a single entry by ID. */
  getItem(tree, pidl) {
    return localProvider.readEntry(tree, pidl);
  },

  /** Create a new folder. */
  createFolder(tree, parentId, name, drive) {
    if (drive) return cloudProvider.createFolder(drive, parentId, name);
    return localProvider.createFolder(tree, parentId, name);
  },

  /** Delete an entry. */
  deleteItem(tree, pidl, drive) {
    if (drive) return cloudProvider.deleteItem(drive, pidl);
    return localProvider.deleteEntry(tree, pidl);
  },

  /** Rename an entry. */
  renameItem(tree, pidl, newName, drive) {
    if (drive) return cloudProvider.renameItem(drive, pidl, newName);
    return localProvider.renameEntry(tree, pidl, newName);
  },

  /** Move an entry to a new parent. */
  moveItem(tree, pidl, destFolderId) {
    return localProvider.moveEntry(tree, pidl, destFolderId);
  },

  /** Copy an entry to a new parent. */
  copyItem(tree, pidl, destFolderId) {
    return localProvider.copyEntry(tree, pidl, destFolderId);
  },

  /** Read file content. */
  readFile(tree, pidl) {
    return localProvider.readFile(tree, pidl);
  },

  /** Get breadcrumbs for a path. */
  getBreadcrumbs(tree, pidl) {
    return localProvider.getBreadcrumbs(tree, pidl);
  },

  /** Get root-level folders. */
  getRoots(tree) {
    return localProvider.enumerateRoots(tree);
  },

  /** Subscribe to change notifications. */
  subscribe(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  /** Notify that data has changed. */
  refresh(pidl) {
    notifyChange(pidl);
  },
};
