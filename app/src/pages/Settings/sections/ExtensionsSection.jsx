import { useState, useEffect, useCallback } from 'react';
import Icon from '../../../Components/Icon';
import { SettingsRow, EnhancedToggle } from '../controls';
import {
  discoverExtensions,
  reloadExtension,
  isLoaded,
  getRegistry,
  enableExtension,
  disableExtension,
  uninstallExtension,
} from '../../../lib/extensions/extManager';
import { PERMISSION_DESCRIPTIONS } from '../../../lib/extensions/extParser';
import {
  getExposedApis,
  listGrants,
  revokeGrant,
} from '../../../lib/extensions/extSecurity';

/* ------------------------------------------------------------------ */
/*  Permission approval modal                                          */
/* ------------------------------------------------------------------ */

function PermissionModal({ manifest, onApprove, onCancel }) {
  const [granted, setGranted] = useState(() => new Set(manifest.permissions));

  const toggle = perm => {
    setGranted(prev => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl" style={{ background: 'hsl(var(--card, 222 20% 12%))', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="mb-1 flex items-center gap-2">
          <span style={{ color: 'var(--accent)' }}><Icon name="ShieldCheck" size={18} /></span>
          <h3 className="text-sm font-semibold text-white">Approve permissions</h3>
        </div>
        <p className="mb-4 text-xs text-white/50">
          <span className="font-medium text-white/70">{manifest.name}</span> v{manifest.version} is requesting access to the following. Toggle each permission you allow.
        </p>

        <div className="mb-4 max-h-72 space-y-1 overflow-y-auto pr-1">
          {manifest.permissions.map(perm => (
            <label
              key={perm}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-xs transition-colors"
              style={{ background: granted.has(perm) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'rgba(255,255,255,0.02)' }}
            >
              <input
                type="checkbox"
                checked={granted.has(perm)}
                onChange={() => toggle(perm)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-mono text-[11px] text-white/80">{perm}</span>
                <span className="block text-white/45">{PERMISSION_DESCRIPTIONS[perm] || ''}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={() => onApprove([...granted])}
            className="rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Enable extension
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single extension card                                              */
/* ------------------------------------------------------------------ */

function ExtensionCard({ manifest, registryEntry, onRequestEnable, onDisable, onReload, onUninstall, loaded }) {
  const enabled = registryEntry?.enabled ?? false;
  const approvedCount = registryEntry?.approvedPermissions?.length ?? 0;
  const requestedCount = manifest.permissions.length;

  return (
    <div className="settings-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg p-2" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <Icon name={manifest.icon || 'Puzzle'} size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{manifest.name}</span>
              <span className="font-mono text-[10px] text-white/30">v{manifest.version}</span>
            </div>
            {manifest.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{manifest.description}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/35">
              <span>by {manifest.author}</span>
              <span>{approvedCount}/{requestedCount} permissions</span>
              {manifest.settingsPages?.length > 0 && (
                <span>{manifest.settingsPages.length} settings page{manifest.settingsPages.length > 1 ? 's' : ''}</span>
              )}
              {loaded && <span style={{ color: 'var(--accent)' }}>● loaded</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {enabled && (
            <>
              <button
                title="Reload"
                onClick={onReload}
                className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
              >
                <Icon name="RefreshCw" size={14} />
              </button>
              <button
                title="Uninstall"
                onClick={onUninstall}
                className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Icon name="Trash2" size={14} />
              </button>
            </>
          )}
          <EnhancedToggle
            value={enabled}
            onChange={v => (v ? onRequestEnable() : onDisable())}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export default function ExtensionsSection() {
  const [items, setItems] = useState([]);
  const [registry, setRegistry] = useState(() => getRegistry());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null); // manifest awaiting approval
  const [error, setError] = useState('');
  const [exposedApis, setExposedApis] = useState([]);
  const [grants, setGrants] = useState([]);

  // Pull the latest cross-boundary security state from extSecurity.
  const refreshSecurity = useCallback(() => {
    setExposedApis(getExposedApis());
    setGrants(listGrants());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const found = await discoverExtensions(true);
      setItems(found);
      setRegistry(getRegistry());
    } catch (err) {
      setError(err.message || 'Failed to discover extensions');
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-render when registry mutates
  useEffect(() => {
    const handler = () => setRegistry(getRegistry());
    window.addEventListener('lithium:extensions-changed', handler);
    return () => window.removeEventListener('lithium:extensions-changed', handler);
  }, []);

  // Keep the API/grants panel live when extensions register endpoints or the
  // user approves/denies app access via the grant popup.
  useEffect(() => {
    refreshSecurity();
    const onRegistry = () => refreshSecurity();
    window.addEventListener('lithium:ext-api-registry-changed', onRegistry);
    window.addEventListener('lithium:ext-grants-changed', onRegistry);
    return () => {
      window.removeEventListener('lithium:ext-api-registry-changed', onRegistry);
      window.removeEventListener('lithium:ext-grants-changed', onRegistry);
    };
  }, [refreshSecurity]);

  const entryFor = id => registry.extensions.find(e => e.id === id) || null;

  const handleApprove = async perms => {
    const m = pending;
    setPending(null);
    if (!m) return;
    try {
      await enableExtension(m.id, perms);
      setRegistry(getRegistry());
    } catch (err) {
      setError(`Failed to enable "${m.name}": ${err.message}`);
    }
  };

  const handleDisable = async id => {
    disableExtension(id);
    setRegistry(getRegistry());
  };

  const handleReload = async id => {
    try { await reloadExtension(id); } catch { /* surfaced next refresh */ }
    refresh();
  };

  const handleUninstall = async id => {
    if (!window.confirm('Uninstall this extension? Its data and permissions will be removed.')) return;
    uninstallExtension(id);
    refresh();
  };

  const handleRevoke = (appId, extId) => {
    revokeGrant(appId, extId);
    refreshSecurity();
  };

  return (
    <div>
      <div className="settings-card">
        <div className="settings-card-title">Extensions</div>
        <p className="mb-3 text-xs text-white/50">
          Extensions run with deep access to Lithium. They load from the local
          <code className="mx-1 rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-white/60">extensions/</code>
          folder. Review each extension&apos;s permissions before enabling it.
        </p>
        <SettingsRow title="Rescan folder" description="Re-check the extensions/ directory for new or removed extensions">
          <button
            onClick={refresh}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Rescan
          </button>
        </SettingsRow>
      </div>

      {error && (
        <div className="settings-card" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Icon name="AlertTriangle" size={14} /> {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-2 py-8 text-center text-xs text-white/30">Scanning extensions/…</div>
      ) : items.length === 0 ? (
        <div className="px-2 py-10 text-center text-xs text-white/30">
          No extensions found. Add a folder under
          <code className="mx-1 rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-white/50">extensions/</code>
          with an <code className="mx-1 rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-white/50">extension.json</code> manifest.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(({ manifest }) => (
            <ExtensionCard
              key={manifest.id}
              manifest={manifest}
              registryEntry={entryFor(manifest.id)}
              loaded={isLoaded(manifest.id)}
              onRequestEnable={() => setPending(manifest)}
              onDisable={() => handleDisable(manifest.id)}
              onReload={() => handleReload(manifest.id)}
              onUninstall={() => handleUninstall(manifest.id)}
            />
          ))}
        </div>
      )}

      {pending && (
        <PermissionModal
          manifest={pending}
          onApprove={handleApprove}
          onCancel={() => setPending(null)}
        />
      )}

      <ExtensionApiPanel
        exposedApis={exposedApis}
        grants={grants}
        onRevoke={handleRevoke}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cross-boundary API & grants panel (extSecurity)                    */
/* ------------------------------------------------------------------ */

function ExtensionApiPanel({ exposedApis, grants, onRevoke }) {
  if (exposedApis.length === 0 && grants.length === 0) return null;

  // Group exposed endpoints by owning extension id.
  const byExt = new Map();
  for (const api of exposedApis) {
    if (!byExt.has(api.extId)) byExt.set(api.extId, []);
    byExt.get(api.extId).push(api);
  }

  return (
    <div className="settings-card mt-2">
      <div className="settings-card-title">Extension APIs &amp; app access</div>
      <p className="mb-3 text-xs text-white/50">
        APIs that extensions expose to .li apps, and the per-app access grants
        you have approved. Apps can only call an endpoint after you allow it.
      </p>

      {byExt.size > 0 && (
        <div className="mb-3 space-y-2">
          {[...byExt.entries()].map(([extId, apis]) => (
            <div key={extId}>
              <div className="mb-1 font-mono text-[10px] text-white/40">{extId}</div>
              {apis.map(api => (
                <div key={`${api.extId}/${api.name}`} className="flex items-start gap-2 px-2 py-1 text-xs">
                  <span className="font-mono text-white/80">{api.name}()</span>
                  {api.description && <span className="min-w-0 flex-1 truncate text-white/40">{api.description}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {grants.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-white/60">Approved app access</div>
          {grants.map(g => (
            <div
              key={`${g.appId}|${g.extId}`}
              className="flex items-center gap-2 px-2 py-1.5 text-xs"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="font-mono text-white/80">{g.appId}</span>
              <span className="text-white/30">→</span>
              <span className="font-mono text-white/80">{g.extId}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                {g.methods.includes('*') ? 'all methods' : g.methods.join(', ')}
              </span>
              <button
                title="Revoke all access for this app"
                onClick={() => onRevoke(g.appId, g.extId)}
                className="ml-auto rounded-md p-1 text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Icon name="X" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
