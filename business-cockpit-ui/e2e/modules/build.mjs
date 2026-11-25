// Builds the three test modules, each into <module>/dist with a bc-manifest.json, and runs bc-check-entries on it.
// Each module id is the name of its folder; the build id is new for every build (module-loading.md).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { build } from 'esbuild';
import { createManifest } from '@acme/bc-module-kit';

const here = new URL('.', import.meta.url).pathname;
const MODULES = {
  'react-module': { Header: 'header.js', UserTaskList: 'user-task-list.js', UserTaskForm: 'user-task-form.js', FormViews: 'form-views.jsx', HeaderViews: 'header-views.jsx' },
  'vue-module': { WorkflowList: 'workflow-list.js', WorkflowPage: 'workflow-page.js', PageViews: 'page-views.js' },
  'angular-module': { Header: 'header.js', UserTaskList: 'user-task-list.js', HeaderElements: 'header-elements.ts' },
};
const checkScript = join(here, '../../packages/bc-module-kit/bin/bc-check-entries.mjs');

for (const [moduleId, sources] of Object.entries(MODULES)) {
  const folder = join(here, moduleId);
  const dist = join(folder, 'dist');
  const buildTimestamp = new Date();
  rmSync(dist, { recursive: true, force: true });
  writeFileSync(join(folder, 'src/bc-build.js'), `export const WORKFLOW_MODULE_ID = '${moduleId}';\nexport const BUILD_ID = '${buildTimestamp.getTime().toString(36)}';\n`);
  const result = await build({
    entryPoints: Object.fromEntries(Object.entries(sources).map(([entry, file]) => [entry, join(folder, 'src', file)])),
    outdir: dist, bundle: true, splitting: true, format: 'esm', target: 'es2022', minify: true, metafile: true,
    entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]', jsx: 'automatic',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
    define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    absWorkingDir: folder, logLevel: 'warning',
  });
  const entries = {};
  for (const [file, meta] of Object.entries(result.metafile.outputs)) {
    if (!meta.entryPoint) continue;
    const entry = Object.keys(sources).find((name) => basename(meta.entryPoint).startsWith(sources[name].replace(/\.\w+$/, '')) && sources[name] === basename(meta.entryPoint));
    entries[entry] = file.replace(/^.*?dist\//, '');
  }
  writeFileSync(join(dist, 'bc-manifest.json'), JSON.stringify(createManifest({ entries, buildVersion: '1.0.0', buildTimestamp: buildTimestamp.toISOString() }), null, 2));
  const check = spawnSync('node', [checkScript, join(dist, 'bc-manifest.json')], { encoding: 'utf8' });
  if (check.status !== 0) { console.error(`${moduleId}: ${check.stderr}`); process.exit(1); }
  console.log(`${moduleId}: built, ${Object.keys(entries).length} entries, checked`);
}
