import React, { useCallback, useEffect, useRef, useState } from 'react';
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

function SubFlyout({ items, anchorRect, onAction, ctx }) {
  const ref = React.useRef(null);
  const [pos, setPos] = useState(() => {
    const width = 224;
    const flip = anchorRect.right + width + 8 > window.innerWidth;
    return { x: flip ? Math.max(6, anchorRect.left - width - 4) : anchorRect.right + 4, y: anchorRect.top - 4 };
  });

  // Fine-clamp once the real size is known.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos(prev => clampPosition(prev.x, prev.y, rect.width, rect.height));
  }, []);

  // Portal to body: a parent with backdrop-filter/transform would otherwise
  // become the containing block and offset position:fixed.
  return createPortal(
    <div ref={ref} className="nx-ctx-menu" role="menu" aria-label="Submenu" style={{ position: 'fixed', left: pos.x, top: pos.y, animation: 'none' }}>
      <MenuList items={items} onAction={onAction} ctx={ctx} />
    </div>,
    document.body
  );
}

function MenuList({ items, onAction, focusIndex = 0, onFocusIndex, typeAhead, ctx }) {
  const [openSub, setOpenSub] = useState(null); // { id, rect }
  const [lazyItems, setLazyItems] = useState(null); // resolved lazy submenu items
  const listRef = useRef(null);

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
    <div ref={listRef} className="nx-ctx-list" role="menu" onMouseLeave={() => { setOpenSub(null); setLazyItems(null); if (onFocusIndex) onFocusIndex(-1); }}>
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
                setOpenSub({ id: item.id, rect: event.currentTarget.getBoundingClientRect() });
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
              if (!hasSub && item.action) item.action();
              if (!hasSub) onAction();
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
        return <SubFlyout key={openSub.id} items={subItems} anchorRect={openSub.rect} onAction={onAction} ctx={ctx} />;
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

  // Store the element that was focused when the menu opened, for restoration.
  // menu.source captures what the user was focused on when the menu opened.
  useEffect(() => {
    triggerRef.current = menu.source?.target || document.activeElement;
    return () => {
      // Restore focus when the menu unmounts.
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, []);

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
      <div ref={ref} className="nx-ctx-menu" role="menu" aria-label="Context menu" style={{ left: pos.x, top: pos.y }} onMouseDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
        <MenuList items={menu.items} onAction={handleAction} focusIndex={focusIndex} onFocusIndex={setFocusIndex} ctx={menu._ctx} />
      </div>
    </>,
    document.body
  );
}

/** Hook helper: returns [menu, openMenu, closeMenu].
 *  The menu state includes `source` — the appId (from the nearest .nx-window)
 *  and `target` (the DOM element the user right-clicked on). */
export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const open = (event, items, ctx) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget || event.target;
    const windowEl = target.closest?.('.nx-window');
    const appId = windowEl?.getAttribute('data-app') || null;
    setMenu({
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
