import { useEffect, useMemo, useState } from 'react';
import { useFileSystem, childrenOf, createEntry, updateEntry, readEntryContent, getEntry, removeEntryDeep } from '../../../../lib/fileSystem';
import { extractZipEntry } from '../../../../lib/repos';
import { callTrusted } from '../../../../lib/ai/apiManager';
import ContextMenu, { useContextMenu } from '../../ContextMenu';
import { PROJECTS_ID, projectPath } from './constants';
import { findByPath, tabContentFor } from './treeUtils';
import { diffLines } from './diffUtils';

export default function useCodeStudioState({ windowed }) {
  const [tree, commit] = useFileSystem();
  const [activity, setActivity] = useState('explorer');
  const [expanded, setExpanded] = useState(() => new Set([PROJECTS_ID]));
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [pending, setPending] = useState({}); // path -> { newContent, lines, isNew }
  const [termOpen, setTermOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [ctxMenu, openCtxMenu, closeCtxMenu] = useContextMenu();

  const active = tabs.find(t => t.id === activeId) || null;
  const projects = tree.filter(e => e.parentId === PROJECTS_ID);

  const openFile = async entry => {
    if (entry.type === 'folder') return;
    const existing = tabs.find(t => t.id === entry.id);
    if (existing) { setActiveId(entry.id); return; }
    const content = String(await readEntryContent(entry) ?? '');
    const tab = { id: entry.id, name: entry.name, content, dirty: false, path: projectPath(tree, entry.id) };
    setTabs(p => [...p, tab]); setActiveId(entry.id);
  };

  const closeTab = id => { setTabs(p => p.filter(t => t.id !== id)); if (activeId === id) setActiveId(null); };
  const closeOthers = id => { setTabs(p => p.filter(t => t.id === id)); };
  const closeAll = () => { setTabs([]); setActiveId(null); };
  const setTabContent = (id, content) => setTabs(p => p.map(t => (t.id === id ? { ...t, content, dirty: true } : t)));
  const saveTab = tab => { commit(updateEntry(tree, tab.id, { content: tab.content })); setTabs(p => p.map(t => (t.id === tab.id ? { ...t, dirty: false } : t))); };

  const newFile = () => { const n = window.prompt('New file name:', 'main.js'); if (n) commit(createEntry(tree, { name: n, type: 'text', parentId: active?.parentId || PROJECTS_ID, content: '' })); };
  const newFolder = () => { const n = window.prompt('New folder name:', 'src'); if (n) commit(createEntry(tree, { name: n, type: 'folder', parentId: active?.parentId || PROJECTS_ID })); };
  const extractZip = async entry => { try { await extractZipEntry(entry); } catch (err) { window.dispatchEvent(new CustomEvent('code-studio-log', { detail: `extract ✗ ${err.message}` })); } };

  const acceptDiff = async path => {
    const p = pending[path]; if (!p) return;
    await callTrusted('code.write', { path, content: p.newContent });
    const tab = tabs.find(t => t.path === path);
    if (tab) { setTabContent(tab.id, p.newContent); commit(updateEntry(tree, tab.id, { content: p.newContent })); setTabs(q => q.map(t => (t.id === tab.id ? { ...t, dirty: false } : t))); }
    setPending(q => { const n = { ...q }; delete n[path]; return n; });
  };
  const rejectDiff = path => setPending(q => { const n = { ...q }; delete n[path]; return n; });

  const stageWrite = (path, content) => {
    const entry = findByPath(tree, path);
    const current = entry && entry.type !== 'folder' ? tabContentFor(tree, entry, tabs) : '';
    setPending(q => ({ ...q, [path]: { newContent: content, lines: diffLines(current, content), isNew: !entry } }));
    if (entry) openFile(entry);
  };

  const toggleExpanded = id => setExpanded(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase(); const out = [];
    const walk = id => { for (const e of childrenOf(tree, id)) { if (e.type === 'folder') walk(e.id); else if (e.name.toLowerCase().includes(q)) out.push(e); if (out.length > 60) return; } };
    projects.forEach(p => walk(p.id));
    return out;
  }, [search, tree, projects]);

  return {
    // raw state
    tree, commit, activity, setActivity, expanded, tabs, activeId, setActiveId,
    pending, termOpen, setTermOpen, chatOpen, setChatOpen, search, setSearch,
    ctxMenu, openCtxMenu, closeCtxMenu,
    // derived
    active, projects, searchResults,
    // handlers
    openFile, closeTab, closeOthers, closeAll, setTabContent, saveTab,
    newFile, newFolder, extractZip, acceptDiff, rejectDiff, stageWrite,
    toggleExpanded,
  };
}
