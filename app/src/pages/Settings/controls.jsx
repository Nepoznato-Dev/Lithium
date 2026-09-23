import { createContext, useContext, useId, useState, useEffect, useRef } from 'react';
import { ACCENT_OPTIONS } from '../../lib/settings';
import Icon from '../../Components/Icon';

const RowLabelContext = createContext(undefined);

export function EnhancedToggle({ value, checked, onChange, 'aria-label': ariaLabel }) {
  const labelId = useContext(RowLabelContext);
  const isOn = value !== undefined ? Boolean(value) : Boolean(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelId}
      aria-checked={isOn}
      onClick={() => onChange(!isOn)}
      className={`settings-toggle ${isOn ? 'on' : ''}`}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

export function EnhancedSlider({ value, min, max, step, suffix, onChange, onDecrement, onIncrement, decrementLabel, incrementLabel }) {
  const labelId = useContext(RowLabelContext);
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const pending = useRef(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const commitPending = () => {
      if (pending.current === null) return;
      const next = pending.current;
      pending.current = null;
      dragging.current = false;
      changeRef.current(next);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') commitPending();
    };
    window.addEventListener('pagehide', commitPending);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      commitPending();
      window.removeEventListener('pagehide', commitPending);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

  // Sync external changes when not dragging
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  const pct = ((draft - min) / (max - min)) * 100;

  return (
    <div className="settings-slider-wrap">
      {onDecrement && (
        <button
          type="button"
          className="settings-slider-step-btn"
          aria-label={decrementLabel || 'Decrease'}
          onClick={() => onDecrement(Math.max(min, draft - (step || 1)))}
        >
          {decrementLabel || '−'}
        </button>
      )}
      <input
        type="range"
        className="settings-slider"
        aria-labelledby={labelId}
        aria-valuetext={`${draft}${suffix || ''}`}
        min={min}
        max={max}
        step={step || 1}
        value={draft}
        onPointerDown={e => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={e => {
          dragging.current = false;
          pending.current = null;
          onChange(Number(e.currentTarget.value));
        }}
        onBlur={e => {
          if (pending.current !== null) {
            pending.current = null;
            dragging.current = false;
            onChange(Number(e.currentTarget.value));
          }
        }}
        onPointerCancel={() => { pending.current = null; dragging.current = false; setDraft(value); }}
        onInput={e => {
          const next = Number(e.currentTarget.value);
          setDraft(next);
          pending.current = dragging.current ? next : null;
          if (!dragging.current) onChange(next);
        }}
        style={{
          background: `linear-gradient(to right, var(--accent) ${pct}%, var(--ui-border) ${pct}%)`,
        }}
      />
      {onIncrement && (
        <button
          type="button"
          className="settings-slider-step-btn"
          aria-label={incrementLabel || 'Increase'}
          onClick={() => onIncrement(Math.min(max, draft + (step || 1)))}
        >
          {incrementLabel || '+'}
        </button>
      )}
      <span className="settings-slider-value">
        {draft}{suffix || ''}
      </span>
    </div>
  );
}

export function SegmentedControl({ options, value, onChange }) {
  const labelId = useContext(RowLabelContext);
  return (
    <div className="settings-segmented" role="group" aria-labelledby={labelId}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`settings-segmented-btn ${value === opt.value ? 'active' : ''}`}
          type="button"
          aria-pressed={value === opt.value}
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
        aria-label="Custom color"
        value={draft}
        onChange={e => {
          const next = e.currentTarget.value;
          setDraft(next);
          onChange(next);
        }}
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
          type="button"
          aria-label={opt.label}
          aria-pressed={value === opt.value}
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
          type="button"
          aria-label={pos.replaceAll('-', ' ')}
          aria-pressed={value === pos}
          onClick={() => onChange(pos)}
        />
      ))}
    </div>
  );
}

export function SettingsRow({ title, description, children }) {
  const labelId = useId();
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div id={labelId} className="settings-row-title">{title}</div>
        {description && <div className="settings-row-desc">{description}</div>}
      </div>
      <RowLabelContext.Provider value={labelId}>{children}</RowLabelContext.Provider>
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
