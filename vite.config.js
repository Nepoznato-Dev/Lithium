import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
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
