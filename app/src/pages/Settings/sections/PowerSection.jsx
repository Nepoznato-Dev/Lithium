import { useState, useEffect } from 'react';
import Icon from '../../../Components/Icon';
import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider } from '../controls';

export default function PowerSection({ settings, update }) {
  const [battery, setBattery] = useState(null);
  const [hasBatteryApi, setHasBatteryApi] = useState(() => 'getBattery' in navigator);

  useEffect(() => {
    if (!hasBatteryApi) return;
    navigator.getBattery().then(b => {
      setBattery({ level: Math.round(b.level * 100), charging: b.charging });
      const updateBattery = () => setBattery({ level: Math.round(b.level * 100), charging: b.charging });
      b.addEventListener('levelchange', updateBattery);
      b.addEventListener('chargingchange', updateBattery);
    }).catch(() => setHasBatteryApi(false));
  }, [hasBatteryApi]);

  const saverOn = Boolean(settings.power?.batterySaver);

  const batteryColor = battery
    ? battery.level <= 15 ? '#ef4444'
    : battery.level <= 30 ? '#f59e0b'
    : '#22c55e'
    : 'rgba(255,255,255,0.2)';

  return (
    <div>
      {/* Battery status card */}
      {hasBatteryApi ? (
        <CardGroup label="Battery Status">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon name="Battery" className="h-5 w-5" style={{ color: batteryColor }} />
                <span className="text-sm font-medium text-white">
                  {battery ? `${battery.level}%` : 'Reading\u2026'}
                </span>
                {battery?.charging && (
                  <span className="settings-badge on">
                    <Icon name="BatteryCharging" size={12} /> Charging
                  </span>
                )}
              </div>
              <span className={`settings-badge ${saverOn ? 'on' : ''}`}>
                {saverOn ? 'Saver On' : 'Saver Off'}
              </span>
            </div>
            <div className="settings-battery-bar">
              <div
                className="settings-battery-fill"
                style={{ width: battery ? `${battery.level}%` : '0%', background: batteryColor }}
              />
            </div>
          </div>
        </CardGroup>
      ) : (
        <CardGroup label="Battery Status">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">No battery detected</div>
              <div className="settings-row-desc">Power and battery settings are only active on devices with a battery (laptops, tablets, phones). Other settings below still apply.</div>
            </div>
            <Icon name="Monitor" className="h-5 w-5 text-white/30" />
          </div>
        </CardGroup>
      )}

      {/* Battery Saver toggle */}
      <CardGroup label="Battery Saver">
        <SettingsRow title="Battery Saver" description="Reduces animations, brightness, and background activity to extend battery life">
          <EnhancedToggle value={saverOn} onChange={v => update('power.batterySaver', v)} />
        </SettingsRow>

        {/* Active effects summary */}
        {saverOn && (
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <div className="settings-row-title" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Active effects</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              {settings.power?.stopBackgroundProcesses !== false && (
                <EffectRow icon="Pause" text="Background processes paused" />
              )}
              {settings.power?.autoDimOnLow !== false && (
                <EffectRow icon="Sun" text="Display brightness capped at 60%" />
              )}
              {settings.power?.solidGlassEffects !== false && (
                <EffectRow icon="Layers" text="Blur and glass effects replaced with solid backgrounds" />
              )}
              <EffectRow icon="Sparkles" text="Animations and transitions disabled" />
            </div>
          </div>
        )}
      </CardGroup>

      {/* Battery Saver options */}
      <CardGroup label="Saver Options">
        <SettingsRow title="Stop background processes" description="Pause music preloading, thumbnail generation, weather polling, and sync when saver is on">
          <EnhancedToggle value={settings.power?.stopBackgroundProcesses ?? true} onChange={v => update('power.stopBackgroundProcesses', v)} />
        </SettingsRow>
        <SettingsRow title="Darken light UI" description="Force darker color palette in battery saver mode for OLED power savings">
          <EnhancedToggle value={settings.power?.darkenLightUI ?? true} onChange={v => update('power.darkenLightUI', v)} />
        </SettingsRow>
        <SettingsRow title="Solid glass effects" description="Replace blur and transparency with solid opaque backgrounds">
          <EnhancedToggle value={settings.power?.solidGlassEffects ?? true} onChange={v => update('power.solidGlassEffects', v)} />
        </SettingsRow>
        <SettingsRow title="Auto-dim on low battery" description="Automatically lower brightness when battery is low">
          <EnhancedToggle value={settings.power.autoDimOnLow} onChange={v => update('power.autoDimOnLow', v)} />
        </SettingsRow>
      </CardGroup>

      {/* Thresholds */}
      <CardGroup label="Thresholds">
        <SettingsRow title="Low battery threshold" description="Trigger battery saver actions at this level">
          <EnhancedSlider value={settings.power.lowBatteryThreshold} min={5} max={40} step={5} suffix="%" onChange={v => update('power.lowBatteryThreshold', v)} />
        </SettingsRow>
        <SettingsRow title="Auto-saver threshold" description="Automatically enable battery saver when battery drops to this level (0 = off)">
          <EnhancedSlider value={settings.power?.autoSaverThreshold ?? 15} min={0} max={40} step={5} suffix="%" onChange={v => update('power.autoSaverThreshold', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}

function EffectRow({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
      <Icon name={icon} size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}
