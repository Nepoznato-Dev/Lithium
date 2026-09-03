import { useState, useEffect, useCallback, useRef } from 'react';
import { formatBytes } from '../../../../lib/storage/manager';
import { backendLlmStatus, backendLlmModels, backendLlmUpload, backendLlmDownload, backendLlmDelete, backendLlmImport, backendUrl } from '../../../../lib/backendApi';
import Icon from '../../../Icon';

export default function LocalServerModels() {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [upload, setUpload] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const fileInput = useRef(null);

  const refresh = useCallback(async () => {
    const h = await backendLlmStatus().catch(() => null);
    setStatus(h);
    if (!h) return;
    const d = await backendLlmModels().catch(() => null);
    if (d) { setModels(d.models || []); setDownloads(d.downloads || []); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!downloads.some(d => d.status === 'downloading')) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [downloads, refresh]);

  const uploadFile = async file => {
    setUpload({ received: 0, total: file.size, name: file.name });
    try { await backendLlmUpload(file, u => setUpload({ ...u, name: file.name })); setUpload(null); refresh(); }
    catch (err) { setUpload(`✗ ${err.message}`); }
  };
  const downloadUrl = async () => {
    if (!url.trim()) return;
    setBusy('download');
    try { await backendLlmDownload(url.trim()); setUrl(''); refresh(); }
    catch (err) { setUpload(`✗ ${err.message}`); }
    finally { setBusy(''); }
  };
  const remove = async id => { setBusy(id); try { await backendLlmDelete(id); } catch { setUpload('Could not remove the model.'); } setBusy(''); refresh(); };
  const importOllama = async id => { setBusy(id); try { await backendLlmImport(id); } catch (err) { setUpload(`✗ ${err.message}`); } setBusy(''); refresh(); };

  const chip = (ok, label) => <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.07] text-white/40'}`}>{label} {ok ? '✓' : '—'}</span>;

  if (!status) return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#10151b] p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-white"><Icon name="Server" size={15} /> Local model server</div>
      <p className="mt-2 text-xs text-[#808c95]">Start <span className="font-mono text-white/60">python run.py</span> in backend/ to serve models at <span className="font-mono text-white/60">{backendUrl()}/v1</span>.</p>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#10151b] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-white"><Icon name="Server" size={15} /> Local model server</span>
        {chip(status.llamaCpp, 'llama.cpp')}{chip(status.ollamaCli, 'Ollama')}{chip(status.ollamaRunning, 'Ollama live')}{chip(status.internet, 'internet')}
        <span className="ml-auto text-[10px] text-white/35"><span className="font-mono text-white/55">{backendUrl()}/v1</span></span>
      </div>
      {status.internet === false && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">Backend can&apos;t reach the internet. Launch from a regular terminal: <span className="font-mono">start-backend.cmd</span>.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".gguf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
        <button className="rounded-lg bg-[#c3f5d9] px-3 py-1.5 text-xs font-medium text-[#102119] hover:bg-[#ddfbe8]" onClick={() => fileInput.current?.click()}><Icon name="Upload" size={12} /> Upload GGUF</button>
        <input className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/30" placeholder="…or paste a GGUF URL" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') downloadUrl(); }} />
        <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40" disabled={!url.trim() || busy === 'download'} onClick={downloadUrl}><Icon name="Download" size={12} /> Download</button>
      </div>
      {upload && typeof upload === 'object' && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#b9e9ca] transition-all" style={{ width: `${Math.min(100, (upload.received / upload.total) * 100)}%` }} /></div>
          <p className="mt-1 text-[10px] text-white/40">Uploading {upload.name} — {formatBytes(upload.received)} / {formatBytes(upload.total)}</p>
        </div>
      )}
      {typeof upload === 'string' && <p className="text-[11px] text-red-300">{upload}</p>}
      {downloads.filter(d => d.status === 'downloading').map(j => (
        <div key={j.jobId}>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#b9e9ca] transition-all" style={{ width: `${j.total ? Math.min(100, (j.received / j.total) * 100) : 0}%` }} /></div>
          <p className="mt-1 text-[10px] text-white/40">Downloading {j.name} — {formatBytes(j.received)}{j.total ? ` / ${formatBytes(j.total)}` : ''}</p>
        </div>
      ))}
      {downloads.filter(d => d.status === 'error').map(j => <p key={j.jobId} className="text-[11px] text-red-300">Failed: {j.name}</p>)}
      {models.length === 0 ? <p className="text-[11px] text-white/30">No models yet — upload a GGUF or download from a URL.</p> : models.map(model => (
        <div key={model.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="BrainCircuit" size={14} className="shrink-0 text-[#b9e9ca]" />
            <span className="truncate text-xs font-medium text-white">{model.name}</span>
            <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/50">{formatBytes(model.size || 0)}</span>
            {model.inOllama && <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300">in Ollama</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {!model.inOllama && status.ollamaCli && <button className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10 disabled:opacity-40" disabled={busy === model.id} onClick={() => importOllama(model.id)}>Import Ollama</button>}
              <button className="rounded p-1 text-white/45 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40" disabled={busy === model.id} onClick={() => remove(model.id)}><Icon name="Trash2" size={12} /></button>
            </span>
          </div>
          {!model.exists && <p className="mt-1 text-[10px] text-amber-300">File missing — re-upload or delete.</p>}
        </div>
      ))}
    </div>
  );
}
