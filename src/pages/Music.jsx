import React, { useEffect, useMemo, useRef, useState } from 'react';

import { storage } from '../lib/storage/localStorage';
import { searchAudius, searchJamendo, searchRadio, connectSoloist, soloistEntityInfo, soloistPosition, getState, onEnded, onError, playTrack, seekTo, setEngineVolume, stepTrack, subscribe, togglePlay, isSupportedAudioFile, saveLocalAudioBlob, getLocalAudioBlob, saveLocalPicture, getLocalPicture } from '../lib/music';
import { loadMusicApis, resolveSoundCloudStream, saveMusicApis, searchConfiguredServices, testSpotify } from '../lib/serviceApis';
import { parseBlob } from 'music-metadata-browser';
import { searchYouTubeInvidious, searchSpotifyProvider, fetchAudioBlob } from '../lib/musicProviders';
import Icon from '../Components/Icon';
import WinControls from '../Components/Desktop/WinControls';

export function openInLithiumBrowser(url) {
  window.dispatchEvent(new CustomEvent('lithium:open-browser', { detail: url }));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const DEFAULT_PLAYER_SETTINGS = { leftOpen: true, rightOpen: true, autoplayRelated: true };

/** Spotify-style three-pane player: closable library + now-playing sidebars,
 *  static bottom bar, liked songs/stations, related music, service APIs. */
export default function Music({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [engine, setEngine] = useState(getState);
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PLAYER_SETTINGS, ...storage.get('music-player-settings', {}) }));
  const [leftOpen, setLeftOpen] = useState(prefs.leftOpen);
  const [rightOpen, setRightOpen] = useState(prefs.rightOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apis, setApis] = useState(loadMusicApis);

  const [mode, setMode] = useState('songs'); // songs | radio
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('all'); // all | youtube | spotify | library
  const [downloading, setDownloading] = useState(new Set());

  const [view, setView] = useState('search'); // search | liked-songs | liked-stations | uploads
  const [likes, setLikes] = useState(() => storage.get('music-likes', { tracks: [], stations: [] }));
  const [userTracks, setUserTracks] = useState(() => storage.get('music-library', []));

  const [related, setRelated] = useState([]);
  const [relatedStations, setRelatedStations] = useState([]);
  const [spotifyTest, setSpotifyTest] = useState('');
  const [solo, setSolo] = useState({ status: 'off', auth: null, info: null, playStatus: 'idle', volume: 50, anchor: null, error: '' });
  const soloCtl = useRef(null);
  const [, setSoloTick] = useState(0);
  const relatedRef = useRef([]);

  useEffect(() => subscribe(setEngine), []);
  useEffect(() => onError(state => {
    if (state.track) setError(`Couldn't play "${state.track.title}" — the provider blocked the stream. Try the next track.`);
  }), []);
  useEffect(() => storage.set('music-likes', likes), [likes]);
  useEffect(() => storage.set('music-library', userTracks.filter(track => !track.local)), [userTracks]);
  useEffect(() => storage.set('music-local-library', userTracks.filter(track => track.local).map(({ id, title, artist, local, artwork }) => ({ id, title, artist, local, hasArtwork: Boolean(artwork) }))), [userTracks]);

  // Restore blob URLs for local tracks on mount (blob URLs don't survive reloads).
  useEffect(() => {
    const locals = storage.get('music-local-library', []);
    if (!locals.length) return;
    let cancelled = false;
    (async () => {
      const restored = [];
      for (const meta of locals) {
        const blob = await getLocalAudioBlob(meta.id);
        if (!blob || cancelled) continue;
        const track = { ...meta, url: URL.createObjectURL(blob) };
        if (meta.hasArtwork) {
          const pic = await getLocalPicture(meta.id);
          if (pic && !cancelled) track.artwork = URL.createObjectURL(pic);
        }
        restored.push(track);
      }
      if (!cancelled && restored.length) setUserTracks(prev => [...restored, ...prev]);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    storage.set('music-player-settings', prefs);
    relatedRef.current = related;
  }, [prefs, related]);

  const currentId = engine.track?.id || null;
  const currentLiked = currentId && likes.tracks.some(track => track.id === currentId);

  /* ---------- playback ---------- */

  const play = async (track, queueList) => {
    if (track.id === currentId) { togglePlay(); return; }
    // Spotify-URI tracks go to the Soloist device when it's connected (full playback).
    if (solo.status === 'connected' && track.spotifyUri) { soloCtl.current?.play(track.spotifyUri); return; }
    let resolved = track;
    if (track.scId && !track.url) {
      const url = await resolveSoundCloudStream(track.scId, apis.soundcloud.trim());
      if (!url) { setError('SoundCloud stream unavailable for this track.'); return; }
      resolved = { ...track, url };
    }
    if (!resolved.url && resolved.openUrl) { openInLithiumBrowser(resolved.openUrl); return; }
    if (!resolved.url) return;
    playTrack(resolved, queueList);
  };

  // Autoplay related music when the queue runs out.
  useEffect(() => onEnded(() => {
    if (prefs.autoplayRelated && relatedRef.current.length) {
      playTrack(relatedRef.current[0], relatedRef.current);
    }
  }), [prefs.autoplayRelated]);

  /* ---------- Soloist device ---------- */

  const disconnectSoloist = () => {
    soloCtl.current?.close();
    soloCtl.current = null;
    setSolo(prev => ({ ...prev, status: 'off', auth: null, info: null, anchor: null, error: '' }));
  };

  const connectSoloistDevice = () => {
    disconnectSoloist();
    const url = (apis.soloistUrl || '').trim() || 'ws://127.0.0.1:9090';
    setSolo({ status: 'connecting', auth: null, info: null, playStatus: 'idle', volume: 50, anchor: null, error: '' });
    soloCtl.current = connectSoloist(url, {
      onOpen: () => {
        setSolo(prev => ({ ...prev, status: 'connected', error: '' }));
        setTimeout(() => { soloCtl.current?.getAuth(); soloCtl.current?.getState(); }, 60);
      },
      onAuth: auth => setSolo(prev => ({ ...prev, auth })),
      onPlayback: p => setSolo(prev => ({
        ...prev,
        playStatus: p.status || prev.playStatus,
        volume: p.volume ?? prev.volume,
        anchor: p.position || prev.anchor,
        info: soloistEntityInfo(p.item) || prev.info,
      })),
      onTrack: item => setSolo(prev => ({ ...prev, info: soloistEntityInfo(item) || prev.info })),
      onStatus: status => setSolo(prev => ({ ...prev, playStatus: status })),
      onVolume: volume => setSolo(prev => ({ ...prev, volume })),
      onPosition: anchor => setSolo(prev => ({ ...prev, anchor })),
      onError: message => setSolo(prev => ({ ...prev, error: message })),
      onClose: () => setSolo(prev => ({ ...prev, status: 'off' })),
    });
  };

  // 1s tick so the interpolated Soloist position visibly advances.
  useEffect(() => {
    if (solo.status !== 'connected' || solo.playStatus !== 'playing') return undefined;
    const timer = setInterval(() => setSoloTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [solo.status, solo.playStatus]);

  /* ---------- related music (right sidebar) ---------- */

  useEffect(() => {
    const track = engine.track;
    setRelated([]);
    setRelatedStations([]);
    if (!track) return undefined;
    let active = true;
    if (track.live) {
      const tag = (track.artist || '').split('·')[0].split(',')[0].trim();
      if (tag) searchRadio(tag).then(list => { if (active) setRelatedStations(list.filter(item => item.id !== track.id).slice(0, 6)); }).catch(() => {});
    } else if (track.artist) {
      searchAudius(track.artist).then(list => { if (active) setRelated(list.filter(item => item.id !== track.id).slice(0, 8)); }).catch(() => {});
    }
    return () => { active = false; };
  }, [engine.track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- search ---------- */

  const runSearch = async event => {
    event?.preventDefault();
    const term = query.trim();
    if (!term) return;
    if (mode === 'radio') {
      setSearching(true);
      setError('');
      try {
        setResults(await searchRadio(term));
        setView('search');
      } catch (err) {
        setError(err.message || 'Radio search failed.');
        setResults([]);
      } finally {
        setSearching(false);
      }
      return;
    }
    if (source === 'library') {
      setResults(userTracks.filter(t => {
        const q = term.toLowerCase();
        return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
      }));
      setView('search');
      return;
    }
    setSearching(true);
    setError('');
    try {
      if (source === 'youtube') {
        setResults(await searchYouTubeInvidious(term));
      } else if (source === 'spotify') {
        if (!apis.spotify.trim()) throw new Error('Set up Spotify credentials in player settings first.');
        setResults(await searchSpotifyProvider(term, apis.spotify.trim(), apis.spotifyBase?.trim() || ''));
      } else {
        const jobs = [searchAudius(term)];
        if (apis.jamendo.trim()) jobs.push(searchJamendo(term, apis.jamendo.trim()));
        jobs.push(searchConfiguredServices(term));
        if (apis.spotify.trim()) jobs.push(searchSpotifyProvider(term, apis.spotify.trim(), apis.spotifyBase?.trim() || '').catch(() => []));
        jobs.push(searchYouTubeInvidious(term).catch(() => []));
        const settled = await Promise.allSettled(jobs);
        const merged = [];
        const notices = [];
        settled.forEach(job => {
          if (job.status !== 'fulfilled') { notices.push(job.reason?.message || 'Search failed'); return; }
          if (Array.isArray(job.value)) merged.push(...job.value);
          else { merged.push(...job.value.results); notices.push(...job.value.errors); }
        });
        if (!merged.length && notices.length) throw new Error(notices.join(' · '));
        if (notices.length) setError(notices.join(' · '));
        setResults(merged);
      }
      setView('search');
    } catch (err) {
      setError(err.message || 'Search failed — check your connection.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  /* ---------- likes & library ---------- */

  const toggleLikeTrack = track =>
    setLikes(prev => ({
      ...prev,
      tracks: prev.tracks.some(item => item.id === track.id)
        ? prev.tracks.filter(item => item.id !== track.id)
        : [track, ...prev.tracks],
    }));

  const toggleLikeStation = station =>
    setLikes(prev => ({
      ...prev,
      stations: prev.stations.some(item => item.id === station.id)
        ? prev.stations.filter(item => item.id !== station.id)
        : [station, ...prev.stations],
    }));

  const isLikedTrack = id => likes.tracks.some(track => track.id === id);
  const isLikedStation = id => likes.stations.some(station => station.id === id);

  const addFile = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const valid = files.filter(isSupportedAudioFile);
    if (!valid.length) { setError('Unsupported format — use MP3, MP4, WAV, or FLAC files.'); return; }
    const newTracks = [];
    for (const file of valid) {
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const url = URL.createObjectURL(file);
      let title = file.name.replace(/\.[^/.]+$/, '');
      let artist = 'Local file';
      let artwork = null;
      // Extract metadata + album cover from the audio file.
      try {
        const meta = await parseBlob(file);
        if (meta.common?.title) title = meta.common.title;
        if (meta.common?.artist) artist = meta.common.artist;
        const pic = meta.common?.picture?.[0];
        if (pic) {
          const picBlob = new Blob([pic.data], { type: pic.format });
          artwork = URL.createObjectURL(picBlob);
          await saveLocalPicture(id, picBlob);
        }
      } catch { /* metadata extraction optional */ }
      const track = { id, title, artist, artwork, url, local: true };
      await saveLocalAudioBlob(id, file);
      newTracks.push(track);
    }
    setUserTracks(prev => [...newTracks, ...prev]);
    play(newTracks[0], newTracks);
  };

  const addUrl = () => {
    const input = window.prompt('Paste a direct audio URL (mp3, mp4, wav, flac, ogg):');
    const url = input?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    const track = {
      id: `url-${Date.now()}`,
      title: decodeURIComponent(url.split('/').filter(Boolean).pop() || 'Remote track'),
      artist: (() => { try { return new URL(url).hostname; } catch { return 'Remote'; } })(),
      url,
    };
    setUserTracks(prev => [track, ...prev]);
    play(track, [track]);
  };

  const saveSettings = next => {
    setApis(next);
    saveMusicApis(next);
    setSettingsOpen(false);
  };

  /* ---------- download to local library ---------- */

  const downloadTrack = async track => {
    if (downloading.has(track.id)) return;
    setDownloading(prev => new Set(prev).add(track.id));
    try {
      const audioUrl = track.url || track.preview;
      if (!audioUrl) throw new Error('No audio stream available');
      const blob = await fetchAudioBlob(audioUrl);
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let artwork = track.artwork || null;
      // Try extracting embedded album art from the downloaded file.
      try {
        const meta = await parseBlob(blob);
        const pic = meta.common?.picture?.[0];
        if (pic) {
          const picBlob = new Blob([pic.data], { type: pic.format });
          artwork = URL.createObjectURL(picBlob);
          await saveLocalPicture(id, picBlob);
        }
      } catch { /* metadata extraction optional */ }
      await saveLocalAudioBlob(id, blob);
      const newTrack = { id, title: track.title, artist: track.artist, artwork, url: URL.createObjectURL(blob), local: true };
      setUserTracks(prev => [newTrack, ...prev]);
      play(newTrack, [newTrack]);
    } catch (err) {
      setError(`Download failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDownloading(prev => { const n = new Set(prev); n.delete(track.id); return n; });
    }
  };

  const resultsList = results;

  /* ---------- render ---------- */

  return (
    <div className={`relative flex min-w-0 flex-col bg-[#121216] text-white ${windowed ? 'h-full' : 'h-[calc(100dvh-57px)] md:h-dvh'}`}>
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <button className={`icon-btn h-8 w-8 ${leftOpen ? 'acc-text' : ''}`} title="Toggle library sidebar" onClick={() => setLeftOpen(value => !value)}>
          <Icon name="Library" size={16} />
        </button>
        <button className={`icon-btn h-8 w-8 ${rightOpen ? 'acc-text' : ''}`} title="Toggle now-playing sidebar" onClick={() => setRightOpen(value => !value)}>
          {rightOpen ? <Icon name="PanelRightClose" size={16} /> : <Icon name="PanelRightOpen" size={16} />}
        </button>
        <div className="ml-1 flex items-center gap-1">
          {['songs', 'radio'].map(item => (
            <button
              key={item}
              className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${mode === item ? 'acc-soft acc-text' : 'text-white/50 hover:bg-white/[0.07]'}`}
              onClick={() => { setMode(item); setResults([]); }}
            >
              {item}
            </button>
          ))}
        </div>
        {mode === 'songs' && (
          <div className="flex items-center gap-1">
            {[{ id: 'all', label: 'All' }, { id: 'youtube', label: 'YouTube' }, { id: 'spotify', label: 'Spotify' }, { id: 'library', label: 'Library' }].map(s => (
              <button
                key={s.id}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${source === s.id ? 'bg-cyan-500/15 text-cyan-300' : 'text-white/40 hover:bg-white/[0.07]'}`}
                onClick={() => { setSource(s.id); setResults([]); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <form className="relative mx-auto w-full max-w-xl" onSubmit={runSearch}>
          <Icon name="Search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            className="text-input rounded-full py-2.5 pl-10 pr-24"
            placeholder={mode === 'radio' ? 'Search 45k+ live stations…' : source === 'youtube' ? 'Search YouTube Music…' : source === 'spotify' ? 'Search Spotify…' : source === 'library' ? 'Filter your library…' : 'What do you want to play?'}
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search music"
          />
          <button className="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-4 py-1.5 text-xs" disabled={searching || !query.trim()}>
            {searching ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </form>
        <button className={`icon-btn h-8 w-8 ${settingsOpen ? 'acc-text' : ''}`} title="Player settings & service APIs" onClick={() => setSettingsOpen(value => !value)}>
          <Icon name="Settings2" size={16} />
        </button>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </header>

      {/* Three panes */}
      <div className="flex min-h-0 flex-1">
        {/* Library sidebar */}
        {leftOpen && (
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
        )}

        {/* Main pane */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

          {view === 'liked-songs' && (
            <TrackList
              title={`Liked Songs · ${likes.tracks.length}`}
              tracks={likes.tracks}
              currentId={currentId}
              playing={engine.playing}
              onPlay={track => play(track, likes.tracks)}
              onLike={toggleLikeTrack}
              isLiked={isLikedTrack}
              empty="Nothing liked yet — search and heart some tracks."
            />
          )}
          {view === 'liked-stations' && (
            <TrackList
              title={`Liked Stations · ${likes.stations.length}`}
              tracks={likes.stations}
              currentId={currentId}
              playing={engine.playing}
              onPlay={track => play(track, likes.stations)}
              onLike={toggleLikeStation}
              isLiked={isLikedStation}
              empty="No saved stations yet — tune the radio and heart what you love."
            />
          )}
          {view === 'uploads' && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold">Uploads · {userTracks.length}</h2>
                <label className="btn-primary ml-auto cursor-pointer px-3 py-1.5 text-xs">
                  <Icon name="Upload" size={13} /> Add local audio
                  <input type="file" accept=".mp3,.mp4,.m4a,.wav,.flac,.ogg,.aac,.opus,.webm,audio/*" multiple className="hidden" onChange={addFile} />
                </label>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={addUrl}><Icon name="Link2" size={13} /> Add from URL</button>
              </div>
              <TrackList
                title=""
                tracks={userTracks}
                currentId={currentId}
                playing={engine.playing}
                onPlay={track => play(track, userTracks)}
                hideLike
                empty="Add your own files or direct URLs — they play through the same engine."
              />
            </>
          )}
          {view === 'search' && (
            <>
              {searching && <p className="text-xs text-white/40">Searching…</p>}
              {!searching && resultsList.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-white/30">
                  <Icon name="Music" size={44} strokeWidth={1} />
                  <p className="text-sm">{mode === 'radio' ? 'Search live radio by name or tag.' : source === 'youtube' ? 'Search YouTube for full-length songs and download them.' : source === 'spotify' ? 'Search Spotify (set credentials in settings).' : 'Search songs across all sources — Audius, Jamendo, Spotify, YouTube.'}</p>
                </div>
              )}
              {resultsList.length > 0 && (
                <TrackList
                  title={mode === 'radio' ? `Stations · ${resultsList.length}` : `Results · ${resultsList.length}`}
                  tracks={resultsList}
                  currentId={currentId}
                  playing={engine.playing}
                  onPlay={track => play(track, resultsList)}
                  onLike={mode === 'radio' ? toggleLikeStation : toggleLikeTrack}
                  isLiked={mode === 'radio' ? isLikedStation : isLikedTrack}
                  onDownload={downloadTrack}
                  downloading={downloading}
                />
              )}
            </>
          )}
        </main>

        {/* Now playing sidebar */}
        {rightOpen && (
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
                  <p className="mb-2 text-[11px] leading-relaxed text-amber-300">Connected — waiting for the daemon’s Spotify Connect login.</p>
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
        )}
      </div>

      {/* Static bottom player bar */}
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

      {/* Settings overlay */}
      {settingsOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-end bg-black/50 p-4" onClick={() => setSettingsOpen(false)}>
          <div className="mt-2 flex max-h-full w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-white/10 bg-[#1b1b21] p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center gap-2 text-sm font-bold"><Icon name="Settings2" size={15} className="acc-text" /> Player settings</div>
            {[
              { key: 'leftOpen', label: 'Library sidebar open by default' },
              { key: 'rightOpen', label: 'Now-playing sidebar open by default' },
              { key: 'autoplayRelated', label: 'Autoplay related music when the queue ends' },
            ].map(option => (
              <label key={option.key} className="flex items-center justify-between gap-2 text-xs text-white/75">
                {option.label}
                <input type="checkbox" checked={Boolean(prefs[option.key])} onChange={event => setPrefs(prev => ({ ...prev, [option.key]: event.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
              </label>
            ))}
            <div className="pt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">Service APIs (your own keys)</div>
            <ApiField label="Spotify Client ID:Client Secret (web search)" hint="Auto-exchanges a Bearer token (client-credentials); a raw token works too" value={apis.spotify} onChange={value => setApis(prev => ({ ...prev, spotify: value }))} />
            <div className="-mt-1 flex items-center gap-2">
              <button
                className="btn-ghost px-3 py-1 text-[10px]"
                onClick={async () => {
                  setSpotifyTest('Testing…');
                  const result = await testSpotify(apis.spotify, apis.spotifyBase?.trim() || '');
                  setSpotifyTest(result.message);
                }}
              >
                Test connection
              </button>
              {spotifyTest && (
                <span className={`text-[10px] ${spotifyTest.startsWith('Connected') ? 'text-emerald-300' : 'text-red-300'}`}>{spotifyTest}</span>
              )}
            </div>
            <ApiField label="Spotify base URL (optional)" hint="Only for proxy/third-party keys, e.g. https://my-spotify-proxy.example.com — leave empty for official credentials" value={apis.spotifyBase || ''} onChange={value => setApis(prev => ({ ...prev, spotifyBase: value }))} />
            <ApiField label="Soloist WebSocket URL (full playback)" hint="On your Linux device run: soloist --api-key spak_… --ws 127.0.0.1:9090 — the spak_ key goes to the daemon, this field is only the WS address" value={apis.soloistUrl || ''} onChange={value => setApis(prev => ({ ...prev, soloistUrl: value }))} />
            <div className="-mt-1 flex items-center gap-2">
              <button
                className="btn-ghost px-3 py-1 text-[10px]"
                onClick={solo.status === 'connected' || solo.status === 'connecting' ? disconnectSoloist : connectSoloistDevice}
              >
                {solo.status === 'connected' || solo.status === 'connecting' ? 'Disconnect' : 'Connect Soloist'}
              </button>
              <span className={`text-[10px] ${solo.status === 'connected' ? 'text-emerald-300' : solo.error ? 'text-red-300' : 'text-white/40'}`}>
                {solo.status === 'connected'
                  ? (solo.auth?.logged_in ? `Logged in · ${solo.auth.device_name || 'device'}` : 'Connected · not logged in')
                  : solo.error || solo.status}
              </span>
            </div>
            <ApiField label="Apple Music developer token" hint="MusicKit JWT → catalog search + previews" value={apis.apple} onChange={value => setApis(prev => ({ ...prev, apple: value }))} />
            <ApiField label="YouTube Data API key" hint="Search metadata; plays via Browser window" value={apis.youtube} onChange={value => setApis(prev => ({ ...prev, youtube: value }))} />
            <ApiField label="SoundCloud client_id" hint="api-v2 search + full streams" value={apis.soundcloud} onChange={value => setApis(prev => ({ ...prev, soundcloud: value }))} />
            <ApiField label="Jamendo client_id" hint="Free CC catalog, full streams" value={apis.jamendo} onChange={value => setApis(prev => ({ ...prev, jamendo: value }))} />
            <p className="text-[10px] leading-relaxed text-white/35">
              Keys are stored only in this browser and sent straight to each service. Spotify/Apple return 30-second
              previews; SoundCloud and Jamendo stream full tracks; YouTube results open in the Lithium Browser.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSettingsOpen(false)}><Icon name="X" size={13} /> Cancel</button>
              <button className="btn-primary px-4 py-1.5 text-xs" onClick={() => saveSettings(apis)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- shared track list ---------- */

function TrackList({ title, tracks, currentId, playing, onPlay, onLike, isLiked, hideLike = false, onDownload, downloading, empty }) {
  if (!tracks.length) return <p className="px-2 py-6 text-center text-xs text-white/30">{empty}</p>;
  return (
    <div>
      {title && <h2 className="mb-2 text-lg font-bold">{title}</h2>}
      <div className="overflow-hidden rounded-xl border border-white/[0.05]">
        {tracks.map((track, index) => {
          const active = track.id === currentId;
          return (
            <div
              key={track.id}
              className={`group flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${active ? 'acc-soft' : index % 2 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.05]`}
              onClick={() => onPlay(track)}
            >
              <span className="w-5 text-right font-mono text-[10px] text-white/30">{active && playing ? <Icon name="Pause" size={12} className="acc-text inline" /> : index + 1}</span>
              {track.artwork ? <img src={track.artwork} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/[0.06]">{track.live ? <Icon name="Radio" size={14} className="text-white/40" /> : <Icon name="Music" size={14} className="text-white/40" />}</span>}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-medium ${active ? 'acc-text' : 'text-white/85'}`}>{track.title}</p>
                <p className="truncate text-[10px] text-white/40">{track.artist}</p>
              </div>
              {track.service && <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50">{track.service}</span>}
              {track.preview && <span className="rounded acc-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide acc-text">30s</span>}
              {track.live && <span className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300"><span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Live</span>}
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
                  className={`icon-btn h-7 w-7 ${downloading?.has(track.id) ? 'acc-text' : 'opacity-0 group-hover:opacity-100'}`}
                  title={downloading?.has(track.id) ? 'Downloading…' : 'Download to library'}
                  disabled={downloading?.has(track.id)}
                  onClick={event => { event.stopPropagation(); onDownload(track); }}
                >
                  <Icon name={downloading?.has(track.id) ? 'Loader2' : 'Download'} size={13} className={downloading?.has(track.id) ? 'animate-spin' : ''} />
                </button>
              )}
              {!hideLike && onLike && (
                <button
                  className={`icon-btn h-7 w-7 ${isLiked?.(track.id) ? 'text-red-400' : 'opacity-0 group-hover:opacity-100'}`}
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
}

function ApiField({ label, hint, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-white/70">{label}</span>
      <input className="text-input py-1.5 font-mono text-[11px]" type="password" value={value} onChange={event => onChange(event.target.value)} placeholder="paste key / token" />
      <span className="mt-0.5 block text-[10px] text-white/30">{hint}</span>
    </label>
  );
}
