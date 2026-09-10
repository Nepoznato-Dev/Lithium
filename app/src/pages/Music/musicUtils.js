export function openInLithiumBrowser(url) {
  window.dispatchEvent(new CustomEvent('lithium:open-browser', { detail: url }));
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const DEFAULT_PLAYER_SETTINGS = { leftOpen: true, rightOpen: true, autoplayRelated: true };
