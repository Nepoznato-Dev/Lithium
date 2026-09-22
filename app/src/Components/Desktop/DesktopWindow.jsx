import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from './DesktopApps';
import { useDesktopActions } from './DesktopWindowManager';
import ContextMenu, { useContextMenu } from './ContextMenu';
import { detectSnapZone, snapBounds, snapPreviewStyle } from '../../lib/desktop/ui';
import { storage } from '../../lib/storage';

/**
 * Window manager:
 *  - No titlebar — each app renders its own inline WinControls.
 *  - Multi-tab windows use the right-click context menu for tab switching.
 * Dragging works on any non-interactive pixel of the top zone.
 *
 * Drag and resize never touch window state while the pointer is down: the
 * frame is moved by writing `style` straight on the element per animation
 * frame, and the final geometry is committed once on mouseup.  Routing it
 * through `updateWindow` instead rebuilt the window array 60×/s, which
 * re-rendered the whole desktop shell plus the dragged app's own subtree.
 */
export default React.memo(function DesktopWindow({ item, apps = [] }) {
  // Actions only: this component renders `item`, never the window list.
  const { updateWindow, focusWindow, closeWindow, addTab, closeTab, setActiveTab } = useDesktopActions();
  const [menu, openMenu, closeMenu] = useContextMenu();
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [snapZone, setSnapZone] = useState(null);
  const [animClass, setAnimClass] = useState('');
  const frameRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragPos = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const snapZoneRef = useRef(null);
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const resizeSize = useRef(null);
  const prevMinimized = useRef(item.minimized);
  const closingRef = useRef(false);

  /* Publish a snap preview only when the zone actually changes — calling
   * setState on every mousemove defeated the rAF throttling entirely. */
  const publishSnapZone = useCallback(zone => {
    if (snapZoneRef.current === zone) return;
    snapZoneRef.current = zone;
    setSnapZone(zone);
  }, []);

  // Animate minimize/restore transitions
  useEffect(() => {
    if (item.minimized && !prevMinimized.current) {
      setAnimClass('minimizing');
      const t = setTimeout(() => setAnimClass(''), 220);
      prevMinimized.current = true;
      return () => clearTimeout(t);
    }
    if (!item.minimized && prevMinimized.current) {
      setAnimClass('restoring');
      const t = setTimeout(() => setAnimClass(''), 250);
      prevMinimized.current = false;
      return () => clearTimeout(t);
    }
    prevMinimized.current = item.minimized;
  }, [item.minimized]);

  // Animated close: play exit animation then actually close
  const animatedClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setAnimClass('closing');
    setTimeout(() => closeWindow(item.id), 200);
  }, [closeWindow, item.id]);

  const tabs = useMemo(() => item.tabs || [], [item.tabs]);
  const active = tabs.find(tab => tab.key === item.activeTab) || tabs[0];

  useEffect(() => {
    if (!dragging) return undefined;
    const snapAssist = storage.get('settings', {})?.window?.snapAssist;
    const start = { x: item.x, y: item.y };
    let rafId = null;
    const paint = () => {
      rafId = null;
      const el = frameRef.current;
      const pos = dragPos.current;
      if (!el || !pos) return;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      if (snapAssist) publishSnapZone(detectSnapZone(pointer.current.x, pointer.current.y));
    };
    const move = event => {
      pointer.current = { x: event.clientX, y: event.clientY };
      dragPos.current = {
        x: Math.max(0, Math.min(event.clientX - dragOffset.current.x, window.innerWidth - 100)),
        y: Math.max(0, Math.min(event.clientY - dragOffset.current.y, window.innerHeight - 100)),
      };
      if (!rafId) rafId = requestAnimationFrame(paint);
    };
    const stop = event => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const zone = snapAssist ? detectSnapZone(event.clientX, event.clientY) : null;
      publishSnapZone(null);
      setDragging(false);
      // Single commit for the whole gesture.
      if (zone === 'maximize') updateWindow(item.id, { maximized: true });
      else if (zone) updateWindow(item.id, snapBounds(zone));
      else if (dragPos.current && (dragPos.current.x !== start.x || dragPos.current.y !== start.y)) {
        updateWindow(item.id, dragPos.current);
      }
      dragPos.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); if (rafId) cancelAnimationFrame(rafId); };
  }, [dragging, item.id, item.x, item.y, updateWindow, publishSnapZone]);

  useEffect(() => {
    if (!resizing) return undefined;
    let rafId = null;
    const paint = () => {
      rafId = null;
      const el = frameRef.current;
      const size = resizeSize.current;
      if (!el || !size) return;
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
    };
    const move = event => {
      resizeSize.current = {
        width: Math.max(320, resizeStart.current.width + (event.clientX - resizeStart.current.x)),
        height: Math.max(220, resizeStart.current.height + (event.clientY - resizeStart.current.y)),
      };
      if (!rafId) rafId = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setResizing(false);
      const size = resizeSize.current;
      resizeSize.current = null;
      if (size) updateWindow(item.id, size);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); if (rafId) cancelAnimationFrame(rafId); };
  }, [resizing, item.id, updateWindow]);

  /* The element and the props injected into it are memoized: re-running
   * `cloneElement` with fresh closures on every render re-rendered the entire
   * app subtree whenever anything in the chrome changed. */
  const appProps = useMemo(() => ({
    windowed: true,
    minimizeSelf: () => updateWindow(item.id, { minimized: true }),
    maximizeSelf: () => updateWindow(item.id, { maximized: !item.maximized }),
    isMaximized: item.maximized,
  }), [item.id, item.maximized, updateWindow]);

  // Render only the active tab — unmounting inactive tabs frees their
  // component state, DOM nodes, and subscriptions.  When a tab becomes
  // active again it mounts fresh (lazy components still load instantly
  // from the module cache).
  const content = useMemo(() => {
    const tab = tabs.find(t => t.key === item.activeTab) || tabs[0];
    if (!tab) return null;
    return (
      <div key={tab.key} className="h-full min-h-0">
        <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center text-xs text-white/30">Loading…</div>}>
          {React.isValidElement(tab.component) ? React.cloneElement(tab.component, {
            ...appProps,
            isWindowActive: !item.minimized,
            closeSelf: () => tabs.length > 1 ? closeTab(item.id, tab.key) : animatedClose(),
          }) : tab.component}
        </React.Suspense>
      </div>
    );
  }, [tabs, item.activeTab, item.minimized, item.id, appProps, closeTab, animatedClose]);

  const style = item.maximized
    ? {
      left: 'var(--tb-left, 0px)',
      top: 0,
      width: 'calc(100% - var(--tb-left, 0px) - var(--tb-right, 0px))',
      height: 'calc(100% - var(--tb-bottom, 48px))',
    }
    : { left: item.x, top: item.y, width: item.width, height: item.height };

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
            if (firstApp) addTab(item.id, { appId: firstApp.id, title: firstApp.name, icon: <AppIcon icon={firstApp.icon} iconFile={firstApp.iconFile} color={firstApp.color} size={14} />, component: firstApp.component });
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
      { id: 'snap-tl', label: 'Snap to top-left', icon: 'ArrowUpLeft', action: () => updateWindow(item.id, { ...snapBounds('quarter-top-left'), maximized: false }) },
      { id: 'snap-tr', label: 'Snap to top-right', icon: 'ArrowUpRight', action: () => updateWindow(item.id, { ...snapBounds('quarter-top-right'), maximized: false }) },
      { id: 'snap-bl', label: 'Snap to bottom-left', icon: 'ArrowDownLeft', action: () => updateWindow(item.id, { ...snapBounds('quarter-bottom-left'), maximized: false }) },
      { id: 'snap-br', label: 'Snap to bottom-right', icon: 'ArrowDownRight', action: () => updateWindow(item.id, { ...snapBounds('quarter-bottom-right'), maximized: false }) },
      { id: 'sep', type: 'separator' },
      { id: 'close', label: 'Close window', icon: 'X', danger: true, action: animatedClose },
    ]);
  };

  return (
    <section
      ref={frameRef}
      className={`nx-window ${item.maximized ? 'maximized' : ''} ${animClass}`}
      data-app={active?.appId || ''}
      style={{ ...style, zIndex: item.zIndex, display: item.minimized ? 'none' : undefined }}
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
});
