import React from 'react';
import Icon from '../Icon';

/**
 * Task View: bird's-eye grid of every open window. Click a card to focus (or
 * restore) that window, hover to close it, Esc / backdrop click to dismiss.
 * Enhanced with window preview thumbnails (G3).
 */
export default function TaskView({ windows, onSelect, onCloseWindow, onCloseAll, onClose }) {
  return (
    <div
      role="dialog"
      aria-label="Task view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 32,
        background: 'rgba(8,8,12,0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        animation: 'nx-start-in 150ms ease-out',
      }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600 }}>
        <Icon name="LayoutGrid" size={16} />
        Task view — pick a window
        <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>· Esc to close</span>
      </div>

      {windows.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No windows are open. Launch an app from the Start menu or desktop.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 16,
            width: '100%',
            maxWidth: 1080,
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {windows.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
                className={`nx-taskview-card ${item.minimized ? 'minimized' : ''}`}
                onClick={() => onSelect(item.id)}
                title={`${item.title}${item.minimized ? ' (minimized)' : ''}`}
              >
                {/* Large background icon as preview */}
                <div className="nx-taskview-card-preview">
                  {item.icon}
                </div>
                {/* Card content */}
                <div className="nx-taskview-card-content">
                  <span style={{ display: 'flex', fontSize: 30, opacity: item.minimized ? 0.5 : 1 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, opacity: item.minimized ? 0.55 : 1 }}>{item.title}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                    {item.minimized ? 'Minimized' : `${item.tabs.length} tab${item.tabs.length === 1 ? '' : 's'} open`}
                  </span>
                </div>
              </button>
              <button
                title="Close window"
                onClick={event => { event.stopPropagation(); onCloseWindow(item.id); }}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgba(0,0,0,0.45)',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  opacity: 0,
                  transition: 'opacity 120ms ease',
                  zIndex: 2,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0'; }}
              >
                <Icon name="X" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {windows.length > 1 && (
        <button
          onClick={onCloseAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.12)',
            color: '#fca5a5',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon name="SquareX" size={14} />
          Close all windows
        </button>
      )}
    </div>
  );
}
