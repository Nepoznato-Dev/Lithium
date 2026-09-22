# Lithium

Lithium is a lightweight, **offline-first web desktop** — a full workspace for
games, music, browsing, files, notes, AI, and quick tools that runs entirely in
the browser. Built on **Preact**, the shell paints from a **~96 kB gzipped**
critical path (≈47 kB entry JS + ≈37 kB CSS, with Preact preloaded), and every
heavy feature — the browser engine, music metadata, AI inference, code editor —
is lazy-loaded on demand. The full code bundle (all JS chunks + CSS + WASM) is
**~677 kB gzipped**. No trackers, no heavyweight framework, and it works with no
backend running at all.

BUILT BY Unknown Cherry & Litten_Lawliet

## What's inside

### Desktop shell
A complete desktop environment running in a single page: taskbar with pinned
and running apps, start menu with fuzzy search and keyboard navigation,
browser-style **tabbed windows** (multiple apps inside one window), window
snapping and cascading, task view (Alt+Tab), a command palette (Ctrl+K),
right-click context menus with dynamic flyouts, a lock screen with PIN,
notification center, quick-settings panel, weather flyout, desktop tickers, and
an ambient, reduced-motion-aware background with customizable wallpapers.

### Desktop apps
Apps launch as windows from the start menu, desktop, or via the `apps.open`
bridge. The built-in set:

- **File Explorer** — virtual filesystem with tabbed browsing, sidebar,
  drag-and-drop, context menus, archive support (TAR/ZIP), virtualized grid and
  gallery views, thumbnail caching, and OPFS-backed storage for large files.
- **Gallery** — photo viewer with slideshow, zoom, and drag-and-drop import.
- **Notes** — Markdown note-taking with folders, backlinks, graph view, and
  live preview, rendered by the Rust/WASM markdown engine.
- **Notepad** — lightweight text editor with Markdown preview.
- **Clock** — clock, calendar, per-date todos, timed reminders, and pomodoro.
- **Store** — download anything into the site: web pages, arbitrary files, and
  GGUF models, with OPFS streaming, a Hugging Face file browser, GitHub repo
  import, download history, and the server's package shelf (`.tar.gz` apps,
  saved to disk or unpacked into the filesystem).
- **Code Studio** — multi-file editor with explorer, terminal, diff utilities,
  and an AI chat/trace panel.
- **Cortex** — the AI workspace (see [AI](#ai--cortex)).
- **API Manager** — configure external API keys and inspect the capability
  catalog behind a proxy-first, permission-checked request layer.
- **Hydrux** (games), **Media Player** (music), **Browser**, **Calculator**, and
  **Settings** all open as windows too.
- **Setup Wizard** — guided first-run onboarding.
- **Task Manager** — live CPU/RAM/memory stats and a process list.
- **.li App Host** — run community and dynamically-built `.li` apps in sandboxed
  Shadow-DOM iframes through the `window.li.*` bridge (storage, notifications,
  settings, theme, title, save-photo, and more).

### Core pages & routes
A lightweight history-API router (no routing library) drives the standalone
pages: **Dashboard**, **Games**, **Music**, **Browser**, **Calculator**,
**Settings**, a **Privacy** dashboard, the **Yuki** customization/about pages, a
PWA **share target**, and a themed fake-404 catch-all.

### AI & Cortex
- **Cortex** is a full AI workspace: a chat **Playground** with tool/agent loop,
  attachments, thinking modes and skills; a **Models** hub; **Connections** for
  provider keys; a **Knowledge** base; **Memory**; **History**; **Extensions**;
  a **Security** view; workspace automations; and a command palette — all behind
  a Qoder-style light/dark theme.
- **On-device inference** — [wllama](https://github.com/ngxson/wllama) (llama.cpp
  compiled to WASM) runs GGUF models in the browser with WebGPU/WASM
  acceleration on a dedicated Web Worker, so the UI stays responsive. The wllama
  runtime is fetched from a CDN on demand and is never part of the bundle.
- **Tiered routing** (`modelRuntime.js`) auto-selects between local models and
  cloud providers; every external call is **proxy-first** through the backend so
  keys stay server-side.

### Native core & compute
- The native layer is a **Cargo workspace of ~29 Rust crates** under `app/rust/`
  (filesystem, browser, AI/agent/chats/models/memory/soloist/widget, markdown,
  LZ4, xxh3, snapshot codec, settings, shell, storage, tar, weather, and a
  shared `lithium-abi`). A subset compiles to the WASM modules the browser loads.
- **Compute worker** — CPU-heavy work (LZ4, xxh3 hashing, snapshot encode/decode,
  and fflate archive math) runs in one shared Web Worker (`lib/compute.js`) off
  the UI thread, with a graceful main-thread fallback for the WASM ops.
- **Low-end mode** — heavy list/grid surfaces (file table, file grid, gallery,
  music player, tab bar, track list) are rebuilt as tiny **Solid** "islands"
  (`src/islands/`) with clamped canvas DPR and trimmed effect budgets, so the
  desktop stays usable on weak hardware. Solid ships as its own lazy chunk and
  is never on the Preact path.

### Server infrastructure
All server-side code is one Rust binary under [`../backend/`](../backend),
separate from the `app/` bundle. The frontend reaches it only by URL
(`lib/backendApi.js` probes `http://127.0.0.1:8734` and LAN candidates) and
degrades gracefully when nothing is listening — **the desktop is fully functional
with no backend running**.

- **li-server** (`backend/server/`) — a single Axum + Tokio server: Supabase JWT
  verification, Guest/Full tiered access, SQLite persistence, per-subject
  rate/credit limits, request logging, and a coordinator/worker model for
  distributed compute. It also holds the AI surface (model registry, provider
  keys, shared memory, context builder, an MCP server, local GGUF store, and an
  OpenAI-compatible `/v1` endpoint), plus web search/scrape/proxy endpoints.
  *Git-ignored; not part of the public repo.*
- **Package store** (`backend/server/store/`) — every app and game as a built
  `.tar.gz`, indexed in `store/index.json` and served by `/api/apps`,
  `/api/games` and `/api/store/catalog`. Downloads are ranged and
  tier-gated; `GET /play/games/:slug` hands an iframe the loose entry file.
  `li-server pack` (or `POST /api/store/repack`) rebuilds archives from the
  `store/sources/` folders — the 767 HTML games ship as store content, not as
  an edge CDN.

### Browser extension
- **Lithium Performance Extension** (Manifest V3) — a background service worker
  polls a local system-intelligence daemon every 2 s for CPU, RAM, GPU, network,
  disk and process metrics; content scripts collect per-tab memory, DOM-node
  counts and resource timings via the Performance API. The two layers merge into
  one composite report delivered to the desktop on demand.

### Personalization & stealth
- **Yuki customization** — dedicated theme, cursor, wallpaper and appearance
  pages, surfaced both as standalone routes and Settings sections.
- **Decoy screen (boss key)** — press `~` to instantly show a fake
  classroom/learning screen; press again to dismiss.
- **Anti-theft** — cross-origin frame lockdown (redirects to `about:blank`),
  domain verification and devtools/inspection deterrence.

### Performance layer
- **Render manager** — priority-based scheduler that skips low-priority
  components under FPS pressure, with hysteresis to avoid state flapping.
- **Tab governance** — BroadcastChannel leader election for multi-tab
  coordination, preventing concurrent IndexedDB write conflicts.
- **Workspace storage** — checkpoint + journal persistence with gzip-compressed
  snapshots and incremental replay for crash-safe recovery.

### Privacy & security
- **Privacy service** — background rule enforcement, GPC signals,
  tracking-parameter stripping and cosmetic filters.
- **Browser shields** — per-tab tracker/ad blocking with configurable levels
  and a live stats widget.
- **Lock screen** — PIN-protected, with auto-lock.

### Background services
Fire-and-forget daemons initialized after first paint via `requestIdleCallback`:
privacy, AI runtime + model-catalog hydration, notifications, history, storage
breakdown, downloads sync, and update checks.

### Storage, offline & PWA
- **Local-first** — files, notes, favorites, bookmarks, history and preferences
  live in IndexedDB, `localStorage` and OPFS.
- **kvTier** — unified storage with IndexedDB primary and localStorage overflow.
- **Service worker** — whole-site offline cache (network-first navigations,
  stale-while-revalidate assets). Games are deliberately excluded to keep the
  cache lean; installed **versions** are served from pre-cached snapshots.
- **PWA** — installable via a web manifest and an in-app install banner; a
  version manager installs, switches and rolls back whole builds.
- **Backups** — export/import settings and a full ZIP of the virtual filesystem.

## Tech stack

| Layer | Technology |
|-------|------------|
| UI framework | Preact 10 (via `preact/compat`) + `@preact/signals` |
| Islands | Solid.js, lazily loaded (low-end mode only) |
| Routing | Custom minimal history-API router (`src/lib/router.jsx`) |
| Build | Vite 7 — Terser, Lightning CSS, manual chunk splitting |
| Styling | Tailwind CSS 3 + custom CSS |
| AI inference | wllama (llama.cpp → WASM, WebGPU) from CDN, on a Web Worker |
| Native core | ~29 Rust crates → WebAssembly (`app/rust`, shared `lithium-abi`) |
| Heavy compute | Shared Web Worker (`lz4`, `xxh3`, snapshot codec, fflate) |
| Auth | Supabase via a dependency-free GoTrue client (`src/lib/supabase.js`) |
| Backend (Rust) | One Axum + Tokio + SQLite server with the package store (`backend/server`, private) |
| Content extraction | Mozilla Readability |
| Offline | Service worker whole-site cache + version snapshots |
| Storage | IndexedDB, localStorage, OPFS |

## Bundle size

Measured from a production build (**596 modules → 245 output files**, ~9 s):

| Category | Gzip size | Loading |
|----------|-----------|---------|
| Critical-path entry JS | ~47 kB | Synchronous (`type="module"`) |
| Preact runtime | ~12 kB | `modulepreload` (fetched early) |
| Critical-path CSS | ~37 kB | Render-blocking stylesheet |
| **First-paint critical path** | **~96 kB** | **Blocks render** |
| WASM modules (4 shipped) | ~125 kB | Deferred |
| All JS chunks | ~514 kB | Mostly lazy, on demand |
| **Full code bundle (JS + CSS + WASM)** | **~677 kB** | Across 104 JS chunks + 1 CSS + 4 WASM |

The 245 files also include already-compressed icon and PWA image assets, so they
are excluded from the gzip totals above. Readability and Solid each ship as their
own lazily-fetched chunk (`vendor-readability`, `vendor-solid`); other optional
vendor code (music-metadata, fflate) lives in a `vendor` chunk pulled in only
when a feature needs it. Build optimizations: two-pass Terser (console/debugger
dropped), Lightning CSS minification, manual chunk splitting, CSS code-splitting,
and `requestIdleCallback`-deferred service/WASM init.

## Project structure

This is a monorepo; the web app is one part of it:

| Path | What it is |
|------|------------|
| `app/` | The web app (this README): Preact UI, Rust/WASM workspace, PWA |
| `app/src/` | Frontend source (`pages/`, `Components/`, `lib/`, `islands/`) |
| `app/rust/` | Cargo workspace of the Rust crates that build the WASM modules |
| `app/api/` | Vercel serverless functions (proxy/scrape/search)              |
| `../backend/server/` | The one Rust backend — Axum API, package store, `.tar.gz` downloads (git-ignored) |
| `../backend/README.md` | How to run it |
| `../extension/` | Manifest V3 performance extension |
| `../apps/` | Sample `.li` desktop apps |
| `../docs/` | Design notes and API references |

## Development

The frontend runs on its own — **no backend is required** to use or develop
Lithium.

```bash
cd app
npm install
npm run dev        # Vite dev server
```

```bash
npm run build      # production build → app/dist
npm run preview    # preview the build
npm run lint       # eslint
npm run check      # lint + build (the CI gate)
```

### Optional backends

Everything the desktop does client-side works without a backend; run one only
for API proxying, hosted AI, search or distributed compute. All backends bind
port **8734** and are interchangeable from the frontend's point of view — run
one at a time.

- **One-shot dev launcher (Windows)** — builds and runs the Rust dev server, then
  opens Vite:
  ```bat
  Backend\fastapi\start-backend.cmd
  ```
- **Python backend** —
  ```bash
  cd Backend/fastapi
  pip install -r requirements.txt
  python run.py            # FastAPI on http://127.0.0.1:8734
  ```
- **Rust workspace** (WASM crates + `lithium-server`) —
  ```bash
  cd app/rust
  cargo build              # or: cargo check --workspace
  ```

The Python backend uses DuckDuckGo HTML search by default. A hosted provider can
be tried first by setting `LITHIUM_SEARCH_API_URL` (and optionally
`LITHIUM_SEARCH_API_KEY`); DuckDuckGo remains the fallback when the provider is
missing, unavailable, or returns no results.

## Hosting

The frontend is a static SPA. Deploy configs live inside `app/`:

- **Vercel:** import the repo (root `app/`); [`vercel.json`](vercel.json) sets the
  Vite build, `dist` output, an SPA rewrite, and a `/api/*` passthrough for the
  serverless functions in `app/api/`.
- **Netlify:** [`netlify.toml`](netlify.toml) sets the build command, publish
  directory, and client-side route fallback.
- **GitHub Pages:** [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
  builds and deploys `main` via Actions. Enable it once under **Settings → Pages
  → Source → GitHub Actions**. The workflow builds with
  `BASE_PATH=/<repo>/` so assets and routing resolve under that sub-path, and
  copies `index.html` to `404.html` so deep links work without server rewrites.

For any static host, run `npm run build` and serve `app/dist/` with SPA fallback
to `index.html`. Set `BASE_PATH` (e.g. `BASE_PATH=/repo-name/`) when serving from
a sub-directory.

## CI

[`.github/workflows/quality.yml`](.github/workflows/quality.yml) runs
`npm run check` (lint + build) on every push and pull request. Both workflows run
with `working-directory: app`.

> Note: the workflows live at `app/.github/workflows/` in this layout. For GitHub
> to run them automatically they must be at the repository root's
> `.github/workflows/`; as checked in here they are not auto-detected.

## License

MIT
