import React, { useEffect, useMemo, useState } from 'react';

import { call, clearAudit, engineInfo, getAudit, getCatalog } from '../../../lib/ai/apiManager';
import { loadDriveConfigs } from '../../../lib/cloudDrives';
import { AI_PROVIDERS, loadKeys } from '../../../lib/ai/providers';
import { createEntry, loadTree, readEntryContent, saveTree, storeEntryContent, removeEntryDeep, updateEntry } from '../../../lib/fileSystem';
import { listWidgets, setWidgetEnabled, WIDGET_API_DOC, WIDGET_TEMPLATES, WIDGETS_FOLDER_ID } from '../../../lib/desktop/widgetRuntime';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';

const TABS = [
  { id: 'catalog', label: 'Catalog', icon: 'BookOpen' },
  { id: 'widgets', label: 'Widgets', icon: 'Blocks' },
  { id: 'external', label: 'External', icon: 'Cloud' },
  { id: 'audit', label: 'Audit', icon: 'ScrollText' },
];

const callerColor = caller => ({ system: '#22d3ee', user: '#34d399', widget: '#a78bfa', model: '#fb923c' }[caller] || '#94a3b8');

function paramsTemplate(spec) {
  const template = {};
  for (const param of spec.params || []) {
    if (param.type === 'string') template[param.name] = param.values?.[0] || '';
    else if (param.type === 'number') template[param.name] = param.min ?? 0;
    else if (param.type === 'boolean') template[param.name] = true;
    else template[param.name] = null;
  }
  return template;
}

/* ---------- Catalog tab ---------- */

function CatalogTab({ onCtxMenu }) {
  const [catalog, setCatalog] = useState([]);
  const [open, setOpen] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});

  useEffect(() => { getCatalog().then(setCatalog); }, []);

  const groups = useMemo(() => {
    const byNs = new Map();
    for (const spec of catalog) {
      if (!byNs.has(spec.ns)) byNs.set(spec.ns, []);
      byNs.get(spec.ns).push(spec);
    }
    return [...byNs.entries()];
  }, [catalog]);

  const run = async spec => {
    let params = {};
    try {
      params = JSON.parse(drafts[spec.api] || '{}');
    } catch {
      setResults(prev => ({ ...prev, [spec.api]: { ok: false, error: 'params JSON is invalid' } }));
      return;
    }
    try {
      const result = await call(spec.api, params, 'user');
      setResults(prev => ({ ...prev, [spec.api]: { ok: true, result } }));
    } catch (err) {
      setResults(prev => ({ ...prev, [spec.api]: { ok: false, error: err.message } }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] text-white/40">
        <Icon name="Plug2" size={13} /> Validation engine: <span className="font-semibold acc-text">{engineInfo().engine}</span>
        · {catalog.length} APIs · {engineInfo().handlers} handlers registered
      </div>
      {groups.map(([ns, specs]) => (
        <div key={ns} className="overflow-hidden rounded-lg border border-white/[0.07]">
          <div className="bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/50">{ns}</div>
          {specs.map(spec => (
            <div key={spec.api} className="border-t border-white/[0.05]">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/[0.04]" onClick={() => setOpen(open === spec.api ? null : spec.api)} onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
                { id: 'name', type: 'heading', label: spec.api },
                { id: 'copy-spec', label: 'Copy API spec', icon: 'Copy', action: () => navigator.clipboard?.writeText(JSON.stringify(spec, null, 2)) },
                { id: 'test', label: 'Test call', icon: 'Play', action: () => { setOpen(spec.api); run(spec); } },
                { id: 'view', label: 'View details', icon: 'Eye', action: () => setOpen(spec.api) },
              ]); }}>
                {open === spec.api ? <Icon name="ChevronDown" size={13} /> : <Icon name="ChevronRight" size={13} />}
                <span className="font-mono font-semibold text-white">{spec.api}</span>
                <span className="flex-1 truncate text-white/40">{spec.desc}</span>
                {spec.callers.map(caller => (
                  <span key={caller} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: callerColor(caller), background: `${callerColor(caller)}18` }}>{caller}</span>
                ))}
              </button>
              {open === spec.api && (
                <div className="space-y-2 bg-black/25 px-4 pb-3 pt-1">
                  {spec.params.length > 0 && (
                    <textarea
                      className="h-16 w-full rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-white/85 outline-none acc-border-focus"
                      value={drafts[spec.api] ?? JSON.stringify(paramsTemplate(spec), null, 2)}
                      onChange={event => setDrafts(prev => ({ ...prev, [spec.api]: event.target.value }))}
                      spellCheck={false}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-md btn-primary px-3 py-1.5 text-[11px]" onClick={() => run(spec)}>
                      <Icon name="Play" size={12} /> Run as user
                    </button>
                    {results[spec.api] && (
                      <pre className={`max-h-40 flex-1 overflow-auto rounded-md p-2 font-mono text-[10px] ${results[spec.api].ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-300'}`}>
                        {results[spec.api].ok
                          ? JSON.stringify(results[spec.api].result, null, 2)
                          : `✕ ${results[spec.api].error}`}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Widgets tab ---------- */

function WidgetsTab({ onCtxMenu }) {
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null); // { id, name, code }
  const [template, setTemplate] = useState(WIDGET_TEMPLATES[0].id);
  const widgets = useMemo(() => listWidgets(), [version]);

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener('lithium:widgets-changed', bump);
    window.addEventListener('lithium:fs-changed', bump);
    return () => {
      window.removeEventListener('lithium:widgets-changed', bump);
      window.removeEventListener('lithium:fs-changed', bump);
    };
  }, []);

  const addFromTemplate = () => {
    const tpl = WIDGET_TEMPLATES.find(item => item.id === template);
    if (!tpl) return;
    saveTree(createEntry(loadTree(), { name: tpl.name, type: 'text', parentId: WIDGETS_FOLDER_ID, content: tpl.code }));
  };

  const openEditor = async widget => {
    const entry = loadTree().find(item => item.id === widget.id);
    setEditing({ id: widget.id, name: widget.name, code: await readEntryContent(entry) });
  };

  const saveEditor = async () => {
    const entry = loadTree().find(item => item.id === editing.id);
    if (!entry) return;
    const updated = await storeEntryContent(entry, editing.code);
    saveTree(updateEntry(loadTree(), entry.id, updated));
    setEditing(null);
  };

  const removeWidget = widget => {
    setWidgetEnabled(widget.id, false);
    removeEntryDeep(loadTree(), widget.id).then(next => saveTree(next));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select className="rounded-md border border-white/10 bg-[#26262b] px-2 py-1.5 text-xs text-white/85 outline-none" value={template} onChange={event => setTemplate(event.target.value)}>
          {WIDGET_TEMPLATES.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name} — {tpl.description}</option>)}
        </select>
        <button className="inline-flex items-center gap-1.5 rounded-md btn-primary px-3 py-1.5 text-[11px]" onClick={addFromTemplate}>
          <Icon name="Plus" size={13} /> New widget
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-white/40">
        Widgets are local <span className="font-mono text-white/60">.widget.js</span> scripts stored in <span className="text-white/60">Documents/Widgets</span>.
        They receive <span className="font-mono text-white/60">api.call(name, params)</span>, <span className="font-mono text-white/60">on(event, fn)</span>,
        <span className="font-mono text-white/60"> every(ms, fn)</span> and <span className="font-mono text-white/60">log(...)</span>. Events: boot,
        app.opened, app.closed, startMenu.opened, startMenu.closed, volume.changed, weather.updated.
      </p>
      <details className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-white/60 hover:text-white">Widget sandbox reference (what widgets can use)</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-white/55">{WIDGET_API_DOC}</pre>
      </details>
      {widgets.length === 0 && <p className="text-xs text-white/30">No widgets yet — create one from a template above.</p>}
      <div className="space-y-1.5">
        {widgets.map(widget => (
          <div key={widget.id} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2" onContextMenu={event => onCtxMenu?.(event, [
            { id: 'name', type: 'heading', label: widget.name },
            { id: 'toggle', label: widget.enabled ? 'Disable widget' : 'Enable widget', icon: widget.enabled ? 'Power' : 'Zap', action: () => setWidgetEnabled(widget.id, !widget.enabled) },
            { id: 'edit', label: 'Edit source', icon: 'Pencil', action: () => openEditor(widget) },
            { id: 'copy-id', label: 'Copy ID', icon: 'Copy', action: () => navigator.clipboard?.writeText(widget.id) },
            { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => removeWidget(widget) },
          ])}>
            <button
              role="switch"
              aria-checked={widget.enabled}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${widget.enabled ? 'bg-cyan-400' : 'bg-white/15'}`}
              onClick={() => setWidgetEnabled(widget.id, !widget.enabled)}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${widget.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">{widget.name}</div>
              <div className="text-[10px] text-white/35">{widget.enabled ? (widget.running ? 'running' : 'enabled') : 'disabled'}</div>
            </div>
            <button className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Edit code" onClick={() => openEditor(widget)}><Icon name="Pencil" size={13} /></button>
            <button className="rounded p-1.5 text-white/50 hover:bg-red-500/15 hover:text-red-300" title="Delete widget" onClick={() => removeWidget(widget)}><Icon name="Trash2" size={13} /></button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/60 p-8" onClick={() => setEditing(null)}>
          <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#1e1e24] p-4" onClick={event => event.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Icon name="Blocks" size={15} className="acc-text" />
              <strong className="text-sm text-white">{editing.name}</strong>
              <button className="ml-auto rounded p-1 text-white/50 hover:text-white" onClick={() => setEditing(null)}><Icon name="X" size={15} /></button>
            </div>
            <textarea
              className="min-h-[280px] flex-1 resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/90 outline-none acc-border-focus"
              value={editing.code}
              onChange={event => setEditing(prev => ({ ...prev, code: event.target.value }))}
              spellCheck={false}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-md px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => setEditing(null)}>Cancel</button>
              <button className="rounded-md bg-violet-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-violet-300" onClick={saveEditor}>Save widget</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- External tab ---------- */

function ExternalTab() {
  const [version, setVersion] = useState(0);
  const [testResults, setTestResults] = useState({});
  const drives = useMemo(() => loadDriveConfigs(), [version]);
  const keys = useMemo(() => loadKeys(), [version]);

  const test = async config => {
    setTestResults(prev => ({ ...prev, [config.id]: '…' }));
    try {
      await call('cloud.test_drive', { id: config.id }, 'user');
      setTestResults(prev => ({ ...prev, [config.id]: '✓ connected' }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [config.id]: `✕ ${err.message}` }));
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50"><Icon name="Cloud" size={13} /> Cloud storage drives</h3>
        {drives.length === 0 && <p className="text-xs text-white/30">No cloud drives connected — use File Explorer → Network to mount Google Drive or OneDrive.</p>}
        <div className="space-y-1.5">
          {drives.map(config => (
            <div key={config.id} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs">
              <span className="font-semibold text-white">{config.label}</span>
              <span className="text-white/35">{config.letter}: · {config.provider}</span>
              <span className={`ml-auto text-[11px] ${String(testResults[config.id] || '').startsWith('✕') ? 'text-red-300' : 'text-emerald-300'}`}>{testResults[config.id]}</span>
              <button className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10" onClick={() => test(config)}>Test</button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50"><Icon name="KeyRound" size={13} /> AI model providers</h3>
        <div className="space-y-1.5">
          {Object.entries(AI_PROVIDERS).filter(([id]) => id !== 'builtin').map(([id, provider]) => (
            <div key={id} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs">
              <span className="font-semibold text-white">{provider.label}</span>
              <span className="font-mono text-white/35">{provider.model}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${keys[id] ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                {keys[id] ? 'KEY SAVED' : 'NO KEY'}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/35">Keys are managed in AI Hub → API Keys. Models can invoke these providers through the same API surface.</p>
      </section>
    </div>
  );
}

/* ---------- Audit tab ---------- */

function AuditTab({ onCtxMenu }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener('lithium:api-audit', bump);
    window.addEventListener('lithium:kv-ready', bump);
    return () => {
      window.removeEventListener('lithium:api-audit', bump);
      window.removeEventListener('lithium:kv-ready', bump);
    };
  }, []);
  const log = useMemo(() => getAudit(), [version]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40">{log.length} recorded calls (last 200 kept)</span>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10" onClick={clearAudit}>
          <Icon name="Trash2" size={12} /> Clear
        </button>
      </div>
      {log.length === 0 && <p className="text-xs text-white/30">No API calls recorded yet — try one in the Catalog tab.</p>}
      <div className="space-y-1">
        {log.map((entry, index) => (
          <div key={`${entry.t}-${index}`} className="flex items-center gap-2.5 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-[11px]" onContextMenu={event => onCtxMenu?.(event, [
            { id: 'copy', label: 'Copy entry', icon: 'Copy', action: () => navigator.clipboard?.writeText(`${entry.api} [${entry.caller}] ${entry.ok ? 'OK' : entry.error || ''}`) },
            { id: 'clear', label: 'Clear audit log', icon: 'Trash2', danger: true, action: clearAudit },
          ])}>
            <span className={entry.ok ? 'text-emerald-300' : 'text-red-300'}>{entry.ok ? '✓' : '✕'}</span>
            <span className="font-mono font-semibold text-white">{entry.api}</span>
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: callerColor(entry.caller), background: `${callerColor(entry.caller)}18` }}>{entry.caller}</span>
            {entry.error && <span className="truncate text-red-300/80">{entry.error}</span>}
            <span className="ml-auto shrink-0 text-white/30">{new Date(entry.t).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- App shell ---------- */

export default function ApiManagerApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [tab, setTab] = useState('catalog');
  const [refreshKey, setRefreshKey] = useState(0);
  const [menu, openMenu, closeMenu] = useContextMenu();

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#19191d] text-white">
      <div className="flex min-w-0 items-center gap-1 overflow-hidden border-b border-white/[0.07] px-3 py-2" onContextMenu={event => openMenu(event, [
        { id: 'switch', type: 'heading', label: 'Tabs' },
        ...TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon, checked: tab === t.id, action: () => setTab(t.id) })),
        { id: 'sep', type: 'separator' },
        { id: 'refresh', label: 'Refresh', icon: 'RefreshCw', action: () => setRefreshKey(k => k + 1) },
      ])}>
        <span className="mr-2 flex items-center gap-1.5 text-xs font-bold text-white/80"><Icon name="Plug2" size={14} className="acc-text" /> API Manager</span>
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              tab === id ? 'acc-soft acc-text' : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
            }`}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} size={13} /> {label}
          </button>
        ))}
        <button className="ml-auto rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white" title="Refresh" onClick={() => setRefreshKey(k => k + 1)}>
          <Icon name="RefreshCw" size={13} />
        </button>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'catalog' && <CatalogTab key={`catalog-${refreshKey}`} onCtxMenu={openMenu} />}
        {tab === 'widgets' && <WidgetsTab key={`widgets-${refreshKey}`} onCtxMenu={openMenu} />}
        {tab === 'external' && <ExternalTab key={`external-${refreshKey}`} />}
        {tab === 'audit' && <AuditTab key={`audit-${refreshKey}`} onCtxMenu={openMenu} />}
      </div>

      {/* Context menu */}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}
