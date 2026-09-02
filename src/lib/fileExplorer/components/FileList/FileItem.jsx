/**
 * Individual grid tile — icon/thumbnail + name.
 * Extracted from the grid item rendering in the monolith.
 */
import { useState, useEffect } from 'react';
import Icon from '../../../../Components/Icon';
import { readEntryContent } from '../../../fileSystem.js';
import { selectedItems } from '../../state/signals.jsx';

function EntryGlyph({ entry, size = 36 }) {
  if (entry.cold) return <Icon name="Snowflake" size={size} color="#93c5fd" strokeWidth={1.4} />;
  if (entry.type === 'folder') return <Icon name="Folder" size={size} color="#f59e0b" strokeWidth={1.4} />;
  if (entry.type === 'image') return <Icon name="Image" size={size} color="#f472b6" strokeWidth={1.4} />;
  if (entry.type === 'video') return <Icon name="Film" size={size} color="#a78bfa" strokeWidth={1.4} />;
  if (entry.type === 'text') return <Icon name="FileText" size={size} color="#60a5fa" strokeWidth={1.4} />;
  if (entry.name?.toLowerCase().endsWith('.gguf')) return <Icon name="BrainCircuit" size={size} color="#22d3ee" strokeWidth={1.4} />;
  if (entry.ref) return <Icon name="Gamepad2" size={size} color="#ff6b6b" strokeWidth={1.4} />;
  return <Icon name="FileText" size={size} color="#9ca3af" strokeWidth={1.4} />;
}

function EntryThumb({ entry, className }) {
  const [url, setUrl] = useState(entry.content || null);
  useEffect(() => {
    let active = true;
    if (!entry.content && entry.idb) {
      readEntryContent(entry).then(data => { if (active) setUrl(data); });
    }
    return () => { active = false; };
  }, [entry]);
  if (!url) return <div className={`${className} animate-pulse bg-white/[0.08]`} />;
  return <img src={url} alt="" className={className} />;
}

export default function FileItem({ entry, tree, drive, selected, dragging, openItem, onItemContext, dragProps, dropTarget }) {
  const handleClick = (event) => {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      // Toggle in multi-select
      const next = new Set(selectedItems.value);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      selectedItems.value = next;
    } else if (event.shiftKey) {
      // Range select — handled by parent
      selectedItems.value = new Set([entry.id]);
    } else {
      selectedItems.value = new Set([entry.id]);
    }
  };

  return (
    <button
      className={`flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors ${selected ? 'acc-soft acc-ring-soft' : 'hover:bg-white/[0.06]'} ${dragging && entry.type === 'folder' && dragging !== entry.id ? 'acc-ring-soft' : ''}`}
      onClick={handleClick}
      onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}
      onDoubleClick={() => openItem(entry)}
      {...dragProps(entry)}
      {...(entry.type === 'folder' && dropTarget ? dropTarget(entry.id) : {})}
      title={entry.name}
    >
      {entry.type === 'image' && !drive ? (
        <EntryThumb entry={entry} className="h-10 w-10 rounded object-cover" />
      ) : (
        <EntryGlyph entry={entry} size={38} />
      )}
      <span className="line-clamp-2 w-full break-words text-[11px] leading-tight text-white/80">{entry.name}</span>
    </button>
  );
}
