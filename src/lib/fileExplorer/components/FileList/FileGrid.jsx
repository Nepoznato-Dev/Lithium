/**
 * Grid view — large icon tiles for each entry.
 * Extracted from the grid branch of renderFiles() in the monolith.
 */
import { selectedItems, draggingId } from '../../state/signals.jsx';
import { getEntry } from '../../../fileSystem.js';
import FileItem from './FileItem.jsx';

export default function FileGrid({ tree, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1">
      {items.map(entry => (
        <FileItem
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
        />
      ))}
    </div>
  );
}
