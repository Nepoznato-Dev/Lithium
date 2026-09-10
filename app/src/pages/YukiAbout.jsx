import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Components/Icon';

export default function YukiAbout() {
  const navigate = useNavigate();

  const features = [
    {
      icon: 'Palette',
      title: 'Personalization',
      description: 'Customize every aspect of your Lithium experience',
    },
    {
      icon: 'Sparkles',
      title: 'Themes',
      description: 'Beautiful pre-made themes and custom options',
    },
    {
      icon: 'Zap',
      title: 'Performance',
      description: 'Optimized for speed with no compromise on features',
    },
    {
      icon: 'ShieldCheck',
      title: 'Privacy',
      description: 'All data stays on your device, always',
    },
  ];

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
        </div>

        {/* About Hero */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              <Icon name="Sparkles" className="h-10 w-10" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">About Yuki's Stuff</h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Your personal customization hub for Lithium. Make it yours.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white/5 p-6 backdrop-blur-xl border border-white/10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-purple-400 mb-4">
                <Icon name={feature.icon} className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-white/50">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4">What is Yuki's Stuff?</h2>
            <p className="text-white/60 leading-relaxed mb-4">
              Yuki's Stuff is a comprehensive customization platform built into Lithium. It provides you with tools to personalize your digital workspace, adjust settings to your liking, and explore beautiful themes designed specifically for Lithium.
            </p>
            <p className="text-white/60 leading-relaxed">
              Everything you create or customize is stored locally on your device. Your privacy is paramount, and we ensure that all your personal settings remain under your control.
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-xl border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4">Version & Credits</h2>
            <div className="space-y-3 text-sm text-white/60">
              <div className="flex justify-between">
                <span>Yuki's Stuff</span>
                <span className="text-white/40">v1.0</span>
              </div>
              <div className="flex justify-between">
                <span>Lithium</span>
                <span className="text-white/40">Lightweight Web Desktop</span>
              </div>
              <div className="flex justify-between">
                <span>Made with</span>
                <span className="text-white/40">React · Tailwind · Preact</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <button
            onClick={() => navigate('/yuki')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-semibold text-white transition-transform hover:scale-105"
          >
            <Icon name="Home" className="h-5 w-5" />
            Back to Yuki's Stuff
          </button>
        </div>
      </div>
    </div>
  );
}
