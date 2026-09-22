/**
 * Thinking modes — control how deeply the model reasons before answering.
 *
 * Each mode maps to a token budget that caps the model's internal reasoning.
 * A higher budget means more thorough analysis but costs more credits and takes
 * longer. Lite models are always capped at a lower ceiling regardless of the
 * selected mode, since the free tier cannot sustain deep reasoning chains.
 *
 * The selector lives in the composer toolbar next to the provider chip, so the
 * user can change how hard the model thinks on a per-message basis.
 */

import { storage } from '../storage/localStorage';

/** Available thinking modes, ordered from least to most thorough. */
export const THINKING_MODES = [
  {
    id: 'off',
    label: 'Off',
    desc: 'No reasoning budget — fastest replies, lowest cost',
    budget: 0,
    icon: 'Zap',
  },
  {
    id: 'efficient',
    label: 'Efficient',
    desc: 'Quick thinking — good for simple questions',
    budget: 1024,
    icon: 'Timer',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    desc: 'Moderate reasoning — the default for most tasks',
    budget: 4096,
    icon: 'Sparkles',
  },
  {
    id: 'thorough',
    label: 'Thorough',
    desc: 'Deep reasoning — for complex problems and analysis',
    budget: 16384,
    icon: 'BrainCircuit',
  },
];

/** The default mode a fresh install starts on. */
const DEFAULT_MODE = 'balanced';

/** Storage key for the user's last-selected thinking mode. */
const STORAGE_KEY = 'lithium:thinking-mode';

/**
 * Get the user's selected thinking mode id.
 */
export function getThinkingMode() {
  return storage.get(STORAGE_KEY, DEFAULT_MODE);
}

/**
 * Persist the thinking mode choice.
 */
export function setThinkingMode(modeId) {
  if (THINKING_MODES.some(m => m.id === modeId)) {
    storage.set(STORAGE_KEY, modeId);
  }
}

/**
 * Resolve a mode id to its numeric budget. Returns 0 for unknown ids.
 */
export function thinkingBudget(modeId) {
  const mode = THINKING_MODES.find(m => m.id === modeId);
  return mode?.budget ?? 0;
}

/**
 * Resolve a mode id to its display label.
 */
export function thinkingLabel(modeId) {
  return THINKING_MODES.find(m => m.id === modeId)?.label || 'Balanced';
}

/**
 * The maximum budget Lite is allowed, regardless of what the user picked.
 * Lite is free and metered, so deep reasoning would burn credits fast.
 */
const LITE_MAX_BUDGET = 4096;

/**
 * Apply Lite-tier caps to a thinking budget. Lite models always get at most
 * the medium ceiling; the 'thorough' mode is clamped down.
 */
export function liteBudget(modeId) {
  const raw = thinkingBudget(modeId);
  if (raw <= 0) return 0;
  return Math.min(raw, LITE_MAX_BUDGET);
}

/**
 * Whether thinking modes should be offered for a given provider.
 * Lite caps the options but still shows the selector; local models
 * do not support a reasoning budget at all.
 */
export function thinkingAvailable(providerId) {
  return providerId !== 'local';
}
