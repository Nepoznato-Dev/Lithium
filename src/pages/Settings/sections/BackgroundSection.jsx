import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider } from '../controls';

export default function BackgroundSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Wallpaper">
        <SettingsRow title="Desktop wallpaper" description="Show the wallpaper (off = plain dark desktop)">
          <EnhancedToggle value={settings.background.enabled} onChange={v => update('background.enabled', v)} />
        </SettingsRow>
        <SettingsRow title="Wallpaper brightness" description="Dim the wallpaper for readability">
          <EnhancedSlider value={settings.background.intensity} min={0.2} max={1} step={0.1} suffix="" onChange={v => update('background.intensity', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
