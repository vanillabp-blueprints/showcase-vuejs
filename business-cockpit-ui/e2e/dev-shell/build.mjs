// Builds the test applications of the dev shells (Vue, React, Angular) into dist; the simulator serves it below /dev-shell-app/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const here = new URL('.', import.meta.url).pathname;
rmSync(`${here}dist`, { recursive: true, force: true });
mkdirSync(`${here}dist`);
const apps = { index: 'app.js', react: 'react-app.js', angular: 'angular-app.ts' };
for (const [page, source] of Object.entries(apps)) {
  await build({
    entryPoints: [`${here}src/${source}`], outfile: `${here}dist/${page === 'index' ? 'app' : page}.js`, bundle: true, format: 'esm', target: 'es2022', logLevel: 'warning', jsx: 'automatic',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
    define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  });
  writeFileSync(`${here}dist/${page}.html`, `<!doctype html><html><head><meta charset="utf-8"><title>Dev shell ${page}</title></head><body><div id="dev-shell"></div><script type="module" src="${page === 'index' ? 'app' : page}.js"></script></body></html>\n`);
}
console.log('dev-shell test application: built');
