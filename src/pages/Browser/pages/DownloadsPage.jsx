/**
 * DownloadsPage — download manager with progress bars and file actions.
 */
import { downloads, activeDownloads, completedDownloads, removeDownload, clearCompleted } from '../stores/downloadsStore';
import Icon from '../../../Components/Icon';

export default function DownloadsPage() {
  const active = activeDownloads.value;
  const completed = completedDownloads.value;
  const all = downloads.value;

  return (
    <div className="flex h-full flex-col bg-[#0f0f17]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Downloads</h2>
        {completed.length > 0 && (
          <button
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            onClick={clearCompleted}
          >
            Clear completed
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {all.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
            <Icon name="Download" className="h-8 w-8" />
            <p className="text-sm">No downloads yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Active downloads */}
            {active.map(dl => (
              <div key={dl.id} className="rounded-lg border border-white/[0.06] p-3">
                <div className="mb-2 flex items-center gap-3">
                  <Icon name="Download" className="h-4 w-4 shrink-0 text-orange-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white/80">{dl.filename}</p>
                    <p className="text-[10px] text-white/30">{dl.url}</p>
                  </div>
                  <span className="text-[10px] text-white/40">
                    {dl.progress < 100 ? `${dl.progress}%` : 'Complete'}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${dl.progress}%` }}
                  />
                </div>
                {dl.totalBytes > 0 && (
                  <p className="mt-1 text-[10px] text-white/25">
                    {formatBytes(dl.receivedBytes)} / {formatBytes(dl.totalBytes)}
                  </p>
                )}
              </div>
            ))}

            {/* Completed downloads */}
            {completed.map(dl => (
              <div key={dl.id} className="group flex items-center gap-3 rounded-lg border border-white/[0.06] p-3 transition-colors hover:bg-white/[0.02]">
                <Icon name="File" className="h-4 w-4 shrink-0 text-green-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-white/80">{dl.filename}</p>
                  <p className="text-[10px] text-white/30">{formatBytes(dl.totalBytes)} · {dl.completedAt ? new Date(dl.completedAt).toLocaleDateString() : ''}</p>
                </div>
                <button
                  className="rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                  onClick={() => removeDownload(dl.id)}
                  aria-label="Remove download"
                >
                  <Icon name="X" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
