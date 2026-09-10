import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../../Icon';
import { childrenOf, readEntryContent } from '../../../../lib/fileSystem';
import { allModels, loadModelMeta, getTier, downloadedModelFor, tierModel } from '../../../../lib/ai/models';
import { AI_PROVIDERS, chatCompletion, loadKeys, modelsForProvider, getSelectedModel, setSelectedModel, visibleProviders } from '../../../../lib/ai/providers';
import { stripToolBlocks, MODES, MODE_ORDER } from '../../../../lib/ai/agent';
import { callTrusted } from '../../../../lib/ai/apiManager';
import { buildCodeDoc } from '../../../../lib/codeApi';
import { storage } from '../../../../lib/storage';
import { extractCodeCalls, cleanAssistant, safeMarkdown } from './ChatHelpers';
import { ContextRing, TraceList } from './TraceViz';
import { PROJECTS_ID } from './constants';
import { findByPath } from './treeUtils';
import { diffLines } from './diffUtils';

export default function ChatPanel({ tree, active, onStageWrite, onLog, onExplore, onCtxMenu }) {
  const [mode, setMode] = useState('agent');
  const [provider, setProvider] = useState(() => (downloadedModelFor(getTier()) ? 'local' : loadKeys().groq ? 'groq' : 'builtin'));
  const [cloudModel, setCloudModel] = useState(() => '');
  const [localModel, setLocalModel] = useState(() => storage.get('ai-local-model', ''));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState([]); // live agentic trace (thoughts + tool results)
  const [plan, setPlan] = useState(null); // { writes: [{path,content}], text }
  const [ctxUsed, setCtxUsed] = useState(0);
  const ctxLimit = storage.get('ai-ctx', 8192);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages, busy]);

  const downloadedOptions = allModels().filter(m => loadModelMeta()[m.id]?.downloaded);
  const tierResolved = downloadedModelFor(getTier()) || allModels().find(m => m.id === tierModel(getTier()).modelId);
  const localTarget = localModel && allModels().find(m => m.id === localModel) ? localModel : (tierResolved?.id || getTier());

  const runModel = msgs => (provider === 'local'
    ? (async () => { const rt = await import('../../../../lib/ai/modelRuntime'); await rt.ensureRuntime(localTarget); return rt.localChat(msgs, { maxTokens: 3072 }); })()
    : chatCompletion(provider, msgs, { model: cloudModel || getSelectedModel(provider) }));
  const estCtx = arr => Math.round(arr.reduce((s, m) => s + ((m.content || '').length), 0) / 4);

  // Hand the model its workspace so it always knows a project exists and what to inspect.
  const workspaceCtx = useMemo(() => {
    const roots = tree.filter(e => e.parentId === PROJECTS_ID);
    if (!roots.length) return 'The workspace currently has no projects. You can create files/folders with code.createFile / code.createFolder.';
    const lines = roots.map(r => {
      const kids = childrenOf(tree, r.id).slice(0, 24).map(k => `${k.name}${k.type === 'folder' ? '/' : ''}`).join(', ');
      return `- ${r.name}/ → [${kids}]`;
    });
    return `Workspace projects (the FIRST segment of every code.* path):\n${lines.join('\n')}\nAlways inspect with code.list / code.read before answering questions about a repo.`;
  }, [tree]);

  const READS = ['code.read', 'code.readMany', 'code.list'];
  const spec = MODES[mode];

  // Execute one tool call → { result (for the model), item (for the trace UI) }.
  const actOnCall = async (c, planWrites) => {
    const isRead = READS.includes(c.api);
    if (isRead && !spec.read) return { result: `${c.api} → not available in ${spec.label} mode`, item: { kind: 'error', text: `${c.api} not available in ${spec.label} mode` } };
    if (!isRead && spec.write === 'none') return { result: `${c.api} → not permitted in ${spec.label} mode (read-only)`, item: { kind: 'error', text: `${c.api} not permitted in ${spec.label} mode` } };
    const path = c.params?.path || (c.params?.paths || []).join(', ');
    const diffStats = async p => {
      let adds = 0; let dels = 0;
      if (c.params?.content != null) {
        const entry = findByPath(tree, p);
        const current = entry && entry.type !== 'folder' ? String(await readEntryContent(entry) ?? '') : '';
        const d = diffLines(current, c.params.content);
        adds = d.filter(x => x.type === 'add').length; dels = d.filter(x => x.type === 'del').length;
      }
      return { adds, dels };
    };
    // Plan mode collects writes without executing them.
    if (!isRead && spec.write === 'plan') {
      const { adds, dels } = await diffStats(c.params.path);
      planWrites.push({ path: c.params.path, content: c.params.content });
      return { result: `${c.api}(${c.params.path}) → planned`, item: { kind: 'write', api: c.api, path: c.params.path, adds, dels, status: 'Planned' } };
    }
    try {
      const r = await callTrusted(c.api, c.params);
      onLog(`${c.api} ✓`);
      if (isRead) {
        const body = typeof r === 'string' ? r : JSON.stringify(r);
        if (c.api === 'code.read' && c.params?.path) onExplore?.(c.params.path);
        return { result: `${c.api}(${JSON.stringify(c.params)}) →\n${body.slice(0, 1200)}`, item: { kind: 'explore', api: c.api, path } };
      }
      const { adds, dels } = await diffStats(path);
      return { result: `${c.api}(${path}) → applied`, item: { kind: 'write', api: c.api, path, adds, dels, status: 'Applied' } };
    } catch (err) {
      onLog(`${c.api} ✗ ${err.message}`);
      return { result: `${c.api} → error: ${err.message}`, item: { kind: 'error', text: `${c.api} ✗ ${err.message}` } };
    }
  };

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    setInput(''); setBusy(true); setPlan(null); setWorking([]);
    const userMsg = { role: 'user', content: text };
    const ctx = active ? `\n\nOpen file ${active.path}:\n\`\`\`\n${active.content.slice(0, 6000)}\n\`\`\`` : '';
    const toolDoc = (spec.read || spec.write !== 'none') ? buildCodeDoc() : '';
    const system = `${spec.prompt}\n${toolDoc}\n${workspaceCtx}\nWhen done, give a single concise final answer as plain text (no api block). Never repeat a paragraph.`;
    const messagesArr = [
      { role: 'system', content: system },
      ...messages.slice(-12), userMsg, { role: 'user', content: ctx || '(no file open)' },
    ];
    setCtxUsed(estCtx(messagesArr));
    setMessages(p => [...p, userMsg]);
    const planWrites = []; const trace = [];
    const push = item => { trace.push(item); setWorking([...trace]); };
    let last = Date.now();
    try {
      for (let step = 0; step < 6; step++) {
        let reply;
        try { reply = await runModel(messagesArr); } catch (err) { setMessages(p => [...p, { role: 'assistant', content: `⚠️ Model error: ${err.message}`, trace: [...trace] }]); break; }
        const calls = extractCodeCalls(reply);
        const thought = (stripToolBlocks(reply) || '').trim();
        // Only trace a thought for intermediate steps; a tool-free reply IS the
        // final answer and is rendered once as the message body (not twice).
        if (thought && calls.length) push({ kind: 'think', text: thought, secs: Math.max(1, Math.round((Date.now() - last) / 1000)) });
        last = Date.now();
        // Chat mode is tool-free: answer directly.
        if (!spec.read && spec.write === 'none') { setMessages(p => [...p, { role: 'assistant', content: reply, trace: [...trace] }]); break; }
        if (!calls.length) { setMessages(p => [...p, { role: 'assistant', content: reply, trace: [...trace] }]); break; }
        const results = [];
        for (const c of calls) { const { result, item } = await actOnCall(c, planWrites); results.push(result); push(item); }
        messagesArr.push({ role: 'assistant', content: reply });
        messagesArr.push({ role: 'user', content: `Tool results:\n${results.join('\n')}\nReason over these. Call more tools if you need more information, or give your final answer as plain text with NO api block when ready.` });
        setCtxUsed(estCtx(messagesArr));
        if (step === 5) { const fin = await runModel(messagesArr); setMessages(p => [...p, { role: 'assistant', content: fin, trace: [...trace] }]); }
      }
      if (mode === 'plan' && planWrites.length) setPlan({ text: 'Plan ready — review the files and apply when ready.', writes: planWrites });
    } catch (err) {
      setMessages(p => [...p, { role: 'assistant', content: `⚠️ ${err.message}` }]);
    } finally { setBusy(false); setWorking([]); }
  };

  const applyPlan = async () => {
    if (!plan) return;
    for (const w of plan.writes) onStageWrite(w.path, w.content);
    setMessages(p => [...p, { role: 'assistant', content: `Staged ${plan.writes.length} file diff(s) — review each in the editor and Accept or Reject.` }]);
    setPlan(null);
  };

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-[#3a3a3a] bg-[#252526]">
      <div className="flex items-center gap-2 border-b border-[#3a3a3a] px-3 py-2">
        <Icon name="Bot" size={14} className="text-[#3794ff]" /><span className="text-[12px] font-semibold text-white">Chat</span>
        <span className="ml-auto flex items-center gap-1 text-[11px]">
          <ContextRing used={ctxUsed} limit={ctxLimit} />
          {MODE_ORDER.map(m => (
            <button key={m} className={`rounded px-2 py-0.5 ${mode === m ? 'bg-[#0e639c] text-white' : 'text-white/50 hover:bg-[#3a3a3a]'}`} onClick={() => setMode(m)}>{MODES[m].label}</button>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-[#3a3a3a] px-3 py-1.5">
        <select className="rounded border border-[#3a3a3a] bg-[#3c3c3c] px-1 py-0.5 text-[11px]" value={provider} onChange={e => { setProvider(e.target.value); setCloudModel(''); }}>
          <option value="local">On-device</option>
          {Object.entries(visibleProviders()).filter(([id]) => id !== 'builtin').map(([id, m]) => <option key={id} value={id}>{m.label}{!loadKeys()[id] && m.needsKey ? ' (no key)' : ''}</option>)}
        </select>
        {provider === 'local' && (
          <select className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#3c3c3c] px-1 py-0.5 text-[11px]" value={localTarget} onChange={e => { setLocalModel(e.target.value); storage.set('ai-local-model', e.target.value); }}>
            {downloadedOptions.length === 0 && <option value={localTarget}>No models</option>}
            {downloadedOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {provider !== 'local' && modelsForProvider(provider).length > 0 && (
          <select className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#3c3c3c] px-1 py-0.5 text-[11px]" value={cloudModel || getSelectedModel(provider)} onChange={e => { setCloudModel(e.target.value); setSelectedModel(provider, e.target.value); }}>
            {modelsForProvider(provider).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-[12.5px]">
        {messages.length === 0 && <p className="text-white/40">Ask the AI to read, plan, or edit your project. It always has the full code.* tool set.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`rounded p-2 ${m.role === 'user' ? 'bg-[#0e4a6e]' : 'bg-[#2d2d2d]'}`} onContextMenu={event => onCtxMenu?.(event, [
            { id: 'copy', label: 'Copy', icon: 'Copy', action: () => navigator.clipboard?.writeText(m.content) },
            { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => setMessages(prev => prev.filter((_, idx) => idx !== i)) },
            ...(m.role === 'assistant' ? [{ id: 'insert', label: 'Insert code into editor', icon: 'FileCode', action: () => { const code = m.content.match(/```[\s\S]*?```/g); if (code) onStageWrite(active?.path || 'untitled.js', code.join('\n').replace(/```\w*\n?|```/g, '')); } }] : []),
          ])}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/40">{m.role}</div>
            {m.trace && m.trace.length > 0 && <div className="mb-1.5"><TraceList items={m.trace} onExplore={onExplore} /></div>}
            {m.role === 'assistant'
              ? <div className="md-body text-[12.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: safeMarkdown(cleanAssistant(m.content)) }} />
              : <div className="whitespace-pre-wrap">{m.content}</div>}
          </div>
        ))}
        {busy && (
          <div className="rounded border border-[#3794ff]/30 bg-[#3794ff]/5 p-2 text-[11.5px]">
            <div className="mb-1 flex items-center gap-1 font-semibold text-[#3794ff]"><Icon name="Loader2" size={12} className="animate-spin" /> Thinking & using tools…</div>
            {working.length === 0 ? <div className="text-white/40">…</div> : <TraceList items={working} onExplore={onExplore} />}
          </div>
        )}
        {plan && (
          <div className="rounded border border-[#3794ff]/40 bg-[#3794ff]/10 p-2">
            <div className="mb-1 text-[11px] font-semibold text-[#3794ff]">Plan — {plan.writes.length} file(s)</div>
            {plan.writes.map((w, i) => <div key={i} className="font-mono text-[11px] text-white/70">{w.path}</div>)}
            <button className="mt-2 flex items-center gap-1 rounded bg-[#0e639c] px-2 py-1 text-[11px] text-white" onClick={applyPlan}><Icon name="Play" size={11} /> Apply plan</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="border-t border-[#3a3a3a] p-2" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2 rounded border border-[#3a3a3a] bg-[#3c3c3c] p-2">
          <textarea className="max-h-28 min-h-[36px] flex-1 resize-y bg-transparent text-[12.5px] outline-none" placeholder="Describe what to build…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="rounded bg-[#0e639c] p-1.5 text-white hover:bg-[#1177bb]" disabled={busy || !input.trim()}><Icon name="Send" size={14} /></button>
        </div>
      </form>
    </div>
  );
}
