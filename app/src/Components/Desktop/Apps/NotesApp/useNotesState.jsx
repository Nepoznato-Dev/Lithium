import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEntry, loadTree, useFileSystem, readEntryContent, storeEntryContent, updateEntry, createEntry, isTrashed } from '../../../../lib/fileSystem';
import { notify } from '../../../../lib/desktop/notify';
import { renderMarkdown } from '../../../../lib/markdown';
import { storage } from '../../../../lib/storage';
import { parseFrontmatter, extractTags, extractHeadings, backlinkContext } from './frontmatter';

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

/** All state declarations, memoized derived data, and side-effects for NotesApp. */
export default function useNotesState() {
  const [tree, commit] = useFileSystem();
  const [session] = useState(() => storage.get('notes-session', { tabs: [], activeId: null }));
  const [tabs, setTabs] = useState(session.tabs);
  const [activeId, setActiveId] = useState(session.activeId);
  const [layout, setLayout] = useState(() => storage.get('notes-layout', 'notes') === 'notepad' ? 'notepad' : 'notes');
  const [fontSize, setFontSize] = useState(() => Math.max(10, Math.min(24, Number(storage.get('notes-font-size', 13)) || 13)));
  const [mode, setMode] = useState('edit');
  const [inlineEdit, setInlineEdit] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [openFolders, setOpenFolders] = useState({ [VAULT_ID]: true });
  const [spellCheck, setSpellCheck] = useState(() => storage.get('notes-spellcheck', false));
  const [notesSettings, setNotesSettings] = useState(() => storage.get('notes-settings', { lineNumbers: false, smartLists: true, rtl: false, foldHeadings: false, typographer: false }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphMode, setGraphMode] = useState('global');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [starred, setStarred] = useState(() => storage.get('notes-starred', []));
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  /* --- Memoized data --- */
  const allNotes = useMemo(
    () => tree.filter(e => (e.type === 'text' || /\.(md|txt|log)$/i.test(e.name)) && !isTrashed(e) && !isHidden(e.name)).sort((a, b) => a.name.localeCompare(b.name)),
    [tree]
  );
  const vaultNotes = useMemo(() => allNotes.filter(e => e.parentId === VAULT_ID || isInsideVault(tree, e)), [allNotes, tree]);
  const active = activeId ? getEntry(tree, activeId) : null;
  const [document, setDocument] = useState({ id: null, text: '', loaded: false });
  const [saveStatus, setSaveStatus] = useState('Saved');
  const pending = useRef(new Map());
  const saves = useRef(new Map());
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const draft = document.id === activeId ? document.text : '';
  const loading = Boolean(active && (document.id !== activeId || !document.loaded));

  const saveDraft = useCallback((id = activeRef.current) => {
    const snapshot = pending.current.get(id);
    if (!snapshot) return Promise.resolve();
    if (activeRef.current === id) setSaveStatus('Saving…');
    const task = (saves.current.get(id) || Promise.resolve()).then(async () => {
      if (pending.current.get(id) !== snapshot) return;
      const entry = getEntry(loadTree(), id);
      if (!entry || isTrashed(entry)) { pending.current.delete(id); return; }
      const stored = await storeEntryContent({ ...entry, type: 'text' }, snapshot.text);
      const latest = loadTree();
      if (!getEntry(latest, id)) return;
      commit(updateEntry(latest, id, {
        content: stored.content, idb: stored.idb, size: stored.size,
        type: 'text', cold: false, coldRef: null, blobRef: null,
      }));
      if (pending.current.get(id) === snapshot) {
        pending.current.delete(id);
        if (activeRef.current === id) setSaveStatus('Saved');
      }
    }).catch(error => {
      if (activeRef.current === id) setSaveStatus('Save failed');
      notify({ title: 'Notes', body: `Could not save note: ${error.message}` });
    });
    saves.current.set(id, task);
    task.then(() => { if (saves.current.get(id) === task) saves.current.delete(id); });
    return task;
  }, [commit]);

  const setDraft = useCallback(text => {
    if (document.id !== activeId || !document.loaded) return;
    pending.current.set(activeId, { text });
    setDocument({ id: activeId, text, loaded: true });
    setSaveStatus('Unsaved changes');
  }, [activeId, document.id, document.loaded]);
  const { meta: frontmatter } = useMemo(() => parseFrontmatter(draft), [draft]);
  const previewHtml = useMemo(() => (mode === 'preview' || mode === 'split' || mode === 'live' ? renderMarkdown(draft) : ''), [draft, mode]);
  const headings = useMemo(() => extractHeadings(draft), [draft]);
  const noteTags = useMemo(() => extractTags(draft), [draft]);

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

  const backlinks = useMemo(() => {
    if (!active) return [];
    const name = noteName(active);
    return vaultNotes
      .filter(e => e.id !== active.id && (e.content || '').includes(`[[${name}]]`))
      .map(e => ({ entry: e, contexts: backlinkContext(e.content || '', name) }));
  }, [active, vaultNotes]);

  const starredNotes = useMemo(() => vaultNotes.filter(e => starred.includes(e.id)), [vaultNotes, starred]);

  /* --- Effects --- */
  // Migrate legacy notepad
  useEffect(() => {
    const legacy = storage.get('notepad', '');
    if (legacy && !storage.get('notes-migrated', false)) {
      storage.set('notes-migrated', true);
      if (!allNotes.some(e => e.name === 'Migrated Note.md')) {
        commit(createEntry(tree, { name: 'Migrated Note.md', type: 'text', parentId: VAULT_ID, content: legacy }));
      }
    }
  }, [allNotes.length]); // eslint-disable-line

  // Auto-load draft when active note changes
  useEffect(() => {
    let cancelled = false;
    const entry = getEntry(loadTree(), activeId);
    const cached = pending.current.get(activeId);
    if (cached) {
      setDocument({ id: activeId, text: cached.text, loaded: true });
      setSaveStatus('Unsaved changes');
    } else if (entry) {
      setDocument({ id: activeId, text: '', loaded: false });
      readEntryContent(entry).then(async content => {
        const text = content instanceof Blob ? await content.text() : String(content ?? '');
        if (!cancelled) {
          setDocument({ id: activeId, text, loaded: true });
          setSaveStatus('Saved');
        }
      }).catch(error => {
        if (!cancelled) {
          setSaveStatus('Could not load note');
          notify({ title: 'Notes', body: `Could not open note: ${error.message}` });
        }
      });
    } else setDocument({ id: null, text: '', loaded: false });
    return () => { cancelled = true; void saveDraft(activeId); };
  }, [activeId, saveDraft]);

  // Auto-save draft
  useEffect(() => {
    if (!pending.current.has(activeId)) return undefined;
    const timer = setTimeout(() => { void saveDraft(activeId); }, 500);
    return () => clearTimeout(timer);
  }, [activeId, draft, saveDraft]);

  // Persist preferences
  useEffect(() => storage.set('notes-spellcheck', spellCheck), [spellCheck]);
  useEffect(() => storage.set('notes-settings', notesSettings), [notesSettings]);
  useEffect(() => storage.set('notes-layout', layout), [layout]);
  useEffect(() => storage.set('notes-font-size', fontSize), [fontSize]);
  useEffect(() => storage.set('notes-session', { tabs, activeId }), [tabs, activeId]);

  /* --- Computed display values --- */
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const lineCount = draft.split('\n').length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return {
    tree, commit, tabs, setTabs, activeId, setActiveId, mode, setMode,
    layout, setLayout, fontSize, setFontSize, loading, saveStatus, saveDraft,
    inlineEdit, setInlineEdit, sidebarOpen, setSidebarOpen,
    switcherOpen, setSwitcherOpen, switcherQuery, setSwitcherQuery,
    openFolders, setOpenFolders, spellCheck, setSpellCheck,
    notesSettings, setNotesSettings, settingsOpen, setSettingsOpen,
    graphOpen, setGraphOpen, graphMode, setGraphMode,
    outlineOpen, setOutlineOpen, backlinksOpen, setBacklinksOpen,
    tagsOpen, setTagsOpen, cmdPaletteOpen, setCmdPaletteOpen,
    cmdQuery, setCmdQuery, searchOpen, setSearchOpen,
    searchQuery, setSearchQuery, starred, setStarred,
    templateMenuOpen, setTemplateMenuOpen,
    // Derived
    allNotes, vaultNotes, active, draft, setDraft,
    frontmatter, previewHtml, headings, noteTags,
    allTags, backlinks, starredNotes,
    wordCount, lineCount, readTime,
  };
}
