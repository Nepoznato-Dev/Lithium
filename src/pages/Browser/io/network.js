/**
 * Browser network layer — wraps fetchSearchHtml, proxy URL construction,
 * and backend health checking. Keeps all fetch logic out of components.
 */
import { getBackendUrl } from '../../../lib/searchProxy';
import { rebuildPage } from '../../../lib/pageRebuilder';
import { fullRender } from '../../../lib/fullRenderer';
import { renderSearchResults } from '../../../lib/searchResultsRenderer';
import * as core from '../../../lib/core';

/** Check if the backend proxy is reachable.
 *  Any HTTP response (even 5xx) means the backend process is running.
 *  Only a network-level failure (catch) means the backend is down. */
export async function checkBackendHealth() {
  const base = getBackendUrl();
  // Try the lightweight health endpoint first
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) });
    return true; // any response = backend is running
  } catch { /* health endpoint unreachable — try proxy endpoint */ }
  // Fallback: try the proxy endpoint (older backends may not have /api/health)
  try {
    const res = await fetch(
      `${base}/api/web/proxy?url=${encodeURIComponent('https://example.com')}`,
      { signal: AbortSignal.timeout(4000) }
    );
    return true; // any response = backend is running
  } catch {
    return false; // network error = backend is truly down
  }
}

/**
 * Extract YouTube video ID from various URL formats.
 * Returns null if not a YouTube video URL.
 */
function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // youtube.com/watch?v=VIDEO_ID
    if (hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    
    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.slice(1);
      if (videoId && videoId.length >= 11) return videoId;
    }
    
    // youtube.com/embed/VIDEO_ID
    if (hostname.includes('youtube.com') && parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0]?.split('?')[0];
    }
    
    // youtube.com/v/VIDEO_ID
    if (hostname.includes('youtube.com') && parsed.pathname.startsWith('/v/')) {
      return parsed.pathname.split('/v/')[1]?.split('/')[0]?.split('?')[0];
    }
    
    // youtube.com/shorts/VIDEO_ID
    if (hostname.includes('youtube.com') && parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0];
    }
  } catch {}
  return null;
}

/**
 * Check if a URL is a YouTube video URL and convert to embed format.
 * Returns the embed URL if it's a YouTube video, otherwise null.
 * Uses youtube-nocookie.com (privacy-enhanced mode) to avoid Error 153.
 */
export function toYouTubeEmbedUrl(url) {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  }
  return null;
}

/** Build a proxy URL for an iframe src. */
export function buildProxyUrl(url, proxyOrigin, backendUp) {
  // Check if it's a YouTube video URL - convert to embed and load directly
  const youtubeEmbed = toYouTubeEmbedUrl(url);
  if (youtubeEmbed) {
    return youtubeEmbed; // Load YouTube embed directly (no proxy)
  }
  
  // Try Rust first
  const rustResult = core.browserToProxyUrlSync(
    url,
    proxyOrigin || '',
    backendUp ? getBackendUrl() : ''
  );
  if (rustResult) return rustResult;
  // JS fallback
  if (proxyOrigin) return `${proxyOrigin}/api/web/proxy?url=${encodeURIComponent(url)}`;
  if (backendUp) return `${getBackendUrl()}/api/web/proxy?url=${encodeURIComponent(url)}`;
  return url;
}

/** Fetch search results as sanitized raw HTML via the scraping proxy. */
export async function renderSearch(query, providerKey = 'brave') {
  return renderSearchResults(query, providerKey);
}

/** Rebuild a page using Readability. */
export async function rebuildPageContent(url) {
  return rebuildPage(url);
}

/** Full render: fetch and rewrite URLs for srcdoc iframe. */
export async function fullRenderPage(url) {
  return fullRender(url);
}

/** Get the backend base URL. */
export function getBackend() {
  return getBackendUrl();
}
