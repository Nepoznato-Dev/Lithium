import { useLayoutEffect } from 'react';
import { scheduleStorageSave } from '../../../lib/storage/localStorage';
import { getAnimatedWallpapers } from '../Backgrounds';

/* ---------- Gradient Wallpapers ---------- */

export const WALLPAPERS = {
  'lithium-default': {
    label: 'Lithium Default',
    category: 'gradients',
    style: {
      backgroundColor: '#07070c',
      backgroundImage: `
        radial-gradient(circle at 20% 30%, rgba(34, 211, 238, 0.10) 0%, transparent 50%),
        radial-gradient(circle at 80% 70%, rgba(249, 115, 22, 0.06) 0%, transparent 50%),
        radial-gradient(circle at 50% 45%, rgba(244, 114, 182, 0.05) 0%, transparent 55%)
      `,
    },
  },
  'midnight-ocean': {
    label: 'Midnight Ocean',
    category: 'gradients',
    style: {
      backgroundColor: '#020817',
      backgroundImage: `
        radial-gradient(ellipse at 30% 80%, rgba(14, 116, 144, 0.4) 0%, transparent 55%),
        radial-gradient(ellipse at 70% 20%, rgba(30, 64, 175, 0.35) 0%, transparent 50%),
        linear-gradient(170deg, #020817 0%, #0c1e3a 30%, #0e3a5c 60%, #071525 100%)
      `,
    },
  },
  'nebula-drift': {
    label: 'Nebula Drift',
    category: 'gradients',
    style: {
      backgroundColor: '#0a0014',
      backgroundImage: `
        radial-gradient(ellipse at 20% 50%, rgba(168, 85, 247, 0.35) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 30%, rgba(236, 72, 153, 0.25) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 80%, rgba(59, 130, 246, 0.2) 0%, transparent 55%),
        linear-gradient(135deg, #0a0014 0%, #1a0033 40%, #0d001a 100%)
      `,
    },
  },
  'ember-glow': {
    label: 'Ember Glow',
    category: 'gradients',
    style: {
      backgroundColor: '#1a0a00',
      backgroundImage: `
        radial-gradient(ellipse at 50% 90%, rgba(234, 88, 12, 0.35) 0%, transparent 55%),
        radial-gradient(ellipse at 25% 40%, rgba(180, 40, 20, 0.25) 0%, transparent 50%),
        radial-gradient(ellipse at 75% 60%, rgba(245, 158, 11, 0.15) 0%, transparent 45%),
        linear-gradient(180deg, #1a0a00 0%, #2d1206 50%, #1a0a00 100%)
      `,
    },
  },
  'arctic-dawn': {
    label: 'Arctic Dawn',
    category: 'gradients',
    style: {
      backgroundColor: '#0f172a',
      backgroundImage: `
        radial-gradient(ellipse at 60% 20%, rgba(186, 230, 253, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 30% 70%, rgba(147, 197, 253, 0.1) 0%, transparent 45%),
        linear-gradient(160deg, #0f172a 0%, #1e293b 35%, #334155 55%, #1e293b 75%, #0f172a 100%)
      `,
    },
  },
  'cyber-pulse': {
    label: 'Cyber Pulse',
    category: 'gradients',
    style: {
      backgroundColor: '#050510',
      backgroundImage: `
        radial-gradient(circle at 15% 85%, rgba(0, 255, 136, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 85% 15%, rgba(0, 200, 255, 0.2) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, rgba(120, 0, 255, 0.08) 0%, transparent 60%),
        linear-gradient(135deg, #050510 0%, #0a0a20 50%, #050510 100%)
      `,
    },
  },
  'sahara-dusk': {
    label: 'Sahara Dusk',
    category: 'gradients',
    style: {
      backgroundColor: '#1c1008',
      backgroundImage: `
        radial-gradient(ellipse at 50% 30%, rgba(217, 119, 6, 0.25) 0%, transparent 55%),
        radial-gradient(ellipse at 20% 80%, rgba(120, 53, 15, 0.3) 0%, transparent 50%),
        linear-gradient(175deg, #1c1008 0%, #3d2010 25%, #78350f 45%, #92400e 55%, #3d2010 75%, #1c1008 100%)
      `,
    },
  },
  'deep-forest': {
    label: 'Deep Forest',
    category: 'gradients',
    style: {
      backgroundColor: '#052e16',
      backgroundImage: `
        radial-gradient(ellipse at 40% 30%, rgba(34, 197, 94, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 70%, rgba(21, 128, 61, 0.2) 0%, transparent 45%),
        radial-gradient(ellipse at 20% 80%, rgba(5, 46, 22, 0.4) 0%, transparent 55%),
        linear-gradient(150deg, #052e16 0%, #14532d 35%, #166534 55%, #052e16 100%)
      `,
    },
  },
  'vapor-wave': {
    label: 'Vapor Wave',
    category: 'gradients',
    style: {
      backgroundColor: '#1a002a',
      backgroundImage: `
        radial-gradient(ellipse at 30% 40%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 60%, rgba(6, 182, 212, 0.25) 0%, transparent 45%),
        linear-gradient(135deg, #1a002a 0%, #2d004a 30%, #1a003a 60%, #0a0020 100%)
      `,
    },
  },
  'slate-storm': {
    label: 'Slate Storm',
    category: 'gradients',
    style: {
      backgroundColor: '#0f0f14',
      backgroundImage: `
        radial-gradient(ellipse at 25% 25%, rgba(100, 116, 139, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 75% 75%, rgba(71, 85, 105, 0.25) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(51, 65, 85, 0.15) 0%, transparent 60%),
        linear-gradient(180deg, #0f0f14 0%, #1e1e2e 50%, #0f0f14 100%)
      `,
    },
  },
  'cherry-blossom': {
    label: 'Cherry Blossom',
    category: 'gradients',
    style: {
      backgroundColor: '#1a0a14',
      backgroundImage: `
        radial-gradient(ellipse at 35% 30%, rgba(244, 114, 182, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 65% 70%, rgba(236, 72, 153, 0.15) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, rgba(251, 207, 232, 0.05) 0%, transparent 60%),
        linear-gradient(145deg, #1a0a14 0%, #2d1024 40%, #1a0a14 100%)
      `,
    },
  },
  'golden-hour': {
    label: 'Golden Hour',
    category: 'gradients',
    style: {
      backgroundColor: '#1a1005',
      backgroundImage: `
        radial-gradient(ellipse at 70% 25%, rgba(250, 204, 21, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 30% 75%, rgba(245, 158, 11, 0.15) 0%, transparent 45%),
        linear-gradient(160deg, #1a1005 0%, #2d1f08 30%, #452a08 50%, #2d1f08 70%, #1a1005 100%)
      `,
    },
  },
  'cosmic-dust': {
    label: 'Cosmic Dust',
    category: 'gradients',
    style: {
      backgroundColor: '#030014',
      backgroundImage: `
        radial-gradient(circle at 15% 45%, rgba(99, 102, 241, 0.25) 0%, transparent 40%),
        radial-gradient(circle at 85% 55%, rgba(168, 85, 247, 0.2) 0%, transparent 40%),
        radial-gradient(circle at 50% 10%, rgba(236, 72, 153, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 50% 90%, rgba(14, 165, 233, 0.1) 0%, transparent 50%),
        linear-gradient(135deg, #030014 0%, #0f0024 50%, #030014 100%)
      `,
    },
  },
  'northern-lights': {
    label: 'Northern Lights',
    category: 'gradients',
    style: {
      backgroundColor: '#020c17',
      backgroundImage: `
        radial-gradient(ellipse at 30% 20%, rgba(34, 197, 94, 0.2) 0%, transparent 45%),
        radial-gradient(ellipse at 60% 40%, rgba(6, 182, 212, 0.2) 0%, transparent 40%),
        radial-gradient(ellipse at 45% 70%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
        linear-gradient(170deg, #020c17 0%, #0a1628 30%, #071320 60%, #020c17 100%)
      `,
    },
  },
  'obsidian-vein': {
    label: 'Obsidian Vein',
    category: 'gradients',
    style: {
      backgroundColor: '#09090b',
      backgroundImage: `
        radial-gradient(ellipse at 40% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
        radial-gradient(ellipse at 60% 70%, rgba(255, 255, 255, 0.02) 0%, transparent 45%),
        linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)
      `,
    },
  },
  'coral-reef': {
    label: 'Coral Reef',
    category: 'gradients',
    style: {
      backgroundColor: '#0c1a2a',
      backgroundImage: `
        radial-gradient(ellipse at 25% 60%, rgba(251, 146, 60, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 75% 30%, rgba(20, 184, 166, 0.2) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 90%, rgba(6, 95, 70, 0.25) 0%, transparent 50%),
        linear-gradient(155deg, #0c1a2a 0%, #0f2b3d 40%, #0c1a2a 100%)
      `,
    },
  },
};

/* ---------- Art Gallery Wallpapers ----------
 * Curated fine-art images from the Lithium art collection.
 * Served via Vite middleware at /art-wallpapers/ during dev.
 * In production these need to be copied to app/public/art-wallpapers/.
 */

export const ART_GALLERY = [
  { id: 'art-sisley-versailles', label: 'Road to Versailles', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Landscape/Alfred_Sisley_The_Road_from_Versailles_to_Louveciennes_437685.jpg' },
  { id: 'art-sisley-seine', label: 'The Seine at Bougival', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Landscape/Alfred_Sisley_The_Seine_at_Bougival_901617.jpg' },
  { id: 'art-renoir-sea', label: 'Sea and Cliffs', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Landscape/Auguste_Renoir_Sea_and_Cliffs_459111.jpg' },
  { id: 'art-renoir-naples', label: 'Bay of Naples', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Genre/Auguste_Renoir_The_Bay_of_Naples_437427.jpg' },
  { id: 'art-vangogh-olives', label: 'Olive Trees', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Landscape/Vincent_van_Gogh_Olive_Trees_437998.jpg' },
  { id: 'art-courbet-calm', label: 'The Calm Sea', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Landscape/Gustave_Courbet_The_Calm_Sea_436005.jpg' },
  { id: 'art-courbet-waterspout', label: 'Marine - Waterspout', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Landscape/Gustave_Courbet_Marine_The_Waterspout_436006.jpg' },
  { id: 'art-courbet-ornans', label: 'View of Ornans', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Landscape/Gustave_Courbet_View_of_Ornans_436025.jpg' },
  { id: 'art-homer-maine', label: 'Maine Coast', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Landscape/Winslow_Homer_Maine_Coast_11126.jpg' },
  { id: 'art-gauguin-hailmary', label: 'Ia Orana Maria', medium: 'Oil', path: '/art-wallpapers/Oil/Abstract/Landscape/Paul_Gauguin_Ia_Orana_Maria_Hail_Mary_438821.jpg' },
  { id: 'art-hodler-shepherd', label: 'Dream of the Shepherd', medium: 'Oil', path: '/art-wallpapers/Oil/Realism/Genre/Ferdinand_Hodler_The_Dream_of_the_Shepherd_Der_Traum_des_Hirten_634108.jpg' },
  { id: 'art-koch-rainbow', label: 'Heroic Landscape with Rainbow', medium: 'Oil', path: '/art-wallpapers/Oil/Contemporary/Landscape/Joseph_Anton_Koch_Heroic_Landscape_with_Rainbow_439844.jpg' },
  { id: 'art-macke-tunis', label: 'Tunisian View', medium: 'Oil', path: '/art-wallpapers/Oil/Abstract/Landscape/August_Macke_Tunisian_View_484937.jpg' },
  { id: 'art-poussin-orion', label: 'Orion Searching for the Sun', medium: 'Oil', path: '/art-wallpapers/Oil/Surrealism/Landscape/Nicolas_Poussin_Blind_Orion_Searching_for_the_Rising_Sun_437326.jpg' },
  { id: 'art-renoir-guernsey', label: 'Hills of Guernsey', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Landscape/Auguste_Renoir_Hills_around_the_Bay_of_Moulin_Huet_Guernsey_437431.jpg' },
  { id: 'art-renoir-seacoast', label: 'Normandy Seacoast', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Landscape/Auguste_Renoir_View_of_the_Seacoast_near_Wargemont_in_Normandy_437426.jpg' },
  { id: 'art-rousseau-lion', label: 'Repast of the Lion', medium: 'Oil', path: '/art-wallpapers/Oil/Expressionism/Genre/Henri_Rousseau_le_Douanier_The_Repast_of_the_Lion_438822.jpg' },
  { id: 'art-fenton-clouds', label: 'Landscape with Clouds', medium: 'Oil', path: '/art-wallpapers/Oil/Minimalism/Landscape/Roger_Fenton_Landscape_with_Clouds_282040.jpg' },
  { id: 'art-ink-mountains', label: 'Wintry Mountains', medium: 'Ink', path: '/art-wallpapers/Ink/Contemporary/Landscape/Gong_Xian_Wintry_mountains_49132.jpg' },
  { id: 'art-pissarro-garden', label: 'Tuileries Garden', medium: 'Oil', path: '/art-wallpapers/Oil/Impressionism/Genre/Camille_Pissarro_The_Garden_of_the_Tuileries_on_a_Spring_Morning_437313.jpg' },
].map(entry => ({
  ...entry,
  category: 'art',
  style: { backgroundImage: `url("${entry.path}")`, backgroundSize: 'cover', backgroundPosition: 'center' },
}));

/* ---------- Category helpers ---------- */

export const WALLPAPER_CATEGORIES = [
  { id: 'gradients', label: 'Gradients' },
  { id: 'art', label: 'Art Gallery' },
  { id: 'animated', label: 'Animated' },
  { id: 'custom', label: 'Custom' },
];

export function getGradientWallpapers() {
  return Object.entries(WALLPAPERS)
    .filter(([, wp]) => wp.category === 'gradients')
    .map(([id, wp]) => ({ id, ...wp }));
}

export function getArtWallpapers() {
  return ART_GALLERY;
}

export { getAnimatedWallpapers };

/* ---------- Shared utilities ---------- */

/** Debounced localStorage write — avoids thrashing storage on rapid state changes. */
export function useDebouncedSave(key, value) {
  useLayoutEffect(() => {
    scheduleStorageSave(key, value);
  }, [key, value]);
}

/** True when an entry lives inside the Notes vault (default-notes subtree). */
export function inVault(tree, entry) {
  let current = entry;
  while (current && current.id !== 'root') {
    if (current.id === 'default-notes' || current.parentId === 'default-notes') return true;
    current = tree.find(item => item.id === current.parentId);
  }
  return false;
}

/** Human-friendly relative time, e.g. "just now", "3 min ago", "2 h ago". */
export function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 min ago';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(ts).toLocaleDateString();
}

export const TONE_COLORS = {
  info: '#22d3ee',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};
