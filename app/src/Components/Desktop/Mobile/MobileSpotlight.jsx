import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { AppIcon } from '../DesktopApps';

/**
 * Spotlight-style search overlay. Filters the launchable apps as you type and,
 * when nothing matches (or the query looks like a URL), offers a web search that
 * is routed through the shell's existing `lithium:open-browser` event so the
 * Browser app handles it exactly like on the desktop.
 */
export default function MobileSpotlight({ open, onClose, apps, searchEngine, onLaunch, onWebSearch }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(''); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return apps.slice(0, 8);
    return apps
      .filter(app => `${app.name} ${app.desc || ''}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [apps, term]);

  const looksLikeUrl = /^https?:\/\//i.test(q.trim()) || /^[\w-]+(\.[\w-]+)+/.test(q.trim());

  if (!open) return null;

  const submit = () => {
    if (results[0]) onLaunch(results[0]);
    else if (q.trim()) onWebSearch(q.trim(), searchEngine);
    onClose();
  };

  return (
    <div className="mx-spot" onClick={onClose}>
      <div className="mx-spot-field" onClick={event => event.stopPropagation()}>
        <Icon name="Search" size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search apps and the web"
          value={q}
          onChange={event => setQ(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') submit(); }}
        />
        <button type="button" className="mx-spot-cancel" onClick={onClose}>Cancel</button>
      </div>

      <div className="mx-spot-results" onClick={event => event.stopPropagation()}>
        {results.map(app => (
          <button type="button" key={app.id} className="mx-spot-row" onClick={() => { onLaunch(app); onClose(); }}>
            <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={18} box={34} />
            <span>{app.name}{app.desc ? <small>{app.desc}</small> : null}</span>
          </button>
        ))}
        {term && (
          <button type="button" className="mx-spot-row" onClick={() => { onWebSearch(q.trim(), searchEngine); onClose(); }}>
            <Icon name={looksLikeUrl ? 'Globe' : 'Search'} size={18} />
            <span>{looksLikeUrl ? `Open “${q.trim()}”` : `Search the web for “${q.trim()}”`}<small>Browser</small></span>
          </button>
        )}
      </div>
    </div>
  );
}
