/**
 * Solid island: the music player transport bar.
 *
 * `lib/music.js` is a framework-free audio engine with `subscribe()` and one
 * flat state object, so this island takes the subscription itself instead of
 * being pushed from Preact. That matters more here than anywhere else:
 * `timeupdate` re-emits at animation-frame rate while a track plays, and
 * `getState()` returns a *fresh object* each time, so the Preact footer fails
 * its `memo` check on every tick and rebuilds all ~30 of its elements — the
 * artwork `<img>`, every icon, both sliders — sixty-ish times a second to
 * change two digits and one `value`.
 *
 * Here the state is split into one signal per field and every Solid setter is
 * `===`-guarded, so a progress tick notifies exactly two text nodes and the
 * seek input. Nothing else in the body re-runs, and the host never re-renders.
 */
import { Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { cx, defineIsland } from './bridge.js';
import { iconSvg } from '../lib/iconSvg.js';
import { formatTime } from '../pages/Music/musicUtils.js';
import {
  getState as engineState, subscribe, togglePlay, seekTo, stepTrack, setEngineVolume,
} from '../lib/music.js';

function Transport({ getState: shellState }) {
  // Seeded from the live engine, not from zero: a track may already be playing
  // when low-end mode is switched on mid-session.
  const [track, setTrack] = createSignal(engineState().track);
  const [playing, setPlaying] = createSignal(engineState().playing);
  const [progress, setProgress] = createSignal(engineState().progress);
  const [duration, setDuration] = createSignal(engineState().duration);
  const [volume, setVolume] = createSignal(engineState().volume);

  onCleanup(subscribe(next => {
    // Unconditional writes: each setter bails on its own, so only the fields
    // that really moved propagate. This is the entire reason for the split.
    setTrack(next.track);
    setPlaying(next.playing);
    setProgress(next.progress);
    setDuration(next.duration);
    setVolume(next.volume);
  }));

  const artwork = createMemo(() => track()?.artwork || null);
  const title = createMemo(() => track()?.title || 'Nothing playing');
  const artist = createMemo(() => track()?.artist || 'Pick a track to start listening');
  const seekValue = createMemo(() => Math.min(progress(), duration() || 0));
  /** `currentLiked` is a plain Preact value, so it only arrives on a host
   *  push — reading it through `shellState` costs one memo per update, not one
   *  per tick, because the host does not re-render for progress any more. */
  const liked = createMemo(() => Boolean(shellState()?.currentLiked));

  return (
    <footer class="music-player-bar relative flex items-center gap-4 border-t-0 bg-[#16161c] px-4 py-2.5">
      <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/25 to-transparent" aria-hidden="true" />

      <div class="flex w-56 min-w-0 items-center gap-3">
        <Show
          when={artwork()}
          fallback={<span class="flex h-11 w-11 items-center justify-center rounded-md bg-white/[0.06]"><span class="inline-flex text-white/25" innerHTML={iconSvg('Music', 16)} /></span>}
        >
          {src => <img src={src()} alt="" class="h-11 w-11 rounded-md object-cover shadow-md" />}
        </Show>
        <div class="min-w-0">
          <p class="truncate text-[13px] font-semibold text-white/90">{title()}</p>
          <p class={cx('truncate text-[11px]', track() ? 'text-white/35' : 'text-white/20 italic')}>{artist()}</p>
        </div>
        <Show when={track() && !track().live}>
          <button
            class={cx('music-ctrl-btn icon-btn h-7 w-7 shrink-0', liked() && 'text-red-400')}
            title="Like"
            onClick={() => shellState()?.toggleLikeTrack?.(track())}
          >
            <span class={cx('inline-flex', liked() && 'fill-current')} innerHTML={iconSvg('Heart', 13)} />
          </button>
        </Show>
      </div>

      <div class="flex flex-1 flex-col items-center gap-1.5">
        <div class="flex items-center gap-3">
          <button class="music-ctrl-btn icon-btn h-8 w-8" onClick={() => stepTrack(-1)} aria-label="Previous">
            <span class="inline-flex" innerHTML={iconSvg('SkipBack', 15)} />
          </button>
          <button
            class="music-play-btn flex h-10 w-10 items-center justify-center rounded-full text-slate-950 shadow-md"
            style={{ 'background-color': 'var(--accent)' }}
            onClick={togglePlay}
            disabled={!track()}
            aria-label={playing() ? 'Pause' : 'Play'}
          >
            <Show
              when={playing()}
              fallback={<span class="inline-flex translate-x-px" innerHTML={iconSvg('Play', 17)} />}
            >
              <span class="inline-flex" innerHTML={iconSvg('Pause', 17)} />
            </Show>
          </button>
          <button class="music-ctrl-btn icon-btn h-8 w-8" onClick={() => stepTrack(1)} aria-label="Next">
            <span class="inline-flex" innerHTML={iconSvg('SkipForward', 15)} />
          </button>
        </div>

        <div class="flex w-full max-w-xl items-center gap-2 text-[10px] tabular-nums text-white/35">
          <span>{formatTime(progress())}</span>
          <input
            type="range"
            min="0"
            max={duration() || 0}
            value={seekValue()}
            onInput={event => seekTo(Number(event.target.value))}
            class="flex-1"
            style={{ 'accent-color': 'var(--accent)' }}
            aria-label="Seek"
          />
          <span>{formatTime(duration())}</span>
        </div>
      </div>

      <div class="flex w-40 items-center justify-end gap-2">
        <span class="inline-flex text-white/35" innerHTML={iconSvg('Volume2', 14)} />
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={volume()}
          onInput={event => setEngineVolume(Number(event.target.value))}
          class="w-24"
          style={{ 'accent-color': 'var(--accent)' }}
          aria-label="Volume"
        />
      </div>
    </footer>
  );
}

export default defineIsland(Transport);
