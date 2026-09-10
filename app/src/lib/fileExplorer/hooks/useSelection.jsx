/**
 * Selection management with multi-select support.
 * toggle = Ctrl+click, range = Shift+click, selectAll = Ctrl+A.
 */
import { useCallback, useRef } from 'react';
import { selectedItems } from '../state/signals.jsx';

export function useSelection(items = []) {
  const lastClickedId = useRef(null);

  const isSelected = useCallback((id) => {
    return selectedItems.value.has(id);
  }, []);

  /** Single click — replace selection with just this item. */
  const select = useCallback((id) => {
    selectedItems.value = new Set([id]);
    lastClickedId.current = id;
  }, []);

  /** Ctrl+click — toggle item in/out of selection. */
  const toggle = useCallback((id) => {
    const next = new Set(selectedItems.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedItems.value = next;
    lastClickedId.current = id;
  }, []);

  /** Shift+click — range select from last clicked to this item. */
  const range = useCallback((id) => {
    const ids = items.map(e => e.id);
    const lastIdx = ids.indexOf(lastClickedId.current);
    const curIdx = ids.indexOf(id);
    if (lastIdx === -1 || curIdx === -1) {
      selectedItems.value = new Set([id]);
      return;
    }
    const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
    const rangeIds = new Set(selectedItems.value);
    for (let i = start; i <= end; i++) rangeIds.add(ids[i]);
    selectedItems.value = rangeIds;
  }, [items]);

  /** Ctrl+A — select all visible items. */
  const selectAll = useCallback(() => {
    selectedItems.value = new Set(items.map(e => e.id));
  }, [items]);

  /** Clear selection. */
  const clear = useCallback(() => {
    selectedItems.value = new Set();
    lastClickedId.current = null;
  }, []);

  return {
    selected: selectedItems,
    isSelected,
    select,
    toggle,
    range,
    selectAll,
    clear,
  };
}
