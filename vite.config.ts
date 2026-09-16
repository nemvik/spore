import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // Historical evidence contains complete frozen apps; only scan the live entry.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1',
    watch: { usePolling: true, interval: 500, ignored: [/(^|[/\\])(evidence|\.playwright-mcp|\.pnpm-store)([/\\]|$)/] },
  },
  build: { target: 'es2022' },
});
