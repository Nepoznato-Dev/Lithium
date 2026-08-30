import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import WinControls from '../Components/Desktop/WinControls';
import { useSettings } from '../Components/SettingsContext';
import { ACCENT_OPTIONS, BUILD_VERSION, DEFAULT_SETTINGS, SEARCH_ENGINES } from '../lib/settings';
import { SCRAPE_PROVIDERS } from '../lib/searchProxy';
import { storage } from '../lib/storage';
import { registerSavedFile } from '../lib/downloads';
import { clearPin, hasPin, setPin, verifyPin } from '../lib/desktop/ui';
import Icon from '../Components/Icon';

/* ================================================================
   Custom Controls
   ================================================================ */

function EnhancedToggle({ value, checked, onChange }) {
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

function EnhancedSlider({ value, min, max, step, suffix, onChange }) {
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

function SegmentedControl({ options, value, onChange }) {
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

function ColorPickerSwatch({ value, onChange }) {
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

function AccentPicker({ value, onChange }) {
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

function NotifPositionPicker({ value, onChange }) {
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

/* ================================================================
   Settings Row — reusable wrapper
   ================================================================ */

function SettingsRow({ title, description, children }) {
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

function CardGroup({ label, children }) {
  return (
    <div className="settings-card">
      {label && <div className="settings-card-title">{label}</div>}
      {children}
    </div>
  );
}

/* ================================================================
   Security Section (kept from original, slightly re-styled)
   ================================================================ */

function SecuritySection({ settings, update }) {
  const [pinSet, setPinSet] = useState(() => hasPin());
  const [step, setStep] = useState('idle');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setStep('idle'); setDraft(''); setPending(''); setError(''); };

  const saveNew = async (nextPin) => {
    setBusy(true);
    const ok = await setPin(nextPin);
    setBusy(false);
    if (!ok) { setError('Could not save PIN — wasm unavailable?'); return; }
    setPinSet(true);
    reset();
  };

  const handleSet = async () => {
    setError('');
    if (pinSet) {
      const result = await verifyPin(draft);
      if (!result.ok) { setError('Current PIN is incorrect.'); setDraft(''); return; }
      setDraft('');
      setStep('enter-new');
      return;
    }
    if (!/^\d{4,12}$/.test(draft)) { setError('PIN must be 4–12 digits.'); return; }
    await saveNew(draft);
  };

  const handleConfirm = async () => {
    if (draft !== pending) { setError('PINs do not match.'); setDraft(''); return; }
    await saveNew(draft);
  };

  return (
    <div>
      <CardGroup label="Lock-screen PIN">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <div className="flex items-start gap-3 w-full">
            <span className="accent-soft-bg accent-text flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <Icon name="Lock" size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white/70 leading-relaxed">
                {pinSet
                  ? 'A PIN is set. Press Ctrl+Alt+L or use the power menu to lock.'
                  : 'No PIN set. Anyone with browser access can see your content.'}
              </p>
            </div>
            <span className={`settings-badge ${pinSet ? 'on' : ''}`}>
              {pinSet ? 'Active' : 'Off'}
            </span>
          </div>

          {step === 'idle' && (
            <div className="flex flex-wrap gap-2 mt-1">
              {pinSet ? (
                <>
                  <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setStep('enter-current')}>Change PIN</button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { clearPin(); setPinSet(false); }}>Remove</button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}>Lock now</button>
                </>
              ) : (
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setStep('enter-new')}>Set a PIN</button>
              )}
            </div>
          )}

          {step === 'enter-current' && (
            <div className="space-y-2 w-full mt-1">
              <label className="block text-[11px] uppercase tracking-widest text-white/40">Current PIN</label>
              <input className="text-input w-full font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 12))} autoFocus />
              <div className="flex gap-2">
                <button className="btn-primary px-3 py-1.5 text-xs" disabled={!draft || busy} onClick={handleSet}>Continue</button>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}

          {step === 'enter-new' && (
            <div className="space-y-2 w-full mt-1">
              <label className="block text-[11px] uppercase tracking-widest text-white/40">New PIN (4–12 digits)</label>
              <input className="text-input w-full font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 12))} autoFocus />
              <div className="flex gap-2">
                <button className="btn-primary px-3 py-1.5 text-xs" disabled={!draft} onClick={() => { setPending(draft); setDraft(''); setStep('confirm'); setError(''); }}>Continue</button>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-2 w-full mt-1">
              <label className="block text-[11px] uppercase tracking-widest text-white/40">Confirm new PIN</label>
              <input className="text-input w-full font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 12))} autoFocus />
              <div className="flex gap-2">
                <button className="btn-primary px-3 py-1.5 text-xs" disabled={!draft || busy} onClick={handleConfirm}>Save</button>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>
      </CardGroup>

      <CardGroup label="Auto-Lock">
        <SettingsRow title="Auto-lock after inactivity" description="Lock the screen after a period of no input">
          <SegmentedControl
            value={settings.security?.autoLockMinutes ?? 0}
            onChange={v => update('security.autoLockMinutes', v)}
            options={[
              { value: 0, label: 'Never' },
              { value: 5, label: '5 min' },
              { value: 15, label: '15 min' },
              { value: 30, label: '30 min' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Your PIN is salted and hashed with Rust xxh3 before storage. Five wrong attempts locks for 30 seconds.
      </p>
    </div>
  );
}

/* ================================================================
   Section renderers
   ================================================================ */

function ProfileSection({ settings, update }) {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [avatar, setAvatar] = useState(() => storage.get('profile-avatar', null));

  useEffect(() => {
    const handler = () => setAvatar(storage.get('profile-avatar', null));
    window.addEventListener('lithium:avatar-changed', handler);
    return () => window.removeEventListener('lithium:avatar-changed', handler);
  }, []);

  return (
    <div>
      <CardGroup label="Profile Picture">
        <div className="settings-row">
          {avatar ? (
            <img src={avatar} alt="Profile" className="h-12 w-12 rounded-full border-2 border-white/15 object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              {settings.profile.username.charAt(0).toUpperCase() || 'U'}
            </span>
          )}
          <div className="settings-row-info">
            <div className="settings-row-title">Avatar</div>
            <div className="settings-row-desc">Set one from the Photos app (open a photo → user icon)</div>
          </div>
          {avatar && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { storage.remove('profile-avatar'); window.dispatchEvent(new Event('lithium:avatar-changed')); }}>
              Remove
            </button>
          )}
        </div>
      </CardGroup>

      <CardGroup label="Display Name">
        <div className="settings-row">
          {editingUsername ? (
            <div className="flex gap-2 w-full">
              <input
                className="text-input flex-1"
                value={usernameDraft}
                maxLength={24}
                onChange={e => setUsernameDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && usernameDraft.trim() && (update('profile.username', usernameDraft.trim()), setEditingUsername(false))}
                autoFocus
              />
              <button className="btn-primary px-3" disabled={!usernameDraft.trim()} onClick={() => { update('profile.username', usernameDraft.trim()); setEditingUsername(false); }}>
                <Icon name="Check" className="h-4 w-4" />
              </button>
              <button className="btn-ghost px-3" onClick={() => setEditingUsername(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="settings-row-info">
                <div className="settings-row-title" style={{ fontSize: 16 }}>{settings.profile.username}</div>
                <div className="settings-row-desc">This name appears in the Start menu and profile</div>
              </div>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setEditingUsername(true); setUsernameDraft(settings.profile.username); }}>
                Edit
              </button>
            </>
          )}
        </div>
      </CardGroup>
    </div>
  );
}

function AppearanceSection({ settings, update }) {
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

function DisplaySection({ settings, update }) {
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

function MotionSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Animations">
        <SettingsRow title="Animation level" description="UI motion & transitions">
          <SegmentedControl
            value={settings.motion.animations}
            onChange={v => update('motion.animations', v)}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'none', label: 'None' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Performance">
        <SettingsRow title="Low-End Mode" description="Stops animations, blur & glow for slower devices">
          <EnhancedToggle value={settings.performance.lowEndMode} onChange={v => update('performance.lowEndMode', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}

function BackgroundSection({ settings, update }) {
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

function PowerSection({ settings, update }) {
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

function NotificationsSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="General">
        <SettingsRow title="Notifications" description="Show toast notifications for events & alerts">
          <EnhancedToggle value={settings.notifications.enabled} onChange={v => update('notifications.enabled', v)} />
        </SettingsRow>
        <SettingsRow title="Notification sound" description="Play a sound when a notification arrives">
          <EnhancedToggle value={settings.notifications.sound} onChange={v => update('notifications.sound', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Display">
        <SettingsRow title="Toast duration" description="How long notifications stay on screen">
          <EnhancedSlider value={settings.notifications.duration} min={1} max={10} step={1} suffix="s" onChange={v => update('notifications.duration', v)} />
        </SettingsRow>
        <SettingsRow title="Position" description="Screen corner for notifications">
          <NotifPositionPicker value={settings.notifications.position} onChange={v => update('notifications.position', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}

function WindowSection({ settings, update }) {
  const shortcuts = [
    { keys: 'Ctrl + K', desc: 'Command palette — quick search & actions' },
    { keys: 'Alt + Tab', desc: 'Task view — switch between open windows' },
    { keys: 'Ctrl + Alt + L', desc: 'Lock the screen (requires PIN)' },
    { keys: 'Escape', desc: 'Exit game player (if enabled)' },
    { keys: 'Right-click', desc: 'Context menu on desktop & window title bars' },
  ];

  return (
    <div>
      <CardGroup label="Window Management">
        <SettingsRow title="Snap Assist" description="Show snap preview when dragging windows near screen edges">
          <EnhancedToggle value={settings.window?.snapAssist ?? false} onChange={v => update('window.snapAssist', v)} />
        </SettingsRow>
        <SettingsRow title="Translucent title bars" description="Semi-transparent window headers with backdrop blur (like Windows 11)">
          <EnhancedToggle value={settings.window?.titlebarTranslucent !== false} onChange={v => update('window.titlebarTranslucent', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Snap Layouts">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div className="settings-row-title">Drag windows to screen edges to snap</div>
            <div className="settings-row-desc">Quick layout options when Snap Assist is enabled</div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Left half', icon: 'PanelLeft' },
              { label: 'Right half', icon: 'PanelRight' },
              { label: 'Maximize', icon: 'Maximize2' },
            ].map(snap => (
              <div key={snap.label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <Icon name={snap.icon} className="h-4 w-4 text-white/40" />
                <span className="text-xs text-white/60">{snap.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardGroup>

      <CardGroup label="Keyboard Shortcuts">
        {shortcuts.map(sc => (
          <div key={sc.keys} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-desc">{sc.desc}</div>
            </div>
            <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium text-white/70">
              {sc.keys}
            </kbd>
          </div>
        ))}
      </CardGroup>
    </div>
  );
}

function GamesSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Game Player">
        <SettingsRow title="Fullscreen on launch" description="Auto-fullscreen games when opened">
          <EnhancedToggle value={settings.games.fullscreenOnLaunch} onChange={v => update('games.fullscreenOnLaunch', v)} />
        </SettingsRow>
        <SettingsRow title="ESC to close" description="Press ESC to exit the game player">
          <EnhancedToggle value={settings.games.escToClose} onChange={v => update('games.escToClose', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}

function BrowserSection({ settings, update }) {
  const [proxyUrl, setProxyUrl] = useState(settings.browser?.proxyUrl || '');

  return (
    <div>
      <CardGroup label="Search">
        <SettingsRow title="Search engine" description="Default engine for address-bar queries">
          <SegmentedControl
            value={settings.browser.searchEngine}
            onChange={v => update('browser.searchEngine', v)}
            options={Object.entries(SEARCH_ENGINES).map(([value, eng]) => ({ value, label: eng.label.split(' ')[0] }))}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Free Web Scraping">
        <SettingsRow
          title="Search provider"
          description="Scrape search results from a free engine via public CORS proxies. No Cloudflare Worker needed — trades reliability for zero setup."
        >
          <select
            className="text-input rounded-full py-1.5 text-xs"
            value={settings.browser?.scrapeProvider || ''}
            onChange={e => update('browser.scrapeProvider', e.target.value)}
          >
            <option value="">Off (address bar only)</option>
            {Object.entries(SCRAPE_PROVIDERS).map(([key, prov]) => (
              <option key={key} value={key}>{prov.label}</option>
            ))}
          </select>
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Cloudflare Proxy">
        <SettingsRow
          title="Enable proxy"
          description="Route web pages through a Cloudflare Worker to bypass iframe restrictions (CSP, X-Frame-Options). Sites that normally refuse embedding will load natively."
        >
          <EnhancedToggle
            checked={Boolean(settings.browser?.proxyEnabled)}
            onChange={v => update('browser.proxyEnabled', v)}
          />
        </SettingsRow>
        <SettingsRow
          title="Proxy URL"
          description="The deployed Worker URL (e.g. https://lithium-proxy.your-subdomain.workers.dev)"
        >
          <input
            className="text-input w-56 rounded-full py-1.5 text-xs"
            type="url"
            placeholder="https://lithium-proxy.workers.dev"
            value={proxyUrl}
            onChange={e => setProxyUrl(e.target.value)}
            onBlur={() => update('browser.proxyUrl', proxyUrl.trim())}
            spellCheck={false}
          />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}

function DataSection({ exportSettings, importSettings, exportAllData, deleteAllData }) {
  return (
    <div>
      <CardGroup label="Settings Backup">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <p className="text-[13px] text-white/50">
            Export your settings as a safety backup or import from a previous export.
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" onClick={exportSettings}>
              <Icon name="Download" className="h-3.5 w-3.5" /> Export Settings
            </button>
            <button className="btn-primary flex-1 text-xs" onClick={importSettings}>
              <Icon name="RefreshCw" className="h-3.5 w-3.5" /> Import Settings
            </button>
          </div>
        </div>
      </CardGroup>

      <CardGroup label="All Data">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Export all data</div>
            <div className="settings-row-desc">Download a full backup of all Lithium data</div>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={exportAllData}>
            <Icon name="Download" className="h-3.5 w-3.5" /> Export
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title" style={{ color: '#f87171' }}>Delete all data</div>
            <div className="settings-row-desc">Permanently remove all Lithium data from this device</div>
          </div>
          <button
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            onClick={deleteAllData}
          >
            <Icon name="Trash2" className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </CardGroup>
    </div>
  );
}

function AboutSection() {
  const features = [
    { icon: 'Monitor', text: 'Full desktop shell with taskbar, start menu, context menus & lock screen' },
    { icon: 'Folder', text: 'File Manager with virtual filesystem & OPFS-backed blob storage' },
    { icon: 'Image', text: 'Photos gallery with slideshow, zoom & drag-and-drop import' },
    { icon: 'Calendar', text: 'Calendar & Clock with monthly view, todos & reminders' },
    { icon: 'FileText', text: 'Markdown Notes editor with folder organization & live preview' },
    { icon: 'BrainCircuit', text: 'On-device AI via Wllama — GGUF models run entirely in the browser' },
    { icon: 'Gamepad2', text: 'Games library with local clones + 226 HTML games' },
    { icon: 'Music', text: 'Music player with Spotify, YouTube Music, SoundCloud & local files' },
    { icon: 'Globe', text: 'Tabbed browser with search, history & bookmarks' },
    { icon: 'Download', text: 'Downloader for web pages, GGUF models & arbitrary files' },
  ];

  return (
    <div>
      <CardGroup label="Lithium">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>
              <Icon name="Cpu" className="h-6 w-6" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="text-base font-semibold text-white">Lithium {BUILD_VERSION}</div>
              <div className="text-xs text-white/40">Offline-first web desktop</div>
            </div>
          </div>
          <p className="text-[13px] text-white/55 leading-relaxed">
            A lightweight, offline-first web desktop and workspace for games, music, browsing, files, AI, and quick tools.
            Built on <strong className="text-white/70">Preact</strong> for a tiny bundle (~72 kB gzipped).
            All data stays on this device — no trackers, no servers.
          </p>
        </div>
      </CardGroup>

      <CardGroup label="What's Inside">
        {features.map(f => (
          <div key={f.text} className="settings-row">
            <Icon name={f.icon} className="h-4 w-4 text-white/30 flex-shrink-0" />
            <div className="settings-row-info">
              <div className="text-[13px] text-white/70">{f.text}</div>
            </div>
          </div>
        ))}
      </CardGroup>

      <CardGroup label="Tech Stack">
        <div className="settings-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {[
            ['Preact', 'UI framework'],
            ['Vite 7', 'Build tool'],
            ['Tailwind CSS', 'Styling'],
            ['Wllama', 'AI inference'],
            ['Rust → WASM', 'Native core'],
            ['FastAPI', 'Backend proxy'],
            ['IndexedDB', 'Storage'],
            ['OPFS', 'Large files'],
          ].map(([tech, role]) => (
            <div key={tech} className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              <span className="text-[11px] font-medium text-white/70">{tech}</span>
              <span className="text-[10px] text-white/30">{role}</span>
            </div>
          ))}
        </div>
      </CardGroup>

      <CardGroup label="Privacy">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="text-[13px] text-white/60 leading-relaxed">
              All data (favorites, bookmarks, history, preferences, files, notes) stays in the browser&apos;s IndexedDB and localStorage.
              The service worker provides whole-site offline cache. No data is sent to external servers unless you configure API keys.
            </div>
          </div>
        </div>
      </CardGroup>

      <p className="text-[11px] text-white/25 text-center mt-4">MIT License</p>
    </div>
  );
}

/* ================================================================
   Section definitions
   ================================================================ */

const SECTIONS = [
  { id: 'profile', title: 'Profile', icon: 'User', keywords: ['profile', 'username', 'name', 'account'] },
  { id: 'appearance', title: 'Appearance', icon: 'Palette', keywords: ['theme', 'color', 'accent', 'contrast', 'dark', 'transparency'] },
  { id: 'display', title: 'Display', icon: 'Monitor', keywords: ['display', 'font', 'size', 'brightness', 'blur', 'density', 'scaling'] },
  { id: 'motion', title: 'Motion & Perf', icon: 'Sparkles', keywords: ['animation', 'motion', 'transition', 'performance', 'low end', 'speed'] },
  { id: 'background', title: 'Backgrounds', icon: 'Image', keywords: ['background', 'wallpaper', 'ambient'] },
  { id: 'power', title: 'Power & Battery', icon: 'Battery', keywords: ['battery', 'power', 'energy', 'saver', 'lock', 'auto-lock'] },
  { id: 'notifications', title: 'Notifications', icon: 'Bell', keywords: ['notification', 'toast', 'sound', 'alert'] },
  { id: 'window', title: 'Windows', icon: 'PanelRight', keywords: ['window', 'snap', 'assist', 'drag'] },
  { id: 'games', title: 'Games', icon: 'Gamepad2', keywords: ['games', 'fullscreen', 'esc', 'player'] },
  { id: 'browser', title: 'Browser', icon: 'Globe', keywords: ['browser', 'search', 'engine'] },
  { id: 'security', title: 'Security', icon: 'Shield', keywords: ['security', 'pin', 'lock', 'password'] },
  { id: 'data', title: 'Data & Backup', icon: 'Download', keywords: ['data', 'backup', 'export', 'import', 'delete', 'reset'] },
  { id: 'about', title: 'About', icon: 'Info', keywords: ['about', 'version', 'privacy', 'info'] },
];

/* ================================================================
   Main Page
   ================================================================ */

export default function Settings({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { settings, updateSetting, replaceSettings } = useSettings();
  const [activeSection, setActiveSection] = useState('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveNotification, setSaveNotification] = useState('');

  const update = useCallback((path, value) => {
    updateSetting(path, value);
    setSaveNotification('Saved');
    setTimeout(() => setSaveNotification(''), 1000);
  }, [updateSetting]);

  const exportSettings = useCallback(() => {
    const payload = { version: BUILD_VERSION, timestamp: Date.now(), settings };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lithium-settings-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    registerSavedFile(anchor.download, json);
  }, [settings]);

  const importSettings = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = readEvent => {
        try {
          const imported = JSON.parse(readEvent.target.result);
          if (!imported.settings) throw new Error('invalid file');
          const merged = { ...DEFAULT_SETTINGS };
          for (const key of Object.keys(DEFAULT_SETTINGS)) {
            merged[key] = { ...DEFAULT_SETTINGS[key], ...(imported.settings[key] || {}) };
          }
          replaceSettings(merged);
          setSaveNotification('Settings imported');
          setTimeout(() => setSaveNotification(''), 1800);
        } catch {
          alert('Invalid settings file. Please check the file and try again.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [replaceSettings]);

  const exportAllData = useCallback(() => {
    const dump = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key.startsWith('lithium:')) dump[key] = localStorage.getItem(key);
    }
    const json = JSON.stringify(dump, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lithium-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    registerSavedFile(anchor.download, json);
  }, []);

  const deleteAllData = useCallback(() => {
    if (!window.confirm('Delete ALL Lithium data? This cannot be undone.')) return;
    Object.keys(localStorage)
      .filter(key => key.startsWith('lithium:'))
      .forEach(key => localStorage.removeItem(key));
    window.location.reload();
  }, []);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const query = searchQuery.toLowerCase();
    return SECTIONS.filter(s => s.title.toLowerCase().includes(query) || s.keywords?.some(k => k.includes(query)));
  }, [searchQuery]);

  const currentSection = filteredSections.find(s => s.id === activeSection) || filteredSections[0];

  // Auto-select first match when searching
  useEffect(() => {
    if (searchQuery.trim() && filteredSections.length > 0 && !filteredSections.find(s => s.id === activeSection)) {
      setActiveSection(filteredSections[0].id);
    }
  }, [filteredSections, searchQuery, activeSection]);

  const renderSection = () => {
    switch (currentSection?.id) {
      case 'profile': return <ProfileSection settings={settings} update={update} />;
      case 'appearance': return <AppearanceSection settings={settings} update={update} />;
      case 'display': return <DisplaySection settings={settings} update={update} />;
      case 'motion': return <MotionSection settings={settings} update={update} />;
      case 'background': return <BackgroundSection settings={settings} update={update} />;
      case 'power': return <PowerSection settings={settings} update={update} />;
      case 'notifications': return <NotificationsSection settings={settings} update={update} />;
      case 'window': return <WindowSection settings={settings} update={update} />;
      case 'games': return <GamesSection settings={settings} update={update} />;
      case 'browser': return <BrowserSection settings={settings} update={update} />;
      case 'security': return <SecuritySection settings={settings} update={update} />;
      case 'data': return <DataSection exportSettings={exportSettings} importSettings={importSettings} exportAllData={exportAllData} deleteAllData={deleteAllData} />;
      case 'about': return <AboutSection />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0f1117]">
      {/* Top bar: search + window controls */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="relative flex-1 max-w-xs">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            className="text-input py-1.5 pl-9 text-xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
          />
        </div>
        <span className="hidden font-mono text-[10px] text-white/25 sm:block">{BUILD_VERSION}</span>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Saved toast */}
      {saveNotification && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
          <Icon name="Check" className="h-4 w-4" /> {saveNotification}
        </div>
      )}

      {/* Shell: sidebar + content */}
      <div className="settings-shell flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="settings-sidebar">
          {filteredSections.map(section => (
            <button
              key={section.id}
              className={`settings-nav-item ${currentSection?.id === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings-nav-icon">
                <Icon name={section.icon} className="h-4 w-4" />
              </span>
              <span>{section.title}</span>
            </button>
          ))}
          {filteredSections.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-white/30">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </nav>

        {/* Content */}
        <main className="settings-content">
          <div className="settings-section-header">
            <h2>{currentSection?.title}</h2>
            <p>{getSectionDescription(currentSection?.id)}</p>
          </div>
          {renderSection()}
        </main>
      </div>
    </div>
  );
}

function getSectionDescription(id) {
  const descriptions = {
    profile: 'Manage your account name and avatar',
    appearance: 'Customize colors, contrast, and visual style',
    display: 'Adjust text size, brightness, and layout density',
    motion: 'Control animations and performance settings',
    background: 'Configure desktop wallpaper and ambient effects',
    power: 'Battery saver, auto-dim & power management',
    notifications: 'Toast position, duration, and sound preferences',
    window: 'Window snapping, keyboard shortcuts & title bar style',
    games: 'Fullscreen and ESC behavior for the game player',
    browser: 'Search engine and browsing preferences',
    security: 'Lock-screen PIN, auto-lock & security options',
    data: 'Export, import, or delete your settings and data',
    about: 'Version info, features, tech stack & privacy',
  };
  return descriptions[id] || '';
}
