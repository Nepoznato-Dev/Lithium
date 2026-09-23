/**
 * Individual grid tile — icon/thumbnail + name.
 * Extracted from the grid item rendering in the monolith.
 *
 * The glyph rules live in `lib/fileExplorer/glyphs.js`, not here: the Solid
 * island that replaces this component in low-end mode needs the same answers and
 * cannot import a Preact component to get them.
 */
import { useState, useEffect, useRef, memo } from 'react';
import Icon from '../../../../Components/Icon';
import { glyphFor, pngSrc } from '../../glyphs.js';
import { getThumbUrl, getCachedThumbUrl, retainThumb, releaseThumb } from '../../thumbCache.js';
import { selectedItems } from '../../state/signals.jsx';
import { useColoredPng } from '../../../iconRecolor.js';

function EntryGlyph({ entry, size = 36 }) {
  const png = pngSrc(entry);
  const colored = useColoredPng(png);
  if (png) {
    return <img src={colored || png} alt="" style={{ width: size, height: size }} className="object-contain" />;
  }
  const { name, color } = glyphFor(entry);
  return <Icon name={name} size={size} color={color} strokeWidth={1.4} />;
}

function EntryThumb({ entry, className }) {
  const [url, setUrl] = useState(() => getCachedThumbUrl(entry) || null);
  const [visible, setVisible] = useState(false);
  const imgRef = useRef(null);

  /* Refcount the cache slot for exactly as long as this tile is mounted. A
   * `blob:` URL pins its Blob until revoked, so without this the cache cannot
   * tell a thumbnail that scrolled away from one that is on screen. */
  useEffect(() => {
    retainThumb(entry.id);
    return () => releaseThumb(entry.id);
  }, [entry.id]);

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

const FileItem = memo(function FileItem({ entry, treeRef: _treeRef, drive, openItem, onItemContext, dragProps, dropTarget }) {
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
