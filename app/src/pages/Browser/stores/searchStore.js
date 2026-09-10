/**
 * Unified search provider state — shared across NTP and Omnibox.
 * A single signal so switching providers anywhere updates the whole browser.
 */
import { signal } from '@preact/signals';

/** The currently active search provider key (e.g. 'duckduckgo', 'brave', 'bing', 'mojeek'). */
export const activeSearchProvider = signal('brave');
