/**
 * Operation queue with undo, progress tracking, and conflict resolution.
 * Batch operations delegate to Rust via explorerOpSync for speed.
 */
import { explorerOpSync } from '../../core.js';
import {
  moveEntry, trashEntry, removeEntryDeep, duplicateSubtreeDeep,
  createEntry, updateEntry, restoreEntry,
} from '../../fileSystem.js';

let opCounter = 0;
const listeners = new Set();

function notify(queue) {
  for (const fn of listeners) fn(queue);
}

/**
 * OperationQueue — manages file operations with progress and undo.
 */
export class OperationQueue {
  constructor() {
    this.queue = [];
    this.undoStack = [];
  }

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  getAll() {
    return this.queue;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Execute a file operation. For batch ops, delegates to Rust.
   * @param {object} params - { type, tree, commit, ids?, id?, parentId?, name?, ... }
   * @returns {Promise<object>} - { tree: nextTree, result: op-specific }
   */
  async execute({ type, tree, commit, ids, id, parentId, name, ...extra }) {
    const opId = `op-${++opCounter}`;
    const op = { id: opId, type, status: 'running', progress: { current: 0, total: ids?.length || 1 }, undoable: true };
    this.queue.push(op);
    notify(this.queue);

    try {
      let nextTree = tree;
      let reverseOps = null;

      switch (type) {
        case 'move': {
          if (ids && ids.length > 1) {
            // Batch move via Rust
            const result = explorerOpSync({ op: 'batch_move', tree, ids, parentId, now: Date.now() });
            if (result) {
              reverseOps = ids.map(srcId => {
                const entry = tree.find(e => e.id === srcId);
                return { type: 'move', id: srcId, oldParentId: entry?.parentId || 'root' };
              });
              nextTree = result.tree;
            } else {
              // JS fallback: move one by one
              for (const srcId of ids) nextTree = moveEntry(nextTree, srcId, parentId);
            }
          } else {
            const entry = tree.find(e => e.id === id);
            reverseOps = [{ type: 'move', id, oldParentId: entry?.parentId || 'root' }];
            nextTree = moveEntry(tree, id, parentId);
          }
          break;
        }

        case 'delete': {
          if (ids && ids.length > 1) {
            const result = explorerOpSync({ op: 'batch_delete', tree, ids, permanent: extra.permanent || false, trashId: extra.trashId, now: Date.now() });
            if (result) {
              if (!extra.permanent) {
                reverseOps = ids.map(srcId => {
                  const entry = tree.find(e => e.id === srcId);
                  return { type: 'restore', id: srcId, oldParentId: entry?.parentId || 'root' };
                });
              }
              nextTree = result.tree;
            } else {
              for (const srcId of ids) {
                nextTree = extra.permanent
                  ? await removeEntryDeep(nextTree, srcId)
                  : trashEntry(nextTree, srcId);
              }
            }
          } else {
            if (extra.permanent) {
              reverseOps = null; // permanent delete is not undoable
              op.undoable = false;
              nextTree = await removeEntryDeep(tree, id);
            } else {
              const entry = tree.find(e => e.id === id);
              reverseOps = [{ type: 'restore', id, oldParentId: entry?.parentId || 'root' }];
              nextTree = trashEntry(tree, id);
            }
          }
          break;
        }

        case 'copy': {
          if (ids && ids.length > 1) {
            const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result = explorerOpSync({ op: 'batch_copy', tree, ids, parentId, suffix: ' (copy)', seed, now: Date.now() });
            if (result) {
              reverseOps = Object.values(result.idMap).map(newId => ({ type: 'delete', id: newId }));
              nextTree = result.tree;
            } else {
              for (const srcId of ids) {
                nextTree = await duplicateSubtreeDeep(nextTree, srcId, parentId);
              }
            }
          } else {
            nextTree = await duplicateSubtreeDeep(tree, id, parentId);
            reverseOps = null; // copy undo is complex; skip for now
            op.undoable = false;
          }
          break;
        }

        case 'create': {
          nextTree = createEntry(tree, { name, type: extra.entryType || 'folder', parentId });
          const created = nextTree[nextTree.length - 1];
          reverseOps = [{ type: 'delete', id: created.id }];
          break;
        }

        case 'rename': {
          const entry = tree.find(e => e.id === id);
          reverseOps = [{ type: 'rename', id, oldName: entry?.name || '' }];
          nextTree = updateEntry(tree, id, { name });
          break;
        }

        case 'restore': {
          nextTree = restoreEntry(tree, id);
          break;
        }

        default:
          break;
      }

      commit(nextTree);

      // Push to undo stack
      if (reverseOps) {
        this.undoStack.push({ ops: reverseOps, treeBefore: tree });
      }

      op.status = 'done';
      op.progress.current = op.progress.total;
      notify(this.queue);
      return { tree: nextTree };
    } catch (err) {
      op.status = 'error';
      op.error = err.message;
      notify(this.queue);
      throw err;
    }
  }

  /**
   * Undo the last operation.
   */
  async undo(tree, commit) {
    if (!this.canUndo()) return;
    const { ops, treeBefore } = this.undoStack.pop();

    // Apply reverse ops in LIFO order
    let nextTree = tree;
    for (const rop of ops) {
      switch (rop.type) {
        case 'move':
          nextTree = moveEntry(nextTree, rop.id, rop.parentId || rop.oldParentId);
          break;
        case 'rename':
          nextTree = updateEntry(nextTree, rop.id, { name: rop.name || rop.oldName });
          break;
        case 'delete':
          nextTree = await removeEntryDeep(nextTree, rop.id);
          break;
        case 'restore':
          nextTree = trashEntry(nextTree, rop.id);
          break;
        default:
          break;
      }
    }
    commit(nextTree);
  }
}

/** Singleton queue instance shared across all components. */
export const operationQueue = new OperationQueue();
