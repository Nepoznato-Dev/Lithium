import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useFileSystem, isTrashed, trashedItems } from '../../lib/fileSystem';
import { useSettings } from '../SettingsContext';
import { notify } from '../../lib/desktop/notify';
import Icon from '../Icon';

/**
 * Command palette (Ctrl/Cmd+K). Searches:
 *   - Apps (open a window)
 *   - System actions (lock, empty bin, toggle theme, …)
 *   - Local files (FS tree)
 *   - Notes (vault)
 *
 * Keyboard: ↑/↓ to move, Enter to run, Esc to close. Click outside to dismiss.
 */
export default function CommandPalette({ apps, onLaunch, onLock, onEmptyTrash, onOpenSettings, onOpenNotifications, onShowDesktop, onTaskView }) {
  const { settings, update } = useSettings();
  const [tree] = useFileSystem();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  /* ---------- Open / close on Ctrl/Cmd+K ---------- */
  useEffect(() => {
    const onKey = event => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus next tick so the input is mounted.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  /* ---------- Build command list ---------- */
  const commands = useMemo(() => {
    const list = [];

    /* Apps */
    apps.filter(app => app.showInStart !== false).forEach(app => {
      list.push({
        id: `app-${app.id}`,
        kind: 'app',
        title: `Open ${app.name}`,
        subtitle: 'App',
        icon: app.icon,
        color: app.color,
        action: () => onLaunch(app),
      });
    });

    /* System actions */
    const actions = [
      { id: 'lock', title: 'Lock screen', subtitle: 'Require PIN to unlock', icon: 'ShieldCheck', color: '#a78bfa', action: () => { setOpen(false); onLock?.(); } },
      { id: 'notifications', title: 'Open notification center', subtitle: 'View recent alerts', icon: 'Bell', color: '#22d3ee', action: () => { setOpen(false); onOpenNotifications?.(); } },
      { id: 'settings', title: 'Open Settings', subtitle: 'Theme, wallpaper, performance…', icon: 'Settings', color: '#64748b', action: () => { setOpen(false); onOpenSettings?.(); } },
      { id: 'empty-trash', title: 'Empty Recycle Bin', subtitle: `${trashedItems(tree).length} item${trashedItems(tree).length === 1 ? '' : 's'} currently in bin`, icon: 'Trash2', color: '#ef4444', action: () => { setOpen(false); onEmptyTrash?.(); } },
      { id: 'show-desktop', title: 'Show desktop', subtitle: 'Minimize all windows', icon: 'Monitor', color: '#9ca3af', action: () => { setOpen(false); onShowDesktop?.(); } },
      { id: 'task-view', title: 'Task view', subtitle: 'See all open windows', icon: 'LayoutGrid', color: '#22d3ee', action: () => { setOpen(false); onTaskView?.(); } },
      { id: 'toggle-theme', title: settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', subtitle: 'Current: ' + settings.theme, icon: settings.theme === 'dark' ? 'Sun' : 'Moon', color: '#fbbf24', action: () => { update({ theme: settings.theme === 'dark' ? 'light' : 'dark' }); setOpen(false); } },
    ];
    actions.forEach(action => list.push(action));

    /* Files (non-vault) */
    tree
      .filter(entry => entry.type !== 'folder' && !isTrashed(entry) && !(entry.parentId === 'default-notes'))
      .slice(0, 200)
      .forEach(entry => list.push({
        id: `file-${entry.id}`,
        kind: 'file',
        title: entry.name,
        subtitle: `File · ${entry.type}`,
        icon: entry.type === 'image' ? 'Image' : 'FileText',
        color: '#60a5fa',
        action: () => { setOpen(false); onLaunch(apps.find(a => a.id === 'files')); setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entry.id })), 120); },
      }));

    /* Notes */
    tree
      .filter(entry => entry.type === 'text' && !isTrashed(entry) && (entry.parentId === 'default-notes' || entry.parentId === 'default-documents'))
      .slice(0, 100)
      .forEach(entry => list.push({
        id: `note-${entry.id}`,
        kind: 'note',
        title: entry.name.replace(/\.(md|txt)$/i, ''),
        subtitle: 'Note',
        icon: 'FileText',
        color: '#8b5cf6',
        action: () => { setOpen(false); onLaunch(apps.find(a => a.id === 'notepad')); setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-note', { detail: entry.id })), 120); },
      }));

    return list;
  }, [apps, onLaunch, onLock, onEmptyTrash, onOpenSettings, onOpenNotifications, onShowDesktop, onTaskView, settings.theme, update, tree]);

  /* ---------- Filter by query ---------- */
  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 50);
    const q = query.trim().toLowerCase();
    const scored = commands
      .map(item => {
        const hay = `${item.title} ${item.subtitle}`.toLowerCase();
        const index = hay.indexOf(q);
        if (index < 0) return null;
        // Earlier match wins, title matches beat subtitle matches.
        const score = (item.title.toLowerCase().startsWith(q) ? 0 : 100) + index;
        return { item, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map(result => result.item);
    return scored.slice(0, 30);
  }, [commands, query]);

  /* Keep active in range as results change. */
  useEffect(() => {
    setActive(index => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  /* Scroll active into view. */
  useEffect(() => {
    if (!listRef.current) return;
    const element = listRef.current.querySelector(`[data-index="${active}"]`);
    if (element) element.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runItem = item => {
    if (!item) return;
    try { item.action(); } catch (err) { notify({ title: 'Command failed', body: err.message, tone: 'error' }); }
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(index => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(filtered[active]);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setActive(index => (index + 1) % Math.max(1, filtered.length));
    }
  };

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="nx-popup"
        style={{ width: 560, maxWidth: '90vw', maxHeight: 480, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Icon name="Search" size={16} color="rgba(255,255,255,0.5)" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search apps, actions, files, notes…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px' }}>Esc</span>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : filtered.map((item, index) => {
            return (
              <button
                key={item.id}
                data-index={index}
                onClick={() => runItem(item)}
                onMouseEnter={() => setActive(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  background: index === active ? 'rgba(34,211,238,0.12)' : 'transparent',
                  borderLeft: index === active ? '2px solid #22d3ee' : '2px solid transparent',
                  color: '#fff',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                }}
              >
                {item.icon && (
                  <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={item.icon} size={16} color={item.color || '#22d3ee'} />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{item.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span style={{ marginLeft: 'auto' }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
