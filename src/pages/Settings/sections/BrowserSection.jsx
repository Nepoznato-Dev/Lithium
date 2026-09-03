import { useState, useEffect } from 'react';
import { SEARCH_ENGINES } from '../../../lib/settings';
import { SCRAPE_PROVIDERS } from '../../../lib/searchProxy';
import { authUser, authChecked, getAuthEmail, signOut, initAuth } from '../../Browser/stores/authStore';
import { signIn, signUp, isSupabaseConfigured } from '../../../lib/supabase';
import Icon from '../../../Components/Icon';
import { CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';

export default function BrowserSection({ settings, update }) {
  const [proxyUrl, setProxyUrl] = useState(settings.browser?.proxyUrl || '');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const user = authUser.value;
  const checked = authChecked.value;

  // Init auth on first render
  useEffect(() => { initAuth(); }, []);

  const handleAuth = async (isSignUp) => {
    if (!authEmail || !authPassword) { setAuthError('Email and password required'); return; }
    setAuthLoading(true);
    setAuthError('');
    const { error } = isSignUp ? await signUp(authEmail, authPassword) : await signIn(authEmail, authPassword);
    setAuthLoading(false);
    if (error) setAuthError(error.message);
    else { setAuthEmail(''); setAuthPassword(''); }
  };

  return (
    <div>
      <CardGroup label="Search">
        <SettingsRow title="Search engine" description="Default engine for address-bar queries">
          <SegmentedControl
            value={settings.browser.searchEngine}
            onChange={v => update('browser.searchEngine', v)}
            options={Object.entries(SEARCH_ENGINES).map(([value, eng]) => ({ value, label: eng.label.split(' ')[0] }))}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Free Web Scraping">
        <SettingsRow
          title="Search provider"
          description="Scrape search results from a free engine via public CORS proxies. No Cloudflare Worker needed — trades reliability for zero setup."
        >
          <select
            className="text-input rounded-full py-1.5 text-xs"
            value={settings.browser?.scrapeProvider || ''}
            onChange={e => update('browser.scrapeProvider', e.target.value)}
          >
            <option value="">Off (address bar only)</option>
            {Object.entries(SCRAPE_PROVIDERS).map(([key, prov]) => (
              <option key={key} value={key}>{prov.label}</option>
            ))}
          </select>
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Sync & Login">
        {!isSupabaseConfigured() ? (
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <p className="text-[13px] text-amber-300/80">Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local</p>
          </div>
        ) : !checked ? (
          <div className="settings-row">
            <span className="text-[13px] text-white/50">Checking session…</span>
          </div>
        ) : user ? (
          <div className="settings-row">
            <div className="flex items-center gap-3">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(34,211,238,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#67e8f9' }}>
                {getAuthEmail().charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-[13px] text-white/90">{getAuthEmail()}</div>
                <div className="text-[11px] text-white/40">Auto-fill active — login forms will be detected</div>
              </div>
            </div>
            <button className="settings-btn text-xs" onClick={async () => { await signOut(); }}>Sign out</button>
          </div>
        ) : (
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <p className="text-[13px] text-white/50">Sign in to auto-fill your email on website login forms.</p>
            <div className="flex gap-2 items-center">
              <input className="text-input flex-1 rounded-full py-1.5 text-xs" type="email" placeholder="Email" value={authEmail} onInput={e => setAuthEmail(e.target.value)} />
              <input className="text-input w-40 rounded-full py-1.5 text-xs" type="password" placeholder="Password" value={authPassword} onInput={e => setAuthPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAuth(false); }} />
            </div>
            {authError && <p className="text-[11px] text-red-400">{authError}</p>}
            <div className="flex gap-2">
              <button className="settings-btn text-xs" disabled={authLoading} onClick={() => handleAuth(false)}>{authLoading ? 'Signing in…' : 'Sign in'}</button>
              <button className="settings-btn-secondary text-xs" disabled={authLoading} onClick={() => handleAuth(true)}>Create account</button>
            </div>
          </div>
        )}
      </CardGroup>

      <CardGroup label="Cloudflare Proxy">
        <SettingsRow
          title="Enable proxy"
          description="Route web pages through a Cloudflare Worker to bypass iframe restrictions (CSP, X-Frame-Options). Sites that normally refuse embedding will load natively."
        >
          <EnhancedToggle
            checked={Boolean(settings.browser?.proxyEnabled)}
            onChange={v => update('browser.proxyEnabled', v)}
          />
        </SettingsRow>
        <SettingsRow
          title="Proxy URL"
          description="The deployed Worker URL (e.g. https://lithium-proxy.your-subdomain.workers.dev)"
        >
          <input
            className="text-input w-56 rounded-full py-1.5 text-xs"
            type="url"
            placeholder="https://lithium-proxy.workers.dev"
            value={proxyUrl}
            onChange={e => setProxyUrl(e.target.value)}
            onBlur={() => update('browser.proxyUrl', proxyUrl.trim())}
            spellCheck={false}
          />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
