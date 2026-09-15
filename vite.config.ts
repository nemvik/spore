import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: '127.0.0.1', watch: { usePolling: true, interval: 500 } }, build: { target: 'es2022' } });
