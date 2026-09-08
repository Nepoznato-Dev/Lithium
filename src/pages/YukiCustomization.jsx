import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';
import { useSettings } from '../Components/SettingsContext';
import YukisCustomizationSection from './Settings/sections/YukisCustomizationSection';

export default function YukiCustomization() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useSettings();

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-[#0b0b12] to-slate-950 p-6">
      {/* Ambient glow */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="mx-auto max-w-4xl">
        {/* Back button and header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-6"
          >
            <Icon name="ArrowLeft" className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">Better Customization</h1>
          <p className="text-white/50">Landing pad for all of Yuki's customization features</p>
        </div>

        <YukisCustomizationSection settings={settings} update={updateSetting} />

        {/* Info Box */}
        <div className="mt-12 rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Icon name="Info" className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">About Customization</h3>
              <p className="text-sm text-white/60">
                These customization options will help you tailor Lithium to your preferences. Settings are saved locally and persist across sessions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
