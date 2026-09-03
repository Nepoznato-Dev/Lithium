import { AccentPicker, CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';

export default function AppearanceSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Accent Color">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="settings-row-title">Theme accent</div>
            <div className="settings-row-desc">Buttons, links, sliders & highlights</div>
          </div>
          <AccentPicker value={settings.theme.accent} onChange={v => update('theme.accent', v)} />
        </div>
      </CardGroup>

      <CardGroup label="Style">
        <SettingsRow title="Contrast level" description="Text & UI contrast">
          <SegmentedControl
            value={settings.theme.contrast}
            onChange={v => update('theme.contrast', v)}
            options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]}
          />
        </SettingsRow>
        <SettingsRow title="Transparency effects" description="Translucent taskbar, windows & menus with blur">
          <EnhancedToggle value={settings.theme.transparency !== false} onChange={v => update('theme.transparency', v)} />
        </SettingsRow>
        <SettingsRow title="Tint apps with accent" description="Windows, titlebars & menus get a slight hue of the accent">
          <EnhancedToggle value={settings.theme.appTint !== false} onChange={v => update('theme.appTint', v)} />
        </SettingsRow>
      </CardGroup>

      {/* Live preview */}
      <div className="settings-preview-card">
        <div className="settings-preview-label">Preview</div>
        <div className="flex items-center gap-3">
          <button className="btn-primary px-4 py-2 text-xs">Primary button</button>
          <button className="btn-ghost px-4 py-2 text-xs">Ghost button</button>
          <span className="accent-text text-sm font-medium">Accent text</span>
        </div>
      </div>
    </div>
  );
}
