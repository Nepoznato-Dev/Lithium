import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../DesktopApps';
import Icon from '../../Icon';
import { storage } from '../../../lib/storage';
import { childrenOf, getEntry } from '../../../lib/fileSystem';
import { glyphFor } from '../../../lib/fileExplorer/glyphs';
/* Density modes and grid math live in lib/desktop/iconGrid so Settings and the
   desktop context menu read the same numbers the desktop renders with. */
import {
  DEFAULT_ICON_MODE, cellToPos, computeGrid, iconMetrics, posToCell, resolveIconSize,
} from '../../../lib/desktop/iconGrid';

const TASKBAR_BOTTOM = 48;
const TASKBAR_SIDE = 58;
const POSITIONS_KEY = 'desktop-icon-positions';
const DESKTOP_FOLDER_ID = 'default-desktop';

function getInsetStyle(taskbarPosition) {
  const base = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };
  if (taskbarPosition === 'left') base.left = TASKBAR_SIDE;
  else if (taskbarPosition === 'right') base.right = TASKBAR_SIDE;
  else base.bottom = TASKBAR_BOTTOM;
  return base;
}

/* ── Folder-shortcut helpers ──────────────────────────────────────────
 * Shortcuts stored inside desktop folders live as JSON in the folder
 * entry's `content` field (folders don't use it for text).             */

export function readFolderShortcuts(entry) {
  try { return JSON.parse(entry?.content || '[]'); } catch { return []; }
}

export function writeFolderShortcuts(tree, folderId, shortcuts) {
  return tree.map(e =>
    e.id === folderId ? { ...e, content: JSON.stringify(shortcuts), updatedAt: Date.now() } : e
  );
}

export default function DesktopIcons({
  apps, onLaunch, onIconContextMenu, taskbarPosition = 'bottom',
  iconSizeMode = DEFAULT_ICON_MODE,
  fsTree, onOpenFolder, onDesktopFolderChange,
}) {
  const [positions, setPositions] = useState(() => storage.get(POSITIONS_KEY, {}));
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight - TASKBAR_BOTTOM }));
  const [currentFolder, setCurrentFolder] = useState(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const dragInfo = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const iconRefs = useRef(new Map());

  /* Notify the parent (index.jsx) whenever the browsed folder changes so
     the desktop-background context menu can target the right parent. */
  useEffect(() => { onDesktopFolderChange?.(currentFolder); }, [currentFolder, onDesktopFolderChange]);

  const iconSize = useMemo(
    () => resolveIconSize(iconSizeMode, viewport.w, viewport.h),
    [iconSizeMode, viewport.w, viewport.h],
  );
  const metrics = useMemo(() => iconMetrics(iconSize), [iconSize]);
  const grid = useMemo(() => computeGrid(viewport.w, viewport.h, iconSize), [viewport.w, viewport.h, iconSize]);
  const gridRef = useRef(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);

  /* ── Combined items: apps (root only) + file-system entries ── */
  const items = useMemo(() => {
    const result = [];
    if (!currentFolder) {
      for (const app of apps) {
        result.push({ kind: 'app', key: `app:${app.id}`, id: app.id, name: app.name, data: app });
      }
    }
    if (fsTree) {
      const folderId = currentFolder || DESKTOP_FOLDER_ID;
      const entries = childrenOf(fsTree, folderId);
      for (const entry of entries) {
        result.push({ kind: 'file', key: `file:${entry.id}`, id: entry.id, name: entry.name, data: entry });
      }
      if (currentFolder) {
        const folderEntry = getEntry(fsTree, currentFolder);
        const shortcuts = readFolderShortcuts(folderEntry);
        for (const sc of shortcuts) {
          const app = apps.find(a => a.id === sc.appId);
          result.push({
            kind: 'shortcut', key: `shortcut:${sc.appId}`, id: `shortcut:${sc.appId}`,
            name: app ? `${app.name}.li` : `${sc.appId}.li`,
            data: { ...sc, app },
          });
        }
      }
    }
    return result;
  }, [apps, fsTree, currentFolder]);

  /* Track the desktop area live: window resizes, and taskbar repositioning. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport({
      w: el.clientWidth || window.innerWidth,
      h: el.clientHeight || window.innerHeight,
    });
    measure();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  /* Resolve an item's grid cell. */
  const cellFor = useCallback((item, index) => {
    const p = positions[item.key];
    if (p && typeof p.col === 'number' && typeof p.row === 'number') {
      return { col: Math.min(p.col, grid.cols - 1), row: Math.min(p.row, grid.rows - 1) };
    }
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return posToCell(grid, p.x, p.y);
    return { col: index % grid.cols, row: Math.floor(index / grid.cols) };
  }, [positions, grid]);

  /* Migrate legacy {x,y} pixel positions to {col,row}. */
  useEffect(() => {
    setPositions(prev => {
      if (!Object.values(prev).some(p => p && typeof p.col !== 'number' && typeof p.x === 'number')) return prev;
      const next = {};
      for (const [id, p] of Object.entries(prev)) next[id] = typeof p.col === 'number' ? p : posToCell(grid, p.x, p.y);
      storage.set(POSITIONS_KEY, next);
      return next;
    });
  }, [grid]);

  const onIconMouseDown = (event, item) => {
    if (event.button !== 0) return;
    const cell = cellFor(item, items.indexOf(item));
    const position = cellToPos(grid, cell.col, cell.row);
    dragInfo.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    dragRef.current = item.key;
    setSelected(item.key);
  };

  useEffect(() => {
    const move = event => {
      const id = dragRef.current;
      if (!id) return;
      const { startX, startY, originX, originY } = dragInfo.current;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        dragInfo.current.moved = true;
        setDragging(id);
      }
      if (!dragInfo.current.moved) return;
      const el = containerRef.current;
      const box = gridRef.current.iconSize;
      const maxX = (el?.clientWidth || window.innerWidth) - box;
      const maxY = (el?.clientHeight || window.innerHeight) - box;
      const x = Math.max(0, Math.min(originX + deltaX, maxX));
      const y = Math.max(0, Math.min(originY + deltaY, maxY));
      const icon = iconRefs.current.get(id);
      if (icon) {
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
      }
    };
    const stop = () => {
      const id = dragRef.current;
      if (!id) return;
      dragRef.current = null;
      if (dragInfo.current.moved) {
        const icon = iconRefs.current.get(id);
        if (icon) {
          const x = parseFloat(icon.style.left) || 0;
          const y = parseFloat(icon.style.top) || 0;
          const cell = posToCell(gridRef.current, x, y);
          setPositions(prev => {
            const next = { ...prev, [id]: cell };
            storage.set(POSITIONS_KEY, next);
            return next;
          });
        }
      }
      setDragging(null);
      dragInfo.current.moved = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, []);

  /* ── Double-click handler ── */
  const handleDoubleClick = (event, item) => {
    if (item.kind === 'app') {
      onLaunch(item.data, { newWindow: event.shiftKey });
    } else if (item.kind === 'file') {
      const entry = item.data;
      if (entry.type === 'folder') {
        setCurrentFolder(entry.id);
      } else {
        onOpenFolder?.(entry);
      }
    } else if (item.kind === 'shortcut') {
      if (item.data.app) onLaunch(item.data.app, { newWindow: event.shiftKey });
    }
  };

  /* ── Build the breadcrumb path for the current folder ── */
  const breadcrumbPath = useMemo(() => {
    if (!currentFolder || !fsTree) return [];
    const path = [];
    let cur = getEntry(fsTree, currentFolder);
    while (cur && cur.id !== 'root') {
      path.unshift(cur);
      cur = cur.parentId ? getEntry(fsTree, cur.parentId) : null;
    }
    return path;
  }, [currentFolder, fsTree]);

  return (
    <div
      ref={containerRef}
      style={getInsetStyle(taskbarPosition)}
      onMouseDown={() => setSelected(null)}
      onContextMenu={event => {
        if (event.target.closest('.nx-icon')) return;
        event.preventDefault();
        event.stopPropagation();
        onIconContextMenu?.(event, { kind: '_bg_', folderId: currentFolder || DESKTOP_FOLDER_ID });
      }}
    >
      {/* Breadcrumb when navigating a folder */}
      {currentFolder && (
        <div style={{
          position: 'absolute', top: 8, left: 12, display: 'flex', alignItems: 'center', gap: 4,
          zIndex: 5, background: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: '4px 10px',
          backdropFilter: 'blur(12px)', fontSize: 12, color: 'rgba(255,255,255,0.8)',
        }}>
          <button
            onClick={() => setCurrentFolder(null)}
            style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '2px 4px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <Icon name="ChevronLeft" size={12} /> Desktop
          </button>
          {breadcrumbPath.map(entry => (
            <span key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>/</span>
              <span style={{ cursor: 'default' }}>{entry.name}</span>
            </span>
          ))}
        </div>
      )}

      {items.map((item, index) => {
        const cell = cellFor(item, index);
        const position = cellToPos(grid, cell.col, cell.row);
        let glyph, glyphColor, iconFile;
        if (item.kind === 'app') {
          glyph = item.data.icon;
          iconFile = item.data.iconFile;
          glyphColor = item.data.color;
        } else if (item.kind === 'shortcut') {
          const app = item.data.app;
          glyph = app?.icon || 'ExternalLink';
          iconFile = app?.iconFile;
          glyphColor = app?.color || '#9ca3af';
        } else {
          const g = glyphFor(item.data);
          glyph = g.name;
          glyphColor = g.color;
        }
        return (
          <button
            key={item.key}
            ref={el => { if (el) iconRefs.current.set(item.key, el); else iconRefs.current.delete(item.key); }}
            className={`nx-icon ${selected === item.key ? 'selected' : ''} ${dragging === item.key ? 'dragging' : ''}`}
            style={{ left: position.x, top: position.y, width: iconSize, height: iconSize, padding: metrics.pad, gap: metrics.gap, borderRadius: metrics.radius, '--nx-icon-font': `${metrics.font}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }}
            onMouseDown={event => { event.stopPropagation(); onIconMouseDown(event, item); }}
            onContextMenu={event => {
              event.stopPropagation();
              onIconContextMenu?.(event, item, () => {
                setPositions(prev => {
                  const next = { ...prev };
                  delete next[item.key];
                  storage.set(POSITIONS_KEY, next);
                  return next;
                });
              });
            }}
            onDoubleClick={event => handleDoubleClick(event, item)}
            title={item.kind === 'app'
              ? `${item.name} (double-click to open, Shift+double-click for a new window)`
              : item.name}
          >
            <AppIcon icon={glyph} iconFile={iconFile} color={glyphColor} size={metrics.glyph} box={metrics.glyphBox} />
            <span className="nx-icon-label">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}
