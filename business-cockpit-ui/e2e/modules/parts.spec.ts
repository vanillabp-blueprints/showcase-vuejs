// EXT-031, EXT-033, EXT-034, EXT-035, EXT-036, EXT-037: the cockpit loads, waits for and draws the parts of a module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

const here = new URL('.', import.meta.url).pathname;
const register = (page: Page, id: string) => page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });
const JS = 'text/javascript';

type FileAnswer = string | number | ((count: number) => string | number);
interface FakeModule { requests: string[]; count(file: string): number }

/** A module made of the given files; a number answers that HTTP status, a function answers by how often the file was asked. */
async function fakeModule(page: Page, id: string, files: Record<string, FileAnswer>): Promise<FakeModule> {
  const requests: string[] = [];
  const entries = Object.fromEntries(Object.keys(files).filter((file) => file !== 'bc-manifest.json').map((file) => [file.replace(/\.js$/, ''), file]));
  const all: Record<string, FileAnswer> = { 'bc-manifest.json': JSON.stringify({ manifestVersion: 1, entries, buildVersion: '1.0.0', buildTimestamp: '2026-11-25T00:00:00Z' }), ...files };
  await page.route(`**/wm/${id}/**`, async (route) => {
    const file = new URL(route.request().url()).pathname.replace(`/wm/${id}/`, '');
    requests.push(file);
    const answer = all[file];
    const body = typeof answer === 'function' ? answer(requests.filter((name) => name === file).length) : answer;
    if (body === undefined) return route.fulfill({ status: 404 });
    if (typeof body === 'number') return route.fulfill({ status: body });
    return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : JS, body });
  });
  return { requests, count: (file) => requests.filter((name) => name === file).length };
}

const header = (element: string, entry: string) => `export const header = () => (${JSON.stringify({ element, entry })});`;
const defineBox = (name: string, text = 'box') =>
  `customElements.define('${name}', class extends HTMLElement { connectedCallback() { this.textContent = '${text}'; } });`;

let hostBundle: string | undefined;
/** The module host of the cockpit as a script, to drive it in a page which has no cockpit around it. */
async function withHost(page: Page) {
  hostBundle ??= (await build({
    entryPoints: [join(here, '../../packages/bc-module-host/src/index.ts')], bundle: true, write: false, format: 'iife', globalName: 'bcHost', logLevel: 'silent',
  })).outputFiles[0].text;
  await page.goto('/gui/api/v1/app/info');
  await page.addScriptTag({ content: hostBundle });
}
const loadedFiles = (page: Page) => page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname).filter((path) => path.startsWith('/wm/')));

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('EXT-031 no page loads zone.js and an Angular part works without it', async ({ page }) => {
  await register(page, 'angular-module');
  await page.goto('/tasks');
  await expect(page.getByTestId('angular-header')).toHaveAttribute('data-framework', 'angular');
  const traces = await page.evaluate(() => ({
    zone: 'Zone' in window,
    patched: Object.keys(window).filter((key) => key.startsWith('__zone_symbol__')),
    files: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /zone/i.test(name)),
  }));
  expect(traces).toEqual({ zone: false, patched: [], files: [] });
  const shipped = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.endsWith('.js')));
  for (const url of shipped) expect(await (await page.request.get(url)).text()).not.toContain('__zone_symbol__');
});

test('EXT-033 a retry reads the manifest and calls import() again, and a second failure offers to reload the page', async ({ page }) => {
  await register(page, 'fake-module');
  const once = await fakeModule(page, 'fake-module', {
    'Header.js': (count) => (count === 1 ? 500 : header('fake-module-b1-box', 'Box')),
    'Box.js': defineBox('fake-module-b1-box', 'drawn after retry'),
  });
  await page.goto('/tasks');
  const note = page.getByTestId('part-note');
  await expect(note).toHaveAttribute('data-kind', 'ask-failed');
  await expect(page.getByTestId('part-reload')).toHaveCount(0);
  expect(once.count('bc-manifest.json')).toBe(1);
  await page.getByTestId('part-retry').click();
  await expect(page.getByText('drawn after retry')).toBeVisible();
  expect(once.count('bc-manifest.json')).toBe(2);
  expect(once.count('Header.js')).toBe(2);

  await page.request.post('/simulator-api/reset');
  await register(page, 'broken-module');
  const broken = await fakeModule(page, 'broken-module', { 'Header.js': 500 });
  await page.goto('/tasks');
  await expect(page.getByTestId('part-note')).toHaveAttribute('data-kind', 'ask-failed');
  await page.getByTestId('part-retry').click();
  await expect(page.getByTestId('part-reload')).toBeVisible();
  expect(broken.count('bc-manifest.json')).toBe(2);
  expect(broken.count('Header.js')).toBe(2);
});

test('EXT-034 loading the data entries of the test modules fetches no file of their framework', async ({ page }) => {
  await withHost(page);
  const task = { id: 't1', workflowModuleId: 'react-module' };
  const asked: [string, string[]][] = [
    ['react-module', ['Header', 'UserTaskList', 'UserTaskForm']],
    ['vue-module', ['WorkflowList', 'WorkflowPage']],
    ['angular-module', ['Header', 'UserTaskList']],
  ];
  await page.evaluate(async ({ asked, task }) => {
    const host = (window as any).bcHost.createModuleHost();
    for (const [id, entries] of asked) for (const entry of entries) await host.ask(id, `/wm/${id}/`, entry, task, 'all');
  }, { asked, task });
  const files = await loadedFiles(page);
  const scripts = files.filter((name) => name.endsWith('.js'));
  expect(scripts.filter((file) => !file.includes('/chunks/')).length).toBe(7);
  for (const file of scripts) {
    // a data entry may share a small chunk of the kit, never a view file
    expect(file).toMatch(/\/(chunks\/chunk|Header|UserTaskList|UserTaskForm|WorkflowList|WorkflowPage)-[A-Z0-9]+\.js$/);
    const source = await (await page.request.get(file)).text();
    for (const marker of ['ɵɵdefineComponent', '@license Angular', '__zone_symbol__', 'react.production', 'createRoot', '__vue_app__', 'runtime-core']) expect(source).not.toContain(marker);
  }
  const views = JSON.parse(readFileSync(join(here, 'react-module/dist/bc-manifest.json'), 'utf8')).entries;
  expect(files.some((file) => file.endsWith(views.FormViews))).toBe(false);
});

test('EXT-035 the visual entry is loaded when its web component is about to be shown, and only that one', async ({ page }) => {
  await register(page, 'fake-module');
  const module = await fakeModule(page, 'fake-module', {
    'UserTaskForm.js': `export const userTaskForm = (task) => ({ element: 'fake-module-b1-' + task.id, entry: 'Form' + task.id.toUpperCase() });`,
    'FormA.js': defineBox('fake-module-b1-a', 'form a'),
    'FormB.js': defineBox('fake-module-b1-b', 'form b'),
  });
  await withHost(page);
  const files = await page.evaluate(async () => {
    const host = (window as any).bcHost.createModuleHost();
    const descriptor = await host.ask('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 'a' }, 'all');
    return { descriptor, asked: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/wm/fake-module/')).length };
  });
  expect(files.descriptor).toEqual({ element: 'fake-module-b1-a', entry: 'FormA' });
  expect(module.requests).not.toContain('FormA.js'); // asking loads nothing visible
  await page.evaluate(async () => {
    const host = (window as any).bcHost.createModuleHost();
    const descriptor = await host.ask('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 'a' }, 'all');
    await host.draw('fake-module', '/wm/fake-module/', descriptor, document.body);
  });
  expect(module.requests).toContain('FormA.js');
  expect(module.requests).not.toContain('FormB.js');
  await expect(page.getByText('form a')).toBeVisible();
});

test('EXT-036 the cockpit waits for the web component, and names the module, the entry and the component when it is not defined in time', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-late', 'Late'),
    'Late.js': 'export const loaded = true;',
  });
  const messages: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
  await page.clock.install();
  await page.goto('/tasks');
  await expect(page.getByTestId('module-part')).toHaveAttribute('data-state', 'loading');
  await page.clock.runFor(10_500);
  const note = page.getByTestId('part-note');
  await expect(note).toHaveAttribute('data-kind', 'not-defined');
  for (const word of ['fake-module', 'Late', 'fake-module-b1-late']) {
    await expect(note).toContainText(word);
    expect(messages.join('\n')).toContain(word);
  }
});

test('EXT-036 a web component which is defined a little later is drawn without a note', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-slow', 'Slow'),
    'Slow.js': `setTimeout(() => { ${defineBox('fake-module-b1-slow', 'slow but there')} }, 500);`,
  });
  await page.goto('/tasks');
  await expect(page.getByText('slow but there')).toBeVisible();
  await expect(page.getByTestId('part-note')).toHaveCount(0);
});

test('EXT-037 ask, load and draw have their own state and error', async ({ page }) => {
  await register(page, 'fake-module');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-box', 'Box'),
    'Box.js': 'export const broken = true; throw new Error("no way");',
  });
  await page.route('**/wm/fake-module/Header.js', async (route) => { await gate; await route.fallback(); }); // the later route runs first
  await page.goto('/tasks');
  await expect(page.getByTestId('module-part')).toHaveAttribute('data-state', 'asking');
  release();
  await expect(page.getByTestId('part-note')).toHaveAttribute('data-kind', 'load-failed');
  await expect(page.getByTestId('part-retry')).toBeVisible();
});

test('EXT-037 an answer of undefined is no error, a refused name and a throwing element get their own notes', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', { 'Header.js': 'export const header = () => undefined;' });
  await page.goto('/tasks');
  await expect(page.getByTestId('module-header')).toBeAttached();
  await expect(page.getByTestId('task-row')).toHaveCount(0);
  await expect(page.getByTestId('part-note')).toHaveCount(0);
  await expect(page.getByTestId('module-part')).toHaveCount(0);

  await page.request.post('/simulator-api/reset');
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', { 'Header.js': header('other-b1-box', 'Box') });
  await page.goto('/tasks');
  const refused = page.getByTestId('part-note');
  await expect(refused).toHaveAttribute('data-kind', 'name-refused');
  await expect(refused).toContainText('fake-module');
  await expect(refused).toContainText('other-b1-box');

  await page.request.post('/simulator-api/reset');
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-box', 'Box'),
    'Box.js': `customElements.define('fake-module-b1-box', class extends HTMLElement { constructor() { super(); throw new Error('constructor failed'); } });`,
  });
  await page.goto('/tasks');
  const thrown = page.getByTestId('part-note');
  await expect(thrown).toHaveAttribute('data-kind', 'create-failed');
  await expect(thrown).toContainText('fake-module');
  await expect(thrown).toContainText('fake-module-b1-box');
});
