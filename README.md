# Lithium

**Lithium** is an offline-first web desktop and workspace that runs in your browser.

Think of it like a **small computer operating system inside a website**. It gives you apps for files, music, games, browsing, notes, AI, coding, and other useful tools.

It is designed to work even when you are offline, keep as much data as possible on your device, and load quickly.

**Built by:** Unknown Cherry & Yuki_Seraphim

---

# What Is Lithium?

Lithium is a **web application that looks and behaves like a desktop computer**.

Instead of opening many different websites and programs, Lithium puts many tools into one interface.

You can use it for things like:

* 📁 Managing files
* 🎮 Playing games
* 🎵 Listening to music
* 🌐 Browsing the web
* 📝 Writing notes
* 🤖 Using AI
* 💻 Writing and editing code
* 📅 Managing a calendar
* 🧮 Using a calculator
* ⚙️ Changing settings
* 📥 Downloading files
* 🖼️ Viewing photos

Lithium is primarily **local-first**, meaning important information such as notes, preferences, bookmarks, and other data can be stored directly in your browser.

---

# What Can Lithium Do?

Lithium is made up of several major parts.

## 🖥️ Desktop

The desktop is the main interface you interact with.

It includes:

* Taskbar
* Start menu
* Context menus
* Command palette
* Task View
* Lock screen
* PIN support
* Notifications
* Quick actions
* Weather information
* Desktop information tickers
* Custom wallpapers
* Reduced-motion support

### Useful keyboard shortcuts

| Shortcut    | What it does              |
| ----------- | ------------------------- |
| `Ctrl + K`  | Opens the command palette |
| `Alt + Tab` | Opens Task View           |

---

# Built-In Apps

Lithium contains several applications.

## 📁 File Explorer

File Explorer lets you manage files inside Lithium.

Features include:

* Virtual file system
* Tabs
* Sidebar navigation
* Drag and drop
* Right-click menus
* TAR and ZIP archive support
* Gallery view
* Image thumbnails
* Large-file storage

Large files can use the browser's **OPFS** storage system.

> **OPFS** is a browser feature designed for storing files locally on a device.

---

## 🖼️ Photos

Photos is Lithium's image viewer.

You can:

* Browse images
* Zoom in and out
* Create slideshows
* Import images with drag and drop

---

## 📅 Calendar & Clock

This application provides:

* Monthly calendar
* Tasks for individual dates
* Timed reminders
* Desktop notification popups

---

## 📝 Notes

Notes is a Markdown-based writing application.

It supports:

* Folders
* Markdown editing
* Live preview

### What is Markdown?

Markdown is a simple way of formatting text using normal characters.

For example:

```markdown
# Heading

**Bold text**

*Italic text*
```

Lithium uses a Rust/WebAssembly Markdown renderer to display the formatted result.

---

## 🤖 Model Hub

Model Hub allows Lithium to work with AI models directly on your device.

It uses **Wllama** to run compatible GGUF models through WebGPU/WebAssembly.

It includes:

* Model downloading
* Model management
* On-device AI
* Activity bar
* Command palette
* Welcome screen
* AI settings
* Extensions
* Knowledge base
* Prompt gallery
* Security controls
* Workspace tools
* Playground

---

## 🔑 API Manager

API Manager allows you to configure external API keys.

It uses a proxy-first design so sensitive API information can remain on the server when required.

It also uses WebAssembly-based permission validation.

---

## 💻 Code Studio

Code Studio is Lithium's built-in coding environment.

It includes:

* Code editor
* File explorer
* Terminal
* Trace visualizer
* Difference viewer
* Multi-file editing

You can think of it as a small code editor built directly into Lithium.

---

## 🛠️ App Studio

App Studio allows users to create and manage custom Lithium desktop applications.

---

## 📥 Downloader

Downloader can download:

* Web pages
* GGUF AI models
* Other files

Downloads can display progress while they are running.

Large downloads can be streamed directly into browser storage.

---

## 📊 Task Manager

Task Manager displays information about the running application.

It can show things such as:

* CPU usage
* RAM usage
* Memory information
* Running processes

---

## 👋 Onboarding

Onboarding is the first-time setup experience.

It helps new users understand Lithium when they first open it.

---

## 🧩 .li App Host

Lithium can run community-created `.li` applications.

These apps run inside sandboxed environments using Shadow DOM iframes.

Lithium provides them with a controlled `window.li.*` API.

This API can provide features such as:

* Storage
* Notifications
* Settings
* Themes
* Window titles
* Saving photos

---

# Main Pages

Lithium also has several major pages.

## 🏠 Dashboard

The Dashboard is the main home screen.

It provides:

* Greeting
* Live clock
* Quick-launch buttons
* Overview information

---

## 🎮 Games

The Games page contains a library of games.

It currently includes:

* Local game clones
* 226 HTML games
* Search
* Categories
* Favorites
* Random game picker
* Built-in game player

Games are delivered through a Cloudflare Workers CDN proxy.

---

## 🎵 Music

The Music page supports several music services.

Supported services include:

* Spotify
* YouTube Music
* SoundCloud
* Apple Music

It also includes a local music player.

Local playback supports:

* File importing
* URL importing
* Seeking through songs
* Volume control
* Favorites
* Music metadata extraction

---

## 🌐 Browser

Lithium contains its own browser.

Features include:

* Multiple tabs
* Tracker blocking
* Reader mode
* Container tabs
* Tab history
* Bookmarks
* Downloads
* Reading list
* Search-engine management
* API viewer
* Privacy dashboard
* AI quick-access tools
* Browser statistics
* New-tab widgets

Lithium also has internal pages using the `lithium://` address format.

Examples include:

```text
lithium://settings
lithium://bookmarks
lithium://history
lithium://privacy
lithium://extensions
```

---

## 🧮 Calculator

The Calculator provides safe mathematical expression evaluation.

It includes:

* Live results
* Keyboard support
* Calculation history

Lithium does **not** use JavaScript's `eval()` for calculator expressions.

---

## ⚙️ Settings

Settings contains 18 major sections:

1. Profile
2. Appearance
3. Display
4. Motion & Performance
5. Backgrounds
6. Yuki's Customization
7. Power & Battery
8. Notifications
9. Windows
10. Games
11. Browser
12. Privacy & Security
13. AI & Intelligence
14. Search Engines
15. Profiles
16. Security
17. Data & Backup
18. About

---

# AI Features

Lithium can run AI in two main ways:

### 🖥️ On your device

Wllama can run compatible GGUF models directly inside the browser.

This uses:

* WebGPU
* WebAssembly
* Web Workers

When using local inference, the AI model runs on your device and the model's inference data does not need to leave the device.

### ☁️ Through external services

Lithium can also route certain AI requests through external providers.

A runtime system can choose between local and cloud providers.

The project includes AI services for:

* Agents
* Chats
* Soloist
* Widgets

AI work can run in a Web Worker so it does not block the main user interface.

---

# Rust and WebAssembly

Lithium contains **30 Rust/WebAssembly modules**.

### What is WebAssembly?

WebAssembly, usually called **WASM**, is a format that allows code written in languages such as Rust to run efficiently inside a web browser.

Lithium uses WASM for parts of the application that benefit from native-style performance.

The modules cover areas such as:

* File systems
* Browser functions
* AI
* Markdown
* Compression
* Hashing
* Settings
* Notifications
* Storage
* Archives
* Weather
* Device information
* Lock screen
* API handling

The modules communicate through a shared JSON-based interface called `lithium-abi`.

---

# Backends

Lithium has two optional backend systems.

## 🦀 Rust Backend

Location:

```text
rust/server/
```

The Rust server uses:

* Axum
* Tokio
* SQLite

It provides things such as:

* AI proxy
* Model registry
* Web proxy
* Compute pipeline
* Database storage

---

## 🐍 Python Backend

Location:

```text
backend/
```

The Python backend uses:

* FastAPI
* Uvicorn

It is mainly used as a proxy for external API requests.

It helps keep secret API keys on the server instead of exposing them to the browser.

It also includes an MCP server router.

---

# Privacy and Security

Lithium includes several privacy and security systems.

## 🛡️ Anti-Theft

The project includes protection against certain forms of inspection and unauthorized interaction.

This includes:

* Frame-busting
* DevTools lockdown
* Inspection prevention

The related code is located at:

```text
src/lib/stealth/antiTheft.js
```

---

## 🔒 Privacy Service

The privacy service runs in the background.

It handles things such as:

* Privacy rules
* Global Privacy Control signals
* Tracking-parameter removal
* Cosmetic filtering

---

## 🌐 Browser Shields

The browser has configurable protection against trackers.

Each browser tab can have its own shield level and statistics.

---

# Offline and Storage

One of Lithium's major goals is working locally and offline.

## 💾 Local-First Storage

Lithium stores many types of information directly in the browser.

Examples include:

* Favorites
* Bookmarks
* History
* Preferences
* Files
* Notes

The main browser storage systems are:

* IndexedDB
* localStorage
* OPFS

---

## 📡 Service Worker

Lithium uses a service worker to cache the website.

This allows much of the application to continue working without an internet connection.

The caching system uses:

* Network-first behavior for navigation
* Stale-while-revalidate for assets

Games are intentionally left out of the main offline cache to keep the cache smaller.

---

## 🗄️ kvTier

`kvTier` is Lithium's unified storage system.

It uses:

1. IndexedDB as the main storage
2. localStorage as overflow storage
3. Hydration timing to help restore application data

---

## 📦 Archives

Lithium can create and extract:

* TAR files
* ZIP files

WebAssembly handles archive operations, while OPFS can be used to stream large files.

---

# How Lithium Is Built

Lithium is designed to start quickly.

Instead of loading every feature immediately, the application loads important features first and loads heavier features only when they are needed.

For example:

* The basic desktop appears quickly.
* AI systems can load later.
* Browser components can load later.
* Music metadata tools can load later.
* Supabase components can load later.

This is called **lazy loading**.

### What is lazy loading?

Lazy loading means:

> "Don't load something until it is actually needed."

This helps the application start faster.

---

# Project Technologies

| Part            | Technology                      |
| --------------- | ------------------------------- |
| User interface  | Preact                          |
| Routing         | React Router DOM v7             |
| Build system    | Vite 7                          |
| CSS             | Tailwind CSS 3 + custom CSS     |
| AI              | Wllama + WebGPU/WASM            |
| Native code     | Rust + WebAssembly              |
| Rust backend    | Axum + Tokio + SQLite           |
| Python backend  | FastAPI + Uvicorn               |
| Browser storage | IndexedDB + localStorage + OPFS |
| Offline support | Service Worker                  |
| CDN / Edge      | Cloudflare Workers              |
| Authentication  | Supabase                        |
| Page extraction | Mozilla Readability             |

---

# Performance

Lithium is optimized to make the first screen appear quickly.

| Part                  | Approximate Gzip Size | When It Loads   |
| --------------------- | --------------------: | --------------- |
| Critical JavaScript   |                ~44 kB | Immediately     |
| Critical CSS          |                ~25 kB | Immediately     |
| **First-paint total** |            **~69 kB** | **Immediately** |
| WASM startup modules  |               ~126 kB | Later           |
| Complete application  |               ~600 kB | As needed       |

The critical first-paint bundle is about **69 kB compressed**.

The full deployed application is about **600 kB compressed** when all JavaScript, CSS, and WASM are included.

---

# Build Optimizations

Lithium uses several techniques to reduce loading time.

These include:

* Terser JavaScript minification
* Removing `console` and `debugger` statements from production builds
* Lightning CSS
* Manual JavaScript chunk splitting
* CSS code splitting
* Lazy loading
* Deferred WebAssembly initialization
* Deferred background services

---

# Installing Lithium

## Requirements

You will need:

* **Node.js**
* **npm**
* The Lithium project files

If you are not familiar with Node.js or npm:

* **Node.js** is the software that allows JavaScript tools to run outside the browser.
* **npm** is a package manager that downloads the libraries Lithium needs.

---

# Running Lithium

After downloading or cloning the project, open a terminal in the project folder.

Then run:

```bash
npm install
```

### What does this do?

It downloads the packages and libraries Lithium needs.

After that, start the development server:

```bash
npm run dev
```

The terminal will provide a local address where you can open Lithium in your browser.

---

# Optional Backends

You do **not** need the backends for every part of Lithium.

They are mainly needed for features that require server-side processing.

---

## Rust Backend

The Rust backend provides features such as:

* AI proxying
* Compute
* Model registry
* Web proxy
* SQLite storage

Start it with:

```bash
cd rust
cargo run --release
```

---

## Python Backend

The Python backend is used for external API proxying.

### Windows

```cmd
start-backend.cmd
```

### Other systems

```bash
cd backend
python run.py
```

---

# Search Configuration

The Python backend uses **DuckDuckGo HTML search by default**.

You can optionally configure another hosted search provider.

Set:

```text
LITHIUM_SEARCH_API_URL
```

You can also provide:

```text
LITHIUM_SEARCH_API_KEY
```

If the hosted provider is unavailable, missing, or does not return results, DuckDuckGo remains the fallback.

---

# Building Lithium

When you are ready to create a production build, run:

```bash
npm run build
```

This creates the production files in:

```text
dist/
```

The `dist` folder contains the built version of the application.

---

# Checking Your Changes

Before submitting changes, run:

```bash
npm run build
```

and:

```bash
npm run lint
```

### What is linting?

Linting checks your code for common problems, mistakes, and style issues.

You can also run:

```bash
npm run check
```

This runs the full CI check, including:

* Linting
* Building

---

# Hosting Lithium

Lithium can be hosted on several services.

## ▲ Vercel

Import the repository into Vercel.

Lithium includes:

```text
vercel.json
```

which contains the Vercel configuration.

---

## 🟩 Netlify

Import the repository into Netlify.

Lithium includes:

```text
netlify.toml
```

which configures:

* Build settings
* Publish directory
* Client-side routing

---

## 🟦 Replit

Open the repository as a Replit project.

The project includes:

```text
launcher/.replit
```

which starts Vite on the externally accessible host and port.

---

## 🐙 GitHub Pages

Lithium includes a GitHub Actions workflow:

```text
.github/workflows/deploy-pages.yml
```

The workflow automatically builds and deploys the `main` branch.

### Enable GitHub Pages

In your GitHub repository:

1. Open **Settings**
2. Open **Pages**
3. Find **Source**
4. Select **GitHub Actions**

The site will then be available under:

```text
https://<owner>.github.io/<repo>/
```

The deployment automatically uses:

```text
BASE_PATH=/<repo>/
```

This makes sure files and routes work when the website is hosted inside a repository subfolder.

Lithium also copies `index.html` to `404.html` so that direct links to pages continue working.

---

# UI Testing Version

Lithium also has a separate UI testing deployment.

The workflow:

```text
.github/workflows/deploy-ui-testing.yml
```

builds the `UI-Testing` branch and publishes it to:

```text
gh-pages-ui-testing
```

This allows you to preview UI changes without replacing the normal production deployment.

---

# Production Hosting

For a normal production deployment:

1. Build the project:

```bash
npm run build
```

2. Take the generated:

```text
dist/
```

folder.

3. Serve that folder using your hosting provider.

4. Make sure your host supports **SPA fallback routing** to:

```text
index.html
```

### What is SPA fallback?

Lithium is a **Single Page Application**, or SPA.

That means the browser handles many page changes itself instead of requesting a completely new HTML page from the server.

If someone directly visits a route, the server needs to send Lithium's `index.html` so Lithium can handle that route.

---

# Using BASE_PATH

If Lithium is hosted at the root of a domain:

```text
https://example.com/
```

you normally do not need a special base path.

If it is hosted inside a subfolder:

```text
https://example.com/my-project/
```

set:

```text
BASE_PATH=/my-project/
```

This tells Lithium where the application is located.

---

# Project Structure

The project contains several important areas.

```text
src/
```

Contains the main frontend application.

```text
rust/
```

Contains Rust and WebAssembly code, including the Rust server.

```text
backend/
```

Contains the optional Python backend.

```text
launcher/
```

Contains launcher/deployment-related configuration.

```text
.github/workflows/
```

Contains GitHub Actions workflows for automated builds and deployments.

```text
dist/
```

Contains the production build after running:

```bash
npm run build
```

---

# Simple Explanation of the Architecture

If you are new to programming, this is the easiest way to think about Lithium:

```text
                    LITHIUM
                       │
          ┌────────────┴────────────┐
          │                         │
       Frontend                  Backends
          │                         │
       Preact                 ┌─────┴─────┐
          │                   │           │
      Desktop UI            Rust       Python
          │                 Server     Server
          │                   │           │
   ┌──────┼───────┐           │           │
   │      │       │           │           │
 Files   AI    Browser     AI/Compute   APIs
   │      │       │
   └──────┼───────┘
          │
     Browser Storage
          │
   ┌──────┼─────────┐
 IndexedDB localStorage OPFS
```

In simple terms:

* **Preact** creates what you see on the screen.
* **JavaScript** controls much of the application's behavior.
* **Rust/WASM** handles tasks that benefit from fast native-style code.
* **The Rust server** handles server-side features.
* **The Python server** handles external API proxying.
* **IndexedDB/localStorage/OPFS** store data locally.
* **Service Workers** help Lithium work offline.
* **Cloudflare Workers** provide certain online services.
* **Supabase** provides authentication-related functionality.

---

# 👩‍💻 For Developers

If you already know how to code, the most important commands are:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production version
npm run build

# Check code
npm run lint

# Run full CI checks
npm run check
```

Optional Rust server:

```bash
cd rust
cargo run --release
```

Optional Python backend:

```bash
cd backend
python run.py
```

---

# 🧑‍💻 For Complete Beginners

If you have never programmed before, you do **not** need to understand every technology listed in this README.

The basic process is:

```text
1. Download Lithium
        ↓
2. Install Node.js
        ↓
3. Open a terminal in the Lithium folder
        ↓
4. Run: npm install
        ↓
5. Run: npm run dev
        ↓
6. Open the local website
```

You can learn the more advanced parts later.

The technologies such as Rust, WebAssembly, React Router, Vite, FastAPI, SQLite, Cloudflare Workers, and Supabase are mainly important when you want to **develop or modify Lithium**.

---

# 📌 Quick Reference

| Command               | Purpose                         |
| --------------------- | ------------------------------- |
| `npm install`         | Install project dependencies    |
| `npm run dev`         | Start the development version   |
| `npm run build`       | Create a production build       |
| `npm run lint`        | Check the code                  |
| `npm run check`       | Run the complete project checks |
| `cargo run --release` | Start the Rust backend          |
| `python run.py`       | Start the Python backend        |

---

# 📄 License

This README does not specify a license for the project.

If a license is added later, it should be documented here.

---

# Lithium in One Sentence

**Lithium is a fast, offline-first browser desktop that combines files, games, music, browsing, AI, coding, and everyday tools into one workspace.**
