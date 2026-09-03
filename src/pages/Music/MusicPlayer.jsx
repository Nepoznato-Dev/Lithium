import Icon from '../../Components/Icon';
import { formatTime } from './musicUtils';
import { togglePlay, seekTo, setEngineVolume, stepTrack } from '../../lib/music';

export default function MusicPlayer({ engine, currentLiked, toggleLikeTrack }) {
  return (
    <footer className="flex items-center gap-3 border-t border-white/[0.06] bg-[#141419] px-3 py-2">
      <div className="flex w-56 min-w-0 items-center gap-2.5">
        {engine.track?.artwork ? <img src={engine.track.artwork} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded bg-white/[0.06]"><Icon name="Music" size={16} className="text-white/30" /></span>}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{engine.track?.title || 'Nothing playing'}</p>
          <p className="truncate text-[10px] text-white/40">{engine.track?.artist || 'Pick a track to start'}</p>
        </div>
        {engine.track && !engine.track.live && (
          <button className={`icon-btn h-7 w-7 shrink-0 ${currentLiked ? 'text-red-400' : ''}`} title="Like" onClick={() => toggleLikeTrack(engine.track)}>
            <Icon name="Heart" size={13} className={currentLiked ? 'fill-current' : ''} />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <button className="icon-btn h-8 w-8" onClick={() => stepTrack(-1)} aria-label="Previous"><Icon name="SkipBack" size={15} /></button>
          <button className="btn-primary flex h-9 w-9 items-center justify-center rounded-full" onClick={togglePlay} disabled={!engine.track} aria-label={engine.playing ? 'Pause' : 'Play'}>
            {engine.playing ? <Icon name="Pause" size={16} /> : <Icon name="Play" size={16} className="translate-x-px" />}
          </button>
          <button className="icon-btn h-8 w-8" onClick={() => stepTrack(1)} aria-label="Next"><Icon name="SkipForward" size={15} /></button>
        </div>
        <div className="flex w-full max-w-xl items-center gap-2 text-[10px] tabular-nums text-white/40">
          <span>{formatTime(engine.progress)}</span>
          <input type="range" min="0" max={engine.duration || 0} value={Math.min(engine.progress, engine.duration || 0)} onChange={event => seekTo(Number(event.target.value))} className="flex-1" style={{ accentColor: 'var(--accent)' }} aria-label="Seek" />
          <span>{formatTime(engine.duration)}</span>
        </div>
      </div>
      <div className="flex w-40 items-center justify-end gap-2">
        <Icon name="Volume2" size={14} className="text-white/40" />
        <input type="range" min="0" max="1" step="0.02" value={engine.volume} onChange={event => setEngineVolume(Number(event.target.value))} className="w-24" style={{ accentColor: 'var(--accent)' }} aria-label="Volume" />
      </div>
    </footer>
  );
}
