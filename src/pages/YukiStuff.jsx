import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';

export default function YukiStuff() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const menuItems = [
    {
      id: 'customization',
      label: 'Better Customization',
      icon: 'Palette',
      description: 'Landing pad for Yuki&apos;s better customization features',
      onClick: () => navigate('/yuki/customization'),
    },
    {
      id: 'settings',
      label: 'Yuki Settings',
      icon: 'Settings',
      description: 'Personalize your Yuki experience',
      onClick: () => navigate('/yuki/settings'),
    },
    {
      id: 'themes',
      label: 'Themes',
      icon: 'Sparkles',
      description: 'Browse and apply custom themes',
      onClick: () => navigate('/yuki/themes'),
    },
    {
      id: 'about',
      label: 'About Yuki\'s Stuff',
      icon: 'Info',
      description: 'Learn more about Yuki\'s features',
      onClick: () => navigate('/yuki/about'),
    },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-[#0b0b12] to-slate-950 p-6">
      {/* Ambient glow */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              <Icon name="Sparkles" className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Yuki&apos;s Stuff</h1>
              <p className="text-sm text-white/50 mt-1">All your personalization in one place</p>
            </div>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className="group relative overflow-hidden rounded-2xl bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-purple-500/20 border border-white/10 hover:border-white/20 text-left"
            >
              {/* Background gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>

              <div className="relative flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-purple-400 group-hover:bg-white/20 group-hover:text-purple-300 transition-all">
                  <Icon name={item.icon} className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-white/95 transition-colors">
                    {item.label}
                  </h3>
                  <p className="mt-1 text-sm text-white/40 group-hover:text-white/50 transition-colors">
                    {item.description}
                  </p>
                </div>
                <Icon name="ArrowRight" className="h-5 w-5 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all mt-0.5" />
              </div>
            </button>
          ))}
        </div>

        {/* Info section */}
        <div className="mt-12 rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
          <h2 className="text-lg font-semibold text-white mb-4">Welcome to Yuki&apos;s Stuff</h2>
          <p className="text-sm text-white/60 leading-relaxed mb-4">
            Yuki&apos;s Stuff is your personal customization hub for Lithium. Here you can personalize your experience, explore themes, adjust settings, and make Lithium truly yours.
          </p>
          <p className="text-sm text-white/50">
            Start with <span className="font-medium text-white/70">Better Customization</span> to explore all available options.
          </p>
        </div>
      </div>
    </div>
  );
}
