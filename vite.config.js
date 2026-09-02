import { defineConfig } from 'vite';
import { existsSync } from 'fs';
import { resolve } from 'path';
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

export default defineConfig({
  plugins: [sourceFile404(), preact()],
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
    include: ['preact/compat', 'preact/compat/client', 'preact/hooks', 'react-router-dom'],
  },
  server: {
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
            if (id.includes('react-router') || id.includes('preact')) return 'vendor-router';
            if (id.includes('@wllama')) return 'vendor-ai';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningThreshold: 600,
    cssCodeSplit: true,
    sourcemap: false,
    target: 'es2020',
  },
});
