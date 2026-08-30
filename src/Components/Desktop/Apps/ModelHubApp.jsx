import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, chatCompletion, loadKeys, saveKeys } from '../../../lib/ai/providers';
import { buildWeatherReport, fetchWeather, requestLocation } from '../../../lib/deviceContext';
import { addCustomModel, allModels, deleteModel, downloadModel, downloadedModelFor, getModel, getTier, hfResolveUrl, importLocalGguf, listHfDir, loadModelMeta, MODEL_CATALOG, parseHfUrl, removeCustomModel, setTier, tierModel, TIERS } from '../../../lib/ai/models';
import { formatBytes } from '../../../lib/storage/manager';
import { renderMarkdown } from '../../../lib/markdown';
import { call as apiCall, getCatalog } from '../../../lib/ai/apiManager';
import { storage } from '../../../lib/storage';
import { extractApiCalls, extractWidgetBlocks, stripToolBlocks, deleteMemory, loadMemory, memoryDump, writeMemory, deleteChat, loadChats, makeChatId, upsertChat } from '../../../lib/ai/agent';
import { WIDGETS_FOLDER_ID, WIDGET_API_DOC } from '../../../lib/desktop/widgetRuntime';
import { backendBuildContext, backendHealth, backendMemorySync, backendUrl, backendWebSearch, backendLlmDelete, backendLlmDownload, backendLlmImport, backendLlmModels, backendLlmStatus, backendLlmUpload } from '../../../lib/backendApi';
import { loadTree, readEntryContent } from '../../../lib/fileSystem';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';

const NAV_ITEMS = [
  { id: 'playground', label: 'Playground', icon: 'Terminal' },
  { id: 'models', label: 'Models', icon: 'BrainCircuit' },
  { id: 'connections', label: 'Connections', icon: 'Database' },
  { id: 'memory', label: 'Memory', icon: 'ShieldCheck' },
  { id: 'history', label: 'History', icon: 'Clock3' },
];
const APP_IDS_HINT = 'App ids for apps.open / apps.close / apps.focus: games, media-player, browser, calculator, clock, files, photos, notepad, ai-hub, api-manager, task-manager, settings.';

const buildDevicePrompt = apiLines => `\n\nYou can control and extend the Lithium desktop. Two output formats — every call you propose is shown to the user for approval before it runs, so propose freely:

1) One-shot API calls — reply with normal text PLUS fenced api blocks, one JSON object each:
\`\`\`api
{"api": "apps.open", "params": {"id": "task-manager"}}
\`\`\`

2) Widgets / apps — when the user asks for a widget, app or automation, write REAL JavaScript in a fenced widget block. The first code line must be a "// widget: <Name>" header. Use ONLY the sandbox globals below — no imports, no DOM.
\`\`\`widget
// widget: My Widget
on('boot', () => api.notify('Hi', 'running'));
\`\`\`

${APP_IDS_HINT}

${WIDGET_API_DOC}

Full API catalog — invoke via api blocks or api.call(name, params) inside widgets. Entries marked [restricted] are NOT allowed for widgets:
${apiLines || '(catalog loading)'}

== Persistent memory ==
You keep memories across chats in a persistent local store. Save important user facts, preferences and ongoing projects there; read it at the start of tasks.
- memory.list / memory.read {key} — inspect
- memory.write {key, value} — short lowercase keys, concise values; update existing keys instead of duplicating
- memory.delete {key} — forget
Current memory:
${memoryDump()}`;

/* ---------- Widget & API call chips ---------- */

function WidgetBlockChips({ blocks }) {
  const [states, setStates] = useState({});
  const install = async (index, block) => {
    setStates(prev => ({ ...prev, [index]: { busy: true } }));
    try {
      const fileName = `${block.name}.widget.js`;
      const id = await apiCall('fs.write', { name: fileName, parent: WIDGETS_FOLDER_ID, content: block.code }, 'model');
      await apiCall('widgets.set_enabled', { id, enabled: true }, 'model');
      setStates(prev => ({ ...prev, [index]: { busy: false, ok: true, message: 'installed & running' } }));
    } catch (err) {
      setStates(prev => ({ ...prev, [index]: { busy: false, ok: false, message: err.message } }));
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
      {blocks.map((block, i) => {
        const s = states[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-[#b9e9ca]/15 bg-[#b9e9ca]/[0.05] px-2.5 py-1.5 text-[11px] text-[#a7ceb3] disabled:opacity-50" onClick={() => install(i, block)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Blocks" size={11} />}
            Install &quot;{block.name}&quot;
            {s && !s.busy && <span className={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '✓' : '✕'}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ApiCallChips({ calls }) {
  const [results, setResults] = useState({});
  const run = async (index, call) => {
    setResults(prev => ({ ...prev, [index]: { busy: true } }));
    try {
      const result = await apiCall(call.api, call.params, 'model');
      setResults(prev => ({ ...prev, [index]: { ok: true, result } }));
    } catch (err) {
      setResults(prev => ({ ...prev, [index]: { ok: false, error: err.message } }));
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
      {calls.map((call, i) => {
        const s = results[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.05] disabled:opacity-50" onClick={() => run(i, call)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Plug2" size={11} />}
            {call.api}
            {s && !s.busy && <span className={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '✓' : '✕'}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Playground (Assistant) ---------- */

function PlaygroundView({ onNeedModels, onCtxMenu, chatId, onChatIdChange }) {
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

  // Sync when chatId changes from outside (sidebar / history)
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
        const rt = await import('../../../lib/ai/modelRuntime');
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
          const rt = await import('../../../lib/ai/modelRuntime');
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

/* ---------- Sidebar ---------- */

function Sidebar({ view, setView, chats, chatId, openChat, onNewChat, onRefreshChats, onCtxMenu }) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0e1217] md:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#c3f5d9] text-[#102119]"><Icon name="Sparkles" size={16} /></span>
        <span className="text-[15px] font-semibold tracking-tight text-[#eef5f0]">Cortex</span>
      </div>
      <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#5d6873]">Workspace</p>
      <nav className="space-y-0.5 px-3">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setView(id)} onContextMenu={event => onCtxMenu?.(event, [
            { id: 'go', label: `Switch to ${label}`, icon, action: () => setView(id) },
          ])} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${view === id ? 'bg-white/[0.08] text-[#eaf8ef]' : 'text-[#7f8b94] hover:bg-white/[0.04] hover:text-[#dce5e2]'}`}>
            <Icon name={icon} size={16} strokeWidth={1.7} />{label}
          </button>
        ))}
      </nav>
      {view === 'playground' && (
        <>
          <div className="mx-3 my-3 border-t border-white/[0.07]" />
          <div className="flex items-center justify-between px-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#5d6873]">Chats</p>
            <button className="rounded p-1 text-[#7f8b94] hover:bg-white/[0.06] hover:text-white" onClick={onNewChat}><Icon name="Plus" size={13} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
            {chats.map(chat => (
              <button key={chat.id} onClick={() => openChat(chat.id)} onContextMenu={event => onCtxMenu?.(event, [
                { id: 'open', label: 'Open', icon: 'MessageSquare', action: () => openChat(chat.id) },
                { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const t = prompt('New title:', chat.title); if (t?.trim()) { upsertChat({ ...chat, title: t.trim() }); onRefreshChats?.(); } } },
                { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
                { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { deleteChat(chat.id); onRefreshChats?.(); } },
              ])} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${chat.id === chatId ? 'bg-white/[0.08] text-[#e4eee8]' : 'text-[#849099] hover:bg-white/[0.05] hover:text-white'}`}>
                <Icon name="MessageSquare" size={12} className="shrink-0" /><span className="truncate">{chat.title}</span>
              </button>
            ))}
            {chats.length === 0 && <p className="px-2 py-3 text-[11px] text-white/25">No saved chats yet</p>}
          </div>
        </>
      )}
      <div className="mt-auto shrink-0 px-3 pb-3">
        <div className="rounded-xl border border-[#b9e9ca]/10 bg-[#b9e9ca]/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#c7e8d2]"><Icon name="ShieldCheck" size={14} /> Local-first</div>
          <p className="mt-1 text-[11px] leading-[18px] text-[#718079]">Models, keys and files stay on this device.</p>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Models tab ---------- */

function friendlyDownloadError(err) {
  const m = err?.message || String(err);
  if (m === 'Failed to fetch' || m.includes('NetworkError') || m.includes('CORS')) return 'Could not fetch that URL — paste a Hugging Face repo link or a direct …/resolve/main/file.gguf link.';
  return m;
}

function LocalServerModels() {
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

function ModelsView({ onCtxMenu }) {
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

/* ---------- Connections (API Keys) ---------- */

function ConnectionsView({ onCtxMenu }) {
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

/* ---------- Memory ---------- */

function MemoryView({ onCtxMenu }) {
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

/* ---------- History ---------- */

function HistoryView({ chats, openChat, deleteChat, onCtxMenu }) {
  const [search, setSearch] = useState('');
  const filtered = chats.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
      <div><p className="text-xs text-[#72808a]">Workspace / History</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f1f4f2]">Chat history</h1><p className="mt-1 text-sm text-[#808c95]">Revisit prompts and responses from your Playground sessions.</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#10151b] px-4 py-2.5">
        <Icon name="Search" size={16} className="text-[#68757e]" />
        <input placeholder="Search conversations…" className="w-full bg-transparent text-sm text-[#d7e1db] outline-none placeholder:text-[#65717a]" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-white/30">{chats.length === 0 ? 'No saved conversations yet. Start chatting in the Playground.' : 'No conversations match your search.'}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10151b]">
          {filtered.map(chat => (
            <div key={chat.id} className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0 hover:bg-white/[0.035]" onContextMenu={event => onCtxMenu?.(event, [
              { id: 'open', label: 'Open conversation', icon: 'MessageSquare', action: () => openChat(chat.id) },
              { id: 'copy-title', label: 'Copy title', icon: 'Copy', action: () => navigator.clipboard?.writeText(chat.title) },
              { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => deleteChat(chat.id) },
            ])}>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-[#8d9b9f]"><Icon name="MessageSquare" size={14} /></div>
              <div className="min-w-0 flex-1">
                <button className="truncate text-left text-sm text-[#dce5e0] hover:text-white" onClick={() => openChat(chat.id)}>{chat.title}</button>
                <p className="mt-0.5 font-mono text-[10px] text-[#68757e]">{chat.messages?.length || 0} messages · {chat.provider || 'unknown'}</p>
              </div>
              <button className="shrink-0 rounded p-1.5 text-white/35 hover:bg-red-500/15 hover:text-red-300" title="Delete" onClick={() => deleteChat(chat.id)}><Icon name="Trash2" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Main component ---------- */

export default function ModelHubApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [view, setView] = useState('playground');
  const [chats, setChats] = useState(loadChats);
  const [chatId, setChatId] = useState(() => makeChatId());
  const [ctxMenu, openCtxMenu, closeCtxMenu] = useContextMenu();

  useEffect(() => {
    const onKv = () => setChats(loadChats());
    window.addEventListener('lithium:kv-ready', onKv);
    return () => window.removeEventListener('lithium:kv-ready', onKv);
  }, []);

  const openChat = id => {
    setView('playground');
    if (id === '__new') { setChatId(makeChatId()); return; }
    const chat = loadChats().find(c => c.id === id);
    if (chat) setChatId(chat.id);
  };

  const removeChat = id => {
    deleteChat(id);
    setChats(loadChats());
    if (id === chatId) setChatId(makeChatId());
  };

  const newChat = () => { setChatId(makeChatId()); setView('playground'); };

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0b0e12] text-[#e8eceb]">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0b0e12]/95 px-4 backdrop-blur-xl lg:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#c3f5d9] text-[#102119]"><Icon name="Sparkles" size={14} /></span>
          <span className="text-sm font-semibold tracking-tight text-[#eef5f0]">Cortex</span>
        </div>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar view={view} setView={setView} chats={chats} chatId={chatId} openChat={openChat} onNewChat={newChat} onRefreshChats={() => setChats(loadChats())} onCtxMenu={openCtxMenu} />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === 'playground' && <PlaygroundView onNeedModels={() => setView('models')} onCtxMenu={openCtxMenu} chatId={chatId} onChatIdChange={setChatId} />}
          {view === 'models' && <ModelsView onCtxMenu={openCtxMenu} />}
          {view === 'connections' && <ConnectionsView onCtxMenu={openCtxMenu} />}
          {view === 'memory' && <MemoryView onCtxMenu={openCtxMenu} />}
          {view === 'history' && <HistoryView chats={chats} openChat={openChat} deleteChat={removeChat} onCtxMenu={openCtxMenu} />}
        </main>
      </div>
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />}
    </div>
  );
}
