import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';

export default function YukiSettings() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-[#0b0b12] to-slate-950 p-6">
      {/* Ambient glow */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="mx-auto max-w-3xl">
        {/* Back button and header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-6"
          >
            <Icon name="ArrowLeft" className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">Yuki Settings</h1>
          <p className="text-white/50">Personalize your Yuki experience</p>
        </div>

        {/* Settings sections */}
        <div className="space-y-6">
          {/* General Section */}
          <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-white mb-6">
              <Icon name="Settings" className="h-5 w-5 text-purple-400" />
              General
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-4">
                <div>
                  <p className="font-medium text-white">Enable Animations</p>
                  <p className="text-sm text-white/50">Smooth transitions and motion effects</p>
                </div>
                <input type="checkbox" className="h-5 w-5" defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-4">
                <div>
                  <p className="font-medium text-white">Dark Mode</p>
                  <p className="text-sm text-white/50">Always use dark theme</p>
                </div>
                <input type="checkbox" className="h-5 w-5" defaultChecked />
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-white mb-6">
              <Icon name="Palette" className="h-5 w-5 text-purple-400" />
              Appearance
            </h2>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-white mb-3">Accent Color</p>
                <div className="flex gap-3">
                  {['purple', 'pink', 'blue', 'green'].map((color) => (
                    <button
                      key={color}
                      className={`h-8 w-8 rounded-lg transition-transform hover:scale-110 ${
                        color === 'purple'
                          ? 'bg-purple-500 ring-2 ring-white'
                          : color === 'pink'
                          ? 'bg-pink-500'
                          : color === 'blue'
                          ? 'bg-blue-500'
                          : 'bg-green-500'
                      }`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-white mb-6">
              <Icon name="Info" className="h-5 w-5 text-purple-400" />
              About
            </h2>
            <div className="space-y-2 text-sm text-white/60">
              <p>Yuki&apos;s Stuff - Personal Customization Hub</p>
              <p>Part of Lithium - A lightweight web desktop</p>
              <p className="text-white/40 text-xs mt-4">Created for a personalized experience</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
