/**
 * Individual table row — icon + name + type + size.
 * Extracted from the table row rendering in the monolith.
 */
import Icon from '../../../../Components/Icon';
import { selectedItems } from '../../state/signals.jsx';

function EntryGlyph({ entry, size = 16 }) {
  if (entry.cold) return <Icon name="Snowflake" size={size} color="#93c5fd" strokeWidth={1.4} />;
  if (entry.type === 'folder') return <Icon name="Folder" size={size} color="#f59e0b" strokeWidth={1.4} />;
  if (entry.type === 'image') return <Icon name="Image" size={size} color="#f472b6" strokeWidth={1.4} />;
  if (entry.type === 'video') return <Icon name="Film" size={size} color="#a78bfa" strokeWidth={1.4} />;
  if (entry.type === 'text') return <Icon name="FileText" size={size} color="#60a5fa" strokeWidth={1.4} />;
  if (entry.name?.toLowerCase().endsWith('.gguf')) return <Icon name="BrainCircuit" size={size} color="#22d3ee" strokeWidth={1.4} />;
  if (entry.ref) return <Icon name="Gamepad2" size={size} color="#ff6b6b" strokeWidth={1.4} />;
  return <Icon name="FileText" size={size} color="#9ca3af" strokeWidth={1.4} />;
}

export default function FileRow({ entry, tree, drive, selected, dragging, openItem, onItemContext, dragProps, dropTarget, formatSize }) {
  const handleClick = (event) => {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedItems.value);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      selectedItems.value = next;
    } else {
      selectedItems.value = new Set([entry.id]);
    }
  };

  return (
    <tr
      className={`cursor-pointer border-b border-white/[0.04] ${selected ? 'acc-soft' : 'hover:bg-white/[0.05]'}`}
      onClick={handleClick}
      onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}
      onDoubleClick={() => openItem(entry)}
      {...dragProps(entry)}
      {...(entry.type === 'folder' && dropTarget ? dropTarget(entry.id) : {})}
    >
      <td className="flex items-center gap-2 py-1.5 pr-2"><EntryGlyph entry={entry} size={16} /> {entry.name}</td>
      <td className="py-1.5 pr-2 capitalize text-white/50">{entry.type === 'folder' ? 'Folder' : `${entry.type} file`}</td>
      <td className="py-1.5 text-white/50">{entry.type === 'folder' ? '' : formatSize(entry.size)}</td>
    </tr>
  );
}
