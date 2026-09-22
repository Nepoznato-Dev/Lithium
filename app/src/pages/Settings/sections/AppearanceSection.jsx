import { useEffect, useState } from 'react';
import { AccentPicker, CardGroup, SettingsRow, SegmentedControl, EnhancedToggle, ColorPickerSwatch } from '../controls';
import { AppIcon } from '../../../Components/Desktop/DesktopApps';
import { getUiModeOverride, setUiModeOverride } from '../../../lib/desktop/phoneMode';
import Icon from '../../../Components/Icon';

const THEME_MODES = [
  { value: 'dark', label: 'Dark', description: 'A softer focus', icon: 'Moon' },
  { value: 'light', label: 'Light', description: 'Bright and clear', icon: 'Sun' },
  { value: 'system', label: 'System', description: 'Follow your device', icon: 'Monitor' },
];

const ICON_COLOR_PRESETS = [
  { value: 'default', label: 'Black (Default)' },
  { value: '#ffffff', label: 'White' },
  { value: 'accent',  label: 'Match Accent' },
  { value: 'colorful', label: 'Colorful (per icon)' },
  { value: '#22d3ee', label: 'Cyan' },
  { value: '#a78bfa', label: 'Purple' },
  { value: '#34d399', label: 'Green' },
  { value: '#f87171', label: 'Red' },
  { value: '#fb923c', label: 'Orange' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#60a5fa', label: 'Blue' },
  { value: '#f472b6', label: 'Pink' },
];

/* Curated list of app icons users can color individually in colorful mode.
   `key` mirrors how AppIcon resolves a tint: the PNG basename (iconFile) when
   present, otherwise the Icon.jsx name. Keep in sync with the app registry in
   useDesktopState.jsx. */
const COLORFUL_APPS = [
  { key: 'hydrux',        label: 'Hydrux',       icon: 'Gamepad2',        iconFile: 'hydrux',       color: '#ec4899' },
  { key: 'media-player',  label: 'Media Player', icon: 'Music',           iconFile: 'media-player', color: '#22d3ee' },
  { key: 'browser',       label: 'Browser',      icon: 'Globe',           iconFile: 'browser',      color: '#06b6d4' },
  { key: 'calculator',    label: 'Calculator',   icon: 'Calculator',      iconFile: 'calculator',   color: '#3b82f6' },
  { key: 'clock',         label: 'Clock',        icon: 'Clock',           iconFile: 'clock',        color: '#22c55e' },
  { key: 'files',         label: 'File Explorer', icon: 'Folder',         iconFile: 'files',        color: '#f59e0b' },
  { key: 'gallery',       label: 'Gallery',      icon: 'Image',           iconFile: 'gallery',      color: '#f472b6' },
  { key: 'notes',         label: 'Notes',        icon: 'FileText',        iconFile: 'notes',        color: '#8b5cf6' },
  { key: 'store',         label: 'Store',        icon: 'ArrowDownToLine', iconFile: 'downloader',   color: '#38bdf8' },
  { key: 'code-studio',   label: 'Code Studio',  icon: 'Code',            iconFile: 'code-studio',  color: '#4ade80' },
  { key: 'cortex',        label: 'Cortex',       icon: 'BrainCircuit',    iconFile: 'cortex',       color: '#06b6d4' },
  { key: 'api-manager',   label: 'API Manager',  icon: 'Plug2',           iconFile: 'api-manager',  color: '#f59e0b' },
  { key: 'task-manager',  label: 'Task Manager', icon: 'Activity',        iconFile: 'task-manager', color: '#f59e0b' },
  { key: 'settings',      label: 'Settings',     icon: 'Settings',        iconFile: 'settings',     color: '#64748b' },
  { key: 'Blocks',        label: 'App Studio',   icon: 'Blocks',          color: '#a78bfa' },
];

function IconColorPicker({ value, onChange }) {
  return (
    <div className="settings-accent-grid">
      {ICON_COLOR_PRESETS.map(opt => {
        const swatchColor = opt.value === 'accent' ? 'var(--accent)' : opt.value;
        const isColorful = opt.value === 'colorful';
        const needsBorder = opt.value === 'default' || opt.value === '#ffffff';
        return (
          <button
            key={opt.value}
            className={`settings-accent-swatch ${value === opt.value ? 'active' : ''}`}
            style={{
              ...(isColorful
                ? { backgroundImage: 'linear-gradient(135deg,#f87171,#facc15,#34d399,#22d3ee,#a78bfa,#f472b6)' }
                : { backgroundColor: opt.value === 'default' ? '#0a0a0c' : swatchColor }),
              '--swatch-color': swatchColor,
              ...(needsBorder ? { border: '2px solid rgba(255,255,255,0.2)' } : {}),
            }}
            title={opt.label}
            type="button"
            aria-label={opt.label}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          />
        );
      })}
      <ColorPickerSwatch
        value={value && value !== 'accent' && value !== 'default' && value !== 'colorful' ? value : '#ffffff'}
        onChange={onChange}
      />
    </div>
  );
}

/** Per-icon color editor shown when the tint is set to "Colorful". */
function IconColorGrid({ colors, onChange }) {
  const setKey = (key, hex) => {
    const next = { ...colors };
    if (hex) next[key] = hex; else delete next[key];
    onChange(next);
  };
  const assignedCount = Object.keys(colors || {}).length;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="settings-colorful-grid">
        {COLORFUL_APPS.map(app => {
          const assigned = (colors || {})[app.key];
          return (
            <div key={app.key} className="settings-colorful-cell">
              <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={26} />
              <span className="settings-colorful-label">{app.label}</span>
              <div className="settings-colorful-actions">
                <label className="settings-colorful-swatch" style={{ backgroundColor: assigned || 'transparent' }} title="Pick a color">
                  <input
                    type="color"
                    aria-label={`${app.label} icon color`}
                    value={assigned || '#ffffff'}
                    onChange={e => setKey(app.key, e.target.value)}
                  />
                </label>
                {assigned ? (
                  <button className="settings-colorful-clear" title="Reset this icon" onClick={() => setKey(app.key, null)}>{'\u00d7'}</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {assignedCount > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onChange({})}>Reset all ({assignedCount})</button>
        </div>
      ) : null}
    </div>
  );
}

const SHELL_LAYOUTS = [
  { value: 'auto', label: 'Auto' },
  { value: 'phone', label: 'Touch' },
  { value: 'desktop', label: 'Windows' },
];

/**
 * Shell layout lives in localStorage (not the settings blob) because it has to
 * be readable before any app mounts — see lib/desktop/phoneMode.
 */
function ShellLayoutPicker() {
  const [mode, setMode] = useState(() => getUiModeOverride() || 'auto');

  useEffect(() => {
    const sync = () => setMode(getUiModeOverride() || 'auto');
    window.addEventListener('lithium:ui-mode-changed', sync);
    return () => window.removeEventListener('lithium:ui-mode-changed', sync);
  }, []);

  return (
    <SettingsRow
      title="Shell layout"
      description="Auto picks by screen size. Touch forces the mobile shell everywhere: iOS on a phone, macOS on a desktop-sized screen"
    >
      <SegmentedControl
        value={mode}
        options={SHELL_LAYOUTS}
        onChange={value => setMode(setUiModeOverride(value === 'auto' ? '' : value) || 'auto')}
      />
    </SettingsRow>
  );
}

export default function AppearanceSection({ settings, update }) {
  return (
    <div>
      <fieldset className="settings-theme-picker">
        <legend>Choose your look</legend>
        <div className="settings-theme-grid">
          {THEME_MODES.map(mode => (
            <button
              key={mode.value}
              type="button"
              className="settings-theme-choice"
              data-preview={mode.value}
              aria-pressed={(settings.theme.mode || 'dark') === mode.value}
              onClick={() => update('theme.mode', mode.value)}
            >
              <span className="settings-theme-scene" aria-hidden="true">
                <span className="settings-theme-window"><span /><span /><span /></span>
                <span className="settings-theme-dock"><i /><i /><i /></span>
              </span>
              <span className="settings-theme-caption"><Icon name={mode.icon} size={15} />{mode.label}<Icon name="Check" size={14} className="settings-theme-check" /></span>
              <span className="settings-theme-description">{mode.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <CardGroup label="Accent Color">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="settings-row-title">Theme accent</div>
            <div className="settings-row-desc">Buttons, links, sliders & highlights</div>
          </div>
          <AccentPicker value={settings.theme.accent} onChange={v => update('theme.accent', v)} />
        </div>
      </CardGroup>

      <CardGroup label="Icon Color">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="settings-row-title">App icon tint</div>
            <div className="settings-row-desc">Recolor app, taskbar &amp; File Explorer icons with a custom color</div>
          </div>
          <IconColorPicker
            value={settings.theme.iconColor || 'default'}
            onChange={v => update('theme.iconColor', v)}
          />
          {settings.theme.iconColor === 'colorful' ? (
            <IconColorGrid
              colors={settings.theme.iconColors || {}}
              onChange={map => update('theme.iconColors', map)}
            />
          ) : null}
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
        <SettingsRow title="Transparency effects" description="Soft glass on the taskbar & menus; solid surfaces in low-end mode">
          <EnhancedToggle value={settings.theme.transparency !== false} onChange={v => update('theme.transparency', v)} />
        </SettingsRow>
        <SettingsRow title="Tint apps with accent" description="Windows, titlebars & menus get a slight hue of the accent">
          <EnhancedToggle value={settings.theme.appTint !== false} onChange={v => update('theme.appTint', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Shell">
        <ShellLayoutPicker />
      </CardGroup>

      {/* Live preview */}
      <div className="settings-preview-card">
        <div className="settings-preview-label">Preview</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary px-4 py-2 text-xs">Primary button</button>
          <button className="btn-ghost px-4 py-2 text-xs">Ghost button</button>
          <span className="accent-text text-sm font-medium">Accent text</span>
        </div>
      </div>
    </div>
  );
}
