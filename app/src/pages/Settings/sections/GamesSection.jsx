import { useState } from 'react';
import { CardGroup, SettingsRow, EnhancedToggle } from '../controls';
import Icon from '../../../Components/Icon';

export default function GamesSection({ settings, update }) {
  const games = settings.games || {};
  const [resetKey, setResetKey] = useState(0);

  const handleReset = () => {
    update('games.fullscreenOnLaunch', false);
    update('games.escToClose', true);
    update('games.volume', 80);
    update('games.controllerSupport', true);
    update('games.performanceOverlay', false);
    update('games.autoSave', true);
    update('games.notifications', true);
    setResetKey(k => k + 1);
  };

  return (
    <div key={resetKey}>
      <CardGroup label="Game Player">
        <SettingsRow title="Fullscreen on launch" description="Auto-fullscreen games when opened">
          <EnhancedToggle value={games.fullscreenOnLaunch} onChange={v => update('games.fullscreenOnLaunch', v)} />
        </SettingsRow>
        <SettingsRow title="ESC to close" description="Press ESC to exit the game player">
          <EnhancedToggle value={games.escToClose} onChange={v => update('games.escToClose', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Audio">
        <SettingsRow
          title="Master volume"
          description="Default volume level for HTML games"
          icon={<Icon name={games.volume === 0 ? 'VolumeX' : 'Volume2'} size={16} />}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={games.volume ?? 80}
              onChange={e => update('games.volume', Number(e.target.value))}
              className="settings-slider"
              style={{ width: 120 }}
            />
            <span className="text-xs tabular-nums opacity-60" style={{ minWidth: 32, textAlign: 'right' }}>
              {games.volume ?? 80}%
            </span>
          </div>
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Controls">
        <SettingsRow
          title="Controller support"
          description="Allow gamepad input when a controller is connected"
          icon={<Icon name="Gamepad2" size={16} />}
        >
          <EnhancedToggle value={games.controllerSupport ?? true} onChange={v => update('games.controllerSupport', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Performance">
        <SettingsRow
          title="Performance overlay"
          description="Show FPS and frame-time overlay while playing"
          icon={<Icon name="Activity" size={16} />}
        >
          <EnhancedToggle value={games.performanceOverlay} onChange={v => update('games.performanceOverlay', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Data & Notifications">
        <SettingsRow
          title="Auto-save progress"
          description="Automatically save game state when closing"
          icon={<Icon name="Save" size={16} />}
        >
          <EnhancedToggle value={games.autoSave ?? true} onChange={v => update('games.autoSave', v)} />
        </SettingsRow>
        <SettingsRow
          title="Game notifications"
          description="Show toasts for achievements and game events"
          icon={<Icon name="Bell" size={16} />}
        >
          <EnhancedToggle value={games.notifications ?? true} onChange={v => update('games.notifications', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Reset">
        <SettingsRow
          title="Reset game settings"
          description="Restore all game settings to their defaults"
          icon={<Icon name="RotateCcw" size={16} />}
        >
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            Reset
          </button>
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
