/**
 * Drag and drop with PIDL data transfer.
 */
import { useCallback } from 'react';
import { draggingId } from '../state/signals.jsx';
import { moveEntry } from '../../fileSystem.js';

export function useDragDrop(tree, commit, drive) {
  /** Props to spread on a draggable item. */
  const dragProps = useCallback((entry) => {
    if (drive) return {};
    return {
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', entry.id);
        draggingId.value = entry.id;
      },
      onDragEnd: () => {
        draggingId.value = null;
      },
    };
  }, [drive]);

  /** Props to spread on a drop target (folder). */
  const dropTarget = useCallback((targetId) => {
    if (drive || !draggingId.value || draggingId.value === targetId) return {};
    return {
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = draggingId.value;
        draggingId.value = null;
        if (id && id !== targetId) {
          commit(moveEntry(tree, id, targetId));
        }
      },
    };
  }, [tree, commit, drive]);

  return { dragProps, dropTarget, draggingId: draggingId.value };
}
