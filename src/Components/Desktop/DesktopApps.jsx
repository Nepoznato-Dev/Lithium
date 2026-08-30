import React from 'react';
import Icon from '../Icon';

/** Rounded gradient app tile, ported from the Nexus DesktopView AppIcon. */
export function AppIcon({ icon: iconName, color, size = 24 }) {
  const box = size === 24 ? 48 : 32;
  return (
    <div
      style={{
        width: box,
        height: box,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${color}dd 0%, ${color}aa 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 4px 12px ${color}40`,
        flexShrink: 0,
      }}
    >
      <Icon name={iconName} size={size} color="#fff" strokeWidth={2.5} />
    </div>
  );
}
