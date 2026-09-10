/**
 * Individual table row — icon + name + type + size.
 * Extracted from the table row rendering in the monolith.
 */
import { memo } from 'react';
import Icon from '../../../../Components/Icon';
import { iconUrl } from '../../../iconUrl.js';
import { selectedItems } from '../../state/signals.jsx';

/** Pick the best Icon name + colour for an entry. */
function glyphFor(entry) {
  if (entry.cold)  return { name: 'Snowflake', color: '#93c5fd' };
  if (entry.ref)   return { name: 'Gamepad2',  color: '#ff6b6b' };

  const ext = (entry.name || '').split('.').pop()?.toLowerCase();

  if (entry.type === 'folder') return { name: 'Folder',    color: '#fbbf24' };
  if (entry.type === 'image')  return { name: 'Image',     color: '#f472b6' };
  if (entry.type === 'video')  return { name: 'Film',      color: '#a78bfa' };

  switch (ext) {
    case 'mp3': case 'ogg': case 'wav': case 'flac': case 'm4a': case 'aac':
      return { name: 'Music', color: '#f472b6' };
    case 'pdf':
      return { name: 'FileText', color: '#ef4444' };
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
      return { name: 'Archive', color: '#f59e0b' };
    case 'json':
      return { name: 'FileJson', color: '#fbbf24' };
    case 'gguf':
      return { name: 'BrainCircuit', color: '#22d3ee' };
    case 'js': case 'jsx': case 'ts': case 'tsx': case 'py': case 'rs':
    case 'html': case 'css': case 'xml': case 'yaml': case 'yml': case 'toml':
      return { name: 'Code2', color: '#4ade80' };
    case 'csv': case 'xls': case 'xlsx':
      return { name: 'Files', color: '#22c55e' };
    default:
      if (entry.type === 'text') return { name: 'FileText', color: '#60a5fa' };
      return { name: 'FileText', color: '#9ca3af' };
  }
}

/** Map icon names to PNG filenames in public/icons/ */
const ICON_PNG_MAP = {
  Folder: 'files',
  Image: 'gallery',
  Film: 'film',
  Music: 'music-note',
  FileText: 'notes',
  Archive: 'archive',
  BrainCircuit: 'cortex',
  Code2: 'code-studio',
  Gamepad2: 'hydrux',
  Snowflake: 'snowflake',
  FileJson: 'file-json',
};

function EntryGlyph({ entry, size = 16 }) {
  const { name, color } = glyphFor(entry);
  const pngName = ICON_PNG_MAP[name];
  if (pngName) {
    return <img src={iconUrl(pngName)} alt="" style={{ width: size, height: size }} className="object-contain" />;
  }
  return <Icon name={name} size={size} color={color} strokeWidth={1.4} />;
}

const FileRow = memo(function FileRow({ entry, treeRef, drive, openItem, onItemContext, dragProps, dropTarget, formatSize }) {
  const selected = selectedItems.value.has(entry.id);

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
      className={`cursor-pointer border-b border-white/[0.06] ${selected ? 'acc-soft' : 'hover:bg-[#252630]'}`}
      onClick={handleClick}
      onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}
      onDoubleClick={() => openItem(entry)}
      {...dragProps(entry)}
      {...(entry.type === 'folder' && dropTarget ? dropTarget(entry.id) : {})}
    >
      <td className="flex items-center gap-2.5 py-2 pr-3"><EntryGlyph entry={entry} size={16} /> {entry.name}</td>
      <td className="py-2 pr-3 capitalize text-white/50">{entry.type === 'folder' ? 'Folder' : `${entry.type} file`}</td>
      <td className="py-2 text-white/50 tabular-nums">{entry.type === 'folder' ? '' : formatSize(entry.size)}</td>
    </tr>
  );
}, (prev, next) => {
  return prev.entry === next.entry && prev.drive === next.drive;
});

export default FileRow;
