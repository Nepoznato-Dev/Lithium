import { memo } from 'react';
import Icon from '../../Components/Icon';
import { formatTime } from './musicUtils';
import { soloistPosition } from '../../lib/music';

const MusicNowPlaying = memo(function MusicNowPlaying({ rightOpen, engine, solo, soloCtl, related, relatedStations, currentLiked, isLikedStation, toggleLikeTrack, toggleLikeStation, play, disconnectSoloist }) {
  if (!rightOpen) return null;
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-[#16161c] p-4">
      {solo.status !== 'off' && (
        <div className="rounded-xl border border-white/[0.06] bg-[#1c1c26] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${solo.status === 'connected' ? (solo.auth?.logged_in ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/25'}`} />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-white/85">{solo.auth?.device_name || 'Spotify Soloist'}</span>
            <button className="icon-btn h-7 w-7" title="Disconnect" onClick={disconnectSoloist}><Icon name="X" size={13} /></button>
          </div>
          {solo.status === 'connecting' && <p className="text-[11px] text-white/40">Connecting…</p>}
          {solo.status === 'connected' && solo.auth && !solo.auth.logged_in && (
            <p className="mb-2 text-[11px] leading-relaxed text-amber-300">Connected — waiting for the daemon&apos;s Spotify Connect login.</p>
          )}
          {solo.info && (
            <div className="mb-2 flex items-center gap-2.5">
              {solo.info.cover ? <img src={solo.info.cover} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded bg-white/[0.06]"><Icon name="Music" size={14} className="text-white/40" /></span>}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{solo.info.name}</p>
                <p className="truncate text-[10px] text-white/40">{solo.info.artist || solo.info.album}</p>
              </div>
            </div>
          )}
          {solo.status === 'connected' && (
            <>
              <div className="flex items-center justify-center gap-2">
                <button className="icon-btn h-8 w-8" onClick={() => soloCtl.current?.skipPrev()} aria-label="Previous"><Icon name="SkipBack" size={14} /></button>
                <button
                  className="btn-primary flex h-9 w-9 items-center justify-center rounded-full"
                  onClick={() => (solo.playStatus === 'playing' ? soloCtl.current?.pause() : soloCtl.current?.play())}
                  aria-label={solo.playStatus === 'playing' ? 'Pause' : 'Play'}
                >
                  {solo.playStatus === 'playing' ? <Icon name="Pause" size={15} /> : <Icon name="Play" size={15} className="translate-x-px" />}
                </button>
                <button className="icon-btn h-8 w-8" onClick={() => soloCtl.current?.skipNext()} aria-label="Next"><Icon name="SkipForward" size={14} /></button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] tabular-nums text-white/40">
                <span>{formatTime(soloistPosition(solo.anchor, solo.playStatus))}</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(1, (solo.info?.durationMs || 0) / 1000)}
                  value={Math.min(soloistPosition(solo.anchor, solo.playStatus), (solo.info?.durationMs || 0) / 1000)}
                  onChange={event => soloCtl.current?.seek(Number(event.target.value) * 1000)}
                  className="flex-1"
                  style={{ accentColor: 'var(--accent)' }}
                  aria-label="Seek on Soloist"
                />
                <span>{formatTime((solo.info?.durationMs || 0) / 1000)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Icon name="Volume2" size={13} className="text-white/40" />
                <input type="range" min="0" max="100" value={solo.volume} onChange={event => soloCtl.current?.setVolume(Number(event.target.value))} className="flex-1" style={{ accentColor: 'var(--accent)' }} aria-label="Soloist volume" />
                <span className="w-7 text-right text-[10px] text-white/40">{solo.volume}</span>
              </div>
            </>
          )}
          {solo.error && <p className="mt-2 text-[10px] text-red-300">{solo.error}</p>}
        </div>
      )}
      {engine.track ? (
        <>
          <div className="rounded-xl border border-white/[0.06] bg-[#1c1c26] p-4">
            {engine.track.artwork
              ? <img src={engine.track.artwork} alt="" className="mb-4 aspect-square w-full rounded-lg object-cover shadow-lg" />
              : <div className="mb-4 flex aspect-square w-full items-center justify-center rounded-lg bg-gradient-to-br from-white/[0.05] to-white/[0.02] ring-1 ring-inset ring-white/[0.06]"><Icon name="Music" size={40} className="text-white/15" /></div>}
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white/90">{engine.track.title}</p>
                <p className="truncate text-xs text-white/40">{engine.track.artist}</p>
              </div>
              {!engine.track.live && (
                <button className={`icon-btn h-8 w-8 ${currentLiked ? 'text-red-400' : ''}`} title="Like" onClick={() => toggleLikeTrack(engine.track)}>
                  <Icon name="Heart" size={15} className={currentLiked ? 'fill-current' : ''} />
                </button>
              )}
              {engine.track.live && (
                <button className={`icon-btn h-8 w-8 ${isLikedStation(engine.track.id) ? 'text-red-400' : ''}`} title="Save station" onClick={() => toggleLikeStation(engine.track)}>
                  <Icon name="Heart" size={15} className={isLikedStation(engine.track.id) ? 'fill-current' : ''} />
                </button>
              )}
            </div>
          </div>
          {related.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/30">Related music</h3>
              {related.map(track => (
                <button key={track.id} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]" onClick={() => play(track, related)}>
                  {track.artwork ? <img src={track.artwork} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]"><Icon name="Music" size={14} className="text-white/40" /></span>}
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-white/85">{track.title}</span>
                    <span className="block truncate text-[10px] text-white/40">{track.artist}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {relatedStations.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/30">More stations like this</h3>
              {relatedStations.map(station => (
                <button key={station.id} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]" onClick={() => play(station, relatedStations)}>
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]"><Icon name="Radio" size={14} className="text-white/40" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-white/85">{station.title}</span>
                    <span className="block truncate text-[10px] text-white/40">{station.artist}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 px-2 py-10 text-center">
          <div className="music-empty-icon flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] ring-1 ring-white/[0.08] shadow-md shadow-black/20">
            <Icon name="Music" size={32} strokeWidth={1} className="text-cyan-400/40" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-white/45">Nothing playing yet</p>
            <p className="text-[11px] leading-relaxed text-white/20">Pick a track and it shows up here<br />with related music and stations.</p>
          </div>
        </div>
      )}
    </aside>
  );
});

export default MusicNowPlaying;
