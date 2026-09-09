/**
 * Details/list view — table with sortable columns.
 * Extracted from the table branch of renderFiles() in the monolith.
 */
import FileRow from './FileRow.jsx';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileTable({ treeRef, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  return (
    <table className="w-full text-left text-xs text-white/85">
      <thead>
        <tr className="border-b border-white/[0.1] text-white/45">
          <th className="py-2 pr-3 font-medium">Name</th>
          <th className="py-2 pr-3 font-medium">Type</th>
          <th className="py-2 font-medium">Size</th>
        </tr>
      </thead>
      <tbody>
        {items.map(entry => (
          <FileRow
            key={entry.id}
            entry={entry}
            treeRef={treeRef}
            drive={drive}
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
