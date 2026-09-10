/**
 * Individual grid tile — icon/thumbnail + name.
 * Extracted from the grid item rendering in the monolith.
 */
import { useState, useEffect, useRef, memo } from 'react';
import Icon from '../../../../Components/Icon';
import { iconUrl } from '../../../iconUrl.js';
import { getThumbUrl, getCachedThumbUrl } from '../../thumbCache.js';
import { selectedItems } from '../../state/signals.jsx';

/** Pick the best Icon name + colour for an entry, matching the pattern used
 *  across Sidebar, CodeStudio, Notes, Downloader, etc. */
function glyphFor(entry) {
  if (entry.cold)  return { name: 'Snowflake', color: '#93c5fd' };
  if (entry.ref)   return { name: 'Gamepad2',  color: '#ff6b6b' };

  const ext = (entry.name || '').split('.').pop()?.toLowerCase();

  if (entry.type === 'folder') return { name: 'Folder',    color: '#fbbf24' };
  if (entry.type === 'image')  return { name: 'Image',     color: '#f472b6' };
  if (entry.type === 'video')  return { name: 'Film',      color: '#a78bfa' };

  // Extension-specific icons — same pattern as CodeStudio / Downloader
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

function EntryGlyph({ entry, size = 36 }) {
  const { name, color } = glyphFor(entry);
  const pngName = ICON_PNG_MAP[name];
  if (pngName) {
    return <img src={iconUrl(pngName)} alt="" style={{ width: size, height: size }} className="object-contain" />;
  }
  return <Icon name={name} size={size} color={color} strokeWidth={1.4} />;
}

function EntryThumb({ entry, className }) {
  const [url, setUrl] = useState(() => getCachedThumbUrl(entry) || null);
  const [visible, setVisible] = useState(false);
  const imgRef = useRef(null);

  // IntersectionObserver: only load when actually visible
  useEffect(() => {
    if (url) return; // already loaded
    const el = imgRef.current;
    if (!el || (!entry.idb && !entry.content)) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [entry, url]);

  // Async load via shared cache — reads from IDB only once per session
  useEffect(() => {
    if (!visible || url) return;
    let active = true;
    getThumbUrl(entry).then(data => {
      if (active && data) setUrl(data);
    });
    return () => { active = false; };
  }, [entry, visible, url]);

  if (!url) return <div ref={imgRef} className={`${className} animate-pulse bg-[#2a2b31]`} />;
  return <img src={url} alt="" className={className} />;
}

const FileItem = memo(function FileItem({ entry, treeRef, drive, openItem, onItemContext, dragProps, dropTarget }) {
  // Read signal directly — only THIS item re-renders on selection change,
  // not the entire list. Drag styling is handled at the container level
  // (FileGrid) via DOM classList to avoid re-rendering every item on drag.
  const selected = selectedItems.value.has(entry.id);

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
      data-entry-id={entry.id}
      className={`flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors ${selected ? 'acc-soft acc-ring-soft' : 'hover:bg-[#2a2b31]'}`}
      onClick={handleClick}
      onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}
      onDoubleClick={() => openItem(entry)}
      {...dragProps(entry)}
      {...(entry.type === 'folder' && dropTarget ? dropTarget(entry.id) : {})}
      title={entry.name}
    >
      {entry.type === 'image' && !drive ? (
        <EntryThumb entry={entry} className="h-10 w-10 rounded-md object-cover" />
      ) : (
        <EntryGlyph entry={entry} size={38} />
      )}
      <span className="line-clamp-2 w-full break-words text-[11px] leading-snug text-white/80">{entry.name}</span>
    </button>
  );
}, (prev, next) => {
  return prev.entry === next.entry && prev.drive === next.drive;
});

export default FileItem;
