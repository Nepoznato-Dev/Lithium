import React from 'react';
import Icon from '../../../Icon';
import WinControls from '../../WinControls';
import useCodeStudioState from './useCodeStudioState';
import ActivityBar from './ActivityBar';
import ExplorerPanel from './ExplorerPanel';
import EditorGroup from './EditorGroup';
import ChatPanel from './ChatPanel';
import Terminal from './Terminal';
import ContextMenu from '../../ContextMenu';

/**
 * Code Studio — a VSCode-style IDE.
 *  Activity bar · Explorer/Search side panel · tabbed editor with inline diffs ·
 *  bottom terminal (real commands over the virtual FS) · right AI panel with
 *  Agent / Chat / Plan modes. The AI always receives the full code.* tool list.
 */
export default function CodeStudioApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const s = useCodeStudioState({ windowed });

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#1e1e1e] text-[#cccccc]">
      {/* Menu bar */}
      <div className="flex min-w-0 items-center gap-3 overflow-hidden border-b border-[#4a4a4a] bg-[#323232] px-3 py-1 text-[12px] text-white/80">
        <span className="font-semibold text-white">Code Studio</span>
        {['File', 'Edit', 'View', 'Run', 'Terminal', 'Help'].map(m => (
          <button key={m} className="hover:bg-[#4a4a4a] rounded px-1.5" onClick={() => { if (m === 'Terminal') s.setTermOpen(v => !v); }}>{m}</button>
        ))}
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activity={s.activity}
          chatOpen={s.chatOpen}
          onActivityChange={s.setActivity}
          onToggleChat={() => s.setChatOpen(v => !v)}
        />

        <ExplorerPanel
          activity={s.activity}
          tree={s.tree}
          projects={s.projects}
          expanded={s.expanded}
          search={s.search}
          searchResults={s.searchResults}
          activeId={s.activeId}
          onToggleExpanded={s.toggleExpanded}
          onOpenFile={s.openFile}
          onExtractZip={s.extractZip}
          onNewFile={s.newFile}
          onNewFolder={s.newFolder}
          onCtxMenu={s.openCtxMenu}
          treeCommit={s.commit}
        />

        <EditorGroup
          tabs={s.tabs}
          activeId={s.activeId}
          active={s.active}
          pending={s.pending}
          onSelectTab={s.setActiveId}
          onCloseTab={s.closeTab}
          onCloseOthers={s.closeOthers}
          onCloseAll={s.closeAll}
          onTabContentChange={s.setTabContent}
          onSave={s.saveTab}
          onAcceptDiff={s.acceptDiff}
          onRejectDiff={s.rejectDiff}
          onNewFile={s.newFile}
          onNewFolder={s.newFolder}
          onToggleTerm={() => s.setTermOpen(v => !v)}
          onOpenChat={() => s.setChatOpen(true)}
          onCtxMenu={s.openCtxMenu}
          termOpen={s.termOpen}
        />

        {s.chatOpen && (
          <ChatPanel
            tree={s.tree}
            active={s.active}
            onStageWrite={s.stageWrite}
            onExplore={path => {
              const segs = path.split('/').filter(Boolean);
              // lightweight path → entry lookup via the tree
              const found = s.tree.find(e => {
                const p = [];
                let cur = e;
                while (cur && cur.parentId !== 'default-projects') { p.unshift(cur.name); cur = s.tree.find(x => x.id === cur.parentId); }
                if (cur) p.unshift(cur.name);
                return p.join('/') === path;
              });
              if (found && found.type !== 'folder') s.openFile(found);
            }}
            onLog={line => window.dispatchEvent(new CustomEvent('code-studio-log', { detail: line }))}
            onCtxMenu={s.openCtxMenu}
          />
        )}
      </div>

      {/* Bottom terminal */}
      {s.termOpen && <Terminal onCtxMenu={s.openCtxMenu} />}

      {/* Status bar */}
      <div className="flex items-center gap-3 bg-[#0e7a6d] px-3 py-0.5 text-[11px] text-white">
        <span className="flex items-center gap-1"><Icon name="GitBranch" size={12} /> main</span>
        <span className="flex items-center gap-1"><Icon name="AlertTriangle" size={12} /> 0</span>
        <span className="ml-auto">{s.active ? `${s.active.name}${s.active.dirty ? ' (unsaved)' : ''}` : 'No file'}</span>
        <span>UTF-8</span><span>LF</span><span>IDE</span>
      </div>

      {/* Context menu */}
      {s.ctxMenu && <ContextMenu menu={s.ctxMenu} onClose={s.closeCtxMenu} />}
    </div>
  );
}
