/**
 * Storage layer barrel — only re-exports symbols actually consumed via
 * the `'../lib/storage'` path.  All other storage sub-modules are imported
 * directly by their consumers so Vite can split them into lazy chunks.
 */
export { storage } from './localStorage';
export { putBlob, getBlob } from './manager';
export { getSnapshotStats } from './unifiedStore';
