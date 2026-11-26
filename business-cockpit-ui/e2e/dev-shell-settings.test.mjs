// DS-023: the settings service of the dev shell keeps the settings in memory only.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createDevShellSettings } = await import('../packages/bc-module-kit/dist/dev-shell-core.js');

test('DS-023 the settings of the dev shell are in memory only: no request, no storage, a new service is empty', () => {
  const asked = [];
  const stored = [];
  globalThis.fetch = (...args) => { asked.push(args); throw new Error('no request expected'); };
  globalThis.localStorage = { setItem: (...args) => stored.push(args) };
  const settings = createDevShellSettings();
  assert.equal(settings.read('bc:language'), undefined);
  settings.write('bc:language', 'de');
  assert.equal(settings.read('bc:language'), 'de');
  assert.deepEqual(asked, []);
  assert.deepEqual(stored, []);
  assert.equal(createDevShellSettings().read('bc:language'), undefined);
});
