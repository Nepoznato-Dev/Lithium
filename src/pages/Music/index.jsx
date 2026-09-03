import React, { useEffect, useRef, useState } from 'react';

import { storage } from '../../lib/storage/localStorage';
import { searchAudius, searchJamendo, searchRadio, connectSoloist, soloistEntityInfo, getState, onEnded, onError, playTrack, subscribe, togglePlay, isSupportedAudioFile, saveLocalAudioBlob, getLocalAudioBlob, saveLocalPicture, getLocalPicture } from '../../lib/music';
import { loadMusicApis, resolveSoundCloudStream, saveMusicApis, searchConfiguredServices, testSpotify } from '../../lib/serviceApis';
import { parseBlob } from 'music-metadata-browser';
import { searchYouTubeInvidious, searchSpotifyProvider, fetchAudioBlob } from '../../lib/musicProviders';
import Icon from '../../Components/Icon';
import WinControls from '../../Components/Desktop/WinControls';

import { openInLithiumBrowser, DEFAULT_PLAYER_SETTINGS } from './musicUtils';
import TrackList from './TrackList';
import MusicLibrary from './MusicLibrary';
import MusicNowPlaying from './MusicNowPlaying';
import MusicPlayer from './MusicPlayer';
import MusicSettings from './MusicSettings';

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
        <MusicLibrary
          leftOpen={leftOpen} likes={likes} userTracks={userTracks}
          currentId={currentId} view={view} play={play} setView={setView}
        />

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

        <MusicNowPlaying
          rightOpen={rightOpen} engine={engine} solo={solo} soloCtl={soloCtl}
          related={related} relatedStations={relatedStations}
          currentLiked={currentLiked} isLikedStation={isLikedStation}
          toggleLikeTrack={toggleLikeTrack} toggleLikeStation={toggleLikeStation}
          play={play} disconnectSoloist={disconnectSoloist}
        />
      </div>

      <MusicPlayer engine={engine} currentLiked={currentLiked} toggleLikeTrack={toggleLikeTrack} />

      {settingsOpen && (
        <MusicSettings
          apis={apis} prefs={prefs} solo={solo} spotifyTest={spotifyTest}
          setApis={setApis} setPrefs={setPrefs} setSettingsOpen={setSettingsOpen} setSpotifyTest={setSpotifyTest}
          testSpotify={testSpotify} disconnectSoloist={disconnectSoloist} connectSoloistDevice={connectSoloistDevice}
          saveSettings={saveSettings}
        />
      )}
    </div>
  );
}
