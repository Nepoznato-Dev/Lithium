/**
 * HistoryPage — grouped history viewer with search and bulk actions.
 */
import { useState } from 'preact/hooks';
import { historyEntries, groupedHistory, filteredHistory, historyQuery, removeHistoryEntry, clearHistory, clearHistoryRange } from '../stores/historyStore';
import Icon from '../../../Components/Icon';

export default function HistoryPage() {
  const query = historyQuery.value;
  const filtered = filteredHistory.value;
  const grouped = query ? [{ label: 'Results', entries: filtered }] : groupedHistory.value;
  const [showClearDialog, setShowClearDialog] = useState(false);

  const handleClearRange = (hours) => {
    const since = Date.now() - hours * 3600000;
    clearHistoryRange(since);
    setShowClearDialog(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#0f0f17]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">History</h2>
        <div className="relative flex-1">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            className="text-input w-full rounded-lg py-1.5 pl-9 text-xs"
            placeholder="Search history…"
            value={query}
            onInput={e => { historyQuery.value = e.target.value; }}
          />
        </div>
        <button
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
          onClick={() => setShowClearDialog(true)}
        >
          Clear data
        </button>
      </div>

      {/* Clear dialog */}
      {showClearDialog && (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <p className="mb-2 text-xs text-white/60">Clear browsing history:</p>
          <div className="flex gap-2">
            <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => handleClearRange(1)}>Last hour</button>
            <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => handleClearRange(24)}>Last 24 hours</button>
            <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => handleClearRange(168)}>Last 7 days</button>
            <button className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30" onClick={() => { clearHistory(); setShowClearDialog(false); }}>All time</button>
            <button className="rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white/60" onClick={() => setShowClearDialog(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto p-4">
        {grouped.length === 0 || (grouped.length === 1 && grouped[0].entries.length === 0) ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
            <Icon name="Clock" className="h-8 w-8" />
            <p className="text-sm">No browsing history</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label} className="mb-6">
              <h3 className="mb-2 text-xs font-medium text-white/40">{group.label}</h3>
              <div className="flex flex-col gap-0.5">
                {(group.entries || []).map((entry, i) => (
                  <div
                    key={`${entry.url}-${i}`}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                  >
                    <Icon name="Clock" className="h-3.5 w-3.5 shrink-0 text-white/20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white/80">{entry.title}</p>
                      <p className="truncate text-[10px] text-white/30">{entry.url}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-white/20">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                    >
                      <Icon name="ExternalLink" className="h-3.5 w-3.5" />
                    </a>
                    <button
                      className="rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      onClick={() => removeHistoryEntry(entry.url)}
                      aria-label="Remove entry"
                    >
                      <Icon name="X" className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
