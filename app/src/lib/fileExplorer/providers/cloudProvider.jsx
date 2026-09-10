/**
 * Cloud provider — wraps cloudDrives.js API calls.
 * All operations are async (network I/O).
 */
import {
  listChildren, createFolder as cloudCreateFolder,
  deleteItem as cloudDelete, renameItem as cloudRename,
  downloadBlob, uploadFile,
} from '../../cloudDrives.js';

/** List children of a cloud folder. */
export async function enumerateChildren(config, folderId) {
  return await listChildren(config, folderId);
}

/** Create a folder on a cloud drive. */
export async function createFolder(config, parentId, name) {
  return await cloudCreateFolder(config, parentId, name);
}

/** Delete an item from a cloud drive. */
export async function deleteItem(config, pidl) {
  return await cloudDelete(config, pidl);
}

/** Rename an item on a cloud drive. */
export async function renameItem(config, pidl, name) {
  return await cloudRename(config, pidl, name);
}

/** Download a blob from a cloud drive. */
export async function downloadBlobFromDrive(config, entry) {
  return await downloadBlob(config, entry);
}

/** Upload a file to a cloud drive folder. */
export async function uploadFileToDrive(config, parentId, file) {
  return await uploadFile(config, parentId, file);
}
