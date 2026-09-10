import React, { useMemo } from 'react';
import Icon from '../../../Icon';
import { childrenOf, updateEntry, removeEntryDeep } from '../../../../lib/fileSystem';
import { PROJECTS_ID, CODE_EXT, projectPath } from './constants';

function Node({ entry, tree, expanded, onToggle, onOpen, onExtract, activeId, depth, onCtxMenu, treeCommit }) {
  const kids = childrenOf(tree, entry.id);
  const path = projectPath(tree, entry.id);
  if (entry.type === 'folder') {
    const open = expanded.has(entry.id);
    return (
      <div>
        <button className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-[12.5px] hover:bg-[#2a2d2e]" style={{ paddingLeft: 8 + depth * 10 }} onClick={() => onToggle(entry.id)} onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
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
    <div className={`group flex w-full items-center gap-1 px-2 py-0.5 ${activeId === entry.id ? 'bg-[#37373d] text-white' : 'text-white/70 hover:bg-[#2a2d2e]'}`} style={{ paddingLeft: 8 + (depth + 1) * 10 }} onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
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

export default function ExplorerPanel({ activity, tree, projects, expanded, search, searchResults, activeId, onToggleExpanded, onOpenFile, onExtractZip, onNewFile, onNewFolder, onCtxMenu, treeCommit }) {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-[#3a3a3a] bg-[#252526]">
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
        {activity === 'explorer' ? 'Explorer' : 'Search'}
        {activity === 'explorer' && <span className="ml-auto flex gap-1"><button className="hover:bg-[#3a3a3a] rounded p-0.5" title="New file" onClick={onNewFile}><Icon name="FilePlus" size={13} /></button><button className="hover:bg-[#3a3a3a] rounded p-0.5" title="New folder" onClick={onNewFolder}><Icon name="FolderPlus" size={13} /></button></span>}
      </div>
      {activity === 'explorer' ? (
        <div className="flex-1 overflow-y-auto pb-2">
          {projects.length === 0 && <p className="px-3 text-[11px] text-white/40">No projects. Import a GitHub repo via the Downloader.</p>}
          {projects.map(e => <Node key={e.id} entry={e} tree={tree} expanded={expanded} onToggle={onToggleExpanded} onOpen={onOpenFile} onExtract={onExtractZip} activeId={activeId} depth={0} onCtxMenu={onCtxMenu} treeCommit={treeCommit} />)}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <input className="mx-2 mb-1 rounded border border-[#3a3a3a] bg-[#3c3c3c] px-2 py-1 text-[12px] outline-none" placeholder="Search files" value={search} onChange={e => {/* handled by parent via search prop */}} />
          <div className="flex-1 overflow-y-auto">
            {searchResults.map(e => <button key={e.id} className="block w-full truncate px-3 py-1 text-left text-[12px] hover:bg-[#2a2d2e]" onClick={() => onOpenFile(e)}>{e.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
