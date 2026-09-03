import React, { useCallback, useEffect, useMemo } from 'react';
import Icon from '../../../Icon';
import { childrenOf, createEntry, getEntry, isTrashed, removeEntryDeep, restoreEntry, trashEntry, updateEntry, TRASH_ID } from '../../../../lib/fileSystem';
import { applyHeading, renderMarkdown } from '../../../../lib/markdown';
import { storage } from '../../../../lib/storage';
import { useContextMenu } from '../../ContextMenu';
import { TEMPLATES, fillTemplate } from './templates';

const VAULT_ID = 'default-notes';
const isHidden = name => name.startsWith('.');
const noteName = entry => entry.name.replace(/\.(md|txt)$/i, '');

function isInsideVault(tree, entry) {
  let current = entry;
  while (current && current.id !== 'root') {
    if (current.parentId === VAULT_ID) return true;
    current = getEntry(tree, current.parentId);
  }
  return false;
}

/** All handler functions, editor helpers, keyboard shortcuts, context menus,
 *  command palette, search, and the recursive tree renderer for NotesApp. */
export default function useNotesActions(s, areaRef, gutterRef) {
  const {
    tree, commit, tabs, setTabs, activeId, setActiveId, mode, setMode,
    inlineEdit, setInlineEdit, sidebarOpen, setSidebarOpen,
    switcherOpen, setSwitcherOpen, switcherQuery, setSwitcherQuery,
    openFolders, setOpenFolders, spellCheck, setSpellCheck,
    notesSettings, graphOpen, setGraphOpen, graphMode, setGraphMode,
    outlineOpen, setOutlineOpen, backlinksOpen, setBacklinksOpen,
    tagsOpen, setTagsOpen, cmdPaletteOpen, setCmdPaletteOpen,
    cmdQuery, setCmdQuery, searchOpen, setSearchOpen,
    searchQuery, setSearchQuery, starred, setStarred,
    templateMenuOpen, setTemplateMenuOpen,
    allNotes, vaultNotes, active, draft, setDraft,
    frontmatter, previewHtml, headings,
  } = s;

  const [menu, openMenu, closeMenu] = useContextMenu();

  /* --- Core handlers --- */
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

  /* --- Editor helpers --- */
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

  /* --- Keyboard shortcuts --- */
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

  /* --- Command palette --- */
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
    { id: 'settings', label: 'Open Notes settings', icon: 'SlidersHorizontal', action: () => s.setSettingsOpen(true) },
  ], [active, starred, spellCheck]); // eslint-disable-line

  const cmdResults = cmdQuery.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(cmdQuery.trim().toLowerCase()))
    : commands;

  /* --- Full-text search --- */
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

  const switcherResults = switcherQuery.trim()
    ? vaultNotes.filter(e => noteName(e).toLowerCase().includes(switcherQuery.trim().toLowerCase()))
    : vaultNotes;

  /* --- Context menus --- */
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

  /* --- Recursive tree renderer --- */
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

  /* --- Editor context menu builder --- */
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

  return {
    menu, openMenu, closeMenu,
    openNote, closeTab, commitInlineEdit,
    createNote, createDailyNote, insertTemplate, toggleStar,
    createFolder, renameEntry, deleteEntry, restore, deletePermanent,
    openWiki, exportNote,
    editSelection, wrapSelection, setHeading, prefixLines, onEditorKey,
    renderTree, contextItems,
    cmdResults, searchResults, switcherResults, trashedFolders,
    noteMenu, folderMenu,
  };
}
