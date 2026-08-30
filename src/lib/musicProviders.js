/* ================================================================
 *  YouTube (via Invidious) + Spotify download — REST integrations.
 *
 *  Invidious is an open-source YouTube frontend whose public API
 *  sends CORS headers and exposes progressive audio streams, so
 *  full audio playback & download works straight from the browser.
 * ================================================================ */

import { searchSpotify, spotifyBearer } from './serviceApis';

/* ---------- Invidious instance pool (CORS-enabled public hosts) ---------- */

const INVIDIOUS_HOSTS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.snopyta.org',
];

/* ================================================================
 *  YouTube Music — search & audio streaming via Invidious.
 * ================================================================ */

/** Search YouTube for music; returns playable track objects. */
export async function searchYouTubeInvidious(term) {
  const params = `search?q=${encodeURIComponent(term + ' music')}&type=video`;
  let lastError = null;

  for (const host of INVIDIOUS_HOSTS) {
    try {
      const res = await fetch(`${host}/api/v1/${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      return data
        .filter(v => v.type === 'video' && v.lengthSeconds > 0)
        .map(video => ({
          id: `yt-${video.videoId}`,
          title: video.title || 'Unknown',
          artist: video.author || 'Unknown artist',
          artwork: video.videoThumbnails?.find(t => t.quality === 'medium')?.url
            || video.videoThumbnails?.[0]?.url
            || null,
          duration: video.lengthSeconds || 0,
          url: `${host}/api/v1/stream/${video.videoId}?local=true`,
          ytVideoId: video.videoId,
          ytHost: host,
          service: 'YouTube',
          full: true,
        }));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('YouTube search unavailable');
}

/** Resolve a direct audio stream URL for a YouTube video. */
export async function getYouTubeAudioUrl(videoId, preferredHost) {
  const hosts = preferredHost
    ? [preferredHost, ...INVIDIOUS_HOSTS.filter(h => h !== preferredHost)]
    : INVIDIOUS_HOSTS;

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`);
      if (!res.ok) continue;
      const data = await res.json();

      // Prefer progressive formatStreams (simpler, no DASH).
      const progressive = data.formatStreams?.[0];
      if (progressive?.url) return progressive.url;

      // Fall back to the first adaptive audio stream.
      const audio = data.adaptiveFormats?.find(f => f.type?.startsWith('audio/'));
      if (audio?.url) return audio.url;
    } catch { /* try next host */ }
  }
  // Last resort: the search-time stream URL usually works.
  return `${hosts[0]}/api/v1/stream/${videoId}?local=true`;
}

/* ================================================================
 *  Spotify — search via existing serviceApis (30-second previews).
 * ================================================================ */

/** Search Spotify; wraps the existing credential-aware helper. */
export async function searchSpotifyProvider(term, config, baseUrl) {
  const token = config.includes(':') && !baseUrl
    ? await spotifyBearer(config)
    : config.trim();
  return searchSpotify(term, token, baseUrl);
}

/* ================================================================
 *  Audio download — fetch any track URL and persist as a local file.
 * ================================================================ */

/** Fetch audio from a URL and return a Blob. */
export async function fetchAudioBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
