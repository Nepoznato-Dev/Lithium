import { useInstallPrompt, isInstalled } from '../lib/pwa/installPrompt';
import Icon from './Icon';

/**
 * Non-intrusive bottom banner that appears when the app is installable
 * as a PWA. Hides after install or dismissal.
 */
export default function PwaInstallBanner() {
  const { state, promptInstall, dismiss } = useInstallPrompt();

  // Don't render if already installed, dismissed, or not yet available.
  if (state !== 'available') return null;
  // Already running as a PWA — never show.
  if (isInstalled()) return null;

  const handleInstall = async () => {
    await promptInstall();
  };

  return (
    <div
      className="mx-install-banner fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      style={{ animation: 'settings-card-in 0.35s ease' }}
    >
      <div
        className="relative flex items-center gap-3 rounded-2xl px-4 py-3 pr-9 shadow-2xl backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--background) 85%, rgba(255,255,255,0.06))',
          border: '1px solid color-mix(in srgb, var(--accent) 15%, rgba(255,255,255,0.08))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <img
          src="/pwa-icon-192.png"
          alt=""
          className="h-9 w-9 rounded-xl"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">Install Lithium</span>
          <span className="text-[11px] text-white/40">Use offline, access local files</span>
        </div>
        <button
          className="ml-2 rounded-xl px-4 py-1.5 text-xs font-semibold text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
          style={{
            background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #7c3aed))',
            boxShadow: '0 2px 12px color-mix(in srgb, var(--accent) 30%, transparent)',
          }}
          onClick={handleInstall}
        >
          Install
        </button>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          title="Dismiss"
          onClick={dismiss}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white active:scale-90"
        >
          <Icon name="X" size={13} />
        </button>
      </div>
    </div>
  );
}
