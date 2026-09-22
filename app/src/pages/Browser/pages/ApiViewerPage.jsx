/**
 * ApiViewerPage — internal API catalog viewer at lithium://api.
 * Displays all registered internal APIs grouped by namespace,
 * with parameter schemas and allowed caller information.
 *
 * The catalog is read live from apiManager rather than mirrored here: a copy
 * drifts the moment an API is added or removed, and this page is the place
 * users trust to tell them what actually exists.
 */
import { useState } from 'preact/hooks';
import Icon from '../../../Components/Icon';
import { getCatalog } from '../../../lib/ai/apiManager';

const NS_ICONS = {
  system: 'Monitor',
  apps: 'LayoutGrid',
  settings: 'Settings',
  fs: 'Folder',
  weather: 'Cloud',
  ai: 'BrainCircuit',
  knowledge: 'Library',
  cloud: 'HardDrive',
  memory: 'Database',
  widgets: 'Puzzle',
  code: 'Code',
};

const NS_COLORS = {
  system: 'text-blue-400',
  apps: 'text-purple-400',
  settings: 'text-orange-400',
  fs: 'text-green-400',
  weather: 'text-cyan-400',
  ai: 'text-pink-400',
  knowledge: 'text-rose-400',
  cloud: 'text-sky-400',
  memory: 'text-emerald-400',
  widgets: 'text-violet-400',
  code: 'text-yellow-400',
};

export default function ApiViewerPage() {
  const catalog = getCatalog();
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
