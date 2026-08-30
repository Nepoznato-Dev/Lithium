import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useFileSystem, childrenOf, createEntry, updateEntry, readEntryContent, getEntry, removeEntryDeep } from '../../../lib/fileSystem';
import { allModels, loadModelMeta, getTier, downloadedModelFor, tierModel } from '../../../lib/ai/models';
import { AI_PROVIDERS, chatCompletion, loadKeys } from '../../../lib/ai/providers';
import { stripToolBlocks, MODES, MODE_ORDER } from '../../../lib/ai/agent';
import { renderMarkdown } from '../../../lib/markdown';
import { callTrusted } from '../../../lib/ai/apiManager';
import { buildCodeDoc } from '../../../lib/codeApi';

import { extractZipEntry } from '../../../lib/repos';
import { storage } from '../../../lib/storage';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';

/**
 * Code Studio — a VSCode-style IDE.
 *  Activity bar · Explorer/Search side panel · tabbed editor with inline diffs ·
 *  bottom terminal (real commands over the virtual FS) · right AI panel with
 *  Agent / Chat / Plan modes. The AI always receives the full code.* tool list.
 */
const PROJECTS_ID = 'default-projects';
const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|c|cpp|hpp|h|cs|php|sh|html?|css|scss|json|ya?ml|sql|vue|svelte)$/i;

const projectPath = (tree, id) => {
  const names = [];
  let e = getEntry(tree, id);
  while (e && e.parentId !== PROJECTS_ID) { names.unshift(e.name); e = getEntry(tree, e.parentId); }
  if (e) names.unshift(e.name);
  return names.join('/');
};

function diffLines(a, b) {
  const A = (a || '').split('\n'); const B = (b || '').split('\n');
  const n = A.length; const m = B.length;
  if (n * m > 4_000_000) return B.map(text => ({ type: 'add', text }));
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0; let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: 'same', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: A[i] }); i++; }
    else { out.push({ type: 'add', text: B[j] }); j++; }
  }
  while (i < n) out.push({ type: 'del', text: A[i++] });
  while (j < m) out.push({ type: 'add', text: B[j++] });
  return out;
}

export default function CodeStudioApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
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

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase(); const out = [];
    const walk = id => { for (const e of childrenOf(tree, id)) { if (e.type === 'folder') walk(e.id); else if (e.name.toLowerCase().includes(q)) out.push(e); if (out.length > 60) return; } };
    projects.forEach(p => walk(p.id));
    return out;
  }, [search, tree, projects]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#1e1e1e] text-[#cccccc]">
      {/* Menu bar */}
      <div className="flex min-w-0 items-center gap-3 overflow-hidden border-b border-black/40 bg-[#3c3c3c] px-3 py-1 text-[12px] text-white/80">
        <span className="font-semibold text-white">Code Studio</span>
        {['File', 'Edit', 'View', 'Run', 'Terminal', 'Help'].map(m => (
          <button key={m} className="hover:bg-white/10 rounded px-1.5" onClick={() => { if (m === 'Terminal') setTermOpen(v => !v); }}>{m}</button>
        ))}
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center border-r border-black/40 bg-[#333333] py-2">
          <ActBtn icon="Files" label="Explorer" active={activity === 'explorer'} onClick={() => setActivity('explorer')} />
          <ActBtn icon="Search" label="Search" active={activity === 'search'} onClick={() => setActivity('search')} />
          <ActBtn icon="MessageSquare" label="AI Chat" active={chatOpen} onClick={() => setChatOpen(v => !v)} />
          <div className="mt-auto"><ActBtn icon="Settings" label="Settings" active={false} onClick={() => {}} /></div>
        </div>

        {/* Side panel */}
        <div className="flex w-60 shrink-0 flex-col border-r border-black/40 bg-[#252526]">
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
            {activity === 'explorer' ? 'Explorer' : 'Search'}
            {activity === 'explorer' && <span className="ml-auto flex gap-1"><button className="hover:bg-white/10 rounded p-0.5" title="New file" onClick={newFile}><Icon name="FilePlus" size={13} /></button><button className="hover:bg-white/10 rounded p-0.5" title="New folder" onClick={newFolder}><Icon name="FolderPlus" size={13} /></button></span>}
          </div>
          {activity === 'explorer' ? (
            <div className="flex-1 overflow-y-auto pb-2">
              {projects.length === 0 && <p className="px-3 text-[11px] text-white/40">No projects. Import a GitHub repo via the Downloader.</p>}
              {projects.map(e => <Node key={e.id} entry={e} tree={tree} expanded={expanded} onToggle={id => setExpanded(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })} onOpen={openFile} onExtract={extractZip} activeId={activeId} depth={0} onCtxMenu={openCtxMenu} treeCommit={commit} />)}
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <input className="mx-2 mb-1 rounded border border-white/10 bg-[#3c3c3c] px-2 py-1 text-[12px] outline-none" placeholder="Search files" value={search} onChange={e => setSearch(e.target.value)} />
              <div className="flex-1 overflow-y-auto">
                {searchResults.map(e => <button key={e.id} className="block w-full truncate px-3 py-1 text-left text-[12px] hover:bg-white/10" onClick={() => openFile(e)}>{e.name}</button>)}
              </div>
            </div>
          )}
        </div>

        {/* Editor group */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          {/* Tabs */}
          <div className="flex overflow-x-auto bg-[#252526]">
            {tabs.map(t => (
              <div key={t.id} className={`group flex items-center gap-2 border-r border-black/40 px-3 py-1.5 text-[12px] ${t.id === activeId ? 'bg-[#1e1e1e] text-white' : 'text-white/50 hover:bg-white/5'}`} onClick={() => setActiveId(t.id)} onContextMenu={event => { event.stopPropagation(); openCtxMenu(event, [
                { id: 'name', type: 'heading', label: t.name },
                { id: 'close', label: 'Close', icon: 'X', action: () => closeTab(t.id) },
                { id: 'close-others', label: 'Close others', icon: 'XCircle', action: () => setTabs(p => p.filter(x => x.id === t.id)) },
                { id: 'close-all', label: 'Close all', icon: 'X', action: () => { setTabs([]); setActiveId(null); } },
                { id: 'sep', type: 'separator' },
                { id: 'copy-path', label: 'Copy file path', icon: 'Copy', action: () => navigator.clipboard?.writeText(t.path) },
              ]); }}>
                <span className="truncate">{t.name}</span>
                {t.dirty && <span className="text-amber-300">●</span>}
                <button className="hidden group-hover:block text-white/50 hover:text-white" onClick={ev => { ev.stopPropagation(); closeTab(t.id); }}><Icon name="X" size={12} /></button>
              </div>
            ))}
          </div>

          {/* Editor / diff */}
          {!active ? (
            <EmptyState onToggleTerm={() => setTermOpen(v => !v)} onOpenChat={() => setChatOpen(true)} onContextMenu={event => openCtxMenu(event, [
              { id: 'new-file', label: 'New file', icon: 'FilePlus', action: newFile },
              { id: 'new-folder', label: 'New folder', icon: 'FolderPlus', action: newFolder },
              { id: 'toggle-term', label: termOpen ? 'Close terminal' : 'Open terminal', icon: 'SquareTerminal', action: () => setTermOpen(v => !v) },
              { id: 'open-chat', label: 'Open AI chat', icon: 'MessageSquare', action: () => setChatOpen(true) },
            ])} />
          ) : pending[active.path] ? (
            <DiffView path={active.path} pending={pending[active.path]} onAccept={() => acceptDiff(active.path)} onReject={() => rejectDiff(active.path)} />
          ) : (
            <Editor tab={active} onChange={c => setTabContent(active.id, c)} onSave={() => saveTab(active)} onCtxMenu={openCtxMenu} />
          )}
        </div>

        {/* AI panel */}
        {chatOpen && (
          <ChatPanel
            tree={tree} tabs={tabs} active={active}
            onStageWrite={stageWrite}
            onExplore={path => { const e = findByPath(tree, path); if (e && e.type !== 'folder') openFile(e); }}
            onLog={line => window.dispatchEvent(new CustomEvent('code-studio-log', { detail: line }))}
            onCtxMenu={openCtxMenu}
          />
        )}
      </div>

      {/* Bottom terminal */}
      {termOpen && <Terminal onCtxMenu={openCtxMenu} />}

      {/* Status bar */}
      <div className="flex items-center gap-3 bg-[#007acc] px-3 py-0.5 text-[11px] text-white">
        <span className="flex items-center gap-1"><Icon name="GitBranch" size={12} /> main</span>
        <span className="flex items-center gap-1"><Icon name="AlertTriangle" size={12} /> 0</span>
        <span className="ml-auto">{active ? `${active.name}${active.dirty ? ' (unsaved)' : ''}` : 'No file'}</span>
        <span>UTF-8</span><span>LF</span><span>IDE</span>
      </div>

      {/* Context menu */}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />}
    </div>
  );
}

function findByPath(tree, path) {
  const segs = path.split('/').filter(Boolean);
  let parent = PROJECTS_ID; let cur = null;
  for (const seg of segs) { cur = childrenOf(tree, parent).find(e => e.name === seg); if (!cur) return null; parent = cur.id; }
  return cur;
}
function tabContentFor(tree, entry, tabs) {
  const t = tabs.find(x => x.id === entry.id);
  if (t) return t.content;
  return '';
}

function ActBtn({ icon, label, active, onClick }) {
  return <button title={label} className={`my-1 rounded p-2 ${active ? 'text-white border-l-2 border-white' : 'text-white/50 hover:text-white'}`} onClick={onClick}><Icon name={icon} size={20} /></button>;
}

function Node({ entry, tree, expanded, onToggle, onOpen, onExtract, activeId, depth, onCtxMenu, treeCommit }) {
  const kids = childrenOf(tree, entry.id);
  const path = projectPath(tree, entry.id);
  if (entry.type === 'folder') {
    const open = expanded.has(entry.id);
    return (
      <div>
        <button className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-[12.5px] hover:bg-white/5" style={{ paddingLeft: 8 + depth * 10 }} onClick={() => onToggle(entry.id)} onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
          { id: 'name', type: 'heading', label: entry.name },
          { id: 'open', label: 'Open', icon: 'FolderOpen', action: () => onToggle(entry.id) },
          { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const n = window.prompt('New name:', entry.name); if (n && n !== entry.name) treeCommit(updateEntry(tree, entry.id, { name: n })); } },
          { id: 'copy-path', label: 'Copy path', icon: 'Copy', action: () => navigator.clipboard?.writeText(path) },
          { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { if (window.confirm(`Delete "${entry.name}"?`)) removeEntryDeep(tree, entry.id).then(next => treeCommit(next)); } },
        ]); }}>
          <Icon name="ChevronRight" size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} /><Icon name="Folder" size={13} className="text-[#dcb67a]" /><span className="truncate">{entry.name}</span>
        </button>
        {open && kids.map(k => <Node key={k.id} entry={k} tree={tree} expanded={expanded} onToggle={onToggle} onOpen={onOpen} onExtract={onExtract} activeId={activeId} depth={depth + 1} onCtxMenu={onCtxMenu} treeCommit={treeCommit} />)}
      </div>
    );
  }
  return (
    <div className={`group flex w-full items-center gap-1 px-2 py-0.5 ${activeId === entry.id ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'}`} style={{ paddingLeft: 8 + (depth + 1) * 10 }} onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
      { id: 'name', type: 'heading', label: entry.name },
      { id: 'open', label: 'Open', icon: 'FileText', action: () => onOpen(entry) },
      { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const n = window.prompt('New name:', entry.name); if (n && n !== entry.name) treeCommit(updateEntry(tree, entry.id, { name: n })); } },
      { id: 'copy-path', label: 'Copy path', icon: 'Copy', action: () => navigator.clipboard?.writeText(path) },
      { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { if (window.confirm(`Delete "${entry.name}"?`)) removeEntryDeep(tree, entry.id).then(next => treeCommit(next)); } },
    ]); }}>
      <button className="flex min-w-0 flex-1 items-center gap-1 text-left font-mono text-[12px]" onClick={() => onOpen(entry)}>
        <Icon name="Files" size={12} className={CODE_EXT.test(entry.name) ? 'text-[#6a9fb5]' : 'text-white/40'} /><span className="truncate">{entry.name}</span>
      </button>
      {/\.zip$/i.test(entry.name) && <button className="hidden shrink-0 text-white/50 hover:text-white group-hover:block" title="Extract zip" onClick={() => onExtract(entry)}><Icon name="PackageOpen" size={12} /></button>}
    </div>
  );
}

function EmptyState({ onToggleTerm, onOpenChat, onContextMenu }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-white/30" onContextMenu={onContextMenu}>
      <Icon name="Files" size={90} strokeWidth={0.6} />
      <div className="space-y-1 text-[13px]">
        <div className="flex justify-between gap-8"><span>Open Chat</span><Kbd k="Ctrl + Alt + I" /></div>
        <div className="flex justify-between gap-8"><span>Toggle Terminal</span><Kbd k="Ctrl + `" /></div>
      </div>
      <div className="flex gap-2">
        <button className="rounded bg-[#0e639c] px-3 py-1 text-[12px] text-white hover:bg-[#1177bb]" onClick={onOpenChat}>Open AI Chat</button>
        <button className="rounded bg-white/10 px-3 py-1 text-[12px] hover:bg-white/15" onClick={onToggleTerm}>Open Terminal</button>
      </div>
    </div>
  );
}
const Kbd = ({ k }) => <span className="rounded border border-white/20 bg-white/5 px-1.5 text-[11px]">{k}</span>;

const extColor = name => CODE_EXT.test(name || '') ? 'text-[#6a9fb5]' : 'text-white/40';

// Tolerant tool-call extractor: accepts fenced ```api/```json blocks OR bare JSON,
// and either "api" or "action" as the key. Dedupes identical calls.
function extractCodeCalls(text) {
  const calls = []; const seen = new Set();
  const consider = obj => {
    if (!obj || typeof obj !== 'object') return;
    const list = Array.isArray(obj) ? obj : [obj];
    for (const item of list) {
      const api = item && (item.api || item.action);
      if (typeof api !== 'string' || !api.startsWith('code.')) continue;
      const params = item.params && typeof item.params === 'object' ? item.params : {};
      const key = api + JSON.stringify(params);
      if (seen.has(key)) continue; seen.add(key);
      calls.push({ api, params });
    }
  };
  const src = text || '';
  let i = 0;
  while ((i = src.indexOf('{', i)) !== -1) {
    let depth = 0; let j = i;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
    if (depth !== 0) break;
    try { consider(JSON.parse(src.slice(i, j + 1))); } catch { /* not JSON */ }
    i = j + 1;
  }
  return calls;
}

// Prepare an assistant reply for display: drop tool blocks (balanced or run-away),
// collapse a fully duplicated answer (small on-device models sometimes repeat).
function cleanAssistant(text) {
  let t = (stripToolBlocks(text) || '');
  t = t.replace(/```(?:api|json|tool)[^\n]*\n[\s\S]*?(?:```|$)/g, '');
  t = t.trim();
  // Collapse a repeated answer even when the echo lost its markdown formatting.
  const norm = s => s.replace(/[-*`>#_]/g, '').replace(/\s+/g, ' ').trim();
  const half = Math.floor(t.length / 2);
  for (let cut = half; cut < Math.min(t.length, half + 80); cut++) {
    const a = t.slice(0, cut); const b = t.slice(cut);
    if (a && b && norm(a) === norm(b)) { t = a.trim(); break; }
  }
  return t;
}

// renderMarkdown can choke on odd model output — fall back to escaped text.
function safeMarkdown(text) {
  try { return renderMarkdown(text); } catch { return `<pre class="md-pre">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`; }
}

// Small circular gauge of estimated context usage vs the model's window.
function ContextRing({ used, limit }) {
  const pct = Math.min(1, (used || 0) / (limit || 1));
  const r = 7; const c = 2 * Math.PI * r;
  const color = pct > 0.85 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : '#22d3ee';
  return (
    <span title={`~${used} / ${limit} tokens of context`} className="inline-flex items-center">
      <svg width="18" height="18">
        <circle cx="9" cy="9" r={r} stroke="rgba(255,255,255,0.15)" fill="none" strokeWidth="2.5" />
        <circle cx="9" cy="9" r={r} stroke={color} fill="none" strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 9 9)" />
      </svg>
    </span>
  );
}

/** Rich agentic trace: thoughts (with timing), explored files (clickable), and
 *  file-change chips with +/− and status — like a real AI-IDE activity feed. */
function TraceList({ items, onExplore }) {
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => {
        if (t.kind === 'think') return (
          <div key={i}>
            <div className="flex items-center gap-1 text-[10px] text-white/35"><Icon name="Bot" size={10} /> Thought · {t.secs || 1}s</div>
            {t.text && <div className="whitespace-pre-wrap text-white/80">{t.text}</div>}
          </div>
        );
        if (t.kind === 'explore') return (
          <button key={i} className="flex w-full items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1 text-left hover:bg-white/10" onClick={() => onExplore && onExplore(t.path)} title="Open explored file">
            <Icon name="Search" size={12} className="shrink-0 text-white/40" /><span className="shrink-0 text-[11px] text-white/55">Explored</span>
            <span className="truncate font-mono text-[11px] text-[#3794ff]">{t.path}</span>
          </button>
        );
        if (t.kind === 'write') return (
          <div key={i} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
            <Icon name="Files" size={12} className={`shrink-0 ${extColor(t.path)}`} />
            <span className="truncate font-mono text-[11.5px] text-white/85">{(t.path || '').split('/').pop()}</span>
            <span className="ml-auto text-[11px] text-emerald-400">+{t.adds}</span>
            <span className="text-[11px] text-red-400">−{t.dels}</span>
            <span className="text-[10px] text-amber-300">M</span>
            <span className="text-[10px] text-white/50">{t.status}</span>
          </div>
        );
        return <div key={i} className="font-mono text-[11px] text-red-300">{t.text}</div>;
      })}
    </div>
  );
}

function Editor({ tab, onChange, onSave, onCtxMenu }) {
  const lines = tab.content.split('\n');
  const ref = useRef(null); const gut = useRef(null);
  return (
    <div className="flex min-h-0 flex-1" onContextMenu={event => onCtxMenu?.(event, [
      { id: 'copy-all', label: 'Copy all', icon: 'Copy', action: () => navigator.clipboard?.writeText(tab.content) },
      { id: 'copy-path', label: 'Copy file path', icon: 'Copy', action: () => navigator.clipboard?.writeText(tab.path) },
    ])}>
      <div ref={gut} className="select-none overflow-hidden bg-[#1e1e1e] py-2 pr-2 text-right font-mono text-[12.5px] leading-relaxed text-white/30" style={{ minWidth: 44 }}>
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea
        ref={ref}
        className="min-h-0 flex-1 resize-none bg-transparent py-2 pl-2 font-mono text-[12.5px] leading-relaxed text-[#d4d4d4] outline-none"
        spellCheck={false} value={tab.content}
        onChange={e => onChange(e.target.value)}
        onScroll={() => { if (gut.current && ref.current) gut.current.scrollTop = ref.current.scrollTop; }}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave(); } }}
      />
    </div>
  );
}

function DiffView({ path, pending, onAccept, onReject }) {
  const adds = pending.lines.filter(l => l.type === 'add').length;
  const dels = pending.lines.filter(l => l.type === 'del').length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-black/40 bg-[#252526] px-3 py-1.5 text-[12px]">
        <span className="font-mono">{path}</span>
        <span className="text-emerald-400">+{adds}</span><span className="text-red-400">−{dels}</span>
        {pending.isNew && <span className="rounded bg-emerald-500/20 px-1.5 text-emerald-300">new file</span>}
        <span className="ml-auto flex gap-2">
          <button className="flex items-center gap-1 rounded bg-[#0e639c] px-2 py-1 text-white hover:bg-[#1177bb]" onClick={onAccept}><Icon name="Check" size={12} /> Accept</button>
          <button className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 hover:bg-white/15" onClick={onReject}><Icon name="XCircle" size={12} /> Reject</button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[12.5px] leading-relaxed">
        {pending.lines.map((l, i) => (
          <div key={i} className={`whitespace-pre ${l.type === 'add' ? 'bg-emerald-500/15 text-emerald-200' : l.type === 'del' ? 'bg-red-500/15 text-red-300' : 'text-white/60'}`}>
            {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Terminal ---------- */
function Terminal({ onCtxMenu }) {
  const [lines, setLines] = useState(['Lithium terminal — type `help` for commands.']);
  const [input, setInput] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [lines]);
  const print = (...args) => setLines(p => [...p, ...args.map(a => (typeof a === 'string' ? a : JSON.stringify(a)))]);

  const run = async raw => {
    const cmd = raw.trim(); if (!cmd) return;
    print(`$ ${cmd}`);
    const [name, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    try {
      if (name === 'help') print('ls [path] · cat <path> · touch <path> · mkdir <path> · rm <path> · mv <path> <to> · echo <text> · clear');
      else if (name === 'clear') setLines([]);
      else if (name === 'echo') print(arg);
      else if (name === 'ls') print(await callTrusted('code.list', { path: arg }));
      else if (name === 'tree') print(await callTrusted('code.list', { path: arg }));
      else if (name === 'cat') print(await callTrusted('code.read', { path: arg }));
      else if (name === 'touch') print(await callTrusted('code.createFile', { path: arg }));
      else if (name === 'mkdir') print(await callTrusted('code.createFolder', { path: arg }));
      else if (name === 'rm') print(await callTrusted('code.deleteFile', { path: arg }));
      else if (name === 'mv') { const [a, b] = rest; print(await callTrusted('code.moveFile', { path: a, to: b })); }
      else print(`command not found: ${name} (try help)`);
    } catch (err) { print(`error: ${err.message}`); }
  };

  return (
    <div className="flex h-44 shrink-0 flex-col border-t border-black/40 bg-[#181818]" onContextMenu={event => onCtxMenu?.(event, [
      { id: 'copy', label: 'Copy all', icon: 'Copy', action: () => navigator.clipboard?.writeText(lines.join('\n')) },
      { id: 'clear', label: 'Clear terminal', icon: 'Trash2', action: () => setLines([]) },
    ])}>
      <div className="flex items-center gap-2 px-3 py-1 text-[11px] uppercase tracking-wider text-white/50"><Icon name="SquareTerminal" size={12} /> Terminal</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 font-mono text-[12px] leading-relaxed text-[#d4d4d4]">
        {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        <div ref={endRef} />
      </div>
      <form className="flex items-center gap-2 px-3 pb-2 font-mono text-[12px]" onSubmit={e => { e.preventDefault(); run(input); setInput(''); }}>
        <span className="text-emerald-400">$</span>
        <input className="flex-1 bg-transparent outline-none" value={input} onChange={e => setInput(e.target.value)} autoFocus />
      </form>
    </div>
  );
}

/* ---------- AI panel (Agent / Chat / Plan) ---------- */
function ChatPanel({ tree, active, onStageWrite, onLog, onExplore, onCtxMenu }) {
  const [mode, setMode] = useState('agent');
  const [provider, setProvider] = useState(() => (downloadedModelFor(getTier()) ? 'local' : loadKeys().groq ? 'groq' : 'builtin'));
  const [localModel, setLocalModel] = useState(() => storage.get('ai-local-model', ''));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState([]); // live agentic trace (thoughts + tool results)
  const [plan, setPlan] = useState(null); // { writes: [{path,content}], text }
  const [ctxUsed, setCtxUsed] = useState(0);
  const ctxLimit = storage.get('ai-ctx', 8192);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages, busy]);

  const downloadedOptions = allModels().filter(m => loadModelMeta()[m.id]?.downloaded);
  const tierResolved = downloadedModelFor(getTier()) || allModels().find(m => m.id === tierModel(getTier()).modelId);
  const localTarget = localModel && allModels().find(m => m.id === localModel) ? localModel : (tierResolved?.id || getTier());

  const runModel = msgs => (provider === 'local'
    ? (async () => { const rt = await import('../../../lib/ai/modelRuntime'); await rt.ensureRuntime(localTarget); return rt.localChat(msgs, { maxTokens: 3072 }); })()
    : chatCompletion(provider, msgs));
  const estCtx = arr => Math.round(arr.reduce((s, m) => s + ((m.content || '').length), 0) / 4);

  // Hand the model its workspace so it always knows a project exists and what to inspect.
  const workspaceCtx = useMemo(() => {
    const roots = tree.filter(e => e.parentId === PROJECTS_ID);
    if (!roots.length) return 'The workspace currently has no projects. You can create files/folders with code.createFile / code.createFolder.';
    const lines = roots.map(r => {
      const kids = childrenOf(tree, r.id).slice(0, 24).map(k => `${k.name}${k.type === 'folder' ? '/' : ''}`).join(', ');
      return `- ${r.name}/ → [${kids}]`;
    });
    return `Workspace projects (the FIRST segment of every code.* path):\n${lines.join('\n')}\nAlways inspect with code.list / code.read before answering questions about a repo.`;
  }, [tree]);

  const READS = ['code.read', 'code.readMany', 'code.list'];
  const spec = MODES[mode];

  // Execute one tool call → { result (for the model), item (for the trace UI) }.
  const actOnCall = async (c, planWrites) => {
    const isRead = READS.includes(c.api);
    if (isRead && !spec.read) return { result: `${c.api} → not available in ${spec.label} mode`, item: { kind: 'error', text: `${c.api} not available in ${spec.label} mode` } };
    if (!isRead && spec.write === 'none') return { result: `${c.api} → not permitted in ${spec.label} mode (read-only)`, item: { kind: 'error', text: `${c.api} not permitted in ${spec.label} mode` } };
    const path = c.params?.path || (c.params?.paths || []).join(', ');
    const diffStats = async p => {
      let adds = 0; let dels = 0;
      if (c.params?.content != null) {
        const entry = findByPath(tree, p);
        const current = entry && entry.type !== 'folder' ? String(await readEntryContent(entry) ?? '') : '';
        const d = diffLines(current, c.params.content);
        adds = d.filter(x => x.type === 'add').length; dels = d.filter(x => x.type === 'del').length;
      }
      return { adds, dels };
    };
    // Plan mode collects writes without executing them.
    if (!isRead && spec.write === 'plan') {
      const { adds, dels } = await diffStats(c.params.path);
      planWrites.push({ path: c.params.path, content: c.params.content });
      return { result: `${c.api}(${c.params.path}) → planned`, item: { kind: 'write', api: c.api, path: c.params.path, adds, dels, status: 'Planned' } };
    }
    try {
      const r = await callTrusted(c.api, c.params);
      onLog(`${c.api} ✓`);
      if (isRead) {
        const body = typeof r === 'string' ? r : JSON.stringify(r);
        if (c.api === 'code.read' && c.params?.path) onExplore?.(c.params.path);
        return { result: `${c.api}(${JSON.stringify(c.params)}) →\n${body.slice(0, 1200)}`, item: { kind: 'explore', api: c.api, path } };
      }
      const { adds, dels } = await diffStats(path);
      return { result: `${c.api}(${path}) → applied`, item: { kind: 'write', api: c.api, path, adds, dels, status: 'Applied' } };
    } catch (err) {
      onLog(`${c.api} ✗ ${err.message}`);
      return { result: `${c.api} → error: ${err.message}`, item: { kind: 'error', text: `${c.api} ✗ ${err.message}` } };
    }
  };

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    setInput(''); setBusy(true); setPlan(null); setWorking([]);
    const userMsg = { role: 'user', content: text };
    const ctx = active ? `\n\nOpen file ${active.path}:\n\`\`\`\n${active.content.slice(0, 6000)}\n\`\`\`` : '';
    const toolDoc = (spec.read || spec.write !== 'none') ? buildCodeDoc() : '';
    const system = `${spec.prompt}\n${toolDoc}\n${workspaceCtx}\nWhen done, give a single concise final answer as plain text (no api block). Never repeat a paragraph.`;
    const messagesArr = [
      { role: 'system', content: system },
      ...messages.slice(-12), userMsg, { role: 'user', content: ctx || '(no file open)' },
    ];
    setCtxUsed(estCtx(messagesArr));
    setMessages(p => [...p, userMsg]);
    const planWrites = []; const trace = [];
    const push = item => { trace.push(item); setWorking([...trace]); };
    let last = Date.now();
    try {
      for (let step = 0; step < 6; step++) {
        let reply;
        try { reply = await runModel(messagesArr); } catch (err) { setMessages(p => [...p, { role: 'assistant', content: `⚠️ Model error: ${err.message}`, trace: [...trace] }]); break; }
        const calls = extractCodeCalls(reply);
        const thought = (stripToolBlocks(reply) || '').trim();
        // Only trace a thought for intermediate steps; a tool-free reply IS the
        // final answer and is rendered once as the message body (not twice).
        if (thought && calls.length) push({ kind: 'think', text: thought, secs: Math.max(1, Math.round((Date.now() - last) / 1000)) });
        last = Date.now();
        // Chat mode is tool-free: answer directly.
        if (!spec.read && spec.write === 'none') { setMessages(p => [...p, { role: 'assistant', content: reply, trace: [...trace] }]); break; }
        if (!calls.length) { setMessages(p => [...p, { role: 'assistant', content: reply, trace: [...trace] }]); break; }
        const results = [];
        for (const c of calls) { const { result, item } = await actOnCall(c, planWrites); results.push(result); push(item); }
        messagesArr.push({ role: 'assistant', content: reply });
        messagesArr.push({ role: 'user', content: `Tool results:\n${results.join('\n')}\nReason over these. Call more tools if you need more information, or give your final answer as plain text with NO api block when ready.` });
        setCtxUsed(estCtx(messagesArr));
        if (step === 5) { const fin = await runModel(messagesArr); setMessages(p => [...p, { role: 'assistant', content: fin, trace: [...trace] }]); }
      }
      if (mode === 'plan' && planWrites.length) setPlan({ text: 'Plan ready — review the files and apply when ready.', writes: planWrites });
    } catch (err) {
      setMessages(p => [...p, { role: 'assistant', content: `⚠️ ${err.message}` }]);
    } finally { setBusy(false); setWorking([]); }
  };

  const applyPlan = async () => {
    if (!plan) return;
    for (const w of plan.writes) onStageWrite(w.path, w.content);
    setMessages(p => [...p, { role: 'assistant', content: `Staged ${plan.writes.length} file diff(s) — review each in the editor and Accept or Reject.` }]);
    setPlan(null);
  };

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-black/40 bg-[#252526]">
      <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2">
        <Icon name="Bot" size={14} className="text-[#3794ff]" /><span className="text-[12px] font-semibold text-white">Chat</span>
        <span className="ml-auto flex items-center gap-1 text-[11px]">
          <ContextRing used={ctxUsed} limit={ctxLimit} />
          {MODE_ORDER.map(m => (
            <button key={m} className={`rounded px-2 py-0.5 ${mode === m ? 'bg-[#0e639c] text-white' : 'text-white/50 hover:bg-white/10'}`} onClick={() => setMode(m)}>{MODES[m].label}</button>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-black/40 px-3 py-1.5">
        <select className="rounded border border-white/10 bg-[#3c3c3c] px-1 py-0.5 text-[11px]" value={provider} onChange={e => setProvider(e.target.value)}>
          <option value="local">On-device</option>
          {Object.entries(AI_PROVIDERS).filter(([id]) => id !== 'builtin').map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
        </select>
        {provider === 'local' && (
          <select className="min-w-0 flex-1 rounded border border-white/10 bg-[#3c3c3c] px-1 py-0.5 text-[11px]" value={localTarget} onChange={e => { setLocalModel(e.target.value); storage.set('ai-local-model', e.target.value); }}>
            {downloadedOptions.length === 0 && <option value={localTarget}>No models</option>}
            {downloadedOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-[12.5px]">
        {messages.length === 0 && <p className="text-white/40">Ask the AI to read, plan, or edit your project. It always has the full code.* tool set.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`rounded p-2 ${m.role === 'user' ? 'bg-[#0e639c]/30' : 'bg-white/5'}`} onContextMenu={event => onCtxMenu?.(event, [
            { id: 'copy', label: 'Copy', icon: 'Copy', action: () => navigator.clipboard?.writeText(m.content) },
            { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, idx) => idx !== i)) },
            ...(m.role === 'assistant' ? [{ id: 'insert', label: 'Insert code into editor', icon: 'FileCode', action: () => { const code = m.content.match(/```[\s\S]*?```/g); if (code) onStageWrite(active?.path || 'untitled.js', code.join('\n').replace(/```\w*\n?|```/g, '')); } }] : []),
          ])}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/40">{m.role}</div>
            {m.trace && m.trace.length > 0 && <div className="mb-1.5"><TraceList items={m.trace} onExplore={onExplore} /></div>}
            {m.role === 'assistant'
              ? <div className="md-body text-[12.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: safeMarkdown(cleanAssistant(m.content)) }} />
              : <div className="whitespace-pre-wrap">{m.content}</div>}
          </div>
        ))}
        {busy && (
          <div className="rounded border border-[#3794ff]/30 bg-[#3794ff]/5 p-2 text-[11.5px]">
            <div className="mb-1 flex items-center gap-1 font-semibold text-[#3794ff]"><Icon name="Loader2" size={12} className="animate-spin" /> Thinking & using tools…</div>
            {working.length === 0 ? <div className="text-white/40">…</div> : <TraceList items={working} onExplore={onExplore} />}
          </div>
        )}
        {plan && (
          <div className="rounded border border-[#3794ff]/40 bg-[#3794ff]/10 p-2">
            <div className="mb-1 text-[11px] font-semibold text-[#3794ff]">Plan — {plan.writes.length} file(s)</div>
            {plan.writes.map((w, i) => <div key={i} className="font-mono text-[11px] text-white/70">{w.path}</div>)}
            <button className="mt-2 flex items-center gap-1 rounded bg-[#0e639c] px-2 py-1 text-[11px] text-white" onClick={applyPlan}><Icon name="Play" size={11} /> Apply plan</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="border-t border-black/40 p-2" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2 rounded border border-white/10 bg-[#3c3c3c] p-2">
          <textarea className="max-h-28 min-h-[36px] flex-1 resize-y bg-transparent text-[12.5px] outline-none" placeholder="Describe what to build…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="rounded bg-[#0e639c] p-1.5 text-white hover:bg-[#1177bb]" disabled={busy || !input.trim()}><Icon name="Send" size={14} /></button>
        </div>
      </form>
    </div>
  );
}
