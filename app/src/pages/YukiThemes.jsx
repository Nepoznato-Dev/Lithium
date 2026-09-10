import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';

export default function YukiThemes() {
  const navigate = useNavigate();

  const themes = [
    {
      id: 'dark',
      name: 'Dark Mode',
      description: 'Classic dark theme with purple accents',
      colors: ['bg-slate-900', 'bg-purple-600'],
      active: true,
    },
    {
      id: 'midnight',
      name: 'Midnight',
      description: 'Deep dark with cool tones',
      colors: ['bg-slate-950', 'bg-blue-600'],
    },
    {
      id: 'cherry',
      name: 'Cherry',
      description: 'Warm tones with pink accents',
      colors: ['bg-red-950', 'bg-pink-500'],
    },
    {
      id: 'forest',
      name: 'Forest',
      description: 'Natural greens and earthy tones',
      colors: ['bg-green-950', 'bg-emerald-600'],
    },
  ];

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
          <h1 className="text-4xl font-bold text-white mb-2">Themes</h1>
          <p className="text-white/50">Browse and apply custom themes</p>
        </div>

        {/* Themes Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 border-2 ${
                theme.active
                  ? 'border-purple-500 bg-white/10 shadow-lg shadow-purple-500/20'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {/* Theme preview */}
              <div className="flex gap-2 mb-4">
                {theme.colors.map((color, idx) => (
                  <div key={idx} className={`flex-1 h-12 rounded-lg ${color}`} />
                ))}
              </div>

              <h3 className="text-lg font-semibold text-white mb-1 text-left">
                {theme.name}
              </h3>
              <p className="text-sm text-white/50 text-left mb-4">
                {theme.description}
              </p>

              {theme.active && (
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                  <Icon name="Check" className="h-4 w-4" />
                  Active
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Info */}
        <div className="mt-12 rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
          <p className="text-white/60 text-sm">
            Theme customization is currently in development. More themes and customization options coming soon!
          </p>
        </div>
      </div>
    </div>
  );
}
