import { useState } from 'react';
import Icon from '../../../Icon';

export default function HistoryView({ chats, openChat, deleteChat, onCtxMenu }) {
  const [search, setSearch] = useState('');
  const filtered = chats.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
      <div><p className="text-xs text-[#72808a]">Workspace / History</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f4f2]">Chat history</h1><p className="mt-1 text-sm text-[#808c95]">Revisit prompts and responses from your Playground sessions.</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#10151b] px-4 py-2.5">
        <Icon name="Search" size={16} className="text-[#68757e]" />
        <input placeholder="Search conversations…" className="w-full bg-transparent text-sm text-[#d7e1db] outline-none placeholder:text-[#65717a]" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-white/30">{chats.length === 0 ? 'No saved conversations yet. Start chatting in the Playground.' : 'No conversations match your search.'}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10151b]">
          {filtered.map(chat => (
            <div key={chat.id} className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0 hover:bg-white/[0.035]" onContextMenu={event => onCtxMenu?.(event, [
              { id: 'open', label: 'Open conversation', icon: 'MessageSquare', action: () => openChat(chat.id) },
              { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
              { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => deleteChat(chat.id) },
            ])}>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-[#8d9b9f]"><Icon name="MessageSquare" size={14} /></div>
              <div className="min-w-0 flex-1">
                <button className="truncate text-left text-sm text-[#dce5e0] hover:text-white" onClick={() => openChat(chat.id)}>{chat.title}</button>
                <p className="mt-0.5 font-mono text-[10px] text-[#68757e]">{chat.messages?.length || 0} messages · {chat.provider || 'unknown'}</p>
              </div>
              <button className="shrink-0 rounded p-1.5 text-white/35 hover:bg-red-500/15 hover:text-red-300" title="Delete" onClick={() => deleteChat(chat.id)}><Icon name="Trash2" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
