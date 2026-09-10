/**
 * Grid view with virtualization — only renders visible items.
 * Measures actual column count from container width for accuracy.
 */
import { useState, useEffect, useRef, memo } from 'react';
import { selectedItems, draggingId } from '../../state/signals.jsx';
import FileItem from './FileItem.jsx';

const ITEM_HEIGHT = 110; // Estimated height of each grid item (including gap)
const MIN_COL_WIDTH = 100; // minmax(100px) from the CSS grid
const GAP = 6; // gap-1.5 ≈ 6px
const OVERSCAN_ROWS = 3; // Extra rows above/below viewport

const FileGrid = memo(function FileGrid({ treeRef, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  const containerRef = useRef(null);
  const [cols, setCols] = useState(6);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const itemsLenRef = useRef(items.length);
  itemsLenRef.current = items.length;
  const colsRef = useRef(cols);
  colsRef.current = cols;

  // Measure actual column count from container width
  useEffect(() => {
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

  // Single stable effect for scroll + resize — uses refs to avoid re-registering listeners.
  // RAF-throttled: coalesces rapid scroll events into one setState per animation frame,
  // preventing render storms at 120 Hz+ scroll rates.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const compute = () => {
      const len = itemsLenRef.current;
      const c = colsRef.current;
      const rows = Math.ceil(len / c);
      const scrollTop = container.scrollTop;
      const viewportHeight = container.clientHeight;

      const startRow = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN_ROWS);
      const endRow = Math.min(rows, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN_ROWS);

      const start = startRow * c;
      const end = Math.min(len, endRow * c);

      setVisibleRange(prev => {
        if (prev.start === start && prev.end === end) return prev;
        return { start, end };
      });
    };

    const onScroll = () => {
      if (rafId) return;           // already scheduled
      rafId = requestAnimationFrame(() => { rafId = 0; compute(); });
    };

    compute();
    container.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(compute); // resize is infrequent — no throttle needed
    ro.observe(container);
    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []); // Stable — reads dynamic values from refs

  // Reset visible range when items change
  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.min(50, items.length) });
  }, [items.length]);

  // Drag-over ring styling via direct DOM manipulation — avoids subscribing
  // every FileItem to draggingId, which would re-render all items on each
  // drag start/stop.  Reading the signal in render subscribes THIS component
  // to draggingId changes; the effect then patches the DOM classList.
  // A MutationObserver re-applies the ring when virtualization swaps DOM nodes,
  // so we don't need `items` as a dependency (which caused a re-run every scroll).
  const dragRingElRef = useRef(null);
  const currentDragId = draggingId.value; // subscribe to signal
  const dragIdRef = useRef(currentDragId);
  dragIdRef.current = currentDragId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apply = () => {
      const prev = dragRingElRef.current;
      if (prev) { prev.classList.remove('acc-ring-soft'); dragRingElRef.current = null; }
      const id = dragIdRef.current;
      if (!id) return;
      const el = container.querySelector(`[data-entry-id="${id}"]`);
      if (el) { el.classList.add('acc-ring-soft'); dragRingElRef.current = el; }
    };

    apply();
    // Re-apply when virtualization swaps child nodes in/out of the DOM
    const mo = new MutationObserver(apply);
    mo.observe(container, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [currentDragId]); // Only re-run on drag state change — MutationObserver handles scroll

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
});

export default FileGrid;
