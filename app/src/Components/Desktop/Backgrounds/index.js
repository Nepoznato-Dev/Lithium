import FirefliesBackground from './FirefliesBackground';
import CyberGridBackground from './CyberGridBackground';
import RetroSynthwaveBackground from './RetroSynthwaveBackground';
import WatchDogsBackground from './WatchDogsBackground';

/**
 * Animated wallpaper registry.
 *
 * Each entry maps an id to its React component, display label, and a CSS
 * preview style used as the thumbnail in Settings → Background → Animated.
 *
 * The `component` receives `{ lowEndMode }` as props.
 */
export const ANIMATED_WALLPAPERS = {
  'anim-fireflies': {
    label: 'Fireflies',
    component: FirefliesBackground,
    preview: {
      backgroundColor: '#07070c',
      backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(255, 200, 50, 0.25) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(255, 150, 30, 0.2) 0%, transparent 35%), radial-gradient(circle at 50% 80%, rgba(255, 180, 40, 0.15) 0%, transparent 30%)',
    },
  },
  'anim-cyber-grid': {
    label: 'Cyber Grid',
    component: CyberGridBackground,
    preview: {
      backgroundColor: '#050510',
      backgroundImage: 'linear-gradient(rgba(0, 255, 136, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136, 0.15) 1px, transparent 1px), radial-gradient(ellipse at 50% 45%, rgba(0, 255, 136, 0.2) 0%, transparent 60%)',
      backgroundSize: '20px 20px, 20px 20px, 100% 100%',
    },
  },
  'anim-retro-synthwave': {
    label: 'Retro Synthwave',
    component: RetroSynthwaveBackground,
    preview: {
      backgroundColor: '#0a001a',
      backgroundImage: 'linear-gradient(180deg, #0a001a 0%, #1a0033 30%, #330044 55%, #ff6b9d 80%, #1a0033 100%)',
    },
  },
  'anim-watch-dogs': {
    label: 'Digital Rain',
    component: WatchDogsBackground,
    preview: {
      backgroundColor: '#09090b',
      backgroundImage: 'linear-gradient(180deg, rgba(0, 255, 136, 0.08) 0%, transparent 30%, rgba(0, 255, 136, 0.05) 60%, transparent 100%), radial-gradient(circle at 50% 50%, rgba(0, 255, 136, 0.1) 0%, transparent 60%)',
    },
  },
};

export function getAnimatedWallpapers() {
  return Object.entries(ANIMATED_WALLPAPERS)
    .map(([id, wp]) => ({ id, ...wp }));
}

export function isAnimatedWallpaper(id) {
  return id in ANIMATED_WALLPAPERS;
}

export function getAnimatedComponent(id) {
  return ANIMATED_WALLPAPERS[id]?.component ?? null;
}
