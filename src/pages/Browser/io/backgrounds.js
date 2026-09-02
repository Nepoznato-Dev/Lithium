/**
 * Background image rotation — manages auto-rotation timer, preloading,
 * and crossfade transitions for the new tab page.
 */
import { currentBgIndex, bgPaused, rotationInterval, nextBackground, backgrounds } from '../stores/newTabStore';

let rotationTimer = null;

/** Start the background auto-rotation timer. */
export function startRotation() {
  stopRotation();
  const interval = rotationInterval.value;
  if (interval <= 0 || bgPaused.value) return;
  rotationTimer = setInterval(() => {
    if (!bgPaused.value) nextBackground();
  }, interval * 1000);
}

/** Stop the rotation timer. */
export function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

/** Preload an image by URL. Returns a promise that resolves when loaded. */
export function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
}

/** Preload the next background in the queue. */
export function preloadNextBackground() {
  const bgs = backgrounds.value;
  const nextIdx = (currentBgIndex.value + 1) % bgs.length;
  return preloadImage(bgs[nextIdx].src).catch(() => {});
}

/** Clean up rotation timer on unmount. */
export function cleanupRotation() {
  stopRotation();
}
