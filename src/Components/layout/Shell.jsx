import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from '../Icon';
import AmbientBackground from './AmbientBackground';
import { useSettings } from '../SettingsContext';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'Home', end: true },
  { to: '/games', label: 'Games', icon: 'Gamepad2' },
  { to: '/music', label: 'Music', icon: 'Music' },
  { to: '/browser', label: 'Browser', icon: 'Globe' },
  { to: '/calculator', label: 'Calculator', icon: 'Calculator' },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="brand-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-slate-950">
        Li
      </span>
      <div className="leading-tight">
        <strong className="block text-white">Lithium</strong>
        <small className="text-xs text-white/40">Play · Listen · Browse</small>
      </div>
    </div>
  );
}

/** Core app shell: sidebar on desktop, bottom nav on mobile. */
export default function Shell() {
  const { settings } = useSettings();
  const location = useLocation();
  const lowEndMode = settings.performance.lowEndMode;
  const isDesktopHome = location.pathname === '/';

  if (isDesktopHome) {
    return <main className="relative min-h-screen"><Outlet /></main>;
  }

  return (
    <div className="relative min-h-screen">
      {!lowEndMode && <AmbientBackground />}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/[0.06] bg-[#0b0b12]/90 p-5 backdrop-blur-xl md:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1.5">
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'nav-active' : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} className="h-[18px] w-[18px]" />
                  {label}
                  {isActive && <span className="nav-dot ml-auto h-1.5 w-1.5 rounded-full" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'nav-active' : 'text-white/55 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon name="Settings" className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
          <NavLink
            to="/privacy"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/35 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            <Icon name="ShieldCheck" className="h-3.5 w-3.5" />
            Privacy-first · local data only
          </NavLink>
        </div>
      </aside>

      {/* Mobile top brand */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-[#0b0b12]/90 px-4 py-3 backdrop-blur-xl md:hidden">
        <Brand />
      </header>

      {/* Page content */}
      <main className="relative z-10 min-h-screen pb-20 md:ml-60 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-white/[0.06] bg-[#0b0b12]/95 px-2 py-1.5 backdrop-blur-xl md:hidden">
        {[...NAV_ITEMS, { to: '/settings', label: 'Settings', icon: 'Settings' }].map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? 'nav-active' : 'text-white/45'
              }`
            }
          >
            <Icon name={icon} className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
