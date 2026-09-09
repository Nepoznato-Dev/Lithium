import { useState, useMemo } from 'react';
import Icon from '../../../Icon';
import { upsertChat, deleteChat } from '../../../../lib/ai/agent';
import { useSettings } from '../../../SettingsContext';

const WORKSPACE_ITEMS = [
  { id: 'sng', label: 'SNG', icon: 'Sprout', color: '#4a9e6d' },
  { id: 'ai-training', label: 'AI-Model-Training-Essen...', icon: 'Coffee', color: '#f59e0b' },
];

const WORKSPACE_SUB_ITEMS = {
  'sng': [{ label: 'Understand SNG design', active: false }],
  'ai-training': [{ label: 'Repo ideas', active: false }],
};

const WORKSPACE_TABS = [
  { id: 'general', label: 'General', icon: 'LayoutGrid' },
  { id: 'coding', label: 'Coding', icon: 'Code2' },
];

const BOTTOM_NAV = [
  { id: 'knowledge-center', label: 'Knowledge Center', icon: 'BookOpen' },
  { id: 'automations', label: 'Automations', icon: 'Zap' },
  { id: 'extensions', label: 'Extensions', icon: 'Puzzle' },
];

function chatDateGroup(chat) {
  const ts = chat.updatedAt || 0;
  if (!ts) return 'older';
  const now = Date.now();
  const day = 86400000;
  const age = now - ts;
  if (age < day) return 'today';
  if (age < 2 * day) return 'yesterday';
  if (age < 7 * day) return 'week';
  return 'older';
}

const GROUP_LABELS = { today: 'Today', yesterday: 'Yesterday', week: 'Previous 7 Days', older: 'Older' };
const GROUP_ORDER = ['today', 'yesterday', 'week', 'older'];

export default function Sidebar({ view, setView, chats, chatId, openChat, onNewChat, onRefreshChats, onCtxMenu }) {
  const { settings } = useSettings();
  const [collapsed, setCollapsed] = useState({});
  const [activeTab, setActiveTab] = useState('general');

  const grouped = useMemo(() => {
    const groups = { today: [], yesterday: [], week: [], older: [] };
    for (const chat of chats) {
      groups[chatDateGroup(chat)].push(chat);
    }
    return groups;
  }, [chats]);

  const toggleGroup = (group) => setCollapsed(prev => ({ ...prev, [group]: !prev[group] }));

  const sectionLabel = activeTab === 'general' ? 'Folders' : 'Workspaces';

  return (
    <aside className="cortex-sidebar hidden w-[260px] shrink-0 flex-col md:flex" style={{ background: '#f5f2ed' }}>
      {/* Pill tab switcher — clean solid style */}
      <div className="flex h-12 shrink-0 items-center px-3 pt-2">
        <div className="flex items-center rounded-lg bg-[#eae6df] p-0.5">
          {WORKSPACE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white text-[#2d2d2d]'
                  : 'text-[#6b6560] hover:text-[#2d2d2d]'
              }`}
            >
              <Icon name={tab.icon} size={13} strokeWidth={2} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="shrink-0 px-2 pt-3 pb-1">
        <button
          onClick={() => { setView('playground'); onNewChat?.(); }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#2d2d2d] transition-colors hover:bg-[#eae6df]"
        >
          <Icon name="Plus" size={15} strokeWidth={2} />
          New Task
        </button>
        <button
          onClick={() => {}}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-[#6b6560] transition-colors hover:bg-[#eae6df] hover:text-[#2d2d2d]"
        >
          <Icon name="Search" size={15} strokeWidth={1.7} />
          Search
        </button>
      </div>

      {/* Section: Automations */}
      <div className="shrink-0 px-2 pt-2">
        <p className="px-3 pb-1 text-[11px] font-medium text-[#9e9890]">Automations</p>
        <nav className="space-y-0.5">
          <button
            onClick={() => setView('playground')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              view === 'playground' ? 'bg-[#eae6df] text-[#2d2d2d] font-medium' : 'text-[#6b6560] hover:bg-[#eae6df] hover:text-[#2d2d2d]'
            }`}
          >
            <Icon name="Bot" size={15} strokeWidth={1.7} />
            Agent
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2d2d2d]/70" />
          </button>
          <button
            onClick={() => setView('memory')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 pl-9 text-[12px] text-[#6b6560] transition-colors hover:bg-[#eae6df] hover:text-[#2d2d2d]"
          >
            Review and verification agen...
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4a90d9]" />
          </button>
        </nav>
      </div>

      {/* Section: Workspaces / Folders */}
      <div className="shrink-0 px-2 pt-3">
        <p className="px-3 pb-1 text-[11px] font-medium text-[#9e9890]">{sectionLabel}</p>
        <nav className="space-y-0.5">
          {WORKSPACE_ITEMS.map(ws => (
            <div key={ws.id}>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-[#6b6560] transition-colors hover:bg-[#eae6df] hover:text-[#2d2d2d]"
              >
                <Icon name={ws.icon} size={15} strokeWidth={1.7} style={{ color: ws.color }} />
                <span className="truncate">{ws.label}</span>
              </button>
              {WORKSPACE_SUB_ITEMS[ws.id]?.map((sub, i) => (
                <button
                  key={i}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 pl-9 text-[12px] text-[#6b6560] transition-colors hover:bg-[#eae6df] hover:text-[#2d2d2d]"
                >
                  <span className="truncate">{sub.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* Chat list (only in playground view) */}
      {view === 'playground' && (
        <>
          <div className="mx-3 my-2 border-t" style={{ borderColor: '#e0dcd5' }} />
          <div className="flex items-center justify-between px-4 pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9e9890]">Chats</p>
            <button className="rounded p-1 text-[#9e9890] hover:bg-[#e0dcd5] hover:text-[#2d2d2d] transition-colors" onClick={onNewChat}>
              <Icon name="Plus" size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
            {GROUP_ORDER.map(group => {
              const items = grouped[group];
              if (!items || items.length === 0) return null;
              const isCollapsed = collapsed[group];
              return (
                <div key={group}>
                  <button onClick={() => toggleGroup(group)} className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9e9890] hover:text-[#6b6560] transition-colors">
                    <Icon name={isCollapsed ? 'ChevronRight' : 'ChevronDown'} size={10} className="shrink-0" />
                    {GROUP_LABELS[group]}
                    <span className="ml-auto text-[9px] text-[#9e9890]/50">{items.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-px">
                      {items.map(chat => (
                        <button
                          key={chat.id}
                          onClick={() => openChat(chat.id)}
                          onContextMenu={event => onCtxMenu?.(event, [
                            { id: 'open', label: 'Open', icon: 'MessageSquare', action: () => openChat(chat.id) },
                            { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const t = prompt('New title:', chat.title); if (t?.trim()) { upsertChat({ ...chat, title: t.trim() }); onRefreshChats?.(); } } },
                            { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
                            { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { deleteChat(chat.id); onRefreshChats?.(); } },
                          ])}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
                            chat.id === chatId
                              ? 'bg-[#eae6df] text-[#2d2d2d]'
                              : 'text-[#6b6560] hover:bg-[#eae6df] hover:text-[#2d2d2d]'
                          }`}
                        >
                          <input type="checkbox" className="h-3.5 w-3.5 shrink-0 rounded border-[#9e9890]/40 accent-[#4a9e6d]" onClick={e => e.stopPropagation()} readOnly />
                          <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                          {chat.messages?.length > 0 && <span className="shrink-0 text-[9px] text-[#9e9890]/50">{chat.messages.length}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {chats.length === 0 && <p className="px-2 py-3 text-[11px] text-[#9e9890]/60">No saved chats yet</p>}
          </div>
        </>
      )}

      {/* Bottom nav — Qoder style */}
      <div className="mt-auto shrink-0 border-t px-2 pt-2 pb-1" style={{ borderColor: '#e0dcd5' }}>
        {BOTTOM_NAV.map(item => (
          <button
            key={item.label}
            onClick={() => setView(item.id)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${view === item.id ? 'bg-[#eae6df] font-medium text-[#2d2d2d]' : 'text-[#6b6560] hover:bg-[#eae6df] hover:text-[#2d2d2d]'}`}
          >
            <Icon name={item.icon} size={15} strokeWidth={1.7} />
            {item.label}
          </button>
        ))}
      </div>

      {/* User profile — Qoder style */}
      <div className="shrink-0 border-t px-3 py-2.5" style={{ borderColor: '#e0dcd5' }}>
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: '#6b6560' }}>
            {settings.profile.username.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className="max-w-[130px] truncate text-[13px] font-medium text-[#2d2d2d]">{settings.profile.username}</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded p-1 text-[#9e9890] hover:bg-[#e0dcd5] hover:text-[#2d2d2d] transition-colors">
              <Icon name="HelpCircle" size={13} />
            </button>
            <button onClick={() => setView('cortex-settings')} title="Cortex settings" className="rounded p-1 text-[#9e9890] hover:bg-[#e0dcd5] hover:text-[#2d2d2d] transition-colors">
              <Icon name="Settings" size={13} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
