import Icon from '../../Components/Icon';

export default function MusicLibrary({ leftOpen, likes, userTracks, currentId, view, play, setView, setLeftOpen, addFile, addUrl }) {
  if (!leftOpen) return null;
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#17171c]">
      <div className="px-4 pb-2 pt-3 text-sm font-bold">Your Library</div>
      <div className="flex gap-1.5 px-3 pb-2">
        {[
          { id: 'liked-songs', label: 'Liked Songs', count: likes.tracks.length },
          { id: 'liked-stations', label: 'Stations', count: likes.stations.length },
          { id: 'uploads', label: 'Uploads', count: userTracks.length },
        ].map(chip => (
          <button
            key={chip.id}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${view === chip.id ? 'acc-soft acc-text' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}
            onClick={() => setView(chip.id)}
            title={`${chip.label} · ${chip.count}`}
          >
            {chip.label} · {chip.count}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {likes.tracks.slice(0, 50).map(track => (
          <button key={track.id} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] ${track.id === currentId ? 'acc-soft' : ''}`} onClick={() => play(track, likes.tracks)}>
            {track.artwork ? <img src={track.artwork} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]"><Icon name="Music" size={14} className="text-white/40" /></span>}
            <span className="min-w-0">
              <span className={`block truncate text-xs ${track.id === currentId ? 'acc-text' : 'text-white/85'}`}>{track.title}</span>
              <span className="block truncate text-[10px] text-white/40">{track.artist}</span>
            </span>
          </button>
        ))}
        {likes.tracks.length === 0 && (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-white/35">
            Heart any song or station and it lands here — your Liked Songs collection.
          </p>
        )}
      </div>
    </aside>
  );
}
