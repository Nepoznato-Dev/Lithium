import Icon from '../../Components/Icon';
import ApiField from './ApiField';

export default function MusicSettings({ apis, prefs, solo, spotifyTest,
  setApis, setPrefs, setSettingsOpen, setSpotifyTest,
  testSpotify, disconnectSoloist, connectSoloistDevice, saveSettings }) {
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-end bg-black/50 p-4" onClick={() => setSettingsOpen(false)}>
      <div className="mt-2 flex max-h-full w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-white/10 bg-[#1b1b21] p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center gap-2 text-sm font-bold"><Icon name="Settings2" size={15} className="acc-text" /> Player settings</div>
        {[
          { key: 'leftOpen', label: 'Library sidebar open by default' },
          { key: 'rightOpen', label: 'Now-playing sidebar open by default' },
          { key: 'autoplayRelated', label: 'Autoplay related music when the queue ends' },
        ].map(option => (
          <label key={option.key} className="flex items-center justify-between gap-2 text-xs text-white/75">
            {option.label}
            <input type="checkbox" checked={Boolean(prefs[option.key])} onChange={event => setPrefs(prev => ({ ...prev, [option.key]: event.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
          </label>
        ))}
        <div className="pt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">Service APIs (your own keys)</div>
        <ApiField label="Spotify Client ID:Client Secret (web search)" hint="Auto-exchanges a Bearer token (client-credentials); a raw token works too" value={apis.spotify} onChange={value => setApis(prev => ({ ...prev, spotify: value }))} />
        <div className="-mt-1 flex items-center gap-2">
          <button
            className="btn-ghost px-3 py-1 text-[10px]"
            onClick={async () => {
              setSpotifyTest('Testing…');
              const result = await testSpotify(apis.spotify, apis.spotifyBase?.trim() || '');
              setSpotifyTest(result.message);
            }}
          >
            Test connection
          </button>
          {spotifyTest && (
            <span className={`text-[10px] ${spotifyTest.startsWith('Connected') ? 'text-emerald-300' : 'text-red-300'}`}>{spotifyTest}</span>
          )}
        </div>
        <ApiField label="Spotify base URL (optional)" hint="Only for proxy/third-party keys, e.g. https://my-spotify-proxy.example.com — leave empty for official credentials" value={apis.spotifyBase || ''} onChange={value => setApis(prev => ({ ...prev, spotifyBase: value }))} />
        <ApiField label="Soloist WebSocket URL (full playback)" hint="On your Linux device run: soloist --api-key spak_… --ws 127.0.0.1:9090 — the spak_ key goes to the daemon, this field is only the WS address" value={apis.soloistUrl || ''} onChange={value => setApis(prev => ({ ...prev, soloistUrl: value }))} />
        <div className="-mt-1 flex items-center gap-2">
          <button
            className="btn-ghost px-3 py-1 text-[10px]"
            onClick={solo.status === 'connected' || solo.status === 'connecting' ? disconnectSoloist : connectSoloistDevice}
          >
            {solo.status === 'connected' || solo.status === 'connecting' ? 'Disconnect' : 'Connect Soloist'}
          </button>
          <span className={`text-[10px] ${solo.status === 'connected' ? 'text-emerald-300' : solo.error ? 'text-red-300' : 'text-white/40'}`}>
            {solo.status === 'connected'
              ? (solo.auth?.logged_in ? `Logged in · ${solo.auth.device_name || 'device'}` : 'Connected · not logged in')
              : solo.error || solo.status}
          </span>
        </div>
        <ApiField label="Apple Music developer token" hint="MusicKit JWT → catalog search + previews" value={apis.apple} onChange={value => setApis(prev => ({ ...prev, apple: value }))} />
        <ApiField label="YouTube Data API key" hint="Search metadata; plays via Browser window" value={apis.youtube} onChange={value => setApis(prev => ({ ...prev, youtube: value }))} />
        <ApiField label="SoundCloud client_id" hint="api-v2 search + full streams" value={apis.soundcloud} onChange={value => setApis(prev => ({ ...prev, soundcloud: value }))} />
        <ApiField label="Jamendo client_id" hint="Free CC catalog, full streams" value={apis.jamendo} onChange={value => setApis(prev => ({ ...prev, jamendo: value }))} />
        <p className="text-[10px] leading-relaxed text-white/35">
          Keys are stored only in this browser and sent straight to each service. Spotify/Apple return 30-second
          previews; SoundCloud and Jamendo stream full tracks; YouTube results open in the Lithium Browser.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSettingsOpen(false)}><Icon name="X" size={13} /> Cancel</button>
          <button className="btn-primary px-4 py-1.5 text-xs" onClick={() => saveSettings(apis)}>Save</button>
        </div>
      </div>
    </div>
  );
}
