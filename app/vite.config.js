import { defineConfig } from 'vite';
import { existsSync, statSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { resolve, extname, relative } from 'path';
import preact from '@preact/preset-vite';
import solid from 'vite-plugin-solid';

/**
 * JSX partition between the two runtimes.
 *
 * `src/islands/**` is the only Solid-owned directory; everything else stays
 * Preact. Both plugins transform by file id, and the preact preset's own
 * default `include` already covers `.jsx`, so the two sets must be declared
 * explicitly and disjointly — otherwise the second transform runs on the first
 * one's output.
 *
 * Forward slashes are what Vite hands to `createFilter` on Windows too, but the
 * patterns accept both because a dev-server id can be a plain fs path.
 */
const ISLAND_DIR = /[\\/]src[\\/]islands[\\/]/;
/** No `$` anchor: in dev the id can carry a `?t=` / `?v=` query. */
const ISLAND_JSX = /[\\/]src[\\/]islands[\\/][^?#]*\.jsx/;

/** Return 404 for source file requests that don't exist on disk,
 *  preventing Vite's SPA fallback from masking missing modules. */
function sourceFile404() {
  return {
    name: 'source-file-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url && /\.(jsx?|tsx?)$/.test(url) && url.startsWith('/src/')) {
          const filePath = resolve(__dirname, '.' + url);
          if (!existsSync(filePath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`File not found: ${url}`);
            return;
          }
        }
        next();
      });
    },
  };
}

/** Serve .li app files from apps/src/ under /li-apps/. */
const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

/** Serve extension files from extensions/ under /extensions/. */
function extensionsServe() {
  const extRoot = resolve(__dirname, '../extensions');

  return {
    name: 'extensions-serve',
    configureServer(server) {
      // Directory listing at /extensions/ → JSON array of subdirectory names
      server.middlewares.use('/extensions', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];

        // Root listing: / or /extensions → JSON directory list
        if (urlPath === '/' || urlPath === '') {
          try {
            const entries = readdirSync(extRoot, { withFileTypes: true })
              .filter(d => d.isDirectory())
              .map(d => d.name);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ extensions: entries }));
          } catch {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ extensions: [] }));
          }
          return;
        }

        // File serving: /extensions/<id>/<file>
        const filePath = resolve(extRoot, '.' + urlPath);
        if (!filePath.startsWith(extRoot)) return next();
        (async () => {
          try {
            const s = await stat(filePath);
            if (s.isFile()) {
              const ext = extname(filePath);
              res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
              const content = await readFile(filePath);
              res.end(content);
              return;
            }
          } catch { /* not found — fall through */ }
          next();
        })();
      });
    },
  };
}

function liAppsServe() {
  const liAppsRoot = resolve(__dirname, '../apps/src');
  const liAppsBase = resolve(__dirname, '../apps');

  /** Async file-serving helper — avoids blocking the event loop
   *  with synchronous I/O when multiple .li assets are fetched
   *  concurrently on first load. */
  async function tryServeFile(filePath, allowedRoot, res, next) {
    if (!filePath.startsWith(allowedRoot)) return next();
    try {
      const s = await stat(filePath);
      if (s.isFile()) {
        const ext = extname(filePath);
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        const content = await readFile(filePath);
        res.end(content);
        return;
      }
    } catch {
      // File not found — fall through to next middleware.
    }
    next();
  }

  return {
    name: 'li-apps-serve',
    configureServer(server) {
      // Serve apps/src/ contents at /li-apps/
      server.middlewares.use('/li-apps', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(liAppsRoot, '.' + urlPath);
        tryServeFile(filePath, liAppsRoot, res, next);
      });
      // Serve launcher.li and other root-level .li files at /li-apps-launcher/
      server.middlewares.use('/li-apps-launcher', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(liAppsBase, '.' + urlPath);
        tryServeFile(filePath, liAppsBase, res, next);
      });
    },
  };
}

/** Serve art gallery wallpapers from assets/picture-assests/images/ under /art-wallpapers/. */
function artWallpapersServe() {
  const artRoot = resolve(__dirname, '../assets/picture-assests/images');

  return {
    name: 'art-wallpapers-serve',
    configureServer(server) {
      server.middlewares.use('/art-wallpapers', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(artRoot, '.' + urlPath);
        if (!filePath.startsWith(artRoot)) return next();
        (async () => {
          try {
            const s = await stat(filePath);
            if (s.isFile()) {
              const ext = extname(filePath);
              res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              const content = await readFile(filePath);
              res.end(content);
              return;
            }
          } catch { /* not found — fall through */ }
          next();
        })();
      });
    },
  };
}

/**
 * Vite plugin — after each production build, writes a `version.json` into
 * the dist output.  The file lists every generated asset so the PWA version
 * manager knows exactly which files to pre-cache when the user installs
 * that version.
 */
function versionManifest() {
  return {
    name: 'lithium-version-manifest',
    applyToEnvironment() { return true; },
    closeBundle() {
      // Only run during production builds.
      if (process.env.NODE_ENV === 'development') return;
      const outDir = resolve(__dirname, 'dist');
      if (!existsSync(outDir)) return;

      // Read BUILD_VERSION from settings.js (simple regex parse).
      const settingsPath = resolve(__dirname, 'src/lib/settings.js');
      let version = 'v0.0.0';
      try {
        const raw = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : '';
        const m = raw.match(/BUILD_VERSION\s*=\s*'([^']+)'/);
        if (m) version = m[1];
      } catch { /* keep default */ }

      // Enumerate every file in dist/ (relative paths).
      function walk(dir, prefix) {
        const entries = readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const e of entries) {
          const rel = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.isDirectory()) files.push(...walk(resolve(dir, e.name), rel));
          else files.push(rel);
        }
        return files;
      }
      const assets = walk(outDir, '');

      const meta = {
        version,
        date: new Date().toISOString().slice(0, 10),
        changelog: `Lithium ${version}`,
        basePath: `/versions/${version}/`,
        assets,
      };

      // Write version.json alongside the build output.
      writeFileSync(resolve(outDir, 'version.json'), JSON.stringify(meta, null, 2));
    },
  };
}

export default defineConfig({
  // Overridable so the same build works at the domain root (Vercel/Netlify)
  // and under a sub-path (GitHub Pages project sites serve from
  // /<repo-name>/). Set BASE_PATH in the environment to change it.
  base: process.env.BASE_PATH || '/',
  plugins: [
    extensionsServe(),
    liAppsServe(),
    artWallpapersServe(),
    sourceFile404(),
    versionManifest(),
    // `enforce: 'pre'`, so islands are compiled before the preact plugin sees
    // them; the exclude below is still required so preact doesn't then wrap
    // Solid output in prefresh.
    solid({ include: [ISLAND_JSX] }),
    // The preset's default exclude is `[/node_modules/]` and passing `exclude`
    // replaces it, so node_modules has to be restated.
    preact({ exclude: [/node_modules/, ISLAND_DIR] }),
  ],
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Static HTML games in public/ use <base href> + type="module" scripts
    // with relative paths that the dep scanner can't resolve.  Restrict
    // scanning to the real entry and explicitly include the Preact compat
    // layer so hooks / routing work from the first page load.
    entries: ['index.html'],
    include: [
      'preact', 'preact/compat', 'preact/compat/client', 'preact/hooks',
      '@prefresh/core', '@prefresh/utils',
      // Island deps are pre-bundled too: without this the Solid runtime is
      // discovered at request time and the first low-end island import 504s.
      'solid-js', 'solid-js/web',
      // Heavy deps used by lazy-loaded pages — must be pre-bundled so
      // Vite doesn't discover them at request time and 504 the dynamic import.
      '@preact/signals', '@preact/signals-core',
      '@mozilla/readability',
      'fflate',
    ],
  },
  server: {
    host: 'localhost',
    open: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    watch: {
      ignored: ['**/public/html-games/**'],
    },
  },
  // PostCSS (with Tailwind) handles all CSS transformation including
  // @tailwind directive expansion and @apply processing. Lightning CSS
  // is used only for production minification via cssMinify.
  css: {
    lightningcss: {
      targets: { chrome: 100, firefox: 100, safari: 15, edge: 100 },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Group heavy vendor trees into separate chunks so they
        // cache independently and can be loaded on demand.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Heavy optional deps — loaded only when the feature is used.
            if (id.includes('@mozilla')) return 'vendor-readability';
            // The whole point of an island is that its runtime is not in the
            // base bundle: low-end mode is opt-in, so solid-js ships as its own
            // lazily-fetched chunk alongside the island components.
            if (id.includes('solid-js') || id.includes('solid-refresh')) return 'vendor-solid';
            if (id.includes('preact')) return 'vendor-preact';
            return 'vendor';
          }
          /* Deliberately no rule for src/islands/**. Every island is already a
           * dynamic import, so Rollup splits it on its own and hoists shared
           * modules (thumbCache -> fileSystem -> the storage/WASM tree) into the
           * chunk the file manager loads anyway. Forcing all islands into one
           * named chunk anchors that shared tree *inside* it, which makes the
           * Preact path depend on the island chunk - the opposite of the point
           * of lazy islands. */
        },
      },
    },
    // Enable terser for aggressive minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
    },
    chunkSizeWarningThreshold: 600,
    cssCodeSplit: true,
    cssMinify: 'lightningcss',
    sourcemap: false,
    target: 'es2020',
  },
});
