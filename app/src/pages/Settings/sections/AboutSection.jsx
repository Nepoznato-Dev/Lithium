import { BUILD_VERSION } from '../../../lib/settings';
import Icon from '../../../Components/Icon';
import { CardGroup } from '../controls';

export default function AboutSection() {
  const features = [
    { icon: 'Monitor', text: 'Full desktop shell with taskbar, start menu, context menus & lock screen' },
    { icon: 'Folder', text: 'File Manager with virtual filesystem & OPFS-backed blob storage' },
    { icon: 'Image', text: 'Photos gallery with slideshow, zoom & drag-and-drop import' },
    { icon: 'Calendar', text: 'Calendar & Clock with monthly view, todos & reminders' },
    { icon: 'FileText', text: 'Markdown Notes editor with folder organization & live preview' },
    { icon: 'BrainCircuit', text: 'On-device AI via Wllama — GGUF models run entirely in the browser' },
    { icon: 'Gamepad2', text: 'Games library with local clones + 226 HTML games' },
    { icon: 'Music', text: 'Music player with Spotify, YouTube Music, SoundCloud & local files' },
    { icon: 'Globe', text: 'Tabbed browser with search, history & bookmarks' },
    { icon: 'Download', text: 'Downloader for web pages, GGUF models & arbitrary files' },
  ];

  return (
    <div>
      <CardGroup label="Lithium">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>
              <Icon name="Cpu" className="h-6 w-6" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="text-base font-semibold text-white">Lithium {BUILD_VERSION}</div>
              <div className="text-xs text-white/40">Offline-first web desktop</div>
            </div>
          </div>
          <p className="text-[13px] text-white/55 leading-relaxed">
            A lightweight, offline-first web desktop and workspace for games, music, browsing, files, AI, and quick tools.
            Built on <strong className="text-white/70">Preact</strong> for a tiny bundle (~72 kB gzipped).
            All data stays on this device — no trackers, no servers.
          </p>
        </div>
      </CardGroup>

      <CardGroup label="What's Inside">
        {features.map(f => (
          <div key={f.text} className="settings-row">
            <Icon name={f.icon} className="h-4 w-4 text-white/30 flex-shrink-0" />
            <div className="settings-row-info">
              <div className="text-[13px] text-white/70">{f.text}</div>
            </div>
          </div>
        ))}
      </CardGroup>

      <CardGroup label="Tech Stack">
        <div className="settings-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {[
            ['Preact', 'UI framework'],
            ['Vite 7', 'Build tool'],
            ['Tailwind CSS', 'Styling'],
            ['Wllama', 'AI inference'],
            ['Rust → WASM', 'Native core'],
            ['FastAPI', 'Backend proxy'],
            ['IndexedDB', 'Storage'],
            ['OPFS', 'Large files'],
            ['fflate', 'ZIP compression'],
          ].map(([tech, role]) => (
            <div key={tech} className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              <span className="text-[11px] font-medium text-white/70">{tech}</span>
              <span className="text-[10px] text-white/30">{role}</span>
            </div>
          ))}
        </div>
      </CardGroup>

      <CardGroup label="Privacy">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="text-[13px] text-white/60 leading-relaxed">
              All data (favorites, bookmarks, history, preferences, files, notes) stays in the browser&apos;s IndexedDB and localStorage.
              The service worker provides whole-site offline cache. No data is sent to external servers unless you configure API keys.
            </div>
          </div>
        </div>
      </CardGroup>

      <p className="text-[11px] text-white/25 text-center mt-4">MIT License</p>
    </div>
  );
}
