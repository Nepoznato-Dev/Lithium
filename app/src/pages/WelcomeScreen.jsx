import { useEffect, useRef, useState } from 'react';
import { signIn, signUp, isSupabaseConfigured } from '../lib/supabase';
import WelcomeBackdrop from '../Components/Welcome/WelcomeBackdrop';

/**
 * WelcomeScreen — shown once to new users before the desktop loads.
 *
 * Offers Supabase sign-in / sign-up and a "Use locally" escape hatch
 * at the bottom.  Dismissing (or signing in) sets a localStorage flag
 * so the screen never appears again.
 */
export default function WelcomeScreen({ onDone }) {
  const cardRef = useRef(null);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [simplified, setSimplified] = useState(() => {
    try { return localStorage.getItem('lithium:welcome-simplified') === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('lithium:welcome-simplified', simplified ? '1' : '0'); }
    catch { /* storage unavailable */ }
  }, [simplified]);

  const configured = isSupabaseConfigured();

  /** Extract the first name from an email address. */
  const nameFromEmail = (addr) => {
    const raw = addr.includes('@') ? addr.slice(0, addr.indexOf('@')) : addr;
    if (!raw) return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password);
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      const name = nameFromEmail(email);
      setSuccess(name ? `Welcome, ${name}!` : 'Signed in!');
      setTimeout(onDone, 900);
    }
  };

  const skip = () => onDone();

  return (
    <div className="welcome-screen">
      {/* Dot-matrix backdrop with physics-driven shapes */}
      <WelcomeBackdrop obstacleRef={cardRef} simplified={simplified} />
      <div className="welcome-glow" />

      <div className="welcome-card" ref={cardRef}>
        {/* Branding */}
        <div className="welcome-brand">
          <div className="welcome-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="url(#wg)" />
              <path d="M10 26V10h4.5c1.6 0 2.8.4 3.6 1.2.8.8 1.2 1.9 1.2 3.3 0 .9-.2 1.7-.6 2.3-.4.6-1 1.1-1.7 1.3L20 26h-3.2l-2.6-7.4H13V26H10Zm3-9.8h1.4c.8 0 1.4-.2 1.8-.6.4-.4.6-1 .6-1.7 0-.7-.2-1.2-.6-1.6-.4-.4-1-.6-1.8-.6H13v3.9Z" fill="#0a0a0f" />
              <defs>
                <linearGradient id="wg" x1="0" y1="0" x2="36" y2="36">
                  <stop stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="welcome-title">Welcome to Lithium</h1>
          <p className="welcome-subtitle">
            Sign in to sync your settings and auto-fill logins across the web.
          </p>
        </div>

        {/* Auth form (only when Supabase is configured) */}
        {configured ? (
          <>
            {/* Mode toggle */}
            <div className="welcome-tabs">
              <button
                className={`welcome-tab ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => { setMode('signin'); setError(''); }}
                type="button"
              >
                Sign in
              </button>
              <button
                className={`welcome-tab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => { setMode('signup'); setError(''); }}
                type="button"
              >
                Create account
              </button>
            </div>

            <form className="welcome-form" onSubmit={handleSubmit}>
              <input
                className="text-input"
                type="email"
                placeholder="Email"
                value={email}
                onInput={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
              <input
                className="text-input"
                type="password"
                placeholder="Password"
                value={password}
                onInput={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e); }}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />

              {error && <p className="welcome-error">{error}</p>}
              {success && <p className="welcome-success">{success}</p>}

              <button
                className="btn-primary welcome-submit"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'signin' ? 'Sign in' : 'Create account')}
              </button>
            </form>
          </>
        ) : (
          <p className="welcome-config-warn">
            Supabase is not configured yet. Add
            <code>VITE_SUPABASE_URL</code> and
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to
            enable cloud sync.
          </p>
        )}

        {/* Skip */}
        <button className="welcome-skip" onClick={skip} type="button">
          Use locally &rarr;
        </button>
      </div>

      {/* Simplified mode toggle for older/slower devices */}
      <button
        className={`welcome-simplified-btn ${simplified ? 'on' : ''}`}
        onClick={() => setSimplified(v => !v)}
        type="button"
        title={simplified ? 'Switch to full effects' : 'Reduce animation effects'}
      >
        {simplified ? 'Full' : 'Simplified'}
      </button>
    </div>
  );
}
