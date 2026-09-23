import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ON_SCREEN = 90; /* keep at least this many px of the window grabbable */
const MIN_WIDTH = 360; /* below this the app toolbars start colliding */
const MIN_HEIGHT = 240;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/** Loading fallback shared by both presentations. */
function TabFallback() {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
      Loading…
    </div>
  );
}

/**
 * Host for one running window. Every open window stays mounted (so its app keeps
 * its state) — only the presentation differs per shell mode:
 *
 *  • phone (iOS): full-screen, `.active` decides what is on screen, "minimize"
 *    means going home and the maximize button is hidden by CSS.
 *  • desktop-wide (macOS): a real floating window with a titled traffic-light
 *    bar, draggable by that bar, with genuine minimize / zoom, layered by
 *    `zIndex` so several apps are visible at once like a desktop.
 *
 * Apps receive `windowed: true` either way because the phone shell supplies no
 * titlebar; each app draws its own controls (WinControls), which the macOS bar
 * replaces.
 */
export default function MobileAppFrame({
  win, active, onHome, onClose,
  mac = false, zIndex = 10, view = null, onMinimize, onToggleZoom, onFocus, onMove,
}) {
  /* Memoized so the tab/content memos below keep their identity across renders. */
  const tabs = useMemo(() => win.tabs || [], [win.tabs]);
  const activeTab = useMemo(
    () => tabs.find(tab => tab.key === win.activeTab) || tabs[0],
    [tabs, win.activeTab],
  );

  const appProps = useMemo(() => ({
    windowed: true,
    isMaximized: mac ? !!win.maximized : true,
    minimizeSelf: mac ? () => onMinimize(win.id) : onHome,
    maximizeSelf: mac ? () => onToggleZoom(win.id) : () => {},
    closeSelf: () => onClose(win.id),
  }), [win.id, mac, win.maximized, onHome, onMinimize, onToggleZoom, onClose]);

  const content = useMemo(() => tabs.map(tab => (
    <div
      key={tab.key}
      style={{ height: '100%', minHeight: 0, display: tab.key === win.activeTab ? undefined : 'none' }}
    >
      <React.Suspense fallback={<TabFallback />}>
        {React.isValidElement(tab.component)
          ? React.cloneElement(tab.component, { ...appProps, isWindowActive: active && tab.key === win.activeTab })
          : tab.component}
      </React.Suspense>
    </div>
  )), [tabs, win.activeTab, active, appProps]);

  /* ── macOS window geometry ─────────────────────────────────────────── */
  const style = useMemo(() => {
    if (!mac) return undefined;
    if (win.maximized) return { left: 0, top: 0, width: '100%', height: '100%', zIndex };
    const vw = view?.w || window.innerWidth;
    const vh = view?.h || window.innerHeight;
    /* Restore-then-launch on a bigger monitor can leave stale placements, so
       clamp the window back into the current box. The bottom may still tuck
       under the Dock, like on macOS — only the title bar must stay grabbable. */
    const width = clamp(win.width || 900, MIN_WIDTH, vw - 24);
    const height = clamp(win.height || 640, MIN_HEIGHT, vh - 12);
    const left = clamp(win.x ?? 60, 0, vw - width);
    const top = clamp(win.y ?? 40, 0, vh - ON_SCREEN);
    return { left, top, width, height, zIndex };
  }, [mac, win.maximized, win.x, win.y, win.width, win.height, view, zIndex]);

  /* Move and resize without re-rendering: the frame is updated by writing `style`
     straight onto the element per animation frame and committed once on release,
     exactly like the desktop window manager. */
  const frameRef = useRef(null);
  const gestureRef = useRef(null);
  const [gesture, setGesture] = useState(null); // 'move' | 'resize'

  const beginGesture = useCallback((mode, event) => {
    if (!mac || win.maximized || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // Never steal the gesture from a control living in the title bar.
    if (mode === 'move' && event.target.closest('button, input, select, textarea, label, [role="button"], [contenteditable="true"]')) return;
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const holder = (el.offsetParent || document.body).getBoundingClientRect();
    const left = rect.left - holder.left;
    const top = rect.top - holder.top;
    gestureRef.current = {
      mode,
      left,
      top,
      width: rect.width,
      height: rect.height,
      startW: rect.width,
      startH: rect.height,
      px: event.clientX,
      py: event.clientY,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      /* Keep at least ON_SCREEN px of the frame reachable, and never let a
         resize push the window out of the box between menu bar and Dock. */
      maxX: holder.width - ON_SCREEN,
      maxY: holder.height - ON_SCREEN,
      maxW: holder.width - left,
      maxH: holder.height - top,
      moved: false,
    };
    setGesture(mode);
    event.preventDefault();
  }, [mac, win.maximized]);

  const startDrag = useCallback(event => beginGesture('move', event), [beginGesture]);
  const startResize = useCallback(event => beginGesture('resize', event), [beginGesture]);

  useEffect(() => {
    if (!gesture) return undefined;
    let raf = null;
    const paint = () => {
      raf = null;
      const el = frameRef.current;
      const g = gestureRef.current;
      if (!el || !g) return;
      if (g.mode === 'move') {
        el.style.left = `${g.left}px`;
        el.style.top = `${g.top}px`;
      } else {
        el.style.width = `${g.width}px`;
        el.style.height = `${g.height}px`;
      }
    };
    const move = event => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.mode === 'move') {
        g.left = clamp(event.clientX - g.dx, 0, g.maxX);
        g.top = clamp(event.clientY - g.dy, 0, g.maxY);
      } else {
        g.width = clamp(g.startW + event.clientX - g.px, MIN_WIDTH, g.maxW);
        g.height = clamp(g.startH + event.clientY - g.py, MIN_HEIGHT, g.maxH);
      }
      g.moved = true;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      const g = gestureRef.current;
      gestureRef.current = null;
      setGesture(null);
      if (!g?.moved) return;
      onMove?.(win.id, g.mode === 'move'
        ? { x: Math.round(g.left), y: Math.round(g.top) }
        : { width: Math.round(g.width), height: Math.round(g.height) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [gesture, win.id, onMove]);

  if (mac) {
    return (
      <section
        ref={frameRef}
        className={`mx-win${active ? ' active' : ''}${win.minimized ? ' minimized' : ''}${win.maximized ? ' maximized' : ''}${gesture === 'move' ? ' dragging' : ''}${gesture === 'resize' ? ' resizing' : ''}`}
        style={style}
        data-app={activeTab?.appId || ''}
        onPointerDown={() => onFocus?.(win.id)}
      >
        <div className="mx-win-bar" onPointerDown={startDrag}>
          <span className="mx-win-lights">
            <button type="button" className="mx-light close" title="Close" aria-label="Close" onClick={() => onClose(win.id)} />
            <button type="button" className="mx-light min" title="Minimize" aria-label="Minimize" onClick={() => onMinimize(win.id)} />
            <button type="button" className="mx-light zoom" title={win.maximized ? 'Restore' : 'Zoom'} aria-label="Zoom" onClick={() => onToggleZoom(win.id)} />
          </span>
          <span className="mx-win-title">
            {activeTab?.icon}
            <span className="mx-win-name">{activeTab?.title || win.title || 'Lithium'}</span>
          </span>
        </div>
        <div className="mx-win-body">{content}</div>
        {/* Invisible corner grabber — macOS gives windows no visible resize chrome. */}
        <span className="mx-win-resize" aria-hidden="true" onPointerDown={startResize} />
      </section>
    );
  }

  return (
    <section className={`mx-frame${active ? ' active' : ''}`} data-app={(activeTab && activeTab.appId) || ''}>
      <div className="mx-frame-content">{content}</div>
    </section>
  );
}
