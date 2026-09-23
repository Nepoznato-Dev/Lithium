import { CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';
import Icon from '../../../Components/Icon';
import { getStats, resetStats, subscribePrivacy, getHistory } from '../../../lib/services/privacyService';
import { FILTER_LISTS, toggleFilterList, updateAllFilterLists } from '../../../lib/services/adBlocker';
import { useState, useEffect, useCallback } from 'react';

/** Format bytes to human-readable. */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Filter list toggle row. */
function FilterListRow({ listId, list, onToggle }) {
  const domainCount = list.domains ? list.domains.size : 0;
  const patternCount = list.patterns ? list.patterns.length : 0;
  const ruleCount = domainCount + patternCount;

  return (
    <SettingsRow
      title={list.name}
      description={`${list.description} — ${ruleCount.toLocaleString()} rules`}
    >
      <EnhancedToggle value={list.enabled} onChange={() => onToggle(listId)} />
    </SettingsRow>
  );
}

/** Per-site shield level editor. */
function DomainShieldRow({ domain, shield, onRemove, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <Icon name="Globe" size={13} color="rgba(255,255,255,0.4)" />
      <span className="flex-1 truncate text-xs text-white/70">{domain}</span>
      <select
        className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 outline-none"
        value={shield}
        onChange={e => onChange(domain, e.target.value)}
      >
        <option value="off">Off</option>
        <option value="standard">Standard</option>
        <option value="aggressive">Aggressive</option>
      </select>
      <button
        className="rounded p-1 text-white/30 transition-colors hover:bg-red-500/20 hover:text-red-400"
        onClick={() => onRemove(domain)}
        title="Remove rule"
      >
        <Icon name="X" size={12} />
      </button>
    </div>
  );
}

/** Simple SVG bar chart showing privacy stats over the last 7 days. */
function PrivacyHistory({ history }) {
  if (!history || history.length < 2) return null;
  const maxVal = Math.max(1, ...history.map(h => (h.adsBlocked || 0) + (h.trackersPrevented || 0)));
  const barW = 28;
  const gap = 6;
  const chartH = 80;
  const chartW = history.length * (barW + gap) - gap;

  return (
    <div style={{ padding: '8px 0', overflowX: 'auto' }}>
      <svg width={chartW} height={chartH + 24} viewBox={`0 0 ${chartW} ${chartH + 24}`} style={{ display: 'block', margin: '0 auto' }}>
        {history.map((day, i) => {
          const ads = day.adsBlocked || 0;
          const trackers = day.trackersPrevented || 0;
          const total = ads + trackers;
          const h = Math.max(2, (total / maxVal) * chartH);
          const adsH = total > 0 ? (ads / total) * h : 0;
          const trackerH = h - adsH;
          const x = i * (barW + gap);
          const label = day.date ? day.date.slice(5) : ''; // MM-DD
          return (
            <g key={day.date || i}>
              {/* Trackers bar (top, cyan) */}
              <rect x={x} y={chartH - h} width={barW} height={trackerH} rx={3} fill="#22d3ee" opacity={0.7} />
              {/* Ads bar (bottom, red) */}
              <rect x={x} y={chartH - adsH} width={barW} height={adsH} rx={adsH > 2 ? 3 : 0} fill="#ef4444" opacity={0.7} />
              {/* Date label */}
              <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={9} fontFamily="system-ui">{label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} /> Ads
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#22d3ee', display: 'inline-block' }} /> Trackers
        </span>
      </div>
    </div>
  );
}

export default function PrivacySettingsSection({ settings, update }) {
  const [stats, setStats] = useState(() => getStats());
  const [filterVersion, setFilterVersion] = useState(0);
  const [domainInput, setDomainInput] = useState('');
  const [domainShield, setDomainShield] = useState('standard');
  const [savedDomains, setSavedDomains] = useState([]);
  const [updatingFilters, setUpdatingFilters] = useState(false);
  const [history, setHistory] = useState(() => getHistory());

  // Subscribe to privacy service events for live stats
  useEffect(() => {
    const unsub = subscribePrivacy((evt) => {
      setStats(getStats());
      if (evt?.type === 'stats') setHistory(getHistory());
    });
    return unsub;
  }, []);

  // Load saved domain rules for display
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('lithium:privacy:domains') || '{}');
      setSavedDomains(Object.entries(raw).map(([domain, rule]) => ({ domain, shield: rule.shield || 'standard' })));
    } catch { setSavedDomains([]); }
  }, [filterVersion]);

  const handleReset = useCallback(() => {
    resetStats();
    setStats(getStats());
  }, []);

  const handleFilterToggle = useCallback((listId) => {
    toggleFilterList(listId);
    setFilterVersion(v => v + 1);
  }, []);

  const handleAddDomain = useCallback(() => {
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    setDomainShield(domain, domainShield);
    setDomainInput('');
    setFilterVersion(v => v + 1);
  }, [domainInput, domainShield]);

  const handleDomainShieldChange = useCallback((domain, shield) => {
    setDomainShield(domain, shield);
    setFilterVersion(v => v + 1);
  }, []);

  const handleRemoveDomain = useCallback((domain) => {
    try {
      const raw = JSON.parse(localStorage.getItem('lithium:privacy:domains') || '{}');
      delete raw[domain];
      localStorage.setItem('lithium:privacy:domains', JSON.stringify(raw));
    } catch { /* parse error */ }
    setFilterVersion(v => v + 1);
  }, []);

  // Compute total filter rules count
  const totalRules = Object.values(FILTER_LISTS).reduce((sum, list) => {
    return sum + (list.domains?.size || 0) + (list.patterns?.length || 0);
  }, 0);
  const activeRules = Object.values(FILTER_LISTS).filter(l => l.enabled).reduce((sum, list) => {
    return sum + (list.domains?.size || 0) + (list.patterns?.length || 0);
  }, 0);

  return (
    <div>
      {/* Shields */}
      <CardGroup label="Shields">
        <SettingsRow title="Shield level" description="Control how aggressively trackers and ads are blocked">
          <SegmentedControl
            value={settings.privacy?.shieldLevel ?? 'standard'}
            onChange={v => update('privacy.shieldLevel', v)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'standard', label: 'Standard' },
              { value: 'aggressive', label: 'Aggressive' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      {/* Privacy features */}
      <CardGroup label="Privacy features">
        <SettingsRow title="GPC header" description="Send Global Privacy Control signal to websites">
          <EnhancedToggle value={settings.privacy?.gpcEnabled ?? true} onChange={v => update('privacy.gpcEnabled', v)} />
        </SettingsRow>
        <SettingsRow title="Strip tracking params" description="Remove tracking parameters (utm_*, fbclid, gclid…) from URLs">
          <EnhancedToggle value={settings.privacy?.stripTrackingParams ?? true} onChange={v => update('privacy.stripTrackingParams', v)} />
        </SettingsRow>
        <SettingsRow title="Cosmetic filters" description="Hide cookie banners, newsletter popups, and ad containers with CSS">
          <EnhancedToggle value={settings.privacy?.cosmeticFilters ?? true} onChange={v => update('privacy.cosmeticFilters', v)} />
        </SettingsRow>
        <SettingsRow title="Redirect trackers" description="Redirect known tracker requests to a local blocker page instead of blocking silently">
          <EnhancedToggle value={settings.privacy?.redirectTrackers ?? true} onChange={v => update('privacy.redirectTrackers', v)} />
        </SettingsRow>
        <SettingsRow title="Block WebRTC leaks" description="Prevent WebRTC from exposing your local IP address">
          <EnhancedToggle value={settings.privacy?.blockWebRTC ?? false} onChange={v => update('privacy.blockWebRTC', v)} />
        </SettingsRow>
        <SettingsRow title="Block camera/mic prompts" description="Automatically deny camera and microphone access requests">
          <EnhancedToggle value={settings.privacy?.blockCamMic ?? true} onChange={v => update('privacy.blockCamMic', v)} />
        </SettingsRow>
      </CardGroup>

      {/* Filter lists */}
      <CardGroup label={`Filter lists — ${activeRules.toLocaleString()} / ${totalRules.toLocaleString()} active`}>
        {Object.entries(FILTER_LISTS).map(([listId, list]) => (
          <FilterListRow key={listId} listId={listId} list={list} onToggle={handleFilterToggle} />
        ))}
        <SettingsRow
          title="Update filter lists"
          description="Fetch latest domains from remote EasyList sources"
          icon={<Icon name="RefreshCw" size={16} />}
        >
          <button
            onClick={() => {
              setUpdatingFilters(true);
              updateAllFilterLists().finally(() => {
                setUpdatingFilters(false);
                setFilterVersion(v => v + 1);
              });
            }}
            disabled={updatingFilters}
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              background: updatingFilters ? 'rgba(6,182,212,0.05)' : 'rgba(6,182,212,0.1)',
              color: '#06b6d4',
              border: '1px solid rgba(6,182,212,0.2)',
              opacity: updatingFilters ? 0.5 : 1,
            }}
          >
            {updatingFilters ? 'Updating...' : 'Update now'}
          </button>
        </SettingsRow>
      </CardGroup>

      {/* Per-domain shield controls */}
      <CardGroup label="Per-domain shields">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-full px-3 py-1.5 text-xs text-white/80 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            placeholder="e.g. example.com"
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddDomain(); }}
          />
          <select
            className="rounded-full px-3 py-1.5 text-xs text-white/80 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            value={domainShield}
            onChange={e => setDomainShield(e.target.value)}
          >
            <option value="off">Off</option>
            <option value="standard">Standard</option>
            <option value="aggressive">Aggressive</option>
          </select>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={handleAddDomain}>Add</button>
        </div>
        {savedDomains.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {savedDomains.map(({ domain, shield }) => (
              <DomainShieldRow
                key={domain}
                domain={domain}
                shield={shield}
                onChange={handleDomainShieldChange}
                onRemove={handleRemoveDomain}
              />
            ))}
          </div>
        )}
        {savedDomains.length === 0 && (
          <p className="text-[11px] text-white/25 py-1">No per-domain rules configured. Default shield level applies to all sites.</p>
        )}
      </CardGroup>

      {/* Statistics */}
      <CardGroup label="Statistics">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Shield" size={14} color="#22d3ee" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Trackers blocked</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.trackersPrevented.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Ban" size={14} color="#ef4444" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Ads blocked</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.adsBlocked.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Lock" size={14} color="#10b981" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>HTTPS upgrades</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.httpsUpgrades.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="HardDrive" size={14} color="#f59e0b" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Data saved</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{formatBytes(stats.dataSavedBytes)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="FileText" size={14} color="#8b5cf6" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Pages scanned</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.pagesProcessed.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Link" size={14} color="#06b6d4" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Params stripped</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginLeft: 'auto' }}>{stats.paramsStripped.toLocaleString()}</span>
            </div>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={handleReset}>Reset statistics</button>
        </div>
      </CardGroup>

      {/* History graph */}
      {history.length > 1 && (
        <CardGroup label="Last 7 days">
          <PrivacyHistory history={history} />
        </CardGroup>
      )}

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Privacy rules are stored in /System/Privacy/ and can be edited from the Privacy Dashboard app.
        Filter lists update automatically and contain {totalRules.toLocaleString()} rules across {Object.keys(FILTER_LISTS).length} lists.
      </p>
    </div>
  );
}
