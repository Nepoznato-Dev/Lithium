import { CardGroup, SettingsRow, EnhancedToggle } from '../controls';

export default function GamesSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Game Player">
        <SettingsRow title="Fullscreen on launch" description="Auto-fullscreen games when opened">
          <EnhancedToggle value={settings.games.fullscreenOnLaunch} onChange={v => update('games.fullscreenOnLaunch', v)} />
        </SettingsRow>
        <SettingsRow title="ESC to close" description="Press ESC to exit the game player">
          <EnhancedToggle value={settings.games.escToClose} onChange={v => update('games.escToClose', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
