/**
 * Solid island: File Explorer details/list view.
 *
 * Same scroll-window argument as FileGridIsland, and a worse case for the
 * Preact one: a row is four elements (`tr` plus three `td`), so one frame of a
 * scroll rebuilds roughly four vnode trees per visible row and diffs them all,
 * while the only thing that actually changed for most rows is which slice of the
 * array they came from.
 *
 * Selected state is per-row and genuinely reactive — a `<tr>`'s `class` is the
 * entire update, which is the binding fine-grained reactivity is made of.
 */
import { For, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { cx, defineIsland, mirrorSignal } from './bridge.js';
import { formatSize, glyphFor, iconSvg, pngSrc } from '../lib/fileExplorer/glyphs.js';

const ROW_HEIGHT = 36;
const OVERSCAN = 8;
const ROW_BASE = 'cursor-pointer border-b border-white/[0.06]';

function Glyph({ entry, size }) {
  const png = pngSrc(entry);
  const glyph = glyphFor(entry);
  return png
    ? <img src={png} alt="" style={{ width: `${size}px`, height: `${size}px` }} class="object-contain" />
    : <span class="inline-flex" innerHTML={iconSvg(glyph.name, size, glyph.color, 1.4)} />;
}

function Row({ entry, api, selectedItems, draggingId }) {
  const selected = createMemo(() => selectedItems().has(entry.id));
  const dragging = createMemo(() => draggingId() === entry.id);

  return (
    <tr
      data-entry-id={entry.id}
      class={cx(ROW_BASE, (selected() || dragging()) ? 'acc-soft' : 'hover:bg-[#252630]')}
      draggable={!api.isRemote()}
      onClick={event => { event.stopPropagation(); api.toggle(entry, event); }}
      onContextMenu={event => api.context(event, entry)}
      onDblClick={() => api.open(entry)}
      onDragStart={event => api.dragStart(event, entry)}
      onDragEnd={() => api.dragEnd(entry)}
      onDragOver={event => api.dragOver(event, entry)}
      onDrop={event => api.drop(event, entry)}
    >
      <td class="flex items-center gap-2.5 py-2 pr-3">
        <Glyph entry={entry} size={16} /> {entry.name}
      </td>
      <td class="py-2 pr-3 capitalize text-white/50">{entry.type === 'folder' ? 'Folder' : `${entry.type} file`}</td>
      <td class="py-2 text-white/50 tabular-nums">{entry.type === 'folder' ? '' : formatSize(entry.size)}</td>
    </tr>
  );
}

function Table({ getState }) {
  const items = createMemo(() => getState().items || []);
  const isRemote = createMemo(() => Boolean(getState().drive));
  const selectedItems = mirrorSignal(getState().selectedItems);
  const draggingId = mirrorSignal(getState().draggingId);

  let container;
  const [metrics, setMetrics] = createSignal({ top: 0, h: 0 });

  const range = createMemo(() => {
    const len = items().length;
    const { top, h } = metrics();
    return {
      start: Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN),
      end: Math.min(len, Math.ceil((top + h) / ROW_HEIGHT) + OVERSCAN),
    };
  });
  const visible = createMemo(() => {
    const { start, end } = range();
    return items().slice(start, end);
  });
  const totalH = createMemo(() => items().length * ROW_HEIGHT);
  const topH = createMemo(() => range().start * ROW_HEIGHT);

  onMount(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const top = container.scrollTop;
      const h = container.clientHeight;
      setMetrics(prev => (prev.top === top && prev.h === h ? prev : { top, h }));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    container.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(container);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    });
  });

  const api = {
    isRemote,
    open: entry => getState().openItem?.(entry),
    context: (event, entry) => { event.stopPropagation(); getState().onItemContext?.(event, entry); },
    toggle(entry, event) {
      const signal = getState().selectedItems;
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(signal.peek());
        if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
        signal.value = next;
      } else {
        signal.value = new Set([entry.id]);
      }
    },
    dragStart: (event, entry) => getState().dragProps?.(entry)?.onDragStart?.(event),
    dragEnd: entry => getState().dragProps?.(entry)?.onDragEnd?.(),
    dragOver: (event, entry) => {
      const id = getState().draggingId.peek();
      if (!id || id === entry.id || entry.type !== 'folder') return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    drop: (event, entry) => {
      const id = getState().draggingId.peek();
      if (!id || id === entry.id || entry.type !== 'folder') return;
      getState().dropTarget?.(entry.id)?.onDrop?.(event);
    },
  };

  return (
    <div ref={node => { container = node; }} class="flex-1 overflow-y-auto">
      <div style={{ height: `${totalH()}px`, position: 'relative' }}>
        <table
          class="w-full text-left text-xs text-white/85"
          style={{ position: 'absolute', top: `${topH()}px`, left: '0', right: '0' }}
        >
          <thead>
            <tr class="border-b border-white/[0.1] text-white/45">
              <th class="py-2 pr-3 font-medium">Name</th>
              <th class="py-2 pr-3 font-medium">Type</th>
              <th class="py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            <For each={visible()}>{entry => (
              <Row entry={entry} api={api} selectedItems={selectedItems} draggingId={draggingId} />
            )}</For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default defineIsland(Table);
