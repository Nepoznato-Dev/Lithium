/**
 * Supabase auth for Lithium — dependency-free GoTrue client.
 *
 * Replaces @supabase/supabase-js (~53 kB gzip) with the handful of plain
 * REST calls the app actually uses: password sign-in/up, sign-out, session
 * read/refresh, and a local auth-state emitter. Supabase's auth API is
 * ordinary JSON over HTTP (apikey header + Bearer tokens), so no SDK is
 * needed. The user's identity (email) is stored so login forms on proxied
 * sites can be auto-filled with one click.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

/** localStorage key for the persisted session (SDK used its own key before). */
const SESSION_KEY = 'lithium:supabase-session';
/** Refresh this many seconds before actual expiry to avoid racing a dead token. */
const EXPIRY_SKEW = 60;

/* ---- session persistence ------------------------------------------------ */

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Fill in expires_at (epoch seconds) when the API only sent expires_in. */
function normalizeSession(s) {
  if (!s || !s.access_token) return null;
  if (!s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
  return s;
}

let _session = typeof localStorage !== 'undefined' ? normalizeSession(loadSession()) : null;

function saveSession(session) {
  _session = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage full/blocked — session stays in memory */ }
  emit(session?.user ?? null);
}

function isExpired(s) {
  return !s || Date.now() / 1000 >= s.expires_at - EXPIRY_SKEW;
}

/* ---- auth-state emitter (replaces the SDK's GoTrueClient subscription) --- */

const _listeners = new Set();

function emit(user) {
  for (const cb of _listeners) {
    try { cb(user); } catch (err) { console.error('[supabase] auth listener error:', err); }
  }
}

/* ---- REST helpers --------------------------------------------------------- */

async function authPost(path, body, accessToken) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function toError(data, status, fallback) {
  const msg = data?.error_description || data?.msg || data?.message || data?.error || fallback;
  const err = new Error(typeof msg === 'string' ? msg : fallback);
  err.status = status;
  return err;
}

/** Exchange the refresh token for a fresh session; clears it on failure. */
async function refreshSession() {
  if (!_session?.refresh_token) return null;
  const { ok, data } = await authPost('/token?grant_type=refresh_token', {
    refresh_token: _session.refresh_token,
  });
  if (!ok) {
    saveSession(null);
    return null;
  }
  const session = normalizeSession(data);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage blocked */ }
  _session = session;
  return session;
}

/** Current session, refreshed on demand; null when signed out. */
async function effectiveSession() {
  if (!_session) return null;
  if (isExpired(_session)) await refreshSession();
  return _session;
}

/* ---- public API (same shape as before) ------------------------------------ */

/** Whether Supabase is configured with URL + key. */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Sign in with email + password.
 * Returns { user, error }.
 */
export async function signIn(email, password) {
  if (!isSupabaseConfigured()) return { user: null, error: new Error('Supabase not configured') };
  const { ok, status, data } = await authPost('/token?grant_type=password', { email, password });
  if (!ok) return { user: null, error: toError(data, status, 'Invalid login credentials') };
  const session = normalizeSession(data);
  saveSession(session);
  return { user: session?.user ?? null, error: null };
}

/**
 * Sign up with email + password.
 * Returns { user, error }.  When email confirmation is enabled the API
 * returns a user without a session — sign-in is still required afterwards.
 */
export async function signUp(email, password) {
  if (!isSupabaseConfigured()) return { user: null, error: new Error('Supabase not configured') };
  const { ok, status, data } = await authPost('/signup', { email, password });
  if (!ok) return { user: null, error: toError(data, status, 'Sign up failed') };
  const session = normalizeSession(data.session);
  if (session) saveSession(session);
  return { user: data.user ?? session?.user ?? null, error: null };
}

/** Sign out the current user. */
export async function signOut() {
  if (!isSupabaseConfigured()) return;
  const token = _session?.access_token;
  saveSession(null);
  if (token) await authPost('/logout', null, token).catch(() => {});
}

/** Get the currently signed-in user (null if none), validated against the API. */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  const session = await effectiveSession();
  if (!session) return null;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` };
  let res = await fetch(`${AUTH_URL}/user`, { headers }).catch(() => null);
  if (!res) return session.user ?? null; // network down — trust the cached user
  if (res.status === 401) {
    const fresh = await refreshSession();
    if (!fresh) return null;
    res = await fetch(`${AUTH_URL}/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${fresh.access_token}` },
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const user = await res.json().catch(() => null);
    return user ?? null;
  }
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user ?? session.user ?? null;
}

/** Get the current session's access token (null if not signed in). */
export async function getAccessToken() {
  const session = await effectiveSession();
  return session?.access_token ?? null;
}

/** Get the current session object (null if not signed in). */
export async function getSession() {
  return effectiveSession();
}

/**
 * Subscribe to auth state changes (sign in/out and session replacement).
 * Callback receives the user object (null when signed out).
 * Resolves to a subscription object with .unsubscribe().
 */
export async function onAuthStateChange(callback) {
  _listeners.add(callback);
  return { unsubscribe: () => { _listeners.delete(callback); } };
}
