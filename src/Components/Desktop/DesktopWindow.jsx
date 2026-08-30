import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { useDesktopWindows } from './DesktopWindowManager';
import ContextMenu, { useContextMenu } from './ContextMenu';
import { detectSnapZone, snapBounds, snapPreviewStyle } from '../../lib/desktop/ui';
import { storage } from '../../lib/storage';

/**
 * Window manager:
 *  - No titlebar — each app renders its own inline WinControls.
 *  - Multi-tab windows use the right-click context menu for tab switching.
 * Dragging works on any non-interactive pixel of the top zone.
 */
export default function DesktopWindow({ item, apps = [] }) {
  const { updateWindow, focusWindow, closeWindow, addTab, closeTab, setActiveTab } = useDesktopWindows();
  const [menu, openMenu, closeMenu] = useContextMenu();
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [snapZone, setSnapZone] = useState(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const tabs = item.tabs || [];
  const active = tabs.find(tab => tab.key === item.activeTab) || tabs[0];

  useEffect(() => {
    if (!dragging) return undefined;
    const snapAssist = storage.get('settings', {})?.window?.snapAssist;
    const move = event => {
      if (snapAssist) setSnapZone(detectSnapZone(event.clientX, event.clientY));
      updateWindow(item.id, {
        x: Math.max(0, Math.min(event.clientX - dragOffset.current.x, window.innerWidth - 100)),
        y: Math.max(0, Math.min(event.clientY - dragOffset.current.y, window.innerHeight - 100)),
      });
    };
    const stop = event => {
      const zone = snapAssist ? detectSnapZone(event.clientX, event.clientY) : null;
      if (zone === 'maximize') updateWindow(item.id, { maximized: true });
      else if (zone) updateWindow(item.id, snapBounds(zone));
      setSnapZone(null);
      setDragging(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, [dragging, item.id, updateWindow]);

  useEffect(() => {
    if (!resizing) return undefined;
    const move = event => updateWindow(item.id, {
      width: Math.max(320, resizeStart.current.width + (event.clientX - resizeStart.current.x)),
      height: Math.max(220, resizeStart.current.height + (event.clientY - resizeStart.current.y)),
    });
    const stop = () => setResizing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, [resizing, item.id, updateWindow]);

  if (item.minimized) return null;

  const style = item.maximized
    ? {
      left: 'var(--tb-left, 0px)',
      top: 0,
      width: 'calc(100% - var(--tb-left, 0px) - var(--tb-right, 0px))',
      height: 'calc(100% - var(--tb-bottom, 48px))',
    }
    : { left: item.x, top: item.y, width: item.width, height: item.height };

  const content = React.isValidElement(active?.component)
    ? (
      <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center text-xs text-white/30">Loading…</div>}>
        {React.cloneElement(active.component, {
          windowed: true,
          closeSelf: () => closeTab(item.id, active.key),
          minimizeSelf: () => updateWindow(item.id, { minimized: true }),
          maximizeSelf: () => updateWindow(item.id, { maximized: !item.maximized }),
          isMaximized: item.maximized,
        })}
      </React.Suspense>
    )
    : active?.component;

  // Drag from any non-interactive pixel in the top zone (app header area).
  const startDrag = event => {
    if (event.target.closest('button, a, input, select, textarea, label, [role="button"], [contenteditable="true"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY - rect.top > 40) return;
    if (item.maximized) {
      // Dragging a maximized window restores it under the cursor, then keeps dragging.
      const ratio = Math.max(0.15, Math.min(0.85, event.clientX / window.innerWidth));
      const x = Math.max(0, event.clientX - item.width * ratio);
      const y = Math.max(0, event.clientY - 16);
      updateWindow(item.id, { maximized: false, x, y });
      dragOffset.current = { x: event.clientX - x, y: event.clientY - y };
    } else {
      dragOffset.current = { x: event.clientX - item.x, y: event.clientY - item.y };
    }
    setDragging(true);
  };

  const windowMenu = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY - rect.top > 40) return; // apps handle their own menus below
    const tabActions = tabs.length > 1
      ? [
          { id: 'tab-heading', type: 'heading', label: 'Tabs' },
          ...tabs
            .filter(tab => tab.key !== active?.key)
            .map(tab => ({
              id: `switch-${tab.key}`,
              label: tab.title,
              icon: tab.icon,
              action: () => setActiveTab(item.id, tab.key),
            })),
          { id: 'new-tab', label: 'Open new app', icon: 'Plus', action: () => {
            const firstApp = apps[0];
            if (firstApp) addTab(item.id, { appId: firstApp.id, title: firstApp.name, icon: <Icon name={firstApp.icon} size={16} />, component: firstApp.component });
          }},
          { id: 'tab-sep', type: 'separator' },
        ]
      : [];
    event.preventDefault();
    openMenu(event, [
      { id: 'heading', type: 'heading', label: active?.title || item.title },
      ...tabActions,
      { id: 'minimize', label: 'Minimize', icon: 'Minus', action: () => updateWindow(item.id, { minimized: true }) },
      { id: 'maximize', label: item.maximized ? 'Restore down' : 'Maximize', icon: 'Maximize2', action: () => updateWindow(item.id, { maximized: !item.maximized }) },
      { id: 'snap-left', label: 'Snap to left half', icon: 'PanelLeft', action: () => updateWindow(item.id, snapBounds('left')) },
      { id: 'snap-right', label: 'Snap to right half', icon: 'PanelRight', action: () => updateWindow(item.id, snapBounds('right')) },
      { id: 'sep', type: 'separator' },
      { id: 'close', label: 'Close window', icon: 'X', danger: true, action: () => closeWindow(item.id) },
    ]);
  };

  return (
    <section
      className={`nx-window ${item.maximized ? 'maximized' : ''}`}
      data-app={active?.appId || ''}
      style={{ ...style, zIndex: item.zIndex }}
      onMouseDown={() => focusWindow(item.id)}
      onMouseDownCapture={startDrag}
      onContextMenu={windowMenu}
    >
      <div className="nx-window-content">{content}</div>
      {!item.maximized && (
        <div
          className="nx-resize-handle"
          onMouseDown={event => {
            event.stopPropagation();
            resizeStart.current = { x: event.clientX, y: event.clientY, width: item.width, height: item.height };
            setResizing(true);
          }}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {dragging && snapZone && <div aria-hidden style={snapPreviewStyle(snapZone)} />}
    </section>
  );
}
