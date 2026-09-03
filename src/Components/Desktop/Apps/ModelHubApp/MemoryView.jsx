import { useState, useEffect, useMemo } from 'react';
import { deleteMemory, loadMemory, writeMemory } from '../../../../lib/ai/agent';
import { backendHealth, backendMemorySync, backendUrl } from '../../../../lib/backendApi';
import Icon from '../../../Icon';

export default function MemoryView({ onCtxMenu }) {
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [backend, setBackend] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener('lithium:memory-changed', bump);
    window.addEventListener('lithium:kv-ready', bump);
    backendHealth().then(setBackend);
    return () => { window.removeEventListener('lithium:memory-changed', bump); window.removeEventListener('lithium:kv-ready', bump); };
  }, []);

  const syncBackend = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const merged = await backendMemorySync(loadMemory());
      const local = loadMemory();
      Object.entries(merged).forEach(([k, e]) => { if (!local[k] || (e.updatedAt || 0) > (local[k].updatedAt || 0)) writeMemory(k, e.value); });
      setSyncMsg(`✓ Synced — ${Object.keys(merged).length} memories`);
    } catch (err) { setSyncMsg(`✗ ${err.message}`); }
    finally { setSyncing(false); }
  };

  const entries = useMemo(() => Object.entries(loadMemory()).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)), [version]);
  const add = () => { if (!draftKey.trim()) return; writeMemory(draftKey, draftValue); setDraftKey(''); setDraftValue(''); setAdding(false); };

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs text-[#72808a]">Workspace / Memory</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f4f2]">Persistent memory</h1><p className="mt-1 text-sm text-[#808c95]">Shared by every brain — local models, cloud providers, and widgets.</p></div>
        <button className="shrink-0 rounded-lg bg-[#c3f5d9] px-3 py-1.5 text-xs font-medium text-[#102119]" onClick={() => setAdding(v => !v)}><Icon name="Plus" size={12} /> Add memory</button>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#10151b] px-4 py-3 text-[11px]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: backend?.ok ? '#10b981' : '#6b7280' }} />
        <span className="text-white/55">{backend?.ok ? <>Backend online — {backend.memories} memories</> : <>Backend offline (<span className="font-mono">{backendUrl()}</span>)</>}</span>
        <button className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40" disabled={!backend?.ok || syncing} onClick={syncBackend}>
          {syncing ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Database" size={12} />} {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>
      {syncMsg && <p className={`text-[11px] ${syncMsg.startsWith('✓') ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{syncMsg}</p>}
      {adding && (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#10151b] p-4">
          <input className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/30" placeholder="key (e.g. favorite-color)" value={draftKey} onChange={e => setDraftKey(e.target.value)} />
          <textarea className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/30" placeholder="value" value={draftValue} onChange={e => setDraftValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => setAdding(false)}>Cancel</button>
            <button className="rounded-lg bg-[#c3f5d9] px-4 py-1.5 text-xs font-medium text-[#102119] disabled:opacity-40" disabled={!draftKey.trim()} onClick={add}>Save</button>
          </div>
        </div>
      )}
      {entries.length === 0 && !adding && <p className="text-xs text-white/30">No memories yet. Use Device control in the Playground to let the assistant manage memories.</p>}
      <div className="space-y-2">
        {entries.map(([key, entry]) => (
          <div key={key} className="rounded-xl border border-white/[0.08] bg-[#10151b] px-4 py-3" onContextMenu={event => onCtxMenu?.(event, [
            { id: 'key', type: 'heading', label: key },
            { id: 'edit', label: 'Edit', icon: 'Pencil', action: () => { setEditingKey(key); setEditValue(entry.value); } },
            { id: 'copy-key', label: 'Copy key', icon: 'Copy', action: () => navigator.clipboard?.writeText(key) },
            { id: 'copy-val', label: 'Copy value', icon: 'Copy', action: () => navigator.clipboard?.writeText(entry.value) },
            { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => deleteMemory(key) },
          ])}>
            <div className="flex items-center gap-2">
              <Icon name="Database" size={13} className="shrink-0 text-[#b9e9ca]" />
              <span className="font-mono text-xs font-medium text-white">{key}</span>
              <span className="ml-auto shrink-0 text-[10px] text-white/25">{new Date(entry.updatedAt || 0).toLocaleString()}</span>
              {editingKey !== key && (
                <>
                  <button className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white" onClick={() => { setEditingKey(key); setEditValue(entry.value); }}><Icon name="Pencil" size={12} /></button>
                  <button className="rounded p-1 text-white/45 hover:bg-red-500/15 hover:text-red-300" onClick={() => deleteMemory(key)}><Icon name="Trash2" size={12} /></button>
                </>
              )}
            </div>
            {editingKey === key ? (
              <div className="mt-2 space-y-2">
                <textarea className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/80 outline-none" value={editValue} onChange={e => setEditValue(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg px-3 py-1 text-xs text-white/60 hover:bg-white/10" onClick={() => setEditingKey(null)}>Cancel</button>
                  <button className="rounded-lg bg-[#c3f5d9] px-3 py-1 text-xs font-medium text-[#102119]" onClick={() => { writeMemory(key, editValue); setEditingKey(null); }}>Save</button>
                </div>
              </div>
            ) : <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">{entry.value}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
