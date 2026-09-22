/**
 * Individual table row — icon + name + type + size.
 * Extracted from the table row rendering in the monolith.
 *
 * Glyph rules come from `lib/fileExplorer/glyphs.js` so the low-end Solid
 * island can resolve the same icon without importing this component.
 */
import { memo } from 'react';
import Icon from '../../../../Components/Icon';
import { glyphFor, pngSrc } from '../../glyphs.js';
import { selectedItems } from '../../state/signals.jsx';
import { useColoredPng } from '../../../iconRecolor.js';

function EntryGlyph({ entry, size = 16 }) {
  const png = pngSrc(entry);
  const colored = useColoredPng(png);
  if (png) {
    return <img src={colored || png} alt="" style={{ width: size, height: size }} className="object-contain" />;
  }
  const { name, color } = glyphFor(entry);
  return <Icon name={name} size={size} color={color} strokeWidth={1.4} />;
}

const FileRow = memo(function FileRow({ entry, treeRef: _treeRef, drive: _drive, openItem, onItemContext, dragProps, dropTarget, formatSize }) {
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
