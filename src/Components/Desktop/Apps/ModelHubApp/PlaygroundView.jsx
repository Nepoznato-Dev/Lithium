import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, chatCompletion, streamChatCompletion, loadKeys, visibleProviders, modelsForProvider, getSelectedModel, setSelectedModel, TAG_COLORS, getBestModelForTier } from '../../../../lib/ai/providers';
import { buildWeatherReport, fetchWeather, requestLocation } from '../../../../lib/deviceContext';
import { allModels, downloadedModelFor, getModel, getTier, loadModelMeta, tierModel, TIERS, autoSelectTier } from '../../../../lib/ai/models';
import { storage } from '../../../../lib/storage';
import { renderMarkdown } from '../../../../lib/markdown';
import { getCatalog } from '../../../../lib/ai/apiManager';
import { extractApiCalls, extractWidgetBlocks, stripToolBlocks, deleteChat, loadChats, makeChatId, upsertChat, MODES, CORTEX_MODE_ORDER, getCortexMode, setCortexMode } from '../../../../lib/ai/agent';
import { backendBuildContext, backendWebSearch } from '../../../../lib/backendApi';
import { loadTree, readEntryContent } from '../../../../lib/fileSystem';
import Icon from '../../../Icon';
import { WidgetBlockChips, ApiCallChips } from './WidgetApiChips';
import { buildDevicePrompt } from './prompts';
import WelcomeScreen from './WelcomeScreen';

/* ── Tier icons for inline buttons ── */
const TIER_ICONS = {
  auto: 'Sparkles',
  lite: 'Snowflake',
  efficient: 'Cpu',
  performance: 'Activity',
  ultra: 'Zap',
};

/** Resolve the effective tier: if 'auto', pick based on message; otherwise use as-is. */
function resolveTier(selectedTier, messageText) {
  if (selectedTier !== 'auto') return selectedTier;
  return autoSelectTier(messageText);
}

/* ── Cloud model picker — scrollable vertical list of provider models ── */
function CloudModelPicker({ provider, value, onChange }) {
  const models = modelsForProvider(provider);
  if (!models.length) return null;
  const selected = models.find(m => m.id === value);
  return (
    <div className="space-y-1.5">
      <div className="max-h-[220px] overflow-y-auto rounded-lg border bg-white" style={{ borderColor: '#e8e4dd' }}>
        {models.map(m => {
          const active = m.id === value;
          const tagColor = TAG_COLORS[m.tag] || '#8E8C99';
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 ${
                active
                  ? 'border-l-2' 
                  : 'border-l-2 border-transparent hover:bg-[#faf8f5]'
              }`}
              style={active ? { borderLeftColor: '#4a9e6d', background: '#eef7f1' } : {}}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[12px] font-medium truncate ${active ? 'text-[#4a9e6d]' : 'text-[#2d2d2d]'}`}>{m.name}</span>
                  {m.tag && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                      style={{ background: `${tagColor}18`, color: tagColor }}>{m.tag}</span>
                  )}
                </div>
                <span className={`text-[10px] ${active ? 'text-[#4a9e6d]/60' : 'text-[#9e9890]'}`}>{m.context} context</span>
              </div>
            </button>
          );
        })}
      </div>
      {selected?.desc && (
        <p className="text-[11px] leading-relaxed text-[#6b6560] pl-1">{selected.desc}</p>
      )}
    </div>
  );
}

export default function PlaygroundView({ onNeedModels, onCtxMenu, chatId, onChatIdChange, onNavigateModels }) {
  const [provider, setProvider] = useState(() => (downloadedModelFor(getTier()) ? 'local' : loadKeys().groq ? 'groq' : 'builtin'));
  const [cloudModel, setCloudModel] = useState(() => getSelectedModel(provider));
  const [localModel, setLocalModel] = useState(() => storage.get('ai-local-model', ''));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(() => {
    const pending = sessionStorage.getItem('lithium:cortex-pending-prompt') || '';
    sessionStorage.removeItem('lithium:cortex-pending-prompt');
    return pending;
  });
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [effort, setEffort] = useState(() => storage.get('ai-effort', 'medium'));
  const [contextWindow, setContextWindow] = useState(() => storage.get('ai-context-window', 8192));
  const [webMode, setWebMode] = useState(() => storage.get('ai-web-mode', 'off'));
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [tier, setTierState] = useState(getTier());
  const [deviceControl, setDeviceControl] = useState(() => storage.get('ai-device-control', false));
  const [mode, setMode] = useState(getCortexMode);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [apiLines, setApiLines] = useState('');
  const [chats, setChats] = useState(loadChats);
  const [tierDropdownOpen, setTierDropdownOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState('ask');
  const scrollRef = useRef(null);
  const reportRef = useRef(null);
  const tierDropdownRef = useRef(null);

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

  const exportChatToFile = async () => {
    if (messages.length === 0) return;
    try {
      const { exportSessionToFile } = await import('../../../../lib/services/aiService');
      const { createSession, appendMessage, getSession } = await import('../../../../lib/services/aiService');
      const title = chats.find(c => c.id === chatId)?.title || 'New conversation';
      const sid = createSession({ title });
      for (const msg of messages) appendMessage(sid, msg);
      await exportSessionToFile(sid);
      window.dispatchEvent(new CustomEvent('lithium:notify', { detail: { title: 'Conversation saved', body: 'Exported to /Documents/AI/', type: 'success' } }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!deviceControl) return undefined;
    let active = true;
    const cat = getCatalog();
    if (!active) return;
    setApiLines(cat.map(s => {
      const p = (s.params || []).map(x => `${x.name}${x.required ? '' : '?'}`).join(', ');
      return `- ${s.api}(${p}) — ${s.desc}${s.callers.includes('widget') ? '' : ' [restricted]'}`;
    }).join('\n'));
    return () => { active = false; };
  }, [deviceControl]);

  useEffect(() => {
    if (provider !== 'local' && provider !== 'builtin') setCloudModel(getSelectedModel(provider));
  }, [provider]);

  const systemPrompt = () => {
    const modePrompt = MODES[mode]?.prompt || '';
    const base = modePrompt
      ? `${modePrompt}\n\nReasoning effort: ${effort}.`
      : `You are Lithium Assistant. Answer in markdown. Reasoning effort: ${effort}.`;
    return base +
      (webMode === 'research' ? ' Perform deep research: organize the answer as findings, evidence, uncertainties, and next steps. Use current web sources when the selected provider supports web access.' : webMode === 'search' ? ' Use current web context when available and clearly separate sourced claims from your own reasoning.' : '') +
      (attachedFiles.length ? ` The user attached these local files: ${attachedFiles.map(f => f.name).join(', ')}. Use their extracted contents as context.` : '') +
      (deviceControl && mode !== 'chat' ? buildDevicePrompt(apiLines) : '');
  };

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

  // Close tier dropdown when clicking outside
  useEffect(() => {
    if (!tierDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (tierDropdownRef.current && !tierDropdownRef.current.contains(e.target)) {
        setTierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tierDropdownOpen]);

  // Attach copy buttons to rendered code blocks
  useEffect(() => {
    if (!scrollRef.current) return;
    const blocks = scrollRef.current.querySelectorAll('.md-body pre');
    blocks.forEach(pre => {
      if (pre.dataset.copyBtn) return;
      pre.dataset.copyBtn = '1';
      pre.style.position = 'relative';
      const btn = document.createElement('button');
      btn.textContent = 'Copy';
      btn.style.cssText = 'position:absolute;right:6px;top:6px;border-radius:4px;background:#eae6df;padding:2px 8px;font-size:10px;color:#6b6560;opacity:0;transition:opacity 0.15s;border:1px solid #e8e4dd;';
      btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
      btn.addEventListener('mouseleave', () => btn.style.opacity = '0');
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent;
        navigator.clipboard?.writeText(code);
        btn.textContent = 'Copied!';
        btn.style.background = '#eef7f1';
        btn.style.color = '#4a9e6d';
        setTimeout(() => { btn.textContent = 'Copy'; btn.style.background = '#eae6df'; btn.style.color = '#6b6560'; }, 1500);
      });
      pre.addEventListener('mouseenter', () => btn.style.opacity = '1');
      pre.addEventListener('mouseleave', () => btn.style.opacity = '0');
      pre.appendChild(btn);
    });
  });

  const startEdit = (idx) => { setEditingIdx(idx); setEditDraft(messages[idx].content); };
  const commitEdit = () => {
    if (editingIdx === null) return;
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    const truncated = messages.slice(0, editingIdx);
    setMessages(truncated);
    setEditingIdx(null);
    setEditDraft('');
    send(trimmed);
  };
  const branchFrom = (idx) => {
    const branchMessages = messages.slice(0, idx + 1);
    const newId = makeChatId();
    upsertChat({ id: newId, title: (branchMessages[0]?.content || 'Branch').slice(0, 42), messages: branchMessages, provider });
    onChatIdChange(newId);
    setMessages(branchMessages);
  };

  const push = (role, content) => setMessages(prev => [...prev, { role, content }]);
  const downloadedOptions = useMemo(() => allModels().filter(m => loadModelMeta()[m.id]?.downloaded), []);
  const tierResolved = downloadedModelFor(tier) || getModel(tierModel(tier).modelId);
  const localTarget = localModel && getModel(localModel) ? localModel : (tierResolved?.id || tier);

  const send = async text => {
    const raw = typeof text === 'string' ? text : input;
    const trimmed = String(raw || '').trim();
    if (!trimmed || busy) return;
    // Resolve effective tier: if 'auto', pick based on message complexity
    const effectiveTier = resolveTier(tier, trimmed);
    setInput('');
    push('user', trimmed);
    setBusy(true);
    try {
      if (provider === 'local') {
        // Use effective tier to pick local model
        const effectiveTierModel = downloadedModelFor(effectiveTier) || getModel(tierModel(effectiveTier).modelId);
        const rtTarget = localModel && getModel(localModel) ? localModel : (effectiveTierModel?.id || effectiveTier);
        const rt = await import('../../../../lib/ai/modelRuntime');
        try { await rt.ensureRuntime(rtTarget); }
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
        const reply = await streamChatCompletion(provider, req, {
          model: provider !== 'local' && provider !== 'builtin' ? (cloudModel || (tier === 'auto' ? getBestModelForTier(effectiveTier, provider) : getSelectedModel(provider))) : undefined,
          onToken: (_chunk, full) => {
            setMessages(prev => {
              const n = [...prev];
              const last = n[n.length - 1];
              if (last && last.role === 'assistant') n[n.length - 1] = { ...last, content: full };
              else n.push({ role: 'assistant', content: full });
              return n;
            });
          },
        });
        if (!reply) push('assistant', '(empty response)');
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
          ], { model: cloudModel || getSelectedModel(provider) });
          push('assistant', reply || report); return;
        } catch (err) { push('assistant', `⚠️ ${AI_PROVIDERS[provider].label} failed (${err.message}) — showing raw report.\n\n${report}`); return; }
      }
      push('assistant', report);
    } catch (err) { push('assistant', `⚠️ Could not build report: ${err.message}`); }
    finally { setBusy(false); }
  };
  reportRef.current = deviceReport;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Messages — Qoder-style layout */}
      <div ref={scrollRef} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 py-4" onContextMenu={event => onCtxMenu?.(event, [
        { id: 'paste', label: 'Paste', icon: 'Clipboard', action: () => navigator.clipboard?.readText().then(t => t && setInput(prev => prev + t)) },
        { id: 'clear', label: 'Clear conversation', icon: 'Trash2', danger: true, disabled: messages.length === 0, action: () => { setMessages([]); onChatIdChange(makeChatId()); } },
        { id: 'new-chat', label: 'New chat', icon: 'Plus', action: () => { setMessages([]); onChatIdChange(makeChatId()); } },
      ])}>
        {messages.length === 0 && (
          <WelcomeScreen onSelectPrompt={text => setInput(text)} />
        )}
        {messages.map((msg, i) => {
          const apiCalls = msg.role === 'assistant' ? extractApiCalls(msg.content) : [];
          const widgets = msg.role === 'assistant' ? extractWidgetBlocks(msg.content) : [];
          const isEditing = editingIdx === i;
          return (
            <div key={i} className={`group flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} ${i > 0 ? 'mt-4' : ''}`} onContextMenu={event => onCtxMenu?.(event, msg.role === 'user' ? [
              { id: 'copy', label: 'Copy text', icon: 'Copy', action: () => navigator.clipboard?.writeText(msg.content) },
              { id: 'edit', label: 'Edit', icon: 'Pencil', action: () => startEdit(i) },
              { id: 'branch', label: 'Branch from here', icon: 'GitBranch', action: () => branchFrom(i) },
              { id: 'delete', label: 'Delete message', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, j) => j !== i)) },
            ] : [
              { id: 'copy-md', label: 'Copy markdown', icon: 'Copy', action: () => navigator.clipboard?.writeText(msg.content) },
              { id: 'copy-text', label: 'Copy plain text', icon: 'FileText', action: () => navigator.clipboard?.writeText(stripToolBlocks(msg.content).replace(/[#*_`~\x5b\x5d]/g, '')) },
              { id: 'regen', label: 'Regenerate', icon: 'RotateCw', disabled: busy, action: () => { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) send(last.content); } },
              { id: 'branch', label: 'Branch from here', icon: 'GitBranch', action: () => branchFrom(i) },
              { id: 'delete', label: 'Delete message', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, j) => j !== i)) },
            ])}>
              {/* Avatar */}
              {msg.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#4a9e6d]" style={{ background: '#eef7f1' }}>
                  <Icon name="Sparkles" size={14} />
                </div>
              )}
              {/* Message body */}
              <div className={`min-w-0 ${msg.role === 'user' ? 'max-w-[80%]' : 'flex-1'}`}>
                {/* Name label for assistant */}
                {msg.role === 'assistant' && (
                  <p className="mb-1 text-xs font-medium text-[#4a9e6d]">Cortex</p>
                )}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#2d2d2d] outline-none focus:border-[#4a9e6d]/40" style={{ borderColor: '#ddd9d2' }} value={editDraft} onChange={e => setEditDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') { setEditingIdx(null); } }} autoFocus rows={Math.min(editDraft.split('\n').length + 1, 8)} />
                    <div className="flex justify-end gap-2">
                      <button className="rounded-md px-3 py-1 text-xs text-[#6b6560] hover:bg-[#faf8f5]" onClick={() => setEditingIdx(null)}>Cancel</button>
                      <button className="rounded-md px-3 py-1 text-xs font-medium text-white" style={{ background: '#4a9e6d' }} onClick={commitEdit}>Send</button>
                    </div>
                  </div>
                ) : msg.role === 'assistant' ? (
                  <>
                    <div className="md-body text-[13px] leading-relaxed text-[#2d2d2d]" dangerouslySetInnerHTML={{ __html: renderMarkdown(stripToolBlocks(msg.content)) }} />
                    {apiCalls.length > 0 && <ApiCallChips calls={apiCalls} />}
                    {widgets.length > 0 && <WidgetBlockChips blocks={widgets} />}
                  </>
                ) : (
                  <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed text-[#2d2d2d]" style={{ background: '#eae6df' }}>
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>
                )}
                {/* Action buttons on hover */}
                {!isEditing && (
                  <div className={`mt-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' && (
                      <button className="rounded p-1 text-[#9e9890]/60 hover:bg-[#faf8f5] hover:text-[#2d2d2d]" onClick={() => startEdit(i)} title="Edit"><Icon name="Pencil" size={11} /></button>
                    )}
                    {msg.role === 'assistant' && (
                      <button className="rounded p-1 text-[#9e9890]/60 hover:bg-[#faf8f5] hover:text-[#2d2d2d]" onClick={() => navigator.clipboard?.writeText(msg.content)} title="Copy"><Icon name="Copy" size={11} /></button>
                    )}
                    <button className="rounded p-1 text-[#9e9890]/60 hover:bg-[#faf8f5] hover:text-[#2d2d2d]" onClick={() => branchFrom(i)} title="Branch"><Icon name="GitBranch" size={11} /></button>
                    {msg.role === 'assistant' && !busy && (
                      <button className="rounded p-1 text-[#9e9890]/60 hover:bg-[#faf8f5] hover:text-[#2d2d2d]" onClick={() => { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) send(last.content); }} title="Regenerate"><Icon name="RotateCw" size={11} /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-[#9e9890]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#4a9e6d]" style={{ background: '#eef7f1' }}><Icon name="Sparkles" size={14} /></span>
            <span className="animate-pulse">Thinking{thinking ? ` at ${effort} effort` : ''}…</span>
          </div>
        )}
      </div>

      {/* Input area — Qoder style: large rounded container + toolbar */}
      <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pb-3 pt-2">
        <input id="cortex-file-input" type="file" multiple className="hidden" onChange={attachFiles} />
        {/* Large rounded input container */}
        <div className="rounded-2xl border bg-white transition-colors focus-within:shadow-md" style={{ borderColor: '#e0ddd7' }}>
          <textarea
            className="min-h-[80px] w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 py-3.5 text-[14px] leading-relaxed text-[#2d2d2d] outline-none placeholder:text-[#9e9890]"
            placeholder="Everything starts from here..." value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
        </div>
        {/* Toolbar row below input — Qoder style */}
        <div className="mt-1.5 flex items-center gap-1 px-1">
          {/* Plus button */}
          <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[#6b6560] hover:bg-[#faf8f5] transition-colors" style={{ borderColor: '#ddd9d2' }}>
            <Icon name="Plus" size={14} />
          </button>
          {/* Attach */}
          <label className="inline-flex cursor-pointer items-center rounded-lg p-1.5 text-[#9e9890] hover:bg-[#faf8f5] hover:text-[#2d2d2d] transition-colors" title="Attach files">
            <Icon name="Paperclip" size={14} />
          </label>
          {/* Ask for approval dropdown */}
          <select
            className="appearance-none cursor-pointer rounded-lg border bg-white px-2.5 py-1.5 text-[12px] text-[#6b6560] outline-none transition-colors hover:bg-[#faf8f5]"
            style={{ borderColor: '#e8e4dd', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239e9890' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 6px center', backgroundRepeat: 'no-repeat', paddingRight: '24px' }}
            value={approvalMode}
            onChange={e => setApprovalMode(e.target.value)}
          >
            <option value="ask">Ask for approval</option>
            <option value="auto">Auto-approve</option>
            <option value="manual">Manual only</option>
          </select>
          {/* Spacer */}
          <div className="flex-1" />
          <select
            aria-label="AI provider"
            className="max-w-[130px] cursor-pointer rounded-lg border bg-white px-2 py-1.5 text-[12px] text-[#6b6560] outline-none transition-colors hover:bg-[#faf8f5]"
            style={{ borderColor: '#e8e4dd' }}
            value={provider}
            onChange={event => setProvider(event.target.value)}
          >
            <option value="builtin">On-device</option>
            <option value="local">Local model</option>
            {Object.entries(visibleProviders()).filter(([id]) => id !== 'builtin').map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
          </select>
          {/* Tier button — Qoder style with star icon */}
          <div className="relative" ref={tierDropdownRef}>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#6b6560] outline-none transition-colors hover:bg-[#faf8f5]"
              style={{ borderColor: '#e8e4dd' }}
              onClick={() => setTierDropdownOpen(v => !v)}
            >
              <Icon name="Sparkles" size={12} className="text-[#4a9e6d]" />
              {TIERS.find(t => t.id === tier)?.label || 'Efficient'}
              <Icon name="ChevronDown" size={10} className="text-[#9e9890]" />
            </button>
            {/* Custom tier dropdown */}
            {tierDropdownOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-[290px] rounded-xl border bg-white shadow-lg" style={{ borderColor: '#e8e4dd' }}>
                {/* Off-peak discount banner */}
                <div className="rounded-t-xl bg-[#eef7f1] px-4 py-2 text-[11px] text-[#4a9e6d]">
                  <Icon name="Clock" size={11} className="mr-1 inline" />
                  Off-peak discount starts in 10:29:46
                </div>
                {modelsForProvider(provider).length > 0 && (
                  <div className="border-b px-3 py-2.5" style={{ borderColor: '#e8e4dd' }}>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9e9890]">{AI_PROVIDERS[provider]?.label} model</p>
                    <CloudModelPicker provider={provider} value={cloudModel} onChange={modelId => { setCloudModel(modelId); setSelectedModel(provider, modelId); }} />
                  </div>
                )}
                {/* Tier options */}
                <div className="max-h-[200px] overflow-y-auto py-1">
                  {[
                    { id: 'auto', label: 'Auto', desc: 'Smartly select the optimal model, balancing performance and cost', multiplier: '1x', icon: 'Sparkles' },
                    { id: 'ultra', label: 'Ultimate', desc: 'Deep reasoning for complex work', multiplier: '1.6x', icon: 'Zap' },
                    { id: 'performance', label: 'Performance', desc: 'Advanced reasoning with high output quality', multiplier: '1.1x', icon: 'Activity' },
                    { id: 'efficient', label: 'Efficient', desc: 'Balanced quality and speed', multiplier: '0x', icon: 'Cpu' },
                    { id: 'lite', label: 'Lite', desc: 'Basic reasoning available on Free (may be slower during peak)', multiplier: '0x', icon: 'Snowflake' },
                  ].map(t => {
                    const active = t.id === tier;
                    return (
                      <button
                        key={t.id}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          active ? 'bg-[#eef7f1]' : 'hover:bg-[#faf8f5]'
                        }`}
                        onClick={() => { setTierState(t.id); setTierDropdownOpen(false); }}
                      >
                        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                          active ? 'bg-[#4a9e6d] text-white' : 'bg-[#eae6df] text-[#6b6560]'
                        }`}>
                          <Icon name={t.icon} size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium ${active ? 'text-[#4a9e6d]' : 'text-[#2d2d2d]'}`}>{t.label}</span>
                            <span className="text-[10px] text-[#9e9890]">{t.multiplier}</span>
                          </div>
                          <p className="truncate text-[11px] text-[#9e9890]">{t.desc}</p>
                        </div>
                        {active && <Icon name="Check" size={14} className="shrink-0 text-[#4a9e6d]" />}
                      </button>
                    );
                  })}
                </div>
                {/* Manage models */}
                <div className="border-t px-4 py-2" style={{ borderColor: '#e8e4dd' }}>
                  <button className="flex w-full items-center gap-2 text-[12px] text-[#6b6560] hover:text-[#2d2d2d] transition-colors" onClick={() => { setTierDropdownOpen(false); onNavigateModels?.(); }}>
                    <Icon name="Settings" size={12} />
                    Manage models
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Microphone button */}
          <button className="inline-flex items-center rounded-lg p-1.5 text-[#9e9890] hover:bg-[#faf8f5] hover:text-[#2d2d2d] transition-colors" title="Voice input">
            <Icon name="Mic" size={14} />
          </button>
          {/* Send button — Qoder dark rounded */}
          <button className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30" style={{ background: '#2d2d2d' }} disabled={busy || !input.trim()} onClick={send} aria-label="Send">
            <Icon name="ArrowUp" size={15} />
          </button>
        </div>
        {attachedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((f, i) => (
              <button key={i} className="inline-flex items-center gap-1 rounded-lg bg-[#eae6df] px-2 py-1 text-[10px] text-[#6b6560] hover:bg-[#e0dcd5] transition-colors" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>
                {f.name} <Icon name="X" size={10} />
              </button>
            ))}
          </div>
        )}
        {/* Choose folder */}
        <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-[#9e9890]">
          <Icon name="Folder" size={11} />
          <span>Choose folder (optional)</span>
        </div>
      </div>
    </div>
  );
}
