import { useState } from 'react';
import { AI_PROVIDERS, chatCompletion, loadKeys, saveKeys } from '../../../../lib/ai/providers';
import Icon from '../../../Icon';

export default function ConnectionsView({ onCtxMenu }) {
  const [keys, setKeys] = useState(loadKeys);
  const [drafts, setDrafts] = useState({});
  const [testing, setTesting] = useState('');
  const [results, setResults] = useState({});

  const save = provider => {
    const next = { ...keys, [provider]: (drafts[provider] ?? '').trim() };
    if (!next[provider]) delete next[provider];
    setKeys(next); saveKeys(next);
    setResults(prev => ({ ...prev, [provider]: 'Saved locally.' }));
  };
  const test = async provider => {
    setTesting(provider); setResults(prev => ({ ...prev, [provider]: '' }));
    try { const reply = await chatCompletion(provider, [{ role: 'user', content: 'Reply with the single word: ok' }]); setResults(prev => ({ ...prev, [provider]: `✓ Connected — "${reply.slice(0, 40)}"` })); }
    catch (err) { setResults(prev => ({ ...prev, [provider]: `✗ ${err.message}` })); }
    finally { setTesting(''); }
  };

  const providers = Object.entries(AI_PROVIDERS).filter(([, m]) => m.needsKey);
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
      <div className="flex items-end justify-between">
        <div><p className="text-xs text-[#72808a]">Workspace / Connections</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f4f2]">API connections</h1><p className="mt-1 text-sm text-[#808c95]">Keys stay private on this device and are sent only to the provider you call.</p></div>
      </div>
      <div className="space-y-3">
        {providers.map(([id, meta], index) => (
          <div key={id} className="rounded-2xl border border-white/[0.08] bg-[#10151b] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${index % 2 === 0 ? 'bg-[#b9e9ca]/10 text-[#b9e9ca]' : 'bg-[#d8b4f5]/10 text-[#d8b4f5]'}`}><Icon name="Zap" size={18} /></div>
                <div>
                  <h3 className="text-sm font-medium text-white">{meta.label}</h3>
                  <p className="mt-0.5 text-xs text-white/40">{meta.model}</p>
                </div>
              </div>
              {keys[id] ? <span className="rounded-md bg-[#b9e9ca]/10 px-2 py-1 text-xs text-[#a9ddbd]">Key saved</span> : <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/40">Not configured</span>}
            </div>
            <div className="mt-4 flex gap-2 border-t border-white/[0.07] pt-4">
              <input className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 font-mono text-xs text-white/80 outline-none placeholder:text-white/30" type="password" placeholder={`Paste ${meta.label} API key…`} value={drafts[id] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [id]: e.target.value }))} />
              <button className="rounded-lg bg-[#c3f5d9] px-3 py-2 text-xs font-medium text-[#102119] disabled:opacity-40" disabled={!(drafts[id] ?? '').trim()} onClick={() => save(id)}>Save</button>
              <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40" disabled={!keys[id] || testing === id} onClick={() => test(id)}>
                {testing === id ? <Icon name="Loader2" size={13} className="animate-spin" /> : 'Test'}
              </button>
            </div>
            {results[id] && <p className={`mt-2 text-[11px] ${results[id].startsWith('✓') ? 'text-emerald-300' : results[id].startsWith('✗') ? 'text-red-300' : 'text-white/45'}`}>{results[id]}</p>}
            <div className="mt-3 grid gap-3 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
              <div><p className="text-[10px] font-semibold tracking-[.14em] text-[#68757d]">AUTHENTICATION</p><p className="mt-1 flex items-center gap-1.5 text-xs text-[#aebbb4]">{keys[id] ? <><Icon name="ShieldCheck" size={13} className="text-[#9bd6ae]" /> API key protected</> : 'No key set'}</p></div>
              <div><p className="text-[10px] font-semibold tracking-[.14em] text-[#68757d]">CAPABILITIES</p><p className="mt-1 text-xs text-[#aebbb4]">chat · streaming</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
