/**
 * Details/list view — table with sortable columns.
 * Extracted from the table branch of renderFiles() in the monolith.
 */
import { selectedItems, draggingId } from '../../state/signals.jsx';
import FileRow from './FileRow.jsx';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileTable({ tree, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  return (
    <table className="w-full text-left text-xs text-white/80">
      <thead>
        <tr className="border-b border-white/[0.08] text-white/40">
          <th className="py-1.5 pr-2 font-medium">Name</th>
          <th className="py-1.5 pr-2 font-medium">Type</th>
          <th className="py-1.5 font-medium">Size</th>
        </tr>
      </thead>
      <tbody>
        {items.map(entry => (
          <FileRow
            key={entry.id}
            entry={entry}
            tree={tree}
            drive={drive}
            selected={selectedItems.value.has(entry.id)}
            dragging={draggingId.value}
            openItem={openItem}
            onItemContext={onItemContext}
            dragProps={dragProps}
            dropTarget={dropTarget}
            formatSize={formatSize}
          />
        ))}
      </tbody>
    </table>
  );
}
