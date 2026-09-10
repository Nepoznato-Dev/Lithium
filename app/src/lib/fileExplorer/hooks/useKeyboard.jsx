/**
 * Keyboard shortcut handler for the file explorer.
 */
import { useCallback, useEffect } from 'react';
import { selectedItems, view, nav } from '../state/signals.jsx';

export function useKeyboard({ onCopy, onCut, onPaste, onDelete, onRename, onOpen, onEscape, onSelectAll, onUp }) {
  const onKeyDown = useCallback((event) => {
    const ctrl = event.ctrlKey || event.metaKey;

    // Don't intercept when typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    if (ctrl && event.key === 'c') { event.preventDefault(); onCopy?.(); }
    else if (ctrl && event.key === 'x') { event.preventDefault(); onCut?.(); }
    else if (ctrl && event.key === 'v') { event.preventDefault(); onPaste?.(); }
    else if (ctrl && event.key === 'a') { event.preventDefault(); onSelectAll?.(); }
    else if (event.key === 'Delete') { event.preventDefault(); onDelete?.(); }
    else if (event.key === 'F2') { event.preventDefault(); onRename?.(); }
    else if (event.key === 'Enter') { event.preventDefault(); onOpen?.(); }
    else if (event.key === 'Escape') { event.preventDefault(); onEscape?.(); }
    else if (event.key === 'Backspace' && !ctrl) { event.preventDefault(); onUp?.(); }
  }, [onCopy, onCut, onPaste, onDelete, onRename, onOpen, onEscape, onSelectAll, onUp]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return { onKeyDown };
}
