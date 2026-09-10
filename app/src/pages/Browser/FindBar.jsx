/**
 * FindBar — Brave-style Ctrl+F find-in-page bar.
 * Compact bar at the top-right of the viewport.
 */
import { useRef, useEffect } from 'preact/hooks';
import { findBarOpen, findQuery, toggleFindBar } from './stores/browserStore';
import Icon from '../../Components/Icon';

export default function FindBar() {
  const inputRef = useRef(null);
  const open = findBarOpen.value;
  const query = findQuery.value;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleFind = () => {
    if (query) window.find(query, false, false, true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFind();
    } else if (e.key === 'Escape') {
      toggleFindBar();
    }
  };

  return (
    <div className="flex items-center gap-1.5 border-b border-white/[0.04] bg-[#1e1e30] px-3 py-1.5">
      <Icon name="Search" className="h-3.5 w-3.5 text-white/25" />
      <input
        ref={inputRef}
        className="h-7 w-52 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white outline-none transition-colors focus:border-white/15 focus:bg-white/[0.06]"
        placeholder="Find in page…"
        value={query}
        onInput={e => { findQuery.value = e.target.value; }}
        onKeyDown={handleKeyDown}
      />
      <button className="browser-nav-btn h-6 w-6" onClick={handleFind} aria-label="Find next">
        <Icon name="ChevronDown" className="h-3 w-3" />
      </button>
      <button className="browser-nav-btn h-6 w-6" onClick={() => { findQuery.value = query; window.find(query, false, true, true); }} aria-label="Find previous">
        <Icon name="ChevronUp" className="h-3 w-3" />
      </button>
      <button className="browser-nav-btn h-6 w-6" onClick={toggleFindBar} aria-label="Close find bar">
        <Icon name="X" className="h-3 w-3" />
      </button>
    </div>
  );
}
