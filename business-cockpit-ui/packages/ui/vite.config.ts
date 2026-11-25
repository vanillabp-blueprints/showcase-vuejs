import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const devServerPort = 5173;

// index.html is the shell. Every other file lies below /assets/, which the backend serves.
// The dev server listens where the backend looks for it, serves the same base path as the
// built bundle, and answers an unknown path with index.html (appType 'spa').
export default defineConfig({
  base: '/',
  plugins: [vue()],
  build: { outDir: 'dist', assetsDir: 'assets' },
  appType: 'spa',
  server: {
    host: '127.0.0.1',
    port: devServerPort,
    strictPort: true,
    // The backend forwards no WebSocket, so the hot reload connects to the dev server directly.
    hmr: { clientPort: devServerPort },
  },
});
