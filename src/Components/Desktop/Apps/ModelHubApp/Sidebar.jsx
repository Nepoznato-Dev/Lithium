import Icon from '../../../Icon';
import { upsertChat, deleteChat } from '../../../../lib/ai/agent';

const NAV_ITEMS = [
  { id: 'playground', label: 'Playground', icon: 'Terminal' },
  { id: 'models', label: 'Models', icon: 'BrainCircuit' },
  { id: 'connections', label: 'Connections', icon: 'Database' },
  { id: 'memory', label: 'Memory', icon: 'ShieldCheck' },
  { id: 'history', label: 'History', icon: 'Clock3' },
];

export default function Sidebar({ view, setView, chats, chatId, openChat, onNewChat, onRefreshChats, onCtxMenu }) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0e1217] md:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#c3f5d9] text-[#102119]"><Icon name="Sparkles" size={16} /></span>
        <span className="text-[15px] font-semibold tracking-tight text-[#eef5f0]">Cortex</span>
      </div>
      <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#5d6873]">Workspace</p>
      <nav className="space-y-0.5 px-3">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setView(id)} onContextMenu={event => onCtxMenu?.(event, [
            { id: 'go', label: `Switch to ${label}`, icon, action: () => setView(id) },
          ])} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${view === id ? 'bg-white/[0.08] text-[#eaf8ef]' : 'text-[#7f8b94] hover:bg-white/[0.04] hover:text-[#dce5e2]'}`}>
            <Icon name={icon} size={16} strokeWidth={1.7} />{label}
          </button>
        ))}
      </nav>
      {view === 'playground' && (
        <>
          <div className="mx-3 my-3 border-t border-white/[0.07]" />
          <div className="flex items-center justify-between px-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#5d6873]">Chats</p>
            <button className="rounded p-1 text-[#7f8b94] hover:bg-white/[0.06] hover:text-white" onClick={onNewChat}><Icon name="Plus" size={13} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
            {chats.map(chat => (
              <button key={chat.id} onClick={() => openChat(chat.id)} onContextMenu={event => onCtxMenu?.(event, [
                { id: 'open', label: 'Open', icon: 'MessageSquare', action: () => openChat(chat.id) },
                { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const t = prompt('New title:', chat.title); if (t?.trim()) { upsertChat({ ...chat, title: t.trim() }); onRefreshChats?.(); } } },
                { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
                { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { deleteChat(chat.id); onRefreshChats?.(); } },
              ])} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${chat.id === chatId ? 'bg-white/[0.08] text-[#e4eee8]' : 'text-[#849099] hover:bg-white/[0.05] hover:text-white'}`}>
                <Icon name="MessageSquare" size={12} className="shrink-0" /><span className="truncate">{chat.title}</span>
              </button>
            ))}
            {chats.length === 0 && <p className="px-2 py-3 text-[11px] text-white/25">No saved chats yet</p>}
          </div>
        </>
      )}
      <div className="mt-auto shrink-0 px-3 pb-3">
        <div className="rounded-xl border border-[#b9e9ca]/10 bg-[#b9e9ca]/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#c7e8d2]"><Icon name="ShieldCheck" size={14} /> Local-first</div>
          <p className="mt-1 text-[11px] leading-[18px] text-[#718079]">Models, keys and files stay on this device.</p>
        </div>
      </div>
    </aside>
  );
}
