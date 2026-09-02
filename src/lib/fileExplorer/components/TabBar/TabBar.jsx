/**
 * Tab strip with add/close/switch — extracted from the monolith.
 */
import Icon from '../../../../Components/Icon';
import WinControls from '../../../../Components/Desktop/WinControls';
import { tabs, activeTabId } from '../../state/signals.jsx';
import { useTabs } from '../../hooks/useTabs.jsx';

export default function TabBar({ windowed, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { addTab, closeTab, switchTab } = useTabs();

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-hidden border-b border-white/[0.06] bg-[#141418] px-2 pt-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.value.map(tab => {
          const tabName = tab.stack[tab.stack.length - 1]?.name || 'New Tab';
          return (
            <div
              key={tab.id}
              className={`group flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                tab.id === activeTabId.value
                  ? 'bg-[#19191d] text-white'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'
              }`}
              onClick={() => switchTab(tab.id)}
            >
              <Icon name="Folder" size={12} className="shrink-0" color="#f59e0b" />
              <span className="max-w-[100px] truncate">{tabName}</span>
              {tabs.value.length > 1 && (
                <button
                  className="ml-1 text-white/30 opacity-0 hover:text-white group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  aria-label="Close tab"
                >
                  <Icon name="X" size={11} />
                </button>
              )}
            </div>
          );
        })}
        <button
          className="flex items-center justify-center rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
          onClick={addTab}
          title="New tab"
        >
          <Icon name="Plus" size={13} />
        </button>
      </div>
      {windowed && WinControls && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
    </div>
  );
}
