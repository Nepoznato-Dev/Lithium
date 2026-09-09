import Icon from '../../Components/Icon';
import { formatTime } from './musicUtils';
import { togglePlay, seekTo, setEngineVolume, stepTrack } from '../../lib/music';

export default function MusicPlayer({ engine, currentLiked, toggleLikeTrack }) {
  return (
    <footer className="music-player-bar relative flex items-center gap-4 border-t-0 bg-[#16161c] px-4 py-2.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/25 to-transparent" aria-hidden="true" />
      <div className="flex w-56 min-w-0 items-center gap-3">
        {engine.track?.artwork ? <img src={engine.track.artwork} alt="" className="h-11 w-11 rounded-md object-cover shadow-md" /> : <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white/[0.06]"><Icon name="Music" size={16} className="text-white/25" /></span>}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white/90">{engine.track?.title || 'Nothing playing'}</p>
          <p className={`truncate text-[11px] ${engine.track ? 'text-white/35' : 'text-white/20 italic'}`}>{engine.track?.artist || 'Pick a track to start listening'}</p>
        </div>
        {engine.track && !engine.track.live && (
          <button className={`music-ctrl-btn icon-btn h-7 w-7 shrink-0 ${currentLiked ? 'text-red-400' : ''}`} title="Like" onClick={() => toggleLikeTrack(engine.track)}>
            <Icon name="Heart" size={13} className={currentLiked ? 'fill-current' : ''} />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          <button className="music-ctrl-btn icon-btn h-8 w-8" onClick={() => stepTrack(-1)} aria-label="Previous"><Icon name="SkipBack" size={15} /></button>
          <button className="music-play-btn flex h-10 w-10 items-center justify-center rounded-full text-slate-950 shadow-md" style={{ backgroundColor: 'var(--accent)' }} onClick={togglePlay} disabled={!engine.track} aria-label={engine.playing ? 'Pause' : 'Play'}>
            {engine.playing ? <Icon name="Pause" size={17} /> : <Icon name="Play" size={17} className="translate-x-px" />}
          </button>
          <button className="music-ctrl-btn icon-btn h-8 w-8" onClick={() => stepTrack(1)} aria-label="Next"><Icon name="SkipForward" size={15} /></button>
        </div>
        <div className="flex w-full max-w-xl items-center gap-2 text-[10px] tabular-nums text-white/35">
          <span>{formatTime(engine.progress)}</span>
          <input type="range" min="0" max={engine.duration || 0} value={Math.min(engine.progress, engine.duration || 0)} onChange={event => seekTo(Number(event.target.value))} className="flex-1" style={{ accentColor: 'var(--accent)' }} aria-label="Seek" />
          <span>{formatTime(engine.duration)}</span>
        </div>
      </div>
      <div className="flex w-40 items-center justify-end gap-2">
        <Icon name="Volume2" size={14} className="text-white/35" />
        <input type="range" min="0" max="1" step="0.02" value={engine.volume} onChange={event => setEngineVolume(Number(event.target.value))} className="w-24" style={{ accentColor: 'var(--accent)' }} aria-label="Volume" />
      </div>
    </footer>
  );
}
