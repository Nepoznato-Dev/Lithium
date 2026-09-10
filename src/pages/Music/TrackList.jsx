import { memo } from 'react';
import Icon from '../../Components/Icon';
import { formatTime, openInLithiumBrowser } from './musicUtils';

const TrackList = memo(function TrackList({ title, tracks, currentId, playing, onPlay, onLike, isLiked, hideLike = false, onDownload, downloading, empty }) {
  if (!tracks.length) return <p className="px-2 py-6 text-center text-xs text-white/30">{empty}</p>;
  return (
    <div>
      {title && <h2 className="mb-2 text-lg font-bold">{title}</h2>}
      <div className="music-track-list overflow-hidden rounded-xl border border-white/[0.05]">
        {tracks.map((track, index) => {
          const active = track.id === currentId;
          return (
            <div
              key={track.id}
              className={`music-track-row group relative flex cursor-pointer items-center gap-3 px-3 py-2 transition-all duration-150 ${active ? 'music-track-row-active bg-cyan-400/8' : index % 2 ? 'bg-white/[0.015]' : ''} hover:bg-white/[0.05]`}
              onClick={() => onPlay(track)}
            >
              {active && <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-[var(--accent)]" />}
              <span className="w-5 text-right font-mono text-[10px] text-white/30">{active && playing ? <Icon name="Pause" size={12} className="text-cyan-300 inline" /> : index + 1}</span>
              {track.artwork ? <img src={track.artwork} alt="" className="h-9 w-9 rounded object-cover shadow-sm" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]">{track.live ? <Icon name="Radio" size={14} className="text-white/40" /> : <Icon name="Music" size={14} className="text-white/40" />}</span>}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-medium ${active ? 'text-cyan-300' : 'text-white/85'}`}>{track.title}</p>
                <p className="truncate text-[10px] text-white/40">{track.artist}</p>
              </div>
              {track.service && <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50">{track.service}</span>}
              {track.preview && <span className="rounded bg-cyan-400/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-300">30s</span>}
              {track.live && <span className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300"><span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Live</span>}
              {track.openUrl && !track.url && (
                <span
                  className="icon-btn h-7 w-7"
                  title="Opens in Browser"
                  onClick={event => { event.stopPropagation(); openInLithiumBrowser(track.openUrl); }}
                >
                  <Icon name="ExternalLink" size={12} />
                </span>
              )}
              {onDownload && !track.local && track.url && (
                <button
                  className={`music-ctrl-btn icon-btn h-7 w-7 ${downloading?.has(track.id) ? 'text-cyan-300' : 'opacity-0 group-hover:opacity-100'}`}
                  title={downloading?.has(track.id) ? 'Downloading...' : 'Download to library'}
                  disabled={downloading?.has(track.id)}
                  onClick={event => { event.stopPropagation(); onDownload(track); }}
                >
                  <Icon name={downloading?.has(track.id) ? 'Loader2' : 'Download'} size={13} className={downloading?.has(track.id) ? 'animate-spin' : ''} />
                </button>
              )}
              {!hideLike && onLike && (
                <button
                  className={`music-ctrl-btn icon-btn h-7 w-7 ${isLiked?.(track.id) ? 'text-red-400' : 'opacity-0 group-hover:opacity-100'}`}
                  title="Like"
                  onClick={event => { event.stopPropagation(); onLike(track); }}
                >
                  <Icon name="Heart" size={13} className={isLiked?.(track.id) ? 'fill-current' : ''} />
                </button>
              )}
              {track.duration ? <span className="w-9 text-right font-mono text-[10px] tabular-nums text-white/35">{formatTime(track.duration)}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default TrackList;
