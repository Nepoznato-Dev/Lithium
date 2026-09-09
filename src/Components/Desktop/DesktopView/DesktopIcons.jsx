import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { AppIcon } from '../DesktopApps';
import { storage } from '../../../lib/storage';

const ICON_SIZE = 100;
const GRID_SPACING = 10;
const GRID_SIZE = ICON_SIZE + GRID_SPACING;

export default function DesktopIcons({ apps, onLaunch, onIconContextMenu }) {
  const [positions, setPositions] = useState(() => storage.get('desktop-icon-positions', {}));
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const dragInfo = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const iconRefs = useRef(new Map());

  const defaultPosition = useCallback(index => {
    const cols = Math.max(1, Math.floor((window.innerWidth - 40) / GRID_SIZE));
    return {
      x: 10 + (index % cols) * GRID_SIZE,
      y: 10 + Math.floor(index / cols) * GRID_SIZE,
    };
  }, []);

  const snap = (x, y) => ({
    x: Math.round((x - 10) / GRID_SIZE) * GRID_SIZE + 10,
    y: Math.round((y - 10) / GRID_SIZE) * GRID_SIZE + 10,
  });

  const onIconMouseDown = (event, app) => {
    if (event.button !== 0) return;
    const position = positions[app.id] || defaultPosition(apps.indexOf(app));
    dragInfo.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    dragRef.current = app.id;
    setSelected(app.id);
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
        if (!dragging) setDragging(id);
      }
      if (!dragInfo.current.moved) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      const maxX = (bounds?.width || window.innerWidth) - ICON_SIZE;
      const maxY = (bounds?.height || window.innerHeight) - ICON_SIZE - 48;
      const x = Math.max(0, Math.min(originX + deltaX, maxX));
      const y = Math.max(0, Math.min(originY + deltaY, maxY));
      const el = iconRefs.current.get(id);
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    };
    const stop = () => {
      const id = dragRef.current;
      if (!id) return;
      dragRef.current = null;
      if (dragInfo.current.moved) {
        const el = iconRefs.current.get(id);
        if (el) {
          const x = parseFloat(el.style.left) || 0;
          const y = parseFloat(el.style.top) || 0;
          const snapped = snap(x, y);
          setPositions(prev => {
            const next = { ...prev, [id]: snapped };
            storage.set('desktop-icon-positions', next);
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
  }, [dragging]);

  return (
    <div ref={containerRef} className="absolute inset-0 bottom-12" onMouseDown={() => setSelected(null)}>
      {apps.map((app, index) => {
        const position = positions[app.id] || defaultPosition(index);
        return (
          <button
            key={app.id}
            ref={el => { if (el) iconRefs.current.set(app.id, el); else iconRefs.current.delete(app.id); }}
            className={`nx-icon ${selected === app.id ? 'selected' : ''} ${dragging === app.id ? 'dragging' : ''}`}
            style={{ left: position.x, top: position.y, animationDelay: `${Math.min(index * 30, 300)}ms` }}
            onMouseDown={event => { event.stopPropagation(); onIconMouseDown(event, app); }}
            onContextMenu={event => {
              event.stopPropagation();
              onIconContextMenu?.(event, app, () => {
                setPositions(prev => {
                  const next = { ...prev };
                  delete next[app.id];
                  storage.set('desktop-icon-positions', next);
                  return next;
                });
              });
            }}
            onDoubleClick={event => onLaunch(app, { newWindow: event.shiftKey })}
            title={`${app.name} (double-click to open, Shift+double-click for a new window)`}
          >
            <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} />
            <span className="nx-icon-label">{app.name}</span>
          </button>
        );
      })}
    </div>
  );
}
