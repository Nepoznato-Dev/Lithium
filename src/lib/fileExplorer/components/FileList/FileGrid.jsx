/**
 * Grid view with virtualization — only renders visible items.
 * Measures actual column count from container width for accuracy.
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { selectedItems } from '../../state/signals.jsx';
import FileItem from './FileItem.jsx';

const ITEM_HEIGHT = 110; // Estimated height of each grid item (including gap)
const MIN_COL_WIDTH = 100; // minmax(100px) from the CSS grid
const GAP = 6; // gap-1.5 ≈ 6px
const OVERSCAN_ROWS = 3; // Extra rows above/below viewport

export default function FileGrid({ treeRef, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  const containerRef = useRef(null);
  const [cols, setCols] = useState(6);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  // Measure actual column count from container width
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const c = Math.max(1, Math.floor((w + GAP) / (MIN_COL_WIDTH + GAP)));
      setCols(c);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalRows = Math.ceil(items.length / cols);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const startRow = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN_ROWS);
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN_ROWS);

    const start = startRow * cols;
    const end = Math.min(items.length, endRow * cols);

    setVisibleRange(prev => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [items.length, cols, totalRows]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Reset visible range when items change
  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.min(50, items.length) });
  }, [items.length]);

  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  const totalHeight = totalRows * ITEM_HEIGHT;
  const topPadding = Math.floor(visibleRange.start / cols) * ITEM_HEIGHT;
  const bottomPadding = Math.max(0, totalHeight - Math.ceil(visibleRange.end / cols) * ITEM_HEIGHT);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto" onClick={() => selectedItems.value = new Set()} onContextMenu={onItemContext}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ paddingTop: topPadding }}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5 px-3">
            {visibleItems.map(entry => (
              <FileItem
                key={entry.id}
                entry={entry}
                treeRef={treeRef}
                drive={drive}
                openItem={openItem}
                onItemContext={onItemContext}
                dragProps={dragProps}
                dropTarget={dropTarget}
              />
            ))}
          </div>
        </div>
        <div style={{ height: bottomPadding }} />
      </div>
    </div>
  );
}
