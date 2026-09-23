/**
 * Solid island: Gallery (all pictures) grid.
 *
 * The Preact one keeps every loaded thumbnail in one `loadedImages` object and
 * replaces that object each time a batch resolves, so a single arriving
 * thumbnail re-renders every visible tile — and the whole `allImages` slice is
 * rebuilt per scroll frame. Here the map disappears: each tile owns its own
 * URL signal, and the only thing a late-arriving thumbnail updates is its own
 * `<img src>`.
 *
 * Refcounting through the shared thumb cache is what actually bounds memory. A
 * `blob:` URL pins its decoded source until revoked, and a gallery is the one
 * view where the candidate set is the entire picture library rather than the
 * viewport.
 */
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { defineIsland } from './bridge.js';
import { getCachedThumbUrl, getThumbUrl, releaseThumb, retainThumb } from '../lib/fileExplorer/thumbCache.js';

const ITEM_HEIGHT = 135;
const MIN_COL_WIDTH = 125;
const GAP = 12;
const OVERSCAN_ROWS = 3;
const TILE_CLASS = 'aspect-square overflow-hidden rounded-lg border border-white/[0.08] bg-[#222328] transition-all hover:border-white/[0.14]';

function Tile({ entry, api }) {
  let sentinel;
  const [url, setUrl] = createSignal(getCachedThumbUrl(entry) || null);

  retainThumb(entry.id);
  onCleanup(() => releaseThumb(entry.id));

  createEffect(() => {
    if (url()) return;
    const io = new IntersectionObserver(([hit]) => {
      if (!hit.isIntersecting) return;
      io.disconnect();
      getThumbUrl(entry).then(next => { if (next) setUrl(next); });
    }, { rootMargin: '200px' });
    io.observe(sentinel);
    onCleanup(() => io.disconnect());
  });

  return (
    <button
      class={TILE_CLASS}
      onClick={() => api.preview(entry, url())}
      onContextMenu={event => api.context(event, entry)}
    >
      <Show
        when={url()}
        fallback={<div ref={node => { sentinel = node; }} class="h-full w-full animate-pulse bg-[#2a2b31]" />}
      >
        <img src={url()} alt={entry.name} class="h-full w-full object-cover" />
      </Show>
    </button>
  );
}

function Gallery({ getState }) {
  const images = createMemo(() => getState().allImages || []);

  let container;
  const [cols, setCols] = createSignal(6);
  const [metrics, setMetrics] = createSignal({ top: 0, h: 0 });

  const range = createMemo(() => {
    const len = images().length;
    const c = cols();
    const rows = Math.ceil(len / c);
    const { top, h } = metrics();
    const startRow = Math.max(0, Math.floor(top / ITEM_HEIGHT) - OVERSCAN_ROWS);
    const endRow = Math.min(rows, Math.ceil((top + h) / ITEM_HEIGHT) + OVERSCAN_ROWS);
    return { start: startRow * c, end: Math.min(len, endRow * c) };
  });
  const visible = createMemo(() => {
    const { start, end } = range();
    return images().slice(start, end);
  });
  const totalHeight = createMemo(() => Math.ceil(images().length / cols()) * ITEM_HEIGHT);
  const topPadding = createMemo(() => Math.floor(range().start / cols()) * ITEM_HEIGHT);
  const bottomPadding = createMemo(() => Math.max(0, totalHeight() - Math.ceil(range().end / cols()) * ITEM_HEIGHT));

  onMount(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const top = container.scrollTop;
      const h = container.clientHeight;
      setMetrics(prev => (prev.top === top && prev.h === h ? prev : { top, h }));
    };
    const measure = () => setCols(Math.max(1, Math.floor((container.clientWidth - 40 + GAP) / (MIN_COL_WIDTH + GAP))));
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

  const api = {
    context: (event, entry) => { event.stopPropagation(); getState().onItemContext?.(event, entry); },
    /** The preview overlay is the shell's; handing it the URL we already hold
     *  avoids a second cache hit (and a second LRU refresh) on every click. */
    async preview(entry, url) {
      const content = url || await getThumbUrl(entry);
      getState().preview.value = { name: entry.name, url: content, kind: 'image' };
    },
  };

  return (
    <div ref={node => { container = node; }} class="flex-1 overflow-y-auto">
      <div class="p-5">
        <div class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {`All pictures · ${images().length}`}
        </div>
      </div>
      <Switch>
        <Match when={images().length === 0}>
          {/* Keep the header above, but there is nothing to virtualise. */}
          <p class="px-5 text-xs text-white/35">No images yet.</p>
        </Match>
        <Match when={true}>
          <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
            <div style={{ 'padding-top': `${topPadding()}px` }}>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-3 px-5">
                <For each={visible()}>{entry => <Tile entry={entry} api={api} />}</For>
              </div>
            </div>
            <div style={{ height: `${bottomPadding()}px` }} />
          </div>
        </Match>
      </Switch>
    </div>
  );
}

export default defineIsland(Gallery);
