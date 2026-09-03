import Icon from '../../Icon';

/** Quick Actions panel — Windows 11-style quick settings with toggles & sliders. */
export default function QuickActionsPanel({ settings, soundLevel, setSoundLevel, prevVolumeRef, online, netSpeed, battery, onClose, onOpenSettings }) {
  const isMuted = soundLevel === 0;

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

        {/* Focus mode placeholder */}
        <button className="nx-qs-tile">
          <Icon name="Moon" size={18} />
          <span className="nx-qs-tile-label">Focus</span>
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
      </div>

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
