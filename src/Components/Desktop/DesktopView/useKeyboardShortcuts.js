import { useEffect, useRef, useState } from 'react';
import { snapBounds } from '../../../lib/desktop/ui';

/** Alt+Tab window switcher and Ctrl+Alt+Arrow window snapping. */
export default function useKeyboardShortcuts(windows, focusWindow, updateWindow, closePopups) {
  const [altTab, setAltTab] = useState(null);
  const altTabRef = useRef(null);

  // Alt+Tab switcher + Escape dismissal
  useEffect(() => {
    const onKeyDown = event => {
      if (event.altKey && event.key === 'Tab') {
        event.preventDefault();
        const visible = windows.filter(item => !item.minimized);
        if (!visible.length) return;
        setAltTab(prev => ({ index: prev ? (prev.index + 1) % visible.length : 0 }));
      } else if (event.key === 'Escape') {
        setAltTab(null);
        closePopups();
      }
    };
    const onKeyUp = event => {
      if (event.key === 'Alt' && altTabRef.current) {
        const visible = windows.filter(item => !item.minimized);
        const target = visible[altTabRef.current.index % visible.length];
        if (target) focusWindow(target.id);
        setAltTab(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [windows, focusWindow, closePopups]);

  useEffect(() => { altTabRef.current = altTab; }, [altTab]);

  // Ctrl+Alt+Arrow window snapping
  useEffect(() => {
    const onKeyDown = event => {
      if (!event.ctrlKey || !event.altKey || event.metaKey) return;
      const visible = windows.filter(item => !item.minimized);
      if (!visible.length) return;
      const top = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
      if (event.key === 'ArrowLeft') { event.preventDefault(); updateWindow(top.id, snapBounds('left')); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); updateWindow(top.id, snapBounds('right')); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); updateWindow(top.id, { maximized: true }); }
      else if (event.key === 'ArrowDown' && top.maximized) { event.preventDefault(); updateWindow(top.id, { maximized: false }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [windows, updateWindow]);

  return { altTab, altTabRef };
}
