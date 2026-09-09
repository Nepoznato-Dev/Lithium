/**
 * Virtualized Gallery view — only renders visible image thumbnails.
 * Uses ResizeObserver for accurate column count and IntersectionObserver
 * for lazy thumbnail loading to prevent I/O storms.
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { getThumbUrl, getCachedThumbUrl } from '../thumbCache.js';
import { preview } from '../state/signals.jsx';

const ITEM_HEIGHT = 135;
const MIN_COL_WIDTH = 125;
const GAP = 12;
const OVERSCAN_ROWS = 3;

export default function GalleryVirtualized({ allImages, openItem, onItemContext }) {
  const containerRef = useRef(null);
  const [cols, setCols] = useState(6);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 30 });
  const [loadedImages, setLoadedImages] = useState(() => {
    // Pre-populate from cache for already-loaded images
    const cached = {};
    allImages.forEach(entry => {
      const url = getCachedThumbUrl(entry);
      if (url) cached[entry.id] = url;
    });
    return cached;
  });

  // Measure actual column count
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 40; // account for p-5 padding
      const c = Math.max(1, Math.floor((w + GAP) / (MIN_COL_WIDTH + GAP)));
      setCols(c);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalRows = Math.ceil(allImages.length / cols);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const startRow = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN_ROWS);
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN_ROWS);
    const start = startRow * cols;
    const end = Math.min(allImages.length, endRow * cols);
    setVisibleRange(prev => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [allImages.length, cols, totalRows]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.min(30, allImages.length) });
    // Pre-populate from cache
    const cached = {};
    allImages.forEach(entry => {
      const url = getCachedThumbUrl(entry);
      if (url) cached[entry.id] = url;
    });
    setLoadedImages(cached);
  }, [allImages.length]);

  // Load thumbnails for visible images only — uses shared cache
  useEffect(() => {
    const visibleImages = allImages.slice(visibleRange.start, visibleRange.end);
    let active = true;

    visibleImages.forEach(entry => {
      if (loadedImages[entry.id]) return; // already loaded (or cached)
      getThumbUrl(entry).then(url => {
        if (active && url) {
          setLoadedImages(prev => ({ ...prev, [entry.id]: url }));
        }
      });
    });

    return () => { active = false; };
  }, [visibleRange.start, visibleRange.end, allImages]);

  const visibleImages = allImages.slice(visibleRange.start, visibleRange.end);
  const totalHeight = totalRows * ITEM_HEIGHT;
  const topPadding = Math.floor(visibleRange.start / cols) * ITEM_HEIGHT;
  const bottomPadding = Math.max(0, totalHeight - Math.ceil(visibleRange.end / cols) * ITEM_HEIGHT);

  if (allImages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">All pictures · 0</div>
        <p className="text-xs text-white/35">No images yet.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="p-5">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">All pictures · {allImages.length}</div>
      </div>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ paddingTop: topPadding }}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-3 px-5">
            {visibleImages.map(entry => (
              <button
                key={entry.id}
                className="aspect-square overflow-hidden rounded-lg border border-white/[0.08] bg-[#222328] transition-all hover:border-white/[0.14]"
                onClick={async () => {
                  const content = loadedImages[entry.id] || await getThumbUrl(entry);
                  preview.value = { name: entry.name, url: content, kind: 'image' };
                }}
                onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}
              >
                {loadedImages[entry.id] ? (
                  <img src={loadedImages[entry.id]} alt={entry.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full animate-pulse bg-[#2a2b31]" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: bottomPadding }} />
      </div>
    </div>
  );
}
