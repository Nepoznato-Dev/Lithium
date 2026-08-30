import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { childrenOf, createEntry, getEntry, isTrashed, readEntryContent, removeEntryDeep, restoreEntry, storeEntryContent, trashEntry, TRASH_ID, updateEntry, useFileSystem } from '../../../lib/fileSystem';
import { applyHeading, renderMarkdown, wikiLinks } from '../../../lib/markdown';
import { storage } from '../../../lib/storage';
import ContextMenu, { useContextMenu } from '../ContextMenu';
import WinControls from '../WinControls';

const VAULT_ID = 'default-notes';
const isHidden = name => name.startsWith('.');
const noteName = entry => entry.name.replace(/\.(md|txt)$/i, '');

/* ---------- Frontmatter / tag helpers ---------- */

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  match[1].split(/\r?\n/).forEach(line => {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (m) {
      const val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        meta[m[1]] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        meta[m[1]] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  });
  return { meta, body: source.slice(match[0].length).trim() };
}

function extractTags(source) {
  const tags = new Set();
  const { meta } = parseFrontmatter(source);
  if (Array.isArray(meta.tags)) meta.tags.forEach(t => tags.add(t.toLowerCase()));
  const body = source.replace(/^---[\s\S]*?---\r?\n?/, '');
  const re = /(?<=\s|^)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
  let m;
  while ((m = re.exec(body))) tags.add(m[1].toLowerCase());
  return [...tags];
}

function extractHeadings(source) {
  const body = source.replace(/^---[\s\S]*?---\r?\n?/, '');
  const headings = [];
  body.split(/\r?\n/).forEach((line, idx) => {
    const m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (m) headings.push({ level: m[1].length, text: m[2], line: idx });
  });
  return headings;
}

function backlinkContext(source, targetName) {
  const lines = source.replace(/^---[\s\S]*?---\r?\n?/, '').split(/\r?\n/);
  const results = [];
  lines.forEach((line, idx) => {
    if (line.includes(`[[${targetName}]]`) || line.includes(`[[${targetName}|`)) {
      results.push({ line: idx, text: line.trim() });
    }
  });
  return results;
}

/* ---------- Note templates ---------- */

const TEMPLATES = {
  blank: { name: 'Blank note', content: '' },
  daily: { name: 'Daily note', content: `---\ntags: [daily]\ndate: {{date}}\n---\n\n# {{date}}\n\n## Tasks\n- [ ] \n\n## Notes\n\n## Log\n` },
  meeting: { name: 'Meeting note', content: `---\ntags: [meeting]\ndate: {{date}}\n---\n\n# Meeting: \n\n**Date:** {{date}}\n**Attendees:** \n\n## Agenda\n\n## Discussion\n\n## Action Items\n- [ ] \n\n## Notes\n` },
  project: { name: 'Project note', content: `---\ntags: [project]\nstatus: active\n---\n\n# Project: \n\n## Overview\n\n## Goals\n- \n\n## Tasks\n- [ ] \n\n## Resources\n- \n\n## Notes\n` },
  zettel: { name: 'Zettelkasten', content: `---\ntags: []\ncreated: {{date}}\n---\n\n# \n\n## Idea\n\n## Context\n\n## Related\n- [[]]\n` },
};

function fillTemplate(tpl) {
  const today = new Date().toISOString().slice(0, 10);
  return tpl.replace(/\{\{date\}\}/g, today);
}

/* ---------- Obsidian-style markdown notes ---------- */

export default function NotesApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [tree, commit] = useFileSystem();
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState('edit'); // edit | preview | split | live
  const [inlineEdit, setInlineEdit] = useState(null); // { startLine, endLine, top, left } for live preview
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [openFolders, setOpenFolders] = useState({ [VAULT_ID]: true });
  const [spellCheck, setSpellCheck] = useState(() => storage.get('notes-spellcheck', false));
  const [notesSettings, setNotesSettings] = useState(() => storage.get('notes-settings', { lineNumbers: false, smartLists: true, rtl: false, foldHeadings: false, typographer: false }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphMode, setGraphMode] = useState('global'); // global | local
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [starred, setStarred] = useState(() => storage.get('notes-starred', []));
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [menu, openMenu, closeMenu] = useContextMenu();
  const areaRef = useRef(null);
  const gutterRef = useRef(null);

  const allNotes = useMemo(
    () => tree.filter(e => e.type === 'text' && /\.(md|txt)$/i.test(e.name) && !isHidden(e.name)).sort((a, b) => a.name.localeCompare(b.name)),
    [tree]
  );
  const vaultNotes = useMemo(() => allNotes.filter(e => e.parentId === VAULT_ID || isInsideVault(tree, e)), [allNotes, tree]);

  const active = activeId ? getEntry(tree, activeId) : null;
  const [draft, setDraft] = useState('');

  const { meta: frontmatter, body: cleanBody } = useMemo(() => parseFrontmatter(draft), [draft]);
  const previewHtml = useMemo(() => (mode === 'preview' || mode === 'split' || mode === 'live' ? renderMarkdown(draft) : ''), [draft, mode]);
  const headings = useMemo(() => extractHeadings(draft), [draft]);
  const noteTags = useMemo(() => extractTags(draft), [draft]);

  // All vault tags
  const allTags = useMemo(() => {
    const tagMap = new Map();
    vaultNotes.forEach(entry => {
      const content = entry.content || '';
      extractTags(content).forEach(tag => {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(entry);
      });
    });
    return tagMap;
  }, [vaultNotes]);

  // Backlinks with context
  const backlinks = useMemo(() => {
    if (!active) return [];
    const name = noteName(active);
    return vaultNotes
      .filter(e => e.id !== active.id && (e.content || '').includes(`[[${name}]]`))
      .map(e => ({ entry: e, contexts: backlinkContext(e.content || '', name) }));
  }, [active, vaultNotes]);

  // Starred notes list
  const starredNotes = useMemo(() => vaultNotes.filter(e => starred.includes(e.id)), [vaultNotes, starred]);

  // Migrate legacy
  useEffect(() => {
    const legacy = storage.get('notepad', '');
    if (legacy && !storage.get('notes-migrated', false)) {
      storage.set('notes-migrated', true);
      if (!allNotes.some(e => e.name === 'Migrated Note.md')) {
        commit(createEntry(tree, { name: 'Migrated Note.md', type: 'text', parentId: VAULT_ID, content: legacy }));
      }
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;
    if (active) readEntryContent(active).then(text => { if (!cancelled) setDraft(text || ''); });
    else setDraft('');
    return () => { cancelled = true; };
  }, [activeId]); // eslint-disable-line

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(async () => {
      const stored = await storeEntryContent(active, draft);
      commit(updateEntry(tree, active.id, { content: stored.content, idb: stored.idb, size: stored.size }));
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line

  const openNote = id => {
    setTabs(prev => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
    setSwitcherOpen(false);
    setCmdPaletteOpen(false);
  };

  const closeTab = id => {
    setTabs(prev => {
      const next = prev.filter(t => t !== id);
      if (activeId === id) setActiveId(next[next.length - 1] || null);
      return next;
    });
  };

  /** Commit inline edit text back to the draft at the correct source lines */
  const commitInlineEdit = useCallback(() => {
    if (!inlineEdit) return;
    const draftLines = draft.split('\n');
    const before = draftLines.slice(0, inlineEdit.startLine).join('\n');
    const after = draftLines.slice(inlineEdit.endLine + 1).join('\n');
    setDraft(before + (before ? '\n' : '') + inlineEdit.text + (after ? '\n' + after : ''));
    setInlineEdit(null);
  }, [inlineEdit, draft]);

  const uniqueName = (base, parentId = VAULT_ID) => {
    let name = `${base}.md`;
    let n = 2;
    while (vaultNotes.some(e => e.name === name && (e.parentId === parentId || isInsideVault(tree, e)))) { name = `${base} ${n}.md`; n += 1; }
    return name;
  };

  const createNote = (nameBase = 'Untitled', parentId = VAULT_ID, templateKey = null) => {
    let content = '';
    if (templateKey && TEMPLATES[templateKey]) content = fillTemplate(TEMPLATES[templateKey].content);
    const arr = createEntry(tree, { name: uniqueName(nameBase, parentId), type: 'text', parentId, content });
    commit(arr);
    openNote(arr[arr.length - 1].id);
    setMode('edit');
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const createDailyNote = () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = vaultNotes.find(e => noteName(e) === today);
    if (existing) { openNote(existing.id); return; }
    const content = fillTemplate(TEMPLATES.daily.content);
    const arr = createEntry(tree, { name: `${today}.md`, type: 'text', parentId: VAULT_ID, content });
    commit(arr);
    openNote(arr[arr.length - 1].id);
    setMode('edit');
  };

  const insertTemplate = key => {
    if (!TEMPLATES[key]) return;
    const text = fillTemplate(TEMPLATES[key].content);
    if (!active) { createNote('Untitled', VAULT_ID, key); return; }
    const area = areaRef.current;
    if (area) {
      const pos = area.selectionStart;
      setDraft(draft.slice(0, pos) + text + draft.slice(pos));
    } else {
      setDraft(draft + '\n' + text);
    }
    setTemplateMenuOpen(false);
  };

  const toggleStar = id => {
    setStarred(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      storage.set('notes-starred', next);
      return next;
    });
  };

  const createFolder = (parentId = VAULT_ID) => {
    const name = window.prompt('Folder name:');
    if (!name?.trim()) return;
    commit(createEntry(tree, { name: name.trim(), type: 'folder', parentId }));
  };

  const renameEntry = entry => {
    const name = window.prompt('Rename to:', entry.name);
    if (!name?.trim() || name.trim() === entry.name) return;
    commit(updateEntry(tree, entry.id, { name: name.trim() }));
  };

  const deleteEntry = async entry => {
    const what = entry.type === 'folder' ? `folder "${entry.name}" and everything inside it` : `note "${entry.name}"`;
    if (!window.confirm(`Move ${what} to the Recycle Bin?`)) return;
    const next = trashEntry(tree, entry.id);
    commit(next);
    setTabs(prev => prev.filter(id => next.some(item => item.id === id)));
    setActiveId(current => (next.some(item => item.id === current) ? current : null));
  };

  const restore = entry => {
    const next = restoreEntry(tree, entry.id);
    commit(next);
    setActiveId(current => (next.some(item => item.id === current) ? current : null));
  };

  const deletePermanent = async entry => {
    const what = entry.type === 'folder' ? `folder "${entry.name}" and everything inside it` : `note "${entry.name}"`;
    if (!window.confirm(`Permanently delete ${what}? This cannot be undone.`)) return;
    const next = await removeEntryDeep(tree, entry.id);
    commit(next);
    setTabs(prev => prev.filter(id => next.some(item => item.id === id)));
    setActiveId(current => (next.some(item => item.id === current) ? current : null));
  };

  const openWiki = target => {
    const existing = vaultNotes.find(e => noteName(e).toLowerCase() === target.toLowerCase());
    if (existing) { openNote(existing.id); return; }
    const arr = createEntry(tree, { name: `${target}.md`, type: 'text', parentId: VAULT_ID, content: '' });
    commit(arr);
    openNote(arr[arr.length - 1].id);
  };

  const exportNote = () => {
    if (!active) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${noteName(active)}</title><style>body{font-family:system-ui;max-width:800px;margin:2em auto;padding:0 1em;background:#1e1f24;color:#e5e5e5;line-height:1.7}pre{background:#0004;padding:1em;border-radius:8px;overflow-x:auto}code{font-size:.9em}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:8px 12px}th{background:#ffffff10}blockquote{border-left:3px solid #a78bfa;padding:6px 14px;margin:.6em 0;background:#a78bfa10;border-radius:0 8px 8px 0}img{max-width:100%;border-radius:8px}</style></head><body>${renderMarkdown(draft)}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${noteName(active)}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ----- Keyboard shortcuts ----- */
  useEffect(() => {
    const onKey = event => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === 'n') { event.preventDefault(); createNote(); }
      if (ctrl && event.key.toLowerCase() === 'o') { event.preventDefault(); setSwitcherOpen(true); }
      if (ctrl && event.key.toLowerCase() === 'p') { event.preventDefault(); setCmdPaletteOpen(true); }
      if (ctrl && event.key.toLowerCase() === 'e') { event.preventDefault(); setMode(m => (m === 'edit' ? 'preview' : m === 'preview' ? 'split' : m === 'split' ? 'live' : 'edit')); setInlineEdit(null); }
      if (ctrl && event.key.toLowerCase() === 'g') { event.preventDefault(); setGraphOpen(v => !v); }
      if (ctrl && event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); createDailyNote(); }
      if (ctrl && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); }
      if (ctrl && event.key.toLowerCase() === 's') { event.preventDefault(); /* auto-saved */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line

  useEffect(() => {
    const onOpenNote = event => openNote(event.detail);
    window.addEventListener('lithium:open-note', onOpenNote);
    return () => window.removeEventListener('lithium:open-note', onOpenNote);
  }, []); // eslint-disable-line

  /* ----- Editor helpers ----- */
  const editSelection = transform => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart, selectionEnd } = area;
    const selected = draft.slice(selectionStart, selectionEnd);
    const replaced = transform(selected);
    setDraft(draft.slice(0, selectionStart) + replaced + draft.slice(selectionEnd));
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(selectionStart, selectionStart + replaced.length); });
  };

  const wrapSelection = (before, after = before, placeholder = 'text') =>
    editSelection(selected => (selected ? `${before}${selected}${after}` : `${before}${placeholder}${after}`));

  const setHeading = level =>
    editSelection(selected => {
      const lines = (selected || 'Heading').split('\n');
      return lines.map(line => applyHeading(line, level)).join('\n');
    });

  const prefixLines = prefix =>
    editSelection(selected => (selected || 'item').split('\n').map(line => prefix + line).join('\n'));

  const onEditorKey = event => {
    // Tab key inserts spaces
    if (event.key === 'Tab') {
      event.preventDefault();
      const area = event.currentTarget;
      const pos = area.selectionStart;
      setDraft(draft.slice(0, pos) + '  ' + draft.slice(pos));
      requestAnimationFrame(() => area.setSelectionRange(pos + 2, pos + 2));
      return;
    }
    if (event.key !== 'Enter' || !notesSettings.smartLists) return;
    const area = event.currentTarget;
    const { selectionStart } = area;
    const lineStart = draft.lastIndexOf('\n', selectionStart - 1) + 1;
    const line = draft.slice(lineStart, selectionStart);
    const match = line.match(/^(\s*)([-*] \[[ x]\] |[-*] |(\d+)\. )(.*)$/);
    if (!match) return;
    event.preventDefault();
    const [, indent, prefix, num, rest] = match;
    if (!rest.trim()) {
      setDraft(draft.slice(0, lineStart) + draft.slice(selectionStart));
      requestAnimationFrame(() => area.setSelectionRange(lineStart, lineStart));
    } else {
      const nextPrefix = prefix.startsWith('- [') ? '- [ ] ' : num ? `${Number(num) + 1}. ` : prefix;
      const insert = `\n${indent}${nextPrefix}`;
      setDraft(draft.slice(0, selectionStart) + insert + draft.slice(selectionStart));
      requestAnimationFrame(() => { const pos = selectionStart + insert.length; area.setSelectionRange(pos, pos); });
    }
  };

  /* ----- Command palette ----- */
  const commands = useMemo(() => [
    { id: 'new-note', label: 'New note', icon: 'Plus', shortcut: 'Ctrl+N', action: () => createNote() },
    { id: 'daily-note', label: "Open today's daily note", icon: 'Calendar', shortcut: 'Ctrl+Shift+D', action: () => createDailyNote() },
    { id: 'go-to-file', label: 'Go to file…', icon: 'Search', shortcut: 'Ctrl+O', action: () => { setCmdPaletteOpen(false); setSwitcherOpen(true); } },
    { id: 'toggle-graph', label: 'Toggle graph view', icon: 'Network', shortcut: 'Ctrl+G', action: () => setGraphOpen(v => !v) },
    { id: 'graph-local', label: 'Open local graph', icon: 'GitBranch', action: () => { setGraphMode('local'); setGraphOpen(true); } },
    { id: 'toggle-outline', label: 'Toggle outline', icon: 'List', action: () => setOutlineOpen(v => !v) },
    { id: 'toggle-backlinks', label: 'Toggle backlinks', icon: 'Link2', action: () => setBacklinksOpen(v => !v) },
    { id: 'toggle-tags', label: 'Toggle tag browser', icon: 'Tag', action: () => setTagsOpen(v => !v) },
    { id: 'toggle-sidebar', label: 'Toggle sidebar', icon: 'PanelLeft', action: () => setSidebarOpen(v => !v) },
    { id: 'mode-edit', label: 'Switch to edit mode', icon: 'Pencil', action: () => setMode('edit') },
    { id: 'mode-preview', label: 'Switch to reading mode', icon: 'Eye', action: () => setMode('preview') },
    { id: 'mode-split', label: 'Switch to split view', icon: 'Layout', action: () => setMode('split') },
    { id: 'mode-live', label: 'Switch to live preview', icon: 'Sparkles', action: () => setMode('live') },
    { id: 'search-vault', label: 'Search vault…', icon: 'Search', shortcut: 'Ctrl+F', action: () => { setCmdPaletteOpen(false); setSearchOpen(true); } },
    { id: 'export-html', label: 'Export as HTML', icon: 'Download', action: () => exportNote() },
    { id: 'star-note', label: active ? (starred.includes(active.id) ? 'Unstar note' : 'Star note') : 'Star note', icon: 'Star', action: () => { if (active) toggleStar(active.id); } },
    { id: 'insert-template', label: 'Insert template…', icon: 'FilePlus', action: () => { setCmdPaletteOpen(false); setTemplateMenuOpen(true); } },
    { id: 'spell-check', label: `Spell check: ${spellCheck ? 'ON' : 'OFF'}`, icon: 'SpellCheck', action: () => setSpellCheck(v => !v) },
    { id: 'settings', label: 'Open Notes settings', icon: 'SlidersHorizontal', action: () => setSettingsOpen(true) },
  ], [active, starred, spellCheck]); // eslint-disable-line

  const cmdResults = cmdQuery.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(cmdQuery.trim().toLowerCase()))
    : commands;

  /* ----- Full-text search ----- */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return vaultNotes.filter(e => {
      const name = noteName(e).toLowerCase();
      const content = (e.content || '').toLowerCase();
      return name.includes(q) || content.includes(q);
    }).map(e => {
      const content = e.content || '';
      const idx = content.toLowerCase().indexOf(q);
      let snippet = '';
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + q.length + 60);
        snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
      }
      return { entry: e, snippet };
    });
  }, [searchQuery, vaultNotes]);

  useEffect(() => storage.set('notes-spellcheck', spellCheck), [spellCheck]);
  useEffect(() => storage.set('notes-settings', notesSettings), [notesSettings]);

  const switcherResults = switcherQuery.trim()
    ? vaultNotes.filter(e => noteName(e).toLowerCase().includes(switcherQuery.trim().toLowerCase()))
    : vaultNotes;

  /* ----- Vault tree ----- */
  const trashedFolders = useMemo(() => new Set(tree.filter(i => i.type === 'folder' && i.parentId === TRASH_ID).map(i => i.id)), [tree]);

  const noteMenu = entry => isTrashed(entry) ? [
    { id: 'restore', label: 'Restore', icon: 'Undo2', action: () => restore(entry) },
    { id: 'sep-1', type: 'separator' },
    { id: 'delete', label: 'Delete permanently', icon: 'Trash2', danger: true, action: () => deletePermanent(entry) },
  ] : [
    { id: 'open', label: 'Open', icon: 'FileText', action: () => openNote(entry.id) },
    { id: 'star', label: starred.includes(entry.id) ? 'Unstar' : 'Star', icon: 'Star', action: () => toggleStar(entry.id) },
    { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => renameEntry(entry) },
    { id: 'sep-1', type: 'separator' },
    { id: 'delete', label: 'Delete note', icon: 'Trash2', danger: true, action: () => deleteEntry(entry) },
  ];

  const folderMenu = entry => isTrashed(entry) ? [
    { id: 'restore', label: 'Restore folder', icon: 'Undo2', action: () => restore(entry) },
    { id: 'sep-1', type: 'separator' },
    { id: 'delete', label: 'Delete folder permanently', icon: 'Trash2', danger: true, action: () => deletePermanent(entry) },
  ] : [
    { id: 'new-note', label: 'New note here', icon: 'Plus', action: () => createNote('Untitled', entry.id) },
    { id: 'new-folder', label: 'New folder here', icon: 'FolderPlus', action: () => createFolder(entry.id) },
    { id: 'sep-1', type: 'separator' },
    { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => renameEntry(entry) },
    { id: 'delete', label: 'Delete folder', icon: 'Trash2', danger: true, action: () => deleteEntry(entry) },
  ];

  const renderTree = folderId => (
    <React.Fragment key={folderId}>
      {childrenOf(tree, folderId).map(entry => {
        if (entry.type === 'folder') {
          const open = openFolders[entry.id];
          return (
            <React.Fragment key={entry.id}>
              <button className="notes-row" onClick={() => setOpenFolders(p => ({ ...p, [entry.id]: !p[entry.id] }))} onContextMenu={e => openMenu(e, folderMenu(entry))}>
                {open ? <Icon name="ChevronDown" size={12} /> : <Icon name="ChevronRight" size={12} />}
                {open ? <Icon name="FolderOpen" size={14} color="#f59e0b" /> : <Icon name="Folder" size={14} color="#f59e0b" />}
                <span className="truncate">{entry.name}</span>
              </button>
              {open && <div className="ml-4">{renderTree(entry.id)}</div>}
            </React.Fragment>
          );
        }
        if (isHidden(entry.name) || !/\.(md|txt)$/i.test(entry.name)) return null;
        const isStarred = starred.includes(entry.id);
        return (
          <button key={entry.id} className={`notes-row ${activeId === entry.id ? 'active' : ''}`} onClick={() => openNote(entry.id)} onContextMenu={e => openMenu(e, noteMenu(entry))}>
            <span className="w-3" />
            <Icon name="FileText" size={14} className="acc-text" />
            <span className="truncate">{noteName(entry)}</span>
            {isStarred && <Icon name="Star" size={10} className="ml-auto text-yellow-400 shrink-0" />}
          </button>
        );
      })}
    </React.Fragment>
  );

  const contextItems = () => [
    { id: 'md', label: 'Make markdown text', icon: 'PencilLine', items: [
      { id: 'bold', label: 'Bold', shortcut: '**text**', action: () => wrapSelection('**') },
      { id: 'italic', label: 'Italic', shortcut: '*text*', action: () => wrapSelection('*') },
      { id: 'strike', label: 'Strikethrough', shortcut: '~~', action: () => wrapSelection('~~') },
      { id: 'highlight', label: 'Highlight', shortcut: '==', action: () => wrapSelection('==') },
      { id: 'sep-1', type: 'separator' },
      { id: 'h1', label: 'Heading 1', shortcut: '#', action: () => setHeading(1) },
      { id: 'h2', label: 'Heading 2', shortcut: '##', action: () => setHeading(2) },
      { id: 'h3', label: 'Heading 3', shortcut: '###', action: () => setHeading(3) },
      { id: 'sep-2', type: 'separator' },
      { id: 'bullet', label: 'Bullet list', shortcut: '-', action: () => prefixLines('- ') },
      { id: 'task', label: 'Task list', shortcut: '- [ ]', action: () => prefixLines('- [ ] ') },
      { id: 'quote', label: 'Quote', shortcut: '>', action: () => prefixLines('> ') },
      { id: 'sep-3', type: 'separator' },
      { id: 'code', label: 'Inline code', shortcut: '`', action: () => wrapSelection('`', '`', 'code') },
      { id: 'wikilink', label: 'Wiki link', shortcut: '[[]]', action: () => wrapSelection('[[', ']]', 'Note') },
      { id: 'link', label: 'Link', shortcut: '[t](url)', action: () => editSelection(s => `[${s || 'text'}](https://)`) },
    ]},
    { id: 'preview', label: mode === 'preview' ? 'Switch to edit' : mode === 'split' ? 'Switch to edit' : 'Switch to reading', icon: mode === 'edit' ? 'Eye' : 'Pencil', action: () => setMode(m => (m === 'edit' ? 'preview' : 'edit')) },
    { id: 'split', label: 'Split view', icon: 'Layout', action: () => setMode('split') },
    { id: 'spell', label: 'Spell check', icon: 'SpellCheck', checked: spellCheck, action: () => setSpellCheck(v => !v) },
    { id: 'sep-1', type: 'separator' },
    { id: 'new', label: 'New note', icon: 'Plus', shortcut: 'Ctrl+N', action: () => createNote() },
    { id: 'daily', label: "Today's daily note", icon: 'Calendar', shortcut: 'Ctrl+Shift+D', action: () => createDailyNote() },
    { id: 'cmd', label: 'Command palette', icon: 'Terminal', shortcut: 'Ctrl+P', action: () => setCmdPaletteOpen(true) },
    { id: 'goto', label: 'Go to file…', icon: 'Search', shortcut: 'Ctrl+O', action: () => setSwitcherOpen(true) },
    { id: 'graph', label: 'Graph view', icon: 'Network', shortcut: 'Ctrl+G', action: () => setGraphOpen(v => !v) },
    { id: 'export', label: 'Export as HTML', icon: 'Download', action: () => exportNote() },
  ];

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const lineCount = draft.split('\n').length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#1e1f24] text-white" onContextMenu={e => openMenu(e, contextItems())}>
      <div className="relative flex min-h-0 flex-1">
      {/* Ribbon */}
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-black/40 bg-[#191a1f] py-2">
        <button className={`notes-rail ${sidebarOpen ? 'active' : ''}`} title="Vault" onClick={() => setSidebarOpen(v => !v)}><Icon name="Folder" size={16} /></button>
        <button className="notes-rail" title="Go to file (Ctrl+O)" onClick={() => setSwitcherOpen(true)}><Icon name="Search" size={16} /></button>
        <button className={`notes-rail ${graphOpen ? 'active' : ''}`} title="Graph view (Ctrl+G)" onClick={() => setGraphOpen(v => !v)}><Icon name="Network" size={16} /></button>
        <button className={`notes-rail ${outlineOpen ? 'active' : ''}`} title="Outline" onClick={() => setOutlineOpen(v => !v)}><Icon name="List" size={16} /></button>
        <button className={`notes-rail ${backlinksOpen ? 'active' : ''}`} title="Backlinks" onClick={() => setBacklinksOpen(v => !v)}><Icon name="Link2" size={16} /></button>
        <button className={`notes-rail ${tagsOpen ? 'active' : ''}`} title="Tags" onClick={() => setTagsOpen(v => !v)}><Icon name="Tag" size={16} /></button>
        <button className="notes-rail" title="Search vault (Ctrl+F)" onClick={() => setSearchOpen(true)}><Icon name="Search" size={16} /></button>
        <button className={`notes-rail ${settingsOpen ? 'active' : ''}`} title="Settings" onClick={() => setSettingsOpen(v => !v)}><Icon name="SlidersHorizontal" size={16} /></button>
        <div className="mt-auto" />
        <button className="notes-rail" title="Command palette (Ctrl+P)" onClick={() => setCmdPaletteOpen(true)}><Icon name="Terminal" size={16} /></button>
        <button className="notes-rail" title="New note (Ctrl+N)" onClick={() => createNote()}><Icon name="Plus" size={16} /></button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="flex w-52 shrink-0 flex-col border-r border-black/40 bg-[#232429]">
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Vault
            <span className="flex gap-1">
              <button className="text-white/40 hover:text-white" title="Daily note" onClick={() => createDailyNote()}><Icon name="Calendar" size={13} /></button>
              <button className="text-white/40 hover:text-white" title="New folder" onClick={() => createFolder()}><Icon name="FolderPlus" size={13} /></button>
              <button className="text-white/40 hover:text-white" title="New note" onClick={() => createNote()}><Icon name="Plus" size={13} /></button>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pb-2 pr-1">
            {/* Starred section */}
            {starredNotes.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  <Icon name="Star" size={10} className="text-yellow-400" /> Starred
                </div>
                {starredNotes.map(entry => (
                  <button key={entry.id} className={`notes-row ${activeId === entry.id ? 'active' : ''}`} onClick={() => openNote(entry.id)}>
                    <Icon name="Star" size={11} className="text-yellow-400" />
                    <span className="truncate">{noteName(entry)}</span>
                  </button>
                ))}
              </div>
            )}
            {renderTree(VAULT_ID)}
            {trashedFolders.size > 0 && (
              <div className="mt-3 border-t border-white/[0.06] pt-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  <Icon name="Trash2" size={11} /> Recycle Bin
                </div>
                {tree.filter(i => i.parentId === TRASH_ID).map(entry => (
                  <button key={entry.id} className="notes-row" onContextMenu={e => openMenu(e, entry.type === 'folder' ? folderMenu(entry) : noteMenu(entry))} title={entry.name}>
                    {entry.type === 'folder' ? <Icon name="Folder" size={12} className="text-white/40" /> : <Icon name="FileText" size={12} className="text-white/40" />}
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flex w-full items-center gap-1.5 border-t border-black/40 px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.04]" title="Switch note" onClick={() => setSwitcherOpen(true)}>
            <Icon name="BookOpen" size={12} className="acc-text" />
            <span className="min-w-0 flex-1 truncate text-left">{active ? noteName(active) : `${vaultNotes.length} notes`}</span>
            <Icon name="ChevronDown" size={12} />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Tabs */}
        <div className="flex min-w-0 items-center overflow-hidden border-b border-black/40 bg-[#191a1f]">
          <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {tabs.map(id => {
              const entry = getEntry(tree, id);
              if (!entry) return null;
              return (
                <div key={id} className={`group flex items-center gap-2 border-r border-black/40 px-3 py-2 text-xs ${activeId === id ? 'bg-[#1e1f24] text-white' : 'text-white/50 hover:bg-white/[0.04]'}`} onClick={() => setActiveId(id)}>
                  <Icon name="FileText" size={12} className="acc-text" />
                  <span className="max-w-[120px] truncate">{noteName(entry)}</span>
                  {starred.includes(id) && <Icon name="Star" size={9} className="text-yellow-400" />}
                  <button className="text-white/30 opacity-0 group-hover:opacity-100 hover:text-white" onClick={e => { e.stopPropagation(); closeTab(id); }} aria-label="Close tab"><Icon name="X" size={12} /></button>
                </div>
              );
            })}
          </div>
          <button className="px-3 py-2 text-white/50 hover:text-white" title="New tab (Ctrl+N)" onClick={() => createNote()}><Icon name="Plus" size={14} /></button>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>

        {/* Toolbar */}
        {active && (
          <div className="flex items-center gap-1 border-b border-black/40 px-3 py-1.5 text-xs text-white/50">
            <button className={`notes-tool ${mode === 'edit' ? 'active' : ''}`} title="Edit" onClick={() => { setMode('edit'); setInlineEdit(null); }}><Icon name="Pencil" size={13} /></button>
            <button className={`notes-tool ${mode === 'preview' ? 'active' : ''}`} title="Reading mode (Ctrl+E)" onClick={() => { setMode('preview'); setInlineEdit(null); }}><Icon name="Eye" size={13} /></button>
            <button className={`notes-tool ${mode === 'split' ? 'active' : ''}`} title="Split view (Ctrl+E)" onClick={() => { setMode('split'); setInlineEdit(null); }}><Icon name="Layout" size={13} /></button>
            <button className={`notes-tool ${mode === 'live' ? 'active' : ''}`} title="Live preview — click any block to edit (Ctrl+E)" onClick={() => setMode('live')}><Icon name="Sparkles" size={13} /></button>
            <span className="mx-1 w-px self-stretch bg-white/10" />
            <button className="notes-tool" title="Star / unstar" onClick={() => toggleStar(active.id)}>
              <Icon name={starred.includes(active.id) ? 'Star' : 'Star'} size={13} className={starred.includes(active.id) ? 'text-yellow-400' : ''} />
            </button>
            <button className="notes-tool" title="Insert template" onClick={() => setTemplateMenuOpen(true)}><Icon name="FilePlus" size={13} /></button>
            <button className="notes-tool" title="Export HTML" onClick={() => exportNote()}><Icon name="Download" size={13} /></button>
            <span className="ml-auto flex items-center gap-3">
              {frontmatter.tags && <span className="flex items-center gap-1 text-[10px] text-white/30"><Icon name="Tag" size={10} />{Array.isArray(frontmatter.tags) ? frontmatter.tags.length : 0}</span>}
              <span>{lineCount} lines · {wordCount} words · {readTime} min read</span>
              {backlinks.length > 0 && <span className="acc-text cursor-pointer" title="Open backlinks panel" onClick={() => setBacklinksOpen(true)}>{backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}</span>}
            </span>
          </div>
        )}

        {/* Frontmatter bar */}
        {active && Object.keys(frontmatter).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-black/40 bg-[#1a1b20] px-3 py-1.5 text-[10px] text-white/40">
            {Object.entries(frontmatter).map(([key, val]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="font-semibold text-white/50">{key}:</span>
                {Array.isArray(val) ? val.map(v => <span key={v} className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">#{v}</span>) : <span className="text-white/60">{val}</span>}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-sm acc-text">
            <button className="hover:underline" onClick={() => createNote()}>Create new note (Ctrl + N)</button>
            <button className="hover:underline" onClick={() => createDailyNote()}>Open today&apos;s daily note (Ctrl+Shift+D)</button>
            <button className="hover:underline" onClick={() => setSwitcherOpen(true)}>Go to file (Ctrl + O)</button>
            <button className="hover:underline" onClick={() => setCmdPaletteOpen(true)}>Command palette (Ctrl + P)</button>
            <button className="text-white/40 hover:underline" onClick={() => setSidebarOpen(v => !v)}>{sidebarOpen ? 'Close sidebar' : 'Open sidebar'}</button>
          </div>
        ) : mode === 'edit' ? (
          <div className="flex min-h-0 flex-1">
            {notesSettings.lineNumbers && (
              <div ref={gutterRef} className="w-10 shrink-0 select-none overflow-hidden border-r border-black/40 bg-[#191a1f] py-4 pr-2 text-right font-mono text-[13px] text-white/30" style={{ lineHeight: 1.7 }} aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
              </div>
            )}
            <textarea ref={areaRef} className="notes-editor" value={draft} spellCheck={spellCheck} dir={notesSettings.rtl ? 'rtl' : 'ltr'} onChange={e => setDraft(e.target.value)} onKeyDown={onEditorKey} onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} placeholder="Write markdown… use [[Wiki links]] to connect notes.&#10;&#10;Ctrl+P for commands · Ctrl+G for graph · Ctrl+E to toggle reading mode" />
          </div>
        ) : mode === 'preview' ? (
          <div className="md-body flex-1 overflow-y-auto px-6 py-4" onClick={e => { const wiki = e.target.closest('[data-wiki]'); if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); } const embed = e.target.closest('[data-embed]'); if (embed) { e.preventDefault(); openWiki(embed.dataset.embed); } const tag = e.target.closest('.md-tag'); if (tag) { e.preventDefault(); setTagsOpen(true); } }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : mode === 'split' ? (
          /* Split mode */
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 border-r border-black/40">
              {notesSettings.lineNumbers && (
                <div ref={gutterRef} className="w-10 shrink-0 select-none overflow-hidden border-r border-black/40 bg-[#191a1f] py-4 pr-2 text-right font-mono text-[13px] text-white/30" style={{ lineHeight: 1.7 }} aria-hidden>
                  {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
              )}
              <textarea ref={areaRef} className="notes-editor" value={draft} spellCheck={spellCheck} dir={notesSettings.rtl ? 'rtl' : 'ltr'} onChange={e => setDraft(e.target.value)} onKeyDown={onEditorKey} onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} placeholder="Write markdown…" />
            </div>
            <div className="md-body min-h-0 flex-1 overflow-y-auto px-6 py-4" onClick={e => { const wiki = e.target.closest('[data-wiki]'); if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); } }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        ) : mode === 'live' ? (
          /* Live Preview — click any rendered block to edit its source */
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              className="md-body flex-1 overflow-y-auto px-6 py-4"
              onClick={e => {
                const wiki = e.target.closest('[data-wiki]');
                if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); return; }
                const embed = e.target.closest('[data-embed]');
                if (embed) { e.preventDefault(); openWiki(embed.dataset.embed); return; }
                const tag = e.target.closest('.md-tag');
                if (tag) { e.preventDefault(); setTagsOpen(true); return; }
                // Find the nearest block with a source-line attribute
                const block = e.target.closest('[data-source-line]');
                if (!block) return;
                const srcLine = parseInt(block.dataset.sourceLine, 10);
                if (isNaN(srcLine)) return;
                const draftLines = draft.split('\n');
                // Determine the block extent: find the next blank line or structural boundary
                let endLine = srcLine;
                while (endLine < draftLines.length - 1 && draftLines[endLine].trim() !== '' && !/^(#{1,6})\s/.test(draftLines[endLine + 1]) && !/^```/.test(draftLines[endLine + 1]) && !/^>\s?/.test(draftLines[endLine + 1]) && !/^\s*[-*+]\s+/.test(draftLines[endLine + 1]) && !/^\s*\d+\.\s+/.test(draftLines[endLine + 1])) {
                  endLine++;
                }
                const blockText = draftLines.slice(srcLine, endLine + 1).join('\n');
                const rect = block.getBoundingClientRect();
                const container = e.currentTarget.getBoundingClientRect();
                setInlineEdit({
                  startLine: srcLine,
                  endLine: endLine,
                  top: rect.top - container.top + e.currentTarget.scrollTop,
                  text: blockText,
                });
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            {/* Inline edit overlay */}
            {inlineEdit && (
              <div
                className="absolute left-4 right-4 z-20 overflow-hidden rounded-xl border border-purple-500/30 bg-[#1a1b22] shadow-2xl"
                style={{ top: Math.max(8, inlineEdit.top - 4), maxHeight: '60%' }}
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5 text-[10px] text-white/40">
                  <Icon name="Pencil" size={11} className="acc-text" />
                  <span>Editing lines {inlineEdit.startLine + 1}–{inlineEdit.endLine + 1}</span>
                  <span className="ml-auto text-white/25">Changes apply live · Esc to close</span>
                </div>
                <textarea
                  autoFocus
                  className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/20"
                  style={{ minHeight: Math.max(80, inlineEdit.text.split('\n').length * 22 + 24), maxHeight: '50vh' }}
                  value={inlineEdit.text}
                  spellCheck={spellCheck}
                  onChange={e => setInlineEdit(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onBlur={() => commitInlineEdit()}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      commitInlineEdit();
                    }
                  }}
                />
              </div>
            )}
          </div>
        ) : null}

        {/* Status bar */}
        {active && (
          <div className="flex items-center gap-3 border-t border-black/40 bg-[#191a1f] px-3 py-1 text-[10px] text-white/30">
            <span>{noteName(active)}</span>
            {frontmatter.tags && Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0 && (
              <span className="flex items-center gap-1">{frontmatter.tags.map(t => <span key={t} className="text-purple-400/60">#{t}</span>)}</span>
            )}
            <span className="ml-auto">{draft.length} chars</span>
            <span>Ln {draft.slice(0, areaRef.current?.selectionStart || 0).split('\n').length}</span>
          </div>
        )}
      </div>

      {/* Outline panel */}
      {outlineOpen && (
        <div className="flex w-48 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="List" size={11} className="acc-text" /> Outline
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setOutlineOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {headings.length === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No headings found</div>
            ) : headings.map((h, i) => (
              <button key={i} className="notes-row text-[11px]" style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }} onClick={() => {
                if (mode === 'edit' && areaRef.current) {
                  const lines = draft.split('\n');
                  let pos = 0;
                  for (let li = 0; li < h.line; li++) pos += lines[li].length + 1;
                  areaRef.current.focus();
                  areaRef.current.setSelectionRange(pos, pos);
                }
              }}>
                <span className="truncate" style={{ opacity: 1 - (h.level - 1) * 0.15 }}>{h.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks panel */}
      {backlinksOpen && (
        <div className="flex w-56 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="Link2" size={11} className="acc-text" /> Backlinks ({backlinks.length})
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setBacklinksOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {backlinks.length === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No backlinks to this note</div>
            ) : backlinks.map(({ entry, contexts }) => (
              <div key={entry.id} className="mb-2">
                <button className="notes-row text-[11px]" onClick={() => openNote(entry.id)}>
                  <Icon name="FileText" size={11} className="acc-text" />
                  <span className="truncate font-medium">{noteName(entry)}</span>
                </button>
                {contexts.map((ctx, ci) => (
                  <div key={ci} className="mx-2 mb-1 rounded bg-white/[0.03] px-2 py-1 text-[10px] text-white/50 leading-relaxed">
                    {ctx.text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags panel */}
      {tagsOpen && (
        <div className="flex w-48 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="Tag" size={11} className="acc-text" /> Tags ({allTags.size})
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setTagsOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {allTags.size === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No tags in vault</div>
            ) : [...allTags.entries()].sort((a, b) => b[1].length - a[1].length).map(([tag, entries]) => (
              <div key={tag} className="mb-1">
                <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-purple-300 hover:bg-white/[0.04] cursor-default">
                  <span className="text-purple-400/70">#{tag}</span>
                  <span className="ml-auto text-[9px] text-white/30">{entries.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick switcher */}
      {switcherOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setSwitcherOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <input autoFocus className="w-full bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Go to file…" value={switcherQuery} onChange={e => setSwitcherQuery(e.target.value)} onKeyDown={e => {
              if (e.key === 'Enter' && switcherResults.length) openNote(switcherResults[0].id);
              if (e.key === 'Escape') setSwitcherOpen(false);
            }} />
            <div className="max-h-64 overflow-y-auto border-t border-white/[0.06] py-1">
              {switcherResults.map(entry => (
                <button key={entry.id} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={() => openNote(entry.id)}>
                  <Icon name="FileText" size={13} className="acc-text" /> {noteName(entry)}
                  {starred.includes(entry.id) && <Icon name="Star" size={9} className="text-yellow-400" />}
                </button>
              ))}
              {switcherResults.length === 0 && (
                <button className="w-full px-4 py-2 text-left text-xs acc-text hover:bg-white/[0.06]" onClick={() => { createNote(switcherQuery.trim() || 'Untitled'); setSwitcherOpen(false); }}>
                  Create &quot;{switcherQuery.trim()}&quot;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command palette */}
      {cmdPaletteOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setCmdPaletteOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
              <Icon name="Terminal" size={14} className="acc-text" />
              <input autoFocus className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Type a command…" value={cmdQuery} onChange={e => setCmdQuery(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && cmdResults.length) { cmdResults[0].action(); }
                if (e.key === 'Escape') setCmdPaletteOpen(false);
              }} />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {cmdResults.map(cmd => (
                <button key={cmd.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={cmd.action}>
                  <Icon name={cmd.icon} size={14} className="acc-text shrink-0" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && <span className="text-[10px] text-white/25 font-mono">{cmd.shortcut}</span>}
                </button>
              ))}
              {cmdResults.length === 0 && <div className="px-4 py-3 text-center text-[11px] text-white/30">No matching commands</div>}
            </div>
          </div>
        </div>
      )}

      {/* Search panel */}
      {searchOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
              <Icon name="Search" size={14} className="acc-text" />
              <input autoFocus className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Search all notes…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }} />
              <button className="text-white/40 hover:text-white" onClick={() => setSearchOpen(false)}><Icon name="X" size={14} /></button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {searchResults.length === 0 && searchQuery.trim() && <div className="px-4 py-3 text-center text-[11px] text-white/30">No results found</div>}
              {searchResults.map(({ entry, snippet }) => (
                <button key={entry.id} className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-white/[0.06]" onClick={() => { openNote(entry.id); setSearchOpen(false); }}>
                  <span className="flex items-center gap-2 text-xs text-white/80">
                    <Icon name="FileText" size={12} className="acc-text" /> {noteName(entry)}
                  </span>
                  {snippet && <span className="pl-5 text-[10px] text-white/40 leading-relaxed">{snippet}</span>}
                </button>
              ))}
              {!searchQuery.trim() && <div className="px-4 py-6 text-center text-[11px] text-white/30">Type to search across all vault notes</div>}
            </div>
          </div>
        </div>
      )}

      {/* Template menu */}
      {templateMenuOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setTemplateMenuOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <Icon name="FilePlus" size={14} className="acc-text" />
              <span className="text-sm text-white/80">Insert template</span>
              <button className="ml-auto text-white/40 hover:text-white" onClick={() => setTemplateMenuOpen(false)}><Icon name="X" size={14} /></button>
            </div>
            <div className="py-1">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <button key={key} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={() => insertTemplate(key)}>
                  <Icon name="FileText" size={13} className="acc-text" />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Graph view */}
      {graphOpen && (
        <InteractiveGraph
          notes={vaultNotes}
          activeId={activeId}
          mode={graphMode}
          onModeChange={setGraphMode}
          onOpen={id => { openNote(id); }}
          onClose={() => setGraphOpen(false)}
        />
      )}

      {/* Settings */}
      {settingsOpen && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-64 flex-col border-l border-black/40 bg-[#232429] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-black/40 px-4 py-3 text-xs font-semibold text-white/80">
            <Icon name="SlidersHorizontal" size={13} className="acc-text" /> Notes settings
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setSettingsOpen(false)}><Icon name="X" size={14} /></button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {[
              { key: 'lineNumbers', label: 'Line numbers', hint: 'Show a gutter in the editor' },
              { key: 'smartLists', label: 'Smart lists', hint: 'Enter continues -, *, 1. and task lists' },
              { key: 'rtl', label: 'Right-to-left text', hint: 'RTL direction for the editor' },
              { key: 'foldHeadings', label: 'Fold headings', hint: 'Collapse content under headings' },
              { key: 'typographer', label: 'Typographer', hint: 'Smart quotes and dashes' },
            ].map(option => (
              <button key={option.key} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]" onClick={() => setNotesSettings(p => ({ ...p, [option.key]: !p[option.key] }))}>
                <span>
                  <span className="block text-xs text-white/85">{option.label}</span>
                  <span className="block text-[10px] text-white/35">{option.hint}</span>
                </span>
                <span className={`h-4 w-8 shrink-0 rounded-full p-0.5 transition-colors ${notesSettings[option.key] ? 'acc-bg' : 'bg-white/15'}`}>
                  <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${notesSettings[option.key] ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            ))}
            <button className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]" onClick={() => setSpellCheck(v => !v)}>
              <span>
                <span className="block text-xs text-white/85">Spell check</span>
                <span className="block text-[10px] text-white/35">Browser spellchecking in the editor</span>
              </span>
              <span className={`h-4 w-8 shrink-0 rounded-full p-0.5 transition-colors ${spellCheck ? 'acc-bg' : 'bg-white/15'}`}>
                <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${spellCheck ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            <div className="pt-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Hotkeys</div>
            {[
              ['Ctrl+N', 'New note'],
              ['Ctrl+O', 'Go to file / quick switch'],
              ['Ctrl+P', 'Command palette'],
              ['Ctrl+E', 'Cycle edit → read → split → live'],
              ['Ctrl+G', 'Toggle graph view'],
              ['Ctrl+F', 'Search vault'],
              ['Ctrl+Shift+D', "Open today's daily note"],
              ['Tab', 'Insert indent in editor'],
              ['Esc', 'Close dialogs'],
            ].map(([keys, what]) => (
              <div key={keys} className="flex justify-between px-2 py-1 text-[11px] text-white/50">
                <span className="font-mono acc-text">{keys}</span> {what}
              </div>
            ))}
          </div>
        </div>
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      </div>
    </div>
  );
}

function isInsideVault(tree, entry) {
  let current = entry;
  while (current && current.id !== 'root') {
    if (current.parentId === VAULT_ID) return true;
    current = getEntry(tree, current.parentId);
  }
  return false;
}

/* ---------- Interactive canvas-based graph view ---------- */

function InteractiveGraph({ notes, activeId, mode, onModeChange, onOpen, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dragNode, setDragNode] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const simRef = useRef(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Build graph data
  const graphData = useMemo(() => {
    const activeNote = activeId ? notes.find(n => n.id === activeId) : null;
    const activeLinks = new Set();
    if (mode === 'local' && activeNote) {
      activeLinks.add(noteName(activeNote).toLowerCase());
      const links = wikiLinks(activeNote.content || '');
      links.forEach(l => activeLinks.add(l.toLowerCase()));
      // Also find notes that link TO the active note
      notes.forEach(n => {
        if (wikiLinks(n.content || '').some(l => l.toLowerCase() === noteName(activeNote).toLowerCase())) {
          activeLinks.add(noteName(n).toLowerCase());
        }
      });
    }

    const filtered = mode === 'local'
      ? notes.filter(n => activeLinks.has(noteName(n).toLowerCase()))
      : notes;

    const nodeList = filtered.map((entry, i) => {
      const angle = (i / Math.max(1, filtered.length)) * Math.PI * 2;
      const linkCount = wikiLinks(entry.content || '').length;
      return {
        id: entry.id,
        name: noteName(entry),
        x: Math.cos(angle) * 180 + (i * 37 % 21) - 10,
        y: Math.sin(angle) * 140 + (i * 53 % 17) - 8,
        vx: 0, vy: 0,
        radius: Math.max(5, Math.min(16, 5 + linkCount * 2)),
        isActive: entry.id === activeId,
        linkCount,
      };
    });

    const byName = new Map(nodeList.map(n => [n.name.toLowerCase(), n]));
    const edgeList = [];
    for (const entry of filtered) {
      const from = byName.get(noteName(entry).toLowerCase());
      for (const target of wikiLinks(entry.content || '')) {
        const to = byName.get(target.toLowerCase());
        if (to && to.id !== from.id) edgeList.push({ source: from, target: to });
      }
    }

    // Run force simulation
    for (let iter = 0; iter < 200; iter++) {
      for (let a = 0; a < nodeList.length; a++) {
        for (let b = a + 1; b < nodeList.length; b++) {
          const dx = nodeList[b].x - nodeList[a].x;
          const dy = nodeList[b].y - nodeList[a].y;
          const d2 = Math.max(40, dx * dx + dy * dy);
          const force = 2000 / d2;
          nodeList[a].x -= dx * force; nodeList[a].y -= dy * force;
          nodeList[b].x += dx * force; nodeList[b].y += dy * force;
        }
      }
      for (const edge of edgeList) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = ((dist - 100) / dist) * 0.04;
        edge.source.x += dx * pull; edge.source.y += dy * pull;
        edge.target.x -= dx * pull; edge.target.y -= dy * pull;
      }
      // Center gravity
      let cx = 0, cy = 0;
      nodeList.forEach(n => { cx += n.x; cy += n.y; });
      cx /= nodeList.length || 1; cy /= nodeList.length || 1;
      nodeList.forEach(n => { n.x -= cx * 0.01; n.y -= cy * 0.01; });
    }

    return { nodes: nodeList, edges: edgeList };
  }, [notes, activeId, mode]);

  simRef.current = graphData;

  // Filtered nodes for search
  const visibleNodes = useMemo(() => {
    if (!searchFilter.trim()) return graphData.nodes;
    const q = searchFilter.trim().toLowerCase();
    return graphData.nodes.filter(n => n.name.toLowerCase().includes(q));
  }, [graphData.nodes, searchFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const cx = rect.width / 2 + pan.x;
      const cy = rect.height / 2 + pan.y;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);

      const data = simRef.current;
      if (!data) { ctx.restore(); requestAnimationFrame(draw); return; }

      // Draw edges
      for (const edge of data.edges) {
        if (!visibleNodeIds.has(edge.source.id) || !visibleNodeIds.has(edge.target.id)) continue;
        const isHighlighted = hoveredNode && (edge.source.id === hoveredNode || edge.target.id === hoveredNode);
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.strokeStyle = isHighlighted ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = isHighlighted ? 2 / zoom : 1 / zoom;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of data.nodes) {
        if (!visibleNodeIds.has(node.id)) continue;
        const isHovered = hoveredNode === node.id;
        const isConnected = hoveredNode && data.edges.some(e =>
          (e.source.id === hoveredNode && e.target.id === node.id) ||
          (e.target.id === hoveredNode && e.source.id === node.id)
        );
        const dimmed = hoveredNode && !isHovered && !isConnected;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius / zoom * (isHovered ? 1.3 : 1), 0, Math.PI * 2);

        if (node.isActive) {
          ctx.fillStyle = dimmed ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.9)';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
        } else if (isConnected) {
          ctx.fillStyle = 'rgba(167,139,250,0.6)';
        } else {
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)';
        }
        ctx.fill();

        // Node label
        const fontSize = Math.max(8, 10 / zoom);
        if (!dimmed || isHovered) {
          ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.15)' : isHovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
          ctx.fillText(node.name, node.x, node.y - (node.radius + 4) / zoom);
        }
      }

      ctx.restore();
      requestAnimationFrame(draw);
    };

    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [pan, zoom, hoveredNode, visibleNodeIds, graphData]);

  // Mouse handlers
  const screenToWorld = useCallback((sx, sy) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2 + pan.x;
    const cy = rect.height / 2 + pan.y;
    return { x: (sx - cx) / zoom, y: (sy - cy) / zoom };
  }, [pan, zoom]);

  const findNodeAt = useCallback((wx, wy) => {
    const data = simRef.current;
    if (!data) return null;
    for (let i = data.nodes.length - 1; i >= 0; i--) {
      const n = data.nodes[i];
      if (!visibleNodeIds.has(n.id)) continue;
      const r = n.radius / zoom * 1.5;
      if (Math.hypot(n.x - wx, n.y - wy) < r) return n;
    }
    return null;
  }, [visibleNodeIds, zoom]);

  const onMouseDown = useCallback(e => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const node = findNodeAt(w.x, w.y);
    if (node) {
      setDragNode(node);
    } else {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [screenToWorld, findNodeAt, pan]); // eslint-disable-line

  const onMouseMove = useCallback(e => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragNode) {
      const w = screenToWorld(sx, sy);
      dragNode.x = w.x;
      dragNode.y = w.y;
      return;
    }
    if (isPanning) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }

    const w = screenToWorld(sx, sy);
    const node = findNodeAt(w.x, w.y);
    setHoveredNode(node ? node.id : null);
  }, [dragNode, isPanning, screenToWorld, findNodeAt]);

  const onMouseUp = useCallback(() => {
    setDragNode(null);
    setIsPanning(false);
  }, []);

  const onClick = useCallback(e => {
    if (dragNode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(w.x, w.y);
    if (node) onOpen(node.id);
  }, [screenToWorld, findNodeAt, onOpen, dragNode]);

  const onWheel = useCallback(e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#17181c]/97 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-black/40 px-4 py-2.5 text-xs text-white/70">
        <Icon name="Network" size={14} className="acc-text" />
        <span className="font-semibold">{mode === 'local' ? 'Local' : 'Global'} graph</span>
        <span className="text-white/40">— {visibleNodes.length} notes, {graphData.edges.filter(e => visibleNodeIds.has(e.source.id) && visibleNodeIds.has(e.target.id)).length} links</span>
        <div className="ml-2 flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1">
          <button className={`rounded px-2 py-0.5 text-[10px] ${mode === 'global' ? 'acc-text bg-white/[0.08]' : 'text-white/40 hover:text-white/60'}`} onClick={() => onModeChange('global')}>Global</button>
          <button className={`rounded px-2 py-0.5 text-[10px] ${mode === 'local' ? 'acc-text bg-white/[0.08]' : 'text-white/40 hover:text-white/60'}`} onClick={() => onModeChange('local')}>Local</button>
        </div>
        <input className="ml-2 w-32 rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/70 outline-none placeholder:text-white/25" placeholder="Filter nodes…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/50 hover:text-white/70" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
          <span className="text-[10px] text-white/25">Scroll to zoom · Drag to pan · Click node to open</span>
          <button className="icon-btn h-7 w-7" onClick={onClose}><Icon name="X" size={14} /></button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 cursor-grab active:cursor-grabbing" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onClick} onWheel={onWheel}>
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {hoveredNode && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/10 bg-[#232429]/90 px-3 py-2 text-[11px] text-white/70 shadow-lg backdrop-blur-sm">
          {graphData.nodes.find(n => n.id === hoveredNode)?.name}
          <span className="ml-2 text-white/30">{graphData.nodes.find(n => n.id === hoveredNode)?.linkCount || 0} links</span>
        </div>
      )}
    </div>
  );
}
