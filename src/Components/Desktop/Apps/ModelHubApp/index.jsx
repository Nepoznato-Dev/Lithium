import { useState, useEffect } from 'react';
import { deleteChat, loadChats, makeChatId } from '../../../../lib/ai/agent';
import Icon from '../../../Icon';
import WinControls from '../../WinControls';
import ContextMenu, { useContextMenu } from '../../ContextMenu';
import Sidebar from './Sidebar';
import PlaygroundView from './PlaygroundView';
import ModelsView from './ModelsView';
import ConnectionsView from './ConnectionsView';
import MemoryView from './MemoryView';
import HistoryView from './HistoryView';

export default function ModelHubApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [view, setView] = useState('playground');
  const [chats, setChats] = useState(loadChats);
  const [chatId, setChatId] = useState(() => makeChatId());
  const [ctxMenu, openCtxMenu, closeCtxMenu] = useContextMenu();

  useEffect(() => {
    const onKv = () => setChats(loadChats());
    window.addEventListener('lithium:kv-ready', onKv);
    return () => window.removeEventListener('lithium:kv-ready', onKv);
  }, []);

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

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0b0e12] text-[#e8eceb]">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0b0e12]/95 px-4 backdrop-blur-xl lg:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#c3f5d9] text-[#102119]"><Icon name="Sparkles" size={14} /></span>
          <span className="text-sm font-semibold tracking-tight text-[#eef5f0]">Cortex</span>
        </div>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar view={view} setView={setView} chats={chats} chatId={chatId} openChat={openChat} onNewChat={newChat} onRefreshChats={() => setChats(loadChats())} onCtxMenu={openCtxMenu} />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === 'playground' && <PlaygroundView onNeedModels={() => setView('models')} onCtxMenu={openCtxMenu} chatId={chatId} onChatIdChange={setChatId} />}
          {view === 'models' && <ModelsView onCtxMenu={openCtxMenu} />}
          {view === 'connections' && <ConnectionsView onCtxMenu={openCtxMenu} />}
          {view === 'memory' && <MemoryView onCtxMenu={openCtxMenu} />}
          {view === 'history' && <HistoryView chats={chats} openChat={openChat} deleteChat={removeChat} onCtxMenu={openCtxMenu} />}
        </main>
      </div>
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />}
    </div>
  );
}
