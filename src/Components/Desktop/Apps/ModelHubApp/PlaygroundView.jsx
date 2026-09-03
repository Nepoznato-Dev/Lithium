import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, chatCompletion, loadKeys } from '../../../../lib/ai/providers';
import { buildWeatherReport, fetchWeather, requestLocation } from '../../../../lib/deviceContext';
import { allModels, downloadedModelFor, getModel, getTier, loadModelMeta, tierModel, TIERS } from '../../../../lib/ai/models';
import { storage } from '../../../../lib/storage';
import { renderMarkdown } from '../../../../lib/markdown';
import { getCatalog } from '../../../../lib/ai/apiManager';
import { extractApiCalls, extractWidgetBlocks, stripToolBlocks, deleteChat, loadChats, makeChatId, upsertChat } from '../../../../lib/ai/agent';
import { backendBuildContext, backendWebSearch } from '../../../../lib/backendApi';
import { loadTree, readEntryContent } from '../../../../lib/fileSystem';
import Icon from '../../../Icon';
import { WidgetBlockChips, ApiCallChips } from './WidgetApiChips';
import { buildDevicePrompt } from './prompts';

export default function PlaygroundView({ onNeedModels, onCtxMenu, chatId, onChatIdChange }) {
  const [provider, setProvider] = useState(() => (downloadedModelFor(getTier()) ? 'local' : loadKeys().groq ? 'groq' : 'builtin'));
  const [localModel, setLocalModel] = useState(() => storage.get('ai-local-model', ''));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [effort, setEffort] = useState(() => storage.get('ai-effort', 'medium'));
  const [contextWindow, setContextWindow] = useState(() => storage.get('ai-context-window', 8192));
  const [webMode, setWebMode] = useState(() => storage.get('ai-web-mode', 'off'));
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [tier, setTierState] = useState(getTier());
  const [deviceControl, setDeviceControl] = useState(() => storage.get('ai-device-control', false));
  const [apiLines, setApiLines] = useState('');
  const [chats, setChats] = useState(loadChats);
  const scrollRef = useRef(null);
  const reportRef = useRef(null);

  useEffect(() => {
    const onKv = () => setChats(loadChats());
    window.addEventListener('lithium:kv-ready', onKv);
    return () => window.removeEventListener('lithium:kv-ready', onKv);
  }, []);
  useEffect(() => {
    if (!messages.length) return;
    const firstUser = messages.find(m => m.role === 'user');
    upsertChat({ id: chatId, title: (firstUser?.content || 'New chat').replace(/\s+/g, ' ').slice(0, 42), messages, provider });
    setChats(loadChats());
  }, [messages, chatId, provider]);

  useEffect(() => {
    if (chatId === '__new') { setMessages([]); return; }
    const chat = loadChats().find(c => c.id === chatId);
    if (chat) { setMessages(chat.messages || []); if (chat.provider) setProvider(chat.provider); }
    else setMessages([]);
  }, [chatId]);

  const removeCurrentChat = () => { const newId = makeChatId(); deleteChat(chatId); setChats(loadChats()); onChatIdChange(newId); setMessages([]); };

  useEffect(() => {
    if (!deviceControl) return undefined;
    let active = true;
    getCatalog().then(cat => {
      if (!active) return;
      setApiLines(cat.map(s => {
        const p = (s.params || []).map(x => `${x.name}${x.required ? '' : '?'}`).join(', ');
        return `- ${s.api}(${p}) — ${s.desc}${s.callers.includes('widget') ? '' : ' [restricted]'}`;
      }).join('\n'));
    });
    return () => { active = false; };
  }, [deviceControl]);

  const systemPrompt = () =>
    `You are Lithium Assistant. Answer in markdown. Reasoning effort: ${effort}.` +
    (webMode === 'research' ? ' Perform deep research: organize the answer as findings, evidence, uncertainties, and next steps. Use current web sources when the selected provider supports web access.' : webMode === 'search' ? ' Use current web context when available and clearly separate sourced claims from your own reasoning.' : '') +
    (attachedFiles.length ? ` The user attached these local files: ${attachedFiles.map(f => f.name).join(', ')}. Use their extracted contents as context.` : '') +
    (deviceControl ? buildDevicePrompt(apiLines) : '');

  const persist = (key, value, setter) => { setter(value); storage.set(key, value); };
  const attachFiles = async e => {
    const files = [...(e.target.files || [])];
    const entries = loadTree();
    const attached = [];
    for (const f of files) {
      const entry = entries.find(item => item.name === f.name);
      const content = entry ? await readEntryContent(entry) : await f.text();
      attached.push({ name: f.name, content: String(content).slice(0, 24000) });
    }
    setAttachedFiles(prev => [...prev, ...attached].slice(-5));
    e.target.value = '';
  };

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, busy]);
  useEffect(() => { const onR = () => reportRef.current?.(); window.addEventListener('lithium:ai-report', onR); return () => window.removeEventListener('lithium:ai-report', onR); }, []);

  const push = (role, content) => setMessages(prev => [...prev, { role, content }]);
  const downloadedOptions = useMemo(() => allModels().filter(m => loadModelMeta()[m.id]?.downloaded), []);
  const tierResolved = downloadedModelFor(tier) || getModel(tierModel(tier).modelId);
  const localTarget = localModel && getModel(localModel) ? localModel : (tierResolved?.id || tier);

  const send = async text => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    setInput('');
    push('user', trimmed);
    setBusy(true);
    try {
      if (provider === 'local') {
        const rt = await import('../../../../lib/ai/modelRuntime');
        try { await rt.ensureRuntime(localTarget); }
        catch (err) {
          if (String(err.message).startsWith('MODEL_NOT_DOWNLOADED')) {
            push('assistant', `⬇️ **${getModel(String(err.message).split(':')[1])?.name || 'Model'}** isn't downloaded yet. Get it in the Models tab.`);
            onNeedModels?.(); return;
          }
          push('assistant', `⚠️ ${err.message}`); return;
        }
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        const upd = full => setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: 'assistant', content: full || '…' }; return n; });
        await rt.localChat(
          [{ role: 'system', content: systemPrompt() }, ...messages.slice(-7), { role: 'user', content: trimmed }],
          { thinking, onToken: (_t, full) => upd(full) }
        ).catch(err => upd(`⚠️ ${err.message}`));
      } else if (provider === 'builtin') {
        push('assistant', `I'm the on-device engine — I can generate full device & weather reports without any API key (use the 📍 button). Cloud chat needs a key: add one under **Connections** (Groq, OpenAI, Anthropic, Google or Grok).`);
      } else {
        let webCtx = '';
        if (webMode !== 'off') {
          try { const s = await backendWebSearch(trimmed, webMode === 'research' ? 8 : 5); webCtx = s.results.map(r => `- ${r.title}\n  ${r.url}\n  ${r.snippet}`).join('\n').slice(0, 6000); }
          catch { webCtx = 'Web search unavailable.'; }
        }
        const raw = [
          { role: 'system', content: systemPrompt() },
          ...(webCtx ? [{ role: 'system', content: `Current DuckDuckGo search results. Cite URLs when relevant:\n${webCtx}` }] : []),
          ...messages.slice(-7),
          ...attachedFiles.map(f => ({ role: 'user', content: `[Attached file: ${f.name}]\n${f.content}` })),
          { role: 'user', content: trimmed },
        ];
        let req = raw;
        if (provider !== 'local') {
          try { const b = await backendBuildContext(raw, { maxTokens: Number(contextWindow), modelId: localTarget, includeMemory: true }); req = b.messages || raw; } catch { /* backend optional */ }
        }
        const reply = await chatCompletion(provider, req);
        push('assistant', reply || '(empty response)');
      }
    } catch (err) { push('assistant', `⚠️ ${err.message}`); }
    finally { setBusy(false); }
  };

  const deviceReport = async () => {
    if (busy) return;
    setBusy(true);
    push('user', '📍 Generate my full device & environment report (location, weather, humidity, time).');
    try {
      const loc = await requestLocation();
      if (!loc) { push('assistant', '🔒 Location permission denied. Allow location access in browser site settings and try again.'); return; }
      const weather = await fetchWeather(loc.lat, loc.lon);
      const report = buildWeatherReport(weather, loc.label);
      if (provider === 'local') {
        try {
          const rt = await import('../../../../lib/ai/modelRuntime');
          await rt.ensureRuntime(localTarget);
          setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
          const upd = full => setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: 'assistant', content: full || '…' }; return n; });
          await rt.localChat(
            [{ role: 'system', content: 'Write a friendly markdown weather report from this raw data.' }, { role: 'user', content: report }],
            { thinking, onToken: (_t, full) => upd(full) }
          ).catch(() => upd(report));
          return;
        } catch { push('assistant', report); return; }
      }
      if (provider !== 'builtin' && loadKeys()[provider]) {
        try {
          const reply = await chatCompletion(provider, [
            { role: 'system', content: 'Write a friendly markdown weather & environment report from the raw data.' },
            { role: 'user', content: report },
          ]);
          push('assistant', reply || report); return;
        } catch (err) { push('assistant', `⚠️ ${AI_PROVIDERS[provider].label} failed (${err.message}) — showing raw report.\n\n${report}`); return; }
      }
      push('assistant', report);
    } catch (err) { push('assistant', `⚠️ Could not build report: ${err.message}`); }
    finally { setBusy(false); }
  };
  reportRef.current = deviceReport;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Playground header */}
        <div className="flex items-center justify-between px-5 pb-1 pt-3 sm:px-7">
          <div>
            <p className="text-xs text-[#71808a]">Cortex / Playground</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-[#f1f4f2]">
              {chats.find(c => c.id === chatId)?.title || 'New conversation'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#aeb8b5] hover:bg-white/[0.05]" onClick={() => { setMessages([]); onChatIdChange(makeChatId()); }}>New chat</button>
            <button className="rounded-lg p-2 text-[#91a0aa] hover:bg-white/[0.07] hover:text-white disabled:opacity-40" onClick={deviceReport} disabled={busy} title="Generate device & weather report">
              <Icon name="MapPin" size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col space-y-6 overflow-y-auto px-4 py-6 sm:px-7" onContextMenu={event => onCtxMenu?.(event, [
          { id: 'paste', label: 'Paste', icon: 'Clipboard', action: () => navigator.clipboard?.readText().then(t => t && setInput(prev => prev + t)) },
          { id: 'clear', label: 'Clear conversation', icon: 'Trash2', danger: true, disabled: messages.length === 0, action: () => { setMessages([]); onChatIdChange(makeChatId()); } },
          { id: 'new-chat', label: 'New chat', icon: 'Plus', action: () => { setMessages([]); onChatIdChange(makeChatId()); } },
        ])}>
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Icon name="Sparkles" size={32} className="text-[#b9e9ca]/40" />
              <p className="text-base text-[#dce8e0]">What would you like to explore?</p>
              <p className="max-w-sm text-xs text-white/35">Ask anything, attach files, or search the web for current sources.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const apiCalls = msg.role === 'assistant' ? extractApiCalls(msg.content) : [];
            const widgets = msg.role === 'assistant' ? extractWidgetBlocks(msg.content) : [];
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} onContextMenu={event => onCtxMenu?.(event, msg.role === 'user' ? [
                { id: 'copy', label: 'Copy text', icon: 'Copy', action: () => navigator.clipboard?.writeText(msg.content) },
                { id: 'delete', label: 'Delete message', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, j) => j !== i)) },
              ] : [
                { id: 'copy-md', label: 'Copy markdown', icon: 'Copy', action: () => navigator.clipboard?.writeText(msg.content) },
                { id: 'copy-text', label: 'Copy plain text', icon: 'FileText', action: () => navigator.clipboard?.writeText(stripToolBlocks(msg.content).replace(/[#*_`~\x5b\x5d]/g, '')) },
                { id: 'regen', label: 'Regenerate', icon: 'RotateCw', disabled: busy, action: () => { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) send(last.content); } },
                { id: 'delete', label: 'Delete message', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, j) => j !== i)) },
              ])}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'rounded-3xl rounded-br-md bg-[#202d35] px-4 py-3 text-sm leading-6 text-[#e5efeb]' : 'px-1 text-[14px] leading-7 text-[#dde5e1]'}`}>
                  {msg.role === 'assistant' && (
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#bde9cb]"><Icon name="Sparkles" size={13} /> Cortex</div>
                  )}
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(stripToolBlocks(msg.content)) }} />
                      {apiCalls.length > 0 && <ApiCallChips calls={apiCalls} />}
                      {widgets.length > 0 && <WidgetBlockChips blocks={widgets} />}
                    </>
                  ) : <span className="whitespace-pre-wrap">{msg.content}</span>}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex items-center gap-2 px-1 text-sm text-[#9ab3a4]">
              <Icon name="Sparkles" size={13} className="animate-pulse" /> Thinking{thinking ? ` at ${effort} effort` : ''}…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2 sm:px-7">
          <div className="relative rounded-3xl border border-white/10 bg-[#11171d] p-3 shadow-2xl shadow-black/25 focus-within:border-[#b9e9ca]/40">
            <input id="cortex-file-input" type="file" multiple className="hidden" onChange={attachFiles} />
            <textarea
              className="min-h-[68px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[15px] text-[#e5eee8] outline-none placeholder:text-[#66727b]"
              placeholder="Message Cortex…" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <div className="mt-1 flex items-center gap-1 px-1">
              <div className="flex items-center gap-1 rounded-xl bg-black/15 p-1">
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${webMode !== 'off' ? 'bg-[#b9e9ca]/15 text-[#b9e9ca]' : 'text-[#829099] hover:bg-white/[0.05]'}`}>
                  <Icon name="Globe" size={14} />
                  <select className="w-auto bg-transparent text-xs outline-none" value={webMode} onChange={e => persist('ai-web-mode', e.target.value, setWebMode)}>
                    <option value="off">Web off</option><option value="search">Search</option><option value="research">Research</option>
                  </select>
                </label>
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${thinking ? 'bg-[#d8b4f5]/15 text-[#dfc8f0]' : 'text-[#829099] hover:bg-white/[0.05]'}`}>
                  <Icon name="BrainCircuit" size={14} />
                  <input type="checkbox" checked={thinking} onChange={e => setThinking(e.target.checked)} className="hidden" />
                  Thinking
                </label>
              </div>
              <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[#829099] hover:bg-white/[0.05]" title="Effort">
                <Icon name="Scaling" size={13} />
                <select className="w-auto bg-transparent text-xs outline-none" value={effort} onChange={e => persist('ai-effort', e.target.value, setEffort)}>
                  <option value="low">Low</option><option value="medium">Med</option><option value="high">High</option>
                </select>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[#829099] hover:bg-white/[0.05]" title="Attach files">
                <Icon name="Paperclip" size={13} />
              </label>
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${deviceControl ? 'text-[#b9e9ca]' : 'text-[#829099] hover:bg-white/[0.05]'}`} title="Device control">
                <input type="checkbox" checked={deviceControl} onChange={e => { setDeviceControl(e.target.checked); storage.set('ai-device-control', e.target.checked); }} className="hidden" />
                <Icon name="Plug2" size={13} />
              </label>
              <button className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#c3f5d9] text-[#102119] transition hover:bg-[#e1fbed] disabled:cursor-not-allowed disabled:opacity-30" disabled={busy || !input.trim()} onClick={send} aria-label="Send">
                <Icon name="ArrowUp" size={17} />
              </button>
            </div>
          </div>
          {attachedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachedFiles.map((f, i) => (
                <button key={i} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.1]" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>
                  {f.name} <Icon name="X" size={10} />
                </button>
              ))}
            </div>
          )}
          {/* Tier selector for local provider */}
          {provider === 'local' && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <select className="w-full rounded-lg border border-white/10 bg-[#11171d] px-3 py-1.5 text-xs text-white/70 outline-none" value={provider} onChange={e => setProvider(e.target.value)}>
                <option value="local">On-device (wllama){downloadedOptions.length ? '' : ' · no model yet'}</option>
                {Object.entries(AI_PROVIDERS).map(([id, meta]) => (
                  <option key={id} value={id}>{meta.label}{id !== 'builtin' && !loadKeys()[id] ? ' (no key)' : ''}</option>
                ))}
              </select>
              {TIERS.map(t => {
                const dl = downloadedModelFor(t.id);
                return (
                  <button key={t.id} className={`rounded-lg border px-2 py-1 text-[10px] ${tier === t.id ? 'border-[#b9e9ca]/30 bg-[#b9e9ca]/10 text-[#b9e9ca]' : 'border-white/10 text-white/50 hover:bg-white/[0.05]'}`} onClick={() => { setTier(t.id); setTierState(t.id); setLocalModel(''); storage.set('ai-local-model', ''); }}>
                    {t.label}{dl ? '' : ' · none'}
                  </button>
                );
              })}
              {downloadedOptions.length > 0 && (
                <select className="rounded-lg border border-white/10 bg-[#11171d] px-2 py-1 text-[10px] text-white/60 outline-none" value={localTarget} onChange={e => { setLocalModel(e.target.value); storage.set('ai-local-model', e.target.value); }}>
                  {downloadedOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </div>
          )}
          {/* Provider selector for non-local */}
          {provider !== 'local' && (
            <div className="mt-2">
              <select className="w-full rounded-lg border border-white/10 bg-[#11171d] px-3 py-1.5 text-xs text-white/70 outline-none" value={provider} onChange={e => setProvider(e.target.value)}>
                {Object.entries(AI_PROVIDERS).map(([id, meta]) => (
                  <option key={id} value={id}>{meta.label}{id !== 'builtin' && !loadKeys()[id] ? ' (no key)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-[#627078]">Cortex can make mistakes. Check important information and cited sources.</p>
        </div>
      </div>
    </div>
  );
}
