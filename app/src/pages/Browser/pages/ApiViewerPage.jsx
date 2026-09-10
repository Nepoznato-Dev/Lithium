/**
 * ApiViewerPage — internal API catalog viewer at lithium://api.
 * Displays all registered internal APIs grouped by namespace,
 * with parameter schemas and allowed caller information.
 */
import { useState } from 'preact/hooks';
import Icon from '../../../Components/Icon';

const _API_CATALOG = [
  { api: 'system.get_info', ns: 'system', desc: 'Build version, time and platform details', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.open_start_menu', ns: 'system', desc: 'Open the Start menu', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.close_start_menu', ns: 'system', desc: 'Close the Start menu', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.show_desktop', ns: 'system', desc: 'Minimize every open window', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.get_volume', ns: 'system', desc: 'Current taskbar volume level', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.set_volume', ns: 'system', desc: 'Set the taskbar volume level', callers: ['system','user','widget','model'], params: [{ name: 'level', type: 'number', required: true, min: 0, max: 100 }] },
  { api: 'system.notify', ns: 'system', desc: 'Show a desktop toast notification', callers: ['system','user','widget','model'], params: [
    { name: 'title', type: 'string', required: true }, { name: 'body', type: 'string', required: false },
    { name: 'tone', type: 'string', required: false, values: ['info','success','warning','error'] }] },
  { api: 'apps.list', ns: 'apps', desc: 'List every registered desktop app', callers: ['system','user','widget','model'], params: [] },
  { api: 'apps.open', ns: 'apps', desc: 'Open (or focus) a desktop app window', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'apps.close', ns: 'apps', desc: 'Close a desktop app window', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'apps.focus', ns: 'apps', desc: 'Bring an app window to the front', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'settings.get', ns: 'settings', desc: 'Read one setting (or all) by dotted path', callers: ['system','user','widget','model'], params: [{ name: 'path', type: 'string', required: false }] },
  { api: 'settings.set', ns: 'settings', desc: 'Change a setting by dotted path', callers: ['system','user','widget','model'], params: [{ name: 'path', type: 'string', required: true }, { name: 'value', type: 'any', required: true }] },
  { api: 'fs.list', ns: 'fs', desc: 'List entries of a virtual-FS folder', callers: ['system','user','widget','model'], params: [{ name: 'folder', type: 'string', required: false }] },
  { api: 'fs.read', ns: 'fs', desc: 'Read a text file content by id', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'fs.write', ns: 'fs', desc: 'Create or overwrite a text file', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }, { name: 'content', type: 'string', required: false }] },
  { api: 'fs.create_folder', ns: 'fs', desc: 'Create a folder in the virtual FS', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }] },
  { api: 'fs.delete', ns: 'fs', desc: 'Delete an entry (recursive for folders)', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'fs.tree', ns: 'fs', desc: 'Recursive overview of a folder', callers: ['system','user','widget','model'], params: [{ name: 'folder', type: 'string', required: false }] },
  { api: 'fs.append', ns: 'fs', desc: 'Append text to a file', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }, { name: 'content', type: 'string', required: false }] },
  { api: 'fs.move', ns: 'fs', desc: 'Move an entry into another folder', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'parent', type: 'string', required: true }] },
  { api: 'fs.rename', ns: 'fs', desc: 'Rename an entry', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'name', type: 'string', required: true }] },
  { api: 'weather.get', ns: 'weather', desc: 'Cached local weather', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.list_providers', ns: 'ai', desc: 'Configured AI providers', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.get_tier', ns: 'ai', desc: 'Active on-device inference tier', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.set_tier', ns: 'ai', desc: 'Switch the on-device inference tier', callers: ['system','user','widget','model'], params: [{ name: 'tier', type: 'string', required: true, values: ['lite','efficient','performance','ultra'] }] },
  { api: 'models.list', ns: 'models', desc: 'Model catalog with download status', callers: ['system','user','widget','model'], params: [] },
  { api: 'cloud.list_drives', ns: 'cloud', desc: 'Connected external cloud drives', callers: ['system','user','widget','model'], params: [] },
  { api: 'cloud.test_drive', ns: 'cloud', desc: 'Test a cloud drive credentials', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'memory.list', ns: 'memory', desc: 'All memory keys with timestamps', callers: ['system','user','widget','model'], params: [] },
  { api: 'memory.read', ns: 'memory', desc: 'Read one memory entry by key', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }] },
  { api: 'memory.write', ns: 'memory', desc: 'Store a memory entry', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }, { name: 'value', type: 'string', required: true }] },
  { api: 'memory.delete', ns: 'memory', desc: 'Delete a memory entry', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }] },
  { api: 'widgets.list', ns: 'widgets', desc: 'User widgets with enabled state', callers: ['system','user','widget','model'], params: [] },
  { api: 'widgets.set_enabled', ns: 'widgets', desc: 'Enable or disable a widget', callers: ['system','user','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'enabled', type: 'boolean', required: true }] },
];

const NS_ICONS = {
  system: 'Monitor',
  apps: 'LayoutGrid',
  settings: 'Settings',
  fs: 'FolderTree',
  weather: 'Cloud',
  ai: 'Brain',
  models: 'Box',
  cloud: 'HardDrive',
  memory: 'Database',
  widgets: 'Widget',
};

const NS_COLORS = {
  system: 'text-blue-400',
  apps: 'text-purple-400',
  settings: 'text-orange-400',
  fs: 'text-green-400',
  weather: 'text-cyan-400',
  ai: 'text-pink-400',
  models: 'text-amber-400',
  cloud: 'text-sky-400',
  memory: 'text-emerald-400',
  widgets: 'text-violet-400',
};

export default function ApiViewerPage() {
  const catalog = _API_CATALOG;
  const [query, setQuery] = useState('');
  const [expandedApi, setExpandedApi] = useState(null);

  // Group APIs by namespace
  const grouped = {};
  for (const api of catalog) {
    const ns = api.ns || 'other';
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(api);
  }

  // Filter by query
  const q = query.toLowerCase();
  const namespaces = Object.keys(grouped).sort();
  const filteredNs = namespaces.filter(ns => {
    if (!q) return true;
    return ns.includes(q) || grouped[ns].some(a =>
      a.api.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    );
  });

  const totalApis = catalog.length;
  const totalNs = namespaces.length;

  return (
    <div className="flex h-full flex-col bg-[#0f0f17]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
            <Icon name="Braces" className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Internal APIs</h2>
            <p className="text-[11px] text-white/40">
              {totalApis} APIs across {totalNs} namespaces
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            className="text-input w-full rounded-lg py-1.5 pl-9 text-xs"
            placeholder="Filter APIs by name, namespace, or description…"
            value={query}
            onInput={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* API list */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredNs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
            <Icon name="SearchX" className="h-8 w-8" />
            <p className="text-sm">No APIs match your filter</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredNs.map(ns => (
              <section key={ns}>
                {/* Namespace header */}
                <div className="mb-3 flex items-center gap-2">
                  <Icon
                    name={NS_ICONS[ns] || 'Package'}
                    className={`h-4 w-4 ${NS_COLORS[ns] || 'text-white/50'}`}
                  />
                  <h3 className="text-sm font-semibold text-white">{ns}</h3>
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/30">
                    {grouped[ns].length}
                  </span>
                </div>

                {/* API cards */}
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {grouped[ns]
                    .filter(a => !q || a.api.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q))
                    .map(api => {
                      const isExpanded = expandedApi === api.api;
                      return (
                        <button
                          key={api.api}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            isExpanded
                              ? 'border-cyan-500/30 bg-cyan-500/[0.05]'
                              : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
                          }`}
                          onClick={() => setExpandedApi(isExpanded ? null : api.api)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <code className="text-xs font-medium text-white/90">{api.api}</code>
                            <Icon
                              name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                              className="h-3 w-3 shrink-0 text-white/20"
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-white/50">{api.desc}</p>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                              {/* Callers */}
                              <div>
                                <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Callers</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {(api.callers || []).map(c => (
                                    <span key={c} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Parameters */}
                              <div>
                                <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Parameters</span>
                                {(!api.params || api.params.length === 0) ? (
                                  <p className="mt-1 text-[10px] text-white/25">None</p>
                                ) : (
                                  <div className="mt-1 space-y-1">
                                    {api.params.map(p => (
                                      <div key={p.name} className="flex items-center gap-2 text-[10px]">
                                        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-cyan-300/70">{p.name}</code>
                                        <span className="text-white/40">{p.type}</span>
                                        {p.required && <span className="rounded bg-red-500/20 px-1 text-red-300/70">required</span>}
                                        {p.values && (
                                          <span className="text-white/25">
                                            one of: {p.values.join(', ')}
                                          </span>
                                        )}
                                        {p.min !== undefined && p.max !== undefined && (
                                          <span className="text-white/25">
                                            range: {p.min}–{p.max}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
