import { defineConfig } from 'vite';

// VITE_POLL=1 turns on polling file-watch, needed when the source is bind-mounted into Docker on macOS/Windows
export default defineConfig({
  server: { host: true, port: 5173, strictPort: true, watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 1500 },
});
