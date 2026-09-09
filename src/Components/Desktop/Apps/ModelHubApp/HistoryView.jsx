import { useState } from 'react';
import Icon from '../../../Icon';

export default function HistoryView({ chats, openChat, deleteChat, onCtxMenu }) {
  const [search, setSearch] = useState('');
  const filtered = chats.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-white p-5 sm:p-7">
      <div><h1 className="text-base font-semibold text-[#2d2d2d]">Chat history</h1><p className="mt-1 text-xs text-[#9e9890]">Revisit prompts and responses from your Playground sessions.</p></div>
      <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2" style={{ borderColor: '#e8e4dd' }}>
        <Icon name="Search" size={14} className="text-[#9e9890]" />
        <input placeholder="Search conversations…" className="w-full bg-transparent text-sm text-[#2d2d2d] outline-none placeholder:text-[#9e9890]" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-[#9e9890]">{chats.length === 0 ? 'No saved conversations yet. Start chatting in the Playground.' : 'No conversations match your search.'}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: '#e8e4dd' }}>
          {filtered.map(chat => (
            <div key={chat.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-[#faf8f5] transition-colors" style={{ borderBottomColor: '#e8e4dd' }} onContextMenu={event => onCtxMenu?.(event, [
              { id: 'open', label: 'Open conversation', icon: 'MessageSquare', action: () => openChat(chat.id) },
              { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
              { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => deleteChat(chat.id) },
            ])}>
              <div className="grid h-7 w-7 place-items-center rounded-md text-[#9e9890]" style={{ background: '#eae6df' }}><Icon name="MessageSquare" size={13} /></div>
              <div className="min-w-0 flex-1">
                <button className="truncate text-left text-[13px] text-[#2d2d2d] hover:text-[#4a9e6d] transition-colors" onClick={() => openChat(chat.id)}>{chat.title}</button>
                <p className="mt-0.5 text-[10px] text-[#9e9890]">{chat.messages?.length || 0} messages · {chat.provider || 'unknown'}</p>
              </div>
              <button className="shrink-0 rounded p-1.5 text-[#9e9890] hover:bg-red-500/10 hover:text-red-500 transition-colors" title="Delete" onClick={() => deleteChat(chat.id)}><Icon name="Trash2" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
