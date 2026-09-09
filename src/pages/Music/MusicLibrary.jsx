import Icon from '../../Components/Icon';

export default function MusicLibrary({ leftOpen, likes, userTracks, currentId, view, play, setView, setLeftOpen, addFile, addUrl }) {
  if (!leftOpen) return null;
  const chips = [
    { id: 'liked-songs', label: 'Liked Songs', count: likes.tracks.length, gradClass: 'music-lib-card-liked', icon: 'Heart' },
    { id: 'liked-stations', label: 'Stations', count: likes.stations.length, gradClass: 'music-lib-card-stations', icon: 'Radio' },
    { id: 'uploads', label: 'Uploads', count: userTracks.length, gradClass: 'music-lib-card-uploads', icon: 'Upload' },
  ];
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#16161c]">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <Icon name="Library" size={14} className="text-white/40" />
        <span className="text-[13px] font-bold tracking-tight text-white/85">Your Library</span>
      </div>
      <div className="flex gap-1.5 px-3 pb-3">
        {chips.map(chip => (
          <button
            key={chip.id}
            className={`music-lib-chip group relative rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-all duration-150 ${chip.gradClass} ${view === chip.id ? 'text-white/90 opacity-100 shadow-sm' : 'text-white/50 opacity-55 hover:opacity-85'}`}
            onClick={() => setView(chip.id)}
            title={`${chip.label} \u00b7 ${chip.count}`}
          >
            <span className="flex items-center gap-1.5">
              <Icon name={chip.icon} size={10} className={view === chip.id ? 'opacity-80' : 'opacity-50'} />
              {chip.label} <span className="font-semibold opacity-70">{chip.count}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {likes.tracks.slice(0, 50).map(track => (
          <button key={track.id} className={`music-lib-track flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-all duration-150 hover:bg-white/[0.05] ${track.id === currentId ? 'bg-cyan-400/8 ring-1 ring-inset ring-cyan-400/10' : ''}`} onClick={() => play(track, likes.tracks)}>
            {track.artwork ? <img src={track.artwork} alt="" className="h-9 w-9 rounded object-cover shadow-sm" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.05]"><Icon name="Music" size={14} className="text-white/30" /></span>}
            <span className="min-w-0">
              <span className={`block truncate text-xs ${track.id === currentId ? 'text-cyan-300 font-semibold' : 'text-white/85'}`}>{track.title}</span>
              <span className="block truncate text-[10px] text-white/35">{track.artist}</span>
            </span>
          </button>
        ))}
        {likes.tracks.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
            <div className="music-empty-icon flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06]">
              <Icon name="Heart" size={20} className="text-white/15" />
            </div>
            <p className="text-[11px] leading-relaxed text-white/25">
              Heart any song or station<br />and it lands right here.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
