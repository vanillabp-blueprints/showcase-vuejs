// PKG-034, DS-001: one dev shell package per framework of the modules, each with its framework as a peer dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
// Q-MODULE-FRAMEWORKS: Vue 3.5, React 19, Angular 20 (zoneless)
const frameworks = { vue: ['vue'], react: ['react', 'react-dom'], angular: ['@angular/core', '@angular/platform-browser'] };

const manifestOf = (framework) => JSON.parse(readFileSync(`${root}packages/bc-dev-shell-${framework}/package.json`, 'utf8'));

test('DS-001 there is a dev shell package for vue, react and angular, each built into dist', () => {
  for (const framework of Object.keys(frameworks)) {
    const folder = `${root}packages/bc-dev-shell-${framework}`;
    assert.ok(existsSync(`${folder}/src/index.ts`), framework);
    assert.equal(manifestOf(framework).name, `@acme/bc-dev-shell-${framework}`);
    assert.ok(existsSync(`${folder}/dist/index.js`), `${framework}: run the build first`);
  }
});

test('PKG-034 each dev shell has its framework as peer dependency, the kit and the theme as dependencies', () => {
  for (const [framework, peers] of Object.entries(frameworks)) {
    const { peerDependencies = {}, dependencies = {} } = manifestOf(framework);
    for (const peer of peers) {
      assert.ok(peerDependencies[peer], `${framework}: ${peer} is no peer dependency`);
      assert.equal(dependencies[peer], undefined, `${framework}: ${peer} must not be a dependency`);
    }
    assert.ok(dependencies['@acme/bc-module-kit'], `${framework}: the module kit is no dependency`);
    assert.ok(dependencies['@acme/bc-theme'], `${framework}: the theme library is no dependency`);
    for (const other of Object.values(frameworks).flat().filter((name) => !peers.includes(name))) {
      assert.equal(peerDependencies[other], undefined, `${framework}: ${other} belongs to another framework`);
    }
  }
});
