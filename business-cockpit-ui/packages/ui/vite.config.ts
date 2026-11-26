import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';
import { describeMissing, missingKeys } from '../../scripts/check-languages.mjs';

const devServerPort = 5173;
// The port the browser reaches the dev server at, when it differs: a dev container publishes its
// ports with an offset, for example BC_DEV_SERVER_PUBLIC_PORT=35173. The published port reaches the
// container from outside, not at 127.0.0.1, so then the dev server listens on all IPv4 addresses.
const browserPort = Number(process.env.BC_DEV_SERVER_PUBLIC_PORT ?? devServerPort);
const listenOn = process.env.BC_DEV_SERVER_PUBLIC_PORT ? '0.0.0.0' : '127.0.0.1';

// The build fails when a language file misses a key of the default language (I18N-006).
const languageFilesComplete = (): Plugin => ({
  name: 'language-files-complete',
  apply: 'build',
  async buildStart() {
    const missing = await missingKeys(process.env.BC_I18N_FOLDER ?? 'src/i18n');
    if (missing.length > 0) this.error(describeMissing(missing));
  },
});

// The gateway of the backend, which the browser passes on its way to the dev server, rebuilds the
// query of a request from its parsed parameters: ?vue&type=style&lang.css becomes
// ?vue=&type=style&lang.css= . Vite then no longer sees a style request and answers with raw CSS,
// which the browser refuses as a script. This puts the parameters without a value back. It runs
// before the middlewares of Vite.
const queryParametersWithoutValue = (): Plugin => ({
  name: 'query-parameters-without-value',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      request.url = request.url?.replace(/([?&][^=&]+)=(?=&|$)/g, '$1');
      next();
    });
  },
});

// index.html is the shell. Every other file lies below /assets/, which the backend serves.
// The dev server listens where the backend looks for it, serves the same base path as the
// built bundle, and answers an unknown path with index.html (appType 'spa').
export default defineConfig({
  base: '/',
  plugins: [vue(), languageFilesComplete(), queryParametersWithoutValue()],
  build: { outDir: 'dist', assetsDir: 'assets' },
  appType: 'spa',
  server: {
    host: listenOn,
    port: devServerPort,
    strictPort: true,
    // The backend forwards no WebSocket, so the hot reload connects to the dev server directly.
    hmr: { clientPort: browserPort },
  },
});
