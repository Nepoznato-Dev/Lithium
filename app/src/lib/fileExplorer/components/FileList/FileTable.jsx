/**
 * Details/list view — virtualized table with sortable columns.
 * Only renders rows visible in the viewport (+ overscan) so large
 * folders stay smooth instead of creating thousands of DOM nodes.
 */
import { useState, useEffect, useRef, useLayoutEffect, memo } from 'react';
import FileRow from './FileRow.jsx';

const ROW_HEIGHT = 36;
const OVERSCAN = 8;

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const FileTable = memo(function FileTable({ treeRef, drive, items, openItem, onItemContext, dragProps, dropTarget }) {
  const scrollRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: 50 });
  const itemsLenRef = useRef(items.length);
  itemsLenRef.current = items.length;

  // Measure viewport and compute visible range on scroll / resize.
  // RAF-throttled to coalesce rapid scroll events into one setState per frame.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let rafId = 0;
    const compute = () => {
      const len = itemsLenRef.current;
      const scrollTop = el.scrollTop;
      const viewH = el.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
      const end = Math.min(len, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + OVERSCAN);
      setRange(prev => (prev.start === start && prev.end === end) ? prev : { start, end });
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; compute(); });
    };
    compute();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  // Reset when items change
  useEffect(() => {
    setRange({ start: 0, end: Math.min(50, items.length) });
  }, [items.length]);

  const visible = items.slice(range.start, range.end);
  const totalH = items.length * ROW_HEIGHT;
  const topH = range.start * ROW_HEIGHT;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div style={{ height: totalH, position: 'relative' }}>
        <table className="w-full text-left text-xs text-white/85" style={{ position: 'absolute', top: topH, left: 0, right: 0 }}>
          <thead>
            <tr className="border-b border-white/[0.1] text-white/45">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(entry => (
              <FileRow
                key={entry.id}
                entry={entry}
                treeRef={treeRef}
                drive={drive}
                openItem={openItem}
                onItemContext={onItemContext}
                dragProps={dragProps}
                dropTarget={dropTarget}
                formatSize={formatSize}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default FileTable;
