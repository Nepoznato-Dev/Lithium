/**
 * SettingsPage — browser settings with sidebar navigation and sections.
 * Sections: Appearance, Privacy, Shields, Search, Downloads, Accessibility, System.
 */
import { useState } from 'preact/hooks';
import { browserSettings, updateBrowserSetting, resetBrowserSettings } from '../stores/settingsStore';
import { shieldsEnabled, toggleShields } from '../stores/shieldsStore';
import { authUser, authChecked, getAuthEmail, signOut } from '../stores/authStore';
import { signIn, signUp, isSupabaseConfigured } from '../../../lib/supabase';
import Icon from '../../../Components/Icon';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'Palette' },
  { id: 'privacy', label: 'Privacy', icon: 'Eye' },
  { id: 'shields', label: 'Shields', icon: 'Shield' },
  { id: 'search', label: 'Search Engine', icon: 'Search' },
  { id: 'account', label: 'Sync & Login', icon: 'User' },
  { id: 'downloads', label: 'Downloads', icon: 'Download' },
  { id: 'accessibility', label: 'Accessibility', icon: 'Accessibility' },
  { id: 'system', label: 'System', icon: 'Settings' },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('appearance');
  const settings = browserSettings.value;
  const shieldsOn = shieldsEnabled.value;

  return (
    <div className="flex h-full bg-[#0f0f17]">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-white/[0.06] p-3">
        <h2 className="mb-3 px-2 text-sm font-semibold text-white">Settings</h2>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                activeSection === s.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
              onClick={() => setActiveSection(s.id)}
            >
              <Icon name={s.icon} className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'appearance' && (
          <Section title="Appearance">
            <SelectRow label="Theme" value={settings.theme} options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]} onChange={v => updateBrowserSetting('theme', v)} />
            <ToggleRow label="Show bookmarks bar" checked={settings.showBookmarksBar} onChange={v => updateBrowserSetting('showBookmarksBar', v)} />
            <ToggleRow label="Show status bar" checked={settings.showStatusBar} onChange={v => updateBrowserSetting('showStatusBar', v)} />
            <ToggleRow label="Compact tab strip" checked={settings.compactTabs} onChange={v => updateBrowserSetting('compactTabs', v)} />
          </Section>
        )}

        {activeSection === 'privacy' && (
          <Section title="Privacy">
            <ToggleRow label="Block third-party cookies" checked={settings.blockThirdPartyCookies} onChange={v => updateBrowserSetting('blockThirdPartyCookies', v)} />
            <ToggleRow label="Send Do Not Track header" checked={settings.doNotTrack} onChange={v => updateBrowserSetting('doNotTrack', v)} />
            <ToggleRow label="Prevent fingerprinting" checked={settings.preventFingerprinting} onChange={v => updateBrowserSetting('preventFingerprinting', v)} />
            <div className="mt-4">
              <button className="rounded-lg bg-red-500/20 px-4 py-2 text-xs text-red-300 hover:bg-red-500/30" onClick={() => {
                if (confirm('Clear all browsing data?')) {
                  // handled by parent via event
                  window.dispatchEvent(new CustomEvent('browser-clear-data'));
                }
              }}>
                Clear browsing data
              </button>
            </div>
          </Section>
        )}

        {activeSection === 'shields' && (
          <Section title="Shields">
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
              <span className="text-xs text-white/70">Shields enabled</span>
              <button
                className={`relative h-5 w-9 rounded-full transition-colors ${shieldsOn ? 'bg-orange-500' : 'bg-white/10'}`}
                onClick={toggleShields}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${shieldsOn ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
            <SelectRow label="Default ad blocking" value={settings.shieldsDefaults?.adBlock || 'standard'} options={[
              { value: 'aggressive', label: 'Aggressive' },
              { value: 'standard', label: 'Standard' },
              { value: 'disabled', label: 'Disabled' },
            ]} onChange={v => updateBrowserSetting('shieldsDefaults', { ...settings.shieldsDefaults, adBlock: v })} />
            <ToggleRow label="Auto-redirect to HTTPS" checked={settings.shieldsDefaults?.upgradeHttps !== false} onChange={v => updateBrowserSetting('shieldsDefaults', { ...settings.shieldsDefaults, upgradeHttps: v })} />
          </Section>
        )}

        {activeSection === 'search' && (
          <Section title="Search Engine">
            <SelectRow label="Default search engine" value={settings.searchEngine} options={[
              { value: 'brave', label: 'Brave Search' },
              { value: 'duckduckgo', label: 'DuckDuckGo' },
              { value: 'google', label: 'Google' },
              { value: 'bing', label: 'Bing' },
            ]} onChange={v => updateBrowserSetting('searchEngine', v)} />
            <SelectRow label="Scrape provider" value={settings.scrapeProvider || ''} options={[
              { value: '', label: 'None (direct)' },
              { value: 'brave', label: 'Brave' },
              { value: 'duckduckgo', label: 'DuckDuckGo' },
              { value: 'qwant', label: 'Qwant' },
              { value: 'mojeek', label: 'Mojeek' },
              { value: 'startpage', label: 'Startpage' },
            ]} onChange={v => updateBrowserSetting('scrapeProvider', v)} />
          </Section>
        )}

        {activeSection === 'downloads' && (
          <Section title="Downloads">
            <ToggleRow label="Ask before downloading" checked={settings.askBeforeDownload} onChange={v => updateBrowserSetting('askBeforeDownload', v)} />
            <ToggleRow label="Show downloads panel" checked={settings.showDownloadsPanel} onChange={v => updateBrowserSetting('showDownloadsPanel', v)} />
            <div className="mt-2 text-[11px] text-white/30">
              Download location: <span className="text-white/50">Default (browser storage)</span>
            </div>
          </Section>
        )}

        {activeSection === 'account' && (
          <AccountSection />
        )}

        {activeSection === 'accessibility' && (
          <Section title="Accessibility">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
                <span className="text-xs text-white/70">Font size</span>
                <div className="flex items-center gap-2">
                  <button className="icon-btn h-6 w-6 text-xs" onClick={() => updateBrowserSetting('fontScale', Math.max(80, (settings.fontScale || 100) - 10))}>-</button>
                  <span className="w-10 text-center text-xs text-white/60">{settings.fontScale || 100}%</span>
                  <button className="icon-btn h-6 w-6 text-xs" onClick={() => updateBrowserSetting('fontScale', Math.min(150, (settings.fontScale || 100) + 10))}>+</button>
                </div>
              </div>
              <ToggleRow label="Enable animations" checked={settings.enableAnimations !== false} onChange={v => updateBrowserSetting('enableAnimations', v)} />
            </div>
          </Section>
        )}

        {activeSection === 'system' && (
          <Section title="System">
            <ToggleRow label="Hardware acceleration" checked={settings.hardwareAcceleration !== false} onChange={v => updateBrowserSetting('hardwareAcceleration', v)} />
            <ToggleRow label="Proxy enabled" checked={settings.proxyEnabled || false} onChange={v => updateBrowserSetting('proxyEnabled', v)} />
            <div className="mt-4">
              <button className="rounded-lg bg-white/5 px-4 py-2 text-xs text-white/60 hover:bg-white/10" onClick={resetBrowserSettings}>
                Reset all settings
              </button>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-white">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
      <span className="text-xs text-white/70">{label}</span>
      <button
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-white/10'}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
      <span className="text-xs text-white/70">{label}</span>
      <select
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 outline-none"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function AccountSection() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const user = authUser.value;
  const checked = authChecked.value;

  if (!isSupabaseConfigured()) {
    return (
      <Section title="Sync & Login">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200/80">
          <p className="mb-1 font-medium">Supabase not configured</p>
          <p>Add <code className="rounded bg-black/20 px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-black/20 px-1">VITE_SUPABASE_ANON_KEY</code> to your <code className="rounded bg-black/20 px-1">.env.local</code> file to enable login sync.</p>
        </div>
      </Section>
    );
  }

  if (!checked) {
    return (
      <Section title="Sync & Login">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Icon name="Loader2" size={14} className="animate-spin" /> Checking session…
        </div>
      </Section>
    );
  }

  if (user) {
    return (
      <Section title="Sync & Login">
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-bold text-cyan-300">
            {getAuthEmail().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white/90">{getAuthEmail()}</p>
            <p className="text-[11px] text-white/40">Signed in — login auto-fill is active</p>
          </div>
          <button
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            onClick={async () => { await signOut(); }}
          >
            Sign out
          </button>
        </div>
        <p className="text-[11px] text-white/30">
          When visiting a site with a login form, Lithium will offer to auto-fill your email.
        </p>
      </Section>
    );
  }

  const handleSubmit = async (isSignUp) => {
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true);
    setError('');
    const { error: err } = isSignUp ? await signUp(email, password) : await signIn(email, password);
    setLoading(false);
    if (err) setError(err.message);
  };

  return (
    <Section title="Sync & Login">
      <p className="text-xs text-white/50">Sign in to enable automatic login auto-fill on websites.</p>
      <div className="flex flex-col gap-2">
        <input
          type="email"
          placeholder="Email"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-cyan-500/50"
          value={email}
          onInput={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-cyan-500/50"
          value={password}
          onInput={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(false); }}
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            disabled={loading}
            onClick={() => handleSubmit(false)}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            className="rounded-lg bg-white/5 px-4 py-2 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
            disabled={loading}
            onClick={() => handleSubmit(true)}
          >
            Create account
          </button>
        </div>
      </div>
    </Section>
  );
}
