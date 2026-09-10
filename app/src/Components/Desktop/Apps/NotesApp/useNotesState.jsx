import { useEffect, useMemo, useState } from 'react';
import { getEntry, useFileSystem, readEntryContent, storeEntryContent, updateEntry, createEntry } from '../../../../lib/fileSystem';
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
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
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
    if (active) readEntryContent(active).then(text => { if (!cancelled) setDraft(text || ''); });
    else setDraft('');
    return () => { cancelled = true; };
  }, [activeId]); // eslint-disable-line

  // Auto-save draft
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(async () => {
      const stored = await storeEntryContent(active, draft);
      commit(updateEntry(tree, active.id, { content: stored.content, idb: stored.idb, size: stored.size }));
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line

  // Persist preferences
  useEffect(() => storage.set('notes-spellcheck', spellCheck), [spellCheck]);
  useEffect(() => storage.set('notes-settings', notesSettings), [notesSettings]);

  /* --- Computed display values --- */
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const lineCount = draft.split('\n').length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return {
    tree, commit, tabs, setTabs, activeId, setActiveId, mode, setMode,
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
