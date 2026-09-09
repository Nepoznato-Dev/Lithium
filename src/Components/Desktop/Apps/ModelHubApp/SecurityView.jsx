import { useState } from 'react';
import Icon from '../../../Icon';
import { storage } from '../../../../lib/storage';

const SCAN_TIERS = [
  {
    id: 'l1',
    label: 'L1 Static Check',
    icon: 'FileText',
    description: 'Fast pattern-based scanning for common security issues, hardcoded secrets, and known vulnerable patterns',
    features: ['Regex-based pattern matching', 'Secret detection (API keys, tokens)', 'Dependency vulnerability check', 'Instant results (< 1s)'],
    defaultEnabled: false,
  },
  {
    id: 'l2',
    label: 'L2 Lightweight Scan',
    icon: 'Search',
    description: 'AST-level analysis for logic flaws, injection vulnerabilities, and unsafe data flows',
    features: ['Abstract syntax tree analysis', 'Taint tracking', 'SQL/NoSQL injection detection', 'XSS vulnerability scanning', 'Moderate execution time (2-5s)'],
    defaultEnabled: false,
  },
  {
    id: 'l3',
    label: 'L3 Deep Scan',
    icon: 'Shield',
    description: 'Comprehensive semantic analysis with data flow tracking, cross-file analysis, and advanced threat detection',
    features: ['Full data flow analysis', 'Cross-file vulnerability detection', 'Business logic flaw detection', 'Advanced threat modeling', 'Comprehensive report generation', 'Longest execution time (10-30s)'],
    defaultEnabled: false,
  },
];

export default function SecurityView() {
  const [tiers, setTiers] = useState(() => ({
    l1: storage.get('security-l1-enabled', false),
    l2: storage.get('security-l2-enabled', false),
    l3: storage.get('security-l3-enabled', false),
  }));
  const [lastScan, setLastScan] = useState(null);
  const [scanning, setScanning] = useState(false);

  const toggleTier = (id) => {
    const next = { ...tiers, [id]: !tiers[id] };
    setTiers(next);
    storage.set(`security-${id}-enabled`, next[id]);
  };

  const runScan = async () => {
    setScanning(true);
    const enabledTiers = SCAN_TIERS.filter(t => tiers[t.id]);
    if (enabledTiers.length === 0) {
      window.dispatchEvent(new CustomEvent('lithium:notify', { detail: { title: 'No scan tiers enabled', body: 'Enable at least one scan tier to run a security scan', type: 'warning' } }));
      setScanning(false);
      return;
    }
    // Simulate scan
    await new Promise(resolve => setTimeout(resolve, 2000));
    const findings = Math.floor(Math.random() * 5);
    setLastScan({ timestamp: Date.now(), findings, tiers: enabledTiers.map(t => t.id) });
    setScanning(false);
    window.dispatchEvent(new CustomEvent('lithium:notify', { detail: { title: 'Security scan complete', body: `Found ${findings} potential issue${findings !== 1 ? 's' : ''}`, type: findings > 0 ? 'warning' : 'success' } }));
  };

  const enabledCount = Object.values(tiers).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ borderColor: '#e8e4dd' }}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg text-[#4a9e6d]" style={{ background: '#eef7f1' }}>
            <Icon name="Shield" size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#2d2d2d]">Security</h2>
            <p className="text-[12px] text-[#9e9890]">{enabledCount} scan tier{enabledCount !== 1 ? 's' : ''} enabled</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Scan tiers */}
        <div className="space-y-4">
          {SCAN_TIERS.map(tier => {
            const enabled = tiers[tier.id];
            return (
              <div key={tier.id} className="rounded-xl border bg-white transition-colors" style={{ borderColor: enabled ? '#8cc5a2' : '#e8e4dd' }}>
                <div className="flex items-start gap-4 p-4">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${
                    enabled ? 'bg-[#eef7f1] text-[#4a9e6d]' : 'bg-[#eae6df] text-[#6b6560]'
                  }`}>
                    <Icon name={tier.icon} size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[14px] font-semibold text-[#2d2d2d]">{tier.label}</h3>
                      {enabled && (
                        <span className="rounded bg-[#eef7f1] px-2 py-0.5 text-[10px] font-medium text-[#4a9e6d]">Enabled</span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#6b6560]">{tier.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tier.features.map((feat, i) => (
                        <span key={i} className="rounded-md bg-[#eae6df] px-2 py-1 text-[10px] text-[#6b6560]">{feat}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTier(tier.id)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      enabled ? 'bg-[#4a9e6d]' : 'bg-[#ddd9d2]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      enabled ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Run scan button */}
        <div className="mt-6">
          <button
            onClick={runScan}
            disabled={scanning || enabledCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4a9e6d] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#3d8a5e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? (
              <>
                <Icon name="Loader2" size={14} className="animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Icon name="Play" size={14} />
                Run Security Scan
              </>
            )}
          </button>
        </div>

        {/* Last scan results */}
        {lastScan && (
          <div className="mt-6 rounded-xl border bg-[#faf8f5] p-4" style={{ borderColor: '#e8e4dd' }}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[#2d2d2d]">Last Scan Results</h4>
              <span className="text-[11px] text-[#9e9890]">
                {new Date(lastScan.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-lg ${
                lastScan.findings > 0 ? 'bg-amber-50 text-amber-600' : 'bg-[#eef7f1] text-[#4a9e6d]'
              }`}>
                <Icon name={lastScan.findings > 0 ? 'AlertTriangle' : 'CheckCircle'} size={18} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[#2d2d2d]">
                  {lastScan.findings} issue{lastScan.findings !== 1 ? 's' : ''} found
                </p>
                <p className="text-[11px] text-[#9e9890]">
                  Scanned with: {lastScan.tiers.map(t => t.toUpperCase()).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="mt-6 rounded-xl border bg-[#eef4ff] p-4" style={{ borderColor: '#c5d8f5' }}>
          <div className="flex gap-3">
            <Icon name="Info" size={16} className="shrink-0 text-blue-500" />
            <div>
              <p className="text-[12px] font-medium text-blue-900">About Security Scanning</p>
              <p className="mt-1 text-[11px] leading-relaxed text-blue-700">
                Enable multiple scan tiers for comprehensive coverage. L1 provides fast pattern matching, L2 adds AST-level analysis, and L3 performs deep semantic analysis. Higher tiers take longer but catch more sophisticated vulnerabilities.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
