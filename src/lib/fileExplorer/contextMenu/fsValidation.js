/**
 * Validation layer for virtual file-system operations.
 *
 * Every context-menu action that mutates the tree should run through these
 * validators *before* calling into fileSystem.js.  Validators throw FsError
 * with a machine-readable `code` so callers can show localised toasts or
 * trigger conflict-resolution UI.
 */

import { canMoveInto, childrenOf, getEntry, usedBytes } from '../../fileSystem.js';

/* ---------- Error type ---------- */

export class FsError extends Error {
  /**
   * @param {string} code   Machine-readable code.
   * @param {string} message Human-readable message (shown in toast).
   * @param {object} [detail] Arbitrary payload for programmatic handling.
   */
  constructor(code, message, detail) {
    super(message);
    this.name = 'FsError';
    this.code = code;
    this.detail = detail || {};
  }
}

/** Error codes used throughout the validation layer. */
export const FsErrorCode = Object.freeze({
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  INSUFFICIENT_STORAGE: 'INSUFFICIENT_STORAGE',
  SYSTEM_PROTECTED: 'SYSTEM_PROTECTED',
  MOVE_INTO_SELF: 'MOVE_INTO_SELF',
  MOVE_INTO_DESCENDANT: 'MOVE_INTO_DESCENDANT',
  BLOB_FAILURE: 'BLOB_FAILURE',
  TRASH_SYSTEM: 'TRASH_SYSTEM',
});

/* ---------- Validators ---------- */

/**
 * Validate that moving `id` into `parentId` is legal.
 * Throws FsError on failure.
 */
export function validateMove(tree, id, parentId) {
  const entry = getEntry(tree, id);
  if (!entry) throw new FsError(FsErrorCode.SYSTEM_PROTECTED, 'Source entry not found', { id });

  // System folders are immovable.
  if (entry.system) {
    throw new FsError(FsErrorCode.SYSTEM_PROTECTED, 'System folders cannot be moved or deleted', { entry });
  }

  // Cannot move into self.
  if (id === parentId) {
    throw new FsError(FsErrorCode.MOVE_INTO_SELF, 'Cannot move a folder into itself');
  }

  // Cannot move a folder into one of its own descendants.
  if (!canMoveInto(tree, id, parentId)) {
    throw new FsError(FsErrorCode.MOVE_INTO_DESCENDANT, 'Cannot move a folder into its own descendant');
  }

  // Duplicate-name check at destination.
  const siblings = childrenOf(tree, parentId);
  const conflict = siblings.find(s => s.name === entry.name && s.id !== entry.id);
  if (conflict) {
    throw new FsError(
      FsErrorCode.DUPLICATE_NAME,
      `"${entry.name}" already exists in the destination`,
      { entry, parentId, conflict },
    );
  }
}

/**
 * Validate creating a new entry with `name` inside `parentId`.
 * Throws FsError on duplicate.
 */
export function validateCreate(tree, parentId, name) {
  if (!name || !name.trim()) {
    throw new FsError(FsErrorCode.DUPLICATE_NAME, 'Name cannot be empty');
  }
  const siblings = childrenOf(tree, parentId);
  if (siblings.some(s => s.name === name)) {
    throw new FsError(FsErrorCode.DUPLICATE_NAME, `"${name}" already exists`, { parentId, name });
  }
}

/**
 * Validate that there is enough storage for `estimatedBytes`.
 * Throws FsError when the quota would be exceeded.
 */
export function validateStorage(tree, estimatedBytes) {
  if (!estimatedBytes || estimatedBytes <= 0) return;
  const used = usedBytes(tree);
  // Approximate 28 GB IndexedDB quota (matches the Lithium storage manager).
  const QUOTA = 28 * 1024 * 1024 * 1024;
  if (used + estimatedBytes > QUOTA) {
    throw new FsError(
      FsErrorCode.INSUFFICIENT_STORAGE,
      'Not enough storage space available',
      { used, estimated: estimatedBytes, quota: QUOTA },
    );
  }
}

/**
 * Validate that an entry is not a protected system entry before trashing.
 */
export function validateTrash(tree, id) {
  const entry = getEntry(tree, id);
  if (!entry) return; // not found — let the caller handle
  if (entry.system) {
    throw new FsError(FsErrorCode.SYSTEM_PROTECTED, 'System items cannot be deleted', { entry });
  }
}

/* ---------- Helpers ---------- */

/**
 * Generate a unique name for `baseName` among `siblings` by appending
 * an incrementing numeric suffix — e.g. "file (2).txt".
 */
export function resolveDuplicateName(baseName, siblings) {
  const dot = baseName.lastIndexOf('.');
  const base = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  const existing = new Set(siblings.map(s => s.name));
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (existing.has(candidate)) {
    candidate = `${base} (${++n})${ext}`;
  }
  return candidate;
}

/**
 * Wrap an async action so that any FsError is caught and turned into a
 * toast notification instead of an unhandled rejection.
 *
 * @param {Function} execute  The async action function.
 * @param {Function} notifyFn The notify() function from lib/desktop/notify.js.
 * @returns {Function} Wrapped function with the same signature.
 */
export function withErrorBoundary(execute, notifyFn) {
  return async (...args) => {
    try {
      return await execute(...args);
    } catch (err) {
      if (err instanceof FsError) {
        notifyFn({ title: err.message, tone: 'error' });
      } else {
        console.error('[ContextMenu]', err);
        notifyFn({ title: 'An unexpected error occurred', tone: 'error' });
      }
    }
  };
}
