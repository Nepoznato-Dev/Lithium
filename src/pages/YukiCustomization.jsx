import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';

export default function YukiCustomization() {
  const navigate = useNavigate();

  const customizationOptions = [
    {
      id: 'colors',
      label: 'Color Customization',
      icon: 'Palette',
      description: 'Customize accent colors and theme',
    },
    {
      id: 'layout',
      label: 'Layout Options',
      icon: 'Layout',
      description: 'Adjust sidebar and content layout',
    },
    {
      id: 'density',
      label: 'UI Density',
      icon: 'Scaling',
      description: 'Control spacing and element sizes',
    },
    {
      id: 'animations',
      label: 'Motion & Animations',
      icon: 'Zap',
      description: 'Toggle and customize animations',
    },
    {
      id: 'backgrounds',
      label: 'Backgrounds',
      icon: 'Image',
      description: 'Customize ambient backgrounds',
    },
    {
      id: 'fonts',
      label: 'Typography',
      icon: 'Type',
      description: 'Adjust fonts and text sizes',
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
          <h1 className="text-4xl font-bold text-white mb-2">Better Customization</h1>
          <p className="text-white/50">Landing pad for all of Yuki's customization features</p>
        </div>

        {/* Customization Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customizationOptions.map((option) => (
            <div
              key={option.id}
              className="group relative overflow-hidden rounded-2xl bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:bg-white/10 border border-white/10 hover:border-white/20 cursor-pointer"
            >
              {/* Background gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>

              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-purple-400 group-hover:bg-white/20 group-hover:text-purple-300 transition-all mb-4">
                  <Icon name={option.icon} className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-white group-hover:text-white/95 transition-colors">
                  {option.label}
                </h3>
                <p className="mt-2 text-sm text-white/40 group-hover:text-white/50 transition-colors">
                  {option.description}
                </p>
              </div>

              {/* Coming soon badge */}
              <div className="absolute top-3 right-3 rounded-full bg-white/10 px-3 py-1 text-xs text-white/50">
                Coming soon
              </div>
            </div>
          ))}
        </div>

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
