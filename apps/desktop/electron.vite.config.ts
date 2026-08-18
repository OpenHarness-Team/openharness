import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

// Main-only build: the renderer is the fork's official Web UI served over the
// loopback carrier, and there is no preload by design (no Electron API in the
// page). See docs/architecture.md.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
});
