/**
 * Storage layer barrel — re-exports the public API from each storage module
 * so consumers can import from '../lib/storage' (or './storage' within lib/).
 */
export { storage } from './localStorage';
export {
  openDB, idbGet, idbPut, idbDelete, idbKeys, idbAll,
  opfsAvailable, opfsRoot, opfsWriteStream, opfsGetFile, opfsDelete, opfsExists,
} from './indexedDB';
export { hydrateKv, kvGet, kvSet, kvOverflowBytes, KV_READY_EVENT } from './kvTier';
export {
  IDB_CAP, CACHE_CAP, LOCAL_CAP, SITE_CACHE_NAME, LEGACY_GAME_CACHE,
  formatBytes, browserEstimate, guessTotalDisk,
  putBlob, getBlob, deleteBlob,
  cacheEntries, cachedAssetCount, cacheUsage, clearSiteCache, storageSnapshot,
} from './manager';
export {
  registerSeeder, getTree, isHydrated, hasStoredData, getSnapshotStats,
  hydrate, setTree, persistNow,
} from './unifiedStore';
export {
  createBackupZip, restoreBackupZip, exportFolderZip, importZipToFolder, downloadBlob as downloadZipBlob,
} from './zipArchive';
export {
  coldArchive, coldRestore, coldRestoreAll, readColdEntry,
  coldStorageUsage, listColdArchives,
} from './coldStorage';
