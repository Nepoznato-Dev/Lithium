import React, { useRef } from 'react';
import Icon from '../../../Icon';

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
      <div className="flex items-center gap-2 border-b border-[#3a3a3a] bg-[#252526] px-3 py-1.5 text-[12px]">
        <span className="font-mono">{path}</span>
        <span className="text-emerald-400">+{adds}</span><span className="text-red-400">−{dels}</span>
        {pending.isNew && <span className="rounded bg-emerald-500/20 px-1.5 text-emerald-300">new file</span>}
        <span className="ml-auto flex gap-2">
          <button className="flex items-center gap-1 rounded bg-[#0e639c] px-2 py-1 text-white hover:bg-[#1177bb]" onClick={onAccept}><Icon name="Check" size={12} /> Accept</button>
          <button className="flex items-center gap-1 rounded bg-[#3a3a3a] px-2 py-1 hover:bg-[#4a4a4a]" onClick={onReject}><Icon name="XCircle" size={12} /> Reject</button>
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
        <button className="rounded bg-[#3a3a3a] px-3 py-1 text-[12px] hover:bg-[#4a4a4a]" onClick={onToggleTerm}>Open Terminal</button>
      </div>
    </div>
  );
}
const Kbd = ({ k }) => <span className="rounded border border-[#4a4a4a] bg-[#3a3a3a] px-1.5 text-[11px]">{k}</span>;

export default function EditorGroup({ tabs, activeId, active, pending, onSelectTab, onCloseTab, onCloseOthers, onCloseAll, onTabContentChange, onSave, onAcceptDiff, onRejectDiff, onNewFile, onNewFolder, onToggleTerm, onOpenChat, onCtxMenu, termOpen }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      {/* Tabs */}
      <div className="flex overflow-x-auto bg-[#2d2d2d]">
        {tabs.map(t => (
          <div key={t.id} className={`group flex items-center gap-2 border-r border-[#3a3a3a] px-3 py-1.5 text-[12px] ${t.id === activeId ? 'bg-[#1e1e1e] text-white' : 'text-[#888888] hover:bg-[#333333]'}`} onClick={() => onSelectTab(t.id)} onContextMenu={event => { event.stopPropagation(); onCtxMenu(event, [
            { id: 'name', type: 'heading', label: t.name },
            { id: 'close', label: 'Close', icon: 'X', action: () => onCloseTab(t.id) },
            { id: 'close-others', label: 'Close others', icon: 'XCircle', action: () => onCloseOthers(t.id) },
            { id: 'close-all', label: 'Close all', icon: 'X', action: onCloseAll },
            { id: 'sep', type: 'separator' },
            { id: 'copy-path', label: 'Copy file path', icon: 'Copy', action: () => navigator.clipboard?.writeText(t.path) },
          ]); }}>
            <span className="truncate">{t.name}</span>
            {t.dirty && <span className="text-amber-300">●</span>}
            <button className="hidden group-hover:block text-white/50 hover:text-white" onClick={ev => { ev.stopPropagation(); onCloseTab(t.id); }}><Icon name="X" size={12} /></button>
          </div>
        ))}
      </div>

      {/* Editor / diff */}
      {!active ? (
        <EmptyState onToggleTerm={onToggleTerm} onOpenChat={onOpenChat} onContextMenu={event => onCtxMenu(event, [
          { id: 'new-file', label: 'New file', icon: 'FilePlus', action: onNewFile },
          { id: 'new-folder', label: 'New folder', icon: 'FolderPlus', action: onNewFolder },
          { id: 'toggle-term', label: termOpen ? 'Close terminal' : 'Open terminal', icon: 'SquareTerminal', action: onToggleTerm },
          { id: 'open-chat', label: 'Open AI chat', icon: 'MessageSquare', action: onOpenChat },
        ])} />
      ) : pending[active.path] ? (
        <DiffView path={active.path} pending={pending[active.path]} onAccept={() => onAcceptDiff(active.path)} onReject={() => onRejectDiff(active.path)} />
      ) : (
        <Editor tab={active} onChange={c => onTabContentChange(active.id, c)} onSave={() => onSave(active)} onCtxMenu={onCtxMenu} />
      )}
    </div>
  );
}
