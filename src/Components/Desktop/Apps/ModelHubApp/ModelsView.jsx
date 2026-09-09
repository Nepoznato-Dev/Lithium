import { useState, useEffect, useRef } from 'react';
import { addCustomModel, allModels, deleteModel, downloadModel, getModel, hfResolveUrl, importLocalGguf, listHfDir, loadModelMeta, parseHfUrl, removeCustomModel } from '../../../../lib/ai/models';
import { formatBytes } from '../../../../lib/storage/manager';
import Icon from '../../../Icon';
import LocalServerModels from './LocalServerModels';

function friendlyDownloadError(err) {
  const m = err?.message || String(err);
  if (m === 'Failed to fetch' || m.includes('NetworkError') || m.includes('CORS')) return 'Could not fetch that URL — paste a Hugging Face repo link or a direct …/resolve/main/file.gguf link.';
  return m;
}

export default function ModelsView({ onCtxMenu, onOpenConnections }) {
  const [meta, setMeta] = useState(loadModelMeta);
  const [progress, setProgress] = useState({});
  const [errors, setErrors] = useState({});
  const [addingCustom, setAddingCustom] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [hfNav, setHfNav] = useState(null);
  const [importing, setImporting] = useState(false);
  const importInput = useRef(null);
  const aborters = useRef({});

  useEffect(() => {
    const sync = () => setMeta(loadModelMeta());
    window.addEventListener('lithium:models-changed', sync);
    return () => window.removeEventListener('lithium:models-changed', sync);
  }, []);

  const start = async id => {
    setErrors(prev => ({ ...prev, [id]: '' }));
    const ctrl = new AbortController();
    aborters.current[id] = ctrl;
    setProgress(prev => ({ ...prev, [id]: { received: 0, total: getModel(id)?.size || 0 } }));
    try {
      await downloadModel(id, { signal: ctrl.signal, onProgress: u => setProgress(prev => ({ ...prev, [id]: u })) });
    } catch (err) { setErrors(prev => ({ ...prev, [id]: err.name === 'AbortError' ? 'Cancelled' : friendlyDownloadError(err) })); }
    finally { delete aborters.current[id]; setProgress(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const saveCustom = async () => {
    if (!draftUrl.trim()) return;
    setErrors(prev => ({ ...prev, custom: '' }));
    const parsed = parseHfUrl(draftUrl.trim());
    if (parsed) { navigateHf(parsed.repoId, parsed.path); return; }
    try { addCustomModel({ name: draftName.trim() || draftUrl.trim().split('/').pop(), url: draftUrl.trim() }); setDraftName(''); setDraftUrl(''); setAddingCustom(false); }
    catch (err) { setErrors(prev => ({ ...prev, custom: err.message })); }
  };

  const navigateHf = async (repo, path) => {
    setHfNav({ repo, path, entries: null });
    try { const entries = await listHfDir(repo, path); setHfNav({ repo, path, entries }); }
    catch (err) { setHfNav(null); setErrors(prev => ({ ...prev, custom: err.message })); }
  };

  const pickHfFile = entry => {
    try {
      addCustomModel({ name: draftName.trim() || entry.name.replace(/\.gguf$/i, ''), url: hfResolveUrl(hfNav.repo, entry.path), size: entry.size, blurb: `From huggingface.co/${hfNav.repo}` });
      setHfNav(null); setDraftName(''); setDraftUrl(''); setAddingCustom(false);
    } catch (err) { setErrors(prev => ({ ...prev, custom: err.message })); }
  };

  const importFile = async file => {
    setImporting(true); setErrors(prev => ({ ...prev, custom: '' }));
    try { await importLocalGguf(file); } catch (err) { setErrors(prev => ({ ...prev, custom: err.message })); }
    finally { setImporting(false); }
  };

  const removeModel = model => {
    if (model.custom) { if (window.confirm(`Remove "${model.name}"?`)) removeCustomModel(model.id); }
    else deleteModel(model.id);
  };

  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-white p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><h1 className="text-base font-semibold text-[#2d2d2d]">Model library</h1><p className="mt-1 text-xs text-[#9e9890]">Download, manage and run GGUF models locally in the browser.</p></div><button onClick={onOpenConnections} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-[#4a9e6d] hover:bg-[#eef7f1]" style={{ borderColor: '#8cc5a2' }}><Icon name="KeyRound" size={13} /> API keys</button></div>
      <LocalServerModels />
      <div className="rounded-xl border bg-white p-6" style={{ borderColor: '#e8e4dd' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#2d2d2d]">Your own models</span>
          <span className="text-[10px] text-[#9e9890]">IndexedDB + wllama — no server needed</span>
          <span className="ml-auto flex items-center gap-2">
            <input ref={importInput} type="file" accept=".gguf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            <button className="rounded-lg border px-3 py-1.5 text-xs text-[#6b6560] hover:bg-[#faf8f5] disabled:opacity-40 transition-colors" style={{ borderColor: '#e8e4dd' }} disabled={importing} onClick={() => importInput.current?.click()}>
              {importing ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Upload" size={12} />} {importing ? 'Importing…' : 'Import GGUF'}
            </button>
            <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90" style={{ background: '#4a9e6d' }} onClick={() => setAddingCustom(v => !v)}><Icon name="Plus" size={12} /> Add by URL</button>
          </span>
        </div>
        {addingCustom && !hfNav && (
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-lg border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Model name (optional)" value={draftName} onChange={e => setDraftName(e.target.value)} />
            <input className="w-full rounded-lg border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Hugging Face repo link or direct GGUF URL" value={draftUrl} onChange={e => setDraftUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCustom(); }} />
            <div className="flex justify-end gap-2">
              <button className="rounded-lg px-3 py-1.5 text-xs text-[#9e9890] hover:bg-[#faf8f5]" onClick={() => setAddingCustom(false)}>Cancel</button>
              <button className="rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40" style={{ background: '#4a9e6d' }} disabled={!draftUrl.trim()} onClick={saveCustom}>Continue</button>
            </div>
          </div>
        )}
        {addingCustom && hfNav && (
          <div className="mt-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#6b6560]">
              <Icon name="Folder" size={12} className="shrink-0 text-amber-500" />
              <button className="font-mono text-[#4a9e6d] hover:underline" onClick={() => navigateHf(hfNav.repo, '')}>{hfNav.repo}</button>
              {hfNav.path.split('/').filter(Boolean).map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-1"><span className="text-[#9e9890]/50">/</span><button className="font-mono text-[#4a9e6d] hover:underline" onClick={() => navigateHf(hfNav.repo, arr.slice(0, i + 1).join('/'))}>{seg}</button></span>
              ))}
              <button className="ml-auto rounded px-2 py-1 text-[11px] text-[#6b6560] hover:bg-[#faf8f5]" onClick={() => setHfNav(null)}>Close</button>
            </div>
            {hfNav.entries === null ? <p className="flex items-center gap-2 text-[11px] text-[#9e9890]"><Icon name="Loader2" size={12} className="animate-spin" /> Loading…</p>
            : hfNav.entries.map(entry => {
              if (entry.type === 'directory') return (
                <button key={entry.path} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left hover:bg-[#faf8f5]" style={{ borderColor: '#e8e4dd', background: '#faf8f5' }} onClick={() => navigateHf(hfNav.repo, entry.path)}>
                  <Icon name="Folder" size={12} className="shrink-0 text-amber-500" /><span className="truncate font-mono text-[11px] text-[#2d2d2d]">{entry.name}</span><span className="ml-auto text-[#9e9890]/50">›</span>
                </button>
              );
              if (entry.name.toLowerCase().endsWith('.gguf')) return (
                <button key={entry.path} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left hover:border-[#8cc5a2] hover:bg-[#f5fbf7]" style={{ borderColor: '#e8e4dd', background: '#faf8f5' }} onClick={() => pickHfFile(entry)}>
                  <Icon name="Download" size={12} className="shrink-0 text-[#4a9e6d]" /><span className="truncate font-mono text-[11px] text-[#2d2d2d]">{entry.name}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-[#9e9890]">{entry.size ? `~${formatBytes(entry.size)}` : ''}</span>
                </button>
              );
              return (
                <div key={entry.path} className="flex items-center gap-2 px-3 py-1 opacity-40">
                  <Icon name="FileText" size={12} className="shrink-0" /><span className="truncate font-mono text-[11px] text-[#6b6560]">{entry.name}</span>
                </div>
              );
            })}
          </div>
        )}
        {errors.custom && <p className="mt-2 text-[11px] text-red-500">{errors.custom}</p>}
      </div>
      {allModels().map(model => {
        const state = meta[model.id];
        const dl = progress[model.id];
        const pct = dl && dl.total ? Math.min(100, (dl.received / dl.total) * 100) : 0;
        return (
          <div key={model.id} className="rounded-xl border bg-white p-6" style={{ borderColor: '#e8e4dd' }} onContextMenu={event => onCtxMenu?.(event, [
            { id: 'name', type: 'heading', label: model.name },
            ...(state?.downloaded ? [
              { id: 'delete', label: 'Delete model', icon: 'Trash2', danger: true, action: () => removeModel(model) },
            ] : model.url ? [
              { id: 'download', label: 'Download', icon: 'Download', disabled: !!dl, action: () => start(model.id) },
            ] : []),
            { id: 'copy-info', label: 'Copy model info', icon: 'Copy', action: () => navigator.clipboard?.writeText(`${model.name} | ${model.params} | ${model.quant} | ${model.blurb}`) },
            ...(dl ? [{ id: 'cancel', label: 'Cancel download', icon: 'X', action: () => aborters.current[model.id]?.abort() }] : []),
          ])}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4a9e6d]" style={{ background: '#eef7f1' }}><Icon name="BrainCircuit" size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-[#2d2d2d]">
                  {model.name}
                  <span className="rounded-lg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#4a9e6d]" style={{ background: '#eef7f1' }}>{model.tier}</span>
                  <span className="rounded-lg bg-[#eae6df] px-1.5 py-0.5 text-[10px] text-[#9e9890]">{model.quant}</span>
                  <span className="rounded-lg bg-[#eae6df] px-1.5 py-0.5 text-[10px] text-[#9e9890]">{model.params}</span>
                  {model.custom && <span className="rounded-lg px-1.5 py-0.5 text-[10px] text-violet-600" style={{ background: '#f3eefe' }}>yours</span>}
                </div>
                <p className="truncate text-xs text-[#9e9890]">{model.blurb}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-[#9e9890]">{model.size ? `~${formatBytes(model.size)}` : ''}</span>
              {state?.downloaded ? (
                <button className="rounded-lg border px-3 py-1.5 text-xs text-[#6b6560] hover:bg-red-500/10 hover:text-red-500 transition-colors" style={{ borderColor: '#e8e4dd' }} onClick={() => removeModel(model)}><Icon name="Trash2" size={13} /> Delete</button>
              ) : dl ? (
                <button className="rounded-lg border px-3 py-1.5 text-xs text-[#6b6560] hover:bg-[#faf8f5] transition-colors" style={{ borderColor: '#e8e4dd' }} onClick={() => aborters.current[model.id]?.abort()}><Icon name="X" size={13} /> Cancel</button>
              ) : model.url ? (
                <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90" style={{ background: '#4a9e6d' }} onClick={() => start(model.id)}><Icon name="Download" size={13} /> Download</button>
              ) : (
                <button className="rounded-lg border px-3 py-1.5 text-xs text-[#6b6560] hover:bg-red-500/10 hover:text-red-500 transition-colors" style={{ borderColor: '#e8e4dd' }} onClick={() => removeModel(model)}><Icon name="Trash2" size={13} /> Remove</button>
              )}
            </div>
            {dl && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-[#e0dcd5]"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#4a9e6d' }} /></div>
                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[#9e9890]"><span>{formatBytes(dl.received)} / {formatBytes(dl.total)}</span><span>{pct.toFixed(0)}%</span></div>
              </div>
            )}
            {errors[model.id] && <p className="mt-2 text-[11px] text-red-500">{errors[model.id]}</p>}
            {state?.downloaded && !dl && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600"><Icon name="HardDrive" size={12} /> Stored locally · {formatBytes(state.size)} · {new Date(state.at).toLocaleDateString()}</p>}
          </div>
        );
      })}
    </div>
  );
}
