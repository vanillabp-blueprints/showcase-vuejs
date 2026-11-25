// S33: names of web components, the three test modules, and the export names of the module host.
// Run with `node --test e2e/module-kit-names.test.mjs` after `npm run build`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const readText = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(readText(path));
const kit = () => import(join(root, 'packages/bc-module-kit/dist/index.js'));
const sourcesOf = (folder) => readdirSync(join(root, folder), { recursive: true }).filter((f) => /\.(ts|tsx|jsx|vue|js|mjs)$/.test(f)).map((f) => join(folder, f));

test('PKG-051 elementPrefix gives taxi-ride, loan-approval-2 and wm-4711', async () => {
  const { elementPrefix } = await kit();
  assert.equal(elementPrefix('TaxiRide'), 'taxi-ride');
  assert.equal(elementPrefix('taxi-ride'), 'taxi-ride');
  assert.equal(elementPrefix('loan_approval.2'), 'loan-approval-2');
  assert.equal(elementPrefix('4711'), 'wm-4711');
});

test('PKG-051 the module host checks names with the elementPrefix of the module kit and writes no prefix rule of its own', () => {
  const host = readText('packages/bc-module-host/src/index.ts');
  assert.match(host, /elementPrefix[^;]*from '@acme\/bc-module-kit'|from '@acme\/bc-module-kit'/);
  assert.match(host, /elementPrefix\(workflowModuleId\)/);
  assert.doesNotMatch(host, /toLowerCase|replace\(\/\(\[a-z0-9\]\)/);
});

test('PKG-053 createElementNames builds workflow, userTask and custom names with -- between the segments', async () => {
  const { createElementNames } = await kit();
  const names = createElementNames('TaxiRide', 'mvaro4w0');
  assert.equal(names.userTask('TaxiRide', 'assessRisk', 'form'), 'taxi-ride-mvaro4w0-taxi-ride--assess-risk--form');
  assert.equal(names.workflow('TaxiRide', 'page'), 'taxi-ride-mvaro4w0-taxi-ride--page');
  assert.equal(names.custom('price-chart'), 'taxi-ride-mvaro4w0-price-chart');
  assert.equal(names.workflow('assess_risk', 'x'), names.workflow('assessRisk', 'x'));
});

test('PKG-053 createElementNames refuses a part or custom short name with --, a bad segment and a BPMN id without letter or digit', async () => {
  const { createElementNames } = await kit();
  const names = createElementNames('TaxiRide', 'mvaro4w0');
  assert.throws(() => names.userTask('TaxiRide', 'assessRisk', 'a--b'), TypeError);
  assert.throws(() => names.workflow('TaxiRide', 'a--b'), TypeError);
  assert.throws(() => names.custom('a--b'), TypeError);
  assert.throws(() => names.custom('Upper'), TypeError);
  assert.throws(() => names.custom('-a'), TypeError);
  assert.throws(() => names.workflow('__', 'page'), TypeError);
  assert.throws(() => names.userTask('TaxiRide', '..', 'form'), TypeError);
  assert.throws(() => createElementNames('TaxiRide', 'a--b'), TypeError);
});

const FRAMEWORKS = { 'react-module': 'react', 'vue-module': 'vue', 'angular-module': '@angular/core' };

test('PKG-056 the three test modules are one React, one Vue and one Angular module in the newest release of each', () => {
  const dependencies = readJson('e2e/modules/package.json').dependencies;
  for (const [folder, framework] of Object.entries(FRAMEWORKS)) {
    const latest = execFileSync('npm', ['view', framework, 'dist-tags.latest'], { encoding: 'utf8' }).trim();
    assert.equal(dependencies[framework], latest, `${folder}: ${framework}`);
    assert.ok(sourcesOf(`e2e/modules/${folder}/src`).some((file) => readText(file).includes(framework === '@angular/core' ? '@angular/core' : `'${framework}`)), folder);
  }
  assert.equal(readJson('e2e/modules/package.json').dependencies['react-dom'], dependencies.react);
});

test('PKG-056 together the modules bring every extension point and the columns differ', () => {
  const entries = Object.fromEntries(Object.keys(FRAMEWORKS).map((folder) => [folder, Object.keys(readJson(`e2e/modules/${folder}/dist/bc-manifest.json`).entries)]));
  const all = new Set(Object.values(entries).flat());
  for (const entry of ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage', 'Header']) assert.ok(all.has(entry), entry);
  assert.ok(!all.has('Pages'), 'Pages was not chosen');
  const listColumns = ['react-module/src/user-task-list.js', 'vue-module/src/workflow-list.js', 'angular-module/src/user-task-list.js'].map((f) => /id: '(\w+)'/.exec(readText(`e2e/modules/${f}`))[1]);
  assert.equal(new Set(listColumns).size, 3);
});

test('PKG-057 no code of the user interface or the host writes an export name itself', async () => {
  const { EXPORT_NAMES } = await kit();
  assert.match(readText('packages/bc-module-host/src/index.ts'), /EXPORT_NAMES\[entry\]/);
  const folders = ['packages/bc-module-host/src', 'packages/ui/src'];
  for (const file of folders.flatMap(sourcesOf).filter((f) => !f.includes('generated'))) {
    const text = readText(file);
    for (const name of Object.values(EXPORT_NAMES)) assert.doesNotMatch(text, new RegExp(`(?<!data-testid=)['"\`]${name}['"\`]`), `${file} writes ${name}`);
  }
});
