// S31: the libraries a workflow module builds against, and the bundle that must not contain a module.
// Run them with `node --test e2e/module-kit.test.mjs` after `npm run build`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const readText = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(readText(path));
const bundleFiles = () =>
  readdirSync(join(root, 'packages/ui/dist'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

test('PKG-006 the types library has no dependencies and no peer dependencies', () => {
  const manifest = readJson('packages/bc-types/package.json');

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(Object.keys(manifest[field] ?? {}), [], field);
  }
});

test('PKG-006 the built types library imports no other package', () => {
  const files = readdirSync(join(root, 'packages/bc-types/dist'), { recursive: true }).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'bc-types is not built');
  for (const file of files) {
    const imports = [...readText(`packages/bc-types/dist/${file}`).matchAll(/from\s+['"]([^'"]+)['"]/g)];
    assert.deepEqual(imports.map((m) => m[1]).filter((name) => !name.startsWith('.')), [], file);
  }
});

test('PKG-017 ui-uri-types.json is in the types library with one constant for each value', async () => {
  const manifest = readJson('packages/bc-types/package.json');
  const entries = readJson('packages/bc-types/ui-uri-types.json');
  const types = await import(join(root, 'packages/bc-types/dist/index.js'));

  assert.ok(manifest.files.includes('ui-uri-types.json'), 'the file is not published');
  assert.deepEqual(entries.map((entry) => entry.name), ['ES_MODULES', 'EXTERNAL']);
  for (const entry of entries) {
    assert.ok(entry.description.length > 0, `${entry.name} has no description`);
    assert.equal(types[`UI_URI_TYPE_${entry.name}`], entry.name);
  }
});

test('PKG-033 the theme sets exactly the custom properties the types library names', async () => {
  const { THEME_TOKENS } = await import(join(root, 'packages/bc-types/dist/index.js'));
  const theme = await import(join(root, 'packages/bc-theme/dist/index.js'));
  const css = readText('packages/bc-theme/dist/theme.css');
  const defined = [...css.matchAll(/(--bc-[a-z-]+)\s*:/g)].map((m) => m[1]);

  assert.ok(THEME_TOKENS.length > 0);
  assert.deepEqual([...new Set(defined)].sort(), [...THEME_TOKENS].sort());
  assert.deepEqual(Object.keys(theme.themeValues).sort(), [...THEME_TOKENS].sort());
  assert.match(css, /:root/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
});

test('PKG-033 the theme library has no dependencies', () => {
  assert.deepEqual(Object.keys(readJson('packages/bc-theme/package.json').dependencies ?? {}), []);
});

test('PKG-033 the user interface and every dev shell take their look from the theme', () => {
  assert.match(readText('packages/ui/src/main.ts'), /installTheme\(/);
  for (const framework of ['vue', 'react', 'angular']) {
    assert.match(readText(`packages/bc-dev-shell-${framework}/src/index.ts`), /installTheme\(/, framework);
  }
});

test('PKG-009 the bundle contains no part of a workflow module', () => {
  const files = bundleFiles();
  assert.ok(files.length > 0, 'the user interface is not built');
  assert.deepEqual(files.filter((f) => f.endsWith('bc-manifest.json')), []);
  const manifest = readJson('packages/ui/package.json');
  const moduleDependencies = Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@acme/bc-') && !['@mdi/js', 'vue', 'vuetify'].includes(name));
  assert.deepEqual(moduleDependencies, [], 'a dependency which is no library of the cockpit');
  for (const file of files.filter((f) => /\.(js|html|css)$/.test(f))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /bc-manifest\.json.*entries\/|userTaskListColumns\s*:\s*['"]\.\//s, file);
  }
});

test('PKG-020 the bundle has no import map, no es-module-shims and no module federation', () => {
  const manifest = readText('packages/ui/package.json') + readText('package.json');
  assert.doesNotMatch(manifest, /es-module-shims|module-federation|federation/i);
  for (const file of bundleFiles().filter((f) => /\.(js|html)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /type="importmap"|es-module-shims|@module-federation|__federation|remoteEntry/i, file);
  }
});

function runCheck(files, ...flags) {
  const folder = mkdtempSync(join(tmpdir(), 'bc-check-'));
  mkdirSync(join(folder, 'dist'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, 'dist', name), content);
  const script = join(root, 'packages/bc-module-kit/bin/bc-check-entries.mjs');
  return spawnSync('node', [script, join(folder, 'dist/bc-manifest.json'), ...flags], { encoding: 'utf8' });
}
const manifestOf = (entries) => JSON.stringify({ manifestVersion: 1, entries });

test('PKG-039 bc-check-entries is a bin of the module kit without dependencies', () => {
  const manifest = readJson('packages/bc-module-kit/package.json');
  assert.equal(manifest.bin['bc-check-entries'], 'bin/bc-check-entries.mjs');
  assert.ok(manifest.files.includes('bin'));
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).filter((name) => !name.startsWith('@acme/')), []);
  const imports = [...readText('packages/bc-module-kit/bin/bc-check-entries.mjs').matchAll(/^import .* from '([^']+)'/gm)];
  assert.deepEqual(imports.map((m) => m[1]).filter((name) => !name.startsWith('node:')), []);
});

test('PKG-039 it passes for a manifest whose entries have files', () => {
  const result = runCheck({ 'bc-manifest.json': manifestOf({ UserTaskList: 'list.js' }), 'list.js': 'export const userTaskListColumns = () => [];' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('PKG-039 it fails when an entry of the manifest has no file', () => {
  const result = runCheck({ 'bc-manifest.json': manifestOf({ UserTaskList: 'missing.js' }) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UserTaskList.*missing\.js/);
});

test('PKG-039 it fails when a data entry with its imports is larger than the limit', () => {
  const files = { 'bc-manifest.json': manifestOf({ UserTaskList: 'list.js' }), 'list.js': "import './chunk.js';", 'chunk.js': `export const x = "${'a'.repeat(3000)}";` };
  assert.notEqual(runCheck(files, '--limit', '2kb').status, 0);
  assert.equal(runCheck(files, '--limit', '4kb').status, 0);
});

test('PKG-039 it fails when a data entry contains framework code', () => {
  const result = runCheck({ 'bc-manifest.json': manifestOf({ Header: 'h.js' }), 'h.js': 'const a = "__vue_app__";' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /framework/);
});

test('PKG-039 a visual entry may be large and may contain a framework', () => {
  const result = runCheck({ 'bc-manifest.json': manifestOf({ FormViews: 'f.js' }), 'f.js': `/* @license React */ ${'a'.repeat(9000)}` }, '--limit', '1kb');
  assert.equal(result.status, 0, result.stderr);
});
