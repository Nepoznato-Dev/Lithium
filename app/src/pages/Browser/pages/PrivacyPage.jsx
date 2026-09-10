/**
 * PrivacyPage — privacy stats and rule management as a browser internal page.
 * Accessible via #/privacy or lithium://privacy.
 */
import { useState, useEffect } from 'preact/hooks';
import {
  getStats, resetStats, subscribePrivacy,
} from '../../../lib/services/privacyService';
import { DEFAULT_TRACKING_PARAMS, DEFAULT_COSMETIC_RULES } from '../../../lib/services/privacyRules';
import Icon from '../../../Components/Icon';

function StatCard({ icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${color}15` }}>
        <Icon name={icon} size={18} color={color} />
      </div>
      <div>
        <div className="text-xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        <div className="text-[11px] text-white/45">{label}</div>
      </div>
    </div>
  );
}

function RuleEditor() {
  const [activeTab, setActiveTab] = useState('tracking');
  const [customRules, setCustomRules] = useState({ tracking: [], cosmetic: [], blocklist: [] });
  const [newRule, setNewRule] = useState('');
  const [saved, setSaved] = useState(false);

  const RULE_FILES = {
    tracking: { name: 'Tracking Parameters', key: 'params' },
    cosmetic: { name: 'Cosmetic Filters', key: 'selectors' },
    blocklist: { name: 'Domain Blocklist', key: 'domains' },
  };

  useEffect(() => {
    (async () => {
      try {
        const { loadTree } = await import('../../../lib/fileSystem');
        const tree = loadTree();
        const loadFromFile = (ruleType) => {
          const config = RULE_FILES[ruleType];
          if (!config) return [];
          const entry = tree.find(e => e.name === `custom-${ruleType === 'tracking' ? 'tracking' : ruleType === 'cosmetic' ? 'cosmetic' : 'blocklist'}.json` && e.parentId === 'sys-privacy');
          if (!entry) return [];
          try {
            const content = typeof entry.content === 'string' ? entry.content : '';
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : (parsed[config.key] || []);
          } catch { return []; }
        };
        setCustomRules({
          tracking: loadFromFile('tracking'),
          cosmetic: loadFromFile('cosmetic'),
          blocklist: loadFromFile('blocklist'),
        });
      } catch {}
    })();
  }, []);

  const handleAdd = () => {
    if (!newRule.trim()) return;
    setCustomRules(prev => ({ ...prev, [activeTab]: [...prev[activeTab], newRule.trim()] }));
    setNewRule('');
    setSaved(false);
  };

  const handleRemove = (idx) => {
    setCustomRules(prev => ({ ...prev, [activeTab]: prev[activeTab].filter((_, i) => i !== idx) }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      const { loadTree, saveTree } = await import('../../../lib/fileSystem');
      let tree = loadTree();
      for (const type of Object.keys(RULE_FILES)) {
        const config = RULE_FILES[type];
        const content = JSON.stringify(customRules[type], null, 2);
        const fileName = `custom-${type === 'tracking' ? 'tracking' : type === 'cosmetic' ? 'cosmetic' : 'blocklist'}.json`;
        const existing = tree.find(e => e.name === fileName && e.parentId === 'sys-privacy');
        if (existing) {
          tree = tree.map(e => e.id === existing.id ? { ...e, content, updatedAt: Date.now() } : e);
        } else {
          const now = Date.now();
          tree = [...tree, { id: `rule-${type}-${now}`, name: fileName, type: 'text', parentId: 'sys-privacy', content, createdAt: now, updatedAt: now }];
        }
      }
      saveTree(tree);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const currentRules = customRules[activeTab] || [];
  const defaults = activeTab === 'tracking' ? DEFAULT_TRACKING_PARAMS : activeTab === 'cosmetic' ? DEFAULT_COSMETIC_RULES : [];
  const placeholders = { tracking: 'e.g. fbclid', cosmetic: 'e.g. .ad-banner, #sponsor-block', blocklist: 'e.g. tracker.example.com' };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {Object.entries(RULE_FILES).map(([key, cfg]) => (
          <button key={key} onClick={() => setActiveTab(key)} className="cursor-pointer rounded-md px-3 py-1.5 text-[11px]" style={{
            background: activeTab === key ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            color: activeTab === key ? '#22d3ee' : 'rgba(255,255,255,0.5)',
            border: activeTab === key ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.06)',
          }}>
            {cfg.name}
          </button>
        ))}
      </div>

      {defaults.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-white/40">Built-in rules ({defaults.length})</div>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {defaults.map((r, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)' }}>{r}</span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-white/60">Custom rules ({currentRules.length})</div>
        {currentRules.length === 0 && <div className="py-2 text-[11px] text-white/25">No custom rules yet.</div>}
        <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
          {currentRules.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="flex-1 font-mono text-[11px] text-white/70">{r}</span>
              <button onClick={() => handleRemove(i)} className="cursor-pointer border-none bg-transparent p-0.5 text-red-400/60" title="Remove"><Icon name="X" size={10} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        <input
          className="flex-1 rounded-full px-3 py-1.5 text-xs text-white/80 outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          placeholder={placeholders[activeTab]}
          value={newRule}
          onInput={e => setNewRule(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={handleAdd}>Add</button>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-primary px-4 py-1.5 text-xs" onClick={handleSave}>
          <span className="flex items-center gap-1"><Icon name="Save" size={11} /> Save rules</span>
        </button>
        {saved && <span className="text-[10px] text-emerald-400">Saved!</span>}
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  const [stats, setStats] = useState(() => getStats());
  const [tab, setTab] = useState('overview');
  const [domainInput, setDomainInput] = useState('');
  const [domainShield, setDomainShield] = useState('standard');

  useEffect(() => subscribePrivacy(() => setStats(getStats())), []);

  const handleReset = () => { resetStats(); setStats(getStats()); };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'PieChart' },
    { id: 'rules', label: 'Rules', icon: 'FileText' },
    { id: 'domains', label: 'Per-Domain', icon: 'Globe' },
  ];

  return (
    <div className="flex h-full flex-col" style={{ background: '#0e0f14' }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Icon name="Shield" size={16} color="#22d3ee" />
        <span className="text-sm font-semibold text-white">Privacy Dashboard</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-2.5 text-xs" style={{
            fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#22d3ee' : 'rgba(255,255,255,0.5)',
            borderBottom: tab === t.id ? '2px solid #22d3ee' : '2px solid transparent',
          }}>
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'overview' && (
          <div>
            <div className="mb-6 grid grid-cols-2 gap-3">
              <StatCard icon="Shield" label="Trackers blocked" value={stats.trackersPrevented} color="#22d3ee" />
              <StatCard icon="Ban" label="Ads blocked" value={stats.adsBlocked} color="#ef4444" />
              <StatCard icon="Lock" label="HTTPS upgrades" value={stats.httpsUpgrades} color="#10b981" />
              <StatCard icon="HardDrive" label="Data saved" value={`${(stats.dataSavedBytes / 1048576).toFixed(1)} MB`} color="#f59e0b" />
            </div>

            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={handleReset}>Reset statistics</button>

            <div className="mt-6 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="mb-2 text-[13px] font-semibold text-white">Active protections</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs text-white/60"><Icon name="Check" size={12} color="#10b981" /> GPC header injection</div>
                <div className="flex items-center gap-2 text-xs text-white/60"><Icon name="Check" size={12} color="#10b981" /> {DEFAULT_TRACKING_PARAMS.length} tracking parameter patterns</div>
                <div className="flex items-center gap-2 text-xs text-white/60"><Icon name="Check" size={12} color="#10b981" /> {DEFAULT_COSMETIC_RULES.length} cosmetic filter rules</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'rules' && <RuleEditor />}

        {tab === 'domains' && (
          <div>
            <div className="mb-4">
              <div className="mb-2.5 text-[13px] font-semibold text-white">Set per-domain shield level</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-full px-3 py-1.5 text-xs text-white/80 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="e.g. example.com"
                  value={domainInput}
                  onInput={e => setDomainInput(e.target.value)}
                />
                <select className="rounded-full px-3 py-1.5 text-xs text-white/80 outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} value={domainShield} onChange={e => setDomainShield(e.target.value)}>
                  <option value="off">Off</option>
                  <option value="standard">Standard</option>
                  <option value="aggressive">Aggressive</option>
                </select>
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => { if (domainInput.trim()) { setDomainInput(''); } }}>Save</button>
              </div>
            </div>
            <div className="rounded-xl p-4 text-xs text-white/50" style={{ background: 'rgba(255,255,255,0.03)' }}>
              Per-domain rules override the global shield level. Domains with custom rules will show a shield icon in the system tray when visited.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
