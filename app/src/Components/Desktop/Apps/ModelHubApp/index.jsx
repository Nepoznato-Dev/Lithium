import { useState, useEffect, useCallback } from 'react';
import { deleteChat, loadChats, makeChatId } from '../../../../lib/ai/agent';
import { storage } from '../../../../lib/storage/localStorage';
import Icon from '../../../Icon';
import WinControls from '../../WinControls';
import ContextMenu, { useContextMenu } from '../../ContextMenu';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import PlaygroundView from './PlaygroundView';
import ModelsView from './ModelsView';
import ConnectionsView from './ConnectionsView';
import MemoryView from './MemoryView';
import HistoryView from './HistoryView';
import KnowledgeView from './KnowledgeView';
import CommandPalette from './CommandPalette';
import WorkspaceToolsView from './WorkspaceToolsView';
import CortexSettingsView from './CortexSettingsView';
import ExtensionsView from './ExtensionsView';
import SecurityView from './SecurityView';

const VIEW_KEYS = { '1': 'playground', '2': 'models', '3': 'connections', '4': 'knowledge', '5': 'memory', '6': 'history' };

export default function ModelHubApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [view, setView] = useState('playground');
  const [appearance, setAppearance] = useState(() => storage.get('cortex-appearance', { mode: 'system', accent: '#3b82f6' }));
  const [chats, setChats] = useState(loadChats);
  const [chatId, setChatId] = useState(() => makeChatId());
  const [ctxMenu, openCtxMenu, closeCtxMenu] = useContextMenu();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activityBarView, setActivityBarView] = useState('chat');
  const cortexTheme = appearance.mode === 'system'
    ? (document.documentElement.dataset.theme || 'dark')
    : appearance.mode;

  const handleActivityChange = (newActivity) => {
    setActivityBarView(newActivity);
    // Map activity bar to view
    if (newActivity === 'playground' || newActivity === 'chat') setView('playground');
    else if (newActivity === 'workspace') setView('playground');
    else if (newActivity === 'knowledge') setView('knowledge-center');
    else if (newActivity === 'extensions') setView('extensions');
    else if (newActivity === 'security') setView('security');
    else if (newActivity === 'cortex-settings') setView('cortex-settings');
    else setView(newActivity);
  };

  const updateAppearance = next => {
    setAppearance(next);
    storage.set('cortex-appearance', next);
  };

  useEffect(() => {
    const onKv = () => setChats(loadChats());
    window.addEventListener('lithium:kv-ready', onKv);
    return () => window.removeEventListener('lithium:kv-ready', onKv);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'k') { e.preventDefault(); setPaletteOpen(v => !v); return; }
      if (ctrl && e.key === 'n') { e.preventDefault(); newChat(); return; }
      if (ctrl && e.shiftKey && e.key === 'H') { e.preventDefault(); setView('history'); return; }
      if (ctrl && VIEW_KEYS[e.key]) { e.preventDefault(); setView(VIEW_KEYS[e.key]); return; }
      if (e.key === 'Escape' && paletteOpen) { setPaletteOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen, chatId]);

  const openChat = id => {
    setView('playground');
    if (id === '__new') { setChatId(makeChatId()); return; }
    const chat = loadChats().find(c => c.id === id);
    if (chat) setChatId(chat.id);
  };

  const removeChat = id => {
    deleteChat(id);
    setChats(loadChats());
    if (id === chatId) setChatId(makeChatId());
  };

  const newChat = () => { setChatId(makeChatId()); setView('playground'); };

  const handlePaletteAction = useCallback((action) => {
    if (action === 'new-chat') newChat();
    else if (action === 'clear-chat') { setChatId(makeChatId()); }
    else if (action.startsWith('open-chat:')) openChat(action.slice(10));
  }, [chatId]);

  return (
    <div className="cortex-app flex h-full min-w-0 flex-col" data-cortex-theme={cortexTheme} style={{ '--cortex-accent': appearance.accent, background: cortexTheme === 'dark' ? '#0d0d0d' : '#ffffff', color: cortexTheme === 'dark' ? '#e5e5e5' : '#2d2d2d' }}>
      {/* Top bar — Qoder light header style */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4 lg:px-5" style={{ borderColor: cortexTheme === 'dark' ? '#333' : '#e8e4dd', background: cortexTheme === 'dark' ? '#1a1a1a' : '#f9f7f4' }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: cortexTheme === 'dark' ? '#1e3a2a' : '#eef7f1', color: cortexTheme === 'dark' ? '#6fcf97' : '#4a9e6d' }}><Icon name="Sparkles" size={14} /></span>
          <span className="text-sm font-semibold" style={{ color: cortexTheme === 'dark' ? '#e5e5e5' : '#2d2d2d' }}>Cortex</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-md p-1.5 transition-colors" style={{ color: cortexTheme === 'dark' ? '#a0a0a0' : '#9e9890' }} onMouseEnter={e => { e.currentTarget.style.background = cortexTheme === 'dark' ? '#333' : '#eae6df'; e.currentTarget.style.color = cortexTheme === 'dark' ? '#e5e5e5' : '#2d2d2d'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = cortexTheme === 'dark' ? '#a0a0a0' : '#9e9890'; }} onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">
            <Icon name="Search" size={14} />
          </button>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Activity Bar — Qoder/VS Code style icon rail */}
        <ActivityBar active={activityBarView} onChange={handleActivityChange} />
        <Sidebar view={view} setView={setView} chats={chats} chatId={chatId} openChat={openChat} onNewChat={newChat} onRefreshChats={() => setChats(loadChats())} onCtxMenu={openCtxMenu} />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === 'playground' && <PlaygroundView onNeedModels={() => setView('models')} onCtxMenu={openCtxMenu} chatId={chatId} onChatIdChange={setChatId} onNavigateModels={() => setView('models')} />}
          {view === 'models' && <ModelsView onCtxMenu={openCtxMenu} onOpenConnections={() => setView('connections')} />}
          {view === 'connections' && <ConnectionsView onCtxMenu={openCtxMenu} />}
          {view === 'memory' && <MemoryView onCtxMenu={openCtxMenu} />}
          {view === 'history' && <HistoryView chats={chats} openChat={openChat} deleteChat={removeChat} onCtxMenu={openCtxMenu} />}
          {view === 'knowledge' && <KnowledgeView onCtxMenu={openCtxMenu} />}
          {view === 'extensions' && <ExtensionsView />}
          {view === 'security' && <SecurityView />}
          {view === 'automations' && <WorkspaceToolsView type="automations" onStartTask={text => { sessionStorage.setItem('lithium:cortex-pending-prompt', text); newChat(); setView('playground'); }} />}
          {view === 'knowledge-center' && <WorkspaceToolsView type="knowledge" onStartTask={() => {}} />}
          {view === 'cortex-settings' && <CortexSettingsView appearance={appearance} onChange={updateAppearance} />}
        </main>
      </div>
      {/* Status bar — Qoder three-part footer */}
      <div className="flex h-6 shrink-0 items-center border-t px-4 text-[10px]" style={{ background: cortexTheme === 'dark' ? '#1a1a1a' : '#f9f7f4', color: cortexTheme === 'dark' ? '#a0a0a0' : '#9e9890', borderColor: cortexTheme === 'dark' ? '#333' : '#e8e4dd' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cortexTheme === 'dark' ? '#6fcf97' : '#4a9e6d' }} /> Ready</span>
          <span>{chats.length} chats</span>
          <span>{view === 'playground' ? 'Agent' : view.charAt(0).toUpperCase() + view.slice(1)}</span>
        </div>
        <div className="mx-auto">
          <span style={{ color: cortexTheme === 'dark' ? 'rgba(160,160,160,0.6)' : 'rgba(158,152,144,0.6)' }}>Cortex can make mistakes. Check important information.</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span>Ctrl+K for commands</span>
        </div>
      </div>
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={setView} onAction={handlePaletteAction} chats={chats} chatId={chatId} />
    </div>
  );
}
