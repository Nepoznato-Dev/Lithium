# Lithium

Lithium is a lightweight, offline-first web desktop and workspace for games,
music, browsing, files, AI, and quick tools. Built on **Preact** for a tiny
bundle (~72 kB gzipped), it runs fast on any device with no heavy frameworks
or trackers.

## What's inside

### Desktop shell
A full desktop environment with a taskbar, start menu, context menus, command
palette (Ctrl+K), task view (Alt+Tab), lock screen with PIN, and an ambient
reduced-motion-aware background.

### Desktop apps
- **File Manager** — virtual filesystem with folders, file operations, and
  OPFS-backed blob storage for large files.
- **Photos** — image gallery with slideshow, zoom, and drag-and-drop import.
- **Calendar & Clock** — monthly calendar, per-date todos, and timed reminders
  with desktop notification toasts.
- **Notes** — Markdown editor with folder organization and live preview.
- **Model Hub** — download, manage, and run on-device LLMs via Wllama
  (WebGPU/WASM inference entirely in the browser).
- **API Manager** — configure external API keys and route AI requests through
  a proxy-first architecture with WASM-validated permissions.
- **Code Studio** — in-browser code editor.
- **Downloader** — download web pages, GGUF models, and arbitrary files with
  progress tracking and OPFS streaming.
- **Task Manager** — live CPU/RAM/memory stats and process list.

### Core pages
- **Dashboard** — greeting, live clock, quick-launch tiles, and at-a-glance
  bar.
- **Games** — curated library of local game clones plus 226 HTML games, with
  search, category filters, favorites, a random picker, and an in-app player.
- **Music** — embedded streaming services (Spotify, YouTube Music, SoundCloud,
  Apple Music) plus a local player with file/URL import, seek, volume, and
  favorites.
- **Browser** — tabbed mini-browser with address-bar search, per-tab history,
  bookmarks, and a quick-links new-tab page.
- **Calculator** — safe expression evaluation (no `eval`), live preview,
  keyboard support, and persistent history.
- **Settings** — searchable, expandable sections controlling accent color,
  density, motion, background, low-end mode, games behavior, browser search
  engine, and data management.

### AI & native core
- **On-device inference** — Wllama runs GGUF models entirely in the browser
  with WebGPU/WASM acceleration; no data leaves the device.
- **Rust/WASM core** (`rust/lithium-core`) — LZ4 compression, xxh3 integrity
  checks, and a binary filesystem snapshot codec compiled to WebAssembly.
- **Python backend** (`backend/`) — FastAPI proxy for external API calls,
  keeping secrets server-side.

### Storage & offline
- **Local-first** — all data (favorites, bookmarks, history, preferences,
  files, notes) stays in the browser's IndexedDB and localStorage.
- **Service worker** — whole-site offline cache (network-first for
  navigations, stale-while-revalidate for assets). Games are deliberately
  excluded from the cache to keep it lean.
- **kvTier** — unified storage layer with IndexedDB primary, localStorage
  overflow, and hydration timing.

## Tech stack

| Layer | Technology |
|-------|------------|
| UI framework | Preact (via `preact/compat`) |
| Routing | react-router-dom v7 |
| Build | Vite 7 with manual chunk splitting |
| Styling | Tailwind CSS 3 + custom CSS |
| AI inference | Wllama (WebGPU/WASM) |
| Native core | Rust → WebAssembly (LZ4, xxh3) |
| Backend | Python FastAPI + Uvicorn |
| Storage | IndexedDB, localStorage, OPFS |
| Offline | Service worker (whole-site cache) |

## Development

```bash
npm install
npm run dev
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

For production deployments, run `npm run build` and serve the generated
`dist/` directory with SPA fallback routing to `index.html`.

## CI

The GitHub Actions workflow ([`.github/workflows/quality.yml`](.github/workflows/quality.yml))
runs `npm run check` on every push and pull request to verify lint and
build pass.

## License

MIT
