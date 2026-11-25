// Tests of the TypeScript simulator the end-to-end tests run against.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { startSimulator } from './simulator/simulator.ts';

const root = new URL('..', import.meta.url).pathname;
let simulator;
let base;

before(async () => {
  simulator = await startSimulator({ port: 0 });
  base = `http://127.0.0.1:${simulator.port}`;
});
after(() => simulator.stop());

const json = (path, init) => fetch(base + path, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => undefined), headers: r.headers }));
const post = (path, body, headers = {}) => json(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('PKG-054 the simulator lives in e2e/simulator and starts with no Java and no backend', () => {
  assert.ok(readdirSync(`${root}e2e/simulator`).includes('simulator.ts'));
  const source = readFileSync(`${root}e2e/simulator/simulator.ts`, 'utf8');
  assert.doesNotMatch(source, /\b(mvn|java|spring)\b/i);
});

test('PKG-054 it takes the types of its answers from the generated OpenAPI types', () => {
  const source = readFileSync(`${root}e2e/simulator/simulator.ts`, 'utf8');
  assert.match(source, /from '\.\.\/\.\.\/packages\/ui\/src\/generated\/cockpit-gui-api\/types\.gen\.ts'/);
  assert.match(source, /from '\.\.\/\.\.\/packages\/ui\/src\/generated\/official-gui-api\/types\.gen\.ts'/);
});

test('PKG-054 the GUI API answers under /gui/api/v1', async () => {
  const info = await json('/gui/api/v1/app/info');
  assert.equal(info.status, 200);
  assert.equal(typeof info.body.titleShort, 'string');
  assert.equal(typeof info.body.version, 'string');
});

test('PKG-054 the BPMS API registers a module, and the official GUI API lists it only for a user in its groups', async () => {
  assert.equal((await post('/bpms/api/v1_1/workflow-module/orders', { uri: '/wm/vue-module/', accessibleToGroups: ['sales'] })).status, 200);
  assert.equal((await post('/bpms/api/v1_1/workflow-module/public', { uri: '/wm/react-module/' })).status, 200);
  const seen = async (userId) => {
    const set = await fetch(`${base}/dev-shell/user/${userId}`, { method: 'POST' });
    const cookie = (set.headers.get('set-cookie') ?? '').split(';')[0];
    const list = await fetch(`${base}/official-api/gui/api/v1/workflow-module`, { headers: { cookie } });
    return (await list.json()).modules.map((m) => m.id).sort();
  };
  assert.deepEqual(await seen('anna'), ['orders', 'public']);
  assert.deepEqual(await seen('ben'), ['public']);
});

test('PKG-054 the dev shell chooses a user: a cookie with HttpOnly, and --- logs out', async () => {
  assert.equal((await json('/dev-shell/user/all/id')).body.includes('anna'), true);
  const set = await fetch(`${base}/dev-shell/user/anna`, { method: 'POST' });
  assert.match(set.headers.get('set-cookie'), /^bc=.+; Path=\/; HttpOnly/);
  assert.equal((await fetch(`${base}/dev-shell/user/unknown`, { method: 'POST' })).status, 404);
  assert.match((await fetch(`${base}/dev-shell/user/---`, { method: 'POST' })).headers.get('set-cookie'), /^bc=;/);
});

test('PKG-054 a change of the data sends an event on the update stream', async () => {
  const controller = new AbortController();
  const response = await fetch(`${base}/gui/api/v1/updates`, { signal: controller.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  await post('/bpms/api/v1_1/workflow-module/orders/usertask/t1', { workflowModuleId: 'orders', title: { en: 'Check' } });
  let received = '';
  const decoder = new TextDecoder();
  for (let i = 0; i < 10 && !received.includes('event: UserTask'); i++) {
    received += decoder.decode((await reader.read()).value);
  }
  controller.abort();
  assert.match(received, /event: UserTask/);
  assert.match(received, /"workflowModuleId": "orders"/);
});

test('PKG-054 it serves no module other than the three test modules and the conformance modules', async () => {
  for (const id of ['react-module', 'vue-module', 'angular-module']) {
    assert.notEqual((await fetch(`${base}/wm/${id}/index.js`)).status, 500);
  }
  assert.equal((await fetch(`${base}/wm/other-module/index.js`)).status, 404);
});

test('PKG-054 reset empties the data of a test', async () => {
  await post('/simulator-api/reset', {});
  const asAnna = await fetch(`${base}/dev-shell/user/anna`, { method: 'POST' });
  const cookie = (asAnna.headers.get('set-cookie') ?? '').split(';')[0];
  const list = await fetch(`${base}/official-api/gui/api/v1/workflow-module`, { headers: { cookie } });
  assert.deepEqual((await list.json()).modules, []);
});
