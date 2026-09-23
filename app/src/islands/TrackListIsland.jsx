/**
 * Solid island: a music track list (search results, liked songs, uploads).
 *
 * This is the worst hot path in the music app, and it is not the engine's
 * fault: every `TrackList` in `pages/Music/index.jsx` is handed a fresh
 * `onPlay={track => play(track, list)}` arrow, so the `memo` on the Preact
 * component can never bail. Every keystroke in the search box *and* every
 * ~10fps progress tick therefore rebuilds all ~10 elements of all ~50 result
 * rows — 500 vnodes to move one highlight from one row to another.
 *
 * Two things fix it here. `<For>` is keyed on the row's *identity*, so the row
 * DOM survives as long as the track array does, and `currentId`/`playing` are
 * read through memos that bail on their own value — so a tick that changes
 * neither re-runs a single row.
 *
 * `isLiked` needs one more step: it is a function recreated per host render, so
 * reading it per row would put the O(N) scan back into every row. `likedIds`
 * does one pass and returns the *previous Set instance* when membership is
 * unchanged, which parks every dependent row memo.
 */
import { For, Show, createMemo } from 'solid-js';
import { cx, defineIsland } from './bridge.js';
import { iconSvg } from '../lib/iconSvg.js';
import { formatTime, openInLithiumBrowser } from '../pages/Music/musicUtils.js';

const ROW_BASE = 'music-track-row group relative flex cursor-pointer items-center gap-3 px-3 py-2 transition-all duration-150';

function Row({ track, index, api, currentId, playing, likedIds, downloading, canLike, canDownload }) {
  const active = createMemo(() => currentId() === track.id);
  const liked = createMemo(() => likedIds().has(track.id));
  const queued = createMemo(() => Boolean(downloading()?.has(track.id)));

  return (
    <div
      class={cx(
        ROW_BASE,
        active() ? 'music-track-row-active bg-cyan-400/8' : index() % 2 ? 'bg-white/[0.015]' : '',
        'hover:bg-white/[0.05]',
      )}
      onClick={() => api.play(track)}
    >
      <Show when={active()}>
        <div class="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-[var(--accent)]" />
      </Show>

      <span class="w-5 text-right font-mono text-[10px] text-white/30">
        <Show
          when={active() && playing()}
          fallback={<>{index() + 1}</>}
        >
          <span class="inline-flex text-cyan-300" innerHTML={iconSvg('Pause', 12)} />
        </Show>
      </span>

      <Show
        when={track.artwork}
        fallback={(
          <span class="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]">
            <span class="inline-flex text-white/40" innerHTML={iconSvg(track.live ? 'Radio' : 'Music', 14)} />
          </span>
        )}
      >
        <img src={track.artwork} alt="" class="h-9 w-9 rounded object-cover shadow-sm" />
      </Show>

      <div class="min-w-0 flex-1">
        <p class={cx('truncate text-xs font-medium', active() ? 'text-cyan-300' : 'text-white/85')}>{track.title}</p>
        <p class="truncate text-[10px] text-white/40">{track.artist}</p>
      </div>

      <Show when={track.service}>
        <span class="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50">{track.service}</span>
      </Show>
      <Show when={track.preview}>
        <span class="rounded bg-cyan-400/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-300">30s</span>
      </Show>
      <Show when={track.live}>
        <span class="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300">
          <span class="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Live
        </span>
      </Show>

      <Show when={track.openUrl && !track.url}>
        <span
          class="icon-btn h-7 w-7"
          title="Opens in Browser"
          onClick={event => { event.stopPropagation(); openInLithiumBrowser(track.openUrl); }}
        >
          <span class="inline-flex" innerHTML={iconSvg('ExternalLink', 12)} />
        </span>
      </Show>

      <Show when={canDownload() && !track.local && track.url}>
        <button
          class={cx('music-ctrl-btn icon-btn h-7 w-7', queued() ? 'text-cyan-300' : 'opacity-0 group-hover:opacity-100')}
          title={queued() ? 'Downloading...' : 'Download to library'}
          disabled={queued()}
          onClick={event => { event.stopPropagation(); api.download(track); }}
        >
          <span
            class={cx('inline-flex', queued() && 'animate-spin')}
            innerHTML={iconSvg(queued() ? 'Loader2' : 'Download', 13)}
          />
        </button>
      </Show>

      <Show when={canLike()}>
        <button
          class={cx('music-ctrl-btn icon-btn h-7 w-7', liked() ? 'text-red-400' : 'opacity-0 group-hover:opacity-100')}
          title="Like"
          onClick={event => { event.stopPropagation(); api.like(track); }}
        >
          <span class={cx('inline-flex', liked() && 'fill-current')} innerHTML={iconSvg('Heart', 13)} />
        </button>
      </Show>

      <Show when={track.duration}>
        <span class="w-9 text-right font-mono text-[10px] tabular-nums text-white/35">{formatTime(track.duration)}</span>
      </Show>
    </div>
  );
}

function TrackList({ getState }) {
  /* Each of these reads `getState()`, so they re-evaluate only when the host
     pushes — and each bails by value, so a push that changed nothing relevant
     stops here instead of fanning out into the rows. `<For>` is keyed on row
     identity, so it survives every push that isn't a real array change. */
  const tracks = createMemo(() => getState().tracks || []);
  const currentId = createMemo(() => getState().currentId || null);
  const playing = createMemo(() => Boolean(getState().playing));
  const title = createMemo(() => getState().title || '');
  const empty = createMemo(() => getState().empty || '');
  const downloading = createMemo(() => getState().downloading);

  const likedIds = createMemo(prev => {
    const state = getState();
    if (typeof state.isLiked !== 'function') return prev && prev.size === 0 ? prev : new Set();
    const next = new Set();
    for (const track of state.tracks || []) {
      if (state.isLiked(track.id)) next.add(track.id);
    }
    if (prev && prev.size === next.size) {
      for (const id of next) if (!prev.has(id)) return next;
      return prev;
    }
    return next;
  });

  const api = {
    // Handlers are read with a call, never captured, so a fresh arrow from the
    // host is used without remounting anything.
    play: track => getState().onPlay?.(track),
    like: track => getState().onLike?.(track),
    download: track => getState().onDownload?.(track),
  };

  /* Hoisted out of the rows on purpose: these read `getState()`, so resolving
     them once per host push keeps ~150 per-row condition closures from running
     at the engine's tick rate. Each bails on its own boolean anyway. */
  const canLike = createMemo(() => !getState().hideLike && Boolean(getState().onLike));
  const canDownload = createMemo(() => Boolean(getState().onDownload));

  return (
    <Show
      when={tracks().length > 0}
      fallback={<p class="px-2 py-6 text-center text-xs text-white/30">{empty()}</p>}
    >
      <div>
        <Show when={title()}>
          <h2 class="mb-2 text-lg font-bold">{title()}</h2>
        </Show>
        <div class="music-track-list overflow-hidden rounded-xl border border-white/[0.05]">
          <For each={tracks()}>{(track, index) => (
            <Row
              track={track}
              index={index}
              api={api}
              currentId={currentId}
              playing={playing}
              likedIds={likedIds}
              downloading={downloading}
              canLike={canLike}
              canDownload={canDownload}
            />
          )}</For>
        </div>
      </div>
    </Show>
  );
}

export default defineIsland(TrackList);
