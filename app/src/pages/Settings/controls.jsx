import { useState, useEffect, useRef } from 'react';
import { ACCENT_OPTIONS } from '../../lib/settings';
import Icon from '../../Components/Icon';

export function EnhancedToggle({ value, checked, onChange }) {
  const isOn = value !== undefined ? Boolean(value) : Boolean(checked);
  return (
    <button
      role="switch"
      aria-checked={isOn}
      onClick={() => onChange(!isOn)}
      className={`settings-toggle ${isOn ? 'on' : ''}`}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

export function EnhancedSlider({ value, min, max, step, suffix, onChange }) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);

  // Sync external changes when not dragging
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  const pct = ((draft - min) / (max - min)) * 100;

  return (
    <div className="settings-slider-wrap">
      <input
        type="range"
        className="settings-slider"
        min={min}
        max={max}
        step={step || 1}
        value={draft}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; onChange(draft); }}
        onChange={e => setDraft(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
      <span className="settings-slider-value">
        {draft}{suffix || ''}
      </span>
    </div>
  );
}

export function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="settings-segmented">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`settings-segmented-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ColorPickerSwatch({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const open = useRef(false);

  useEffect(() => { setDraft(value); }, [value]);

  return (
    <label
      className="settings-accent-swatch flex items-center justify-center"
      title="Custom color"
      style={{ background: 'rgba(255,255,255,0.06)', border: '2px dashed rgba(255,255,255,0.15)', cursor: 'pointer' }}
    >
      <Icon name="Palette" size={14} />
      <input
        type="color"
        value={draft}
        onFocus={() => { open.current = true; }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { open.current = false; onChange(draft); }}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
      />
    </label>
  );
}

export function AccentPicker({ value, onChange }) {
  return (
    <div className="settings-accent-grid">
      {ACCENT_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={`settings-accent-swatch ${value === opt.value ? 'active' : ''}`}
          style={{ backgroundColor: opt.value, '--swatch-color': opt.value }}
          title={opt.label}
          onClick={() => onChange(opt.value)}
        />
      ))}
      {/* Custom color picker */}
      <ColorPickerSwatch value={value} onChange={onChange} />
    </div>
  );
}

export function NotifPositionPicker({ value, onChange }) {
  const positions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  return (
    <div className="settings-notif-grid">
      {positions.map(pos => (
        <button
          key={pos}
          className={`settings-notif-cell ${value === pos ? 'active' : ''}`}
          title={pos}
          onClick={() => onChange(pos)}
        />
      ))}
    </div>
  );
}

export function SettingsRow({ title, description, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-title">{title}</div>
        {description && <div className="settings-row-desc">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function CardGroup({ label, children }) {
  return (
    <div className="settings-card">
      {label && <div className="settings-card-title">{label}</div>}
      {children}
    </div>
  );
}
