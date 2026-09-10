/* ================================================================
 *  Audius — keyless decentralized music streaming.
 * ================================================================ */

let _audiusHost = null;

/** Discover a healthy Audius host (cached for the session). */
export function audiusHost() {
  if (!_audiusHost) {
    _audiusHost = fetch('https://api.audius.co')
      .then(response => response.json())
      .then(data => String(data.data?.[0] || '').replace(/\/+$/, ''))
      .catch(() => null);
  }
  return _audiusHost;
}

/** Search tracks; results stream full-length via /stream (redirects to audio). */
export async function searchAudius(query) {
  const host = await audiusHost();
  if (!host) throw new Error('Audius network unreachable');
  const response = await fetch(`${host}/v1/tracks/search?app_name=Lithium&query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Audius search failed (${response.status})`);
  const data = await response.json();
  return (data.data || []).map(track => ({
    id: `audius-${track.id}`,
    title: track.title || 'Unknown title',
    artist: track.user?.name || 'Unknown artist',
    artwork: track.artwork?.['480x480'] || track.artwork?.['150x150'] || null,
    duration: track.duration || 0,
    url: `${host}/v1/tracks/${track.id}/stream?app_name=Lithium`,
    full: true,
  }));
}

/* ================================================================
 *  Radio Browser + Jamendo — extra keyless / light-auth sources.
 * ================================================================ */

/** Search live radio stations by name or tag. */
export async function searchRadio(term) {
  const params = new URLSearchParams({
    name: term,
    limit: '24',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  });
  const hosts = ['https://all.api.radio-browser.info', 'https://api.radio-browser.info', 'https://de1.api.radio-browser.info'];
  let data = null;
  let lastError = null;
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/json/stations/search?${params}`);
      if (!response.ok) throw new Error(`Radio Browser failed (${response.status})`);
      data = await response.json();
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!data) throw lastError || new Error('Radio Browser unreachable');
  return (Array.isArray(data) ? data : [])
    .filter(station => station.url_resolved)
    .map(station => ({
      id: `radio-${station.stationuuid || station.name}`,
      title: station.name?.trim() || 'Unknown station',
      artist: `${station.tags?.split(',').slice(0, 3).join(', ') || 'live radio'}${station.bitrate ? ` · ${station.bitrate}kbps` : ''}`,
      artwork: station.favicon || null,
      url: station.url_resolved,
      live: true,
    }));
}

/** Search Jamendo's CC catalog (requires a free client_id). */
export async function searchJamendo(term, clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: '24',
    search: term,
    streamable: 'yes',
    audioformat: 'mp32',
  });
  const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`);
  if (!response.ok) throw new Error(`Jamendo failed (${response.status})`);
  const data = await response.json();
  return (data.results || []).map(track => ({
    id: `jam-${track.id}`,
    title: track.name || 'Untitled',
    artist: track.artist_name || 'Unknown artist',
    artwork: track.image || null,
    duration: track.duration || 0,
    url: track.audio,
    full: true,
  }));
}

/* ================================================================
 *  Soloist — Spotify local WebSocket client for full playback control.
 * ================================================================ */

function _entityInfo(item) {
  if (!item || !item.uri) return { uri: '', name: 'Unknown', artist: '', album: '', cover: null, durationMs: 0 };
  const decor = item.decorations;
  if (!decor) return { uri: item.uri || '', name: 'Unknown', artist: '', album: '', cover: null, durationMs: 0 };
  const name = decor.identity?.name || 'Unknown';
  let artist = '';
  if (Array.isArray(decor.creators)) {
    artist = decor.creators.map(c => c?.entity?.decorations?.identity?.name).filter(Boolean).join(', ');
  }
  const album = decor.parent?.entity?.decorations?.identity?.name || '';
  const cover = decor.visual_identity?.cover?.[0]?.url || null;
  const durationMs = decor.playback?.duration_ms || 0;
  return { uri: item.uri, name, artist, album, cover, durationMs };
}

function _position(anchor, status) {
  if (!anchor) return 0;
  const posMs = anchor.position_ms || 0;
  const tsMs = anchor.timestamp_ms || 0;
  const speed = anchor.speed || 0;
  if (status !== 'playing' || speed === 0) return posMs / 1000;
  return (posMs + (Date.now() - tsMs) * speed) / 1000;
}

export function connectSoloist(url, hooks = {}) {
  let ws = null;
  let closed = false;

  const send = obj => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'command', ...obj }));
  };

  const controller = {
    play: uri => send(uri ? { command: 'play', uri } : { command: 'play' }),
    pause: () => send({ command: 'pause' }),
    skipNext: () => send({ command: 'skip_next' }),
    skipPrev: () => send({ command: 'skip_prev' }),
    seek: ms => send({ command: 'seek', position_ms: Math.round(ms) }),
    setVolume: volume => send({ command: 'set_volume', volume: Math.round(volume) }),
    addToQueue: uri => send({ command: 'add_to_queue', uri }),
    getState: () => send({ command: 'get_state' }),
    getAuth: () => send({ command: 'get_auth_state' }),
    close: () => {
      closed = true;
      try { ws?.close(); } catch { /* already closed */ }
    },
  };

  try {
    ws = new WebSocket(url);
  } catch (err) {
    hooks.onError?.(`Invalid WebSocket URL (${err.message})`);
    return controller;
  }

  ws.onopen = () => hooks.onOpen?.();
  ws.onclose = () => { if (!closed) hooks.onClose?.(); };
  ws.onerror = () => hooks.onError?.('WebSocket connection failed — is Soloist running with --ws?');
  ws.onmessage = event => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    switch (msg.type) {
      case 'auth_state': hooks.onAuth?.(msg); break;
      case 'playback_state': hooks.onPlayback?.(msg); break;
      case 'track_changed': hooks.onTrack?.(msg.item); break;
      case 'playback_changed': hooks.onStatus?.(msg.status); break;
      case 'volume_changed': hooks.onVolume?.(msg.volume); break;
      case 'position_sync': hooks.onPosition?.(msg.position); break;
      case 'queue_changed': hooks.onQueue?.(msg); break;
      case 'error': hooks.onError?.(msg.message); break;
      default: break;
    }
  };
  return controller;
}

/** Interpolate the playback position (seconds) from a position_sync anchor. */
export function soloistPosition(anchor, status) {
  if (!anchor) return 0;
  return _position(anchor, status) || 0;
}

/** Pull display info out of a Soloist entity envelope. */
export function soloistEntityInfo(item) {
  if (!item) return null;
  return _entityInfo(item) || null;
}

/* ================================================================
 *  Local audio — format detection + IndexedDB blob persistence.
 * ================================================================ */

import { idbGet } from './storage/indexedDB';
import { putBlob, deleteBlob } from './storage/liStorage';

export const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'flac', 'ogg', 'aac', 'opus', 'webm'];

/** Check whether a File looks like a supported audio format (by extension). */
export function isSupportedAudioFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext);
}

const AUDIO_BLOB_PREFIX = 'local-audio:';

/** Persist a local audio Blob in IndexedDB so it survives page reloads. */
export function saveLocalAudioBlob(id, blob) {
  return putBlob('audio', AUDIO_BLOB_PREFIX + id, blob);
}

/** Retrieve a previously stored audio Blob from IndexedDB. */
export function getLocalAudioBlob(id) {
  return idbGet('blobs', AUDIO_BLOB_PREFIX + id).then(r => {
    if (!r) return null;
    return r.data !== undefined ? r.data : r;
  });
}

/** Remove a stored audio Blob from IndexedDB. */
export function deleteLocalAudioBlob(id) {
  return deleteBlob('audio', AUDIO_BLOB_PREFIX + id);
}

const PICTURE_PREFIX = 'local-picture:';

/** Persist an extracted album-art blob in IndexedDB. */
export function saveLocalPicture(id, blob) {
  return putBlob('picture', PICTURE_PREFIX + id, blob);
}

/** Retrieve a stored album-art blob from IndexedDB. */
export function getLocalPicture(id) {
  return idbGet('blobs', PICTURE_PREFIX + id).then(r => {
    if (!r) return null;
    return r.data !== undefined ? r.data : r;
  });
}

/* ================================================================
 *  Audio engine — global <audio> element with queue & auto-advance.
 * ================================================================ */

let audio = null;
let queue = [];
let queueIndex = -1;

const state = { track: null, playing: false, progress: 0, duration: 0, volume: 0.8 };
const listeners = new Set();
const endedListeners = new Set();
const errorListeners = new Set();

const emit = () => listeners.forEach(fn => fn(getState()));

export function onEnded(fn) {
  endedListeners.add(fn);
  return () => endedListeners.delete(fn);
}

export function onError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

export function getState() {
  return { ...state, queueIndex, queueLength: queue.length };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.addEventListener('play', () => { state.playing = true; emit(); });
  audio.addEventListener('pause', () => { state.playing = false; emit(); });
  audio.addEventListener('ended', () => {
    if (queue.length && queueIndex < queue.length - 1) {
      queueIndex += 1;
      startTrack(queue[queueIndex]);
    } else {
      state.playing = false;
      emit();
      endedListeners.forEach(fn => fn(getState()));
    }
  });
  // Throttle timeupdate to ~10fps instead of 60fps to prevent re-render cascade
  let _throttledTimeUpdate = null;
  audio.addEventListener('timeupdate', () => {
    state.progress = audio.currentTime || 0;
    if (!_throttledTimeUpdate) {
      _throttledTimeUpdate = requestAnimationFrame(() => {
        _throttledTimeUpdate = null;
        emit();
      });
    }
  });
  audio.addEventListener('loadedmetadata', () => { state.duration = audio.duration || 0; emit(); });
  audio.addEventListener('error', () => { state.playing = false; emit(); errorListeners.forEach(fn => fn(getState())); });
  return audio;
}

function startTrack(track) {
  const el = ensure();
  state.track = track;
  state.progress = 0;
  state.duration = 0;
  el.src = track.url;
  el.volume = state.volume;
  el.play().catch(() => { state.playing = false; emit(); });
  emit();
}

export function playTrack(track, newQueue) {
  if (Array.isArray(newQueue)) {
    queue = newQueue;
    queueIndex = Math.max(0, newQueue.findIndex(item => item.id === track.id));
  }
  startTrack(track);
}

export function togglePlay() {
  if (!audio || !state.track) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

export function stepTrack(direction) {
  if (!queue.length) return;
  queueIndex = (queueIndex + direction + queue.length) % queue.length;
  startTrack(queue[queueIndex]);
}

export function seekTo(time) {
  if (!audio) return;
  audio.currentTime = time;
  state.progress = time;
  emit();
}

export function setEngineVolume(value) {
  state.volume = value;
  if (audio) audio.volume = value;
  emit();
}
