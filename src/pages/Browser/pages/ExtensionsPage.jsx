/**
 * ExtensionsPage — mock extensions manager with card grid.
 */
import { useState } from 'preact/hooks';
import Icon from '../../../Components/Icon';

const MOCK_EXTENSIONS = [
  { id: '1', name: 'uBlock Origin', description: 'An efficient ad blocker', enabled: true, version: '1.52.0', permissions: ['Read/change all data'] },
  { id: '2', name: 'Dark Reader', description: 'Dark mode for every website', enabled: true, version: '4.9.72', permissions: ['Read/change all data'] },
  { id: '3', name: 'Bitwarden', description: 'Password manager', enabled: false, version: '2024.1.0', permissions: ['Read/change data on visited sites'] },
  { id: '4', name: 'Vimium', description: 'Keyboard shortcuts for navigation', enabled: false, version: '1.67.4', permissions: ['Read/change all data'] },
  { id: '5', name: 'SponsorBlock', description: 'Skip YouTube sponsor segments', enabled: true, version: '5.5.2', permissions: ['Read data on youtube.com'] },
  { id: '6', name: 'Privacy Badger', description: 'Automatically learns to block invisible trackers', enabled: false, version: '2024.1.1', permissions: ['Read/change all data'] },
];

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState(MOCK_EXTENSIONS);
  const [devMode, setDevMode] = useState(false);

  const toggleExtension = (id) => {
    setExtensions(prev => prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  return (
    <div className="flex h-full flex-col bg-[#0f0f17]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Extensions</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/50">
            <input
              type="checkbox"
              checked={devMode}
              onChange={e => setDevMode(e.target.checked)}
              className="rounded"
            />
            Developer mode
          </label>
          {devMode && (
            <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
              Load unpacked
            </button>
          )}
        </div>
      </div>

      {/* Extensions grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {extensions.map(ext => (
            <div key={ext.id} className="rounded-xl border border-white/[0.06] p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-sm font-bold text-white/60">
                    {ext.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{ext.name}</p>
                    <p className="text-[10px] text-white/30">v{ext.version}</p>
                  </div>
                </div>
                <button
                  className={`relative h-5 w-9 rounded-full transition-colors ${ext.enabled ? 'bg-orange-500' : 'bg-white/10'}`}
                  onClick={() => toggleExtension(ext.id)}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${ext.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>
              <p className="mb-2 text-xs text-white/50">{ext.description}</p>
              <p className="text-[10px] text-white/25">Permissions: {ext.permissions.join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
