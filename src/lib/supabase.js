/**
 * Supabase client for Lithium browser authentication.
 *
 * Used to store the user's identity (email) so login forms on proxied
 * sites can be auto-filled with one click.  The user authenticates once
 * in Settings; their email is then available browser-wide.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** Lazy-initialised Supabase singleton (null when not configured). */
let _client = null;

export function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        autoRefreshToken: true,
      },
    });
  }
  return _client;
}

/** Whether Supabase is configured with URL + key. */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Sign in with email + password.
 * Returns { user, error }.
 */
export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { user: null, error: new Error('Supabase not configured') };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { user: data?.user ?? null, error };
}

/**
 * Sign up with email + password.
 * Returns { user, error }.
 */
export async function signUp(email, password) {
  const sb = getSupabase();
  if (!sb) return { user: null, error: new Error('Supabase not configured') };
  const { data, error } = await sb.auth.signUp({ email, password });
  return { user: data?.user ?? null, error };
}

/** Sign out the current user. */
export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

/** Get the currently signed-in user (null if none). */
export async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(callback) {
  const sb = getSupabase();
  if (!sb) return () => {};
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  }).data.subscription;
}
