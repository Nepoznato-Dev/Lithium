/**
 * PIDL helpers — entry IDs already serve as PIDLs in our system.
 * Provides path resolution and drive identification.
 */
import { pathOf, getEntry } from '../../fileSystem.js';
import { explorerOpSync } from '../../core.js';

/** Check if a PIDL belongs to a cloud drive (starts with 'cloud-'). */
export function isCloudPidl(id) {
  return typeof id === 'string' && id.startsWith('cloud-');
}

/** Extract the drive ID from a PIDL. */
export function pidlToDriveId(id) {
  if (isCloudPidl(id)) {
    // Cloud items have ids like 'cloud-<timestamp>' — the driveId is stored in nav
    return id;
  }
  return 'local';
}

/** Build a display path string for an entry (e.g. "Documents/Notes/file.txt"). */
export function entryIdToPath(tree, id) {
  const path = pathOf(tree, id);
  if (!path || path.length === 0) return '';
  return path.map(p => p.name).join('/');
}

/** Build breadcrumb array from entry ID to root. */
export function entryIdToBreadcrumbs(tree, id) {
  if (!id || id === 'root') return [{ id: 'root', name: 'Local Disk (C:)' }];
  const path = pathOf(tree, id);
  if (!path || path.length === 0) {
    const entry = getEntry(tree, id);
    return entry
      ? [{ id: 'root', name: 'Local Disk (C:)' }, { id: entry.id, name: entry.name }]
      : [{ id: 'root', name: 'Local Disk (C:)' }];
  }
  return [{ id: 'root', name: 'Local Disk (C:)' }, ...path.map(p => ({ id: p.id, name: p.name }))];
}
