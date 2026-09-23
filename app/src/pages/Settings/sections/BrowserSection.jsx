import { useState, useEffect } from 'react';
import { SEARCH_ENGINES } from '../../../lib/settings';
import { SCRAPE_PROVIDERS } from '../../../lib/searchProxy';
import { authUser, authChecked, getDisplayName, signOut, initAuth } from '../../Browser/stores/authStore';
import { signIn, signUp, isSupabaseConfigured } from '../../../lib/supabase';
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
        <SettingsRow title="Search engine" description="Default engine for address-bar queries and Start menu web search">
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

      <CardGroup label="Browser UI">
        <SettingsRow title="Bookmarks bar" description="Show the bookmarks bar below the address bar">
          <EnhancedToggle value={settings.browser?.showBookmarksBar ?? true} onChange={v => update('browser.showBookmarksBar', v)} />
        </SettingsRow>
        <SettingsRow title="Status bar" description="Show the status bar at the bottom of the browser">
          <EnhancedToggle value={settings.browser?.showStatusBar ?? false} onChange={v => update('browser.showStatusBar', v)} />
        </SettingsRow>
        <SettingsRow title="Compact tab strip" description="Use a smaller tab strip for more vertical space">
          <EnhancedToggle value={settings.browser?.compactTabs ?? false} onChange={v => update('browser.compactTabs', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Privacy & Security">
        <SettingsRow title="Block third-party cookies" description="Prevent websites from setting cross-site tracking cookies">
          <EnhancedToggle value={settings.browser?.blockThirdPartyCookies ?? true} onChange={v => update('browser.blockThirdPartyCookies', v)} />
        </SettingsRow>
        <SettingsRow title="Do Not Track" description="Send a Do Not Track header with all requests">
          <EnhancedToggle value={settings.browser?.doNotTrack ?? true} onChange={v => update('browser.doNotTrack', v)} />
        </SettingsRow>
        <SettingsRow title="Prevent fingerprinting" description="Limit browser fingerprint that sites can use to identify you">
          <EnhancedToggle value={settings.browser?.preventFingerprinting ?? true} onChange={v => update('browser.preventFingerprinting', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Downloads">
        <SettingsRow title="Ask before downloading" description="Confirm each download before saving">
          <EnhancedToggle value={settings.browser?.askBeforeDownload ?? true} onChange={v => update('browser.askBeforeDownload', v)} />
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
                {getDisplayName().charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-[13px] text-white/90">{getDisplayName()} <span className="text-[11px] text-cyan-400/60 font-normal">Cloud user</span></div>
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

      <CardGroup label="Page Proxy">
        <SettingsRow
          title="Enable proxy"
          description="Route web pages through your own server to bypass iframe restrictions (CSP, X-Frame-Options). Sites that normally refuse embedding will load natively."
        >
          <EnhancedToggle
            checked={Boolean(settings.browser?.proxyEnabled)}
            onChange={v => update('browser.proxyEnabled', v)}
          />
        </SettingsRow>
        <SettingsRow
          title="Proxy origin"
          description="Where to send them — the server is asked at /api/web/proxy. Leave empty to use the one Lithium already found; set an origin like this machine's address to reach a server on another host."
        >
          <input
            className="text-input w-56 rounded-full py-1.5 text-xs"
            type="url"
            placeholder={`http://${window.location.hostname}:8734`}
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
