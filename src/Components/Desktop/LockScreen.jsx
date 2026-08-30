import React, { useEffect, useMemo, useState } from 'react';

import { verifyPin } from '../../lib/desktop/ui';
import { useSettings } from '../SettingsContext';
import Icon from '../Icon';

/** Full-screen lock overlay. Mounts on top of everything until the correct
 *  PIN (or a no-PIN unlock, if the user hasn't set one) is entered. */
export default function LockScreen({ onUnlock }) {
  const { settings } = useSettings();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = useMemo(() => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [now]);
  const date = useMemo(() => now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), [now]);

  const append = digit => {
    if (busy) return;
    if (pin.length >= 12) return;
    setError('');
    setPin(value => value + String(digit));
  };

  const backspace = () => {
    if (busy) return;
    setError('');
    setPin(value => value.slice(0, -1));
  };

  const submit = async () => {
    if (busy) return;
    if (!pin) return;
    setBusy(true);
    setError('');
    const result = await verifyPin(pin);
    setBusy(false);
    if (result.ok) {
      setPin('');
      onUnlock();
      return;
    }
    if (result.reason === 'locked') {
      setError(`Too many attempts. Try again in ${result.retryIn}s.`);
      setPin('');
    } else {
      setError(`Wrong PIN${result.retryIn ? ` — locked for ${result.retryIn}s` : ''}`);
      setPin('');
    }
  };

  // Submit automatically when the PIN reaches 4+ digits and Enter is pressed,
  // or when the user clicks the Unlock button.
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Backspace') { event.preventDefault(); backspace(); }
      else if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (/^\d$/.test(event.key)) append(event.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bind so closures stay fresh

  const avatar = settings?.profile?.avatar;
  const accent = settings?.accent || '#22d3ee';

  return (
    <div
      role="dialog"
      aria-label="Locked"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30000,
        background: 'linear-gradient(135deg, #050510 0%, #0a0a18 50%, #050505 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12vh 24px 6vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, marginTop: '2vh' }}>
        <div
          aria-hidden
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: avatar ? `url(${avatar}) center/cover` : `linear-gradient(135deg, ${accent} 0%, #6366f1 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            fontWeight: 700,
            fontSize: 32,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          }}
        >
          {!avatar && <Icon name="Lock" size={32} color="#000" strokeWidth={2.5} />}
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 56, fontWeight: 200, letterSpacing: -1, lineHeight: 1, margin: 0 }}>{time}</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{date}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%', maxWidth: 320 }}>
        <div
          style={{
            display: 'flex',
            gap: 14,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="PIN entry"
        >
          {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
            <span
              key={index}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: index < pin.length ? accent : 'transparent',
                border: `1.5px solid ${index < pin.length ? accent : 'rgba(255,255,255,0.35)'}`,
                transition: 'background 120ms',
              }}
            />
          ))}
        </div>

        {error && <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
            <PinButton key={digit} onPress={() => append(digit)} disabled={busy}>{digit}</PinButton>
          ))}
          <PinButton onPress={backspace} disabled={busy} ariaLabel="Backspace"><Icon name="Delete" size={18} /></PinButton>
          <PinButton onPress={() => append('0')} disabled={busy}>0</PinButton>
          <PinButton onPress={submit} disabled={busy} primary>Unlock</PinButton>
        </div>

        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Type your PIN, or press Enter. Remove the PIN in Settings → Security to skip this screen.
        </p>
      </div>
    </div>
  );
}

function PinButton({ children, onPress, disabled, primary, ariaLabel }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        height: 64,
        borderRadius: 16,
        border: 'none',
        background: primary ? 'var(--accent, #22d3ee)' : pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
        color: primary ? '#000' : '#fff',
        fontSize: primary ? 14 : 24,
        fontWeight: primary ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 80ms, transform 60ms',
        transform: pressed && !disabled ? 'scale(0.97)' : 'scale(1)',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </button>
  );
}
