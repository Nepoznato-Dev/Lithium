import { defineConfig } from 'vite';
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import preact from '@preact/preset-vite';

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

/** Serve .li app files from lithiumApps/src/ under /li-apps/. */
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

function liAppsServe() {
  const liAppsRoot = resolve(__dirname, '../lithiumApps/src');
  const liAppsBase = resolve(__dirname, '../lithiumApps');
  return {
    name: 'li-apps-serve',
    configureServer(server) {
      // Serve lithiumApps/src/ contents at /li-apps/
      server.middlewares.use('/li-apps', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(liAppsRoot, '.' + urlPath);
        // Prevent directory traversal.
        if (!filePath.startsWith(liAppsRoot)) return next();
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            const ext = extname(filePath);
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            res.end(readFileSync(filePath));
            return;
          }
        } catch {
          // File not found — fall through to next middleware.
        }
        next();
      });
      // Serve launcher.li and other root-level .li files at /li-apps-launcher/
      server.middlewares.use('/li-apps-launcher', (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(liAppsBase, '.' + urlPath);
        if (!filePath.startsWith(liAppsBase)) return next();
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            const ext = extname(filePath);
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            res.end(readFileSync(filePath));
            return;
          }
        } catch {
          // File not found.
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Overridable so the same build works at the domain root (Vercel/Netlify)
  // and under a sub-path (GitHub Pages project sites serve from
  // /<repo-name>/). Set BASE_PATH in the environment to change it.
  base: process.env.BASE_PATH || '/',
  plugins: [liAppsServe(), sourceFile404(), preact()],
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
      'react-router', 'react-router-dom',
      '@prefresh/core', '@prefresh/utils',
      // Heavy deps used by lazy-loaded pages — must be pre-bundled so
      // Vite doesn't discover them at request time and 504 the dynamic import.
      '@preact/signals', '@preact/signals-core',
      '@supabase/supabase-js', '@supabase/postgrest-js', '@supabase/auth-js', '@supabase/realtime-js',
      '@mozilla/readability',
      'fflate',
    ],
  },
  server: {
    host: 'localhost',
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    watch: {
      ignored: ['**/public/html-games/**'],
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
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('music-metadata')) return 'vendor-audio';
            if (id.includes('@mozilla')) return 'vendor-readability';
            if (id.includes('react-router') || id.includes('preact')) return 'vendor-router';
            return 'vendor';
          }
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
