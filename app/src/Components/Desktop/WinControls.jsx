import React from 'react';
import Icon from '../Icon';

/**
 * Inline window controls (minimize, maximize, close).
 * No bar, no background — just the buttons. Drop into any app header.
 */
export default function WinControls({ onClose, onMinimize, onMaximize, isMaximized }) {
  return (
    <div className="win-controls">
      <button className="win-ctrl-btn" title="Minimize" onClick={onMinimize}>
        <Icon name="Minus" size={13} />
      </button>
      <button className="win-ctrl-btn" title={isMaximized ? 'Restore' : 'Maximize'} onClick={onMaximize}>
        {isMaximized ? <Icon name="Square" size={11} /> : <Icon name="Maximize2" size={12} />}
      </button>
      <button className="win-ctrl-btn close" title="Close" onClick={onClose}>
        <Icon name="X" size={13} />
      </button>
    </div>
  );
}
