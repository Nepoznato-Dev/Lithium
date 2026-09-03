import { useEffect, useRef, useState } from 'react';
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
  const dragInfo = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const defaultPosition = index => ({
    x: 10 + (index % Math.max(1, Math.floor((window.innerWidth - 40) / GRID_SIZE))) * GRID_SIZE,
    y: 10 + Math.floor(index / Math.max(1, Math.floor((window.innerWidth - 40) / GRID_SIZE))) * GRID_SIZE,
  });

  const snap = (x, y) => ({
    x: Math.round((x - 10) / GRID_SIZE) * GRID_SIZE + 10,
    y: Math.round((y - 10) / GRID_SIZE) * GRID_SIZE + 10,
  });

  const onIconMouseDown = (event, app) => {
    if (event.button !== 0) return;
    const position = positions[app.id] || defaultPosition(apps.indexOf(app));
    dragInfo.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    setSelected(app.id);
    setDragging(app.id);
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = event => {
      const { startX, startY, originX, originY } = dragInfo.current;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragInfo.current.moved = true;
      const bounds = containerRef.current?.getBoundingClientRect();
      const maxX = (bounds?.width || window.innerWidth) - ICON_SIZE;
      const maxY = (bounds?.height || window.innerHeight) - ICON_SIZE - 48;
      setPositions(prev => ({
        ...prev,
        [dragging]: {
          x: Math.max(0, Math.min(originX + deltaX, maxX)),
          y: Math.max(0, Math.min(originY + deltaY, maxY)),
        },
      }));
    };
    const stop = () => {
      setPositions(prev => {
        const position = prev[dragging];
        const next = position ? { ...prev, [dragging]: snap(position.x, position.y) } : prev;
        storage.set('desktop-icon-positions', next);
        return next;
      });
      setDragging(null);
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
            className={`nx-icon ${selected === app.id ? 'selected' : ''} ${dragging === app.id ? 'dragging' : ''}`}
            style={{ left: position.x, top: position.y }}
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
            <AppIcon icon={app.icon} color={app.color} />
            <span className="nx-icon-label">{app.name}</span>
          </button>
        );
      })}
    </div>
  );
}
