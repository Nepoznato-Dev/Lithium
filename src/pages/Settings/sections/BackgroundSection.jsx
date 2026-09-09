import { useState, useEffect } from 'react';
import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider } from '../controls';
import { WALLPAPERS } from '../../../Components/Desktop/DesktopView/wallpapers';
import { storage } from '../../../lib/storage';

const wpIds = Object.keys(WALLPAPERS);

export default function BackgroundSection({ settings, update }) {
  const [current, setCurrent] = useState(() => storage.get('desktop-wallpaper', 'nexus-default'));

  useEffect(() => {
    const handler = () => setCurrent(storage.get('desktop-wallpaper', 'nexus-default'));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const selectWallpaper = id => {
    storage.set('desktop-wallpaper', id);
    setCurrent(id);
    window.dispatchEvent(new Event('lithium:settings-changed'));
  };

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

      <CardGroup label="Choose Wallpaper">
        <div className="settings-wallpaper-grid">
          {wpIds.map(id => (
            <button
              key={id}
              className={`settings-wallpaper-thumb ${current === id ? 'active' : ''}`}
              style={WALLPAPERS[id].style}
              onClick={() => selectWallpaper(id)}
              title={WALLPAPERS[id].label}
            >
              <span className="settings-wallpaper-label">{WALLPAPERS[id].label}</span>
            </button>
          ))}
        </div>
      </CardGroup>
    </div>
  );
}
