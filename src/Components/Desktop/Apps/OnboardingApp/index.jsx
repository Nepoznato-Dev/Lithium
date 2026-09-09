import React, { useState } from 'react';
import Icon from '../../../Icon';
import { SEARCH_ENGINES } from '../../../../lib/settings';
import { storage } from '../../../../lib/storage';

const STEPS = ['welcome', 'theme', 'search', 'tour', 'complete'];

const TOUR_ITEMS = [
  { icon: 'BrainCircuit', title: 'AI Assistant', desc: 'Chat with AI models, manage conversations, and inject context from any app.' },
  { icon: 'Shield', title: 'Privacy Dashboard', desc: 'View tracking stats, manage blocklists, and configure per-domain shields.' },
  { icon: 'BookOpen', title: 'Reader', desc: 'Load any article URL for a clean, distraction-free reading experience.' },
  { icon: 'Search', title: 'Search Engines', desc: 'Add custom search engines with keyword shortcuts in Settings.' },
  { icon: 'Users', title: 'Profiles', desc: 'Create separate user profiles with isolated data and settings.' },
  { icon: 'HardDrive', title: 'Storage Manager', desc: 'Visualize storage usage and manage data with granular controls.' },
];

export default function OnboardingApp({ onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const next = () => setStepIdx(i => Math.min(i + 1, STEPS.length - 1));
  const prev = () => setStepIdx(i => Math.max(i - 1, 0));

  const finish = () => {
    storage.set('lithium:onboarding-done', true);
    if (onComplete) onComplete();
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #0e0f14 0%, #1a1025 100%)', color: '#fff' }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, padding: '20px 32px 0' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stepIdx ? '#22d3ee' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {step === 'welcome' && (
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Icon name="Sparkles" size={36} color="#22d3ee" />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Welcome to Lithium</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              Your privacy-first desktop OS in a browser tab. Let&apos;s set up a few things to get you started.
            </p>
          </div>
        )}

        {step === 'theme' && (
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <Icon name="Palette" size={36} color="#a78bfa" />
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: '16px 0 12px' }}>Choose your theme</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>You can change this anytime in Settings → Appearance.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {[
                { label: 'Dark', bg: '#1a1a1e', fg: '#e0e0e0' },
                { label: 'Light', bg: '#fafafa', fg: '#1a1a1a' },
              ].map(t => (
                <button key={t.label} style={{
                  width: 120, padding: 20, borderRadius: 12, border: '2px solid rgba(255,255,255,0.1)',
                  background: t.bg, color: t.fg, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'search' && (
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <Icon name="Search" size={36} color="#22d3ee" />
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: '16px 0 12px' }}>Pick a search engine</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Your default engine for address bar and Start menu searches.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(SEARCH_ENGINES).map(([key, eng]) => (
                <button key={key} style={{
                  padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)', color: '#fff', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Icon name="Globe" size={14} color="#22d3ee" />
                  <span style={{ fontSize: 13 }}>{eng.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'tour' && (
          <div style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>What&apos;s new</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {TOUR_ITEMS.map(item => (
                <div key={item.title} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Icon name={item.icon} size={18} color="#22d3ee" />
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.4 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Icon name="Check" size={36} color="#10b981" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>You&apos;re all set!</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              Lithium is ready. Explore the desktop, open apps, and customize everything in Settings.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '20px 32px 32px' }}>
        {stepIdx > 0 && (
          <button className="btn-ghost px-6 py-2 text-sm" onClick={prev}>Back</button>
        )}
        {stepIdx < STEPS.length - 1 ? (
          <button className="btn-primary px-6 py-2 text-sm" onClick={next}>Continue</button>
        ) : (
          <button className="btn-primary px-8 py-2 text-sm" onClick={finish}>Get Started</button>
        )}
      </div>
    </div>
  );
}
