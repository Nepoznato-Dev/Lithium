/**
 * ContextMenu — reusable right-click context menu.
 * Renders a floating menu at the given position with the provided items.
 */
import { useEffect, useRef } from 'preact/hooks';
import Icon from '../../Components/Icon';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('contextmenu', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [onClose]);

  // Clamp position to viewport
  const menuWidth = 200;
  const menuHeight = items.length * 32 + 16;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] rounded-xl border border-white/10 bg-[#1a1a26] py-1.5 shadow-2xl"
      style={{ left: clampedX, top: clampedY }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-white/[0.06]" />;
        }
        return (
          <button
            key={i}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
              item.disabled ? 'cursor-not-allowed text-white/20' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.action?.();
                onClose();
              }
            }}
          >
            {item.icon && <Icon name={item.icon} className="h-3.5 w-3.5" />}
            {item.label}
            {item.shortcut && (
              <span className="ml-auto text-[10px] text-white/20">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
