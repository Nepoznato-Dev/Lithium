# Lithium

Lithium is a lightweight, offline-first web desktop and workspace for games,
music, browsing, files, AI, and quick tools. Built on **Preact**, the
critical-path bundle is only **~69 kB gzipped** (21 kB entry JS + 23 kB
router/chunks + 25 kB CSS) so the shell paints fast on any device. Heavy
features — AI inference, the browser engine, music metadata, Supabase — are
lazy-loaded on demand. The full deployed footprint (30 WASM modules, all JS,
CSS) is ~600 kB gzip. No trackers, no heavy frameworks.

BUILT BY Unknown Cherry & Litten_Lawliet

## What's inside

### Desktop shell
A full desktop environment with a taskbar, start menu, context menus with
dynamic flyouts, command palette (Ctrl+K), task view (Alt+Tab), lock screen
with PIN, notification center, quick actions panel, weather flyout, desktop
tickers, and an ambient reduced-motion-aware background with customizable
wallpapers.

### Desktop apps
- **File Explorer** — full virtual filesystem with tabbed browsing, sidebar
  navigation, drag-and-drop, context menus, archive support (TAR/ZIP),
  virtualized gallery view, thumbnail caching, and OPFS-backed blob storage
  for large files.
- **Photos** — image gallery with slideshow, zoom, and drag-and-drop import.
- **Calendar & Clock** — monthly calendar, per-date todos, and timed reminders
  with desktop notification toasts.
- **Notes** — Markdown editor with folder organization and live preview,
  powered by the Rust/WASM markdown renderer.
- **Model Hub** — download, manage, and run on-device LLMs via Wllama
  (WebGPU/WASM inference entirely in the browser). Includes an activity bar,
  command palette, welcome screen, cortex settings, extensions, knowledge
  base, prompt gallery, security controls, workspace tools, and a playground.
- **API Manager** — configure external API keys and route AI requests through
  a proxy-first architecture with WASM-validated permissions.
- **Code Studio** — in-browser code editor with explorer panel, terminal,
  trace visualizer, diff utilities, and multi-file editing.
- **App Studio** — build and manage custom desktop apps.
- **Downloader** — download web pages, GGUF models, and arbitrary files with
  progress tracking and OPFS streaming.
- **Task Manager** — live CPU/RAM/memory stats and process list.
- **Onboarding** — guided first-run experience for new users.
- **.li App Host** — run community-built `.li` apps in sandboxed Shadow DOM
  iframes with the `window.li.*` bridge API (storage, notifications,
  settings, theme, title, savePhoto).

### Core pages
- **Dashboard** — greeting, live clock, quick-launch tiles, and at-a-glance
  bar.
- **Games** — curated library of local game clones plus 226 HTML games, with
  search, category filters, favorites, a random picker, and an in-app player.
  Served through Cloudflare Workers CDN proxy for low-latency delivery.
- **Music** — embedded streaming services (Spotify, YouTube Music, SoundCloud,
  Apple Music) plus a local player with file/URL import, seek, volume,
  favorites, and music-metadata extraction.
- **Browser** — full-featured tabbed browser with shields/tracker blocking,
  reader mode (Mozilla Readability), container tabs, per-tab history,
  bookmarks, downloads, reading list, search engine management, API viewer,
  privacy dashboard, AI quick-access widget, Brave-style stats, new-tab
  widgets, and `lithium://` internal pages (settings, bookmarks, history,
  privacy, extensions, reader, search engines, API viewer).
- **Calculator** — safe expression evaluation (no `eval`), live preview,
  keyboard support, and persistent history.
- **Settings** — 18 searchable, expandable sections: Profile, Appearance,
  Display, Motion & Perf, Backgrounds, Yuki's Customization, Power & Battery,
  Notifications, Windows, Games, Browser, Privacy & Security, AI &
  Intelligence, Search Engines, Profiles, Security, Data & Backup, and About.

### AI & native core
- **On-device inference** — Wllama runs GGUF models entirely in the browser
  with WebGPU/WASM acceleration; no data leaves the device. Tiered model
  routing (`modelRuntime.js`) auto-selects between local and cloud providers.
- **AI services** — agent, soloist, chats, and widget modules with a Web
  Worker inference thread to keep the main thread responsive.
- **30 Rust/WASM modules** — the native core is split into focused
  WebAssembly crates: filesystem, browser (URL/bookmarks/history/shields/
  omnibox), AI (inference/models/agent/chats/soloist/widget), markdown,
  LZ4 compression, xxh3 hashing, snapshot codec, settings, shell (notify/
  snap/lock/device/storage/memory/api/kv/tar), lock screen, weather, device
  info, notifications, storage calculator, TAR archives, and more. All
  share a common ABI layer (`lithium-abi`) for JSON serialization.
- **Rust backend** (`rust/server/`) — Axum + Tokio server with AI proxy,
  model registry, web proxy, compute pipeline, and SQLite persistence.
- **Python backend** (`backend/`) — FastAPI proxy for external API calls,
  keeping secrets server-side. Includes MCP server router.

### Privacy & security
- **Anti-theft** — frame-busting, devtools lockdown, and inspection
  prevention (`src/lib/stealth/antiTheft.js`).
- **Privacy service** — background enforcement of privacy rules, GPC signals,
  tracking-param stripping, and cosmetic filter integration.
- **Browser shields** — per-tab tracker blocking with configurable shield
  levels and real-time stats widget.

### Background services
Fire-and-forget daemons initialized after first paint via
`requestIdleCallback`:
- **Privacy service** — rule enforcement and tracking protection.
- **AI service** — runtime initialization and model catalog hydration.
- **Notification service** — desktop notification orchestration.
- **History service** — browser and app history tracking.
- **Storage service** — storage management and breakdown analysis.
- **Update service** — application update checks.

### Storage & offline
- **Local-first** — all data (favorites, bookmarks, history, preferences,
  files, notes) stays in the browser's IndexedDB and localStorage.
- **Service worker** — whole-site offline cache (network-first for
  navigations, stale-while-revalidate for assets). Games are deliberately
  excluded from the cache to keep it lean.
- **kvTier** — unified storage layer with IndexedDB primary, localStorage
  overflow, and hydration timing.
- **Archive support** — TAR and ZIP archive creation/extraction via WASM,
  with OPFS streaming for large files.
- **Storage breakdown** — per-category usage analysis and visualization.

## Tech stack

| Layer | Technology |
|-------|------------|
| UI framework | Preact (via `preact/compat`) |
| Routing | react-router-dom v7 |
| Build | Vite 7 with Terser, Lightning CSS, manual chunk splitting |
| Styling | Tailwind CSS 3 + custom CSS |
| AI inference | Wllama (WebGPU/WASM) + Web Worker |
| Native core | 30 Rust → WebAssembly modules (shared `lithium-abi`) |
| Backend (Rust) | Axum + Tokio + SQLite |
| Backend (Python) | FastAPI + Uvicorn (optional) |
| Storage | IndexedDB, localStorage, OPFS |
| Offline | Service worker (whole-site cache) |
| CDN / Edge | Cloudflare Workers (games proxy, app store, search) |
| Auth | Supabase |
| Content extraction | Mozilla Readability |

## Bundle size

Lithium is optimized for fast first paint:

| Category | Gzip size | Loading |
|----------|-----------|----------|
| Critical-path JS (entry + router) | ~44 kB | Synchronous |
| Critical-path CSS | ~25 kB | Synchronous |
| **Total first-paint** | **~69 kB** | **Blocks render** |
| WASM boot modules | ~126 kB | Deferred (idle callback) |
| Full bundle (all JS + WASM + CSS) | ~600 kB | Lazy-loaded on demand |

Build optimizations: Terser minification (2 passes, console/debugger
dropped), Lightning CSS for stylesheet minification, manual chunk splitting
(Supabase, audio, Readability, router cached independently), CSS code
splitting, and `requestIdleCallback` deferred initialization for services
and WASM.

## Development

```bash
npm install
npm run dev
```

Start the Rust backend (optional, for AI proxy and compute):

```bash
cd rust && cargo run --release
```

Start the Python backend (optional, for API proxying):

```bash
start-backend.cmd        # Windows
# or
cd backend && python run.py
```

The backend uses DuckDuckGo HTML search by default. A hosted search provider can
be tried first by setting `LITHIUM_SEARCH_API_URL` and optionally
`LITHIUM_SEARCH_API_KEY`; DuckDuckGo remains the fallback when the provider is
missing, unavailable, or returns no results.

Run `npm run build` and `npm run lint` before submitting changes.
Run `npm run check` to execute the full CI pipeline (lint + build).

## Hosting

Lithium is configured for common static hosting providers. Configuration
files are at the project root:

- **Vercel:** import the repository; [`vercel.json`](vercel.json) configures
  the build and SPA fallback.
- **Netlify:** import the repository; [`netlify.toml`](netlify.toml)
  configures the build, publish directory, and client-side route fallback.
- **Replit:** open the repository as a Repl;
  [`launcher/.replit`](launcher/.replit) starts Vite on the externally
  reachable host and port.
- **GitHub Pages:** [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
  builds and deploys `main` automatically via GitHub Actions. Enable it once
  under repo **Settings → Pages → Source → GitHub Actions**; the app is then
  served at `https://<owner>.github.io/<repo>/`. The workflow builds with
  `BASE_PATH=/<repo>/` so assets and client-side routing resolve under that
  sub-path, and copies `index.html` to `404.html` so deep links work without
  server-side rewrites.

For production deployments, run `npm run build` and serve the generated
`dist/` directory with SPA fallback routing to `index.html`. Set the
`BASE_PATH` environment variable (e.g. `BASE_PATH=/repo-name/`) when the app
is served from a sub-path instead of the domain root.

## CI

The GitHub Actions workflow ([`.github/workflows/quality.yml`](.github/workflows/quality.yml))
runs `npm run check` on every push and pull request to verify lint and
build pass.

## License

MIT