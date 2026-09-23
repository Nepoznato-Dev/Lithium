import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { PngIcon } from './DesktopApps';
import { ActionRegistry } from '../../lib/fileExplorer/contextMenu/ActionRegistry';

/**
 * Dynamic context menu — rendered where the user right-clicked, with
 * flyout submenus, separators, icons, shortcuts, disabled states,
 * keyboard navigation (arrows + Enter + Escape), and type-ahead jump.
 *
 * Supports ARIA roles for screen readers, lazy submenu resolution via
 * ActionRegistry, and loading states for async actions.
 *
 * Item shape: { id, label, icon?: string, shortcut?: string, checked?: bool,
 *               disabled?: bool, danger?: bool, loading?: bool,
 *               type?: 'separator'|'heading',
 *               items?: [...], _actionId?: string, action?: fn }
 */

/** Live-region announcer for screen readers. */
function announce(message) {
  let region = document.getElementById('nx-ctx-live');
  if (!region) {
    region = document.createElement('div');
    region.id = 'nx-ctx-live';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
    document.body.appendChild(region);
  }
  region.textContent = '';
  // Force re-announcement by clearing then setting in next frame.
  requestAnimationFrame(() => { region.textContent = message; });
}

function clampPosition(x, y, width, height) {
  return {
    x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
    y: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
  };
}

/** Flip above the cursor when the menu would overflow the bottom edge. */
function smartPosition(rawX, rawY, width, height) {
  let x = rawX;
  let y = rawY;
  // Flip below → above if overflowing bottom
  if (y + height > window.innerHeight - 6) {
    y = rawY - height; // rawY is the click point; menu was anchored there
    if (y < 6) y = 6;
  }
  return clampPosition(x, y, width, height);
}

/** Return only actionable indices for keyboard nav. */
function actionableIndices(items) {
  const indices = [];
  items.forEach((item, i) => {
    if (item.type !== 'separator' && item.type !== 'heading' && !item.disabled) indices.push(i);
  });
  return indices;
}

/**
 * How long a submenu branch stays open after the pointer leaves the list that
 * owns it. Flyouts render through a portal, so they are *not* DOM descendants
 * of their parent list — and Preact binds `onMouseLeave` natively, so the
 * parent list reports a leave the moment the pointer enters the gap between a
 * menu and its flyout. Closing there made every submenu vanish before it could
 * be clicked (React hid this behind its synthesized enter/leave events).
 */
const SUBMENU_GRACE_MS = 260;

/** A menu box still counts as hovered this many pixels past its edge, so a slow
 *  diagonal approach across the gap does not collapse the branch. */
const HOVER_SLACK = 10;

/**
 * Hover bookkeeping shared by one open menu and every flyout portalled under
 * it. A single pending close is enough: the pointer walks the menu stack, so
 * the most recent `mouseleave` is always the branch being abandoned.
 */
function createMenuSession() {
  /** @type {Set<HTMLElement>} every rendered menu box of this tree */
  const surfaces = new Set();
  const point = { x: -1, y: -1 };
  let timer = 0;

  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = 0; }
  };

  const hovering = () => {
    if (point.x < 0) return false;
    for (const node of surfaces) {
      if (!node.isConnected) { surfaces.delete(node); continue; }
      const r = node.getBoundingClientRect();
      if (point.x >= r.left - HOVER_SLACK && point.x <= r.right + HOVER_SLACK
        && point.y >= r.top - HOVER_SLACK && point.y <= r.bottom + HOVER_SLACK) return true;
    }
    return false;
  };

  return {
    /** Track a menu box while it is mounted; returns an unregister callback. */
    surface(node) {
      if (!node) return null;
      surfaces.add(node);
      return () => surfaces.delete(node);
    },
    track(x, y) { point.x = x; point.y = y; },
    /** The pointer left the window: nothing counts as hovered any more. */
    drop() { point.x = -1; point.y = -1; },
    cancel,
    /** Defer `close`, and keep deferring while the pointer rests on the menu. */
    schedule(close) {
      cancel();
      const tick = () => {
        timer = 0;
        if (hovering()) { timer = setTimeout(tick, SUBMENU_GRACE_MS); return; }
        close();
      };
      timer = setTimeout(tick, SUBMENU_GRACE_MS);
    },
  };
}

/** Place a flyout beside its anchor row — flipping to the left of the row near
 *  the right edge, and clamped inside the viewport. */
function flyoutPosition(anchorRect, width, height) {
  const gap = 4;
  const flip = anchorRect.right + gap + width > window.innerWidth - 6;
  const x = flip ? anchorRect.left - gap - width : anchorRect.right + gap;
  return clampPosition(x, anchorRect.top - 5, width, height);
}

function SubFlyout({ items, anchor, onAction, onDeactivate, ctx, session }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(() => {
    const rect = anchor?.getBoundingClientRect?.();
    // Height 0: the real box is unknown yet, so only clamp what is known.
    return rect ? flyoutPosition(rect, 224, 0) : { x: 0, y: 0 };
  });

  /**
   * Re-measure from the live anchor row instead of trusting a snapshot: the
   * root menu repositions itself after its first paint, and long lists scroll,
   * either of which walks a one-shot rect away from the row it belongs to.
   */
  const place = useCallback(() => {
    const node = ref.current;
    if (!node || !anchor?.isConnected) return;
    const box = node.getBoundingClientRect();
    const next = flyoutPosition(anchor.getBoundingClientRect(), box.width, box.height);
    setPos(prev => (prev.x === next.x && prev.y === next.y ? prev : next));
  }, [anchor]);

  useLayoutEffect(place);

  // Capture-phase, because the scrolling element is usually an ancestor list:
  // the flyout has to travel with its row rather than stay where it opened.
  useEffect(() => {
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [place]);

  useEffect(() => {
    const off = session.surface(ref.current);
    return () => { if (off) off(); };
  }, [session]);

  // Portal to body: a parent with backdrop-filter/transform would otherwise
  // become the containing block and offset position:fixed.
  // `max-content` keeps the box off shrink-to-fit: a fixed element sized by its
  // available space would change width when it moves, which feeds back into the
  // flip decision the placement is derived from.
  return createPortal(
    <div
      ref={ref}
      className="nx-ctx-menu"
      role="menu"
      aria-label="Submenu"
      style={{ position: 'fixed', left: pos.x, top: pos.y, width: 'max-content', animation: 'none' }}
      onMouseEnter={() => session.cancel()}
      onMouseLeave={() => session.schedule(onDeactivate)}
      onMouseDown={event => event.stopPropagation()}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    >
      <MenuList items={items} onAction={onAction} ctx={ctx} session={session} />
    </div>,
    document.body
  );
}

function MenuList({ items, onAction, focusIndex = 0, onFocusIndex, typeAhead: _typeAhead, ctx, session }) {
  const [openSub, setOpenSub] = useState(null); // { id, el }
  const [lazyItems, setLazyItems] = useState(null); // resolved lazy submenu items
  const listRef = useRef(null);
  const openSubRef = useRef(null);
  openSubRef.current = openSub;

  const closeSub = useCallback(() => {
    setOpenSub(null);
    setLazyItems(null);
    if (onFocusIndex) onFocusIndex(-1);
  }, [onFocusIndex]);

  /** Show (or re-anchor) the branch owned by `item`. */
  const openSubFor = useCallback((item, row) => {
    session.cancel();
    setOpenSub({ id: item.id, el: row });
  }, [session]);

  // Scroll the focused item into view when focusIndex changes.
  useEffect(() => {
    if (!listRef.current || onFocusIndex === undefined) return;
    const buttons = listRef.current.querySelectorAll('.nx-ctx-item');
    const target = buttons[focusIndex];
    if (target) target.scrollIntoView({ block: 'nearest' });
  }, [focusIndex, onFocusIndex]);

  /** Resolve a lazy submenu (items === null + _actionId present). */
  const resolveLazySubmenu = useCallback((item) => {
    if (!item._actionId) return;
    // Use ActionRegistry to resolve children lazily.
    const resolved = ActionRegistry.resolveChildren(item._actionId, ctx?.selectedEntries || [], ctx || {});
    setLazyItems(resolved);
    // Patch the item's items array in-place for this render cycle.
    item.items = resolved;
  }, [ctx]);

  return (
    <div
      ref={listRef}
      className="nx-ctx-list"
      role="menu"
      onMouseEnter={() => session.cancel()}
      onMouseLeave={() => { if (openSubRef.current) session.schedule(closeSub); }}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') return <div key={item.id || `sep-${index}`} className="nx-menu-sep" role="separator" />;
        if (item.type === 'heading') {
          return <div key={item.id || `head-${index}`} className="nx-ctx-heading" role="presentation">{item.label}</div>;
        }
        const iconName = item.loading ? 'Loader' : item.icon;
        const hasSub = (Array.isArray(item.items) && item.items.length > 0) || (item.items === null && item._actionId);
        const isFocused = focusIndex === index;
        return (
          <button
            key={item.id || item.label}
            className={`nx-ctx-item ${item.danger ? 'danger' : ''} ${item.disabled || item.loading ? 'disabled' : ''} ${isFocused ? 'focused' : ''} ${item.loading ? 'loading' : ''}`}
            disabled={item.disabled || item.loading}
            role="menuitem"
            aria-disabled={item.disabled || item.loading || undefined}
            aria-haspopup={hasSub ? 'true' : undefined}
            aria-expanded={hasSub && openSub?.id === item.id ? 'true' : undefined}
            aria-checked={item.checked !== undefined ? (item.checked ? 'true' : 'false') : undefined}
            data-menu-index={index}
            onMouseEnter={event => {
              if (hasSub) {
                // Resolve lazy submenus on hover.
                if (item.items === null && item._actionId) {
                  resolveLazySubmenu(item);
                }
                openSubFor(item, event.currentTarget);
              } else {
                setOpenSub(null);
              }
              if (onFocusIndex) onFocusIndex(index);
              // Announce for screen readers.
              announce(item.label);
            }}
            onClick={event => {
              event.stopPropagation();
              if (item.disabled || item.loading) return;
              // A row that owns a branch opens it and keeps the menu alive —
              // dismissing here is what made the options beside it unclickable.
              if (hasSub) {
                openSubFor(item, event.currentTarget);
                return;
              }
              if (item.action) item.action();
              onAction();
            }}
          >
            <span className="nx-ctx-item-left">
              {item.iconFile
                ? <span className={`nx-ctx-icon ${item.loading ? 'nx-ctx-spin' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PngIcon name={item.iconFile} size={14} /></span>
                : iconName ? <Icon name={iconName} size={14} className={`nx-ctx-icon ${item.loading ? 'nx-ctx-spin' : ''}`} /> : <span className="nx-ctx-icon" />
              }
              <span className="truncate">{item.label}</span>
              {item.checked && <span className="nx-ctx-check">✓</span>}
            </span>
            <span className="nx-ctx-item-right">
              {item.shortcut && <span className="nx-ctx-shortcut">{item.shortcut}</span>}
              {hasSub && <span className="nx-ctx-arrow">›</span>}
            </span>
          </button>
        );
      })}
      {/* Flyout rendered by the parent so it escapes overflow clipping */}
      {openSub && (() => {
        const item = items.find(entry => entry.id === openSub.id);
        if (!item) return null;
        // For lazy items, use the resolved array.
        const subItems = item.items || lazyItems;
        if (!subItems || subItems.length === 0) return null;
        return (
          <SubFlyout
            key={openSub.id}
            items={subItems}
            anchor={openSub.el}
            onAction={onAction}
            onDeactivate={closeSub}
            ctx={ctx}
            session={session}
          />
        );
      })()}
    </div>
  );
}

export default function ContextMenu({ menu, onClose }) {
  const ref = React.useRef(null);
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [focusIndex, setFocusIndex] = useState(-1);
  const typeAheadRef = useRef('');
  const typeAheadTimer = useRef(null);
  // One hover session per open menu: every flyout of this branch shares it, so
  // travel between two portalled boxes counts as staying on the menu.
  const sessionRef = useRef(null);
  if (!sessionRef.current) sessionRef.current = createMenuSession();
  const session = sessionRef.current;

  // Store the element that was focused when the menu opened, for restoration.
  // menu.source captures what the user was focused on when the menu opened.
  /* eslint-disable react-hooks/exhaustive-deps -- only run on mount */
  useEffect(() => {
    triggerRef.current = menu.source?.target || document.activeElement;
    return () => {
      // Restore focus when the menu unmounts.
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  /**
   * Follow the pointer for as long as the menu is open. The menu boxes cannot
   * answer "is the cursor still mine?" by themselves — while the pointer sits in
   * the gap between a menu and its flyout it is inside neither, and that is
   * exactly where a naive mouseleave used to destroy the submenu.
   */
  useEffect(() => {
    const offSurface = session.surface(ref.current);
    const onMove = event => session.track(event.clientX, event.clientY);
    // relatedTarget is null only when the pointer exits the window; without
    // this a flyout would keep believing the cursor still rests on it.
    const onOut = event => { if (!event.relatedTarget) session.drop(); };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerout', onOut, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerout', onOut, true);
      if (offSurface) offSurface();
      session.cancel();
    };
  }, [session]);

  // A second right-click reuses this instance: forget whatever the previous
  // branch still had open and start from the new click point.
  useEffect(() => {
    session.cancel();
    session.track(menu.x, menu.y);
  }, [session, menu]);

  // Smart-clamp once we know the real rendered size.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos(smartPosition(menu.x, menu.y, rect.width, rect.height));
  }, [menu]);

  // Focus the first actionable item after initial render.
  useEffect(() => {
    if (!ref.current || focusIndex !== -1) return;
    const actionable = actionableIndices(menu.items);
    if (actionable.length > 0) setFocusIndex(actionable[0]);
  }, [menu.items, focusIndex]);

  // Keyboard handling: arrows, enter, escape, type-ahead.
  useEffect(() => {
    const actionable = actionableIndices(menu.items);
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose('escape');
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusIndex(prev => {
          const currentPos = actionable.indexOf(prev);
          let next;
          if (event.key === 'ArrowDown') {
            next = currentPos < actionable.length - 1 ? currentPos + 1 : 0;
          } else {
            next = currentPos > 0 ? currentPos - 1 : actionable.length - 1;
          }
          return actionable[next];
        });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (focusIndex >= 0 && menu.items[focusIndex]) {
          const item = menu.items[focusIndex];
          const hasSub = Array.isArray(item.items) && item.items.length > 0;
          if (!item.disabled && !hasSub && item.action) item.action();
          if (!hasSub) onClose('action');
        }
        return;
      }
      // Type-ahead: single printable character.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const ch = event.key.toLowerCase();
        clearTimeout(typeAheadTimer.current);
        typeAheadRef.current += ch;
        const prefix = typeAheadRef.current;
        // Find the first item whose label starts with the accumulated prefix.
        const match = actionable.find(idx => {
          const label = (menu.items[idx]?.label || '').toLowerCase();
          return label.startsWith(prefix);
        });
        if (match !== undefined) setFocusIndex(match);
        typeAheadTimer.current = setTimeout(() => { typeAheadRef.current = ''; }, 600);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu.items, focusIndex, onClose]);

  const handleBackdropClick = useCallback(() => {
    onClose('click-outside');
  }, [onClose]);

  const handleAction = useCallback(() => {
    onClose('action');
  }, [onClose]);

  // Announce menu open for screen readers.
  useEffect(() => {
    announce('Context menu opened');
    return () => announce('Context menu closed');
  }, []);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10015]" onClick={handleBackdropClick} onContextMenu={event => { event.preventDefault(); handleBackdropClick(); }} />
      <div
        ref={ref}
        className="nx-ctx-menu"
        role="menu"
        aria-label="Context menu"
        style={{ left: pos.x, top: pos.y }}
        onMouseEnter={() => session.cancel()}
        onMouseDown={event => event.stopPropagation()}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      >
        <MenuList key={menu.id} items={menu.items} onAction={handleAction} focusIndex={focusIndex} onFocusIndex={setFocusIndex} ctx={menu._ctx} session={session} />
      </div>
    </>,
    document.body
  );
}

/** Hook helper: returns [menu, openMenu, closeMenu].
 *  The menu state includes `source` — the appId (from the nearest .nx-window)
 *  and `target` (the DOM element the user right-clicked on). */
let openSeq = 0;

export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const open = (event, items, ctx) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget || event.target;
    const windowEl = target.closest?.('.nx-window');
    const appId = windowEl?.getAttribute('data-app') || null;
    setMenu({
      // Identity for the menu list: lets a reused instance drop the branch the
      // previous menu still had open instead of inheriting it.
      id: ++openSeq,
      x: event.clientX,
      y: event.clientY,
      items,
      source: { appId, target },
      _ctx: ctx || null, // pass ActionContext through for lazy submenu resolution
    });
  };
  const close = useCallback(() => setMenu(null), []);
  return [menu, open, close];
}
