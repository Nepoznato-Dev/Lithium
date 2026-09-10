/**
 * ArchiveDialog — format selection + progress for compress/extract operations.
 */
import { useState, useEffect, useCallback } from 'react';
import Icon from '../../../../Components/Icon';

const FORMAT_INFO = {
  zip:    { label: 'ZIP',     ext: '.zip',     icon: 'PackageOpen', color: '#f59e0b', desc: 'Universal, best compatibility' },
  tar:    { label: 'TAR.GZ',  ext: '.tar.gz',  icon: 'PackageOpen', color: '#38bdf8', desc: 'TAR archive with GZip compression' },
  gzip:   { label: 'GZIP',    ext: '.gz',      icon: 'Archive',     color: '#22c55e', desc: 'Single-file GZip compression' },
  '7z':   { label: '7-Zip',   ext: '.7z',      icon: 'Archive',     color: '#a78bfa', desc: 'High compression ratio' },
  bzip2:  { label: 'BZip2',   ext: '.bz2',     icon: 'Archive',     color: '#f472b6', desc: 'Block-sorting compression' },
};

const SUPPORTED_FORMATS = ['zip', 'tar', 'gzip', '7z', 'bzip2'];

const PHASE_LABELS = {
  collect: 'Collecting files…',
  compress: 'Compressing…',
  tar: 'Building TAR archive…',
  decompress: 'Decompressing…',
  parse: 'Parsing archive…',
  extract: 'Extracting…',
  write: 'Writing files…',
  done: 'Complete',
};

export default function ArchiveDialog({ mode, entries, tree, commit, parentId, onClose, onError }) {
  const [format, setFormat] = useState('zip');
  const [progress, setProgress] = useState(null); // { phase, done, total }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  const isCompress = mode === 'compress';
  const isExtract = mode === 'extract';

  const handleAction = useCallback(async () => {
    setBusy(true);
    setProgress({ phase: 'collect', done: 0, total: 0 });
    setDone(false);
    setResult(null);

    try {
      const {
        compressArchive, extractArchive, detectFormat, getFormatExtension,
      } = await import('../../../storage/archive.js');
      const { putBlob, getBlob } = await import('../../../storage/manager.js');
      const { createEntry, getEntry } = await import('../../../fileSystem.js');

      const onProgress = (p) => setProgress(p);

      if (isCompress) {
        // Compress selected entries
        const allResults = [];
        for (const entry of entries) {
          if (entry.type !== 'folder') continue;
          const blob = await compressArchive(tree, entry.id, format, { onProgress });
          const ext = getFormatExtension(format);
          const archiveName = `${entry.name}${ext}`;

          // Create archive entry in the same parent folder
          const arr = createEntry(tree, { name: archiveName, type: 'file', parentId: entry.parentId, content: '' });
          const newEntry = arr[arr.length - 1];
          await putBlob(newEntry.id, blob, { name: archiveName });
          const stored = { ...newEntry, content: null, idb: true, size: blob.size };
          const newTree = [...arr.slice(0, -1), stored];
          allResults.push({ tree: newTree, name: archiveName, size: blob.size });

          // Update tree reference for next iteration
          tree = newTree;
        }

        if (allResults.length > 0) {
          commit(allResults[allResults.length - 1].tree);
          setResult({ count: allResults.length, items: allResults });
        }
      } else if (isExtract) {
        // Extract selected archive files
        const allResults = [];
        for (const entry of entries) {
          const fmt = detectFormat(entry.name);
          if (!fmt) continue;

          const local = getEntry(tree, entry.id);
          if (!local?.idb) continue;
          const blob = await getBlob(local.blobRef || local.id);
          if (!blob) continue;

          const nameOverride = entry.name.replace(/\.(zip|tar\.gz|tgz|gz|7z|bz2)$/i, '');
          const res = await extractArchive(tree, parentId, blob, fmt, { onProgress, nameOverride });
          allResults.push(res);
          tree = res.tree;
        }

        if (allResults.length > 0) {
          commit(allResults[allResults.length - 1].tree);
          const totalFiles = allResults.reduce((s, r) => s + r.files, 0);
          setResult({ count: allResults.length, files: totalFiles });
        }
      }

      setProgress({ phase: 'done', done: 1, total: 1 });
      setDone(true);
    } catch (err) {
      onError?.(err.message || 'Operation failed');
    } finally {
      setBusy(false);
    }
  }, [mode, entries, tree, commit, parentId, format, isCompress, isExtract, onClose, onError]);

  // Auto-close after completion
  useEffect(() => {
    if (done) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [done, onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06]">
            <Icon name={isCompress ? 'PackageOpen' : 'Archive'} size={18} color={isCompress ? '#f59e0b' : '#38bdf8'} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {isCompress ? 'Compress' : 'Extract'} {entries.length > 1 ? `${entries.length} items` : entries[0]?.name || ''}
            </h3>
            <p className="text-[11px] text-white/40">
              {isCompress ? 'Choose archive format' : 'Decompress to current folder'}
            </p>
          </div>
        </div>

        {/* Format selection (compress only) */}
        {isCompress && !busy && !done && (
          <div className="mb-4 space-y-1.5">
            {SUPPORTED_FORMATS.map(fmt => {
              const info = FORMAT_INFO[fmt];
              const selected = format === fmt;
              return (
                <button
                  key={fmt}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    selected
                      ? 'border-white/20 bg-white/[0.08] text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.05]'
                  }`}
                  onClick={() => setFormat(fmt)}
                >
                  <Icon name={info.icon} size={16} color={info.color} />
                  <div className="flex-1">
                    <div className="font-medium">{info.label}</div>
                    <div className="text-[10px] text-white/35">{info.desc}</div>
                  </div>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/40">{info.ext}</span>
                  {selected && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: info.color }} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Progress */}
        {busy && progress && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-white/70">
              <Icon name="Loader2" size={14} className="animate-spin text-cyan-400" />
              <span>{PHASE_LABELS[progress.phase] || progress.phase}</span>
            </div>
            {progress.total > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                    style={{ width: `${Math.min((progress.done / progress.total) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/30">
                  <span>{progress.done} / {progress.total}</span>
                  <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {done && result && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/[0.06] p-3 text-xs text-green-300/80">
            <div className="flex items-center gap-2">
              <Icon name="CheckCircle2" size={14} className="text-green-400" />
              <span className="font-medium">
                {isCompress
                  ? `Created ${result.count} archive${result.count > 1 ? 's' : ''}`
                  : `Extracted ${result.files} file${result.files !== 1 ? 's' : ''} from ${result.count} archive${result.count > 1 ? 's' : ''}`
                }
              </span>
            </div>
            {isCompress && result.items && (
              <div className="mt-1.5 space-y-0.5 text-[10px] text-white/40">
                {result.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate">{item.name}</span>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {done ? (
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose} disabled={busy}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={handleAction}
                disabled={busy}
              >
                {busy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name={isCompress ? 'PackageOpen' : 'Archive'} size={12} />}
                {isCompress ? 'Compress' : 'Extract'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
