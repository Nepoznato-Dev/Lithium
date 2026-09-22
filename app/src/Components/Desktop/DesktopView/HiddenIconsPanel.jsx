import Icon from '../../Icon';
import { PngIcon } from '../DesktopApps';
import { isDndEnabled, setDndEnabled } from '../../../lib/services/notificationService';
import { getActiveModel } from '../../../lib/services/aiService';
import { useState } from 'react';

/** Hidden Icons panel — Windows 11-style overflow tray for system indicators and background apps. */
export default function HiddenIconsPanel({
  settings, update, soundLevel, setSoundLevel, prevVolumeRef,
  online: _online, netSpeed: _netSpeed, battery: _battery,
  notifCenterOpen: _notifCenterOpen, setNotifCenterOpen, notifUnread,
  hiddenTrayItems, removeFromHiddenTray,
  onClose, onOpenSettings, launchApp,
}) {
  const isMuted = soundLevel === 0;
  const [dnd, setDnd] = useState(() => isDndEnabled());

  const toggleMute = () => {
    if (isMuted) {
      setSoundLevel(prevVolumeRef.current || 50);
    } else {
      prevVolumeRef.current = soundLevel;
      setSoundLevel(0);
    }
  };

  return (
    <div className="nx-popup nx-hidden-icons" onClick={event => event.stopPropagation()}>
      <div className="nx-hi-header">
        <span className="nx-hi-title">Hidden icons</span>
        <button className="nx-footer-icon" onClick={() => { onClose(); onOpenSettings(); }} title="Open Settings">
          <Icon name="Settings" size={14} />
        </button>
      </div>

      {/* System indicators moved from main tray */}
      <div className="nx-hi-section-label">System</div>
      <div className="nx-hi-grid">
        {/* Privacy shield */}
        {(() => {
          const shield = settings.privacy?.shieldLevel ?? 'standard';
          if (shield === 'off') return null;
          return (
            <button className="nx-hi-tile active" title={`Privacy shields: ${shield}`} onClick={() => launchApp('settings')}>
              <PngIcon name={shield === 'aggressive' ? 'shield-aggressive' : 'shield-standard'} size={18} />
              <span className="nx-hi-tile-label">Shields</span>
            </button>
          );
        })()}

        {/* AI status */}
        {getActiveModel() && (
          <button className="nx-hi-tile active" title={`AI: ${getActiveModel()}`} onClick={() => launchApp('ai-hub')}>
            <Icon name="BrainCircuit" size={18} />
            <span className="nx-hi-tile-label">AI</span>
          </button>
        )}

        {/* DND */}
        <button className={`nx-hi-tile ${dnd ? 'active' : ''}`} onClick={() => { const next = !dnd; setDnd(next); setDndEnabled(next); update?.('notifications.dndEnabled', next); }}>
          <Icon name="Moon" size={18} />
          <span className="nx-hi-tile-label">{dnd ? 'DND On' : 'Focus'}</span>
        </button>

        {/* Volume */}
        <button className={`nx-hi-tile ${!isMuted ? 'active' : ''}`} onClick={toggleMute}>
          <Icon name={isMuted ? 'VolumeX' : soundLevel < 50 ? 'Volume1' : 'Volume2'} size={18} />
          <span className="nx-hi-tile-label">{isMuted ? 'Muted' : `${soundLevel}%`}</span>
        </button>

        {/* Notifications */}
        <button
          className={`nx-hi-tile ${notifUnread > 0 ? 'active' : ''}`}
          title={notifUnread > 0 ? `${notifUnread} unread` : 'Notifications'}
          onClick={() => { setNotifCenterOpen(v => !v); onClose(); }}
          style={{ position: 'relative' }}
        >
          <PngIcon name={notifUnread > 0 ? 'bell-active' : 'bell'} size={18} />
          <span className="nx-hi-tile-label">
            Alerts{notifUnread > 0 ? ` (${notifUnread > 9 ? '9+' : notifUnread})` : ''}
          </span>
        </button>
      </div>

      {/* Background apps in hidden tray */}
      {hiddenTrayItems.length > 0 && (
        <>
          <div className="nx-hi-section-label">Background apps</div>
          <div className="nx-hi-grid">
            {hiddenTrayItems.map(item => (
              <div key={item.id} className="nx-hi-tile active" title={item.label || item.id}>
                {item.icon ? (
                  <Icon name={item.icon} size={18} />
                ) : (
                  <Icon name="AppWindow" size={18} />
                )}
                <span className="nx-hi-tile-label">{item.label || item.id}</span>
                <button
                  className="nx-hi-remove"
                  title="Remove from hidden tray"
                  onClick={() => removeFromHiddenTray(item.id)}
                >
                  <Icon name="X" size={10} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {hiddenTrayItems.length === 0 && (
        <div className="nx-hi-empty">
          <Icon name="Inbox" size={20} />
          <span>No background apps</span>
        </div>
      )}
    </div>
  );
}
