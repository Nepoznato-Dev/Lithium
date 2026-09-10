import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFileSystem, isTrashed, trashedItems } from '../../lib/fileSystem';
import { useSettings } from '../SettingsContext';
import { notify } from '../../lib/desktop/notify';
import { search as historySearch, recent as historyRecent } from '../../lib/services/historyService';
import { listSessions } from '../../lib/services/aiService';
import { storage } from '../../lib/storage';
import { isDndEnabled, setDndEnabled } from '../../lib/services/notificationService';
import Icon from '../Icon';
import { AppIcon } from './DesktopApps';

const RECENT_KEY = 'lithium:cmd-recent';
const MAX_RECENT = 8;

/**
 * Command Palette v2 (Ctrl/Cmd+K). Unified launcher indexing:
 *   - Apps (from registry)
 *   - System actions (lock, theme, DND, shields, etc.)
 *   - Files (FS tree)
 *   - Notes (vault)
 *   - History (unified indexer)
 *   - AI sessions
 *   - Settings sections
 *   - Slash commands (/summarize, /translate, /clear)
 *
 * Keyboard: ↑/↓ navigate, Enter run, Esc close, Tab cycle.
 */
export default function CommandPalette({ open, onClose, apps, onLaunch, onLock, onEmptyTrash, onOpenSettings, onOpenNotifications, onShowDesktop, onTaskView }) {
  const { settings, update } = useSettings();
  const [tree] = useFileSystem();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState(() => storage.get(RECENT_KEY, []));
  const inputRef = useRef(null);
  const listRef = useRef(null);

  /* ---------- Close on Esc / toggle on Ctrl+K ---------- */
  useEffect(() => {
    if (!open) return;
    const onKey = event => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const markRecent = (id) => {
    const next = [id, ...recentIds.filter(r => r !== id)].slice(0, MAX_RECENT);
    setRecentIds(next);
    storage.set(RECENT_KEY, next);
  };

  /* ---------- Build command list ---------- */
  const commands = useMemo(() => {
    const list = [];
    const isSlash = query.startsWith('/');
    const q = query.trim().toLowerCase();

    /* Slash commands */
    if (isSlash) {
      const slashCmds = [
        { id: '/summarize', title: '/summarize', subtitle: 'Summarize current context', icon: 'FileText', color: '#a78bfa', action: () => { onClose(); onLaunch(apps.find(a => a.id === 'ai-hub')); } },
        { id: '/translate', title: '/translate', subtitle: 'Translate selected text', icon: 'Languages', color: '#22d3ee', action: () => { onClose(); onLaunch(apps.find(a => a.id === 'ai-hub')); } },
        { id: '/clear', title: '/clear', subtitle: 'Clear recent command history', icon: 'Trash2', color: '#ef4444', action: () => { storage.set(RECENT_KEY, []); setRecentIds([]); } },
        { id: '/dnd', title: '/dnd', subtitle: 'Toggle Do Not Disturb', icon: 'Moon', color: '#f59e0b', action: () => { onClose(); setDndEnabled(!isDndEnabled()); } },
        { id: '/shields', title: '/shields', subtitle: 'Toggle privacy shields', icon: 'Shield', color: '#22d3ee', action: () => { onClose(); update('privacy.shieldLevel', settings.privacy?.shieldLevel === 'off' ? 'standard' : 'off'); } },
        { id: '/lock', title: '/lock', subtitle: 'Lock the screen', icon: 'Lock', color: '#a78bfa', action: () => { onClose(); onLock?.(); } },
      ];
      const filtered = slashCmds.filter(c => c.title.startsWith(q));
      filtered.forEach(c => list.push({ ...c, kind: 'slash' }));
      if (list.length > 0) return list;
    }

    /* Apps */
    apps.filter(app => app.showInStart !== false).forEach(app => {
      list.push({
        id: `app-${app.id}`,
        kind: 'app',
        title: `Open ${app.name}`,
        subtitle: 'App',
        icon: app.icon,
        iconFile: app.iconFile,
        color: app.color,
        action: () => { markRecent(`app-${app.id}`); onLaunch(app); },
      });
    });

    /* System actions */
    const actions = [
      { id: 'lock', title: 'Lock screen', subtitle: 'Require PIN to unlock', icon: 'ShieldCheck', color: '#a78bfa', action: () => { onClose(); onLock?.(); } },
      { id: 'notifications', title: 'Open notification center', subtitle: 'View recent alerts', icon: 'Bell', color: '#22d3ee', action: () => { onClose(); onOpenNotifications?.(); } },
      { id: 'settings', title: 'Open Settings', subtitle: 'Theme, wallpaper, performance…', icon: 'Settings', color: '#64748b', action: () => { onClose(); onOpenSettings?.(); } },
      { id: 'empty-trash', title: 'Empty Recycle Bin', subtitle: `${trashedItems(tree).length} item${trashedItems(tree).length === 1 ? '' : 's'} in bin`, icon: 'Trash2', color: '#ef4444', action: () => { onClose(); onEmptyTrash?.(); } },
      { id: 'show-desktop', title: 'Show desktop', subtitle: 'Minimize all windows', icon: 'Monitor', color: '#9ca3af', action: () => { onClose(); onShowDesktop?.(); } },
      { id: 'task-view', title: 'Task view', subtitle: 'See all open windows', icon: 'LayoutGrid', color: '#22d3ee', action: () => { onClose(); onTaskView?.(); } },
      { id: 'toggle-theme', title: 'Toggle theme', subtitle: `Current: ${settings.theme?.mode || 'dark'}`, icon: settings.theme?.mode === 'dark' ? 'Sun' : 'Moon', color: '#fbbf24', action: () => { update('theme.mode', settings.theme?.mode === 'dark' ? 'light' : 'dark'); onClose(); } },
      { id: 'toggle-dnd', title: 'Toggle Do Not Disturb', subtitle: 'Silence notifications', icon: 'Moon', color: '#f59e0b', action: () => { onClose(); setDndEnabled(!isDndEnabled()); } },
      { id: 'toggle-shields', title: 'Toggle privacy shields', subtitle: `Current: ${settings.privacy?.shieldLevel || 'standard'}`, icon: 'Shield', color: '#22d3ee', action: () => { update('privacy.shieldLevel', settings.privacy?.shieldLevel === 'off' ? 'standard' : 'off'); onClose(); } },
    ];
    actions.forEach(action => list.push({ ...action, kind: 'action' }));

    /* Settings sections */
    const settingSections = [
      { id: 'sec-privacy', title: 'Privacy & Security settings', subtitle: 'Shields, GPC, tracking protection', icon: 'ShieldCheck', color: '#22d3ee', section: 'privacy' },
      { id: 'sec-ai', title: 'AI & Intelligence settings', subtitle: 'Model, provider, system prompt', icon: 'BrainCircuit', color: '#a78bfa', section: 'ai' },
      { id: 'sec-search', title: 'Search Engines settings', subtitle: 'Manage engines & keywords', icon: 'Search', color: '#22d3ee', section: 'search-engines' },
      { id: 'sec-profiles', title: 'Profiles settings', subtitle: 'Multi-user workspaces', icon: 'Users', color: '#34d399', section: 'profiles' },
    ];
    settingSections.forEach(s => list.push({ ...s, kind: 'settings', action: () => { onClose(); onOpenSettings?.(); } }));

    /* AI sessions */
    try {
      const sessions = listSessions();
      sessions.slice(0, 20).forEach(s => list.push({
        id: `ai-${s.id}`,
        kind: 'ai',
        title: s.title,
        subtitle: 'AI Conversation',
        icon: 'MessageSquare',
        color: '#a78bfa',
        action: () => { onClose(); onLaunch(apps.find(a => a.id === 'ai-hub')); },
      }));
    } catch { /* no AI sessions */ }

    /* Files (non-vault, non-trashed) */
    tree
      .filter(entry => entry.type !== 'folder' && !isTrashed(entry) && !(entry.parentId === 'default-notes'))
      .slice(0, 100)
      .forEach(entry => list.push({
        id: `file-${entry.id}`,
        kind: 'file',
        title: entry.name,
        subtitle: `File · ${entry.type}`,
        icon: entry.type === 'image' ? 'Image' : 'FileText',
        color: '#60a5fa',
        action: () => { onClose(); onLaunch(apps.find(a => a.id === 'files')); setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entry.id })), 120); },
      }));

    /* Notes */
    tree
      .filter(entry => entry.type === 'text' && !isTrashed(entry) && (entry.parentId === 'default-notes' || entry.parentId === 'default-documents'))
      .slice(0, 50)
      .forEach(entry => list.push({
        id: `note-${entry.id}`,
        kind: 'note',
        title: entry.name.replace(/\.(md|txt)$/i, ''),
        subtitle: 'Note',
        icon: 'FileText',
        color: '#8b5cf6',
        action: () => { onClose(); onLaunch(apps.find(a => a.id === 'notepad')); setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-note', { detail: entry.id })), 120); },
      }));

    /* Boost by recency */
    const boosted = list.map(item => ({
      item,
      boost: recentIds.indexOf(item.id) >= 0 ? (MAX_RECENT - recentIds.indexOf(item.id)) * 10 : 0,
    }));

    if (!q) {
      // Show recent first, then rest
      const withBoost = boosted.sort((a, b) => b.boost - a.boost);
      return withBoost.map(x => x.item).slice(0, 50);
    }

    /* Filter by query */
    const filtered = boosted
      .map(({ item, boost }) => {
        const hay = `${item.title} ${item.subtitle}`.toLowerCase();
        const index = hay.indexOf(q);
        if (index < 0) return null;
        const score = (item.title.toLowerCase().startsWith(q) ? 0 : 100) + index - boost;
        return { item, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map(x => x.item);

    return filtered.slice(0, 40);
  }, [apps, onLaunch, onLock, onEmptyTrash, onOpenSettings, onOpenNotifications, onShowDesktop, onTaskView, onClose, settings, update, tree, query, recentIds]);

  /* Keep active in range */
  useEffect(() => {
    setActive(index => Math.min(index, Math.max(0, commands.length - 1)));
  }, [commands.length]);

  /* Scroll active into view */
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
      setActive(index => Math.min(commands.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(commands[active]);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setActive(index => (index + 1) % Math.max(1, commands.length));
    }
  };

  const kindLabel = { app: 'App', action: 'Action', slash: 'Command', file: 'File', note: 'Note', ai: 'AI', settings: 'Settings' };
  const kindColor = { app: '#22d3ee', action: '#f59e0b', slash: '#a78bfa', file: '#60a5fa', note: '#8b5cf6', ai: '#a78bfa', settings: '#64748b' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="nx-popup"
        style={{ width: 600, maxWidth: '92vw', maxHeight: 520, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={event => event.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Icon name={query.startsWith('/') ? 'Slash' : 'Search'} size={16} color="rgba(255,255,255,0.5)" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search apps, files, actions, or type / for commands…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px' }}>Esc</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {commands.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : commands.map((item, index) => (
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
                  {item.kind === 'app'
                    ? <AppIcon icon={item.icon} iconFile={item.iconFile} color={item.color} size={16} />
                    : <Icon name={item.icon} size={16} color={item.color || '#22d3ee'} />
                  }
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{item.subtitle}</span>
              </span>
              <span style={{ fontSize: 9, color: kindColor[item.kind] || '#666', background: `${kindColor[item.kind] || '#666'}15`, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                {kindLabel[item.kind] || ''}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 12, padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>/ commands</span>
          <span>esc close</span>
          <span style={{ marginLeft: 'auto' }}>{commands.length} results</span>
        </div>
      </div>
    </div>
  );
}
