/**
 * Auth state — tracks the signed-in Supabase user for auto-fill.
 *
 * The user's email is stored by Supabase Auth (persisted in localStorage).
 * This store exposes a reactive signal so the UI can show/hide the
 * "Login with <email>" bar without polling.
 */
import { signal } from '@preact/signals';
import { getCurrentUser, onAuthStateChange, signOut as sbSignOut } from '../../../lib/supabase';

/** The current Supabase user object (null when signed out). */
export const authUser = signal(null);

/** Whether we've checked for an existing session at startup. */
export const authChecked = signal(false);

/** Initialise: restore any existing session on first load. */
export async function initAuth() {
  try {
    authUser.value = await getCurrentUser();
  } catch {
    authUser.value = null;
  }
  authChecked.value = true;

  // Keep the signal in sync with auth state changes
  onAuthStateChange((user) => {
    authUser.value = user;
  });
}

/** Sign out and clear the signal. */
export async function signOut() {
  await sbSignOut();
  authUser.value = null;
}

/** Computed helper: the user's email address (or empty string). */
export function getAuthEmail() {
  return authUser.value?.email || '';
}
