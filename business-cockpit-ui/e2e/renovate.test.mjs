// PKG-032: renovate.json groups the updates of each framework and of the design library across all
// workspaces, and leaves the dependencies between the workspaces alone.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const renovate = JSON.parse(readFileSync(join(root, 'renovate.json'), 'utf8'));
const groups = new Map((renovate.packageRules ?? []).filter((rule) => rule.groupName)
  .map((rule) => [rule.groupName, rule.matchPackageNames]));

test('PKG-032 each framework of the interview and the design library has one group', () => {
  assert.deepEqual([...groups.keys()].sort(), ['angular', 'react', 'vue', 'vuetify']);
  assert.ok(groups.get('react').includes('react') && groups.get('react').includes('react-dom'));
  assert.ok(groups.get('react').includes('@types/react') && groups.get('react').includes('@types/react-dom'));
  assert.ok(groups.get('vue').includes('vue') && groups.get('vue').includes('vue-tsc'));
  assert.ok(groups.get('vuetify').includes('vuetify'));
  assert.ok(groups.get('angular').some((name) => name.startsWith('@angular/')));
});

test('PKG-032 every framework package a workspace depends on is in the group of its framework', () => {
  const folders = readdirSync(join(root, 'packages')).map((name) => `packages/${name}`);
  const used = new Set();
  for (const folder of folders) {
    const manifest = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'));
    for (const kind of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const name of Object.keys(manifest[kind] ?? {})) used.add(name);
    }
  }
  const grouped = new Set([...groups.values()].flat().filter((name) => !name.includes('*')));
  const prefixes = [...groups.values()].flat().filter((name) => name.endsWith('*')).map((name) => name.slice(0, -1));
  for (const name of ['vue', 'vuetify', 'react', 'react-dom', '@angular/core']) {
    if (!used.has(name)) continue;
    assert.ok(grouped.has(name) || prefixes.some((prefix) => name.startsWith(prefix)), `${name} is in no group`);
  }
});

test('PKG-032 the dependencies between the workspaces are left alone', () => {
  assert.notEqual(renovate.updateInternalDeps, true);
  const ignored = renovate.ignoreDeps ?? [];
  assert.ok(ignored.includes('@acme/*') || ignored.length > 0 || (renovate.packageRules ?? [])
    .some((rule) => rule.enabled === false && (rule.matchPackageNames ?? []).includes('@acme/*')),
  'the @acme packages are not excluded');
});
