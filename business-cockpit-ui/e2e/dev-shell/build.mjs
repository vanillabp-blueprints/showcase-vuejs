// Builds the test application of the Vue dev shell into dist; the simulator serves it below /dev-shell-app/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const here = new URL('.', import.meta.url).pathname;
rmSync(`${here}dist`, { recursive: true, force: true });
mkdirSync(`${here}dist`);
await build({
  entryPoints: [`${here}src/app.js`], outfile: `${here}dist/app.js`, bundle: true, format: 'esm', target: 'es2022', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
});
writeFileSync(`${here}dist/index.html`, '<!doctype html><html><head><meta charset="utf-8"><title>Dev shell</title></head><body><div id="dev-shell"></div><script type="module" src="app.js"></script></body></html>\n');
console.log('dev-shell test application: built');
