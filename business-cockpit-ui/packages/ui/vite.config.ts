import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';
import { describeMissing, missingKeys } from '../../scripts/check-languages.mjs';

const devServerPort = 5173;
// The port the browser reaches the dev server at, when it differs: a dev container publishes its
// ports with an offset, for example BC_DEV_SERVER_PUBLIC_PORT=35173.
const browserPort = Number(process.env.BC_DEV_SERVER_PUBLIC_PORT ?? devServerPort);

// The build fails when a language file misses a key of the default language (I18N-006).
const languageFilesComplete = (): Plugin => ({
  name: 'language-files-complete',
  apply: 'build',
  async buildStart() {
    const missing = await missingKeys(process.env.BC_I18N_FOLDER ?? 'src/i18n');
    if (missing.length > 0) this.error(describeMissing(missing));
  },
});

// index.html is the shell. Every other file lies below /assets/, which the backend serves.
// The dev server listens where the backend looks for it, serves the same base path as the
// built bundle, and answers an unknown path with index.html (appType 'spa').
export default defineConfig({
  base: '/',
  plugins: [vue(), languageFilesComplete()],
  build: { outDir: 'dist', assetsDir: 'assets' },
  appType: 'spa',
  server: {
    host: '127.0.0.1',
    port: devServerPort,
    strictPort: true,
    // The backend forwards no WebSocket, so the hot reload connects to the dev server directly.
    hmr: { clientPort: browserPort },
  },
});
