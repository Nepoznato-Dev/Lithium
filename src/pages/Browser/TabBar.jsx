/**
 * TabBar — Brave-style tab strip.
 * Tabs have rounded top corners, active tab merges with toolbar background.
 * Close button appears on hover. Middle-click to close.
 * Right-click opens a context menu with tab operations.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { tabs, activeTabId, setActiveTab, closeTab, addTab, duplicateTab, pinTab, closeOtherTabs, closeTabsToRight } from './stores/tabStore';
import Icon from '../../Components/Icon';
import * as core from '../../lib/core';

function hostname(url) {
  const result = core.browserHostnameSync(url);
  if (result) return result;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function TabBar() {
  const allTabs = tabs.value;
  const active = activeTabId.value;

  // Context menu state
  const [ctxTab, setCtxTab] = useState(null);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!ctxTab) return;
    const handler = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxTab(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxTab]);

  const handleContextMenu = (e, tabId) => {
    e.preventDefault();
    setCtxTab(tabId);
    setCtxPos({ x: e.pageX, y: e.pageY });
  };

  const ctxAction = (fn) => {
    fn();
    setCtxTab(null);
  };

  const ctxTabData = ctxTab ? allTabs.find(t => t.id === ctxTab) : null;
  const ctxIndex = ctxTab ? allTabs.findIndex(t => t.id === ctxTab) : -1;
  const isLast = ctxIndex === allTabs.length - 1;

  return (
    <div className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto scrollbar-none">
      {allTabs.map(tab => {
        const entry = tab.index >= 0 ? tab.history[tab.index] : null;
        const url = typeof entry === 'object' ? entry?.url : entry;
        const isActive = tab.id === active;
        const title = url ? hostname(url) : 'New tab';
        return (
          <div
            key={tab.id}
            className={`browser-tab ${isActive ? 'browser-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={e => { if (e.button === 1) closeTab(tab.id); }}
            onContextMenu={e => handleContextMenu(e, tab.id)}
          >
            {tab.isLoading ? (
              <Icon name="Loader2" className="h-3.5 w-3.5 shrink-0 animate-spin opacity-60" />
            ) : tab.favicon ? (
              <img src={tab.favicon} className="h-3.5 w-3.5 shrink-0 rounded-sm" alt="" />
            ) : (
              <Icon name="Globe" className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
            <span className="flex-1 truncate">{tab.title !== 'New tab' ? tab.title : title}</span>
            {tab.isPinned && <Icon name="Pin" className="h-3 w-3 shrink-0 opacity-30" />}
            <button
              className="browser-tab__close"
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              aria-label="Close tab"
            >
              <Icon name="X" className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      {/* New tab button */}
      <button
        className="browser-nav-btn mb-1 ml-1 h-7 w-7 shrink-0"
        onClick={() => addTab()}
        aria-label="New tab"
        title="New tab (Ctrl+T)"
      >
        <Icon name="Plus" className="h-3.5 w-3.5" />
      </button>

      {/* Tab context menu */}
      {ctxTab && (
        <div
          className="tab-context-menu"
          ref={ctxRef}
          style={{ left: ctxPos.x, top: ctxPos.y }}
        >
          <button className="ntp-ctx-item" onClick={() => ctxAction(() => duplicateTab(ctxTab))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Duplicate tab
          </button>
          <button className="ntp-ctx-item" onClick={() => ctxAction(() => pinTab(ctxTab))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z" />
            </svg>
            {ctxTabData?.isPinned ? 'Unpin tab' : 'Pin tab'}
          </button>
          <div className="tab-ctx-sep" />
          <button className="ntp-ctx-item" onClick={() => ctxAction(() => closeOtherTabs(ctxTab))} disabled={allTabs.length <= 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close other tabs
          </button>
          <button className="ntp-ctx-item" onClick={() => ctxAction(() => closeTabsToRight(ctxTab))} disabled={isLast}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close tabs to the right
          </button>
          <div className="tab-ctx-sep" />
          <button className="ntp-ctx-item ntp-ctx-item--danger" onClick={() => ctxAction(() => closeTab(ctxTab))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close tab
          </button>
          <div className="tab-ctx-sep" />
          <button className="ntp-ctx-item" onClick={() => ctxAction(() => { setCtxTab(null); addTab(); })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New tab
          </button>
        </div>
      )}
    </div>
  );
}
