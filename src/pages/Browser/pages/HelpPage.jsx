/**
 * HelpPage — about page with version info and links.
 */
import Icon from '../../../Components/Icon';

export default function HelpPage() {
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-[#0f0f17] p-8">
      <div className="w-full max-w-md">
        {/* Logo & version */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-purple-600">
            <Icon name="Shield" className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">Lithium Browser</h2>
          <p className="text-xs text-white/40">Version 1.0.0 · Built with Preact + Rust/WASM</p>
        </div>

        {/* Info cards */}
        <div className="flex flex-col gap-3">
          <InfoCard icon="Globe" title="About" description="Lithium is a privacy-focused browser built into the Lithium web desktop. It features Brave-like shields, reader mode, and multiple rendering modes." />
          <InfoCard icon="Shield" title="Privacy" description="Shields block ads, trackers, and fingerprinting by default. All data stays on your device and is never sent to external servers." />
          <InfoCard icon="Zap" title="Performance" description="Core computations (URL parsing, stats, bookmark trees, history grouping) run in Rust/WASM for maximum speed." />
          <InfoCard icon="BookOpen" title="Reader Mode" description="Extract clean, readable content from any webpage using Jina Reader API. Perfect for articles and documentation." />
          <InfoCard icon="Layout" title="Rebuild Mode" description="Uses Mozilla Readability to extract and re-render page content in a clean format." />
          <InfoCard icon="Eye" title="Full Render" description="Fetches pages server-side, rewrites URLs, and loads them in a sandboxed iframe for maximum compatibility." />
        </div>

        {/* Links */}
        <div className="mt-8 flex flex-col gap-2">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-white/30">Links</h3>
          <LinkRow icon="Github" label="Source Code" href="https://github.com" />
          <LinkRow icon="Book" label="Documentation" href="#" />
          <LinkRow icon="MessageCircle" label="Report an Issue" href="#" />
          <LinkRow icon="Heart" label="Support the Project" href="#" />
        </div>

        {/* Credits */}
        <div className="mt-8 text-center text-[10px] text-white/20">
          <p>Made with Preact, Tailwind CSS, and Rust</p>
          <p className="mt-1">Search providers: DuckDuckGo, Qwant, Mojeek, Startpage</p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, description }) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon name={icon} className="h-4 w-4 text-orange-400" />
        <h3 className="text-sm font-medium text-white">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-white/50">{description}</p>
    </div>
  );
}

function LinkRow({ icon, label, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
      <Icon name="ExternalLink" className="ml-auto h-3 w-3 text-white/20" />
    </a>
  );
}
