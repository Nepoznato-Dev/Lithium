/**
 * Address bar — breadcrumb navigation with back/forward/refresh + search input.
 * Composes Breadcrumb and PathInput sub-components.
 */
import { useState, useCallback } from 'react';
import Icon from '../../../../Components/Icon';
import { nav, view, draggingId } from '../../state/signals.jsx';
import { useHistory } from '../../hooks/useHistory.jsx';

export default function AddressBar({ dropTarget }) {
  const [editing, setEditing] = useState(false);
  const [pathText, setPathText] = useState('');
  const { back, forward, canBack, canForward } = useHistory();

  const handleClick = useCallback(() => {
    if (!editing) {
      const crumbs = nav.value.stack.map(c => c.name);
      setPathText(crumbs.join(' \\ '));
      setEditing(true);
    }
  }, [editing]);

  const handleCommit = useCallback(() => {
    setEditing(false);
    // Path text input is best-effort: user types a path, we try to match
    // For now, just close the editor — full path resolution could be added later
  }, []);

  return (
    <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-1.5">
      <button className="icon-btn h-7 w-7" disabled={!canBack} onClick={back} aria-label="Back">
        <Icon name="ChevronLeft" size={14} />
      </button>
      <button className="icon-btn h-7 w-7" disabled={!canForward} onClick={forward} aria-label="Forward">
        <Icon name="ChevronRight" size={14} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
        {editing ? (
          <input
            className="w-full bg-transparent text-xs text-white/90 outline-none"
            value={pathText}
            onChange={e => setPathText(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
          />
        ) : view.value !== 'files' ? (
          <span className="capitalize">{view.value}</span>
        ) : (
          nav.value.stack.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="flex items-center gap-1">
              {index > 0 && <Icon name="ChevronRight" size={12} className="shrink-0 text-white/25" />}
              <button
                className="truncate hover:text-white"
                onClick={() => nav.value = { ...nav.value, stack: nav.value.stack.slice(0, index + 1) }}
                {...(dropTarget ? dropTarget(crumb.id) : {})}
              >
                {crumb.name}
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
