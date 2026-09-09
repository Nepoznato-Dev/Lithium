/**
 * SearchEnginesPage — manage search engines: add, remove, reorder, set keywords.
 * Accessible via lithium://search-engines or from the browser menu.
 */
import { useState } from 'preact/hooks';
import { engines, addEngine, removeEngine, setKeyword, reorderEngine } from '../stores/searchEngineStore';
import Icon from '../../../Components/Icon';

export default function SearchEnginesPage() {
  const allEngines = engines.value;
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [editingKeyword, setEditingKeyword] = useState({});

  const handleAdd = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    addEngine({ label: newLabel.trim(), url: newUrl.trim(), keyword: newKeyword.trim() });
    setNewLabel('');
    setNewUrl('');
    setNewKeyword('');
  };

  const handleKeywordSave = (id) => {
    setKeyword(id, editingKeyword[id] || '');
    setEditingKeyword(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  return (
    <div className="mx-auto max-w-2xl p-6 text-white">
      <div className="mb-6 flex items-center gap-3">
        <Icon name="Search" size={24} className="text-cyan-300" />
        <h1 className="text-xl font-bold">Search Engines</h1>
      </div>

      {/* Engine list */}
      <div className="mb-8 space-y-2">
        {allEngines.map((eng, i) => (
          <div
            key={eng.id}
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3"
          >
            {/* Drag handle */}
            <div className="flex flex-col gap-0.5 text-white/20">
              {i > 0 && (
                <button onClick={() => reorderEngine(i, i - 1)} className="hover:text-white/60" title="Move up">
                  <Icon name="ChevronUp" size={14} />
                </button>
              )}
              {i < allEngines.length - 1 && (
                <button onClick={() => reorderEngine(i, i + 1)} className="hover:text-white/60" title="Move down">
                  <Icon name="ChevronDown" size={14} />
                </button>
              )}
            </div>

            {/* Engine info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{eng.label}</span>
                {eng.builtin && (
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/30">Built-in</span>
                )}
              </div>
              <div className="truncate text-[11px] text-white/30">{eng.url}</div>
            </div>

            {/* Keyword */}
            {editingKeyword[eng.id] !== undefined ? (
              <div className="flex items-center gap-1">
                <input
                  className="w-20 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white outline-none"
                  placeholder="keyword"
                  value={editingKeyword[eng.id]}
                  onInput={(e) => setEditingKeyword(prev => ({ ...prev, [eng.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleKeywordSave(eng.id); if (e.key === 'Escape') setEditingKeyword(prev => { const n = { ...prev }; delete n[eng.id]; return n; }); }}
                  autoFocus
                />
                <button className="text-xs text-green-400 hover:text-green-300" onClick={() => handleKeywordSave(eng.id)}>
                  <Icon name="Check" size={12} />
                </button>
              </div>
            ) : (
              <button
                className="rounded px-2 py-0.5 text-[11px] text-white/30 hover:bg-white/5 hover:text-white/60"
                onClick={() => setEditingKeyword(prev => ({ ...prev, [eng.id]: eng.keyword || '' }))}
                title="Set keyword shortcut"
              >
                {eng.keyword ? <span className="text-cyan-300/70">{eng.keyword}</span> : 'Set keyword'}
              </button>
            )}

            {/* Remove (custom only) */}
            {!eng.builtin && (
              <button
                className="text-white/20 hover:text-red-400"
                onClick={() => removeEngine(eng.id)}
                title="Remove"
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add new engine */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white/70">Add search engine</h2>
        <div className="space-y-2">
          <input
            className="text-input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="Name (e.g. YouTube)"
            value={newLabel}
            onInput={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="text-input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="Search URL (use %s for query, e.g. https://www.youtube.com/results?search_query=%s)"
            value={newUrl}
            onInput={(e) => setNewUrl(e.target.value)}
          />
          <input
            className="text-input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="Keyword shortcut (optional, e.g. yt)"
            value={newKeyword}
            onInput={(e) => setNewKeyword(e.target.value)}
          />
          <button className="btn-primary mt-1 px-4 py-1.5 text-sm" onClick={handleAdd} disabled={!newLabel.trim() || !newUrl.trim()}>
            Add engine
          </button>
        </div>
      </div>

      {/* Help text */}
      <p className="mt-4 text-[11px] text-white/25">
        Type a keyword followed by your search term in the omnibox to search with that engine directly.
        Example: <code className="rounded bg-white/5 px-1 py-0.5 text-white/40">yt funny cats</code>
      </p>
    </div>
  );
}
