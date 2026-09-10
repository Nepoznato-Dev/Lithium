import { CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';
import Icon from '../../../Components/Icon';
import { getStats, resetStats } from '../../../lib/services/privacyService';
import { useState } from 'react';

export default function PrivacySettingsSection({ settings, update }) {
  const [stats, setStats] = useState(() => getStats());

  const handleReset = () => {
    resetStats();
    setStats(getStats());
  };

  return (
    <div>
      <CardGroup label="Shields">
        <SettingsRow title="Shield level" description="Control how aggressively trackers and ads are blocked">
          <SegmentedControl
            value={settings.privacy?.shieldLevel ?? 'standard'}
            onChange={v => update('privacy.shieldLevel', v)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'standard', label: 'Standard' },
              { value: 'aggressive', label: 'Aggressive' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Privacy features">
        <SettingsRow title="GPC header" description="Send Global Privacy Control signal to websites">
          <EnhancedToggle value={settings.privacy?.gpcEnabled ?? true} onChange={v => update('privacy.gpcEnabled', v)} />
        </SettingsRow>
        <SettingsRow title="Strip tracking params" description="Remove tracking parameters (utm_*, fbclid, gclid…) from URLs">
          <EnhancedToggle value={settings.privacy?.stripTrackingParams ?? true} onChange={v => update('privacy.stripTrackingParams', v)} />
        </SettingsRow>
        <SettingsRow title="Cosmetic filters" description="Hide cookie banners, newsletter popups, and ad containers with CSS">
          <EnhancedToggle value={settings.privacy?.cosmeticFilters ?? true} onChange={v => update('privacy.cosmeticFilters', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Statistics">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Shield" size={14} color="#22d3ee" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Trackers blocked</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.trackersPrevented}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Ban" size={14} color="#ef4444" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Ads blocked</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.adsBlocked}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Lock" size={14} color="#10b981" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>HTTPS upgrades</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.httpsUpgrades}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="HardDrive" size={14} color="#f59e0b" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Data saved</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{(stats.dataSavedBytes / 1048576).toFixed(1)} MB</span>
            </div>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={handleReset}>Reset statistics</button>
        </div>
      </CardGroup>

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Privacy rules are stored in /System/Privacy/ and can be edited from the Privacy Dashboard app.
      </p>
    </div>
  );
}
