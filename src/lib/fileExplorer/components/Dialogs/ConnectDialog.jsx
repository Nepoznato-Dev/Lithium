/**
 * Connect cloud drive dialog — extracted from the monolith's ConnectDialog.
 */
import { useState } from 'react';
import Icon from '../../../../Components/Icon';
import { PROVIDERS, testConnection, nextDriveLetter } from '../../../cloudDrives.js';

export default function ConnectDialog({ configs, reconnectConfig, onAdd, onUpdate, onRemove, onClose }) {
  const [target, setTarget] = useState(reconnectConfig || null);
  const [provider, setProvider] = useState(reconnectConfig?.provider || 'gdrive');
  const [label, setLabel] = useState(reconnectConfig?.label || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startReconnect = config => {
    setTarget(config);
    setProvider(config.provider);
    setLabel(config.label);
    setToken('');
    setError('');
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const config = target
        ? { ...target, token: token.trim(), label: label.trim() || target.label }
        : {
            id: `cloud-${Date.now()}`,
            provider,
            label: label.trim() || (provider === 'gdrive' ? 'GDrive' : 'OneDrive - Personal'),
            token: token.trim(),
            letter: nextDriveLetter(configs),
          };
      await testConnection(config);
      if (target) onUpdate(config);
      else onAdd(config);
      setToken('');
      setLabel('');
      onClose();
    } catch (err) {
      setError(err.auth ? 'That token was rejected — paste a fresh access token.' : err.message || 'Connection failed. Check your access token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon name="Cloud" size={16} className="text-cyan-300" /> {target ? `Update token — ${target.label}` : 'Connect cloud storage'}
          </h3>
          <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close">
            <Icon name="X" size={14} />
          </button>
        </div>

        {configs.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {configs.map(config => (
              <div key={config.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-white/80">
                <Icon name="Cloud" size={14} style={{ color: PROVIDERS[config.provider]?.color }} />
                <span className="flex-1 truncate">{config.label} ({config.letter}:)</span>
                <button className="icon-btn h-6 w-6" onClick={() => startReconnect(config)} title="Update access token">
                  <Icon name="RefreshCw" size={12} />
                </button>
                <button className="icon-btn h-6 w-6 hover:bg-red-500/15 hover:text-red-300" onClick={() => onRemove(config.id)} title="Disconnect">
                  <Icon name="X" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {!target && (
            <div className="flex gap-2">
              {Object.entries(PROVIDERS).map(([id, meta]) => (
                <button
                  key={id}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    provider === id ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
                  }`}
                  onClick={() => setProvider(id)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          )}
          {target && (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
              Access tokens expire (usually after ~1 hour). Paste a fresh token for {PROVIDERS[target.provider]?.label} to remount {target.label} ({target.letter}:).
            </p>
          )}
          <input className="text-input py-2 text-xs" placeholder="Drive label (e.g. GDrive)" value={label} onChange={event => setLabel(event.target.value)} />
          <textarea
            className="text-input min-h-[70px] resize-none py-2 font-mono text-[11px]"
            placeholder="Paste an OAuth access token…"
            value={token}
            onChange={event => setToken(event.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-white/35">
            Get a token from the {provider === 'gdrive' ? 'Google OAuth playground (drive scope)' : 'Microsoft Graph / Azure token issuer'} (e.g. <span className="font-mono">gcloud auth print-access-token</span> or the Graph Explorer). The drive is mounted as the next free letter and stored locally only.
          </p>
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          <button className="btn-primary w-full py-2 text-xs" disabled={!token.trim() || busy} onClick={connect}>
            {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Cloud" size={14} />} {busy ? 'Testing connection…' : target ? 'Update token' : 'Connect drive'}
          </button>
        </div>
      </div>
    </div>
  );
}
