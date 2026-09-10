import { useState } from 'react';
import { CardGroup, SettingsRow } from '../controls';
import { SEARCH_ENGINES } from '../../../lib/settings';
import Icon from '../../../Components/Icon';

export default function SearchEnginesSection({ settings, update }) {
  const [customEngines, setCustomEngines] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lithium:custom-engines') || '[]'); } catch { return []; }
  });
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  const saveEngines = list => {
    setCustomEngines(list);
    localStorage.setItem('lithium:custom-engines', JSON.stringify(list));
  };

  const addEngine = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const engine = { id: `custom-${Date.now()}`, name: newName.trim(), url: newUrl.trim(), keyword: newKeyword.trim() };
    saveEngines([...customEngines, engine]);
    setNewName(''); setNewUrl(''); setNewKeyword('');
  };

  const removeEngine = id => saveEngines(customEngines.filter(e => e.id !== id));

  const allEngines = [
    ...Object.entries(SEARCH_ENGINES).map(([key, eng]) => ({ id: key, name: eng.label, url: eng.url, builtin: true })),
    ...customEngines,
  ];

  return (
    <div>
      <CardGroup label="Default engine">
        <SettingsRow title="Search engine" description="Used for address-bar queries and Start menu web search">
          <select
            className="text-input rounded-full py-1.5 text-xs"
            value={settings.browser?.searchEngine ?? 'brave'}
            onChange={e => update('browser.searchEngine', e.target.value)}
          >
            {allEngines.map(eng => (
              <option key={eng.id} value={eng.id}>{eng.name}</option>
            ))}
          </select>
        </SettingsRow>
      </CardGroup>

      <CardGroup label="All engines">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          {allEngines.map(eng => (
            <div key={eng.id} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Icon name="Globe" size={14} color={eng.builtin ? '#22d3ee' : '#f59e0b'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fff' }}>{eng.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eng.url}</div>
              </div>
              {eng.keyword && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{eng.keyword}</span>}
              {eng.builtin ? (
                <span className="settings-badge on">Built-in</span>
              ) : (
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => removeEngine(eng.id)}>Remove</button>
              )}
            </div>
          ))}
        </div>
      </CardGroup>

      <CardGroup label="Add custom engine">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
            <input className="text-input flex-1 rounded-full py-1.5 text-xs" placeholder="Name (e.g. YouTube)" value={newName} onChange={e => setNewName(e.target.value)} style={{ minWidth: 120 }} />
            <input className="text-input flex-1 rounded-full py-1.5 text-xs" placeholder="URL with %s (e.g. https://youtube.com/results?search_query=%s)" value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ minWidth: 200 }} />
            <input className="text-input rounded-full py-1.5 text-xs" placeholder="Keyword" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} style={{ width: 100 }} />
          </div>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={addEngine} disabled={!newName.trim() || !newUrl.trim()}>Add engine</button>
        </div>
      </CardGroup>

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Type a keyword in the address bar followed by your query to use that engine directly (e.g. &quot;yt cats&quot;).
      </p>
    </div>
  );
}
