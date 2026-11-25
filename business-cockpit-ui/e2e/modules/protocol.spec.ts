// EXT-054, EXT-055, EXT-056, EXT-057, EXT-059: the host answers the actions of the minimum set and gives every part its properties and functions.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

const here = new URL('.', import.meta.url).pathname;
const root = join(here, '../..');

let bundle: string | undefined;
/** The module host and the actions of the cockpit as scripts, to drive them in a page which has no cockpit around it. */
async function withCockpitCode(page: Page) {
  bundle ??= (await build({
    stdin: {
      contents: `export * from './packages/bc-module-host/src/index.ts';
export * from './packages/ui/src/modules/actions.ts';
export { configureGuiApiClients } from './packages/ui/src/api/clients.ts';`,
      resolveDir: root, loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', globalName: 'bc', logLevel: 'silent', define: { 'import.meta.env': '{}' },
  })).outputFiles[0].text;
  await page.goto('/gui/api/v1/app/info');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => (window as any).bc.configureGuiApiClients());
}

const JS = 'text/javascript';
const user = { id: 'u1', displayName: 'Una' };
/** A module whose page function names one web component for each area; each component keeps what the host set. */
async function pageModule(page: Page, areas: string[]) {
  const element = Object.fromEntries(areas.map((area) => [area, `fake-module-b1-${area}`]));
  const manifest = { manifestVersion: 1, entries: { UserTaskForm: 'UserTaskForm.js', WorkflowPage: 'WorkflowPage.js', Header: 'Header.js', Views: 'Views.js' } };
  const views = areas.map((area) => `customElements.define('fake-module-b1-${area}', class extends HTMLElement {});`).join('\n')
    + `customElements.define('fake-module-b1-dialog', class extends HTMLElement { set data(value) { this.dataSeen = value; setTimeout(() => this.closeDialog('closed with ' + value), 0); } });
customElements.define('fake-module-b1-note', class extends HTMLElement {});`;
  const files: Record<string, string> = {
    'bc-manifest.json': JSON.stringify(manifest),
    'UserTaskForm.js': `export const userTaskForm = () => ({ entry: 'Views', element: ${JSON.stringify(element)} });`,
    'WorkflowPage.js': `export const workflowPage = () => ({ entry: 'Views', element: ${JSON.stringify(element)} });`,
    'Header.js': `export const header = () => ({ entry: 'Views', element: 'fake-module-b1-note' });`,
    'Views.js': views,
  };
  await page.route('**/wm/fake-module/**', (route) => {
    const body = files[new URL(route.request().url()).pathname.replace('/wm/fake-module/', '')];
    return body === undefined ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: JS, body });
  });
}

const hostOf = `(() => {
  const host = window.bc.createModuleHost({
    actions: window.bc.cockpitActions(() => host),
    context: () => ({ language: 'de', currentUser: ${JSON.stringify(user)} }),
  });
  return host;
})()`;

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('EXT-054 a sendTo to an area without a web component is answered with NO_TARGET, a request which does not get through with FAILED', async ({ page }) => {
  await pageModule(page, ['body', 'information']);
  await withCockpitCode(page);
  await page.route('**/gui/api/v1/usertask/t1/claim**', (route) => route.abort('connectionrefused'));
  const result = await page.evaluate(async (hostCode) => {
    const host = eval(hostCode);
    const drawn = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, ['body', 'information'], document.body);
    const failure = (promise: Promise<unknown>) => promise.then(() => 'resolved', (error) => error.code);
    return {
      noTarget: await failure(drawn.body.sendTo('actions', 'hello')),
      known: await failure(drawn.body.sendTo('information', 'hello')),
      failed: await failure(drawn.body.request('userTask.claim', { userTaskId: 't1' })),
    };
  }, hostOf);
  expect(result).toEqual({ noTarget: 'NO_TARGET', known: 'resolved', failed: 'FAILED' });
});

test('EXT-055 the host answers every action of the minimum set, and claim and assign resolve once the server accepted the change', async ({ page }) => {
  await pageModule(page, ['body']);
  await withCockpitCode(page);
  const calls: string[] = [];
  await page.route('**/gui/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/gui/api/v1', '');
    calls.push(`${request.method()} ${path}${new URL(request.url()).search}`);
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 't1', workflowId: 'w1' }) });
    if (path.endsWith('/usertasks')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userTasks: [{ id: 't1' }] }) });
    return route.fulfill({ status: 204 });
  });
  const outcome = await page.evaluate(async (hostCode) => {
    const host = eval(hostCode);
    const drawn = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, ['body'], document.body);
    const ask = (action: string, args?: unknown) => drawn.body.request(action, args).then((result: unknown) => ({ ok: true, result }), (error: { code: string }) => ({ ok: false, code: error.code }));
    const answers: Record<string, unknown> = {};
    const sent: Record<string, unknown> = {
      'userTask.open': { userTaskId: 't1' }, 'userTask.navigateToWorkflow': { userTaskId: 't1' },
      'userTask.claim': { userTaskId: 't1' }, 'userTask.unclaim': { userTaskId: 't1' },
      'userTask.assign': { userTaskId: 't1', userId: 'u2' }, 'userTask.unassign': { userTaskId: 't1', userId: 'u2' },
      'workflow.navigateToWorkflow': { workflowId: 'w1' },
      'workflow.getUserTasks': { workflowId: 'w1', activeOnly: true, limitListAccordingToCurrentUsersPermissions: false },
      'page.sendTo': { target: 'body', message: 1 }, 'page.subscribe': undefined,
      'cockpit.showNotification': { level: 'info', text: 'hello', sticky: false },
      'cockpit.openDialog': { element: 'fake-module-b1-dialog', entry: 'Views', data: 'x' },
    };
    for (const [action, args] of Object.entries(sent)) answers[action] = await ask(action, args);
    answers['page.unsubscribe'] = await ask('page.unsubscribe', { subscriptionId: (answers['page.subscribe'] as { result: { subscriptionId: string } }).result.subscriptionId });
    // closing is answered by the dialog the part is in; the dialog above closed itself through it, a part outside a dialog is told so
    answers['cockpit.closeDialog'] = await ask('cockpit.closeDialog', { result: 1 });
    return { answers, path: location.pathname };
  }, hostOf);
  expect(outcome.answers['cockpit.closeDialog']).toEqual({ ok: false, code: 'FAILED' });
  delete outcome.answers['cockpit.closeDialog'];
  for (const [action, answer] of Object.entries(outcome.answers)) expect(answer, action).toMatchObject({ ok: true });
  expect(Object.keys(outcome.answers)).toHaveLength(13);
  expect((outcome.answers['workflow.getUserTasks'] as { result: unknown[] }).result).toHaveLength(1);
  expect((outcome.answers['cockpit.openDialog'] as { result: unknown }).result).toBe('closed with x');
  expect(calls).toEqual(expect.arrayContaining([
    'PATCH /usertask/t1/claim', 'PATCH /usertask/t1/claim?unclaim=true', 'PATCH /usertask/t1/assign?userId=u2', 'PATCH /usertask/t1/assign?userId=u2&unassign=true',
  ]));
});

test('EXT-055 a refused change is answered with REFUSED and its status', async ({ page }) => {
  await pageModule(page, ['body']);
  await withCockpitCode(page);
  await page.route('**/gui/api/v1/usertask/t1/claim**', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }));
  const error = await page.evaluate(async (hostCode) => {
    const host = eval(hostCode);
    const drawn = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, ['body'], document.body);
    return drawn.body.request('userTask.claim', { userTaskId: 't1' }).then(() => undefined, (e: { code: string; status: number }) => ({ code: e.code, status: e.status }));
  }, hostOf);
  expect(error).toEqual({ code: 'REFUSED', status: 409 });
});

test('EXT-056 every area and every other part gets its properties and the functions of the cockpit', async ({ page }) => {
  await pageModule(page, ['all', 'body']);
  await withCockpitCode(page);
  const seen = await page.evaluate(async (hostCode) => {
    const host = eval(hostCode);
    const functions = (element: any) => ['showNotification', 'openDialog', 'closeDialog', 'sendTo', 'receiveMessage', 'request'].filter((name) => typeof element[name] === 'function').sort();
    const own = (element: any) => Object.keys(element).filter((name) => typeof element[name] !== 'function').sort();
    const task = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, ['body'], document.body);
    const wholeTask = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, [], document.body);
    const flow = await host.drawPage('fake-module', '/wm/fake-module/', 'WorkflowPage', { id: 'w1' }, ['body'], document.body);
    const header = await host.draw('fake-module', '/wm/fake-module/', { element: 'fake-module-b1-note', entry: 'Views' }, document.body);
    const dialog = await host.draw('fake-module', '/wm/fake-module/', { element: 'fake-module-b1-dialog', entry: 'Views' }, document.body, { data: 'y' });
    return {
      task: [own(task.body), functions(task.body), (task.body as any).area],
      wholeTask: [own(wholeTask.all), (wholeTask.all as any).area],
      flow: own(flow.body),
      header: [own(header), functions(header), (header as any).workflowModule],
      dialog: own(dialog),
    };
  }, hostOf);
  const all = ['closeDialog', 'openDialog', 'receiveMessage', 'request', 'sendTo', 'showNotification'];
  expect(seen.task).toEqual([['area', 'currentUser', 'language', 'userTask'], all, 'body']);
  expect(seen.wholeTask).toEqual([['area', 'currentUser', 'language', 'userTask'], 'all']);
  expect(seen.flow).toEqual(['area', 'currentUser', 'language', 'workflow']);
  expect(seen.header[0]).toEqual(['currentUser', 'language', 'workflowModule']);
  expect(seen.header[1]).toEqual(all);
  expect(seen.header[2]).toMatchObject({ id: 'fake-module' });
  expect(seen.dialog).toEqual(['currentUser', 'dataSeen', 'language', 'workflowModule']);
});

test('EXT-056 the header of the cockpit gets the user, the language and its module', async ({ page }) => {
  await page.request.post('/bpms/api/v1_1/workflow-module/fake-module', { data: { uri: '/bc-manifest.json' } });
  await pageModule(page, ['body']);
  await page.goto('/tasks');
  const note = page.locator('fake-module-b1-note');
  await expect(note).toHaveCount(1);
  const props = await note.evaluate((element: any) => ({ language: element.language, user: element.currentUser?.id, module: element.workflowModule?.id, request: typeof element.request }));
  expect(props).toMatchObject({ language: 'en', module: 'fake-module', request: 'function' });
  expect(props.user).toBeTruthy();
});

test('EXT-057 the user interface never completes a task, starts a case or calls a module itself', async ({ page }) => {
  const sources = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path);
    return /\.(ts|vue)$/.test(entry.name) ? [path] : [];
  });
  const files = sources(join(root, 'packages/ui/src'));
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    expect(source, file).not.toMatch(/\/complete\b|completeUserTask|startWorkflow|startProcess|\/start\b|bpms\/api|official-api/);
    // the loader of the parts is the one place which names a module
    if (!file.endsWith('modules/modules.ts')) expect(source, file).not.toContain('/wm/');
  }
  const requests: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET') requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.goto('/tasks');
  await expect(page.getByTestId('module-header')).toBeVisible();
  expect(requests.filter((request) => /\/wm\/|complete|start/.test(request))).toEqual([]);
});

test('EXT-059 the proxy passes the caching headers of a module on and answers a manifest which did not change with 304', async ({ request }) => {
  const url = '/wm/react-module/bc-manifest.json';
  const first = await request.get(url);
  expect(first.status()).toBe(200);
  const headers = first.headers();
  expect(headers['etag']).toBeTruthy();
  expect(headers['last-modified']).toBeTruthy();
  expect(headers['cache-control']).toBe('no-cache');
  const gzipped = await request.get(url, { headers: { 'accept-encoding': 'gzip' } });
  expect(gzipped.headers()['content-encoding']).toBe('gzip');
  expect(await gzipped.json()).toMatchObject({ manifestVersion: 1 });
  expect((await request.get(url, { headers: { 'if-none-match': headers['etag'] } })).status()).toBe(304);
  expect((await request.get(url, { headers: { 'if-modified-since': headers['last-modified'] } })).status()).toBe(304);
  expect((await request.get(url, { headers: { 'if-none-match': '"other"' } })).status()).toBe(200);
});
