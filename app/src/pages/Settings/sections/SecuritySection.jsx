import { useState } from 'react';
import { clearPin, hasPin, setPin, verifyPin } from '../../../lib/desktop/ui';
import Icon from '../../../Components/Icon';
import { CardGroup, SettingsRow, SegmentedControl } from '../controls';

export default function SecuritySection({ settings, update }) {
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
