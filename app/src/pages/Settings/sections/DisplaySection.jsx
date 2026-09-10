import { CardGroup, SettingsRow, EnhancedSlider, SegmentedControl } from '../controls';

export default function DisplaySection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Text & Scaling">
        <SettingsRow title="Font size" description="Base text size across the interface">
          <EnhancedSlider value={settings.display.fontSize} min={12} max={20} step={1} suffix="px" onChange={v => update('display.fontSize', v)} />
        </SettingsRow>
        <SettingsRow title="Layout density" description="Spacing & element size">
          <SegmentedControl
            value={settings.layout.density}
            onChange={v => update('layout.density', v)}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Display">
        <SettingsRow title="Brightness" description="Dim or brighten the entire interface">
          <EnhancedSlider value={settings.display.brightness} min={40} max={100} step={5} suffix="%" onChange={v => update('display.brightness', v)} />
        </SettingsRow>
        <SettingsRow title="Glass effect" description="Slide between frosted blur and clear glass">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Blur</span>
            <EnhancedSlider value={settings.display.glassEffect} min={0} max={100} step={5} suffix="%" onChange={v => update('display.glassEffect', v)} />
            <span className="text-[10px] uppercase tracking-wider text-white/30">Glass</span>
          </div>
        </SettingsRow>
      </CardGroup>

      {/* Font size preview */}
      <div className="settings-preview-card">
        <div className="settings-preview-label">Font preview</div>
        <p style={{ fontSize: settings.display.fontSize, color: 'rgba(255,255,255,0.7)' }}>
          The quick brown fox jumps over the lazy dog. 0123456789
        </p>
      </div>
    </div>
  );
}
