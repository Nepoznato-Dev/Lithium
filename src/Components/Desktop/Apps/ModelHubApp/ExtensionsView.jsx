import { useState } from 'react';
import Icon from '../../../Icon';

const MARKETPLACE_EXTENSIONS = [
  { id: 'computer-control', name: 'Computer Use', publisher: 'Qoder', version: '1.0.0', description: 'Allow Qoder to inspect and operate desktop apps', icon: 'Monitor', installed: true, enabled: true, category: 'Automation' },
  { id: 'find-extensions', name: 'Find Extensions', publisher: 'Qoder', version: '0.1.0', description: 'Discover Qoder Skills, MCP connectors, and Plugins', icon: 'Search', installed: true, enabled: true, category: 'Discovery' },
  { id: 'knowledge-center', name: 'Knowledge Center', publisher: 'Qoder', version: '0.1.1', description: 'QMind knowledge base with notebooks and sources', icon: 'BookOpen', installed: true, enabled: true, category: 'Knowledge' },
  { id: 'security', name: 'Security Scanner', publisher: 'Qoder', version: '0.3.0', description: '3-tier security scanning: L1 Static, L2 Lightweight, L3 Deep', icon: 'Shield', installed: true, enabled: true, category: 'Security' },
  { id: 'index-settings', name: 'Workspace Index', publisher: 'Qoder', version: '0.1.0', description: 'Configure workspace indexing and search', icon: 'Database', installed: true, enabled: true, category: 'Productivity' },
  { id: 'python', name: 'Python', publisher: 'Microsoft', version: '2024.1.0', description: 'Python language support with IntelliSense, debugging', icon: 'Code', installed: false, category: 'Languages' },
  { id: 'typescript', name: 'TypeScript', publisher: 'Microsoft', version: '1.85.0', description: 'TypeScript and JavaScript support', icon: 'FileCode', installed: false, category: 'Languages' },
  { id: 'rust', name: 'Rust', publisher: 'rust-lang', version: '0.4.0', description: 'Rust language support with rust-analyzer', icon: 'Cog', installed: false, category: 'Languages' },
  { id: 'docker', name: 'Docker', publisher: 'Microsoft', version: '1.28.0', description: 'Docker container management', icon: 'Box', installed: false, category: 'DevOps' },
  { id: 'git-lens', name: 'GitLens', publisher: 'GitKraken', version: '14.8.0', description: 'Supercharge Git within VS Code', icon: 'GitBranch', installed: false, category: 'SCM' },
];

const CATEGORIES = ['All', 'Languages', 'Automation', 'Knowledge', 'Security', 'Productivity', 'DevOps', 'SCM', 'Discovery'];

export default function ExtensionsView() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [extensions, setExtensions] = useState(MARKETPLACE_EXTENSIONS);
  const [selected, setSelected] = useState(null);

  const filtered = extensions.filter(ext => {
    const matchesSearch = !search || ext.name.toLowerCase().includes(search.toLowerCase()) || ext.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || ext.category === category;
    return matchesSearch && matchesCategory;
  });

  const toggleInstall = (id) => {
    setExtensions(prev => prev.map(ext => {
      if (ext.id === id) {
        const updated = { ...ext, installed: !ext.installed, enabled: !ext.installed };
        setSelected(updated);
        return updated;
      }
      return ext;
    }));
  };

  const toggleEnabled = (id) => {
    setExtensions(prev => prev.map(ext => {
      if (ext.id === id) {
        const updated = { ...ext, enabled: !ext.enabled };
        setSelected(updated);
        return updated;
      }
      return ext;
    }));
  };

  const installedCount = extensions.filter(e => e.installed).length;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ borderColor: '#e8e4dd' }}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg text-[#4a9e6d]" style={{ background: '#eef7f1' }}>
            <Icon name="Puzzle" size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#2d2d2d]">Extensions</h2>
            <p className="text-[12px] text-[#9e9890]">{installedCount} installed</p>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="border-b px-6 py-3" style={{ borderColor: '#e8e4dd' }}>
        <div className="relative mb-3">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9e9890]" />
          <input
            type="text"
            placeholder="Search extensions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-[13px] text-[#2d2d2d] outline-none transition-colors focus:border-[#4a9e6d]/40"
            style={{ borderColor: '#e8e4dd' }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                category === cat ? 'bg-[#4a9e6d] text-white' : 'bg-[#eae6df] text-[#6b6560] hover:bg-[#e0dcd5]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Extensions list */}
        <div className="w-[320px] shrink-0 overflow-y-auto border-r" style={{ borderColor: '#e8e4dd' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Icon name="Package" size={32} className="mb-3 text-[#9e9890]/40" />
              <p className="text-[13px] text-[#9e9890]">No extensions found</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e8e4dd]">
              {filtered.map(ext => (
                <button
                  key={ext.id}
                  onClick={() => setSelected(ext)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#faf8f5] ${
                    selected?.id === ext.id ? 'bg-[#f5fbf7]' : ''
                  }`}
                >
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    ext.installed ? 'bg-[#eef7f1] text-[#4a9e6d]' : 'bg-[#eae6df] text-[#6b6560]'
                  }`}>
                    <Icon name={ext.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#2d2d2d]">{ext.name}</span>
                      {ext.installed && ext.enabled && (
                        <span className="rounded bg-[#eef7f1] px-1.5 py-0.5 text-[9px] font-medium text-[#4a9e6d]">Active</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[#9e9890]">{ext.description}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[#9e9890]">
                      <span>{ext.publisher}</span>
                      <span>•</span>
                      <span>v{ext.version}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Extension details */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${
                  selected.installed ? 'bg-[#eef7f1] text-[#4a9e6d]' : 'bg-[#eae6df] text-[#6b6560]'
                }`}>
                  <Icon name={selected.icon} size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#2d2d2d]">{selected.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-[#9e9890]">
                    <span>{selected.publisher}</span>
                    <span>•</span>
                    <span>v{selected.version}</span>
                    <span>•</span>
                    <span>{selected.category}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {selected.installed ? (
                      <>
                        <button
                          onClick={() => toggleEnabled(selected.id)}
                          className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                            selected.enabled ? 'bg-[#eae6df] text-[#2d2d2d] hover:bg-[#e0dcd5]' : 'bg-[#4a9e6d] text-white hover:bg-[#3d8a5e]'
                          }`}
                        >
                          {selected.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => toggleInstall(selected.id)}
                          className="rounded-lg bg-[#eae6df] px-4 py-2 text-[13px] font-medium text-[#2d2d2d] transition-colors hover:bg-[#e0dcd5]"
                        >
                          Uninstall
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => toggleInstall(selected.id)}
                        className="rounded-lg bg-[#4a9e6d] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#3d8a5e]"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <h4 className="mb-2 text-[13px] font-semibold text-[#2d2d2d]">Description</h4>
                <p className="text-[13px] leading-relaxed text-[#6b6560]">{selected.description}</p>
              </div>
              {selected.installed && (
                <div className="mt-6 rounded-lg border bg-[#faf8f5] p-4" style={{ borderColor: '#e8e4dd' }}>
                  <h4 className="mb-2 text-[12px] font-semibold text-[#2d2d2d]">Extension Details</h4>
                  <div className="space-y-1.5 text-[12px] text-[#6b6560]">
                    <div className="flex justify-between">
                      <span>Status</span>
                      <span className={selected.enabled ? 'text-[#4a9e6d]' : 'text-[#9e9890]'}>{selected.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Version</span>
                      <span>{selected.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Category</span>
                      <span>{selected.category}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <Icon name="Package" size={48} className="mx-auto mb-3 text-[#9e9890]/30" />
                <p className="text-[13px] text-[#9e9890]">Select an extension to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
