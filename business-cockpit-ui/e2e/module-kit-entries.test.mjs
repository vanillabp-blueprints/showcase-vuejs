// S32: export names, data entries, what bc-check-entries rejects, and the package edges of the kit and host.
// Run with `node --test e2e/module-kit-entries.test.mjs` after `npm run build`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const readText = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(readText(path));
const sourceFiles = (folder) =>
  readdirSync(join(root, folder), { recursive: true }).filter((f) => /\.(ts|vue|js|mjs)$/.test(f)).map((f) => join(folder, f));

function runCheck(files, ...flags) {
  const folder = mkdtempSync(join(tmpdir(), 'bc-check-'));
  mkdirSync(join(folder, 'dist'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(folder, 'dist', name, '..'), { recursive: true });
    writeFileSync(join(folder, 'dist', name), content);
  }
  const script = join(root, 'packages/bc-module-kit/bin/bc-check-entries.mjs');
  return spawnSync('node', [script, join(folder, 'dist/bc-manifest.json'), ...flags], { encoding: 'utf8' });
}
const manifestOf = (entries) => JSON.stringify({ manifestVersion: 1, entries });
const kit = () => import(join(root, 'packages/bc-module-kit/dist/index.js'));

test('PKG-041 EXPORT_NAMES maps the four minimum entries and the interview entries, DATA_ENTRIES is its keys', async () => {
  const { EXPORT_NAMES, DATA_ENTRIES, AREA_ALL } = await kit();
  assert.deepEqual(EXPORT_NAMES, {
    UserTaskList: 'userTaskListColumns', WorkflowList: 'workflowListColumns', UserTaskForm: 'userTaskForm',
    WorkflowPage: 'workflowPage', Header: 'header',
  });
  assert.deepEqual([...DATA_ENTRIES], Object.keys(EXPORT_NAMES));
  assert.equal(AREA_ALL, 'all');
  assert.doesNotMatch(readText('packages/bc-types/src/index.ts'), /DATA_ENTRIES\s*(:[^=]+)?=\s*\[/, 'DATA_ENTRIES is a list of its own');
});

test('PKG-041 bc-check-entries takes its data entries from EXPORT_NAMES, also for the interview ones', () => {
  const big = `export const x = "${'a'.repeat(3000)}";`;
  for (const entry of ['UserTaskList', 'UserTaskForm', 'WorkflowPage', 'Header']) {
    const result = runCheck({ 'bc-manifest.json': manifestOf({ [entry]: 'e.js' }), 'e.js': big }, '--limit', '2kb');
    assert.equal(result.status, 1, `${entry}: ${result.stderr}`);
  }
  assert.equal(runCheck({ 'bc-manifest.json': manifestOf({ OwnEntry: 'e.js' }), 'e.js': big }, '--limit', '2kb').status, 0);
  assert.equal(runCheck({ 'bc-manifest.json': manifestOf({ OwnEntry: 'e.js' }), 'e.js': big }, '--limit', '2kb', '--data-entry', 'OwnEntry').status, 1);
});

test('PKG-041 the default limit is 32 KB of 1024 bytes', () => {
  const entry = (bytes) => ({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': `//${'a'.repeat(bytes - 2)}` });
  assert.equal(runCheck(entry(32 * 1024)).status, 0);
  assert.equal(runCheck(entry(32 * 1024 + 1)).status, 1);
});

test('PKG-042 bc-check-entries fails for a bare import, also in an imported file', () => {
  const direct = runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': "import { ref } from 'vue';" });
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /vue/);
  const indirect = runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': "import './c.js';", 'c.js': 'const lazy = () => import("react");' });
  assert.equal(indirect.status, 1);
  assert.match(indirect.stderr, /react/);
  assert.equal(runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': "import './c.js';", 'c.js': 'export {}' }).status, 0);
});

test('PKG-042 bc-check-entries fails for a file outside the folder of the manifest and for a file that does not exist', () => {
  const outside = runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': "import '../other.js';" });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /outside/);
  const missing = runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': "import './gone.js';" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /gone\.js.*does not exist/);
});

test('PKG-042 bc-check-entries fails for a file of the manifest that is an address, absolute or goes up', () => {
  for (const file of ['https://example.org/h.js', '//example.org/h.js', '/h.js', '../h.js', 'a/../h.js']) {
    const result = runCheck({ 'bc-manifest.json': manifestOf({ Header: file }) });
    assert.equal(result.status, 1, file);
    assert.match(result.stderr, /Header/, file);
  }
  assert.equal(runCheck({ 'bc-manifest.json': manifestOf({ Header: 'sub/h.js' }), 'sub/h.js': "import '../c.js';", 'c.js': '' }).status, 0);
});

test('PKG-040 bc-check-entries passes for data entries which import files only and fails for one which imports a framework', () => {
  const passing = runCheck({
    'bc-manifest.json': manifestOf({ UserTaskList: 'list.js', UserTaskForm: 'form.js', FormViews: 'views.js' }),
    'list.js': 'export const userTaskListColumns = () => [];', 'form.js': "export { userTaskForm } from './f.js';", 'f.js': 'export const userTaskForm = () => undefined;',
    'views.js': '/* @license React */ import "react";',
  });
  assert.equal(passing.status, 0, passing.stderr);
  const failing = runCheck({ 'bc-manifest.json': manifestOf({ UserTaskList: 'list.js' }), 'list.js': "import React from 'react';" });
  assert.equal(failing.status, 1);
});

test('PKG-040 bc-check-entries passes for every built module of the repository', () => {
  const manifests = readdirSync(root, { recursive: true }).filter((f) => !f.includes('node_modules') && f.endsWith('bc-manifest.json'));
  for (const manifest of manifests) {
    const result = spawnSync('node', [join(root, 'packages/bc-module-kit/bin/bc-check-entries.mjs'), join(root, manifest)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${manifest}: ${result.stderr}`);
  }
});

test('PKG-043 the module kit exports every constant of the types library, the minimum names and no host', async () => {
  const types = await import(join(root, 'packages/bc-types/dist/index.js'));
  const exported = await kit();
  for (const name of Object.keys(types)) assert.deepEqual(exported[name], types[name], name);
  assert.deepEqual(
    [exported.USER_TASK_LIST, exported.WORKFLOW_LIST, exported.USER_TASK_FORM, exported.WORKFLOW_PAGE, exported.AREA_ALL],
    ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage', 'all'],
  );
  assert.equal(exported.HEADER, 'Header');
  assert.deepEqual([exported.AREA_BODY, exported.AREA_INFORMATION, exported.AREA_ACTIONS], ['body', 'information', 'actions']);
  assert.ok(Object.isFrozen(exported.DATA_ENTRIES) && Array.isArray(exported.DATA_ENTRIES));
  assert.equal(Object.keys(exported).filter((name) => /host/i.test(name)).length, 0);
});

test('PKG-043 the module kit neither depends on nor bundles @vanillabp/bc-module-kit', () => {
  const manifest = readText('packages/bc-module-kit/package.json');
  assert.doesNotMatch(manifest, /@vanillabp/);
  for (const file of sourceFiles('packages/bc-module-kit/src')) assert.doesNotMatch(readText(`packages/bc-module-kit/${file.replace('packages/bc-module-kit/', '')}`), /@vanillabp/, file);
  assert.doesNotMatch(readText('packages/bc-module-kit/dist/index.js'), /@vanillabp/);
});

test('PKG-048 the module kit depends on the types library only, has no peer dependencies and a module builds against it alone', () => {
  const manifest = readJson('packages/bc-module-kit/package.json');
  assert.deepEqual(Object.keys(manifest.dependencies), ['@acme/bc-types']);
  for (const field of ['peerDependencies', 'optionalDependencies', 'devDependencies']) assert.deepEqual(Object.keys(manifest[field] ?? {}), [], field);
  assert.match(readText('packages/bc-module-kit/src/index.ts'), /export \* from '@acme\/bc-types'/);

  const folder = mkdtempSync(join(root, 'e2e/.module-'));
  try {
    writeFileSync(join(folder, 'module.ts'), `import { EXPORT_NAMES, USER_TASK_FORM, type UserTask } from '@acme/bc-module-kit';
export const userTaskForm = (task: UserTask) => (task.id ? { element: 'x-form', entry: 'Views' } : undefined);
export const name: string = EXPORT_NAMES[USER_TASK_FORM];
`);
    const tsc = join(root, 'node_modules/.bin/tsc');
    const result = spawnSync(tsc, ['--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', join(folder, 'module.ts')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('PKG-049 the module host depends on the module kit only and has no framework', () => {
  const manifest = readJson('packages/bc-module-host/package.json');
  assert.deepEqual(Object.keys(manifest.dependencies), ['@acme/bc-module-kit']);
  for (const field of ['peerDependencies', 'optionalDependencies', 'devDependencies']) assert.deepEqual(Object.keys(manifest[field] ?? {}), [], field);
  for (const file of sourceFiles('packages/bc-module-host/src')) {
    const imports = [...readText(`packages/bc-module-host/${file.replace('packages/bc-module-host/', '')}`).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((name) => !name.startsWith('.') && name !== '@acme/bc-module-kit'), [], file);
  }
});

test('PKG-049 the user interface uses the module host and no other code of it imports a module', () => {
  assert.ok(Object.keys(readJson('packages/ui/package.json').dependencies).includes('@acme/bc-module-host'));
  for (const file of sourceFiles('packages/ui/src')) {
    assert.doesNotMatch(readText(file), /\bimport\s*\(/, `${file} calls import()`);
  }
});
