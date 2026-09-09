import Icon from '../../Icon';
import { isDndEnabled, setDndEnabled } from '../../../lib/services/notificationService';
import { listWorkspaces, saveWorkspace, deleteWorkspace, getActiveWorkspace } from '../../../lib/services/workspaceService';
import { useState } from 'react';

/** Quick Actions panel — Windows 11-style quick settings with toggles & sliders. */
export default function QuickActionsPanel({ settings, update, soundLevel, setSoundLevel, prevVolumeRef, online, netSpeed, battery, onClose, onOpenSettings, windows }) {
  const isMuted = soundLevel === 0;
  const [dnd, setDnd] = useState(() => isDndEnabled());
  const [workspaceName, setWorkspaceName] = useState('');
  const [showWorkspaceInput, setShowWorkspaceInput] = useState(false);
  const workspaces = listWorkspaces();
  const activeWs = getActiveWorkspace();

  const toggleMute = () => {
    if (isMuted) {
      setSoundLevel(prevVolumeRef.current || 50);
    } else {
      prevVolumeRef.current = soundLevel;
      setSoundLevel(0);
    }
  };

  return (
    <div className="nx-popup nx-quick-settings" onClick={event => event.stopPropagation()}>
      <div className="nx-qs-header">
        <span className="nx-qs-title">Quick settings</span>
        <button className="nx-footer-icon" onClick={() => { onClose(); onOpenSettings(); }} title="Open Settings">
          <Icon name="Settings" size={14} />
        </button>
      </div>

      <div className="nx-qs-grid">
        {/* Network */}
        <button className={`nx-qs-tile ${online ? 'active' : ''}`}>
          <Icon name={online ? 'Wifi' : 'WifiOff'} size={18} />
          <span className="nx-qs-tile-label">{online ? (netSpeed != null ? `${netSpeed} Mbps` : 'Connected') : 'Offline'}</span>
        </button>

        {/* Volume */}
        <button className={`nx-qs-tile ${!isMuted ? 'active' : ''}`} onClick={toggleMute}>
          <Icon name={isMuted ? 'VolumeX' : soundLevel < 50 ? 'Volume1' : 'Volume2'} size={18} />
          <span className="nx-qs-tile-label">{isMuted ? 'Muted' : `Volume ${soundLevel}%`}</span>
        </button>

        {/* Battery (only on devices with battery) */}
        {battery && (
          <button className={`nx-qs-tile ${battery.level > 20 ? 'active' : 'warning'}`}>
            <Icon name={battery.charging ? 'BatteryCharging' : 'Battery'} size={18} />
            <span className="nx-qs-tile-label">{battery.level}%{battery.charging ? ' \u26A1' : ''}</span>
          </button>
        )}

        {/* Focus / DND mode */}
        <button className={`nx-qs-tile ${dnd ? 'active' : ''}`} onClick={() => { const next = !dnd; setDnd(next); setDndEnabled(next); }}>
          <Icon name="Moon" size={18} />
          <span className="nx-qs-tile-label">{dnd ? 'DND On' : 'Focus'}</span>
        </button>

        {/* Privacy shields */}
        <button className={`nx-qs-tile ${(settings.privacy?.shieldLevel ?? 'standard') !== 'off' ? 'active' : ''}`} onClick={() => {
          const current = settings.privacy?.shieldLevel ?? 'standard';
          update?.('privacy.shieldLevel', current === 'off' ? 'standard' : 'off');
        }}>
          <Icon name="Shield" size={18} />
          <span className="nx-qs-tile-label">{(settings.privacy?.shieldLevel ?? 'standard') === 'off' ? 'Shields Off' : 'Shields On'}</span>
        </button>

        {/* Lock screen */}
        <button className="nx-qs-tile" onClick={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}>
          <Icon name="Lock" size={18} />
          <span className="nx-qs-tile-label">Lock</span>
        </button>

        {/* Brightness */}
        <button className="nx-qs-tile" style={{ opacity: 0.7, cursor: 'default' }}>
          <Icon name="Sun" size={18} />
          <span className="nx-qs-tile-label">{settings.display?.brightness ?? 100}%</span>
        </button>

        {/* Transparency toggle */}
        <button className={`nx-qs-tile ${settings.theme.transparency !== false ? 'active' : ''}`}>
          <Icon name="Eye" size={18} />
          <span className="nx-qs-tile-label">Transparency</span>
        </button>

        {/* Save workspace */}
        <button className="nx-qs-tile" onClick={() => setShowWorkspaceInput(!showWorkspaceInput)}>
          <Icon name="Save" size={18} />
          <span className="nx-qs-tile-label">Save layout</span>
        </button>

        {/* Load workspace */}
        <button className={`nx-qs-tile ${activeWs ? 'active' : ''}`} onClick={() => {
          if (workspaces.length > 0) {
            const ws = workspaces[workspaces.length - 1];
            window.dispatchEvent(new CustomEvent('lithium:restore-workspace', { detail: { name: ws.name } }));
          }
        }}>
          <Icon name="LayoutGrid" size={18} />
          <span className="nx-qs-tile-label">{activeWs || 'Load layout'}</span>
        </button>
      </div>

      {/* Workspace save input */}
      {showWorkspaceInput && (
        <div className="nx-qs-slider-row" style={{ gap: 6 }}>
          <input
            className="text-input flex-1 rounded-full py-1 text-xs"
            placeholder="Workspace name…"
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && workspaceName.trim()) {
                saveWorkspace(workspaceName.trim(), windows || []);
                setWorkspaceName('');
                setShowWorkspaceInput(false);
              }
            }}
          />
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => {
            if (workspaceName.trim()) {
              saveWorkspace(workspaceName.trim(), windows || []);
              setWorkspaceName('');
              setShowWorkspaceInput(false);
            }
          }}>Save</button>
        </div>
      )}

      {/* Saved workspaces list */}
      {workspaces.length > 0 && (
        <div style={{ padding: '4px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {workspaces.map(ws => (
            <button key={ws.name} onClick={() => {
              window.dispatchEvent(new CustomEvent('lithium:restore-workspace', { detail: { name: ws.name } }));
            }} style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 4,
              background: activeWs === ws.name ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
              color: activeWs === ws.name ? '#22d3ee' : 'rgba(255,255,255,0.5)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {ws.name}
              <span style={{ opacity: 0.4 }}>({ws.windowCount})</span>
            </button>
          ))}
        </div>
      )}

      {/* Volume slider */}
      <div className="nx-qs-slider-row">
        <Icon name={isMuted ? 'VolumeX' : 'Volume2'} size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <input
          type="range"
          className="nx-qs-slider"
          min={0}
          max={150}
          value={soundLevel}
          onChange={event => {
            const v = Number(event.target.value);
            setSoundLevel(v);
            if (v > 0) prevVolumeRef.current = v;
          }}
        />
        <span className="nx-qs-slider-val">{soundLevel}%</span>
      </div>

      {/* Brightness slider */}
      <div className="nx-qs-slider-row">
        <Icon name="Sun" size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <input
          type="range"
          className="nx-qs-slider"
          min={40}
          max={100}
          value={settings.display?.brightness ?? 100}
          readOnly
        />
        <span className="nx-qs-slider-val">{settings.display?.brightness ?? 100}%</span>
      </div>
    </div>
  );
}
