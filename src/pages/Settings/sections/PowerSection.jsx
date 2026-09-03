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

  if (!hasBatteryApi) {
    return (
      <div>
        <CardGroup label="Battery Status">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">No battery detected</div>
              <div className="settings-row-desc">Power & battery settings are only available on devices with a battery (laptops, tablets, phones)</div>
            </div>
            <Icon name="Monitor" className="h-5 w-5 text-white/30" />
          </div>
        </CardGroup>
      </div>
    );
  }

  const batteryColor = battery
    ? battery.level <= 15 ? '#ef4444'
    : battery.level <= 30 ? '#f59e0b'
    : '#22c55e'
    : 'rgba(255,255,255,0.2)';

  return (
    <div>
      <CardGroup label="Battery Status">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon name="Battery" className="h-5 w-5" style={{ color: batteryColor }} />
              <span className="text-sm font-medium text-white">
                {battery ? `${battery.level}%` : 'Reading…'}
              </span>
              {battery?.charging && (
                <span className="settings-badge on">
                  <Icon name="BatteryCharging" size={12} /> Charging
                </span>
              )}
            </div>
            <span className={`settings-badge ${settings.power.batterySaver ? 'on' : ''}`}>
              {settings.power.batterySaver ? 'Saver On' : 'Saver Off'}
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

      <CardGroup label="Power Saving">
        <SettingsRow title="Battery Saver" description="Reduces animations, brightness & background activity">
          <EnhancedToggle value={settings.power.batterySaver} onChange={v => update('power.batterySaver', v)} />
        </SettingsRow>
        <SettingsRow title="Auto-dim on low battery" description="Automatically lower brightness when battery is low">
          <EnhancedToggle value={settings.power.autoDimOnLow} onChange={v => update('power.autoDimOnLow', v)} />
        </SettingsRow>
        <SettingsRow title="Low battery threshold" description="Trigger battery saver at this level">
          <EnhancedSlider value={settings.power.lowBatteryThreshold} min={5} max={40} step={5} suffix="%" onChange={v => update('power.lowBatteryThreshold', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
