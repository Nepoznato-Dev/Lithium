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

export default function ModelsView({ onCtxMenu }) {
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
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
      <div><p className="text-xs text-[#72808a]">Workspace / Models</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f4f2]">Model library</h1><p className="mt-1 text-sm text-[#808c95]">Download, manage and run GGUF models locally in the browser.</p></div>
      <LocalServerModels />
      <div className="rounded-2xl border border-white/[0.08] bg-[#10151b] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">Your own models</span>
          <span className="text-[10px] text-white/35">IndexedDB + wllama — no server needed</span>
          <span className="ml-auto flex items-center gap-2">
            <input ref={importInput} type="file" accept=".gguf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40" disabled={importing} onClick={() => importInput.current?.click()}>
              {importing ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Upload" size={12} />} {importing ? 'Importing…' : 'Import GGUF'}
            </button>
            <button className="rounded-lg bg-[#c3f5d9] px-3 py-1.5 text-xs font-medium text-[#102119] hover:bg-[#ddfbe8]" onClick={() => setAddingCustom(v => !v)}><Icon name="Plus" size={12} /> Add by URL</button>
          </span>
        </div>
        {addingCustom && !hfNav && (
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/30" placeholder="Model name (optional)" value={draftName} onChange={e => setDraftName(e.target.value)} />
            <input className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/30" placeholder="Hugging Face repo link or direct GGUF URL" value={draftUrl} onChange={e => setDraftUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCustom(); }} />
            <div className="flex justify-end gap-2">
              <button className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => setAddingCustom(false)}>Cancel</button>
              <button className="rounded-lg bg-[#c3f5d9] px-4 py-1.5 text-xs font-medium text-[#102119] disabled:opacity-40" disabled={!draftUrl.trim()} onClick={saveCustom}>Continue</button>
            </div>
          </div>
        )}
        {addingCustom && hfNav && (
          <div className="mt-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-white/55">
              <Icon name="Folder" size={12} className="shrink-0 text-amber-300" />
              <button className="font-mono text-cyan-300 hover:underline" onClick={() => navigateHf(hfNav.repo, '')}>{hfNav.repo}</button>
              {hfNav.path.split('/').filter(Boolean).map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-1"><span className="text-white/25">/</span><button className="font-mono text-cyan-300 hover:underline" onClick={() => navigateHf(hfNav.repo, arr.slice(0, i + 1).join('/'))}>{seg}</button></span>
              ))}
              <button className="ml-auto rounded px-2 py-1 text-[11px] text-white/50 hover:bg-white/10" onClick={() => setHfNav(null)}>Close</button>
            </div>
            {hfNav.entries === null ? <p className="flex items-center gap-2 text-[11px] text-white/40"><Icon name="Loader2" size={12} className="animate-spin" /> Loading…</p>
            : hfNav.entries.map(entry => {
              if (entry.type === 'directory') return (
                <button key={entry.path} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.06]" onClick={() => navigateHf(hfNav.repo, entry.path)}>
                  <Icon name="Folder" size={12} className="shrink-0 text-amber-300" /><span className="truncate font-mono text-[11px] text-white/70">{entry.name}</span><span className="ml-auto text-white/25">›</span>
                </button>
              );
              if (entry.name.toLowerCase().endsWith('.gguf')) return (
                <button key={entry.path} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left hover:border-cyan-400/40 hover:bg-cyan-400/[0.06]" onClick={() => pickHfFile(entry)}>
                  <Icon name="Download" size={12} className="shrink-0 text-[#b9e9ca]" /><span className="truncate font-mono text-[11px] text-white/80">{entry.name}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-white/40">{entry.size ? `~${formatBytes(entry.size)}` : ''}</span>
                </button>
              );
              return (
                <div key={entry.path} className="flex items-center gap-2 px-3 py-1 opacity-40">
                  <Icon name="FileText" size={12} className="shrink-0" /><span className="truncate font-mono text-[11px] text-white/60">{entry.name}</span>
                </div>
              );
            })}
          </div>
        )}
        {errors.custom && <p className="mt-2 text-[11px] text-red-300">{errors.custom}</p>}
      </div>
      {allModels().map(model => {
        const state = meta[model.id];
        const dl = progress[model.id];
        const pct = dl && dl.total ? Math.min(100, (dl.received / dl.total) * 100) : 0;
        return (
          <div key={model.id} className="rounded-2xl border border-white/[0.08] bg-[#10151b] p-5" onContextMenu={event => onCtxMenu?.(event, [
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b9e9ca]/10 text-[#b9e9ca]"><Icon name="BrainCircuit" size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  {model.name}
                  <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#b9e9ca]">{model.tier}</span>
                  <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/60">{model.quant}</span>
                  <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/60">{model.params}</span>
                  {model.custom && <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[10px] text-violet-300">yours</span>}
                </div>
                <p className="truncate text-xs text-white/40">{model.blurb}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-white/45">{model.size ? `~${formatBytes(model.size)}` : ''}</span>
              {state?.downloaded ? (
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-red-500/15 hover:text-red-300" onClick={() => removeModel(model)}><Icon name="Trash2" size={13} /> Delete</button>
              ) : dl ? (
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05]" onClick={() => aborters.current[model.id]?.abort()}><Icon name="X" size={13} /> Cancel</button>
              ) : model.url ? (
                <button className="rounded-lg bg-[#c3f5d9] px-3 py-1.5 text-xs font-medium text-[#102119] hover:bg-[#ddfbe8]" onClick={() => start(model.id)}><Icon name="Download" size={13} /> Download</button>
              ) : (
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-red-500/15 hover:text-red-300" onClick={() => removeModel(model)}><Icon name="Trash2" size={13} /> Remove</button>
              )}
            </div>
            {dl && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#b9e9ca] transition-all" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/40"><span>{formatBytes(dl.received)} / {formatBytes(dl.total)}</span><span>{pct.toFixed(0)}%</span></div>
              </div>
            )}
            {errors[model.id] && <p className="mt-2 text-[11px] text-red-300">{errors[model.id]}</p>}
            {state?.downloaded && !dl && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300"><Icon name="HardDrive" size={12} /> Stored locally · {formatBytes(state.size)} · {new Date(state.at).toLocaleDateString()}</p>}
          </div>
        );
      })}
    </div>
  );
}
