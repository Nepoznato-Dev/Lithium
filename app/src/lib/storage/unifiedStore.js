// Legacy imports removed — all operations now delegate to ramFS.js

/**
 * Unified store — RAM-first persistence for the virtual file system.
 *
 * This module now delegates to ramFS.js which uses TAR+GZip compression
 * and enforces a 10MB RAM budget. The API remains the same for backward
 * compatibility with fileSystem.js and other consumers.
 *
 * Legacy snapshot_codec+LZ4 path has been replaced with TAR+GZip for
 * better compression and simpler architecture.
 */

import { getTree as ramGetTree, setTree as ramSetTree, hydrate as ramHydrate, isHydrated as ramIsHydrated, hasStoredData as ramHasStoredData, getRamUsage, registerSeeder as ramRegisterSeeder } from './ramFS';

export function registerSeeder(fn) {
  ramRegisterSeeder(fn);
}

export function getTree() {
  return ramGetTree();
}

export function isHydrated() {
  return ramIsHydrated();
}

export function hasStoredData() {
  return ramHasStoredData();
}

export function getSnapshotStats() {
  return { ramUsage: getRamUsage(), engine: 'tar+gzip' };
}

export function hydrate() {
  return ramHydrate();
}

export function setTree(next, opts) {
  return ramSetTree(next, opts);
}

export async function persistNow() {
  const { persistNow: ramPersistNow } = await import('./ramFS');
  return ramPersistNow();
}
