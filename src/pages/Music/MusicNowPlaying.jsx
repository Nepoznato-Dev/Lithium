import Icon from '../../Components/Icon';
import { formatTime } from './musicUtils';
import { soloistPosition } from '../../lib/music';

export default function MusicNowPlaying({ rightOpen, engine, solo, soloCtl, related, relatedStations, currentLiked, isLikedStation, toggleLikeTrack, toggleLikeStation, play, disconnectSoloist }) {
  if (!rightOpen) return null;
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-[#17171c] p-3">
      {solo.status !== 'off' && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${solo.status === 'connected' ? (solo.auth?.logged_in ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/30'}`} />
            <span className="min-w-0 flex-1 truncate text-xs font-bold">{solo.auth?.device_name || 'Spotify Soloist'}</span>
            <button className="icon-btn h-7 w-7" title="Disconnect" onClick={disconnectSoloist}><Icon name="X" size={13} /></button>
          </div>
          {solo.status === 'connecting' && <p className="text-[11px] text-white/40">Connecting…</p>}
          {solo.status === 'connected' && solo.auth && !solo.auth.logged_in && (
            <p className="mb-2 text-[11px] leading-relaxed text-amber-300">Connected — waiting for the daemon's Spotify Connect login.</p>
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
          <div className="rounded-xl bg-white/[0.04] p-3">
            {engine.track.artwork
              ? <img src={engine.track.artwork} alt="" className="mb-3 aspect-square w-full rounded-lg object-cover" />
              : <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-lg bg-white/[0.06]"><Icon name="Music" size={40} className="text-white/25" /></div>}
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{engine.track.title}</p>
                <p className="truncate text-xs text-white/45">{engine.track.artist}</p>
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
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Related music</h3>
              {related.map(track => (
                <button key={track.id} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]" onClick={() => play(track, related)}>
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
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">More stations like this</h3>
              {relatedStations.map(station => (
                <button key={station.id} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]" onClick={() => play(station, relatedStations)}>
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
        <p className="px-2 py-6 text-center text-xs text-white/30">Nothing playing yet.<br />Pick a track and it shows up here with related music.</p>
      )}
    </aside>
  );
}
