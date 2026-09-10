import { useState } from 'react';
import { AI_PROVIDERS, chatCompletion, loadKeys, saveKeys, modelsForProvider } from '../../../../lib/ai/providers';
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
    <div className="flex-1 space-y-4 overflow-y-auto bg-white p-5 sm:p-7">
      <div className="flex items-end justify-between">
        <div><h1 className="text-base font-semibold text-[#2d2d2d]">API connections</h1><p className="mt-1 text-xs text-[#9e9890]">Keys stay private on this device and are sent only to the provider you call.</p></div>
      </div>
      <div className="space-y-3">
        {providers.map(([id, meta], index) => (
          <div key={id} className="rounded-xl border bg-white p-6" style={{ borderColor: '#e8e4dd' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${index % 2 === 0 ? 'text-[#4a9e6d]' : 'text-purple-500'}`} style={{ background: index % 2 === 0 ? '#eef7f1' : '#f3eefe' }}><Icon name="Zap" size={16} /></div>
                <div>
                  <h3 className="text-sm font-medium text-[#2d2d2d]">{meta.label}</h3>
                  <p className="mt-0.5 text-xs text-[#9e9890]">{modelsForProvider(id).length ? `${modelsForProvider(id).length} models` : meta.model}</p>
                </div>
              </div>
              {keys[id] ? <span className="rounded-lg px-2 py-1 text-xs text-[#4a9e6d]" style={{ background: '#eef7f1' }}>Key saved</span> : <span className="rounded-lg bg-[#eae6df] px-2 py-1 text-xs text-[#9e9890]">Not configured</span>}
            </div>
            <div className="mt-4 flex gap-2 border-t pt-4" style={{ borderColor: '#e8e4dd' }}>
              <input className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 font-mono text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} type="password" placeholder={`Paste ${meta.label} API key…`} value={drafts[id] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [id]: e.target.value }))} />
              <button className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40 transition-colors hover:opacity-90" style={{ background: '#4a9e6d' }} disabled={!(drafts[id] ?? '').trim()} onClick={() => save(id)}>Save</button>
              <button className="rounded-lg border px-3 py-2 text-xs text-[#6b6560] hover:bg-[#faf8f5] disabled:opacity-40 transition-colors" style={{ borderColor: '#e8e4dd' }} disabled={!keys[id] || testing === id} onClick={() => test(id)}>
                {testing === id ? <Icon name="Loader2" size={13} className="animate-spin" /> : 'Test'}
              </button>
            </div>
            {results[id] && <p className={`mt-2 text-[11px] ${results[id].startsWith('✓') ? 'text-[#4a9e6d]' : results[id].startsWith('✗') ? 'text-red-500' : 'text-[#9e9890]'}`}>{results[id]}</p>}
            <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2" style={{ borderColor: '#e8e4dd' }}>
              <div><p className="text-[10px] font-semibold tracking-[0.08em] text-[#9e9890]">AUTHENTICATION</p><p className="mt-1 flex items-center gap-1.5 text-xs text-[#6b6560]">{keys[id] ? <><Icon name="ShieldCheck" size={13} className="text-[#4a9e6d]" /> API key protected</> : 'No key set'}</p></div>
              <div><p className="text-[10px] font-semibold tracking-[0.08em] text-[#9e9890]">CAPABILITIES</p><p className="mt-1 text-xs text-[#6b6560]">chat · streaming</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
