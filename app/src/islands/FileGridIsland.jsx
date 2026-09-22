/**
 * Solid island: File Explorer grid view.
 *
 * Replaces FileGrid.jsx + FileItem.jsx when low-end mode is on. This one is
 * ported first because of the scroll window: the Preact version rebuilds a
 * vnode tree for all ~60 visible tiles and diffs every one of them on each new
 * frame of the scroll, and per-tile state (selected / dragging) can only reach
 * a child through props — which is why the original needed an imperative
 * `classList` patch plus a MutationObserver to keep the drag ring attached
 * while virtualization swapped nodes out from under it.
 *
 * Here each tile is created once per entry and each binding is its own
 * subscription: sliding the window re-runs nothing, a selection change writes
 * `class`, and the ring survives node recycling by construction. The
 * MutationObserver is gone.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { cx, defineIsland, mirrorSignal } from './bridge.js';
import { glyphFor, iconSvg, pngSrc } from '../lib/fileExplorer/glyphs.js';
import { getCachedThumbUrl, getThumbUrl, releaseThumb, retainThumb } from '../lib/fileExplorer/thumbCache.js';

const ITEM_HEIGHT = 110;
const MIN_COL_WIDTH = 100;
const GAP = 6;
const OVERSCAN_ROWS = 3;

const TILE_BASE = 'flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors';
const TILE_TEXT = 'line-clamp-2 w-full break-words text-[11px] leading-snug text-white/80';

/**
 * Image preview, loaded only once the tile is near the viewport.
 *
 * The retain/release pair is what makes the blob cache evictable: a `blob:` URL
 * pins its Blob in memory until it is revoked, so a thumbnail that scrolls away
 * has to give up its reference or the cache's LRU can never reclaim it.
 */
function Thumb({ entry, className }) {
  let sentinel;
  const [url, setUrl] = createSignal(getCachedThumbUrl(entry) || null);

  retainThumb(entry.id);
  onCleanup(() => releaseThumb(entry.id));

  createEffect(() => {
    if (url() || (!entry.idb && !entry.content)) return;
    const io = new IntersectionObserver(([hit]) => {
      if (!hit.isIntersecting) return;
      io.disconnect();
      getThumbUrl(entry).then(next => { if (next) setUrl(next); });
    }, { rootMargin: '200px' });
    io.observe(sentinel);
    onCleanup(() => io.disconnect());
  });

  return (
    <Show
      when={url()}
      fallback={<div ref={node => { sentinel = node; }} class={cx(className, 'animate-pulse bg-[#2a2b31]')} />}
    >
      <img src={url()} alt="" class={className} />
    </Show>
  );
}

function Glyph({ entry, size }) {
  // Resolved once: a tile's type never changes while it is mounted.
  const png = pngSrc(entry);
  const glyph = glyphFor(entry);
  return png
    ? <img src={png} alt="" style={{ width: `${size}px`, height: `${size}px` }} class="object-contain" />
    : <span class="inline-flex" innerHTML={iconSvg(glyph.name, size, glyph.color, 1.4)} />;
}

function Tile({ entry, api, drive, selectedItems, draggingId }) {
  const selected = createMemo(() => selectedItems().has(entry.id));
  const dragging = createMemo(() => draggingId() === entry.id);
  const isImage = createMemo(() => entry.type === 'image' && !drive());

  return (
    <button
      data-entry-id={entry.id}
      class={cx(TILE_BASE, (selected() || dragging()) ? 'acc-soft acc-ring-soft' : 'hover:bg-[#2a2b31]')}
      title={entry.name}
      draggable={!drive()}
      onClick={event => { event.stopPropagation(); api.toggle(entry, event); }}
      onContextMenu={event => api.context(event, entry)}
      onDblClick={() => api.open(entry)}
      onDragStart={event => api.dragStart(event, entry)}
      onDragEnd={() => api.dragEnd(entry)}
      onDragOver={event => api.dragOver(event, entry)}
      onDrop={event => api.drop(event, entry)}
    >
      <Show when={isImage()} fallback={<Glyph entry={entry} size={38} />}>
        <Thumb entry={entry} className="h-10 w-10 rounded-md object-cover" />
      </Show>
      <span class={TILE_TEXT}>{entry.name}</span>
    </button>
  );
}

function Grid({ getState }) {
  const items = createMemo(() => getState().items || []);
  const drive = createMemo(() => Boolean(getState().drive));
  const selectedItems = mirrorSignal(getState().selectedItems);
  const draggingId = mirrorSignal(getState().draggingId);

  let container;
  const [cols, setCols] = createSignal(6);
  const [metrics, setMetrics] = createSignal({ top: 0, h: 0 });

  const range = createMemo(() => {
    const len = items().length;
    const c = cols();
    const rows = Math.ceil(len / c);
    const { top, h } = metrics();
    const startRow = Math.max(0, Math.floor(top / ITEM_HEIGHT) - OVERSCAN_ROWS);
    const endRow = Math.min(rows, Math.ceil((top + h) / ITEM_HEIGHT) + OVERSCAN_ROWS);
    return { start: startRow * c, end: Math.min(len, endRow * c) };
  });

  const visible = createMemo(() => {
    const { start, end } = range();
    return items().slice(start, end);
  });

  const totalHeight = createMemo(() => Math.ceil(items().length / cols()) * ITEM_HEIGHT);
  const topPadding = createMemo(() => Math.floor(range().start / cols()) * ITEM_HEIGHT);
  const bottomPadding = createMemo(() => Math.max(0, totalHeight() - Math.ceil(range().end / cols()) * ITEM_HEIGHT));

  /* One rAF-coalesced metrics write per frame, and only when a value actually
   * moved — a scroll already at the end of the list re-runs no memo at all. */
  onMount(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const top = container.scrollTop;
      const h = container.clientHeight;
      setMetrics(prev => (prev.top === top && prev.h === h ? prev : { top, h }));
    };
    const measure = () => setCols(Math.max(1, Math.floor((container.clientWidth + GAP) / (MIN_COL_WIDTH + GAP))));
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };

    measure();
    read();
    container.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => { measure(); read(); });
    ro.observe(container);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    });
  });

  /**
   * Stable façade over the shell's callbacks. Rows are created once, so they
   * capture this object and never the values underneath it.
   */
  const api = {
    open: entry => getState().openItem?.(entry),
    context: (event, entry) => { event.stopPropagation(); getState().onItemContext?.(event, entry); },
    clearSelection: () => { getState().selectedItems.value = new Set(); },
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
    /* Drag signals are read with peek(): inside a handler, `.value` would be a
     * tracked read and would subscribe the row to churn it never renders. */
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
    <div
      ref={node => { container = node; }}
      class="flex-1 overflow-y-auto"
      onClick={api.clearSelection}
      onContextMenu={event => getState().onItemContext?.(event)}
    >
      <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
        <div style={{ 'padding-top': `${topPadding()}px` }}>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5 px-3">
            <For each={visible()}>{entry => (
              <Tile
                entry={entry}
                api={api}
                drive={drive}
                selectedItems={selectedItems}
                draggingId={draggingId}
              />
            )}</For>
          </div>
        </div>
        <div style={{ height: `${bottomPadding()}px` }} />
      </div>
    </div>
  );
}

export default defineIsland(Grid);
