import { useState } from 'react';
import Icon from '../../../Icon';

const ACCENTS = [
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'violet', label: 'Violet', value: '#8b5cf6' },
  { id: 'rose', label: 'Rose', value: '#e11d48' },
  { id: 'amber', label: 'Amber', value: '#d97706' },
];

export default function CortexSettingsView({ appearance, onChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const setMode = mode => onChange({ ...appearance, mode });
  const setAccent = accent => onChange({ ...appearance, accent });

  return (
    <section className="flex flex-1 flex-col overflow-y-auto bg-white p-5 sm:p-7">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-7 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center border border-[#e0dcd5] bg-[#eae6df] text-[#4b5563]"><Icon name="Settings2" size={19} /></span>
          <div><h1 className="text-base font-semibold text-[#2d2d2d]">Cortex settings</h1><p className="mt-1 text-xs text-[#6b7280]">Choose the workspace appearance and keep it on this device.</p></div>
        </header>

        <div className="border border-[#e8e4dd] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#2d2d2d]">Appearance</h2>
          <p className="mt-1 text-xs text-[#6b7280]">Cortex can follow your device or use its own appearance.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { id: 'light', label: 'Light', icon: 'Sun' },
              { id: 'dark', label: 'Dark', icon: 'Moon' },
              { id: 'system', label: 'System', icon: 'Monitor' },
            ].map(option => (
              <button key={option.id} onClick={() => setMode(option.id)} className={`flex min-h-20 flex-col items-center justify-center gap-2 border text-xs font-semibold transition-colors ${appearance.mode === option.id ? 'border-[var(--cortex-accent)] bg-[#eae6df] text-[#2d2d2d]' : 'border-[#e8e4dd] text-[#6b7280] hover:bg-[#faf8f5]'}`}>
                <Icon name={option.icon} size={17} />
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-[#e8e4dd] pt-5">
            <h2 className="text-sm font-semibold text-[#2d2d2d]">Accent</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACCENTS.map(accent => <button key={accent.id} title={accent.label} onClick={() => setAccent(accent.value)} className={`grid h-9 w-9 place-items-center border ${appearance.accent === accent.value ? 'border-[#111827]' : 'border-[#e0dcd5]'}`} style={{ background: accent.value }} aria-label={`${accent.label} accent`}>{appearance.accent === accent.value && <Icon name="Check" size={15} className="text-white" />}</button>)}
            </div>
          </div>
        </div>

        <div className="mt-4 border border-[#e8e4dd] bg-white">
          <button className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-[#2d2d2d]" onClick={() => setShowAdvanced(value => !value)}>Workspace behavior <Icon name="ChevronDown" size={16} className={showAdvanced ? 'rotate-180' : ''} /></button>
          {showAdvanced && <div className="border-t border-[#e8e4dd] px-5 py-4 text-xs leading-relaxed text-[#6b7280]">Appearance settings are saved locally and only change the Cortex workspace.</div>}
        </div>
      </div>
    </section>
  );
}
