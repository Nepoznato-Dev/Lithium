import { storage } from './storage/localStorage';

/**
 * Direct REST integrations for the big four services. Users paste their own
 * credentials (Settings → Service APIs); searches hit the official endpoints
 * straight from the browser (all CORS-enabled with the right credential).
 *  - Spotify    : Web API, Bearer access token → 30s previews
 *  - Apple      : MusicKit catalog API, developer JWT → 30s previews
 *  - YouTube    : Data API v3 key → metadata (plays via Browser window)
 *  - SoundCloud : api-v2 client_id → search + progressive streams
 */

const KEY = 'music-apis';

export function loadMusicApis() {
  return { spotify: '', spotifyBase: '', soloistUrl: '', apple: '', youtube: '', soundcloud: '', jamendo: '', ...storage.get(KEY, {}) };
}

export function saveMusicApis(value) {
  storage.set(KEY, value);
}

const decodeEntities = text =>
  String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Lenient mapper: accepts official Spotify shape, proxy shapes, or bare arrays. */
function normalizeTrackList(data) {
  const raw = Array.isArray(data)
    ? data
    : data?.tracks?.items || data?.tracks || data?.results || data?.data || [];
  return raw.map(item => {
    const artist = Array.isArray(item.artists)
      ? item.artists.map(a => a.name).join(', ')
      : item.artist || item.user?.username || item.artistName || 'Unknown artist';
    const artwork = item.album?.images?.[0]?.url || item.artwork || item.artworkUrl?.replace('{w}x{h}', '200x200') || item.thumbnail || null;
    const duration = item.duration_ms ? item.duration_ms / 1000 : item.duration || 0;
    return {
      id: `spy-${item.id || item.uri || item.url || item.title || item.name}`,
      title: item.name || item.title || 'Unknown',
      artist,
      artwork,
      duration,
      url: item.preview_url || item.previewUrl || item.audio || null,
      preview: Boolean(item.preview_url || item.previewUrl),
      spotifyUri: typeof item.uri === 'string' && item.uri.startsWith('spotify:') ? item.uri : null,
      service: 'Spotify',
    };
  }).filter(track => track.title !== 'Unknown' || track.url);
}

export async function searchSpotify(term, token, baseUrl) {
  const url = baseUrl
    ? `${baseUrl.replace(/\/+$/, '')}/search?type=track&limit=15&q=${encodeURIComponent(term)}`
    : `https://api.spotify.com/v1/search?type=track&limit=15&q=${encodeURIComponent(term)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'x-api-key': token },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.description || body?.error?.message || body?.message || '';
    } catch { /* non-JSON */ }
    throw new Error(`Spotify search failed (${response.status}${detail ? ` — ${detail}` : ''})`);
  }
  return normalizeTrackList(await response.json());
}
export async function searchApple(term, developerToken) {
  const response = await fetch(`https://api.music.apple.com/v1/catalog/us/search?types=songs&limit=15&term=${encodeURIComponent(term)}`, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  if (response.status === 401) throw new Error('Apple developer token rejected (401)');
  if (!response.ok) throw new Error(`Apple Music search failed (${response.status})`);
  const data = await response.json();
  return (data.results?.songs?.data || []).map(song => ({
    id: `apl-${song.id}`,
    title: song.attributes?.name || 'Unknown',
    artist: song.attributes?.artistName || 'Unknown artist',
    artwork: song.attributes?.artwork?.url?.replace('{w}x{h}', '200x200') || null,
    duration: song.attributes?.durationInMillis ? song.attributes.durationInMillis / 1000 : 0,
    url: song.attributes?.previews?.[0]?.url || null,
    preview: Boolean(song.attributes?.previews?.[0]?.url),
    service: 'Apple',
  }));
}

export async function searchYouTube(term, apiKey) {
  const response = await fetch(
    `https://youtube.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(term + ' music')}&key=${encodeURIComponent(apiKey)}`
  );
  if (response.status === 400 || response.status === 403) throw new Error('YouTube API key rejected');
  if (!response.ok) throw new Error(`YouTube search failed (${response.status})`);
  const data = await response.json();
  return (data.items || []).map(item => ({
    id: `yt-${item.id?.videoId}`,
    title: decodeEntities(item.snippet?.title),
    artist: decodeEntities(item.snippet?.channelTitle),
    artwork: item.snippet?.thumbnails?.medium?.url || null,
    openUrl: `https://music.youtube.com/watch?v=${item.id?.videoId}`,
    service: 'YouTube',
  }));
}

export async function searchSoundCloud(term, clientId) {
  const response = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(term)}&client_id=${encodeURIComponent(clientId)}&limit=15`
  );
  if (response.status === 401) throw new Error('SoundCloud client_id rejected (401)');
  if (!response.ok) throw new Error(`SoundCloud search failed (${response.status})`);
  const data = await response.json();
  return (data.collection || []).map(track => ({
    id: `sc-${track.id}`,
    title: track.title,
    artist: track.user?.username || 'Unknown artist',
    artwork: track.artwork_url || null,
    duration: track.duration ? track.duration / 1000 : 0,
    scId: track.id,
    service: 'SoundCloud',
  }));
}

/** Resolve a playable progressive stream for a SoundCloud track id. */
export async function resolveSoundCloudStream(scId, clientId) {
  try {
    const response = await fetch(
      `https://api-v2.soundcloud.com/tracks/${scId}/streams?client_id=${encodeURIComponent(clientId)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data['progressive']?.[0]?.url || data['hls']?.[0]?.url || null;
  } catch {
    return null;
  }
}

/** Accepts "clientId:clientSecret" (exchanges via client-credentials, cached)
 *  or a raw Bearer access token. */
let spotifyTokenCache = { value: '', expires: 0 };

export async function spotifyBearer(config) {
  const trimmed = (config || '').trim();
  if (!trimmed.includes(':')) return trimmed; // raw access token
  if (spotifyTokenCache.value && Date.now() < spotifyTokenCache.expires) return spotifyTokenCache.value;
  const [clientId, clientSecret] = trimmed.split(':').map(part => part.trim());
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error_description || ''; } catch { /* non-JSON */ }
    throw new Error(`Spotify token exchange failed (${response.status}${detail ? ` — ${detail}` : ''})`);
  }
  const data = await response.json();
  spotifyTokenCache = { value: data.access_token, expires: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
  return data.access_token;
}

/** Quick credential check used by the Settings "Test" button. */
export async function testSpotify(config, baseUrl) {
  try {
    const token = config.includes(':') && !baseUrl ? await spotifyBearer(config) : config;
    const results = await searchSpotify('a', token, baseUrl);
    return { ok: true, message: `Connected — ${results.length} tracks found for a test query.` };
  } catch (err) {
    return { ok: false, message: err.message || 'Connection failed.' };
  }
}

/** Run every configured service search in parallel; failures are surfaced. */
export async function searchConfiguredServices(term) {
  const apis = loadMusicApis();
  const jobs = [];
  if (apis.spotify.trim()) jobs.push(['Spotify', (async () => {
    const token = apis.spotify.includes(':') && !apis.spotifyBase?.trim() ? await spotifyBearer(apis.spotify) : apis.spotify.trim();
    return searchSpotify(term, token, apis.spotifyBase?.trim() || '');
  })()]);
  if (apis.apple.trim()) jobs.push(['Apple', searchApple(term, apis.apple.trim())]);
  if (apis.youtube.trim()) jobs.push(['YouTube', searchYouTube(term, apis.youtube.trim())]);
  if (apis.soundcloud.trim()) jobs.push(['SoundCloud', searchSoundCloud(term, apis.soundcloud.trim())]);
  if (!jobs.length) return { results: [], errors: [] };
  const settled = await Promise.allSettled(jobs.map(([, promise]) => promise));
  const results = [];
  const errors = [];
  settled.forEach((job, index) => {
    if (job.status === 'fulfilled') results.push(...job.value);
    else errors.push(`${jobs[index][0]}: ${job.reason?.message || 'request failed'}`);
  });
  return { results, errors };
}
