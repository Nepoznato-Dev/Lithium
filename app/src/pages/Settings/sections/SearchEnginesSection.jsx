import { useState } from 'react';
import { CardGroup, SettingsRow, EnhancedToggle } from '../controls';
import { SEARCH_ENGINES, SEARCH_ENGINE_CATEGORIES } from '../../../lib/settings';
import Icon from '../../../Components/Icon';

/** Group engines by category. */
function groupByCategory() {
  const groups = {};
  for (const [id, eng] of Object.entries(SEARCH_ENGINES)) {
    const cat = eng.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ id, ...eng });
  }
  return groups;
}

export default function SearchEnginesSection({ settings, update }) {
  const [customEngines, setCustomEngines] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lithium:custom-engines') || '[]'); } catch { return []; }
  });
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);

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

  const grouped = groupByCategory();
  const currentEngine = settings.browser?.searchEngine ?? 'brave';
  const totalEngines = Object.values(SEARCH_ENGINES).length + customEngines.length;

  return (
    <div>
      {/* Default engine */}
      <CardGroup label="Default search engine">
        <SettingsRow title="Search engine" description={`Used for address-bar queries — ${totalEngines} engines available`}>
          <select
            className="text-input rounded-full py-1.5 text-xs"
            value={currentEngine}
            onChange={e => update('browser.searchEngine', e.target.value)}
          >
            {Object.entries(SEARCH_ENGINE_CATEGORIES).map(([catKey, catLabel]) => {
              const engines = grouped[catKey];
              if (!engines || engines.length === 0) return null;
              return (
                <optgroup key={catKey} label={catLabel}>
                  {engines.map(eng => (
                    <option key={eng.id} value={eng.id}>{eng.label}</option>
                  ))}
                </optgroup>
              );
            })}
            {customEngines.length > 0 && (
              <optgroup label="Custom">
                {customEngines.map(eng => (
                  <option key={eng.id} value={eng.id}>{eng.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </SettingsRow>
        <SettingsRow title="Search suggestions" description="Show autocomplete suggestions from the search engine as you type in the address bar">
          <EnhancedToggle
            value={settings.browser?.searchSuggestions !== false}
            onChange={v => update('browser.searchSuggestions', v)}
          />
        </SettingsRow>
      </CardGroup>

      {/* All engines by category */}
      <CardGroup label={`All engines — ${totalEngines} available`}>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          {Object.entries(SEARCH_ENGINE_CATEGORIES).map(([catKey, catLabel]) => {
            const engines = grouped[catKey];
            if (!engines || engines.length === 0) return null;
            const isExpanded = expandedCat === catKey || expandedCat === null;

            return (
              <div key={catKey} style={{ width: '100%' }}>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  onClick={() => setExpandedCat(expandedCat === catKey ? null : catKey)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <Icon
                    name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                    size={12}
                    color="rgba(255,255,255,0.4)"
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {catLabel}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
                    {engines.length}
                  </span>
                </button>
                {isExpanded && (
                  <div style={{ paddingLeft: 8 }}>
                    {engines.map(eng => (
                      <div key={eng.id} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '5px 8px', borderRadius: 6, background: currentEngine === eng.id ? 'rgba(34,211,238,0.06)' : 'transparent' }}>
                        <Icon name="Globe" size={13} color={currentEngine === eng.id ? '#22d3ee' : 'rgba(255,255,255,0.3)'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: currentEngine === eng.id ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: currentEngine === eng.id ? 600 : 400 }}>
                            {eng.label}
                            {currentEngine === eng.id && <span style={{ fontSize: 9, color: '#22d3ee', marginLeft: 6 }}>DEFAULT</span>}
                          </div>
                        </div>
                        {eng.keyword && (
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
                            {eng.keyword}
                          </span>
                        )}
                        <button
                          className="btn-ghost px-2 py-0.5 text-[10px]"
                          onClick={() => update('browser.searchEngine', eng.id)}
                          style={{ opacity: currentEngine === eng.id ? 0.3 : 1 }}
                          disabled={currentEngine === eng.id}
                        >
                          {currentEngine === eng.id ? 'Active' : 'Set default'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Custom engines */}
          {customEngines.length > 0 && (
            <div style={{ width: '100%', marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px' }}>
                Custom ({customEngines.length})
              </div>
              {customEngines.map(eng => (
                <div key={eng.id} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '5px 8px' }}>
                  <Icon name="Globe" size={13} color="#f59e0b" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#fff' }}>{eng.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eng.url}</div>
                  </div>
                  {eng.keyword && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
                      {eng.keyword}
                    </span>
                  )}
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => removeEngine(eng.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardGroup>

      {/* Add custom engine */}
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
        Type a keyword in the address bar followed by your query to use that engine directly (e.g. &quot;g cats&quot; for Google, &quot;gh react&quot; for GitHub).
        Search suggestions use your default engine&apos;s autocomplete API.
      </p>
    </div>
  );
}
