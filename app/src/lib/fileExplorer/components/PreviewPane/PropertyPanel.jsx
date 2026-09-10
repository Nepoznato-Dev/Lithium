/**
 * Metadata display for a selected entry.
 * Shows name, type, size, dates, cold status.
 */
import Icon from '../../../../Components/Icon';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PropertyPanel({ entry, tree }) {
  if (!entry) return null;

  const rows = [
    { label: 'Name', value: entry.name },
    { label: 'Type', value: entry.type === 'folder' ? 'Folder' : `${entry.type} file` },
    ...(entry.type !== 'folder' ? [{ label: 'Size', value: formatSize(entry.size) }] : []),
    ...(entry.updatedAt ? [{ label: 'Modified', value: new Date(entry.updatedAt).toLocaleString() }] : []),
    ...(entry.createdAt ? [{ label: 'Created', value: new Date(entry.createdAt).toLocaleString() }] : []),
    ...(entry.cold ? [{ label: 'Cold storage', value: 'Compressed' }] : []),
  ];

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Properties</div>
      {rows.map(row => (
        <div key={row.label} className="flex items-baseline justify-between text-[11px]">
          <span className="text-white/40">{row.label}</span>
          <span className="max-w-[60%] truncate text-right text-white/70">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
