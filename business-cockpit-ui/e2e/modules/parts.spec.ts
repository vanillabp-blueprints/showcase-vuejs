// EXT-031, EXT-033, EXT-034, EXT-035, EXT-036, EXT-037, EXT-041, EXT-043, EXT-044, EXT-045, EXT-046, EXT-047, EXT-048, EXT-049, EXT-050, EXT-051, EXT-052, EXT-053: the cockpit loads, waits for and draws the parts of a module.
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
async function fakeModule(page: Page, id: string, files: Record<string, FileAnswer>, buildVersion = '1.0.0'): Promise<FakeModule> {
  const requests: string[] = [];
  const entries = Object.fromEntries(Object.keys(files).filter((file) => file !== 'bc-manifest.json').map((file) => [file.replace(/\.js$/, ''), buildVersion === '1.0.0' ? file : `${file}?v=${buildVersion}`]));
  const all: Record<string, FileAnswer> = { 'bc-manifest.json': JSON.stringify({ manifestVersion: 1, entries, buildVersion, buildTimestamp: '2026-11-25T00:00:00Z' }), ...files };
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

const formPage = (element: unknown) => `export const userTaskForm = () => (${JSON.stringify({ entry: 'Form', element })});`;
const defineAll = (...names: string[]) => names.map((name) => defineBox(name, name)).join('\n');

test('EXT-041 an entry the manifest names and the cockpit does not know is ignored without an error', async ({ page }) => {
  await register(page, 'fake-module');
  const module = await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-box', 'Box'), 'Box.js': defineBox('fake-module-b1-box', 'known entry drawn'),
    'Mystery.js': 'throw new Error("never loaded");',
  });
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') if (message.location().url.includes('/wm/')) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tasks');
  await expect(page.getByText('known entry drawn')).toBeVisible();
  expect(module.requests).not.toContain('Mystery.js');
  expect(errors).toEqual([]);
});

test('EXT-041 the cockpit draws the areas it knows, ignores the others, and else draws all', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', {
    'UserTaskForm.js': formPage({ all: 'fake-module-b1-all', body: 'fake-module-b1-body', mystery: 'fake-module-b1-mystery' }),
    'Form.js': defineAll('fake-module-b1-all', 'fake-module-b1-body', 'fake-module-b1-mystery'),
  });
  await register(page, 'only-string');
  await fakeModule(page, 'only-string', {
    'UserTaskForm.js': formPage('only-string-b1-all'), 'Form.js': defineAll('only-string-b1-all'),
  });
  await register(page, 'no-all');
  await fakeModule(page, 'no-all', {
    'UserTaskForm.js': formPage({ mystery: 'no-all-b1-mystery' }), 'Form.js': defineAll('no-all-b1-mystery'),
  });
  await withHost(page);
  const drawn = await page.evaluate(async () => {
    const host = (window as any).bcHost.createModuleHost();
    const run = async (id: string, areas: string[]) => {
      const container = document.createElement('div');
      document.body.append(container);
      const answer = await host.drawPage(id, `/wm/${id}/`, 'UserTaskForm', { id: 'T-1' }, areas, container);
      return { areas: Object.keys(answer), text: container.textContent };
    };
    return {
      known: await run('fake-module', ['body', 'information', 'actions']),
      noneKnown: await run('fake-module', ['information']),
      cockpitHasNone: await run('fake-module', []),
      string: await run('only-string', ['body']),
      nothing: await run('no-all', ['body']),
    };
  });
  expect(drawn).toEqual({
    known: { areas: ['body'], text: 'fake-module-b1-body' },
    noneKnown: { areas: ['all'], text: 'fake-module-b1-all' },
    cockpitHasNone: { areas: ['all'], text: 'fake-module-b1-all' },
    string: { areas: ['all'], text: 'only-string-b1-all' },
    nothing: { areas: [], text: '' },
  });
});

test('EXT-043 resting the mouse on a row or focusing it loads no file of a module', async ({ page, request }) => {
  await register(page, 'react-module');
  const row = (id: string) => ({
    id, bpmnProcessId: 'p', createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', businessId: `B-${id}`, title: { en: `Check ${id}` },
    workflowModuleId: 'react-module', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json',
  });
  await request.post('/simulator-api/user-tasks', { data: { userTasks: [row('t1'), row('t2'), row('t3')] } });
  await page.goto('/tasks');
  const rows = page.getByTestId('task-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toHaveAttribute('data-parts', 'loaded');
  await expect(page.getByTestId('react-header')).toBeVisible();
  const before = await loadedFiles(page);
  expect(before.length).toBeGreaterThan(0);
  await rows.first().hover();
  await rows.nth(1).hover();
  await rows.first().focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  expect(await loadedFiles(page)).toEqual(before);
});

test('EXT-044 a name which is no custom element name, has the wrong prefix or the prefix of a longer module id is refused', async ({ page }) => {
  const cases: [string, string, string][] = [
    ['taxi', 'taxi-ride-b1-box', 'longer prefix'], ['fake-module', 'fake-module-B1-box', 'upper case'],
    ['fake-module', 'fakemodule', 'no hyphen'], ['fake-module', 'other-b1-box', 'wrong prefix'],
  ];
  for (const [id, name] of cases.map(([id, name]) => [id, name])) {
    await page.request.post('/simulator-api/reset');
    await register(page, id);
    await register(page, 'taxi-ride');
    await fakeModule(page, 'taxi-ride', { 'Other.js': 'export const other = 1;' });
    const module = await fakeModule(page, id, { 'Header.js': header(name, 'Box'), 'Box.js': defineBox(name, 'must not show') });
    const messages: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
    await page.goto('/tasks');
    const note = page.getByTestId('part-note');
    await expect(note).toHaveAttribute('data-kind', 'name-refused');
    for (const word of [id, name, id === 'taxi' ? 'taxi-' : `${id}-`]) {
      await expect(note).toContainText(word);
      expect(messages.join('\n')).toContain(word);
    }
    expect(module.requests).not.toContain('Box.js');
    page.removeAllListeners('console');
  }
});

test('EXT-045 ten parts asked at the same time fetch the manifest and each file once', async ({ page }) => {
  await register(page, 'fake-module');
  const module = await fakeModule(page, 'fake-module', {
    'UserTaskForm.js': `export const userTaskForm = () => ({ element: 'fake-module-b1-box', entry: 'Box' });`,
    'Box.js': defineBox('fake-module-b1-box', 'box'),
  });
  await withHost(page);
  await page.evaluate(async () => {
    const host = (window as any).bcHost.createModuleHost();
    const ref = ['fake-module', '/wm/fake-module/'] as const;
    const answers = await Promise.all(Array.from({ length: 10 }, () => host.ask(...ref, 'UserTaskForm', { id: 'T-1' }, 'all')));
    await Promise.all(answers.map((descriptor) => host.draw(...ref, descriptor, document.body)));
  });
  await expect(page.getByText('box')).toHaveCount(10);
  expect(module.count('bc-manifest.json')).toBe(1);
  expect(module.count('UserTaskForm.js')).toBe(1);
  expect(module.count('Box.js')).toBe(1);
});

test('EXT-046 a part whose web component is defined already is drawn without import, wait or loading state', async ({ page }) => {
  await register(page, 'fake-module');
  const module = await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b1-box', 'Box'), 'Box.js': 'throw new Error("must not be imported");',
  });
  const states: string[] = [];
  await page.exposeFunction('seenState', (state: string) => states.push(state));
  await page.addInitScript(() => {
    customElements.define('fake-module-b1-box', class extends HTMLElement { connectedCallback() { this.textContent = 'defined before'; } });
    new MutationObserver((records) => {
      for (const record of records) {
        const state = (record.target as HTMLElement).getAttribute?.('data-state');
        if (state) (window as any).seenState(state);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'], childList: true });
    new MutationObserver(() => {
      const part = document.querySelector('[data-testid="module-part"]');
      if (part) (window as any).seenState(`found:${part.getAttribute('data-state')}`);
    }).observe(document, { subtree: true, childList: true });
  });
  await page.goto('/tasks');
  await expect(page.getByText('defined before')).toBeVisible();
  expect(module.requests).not.toContain('Box.js');
  expect(states.filter((state) => state.endsWith('loading'))).toEqual([]);
});

test('EXT-047 the manifest is read with no-cache, again only after the recheck time, and a failed read keeps the old one', async ({ page }) => {
  await register(page, 'fake-module');
  const manifest = JSON.stringify({ manifestVersion: 1, entries: { Header: 'Header.js' }, buildVersion: '1.0.0', buildTimestamp: '2026-11-25T00:00:00Z' });
  const module = await fakeModule(page, 'fake-module', {
    'bc-manifest.json': (count) => (count === 3 ? 500 : manifest),
    'Header.js': 'export const header = () => undefined;',
  });
  await page.clock.install();
  await withHost(page);
  const caches = await page.evaluate(() => {
    const seen: string[] = [];
    const original = window.fetch;
    window.fetch = (input, init) => { seen.push(String(init?.cache)); return original(input, init); };
    (window as any).host = (window as any).bcHost.createModuleHost();
    (window as any).seen = seen;
    return seen;
  });
  expect(caches).toEqual([]);
  const ask = () => page.evaluate(() => (window as any).host.ask('fake-module', '/wm/fake-module/', 'Header'));
  await ask(); await ask(); await ask();
  expect(module.count('bc-manifest.json')).toBe(1);
  await page.clock.runFor(59_000);
  await ask();
  expect(module.count('bc-manifest.json')).toBe(1);
  await page.clock.runFor(2_000);
  await ask(); await ask();
  expect(module.count('bc-manifest.json')).toBe(2);
  await page.clock.runFor(61_000);
  await expect(ask()).resolves.toBeUndefined(); // the third read fails, the old manifest serves
  expect(module.count('bc-manifest.json')).toBe(3);
  await ask();
  expect(module.count('bc-manifest.json')).toBe(4); // a failed read is tried again at the next ask
  expect(await page.evaluate(() => (window as any).seen)).toEqual(['no-cache', 'no-cache', 'no-cache', 'no-cache']);
});

const RECHECK_MS = 61_000;
/** A minute passes and the user comes back to the page, which is when the header looks for a new build. */
async function comeBackAfterAMinute(page: Page) {
  await page.clock.runFor(RECHECK_MS);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
const textsOf = (page: Page) => { const texts: string[] = []; page.on('console', (message) => texts.push(`${message.type()}: ${message.text()}`)); return texts; };

test('EXT-048 after a new build the next part comes from it without a reload, an old web component stays, and the header asks again', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', { 'Header.js': header('fake-module-b1-box', 'Box'), 'Box.js': defineBox('fake-module-b1-box', 'build one') });
  await page.clock.install();
  await page.goto('/tasks');
  await expect(page.getByText('build one')).toBeVisible();
  await page.evaluate(() => { (window as any).sameDocument = true; });
  const second = await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-b2-box', 'Box2'), 'Box2.js': defineBox('fake-module-b2-box', 'build two'),
  }, '2.0.0');
  await comeBackAfterAMinute(page);
  await expect(page.getByText('build two')).toBeVisible();
  expect(second.requests).toContain('Box2.js');
  expect(await page.evaluate(() => (window as any).sameDocument)).toBe(true);
  expect(await page.evaluate(() => customElements.get('fake-module-b1-box') !== undefined)).toBe(true);

  // a part of a page: the next one comes from the new build, the one on the page stays
  await withHost(page);
  const found = await page.evaluate(async () => {
    const host = (window as any).bcHost.createModuleHost({ manifestRecheckMs: 50 });
    const ref = ['fake-module', '/wm/fake-module/'] as const;
    const first = await host.ask(...ref, 'Header');
    await host.draw(...ref, first, document.body);
    return first.element;
  });
  expect(found).toBe('fake-module-b2-box');
});

test('EXT-049 a new build which answers with a name its earlier build defined gets a note, no import, and the console names the module and the name', async ({ page }) => {
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', { 'Header.js': header('fake-module-box', 'Box'), 'Box.js': defineBox('fake-module-box', 'build one') });
  await page.clock.install();
  const texts = textsOf(page);
  await page.goto('/tasks');
  await expect(page.getByText('build one')).toBeVisible();
  const second = await fakeModule(page, 'fake-module', {
    'Header.js': header('fake-module-box', 'Box'), 'Box.js': 'throw new Error("must not be imported");',
  }, '2.0.0');
  await comeBackAfterAMinute(page);
  const note = page.getByTestId('part-note');
  await expect(note).toHaveAttribute('data-kind', 'module-updated');
  await expect(note).toContainText('fake-module');
  await expect(page.getByTestId('part-reload')).toBeVisible();
  expect(second.requests).not.toContain('Box.js');
  expect(texts.some((text) => text.includes('fake-module') && text.includes('fake-module-box'))).toBe(true);
});

test('EXT-050 a manifest of a higher version or with a whole address, a path from the root or .. is refused with a note, other fields and ?v and # are fine', async ({ page }) => {
  const manifest = (version: number, header: string, more: object = {}) => JSON.stringify({ manifestVersion: version, entries: { Header: header, Box: 'Box.js' }, buildVersion: '1.0.0', buildTimestamp: '2026-11-25T00:00:00Z', ...more });
  const bad = [manifest(2, 'Header.js'), manifest(1, 'https://example.org/Header.js'), manifest(1, '/Header.js'), manifest(1, '../Header.js'), manifest(1, 'a/../../Header.js')];
  for (const text of bad) {
    await page.request.post('/simulator-api/reset');
    await register(page, 'fake-module');
    const module = await fakeModule(page, 'fake-module', { 'bc-manifest.json': text, 'Header.js': header('fake-module-b1-box', 'Box'), 'Box.js': defineBox('fake-module-b1-box', 'must not show') });
    await page.goto('/tasks');
    const note = page.getByTestId('part-note');
    await expect(note).toHaveAttribute('data-kind', 'manifest-refused');
    await expect(note).toContainText('fake-module');
    expect(module.requests).not.toContain('Header.js');
  }
  await page.request.post('/simulator-api/reset');
  await register(page, 'fake-module');
  await fakeModule(page, 'fake-module', {
    'bc-manifest.json': manifest(1, 'Header.js?v=7#top', { somethingNew: { a: 1 } }),
    'Header.js': header('fake-module-b1-box', 'Box'), 'Box.js': defineBox('fake-module-b1-box', 'fine manifest'),
  });
  await page.goto('/tasks');
  await expect(page.getByText('fine manifest')).toBeVisible();
});

test('EXT-051 each manifest is read on its own, and a module without a manifest has no parts and is not asked again', async ({ page }) => {
  for (const id of ['good-module', 'broken-module', 'gone-module']) await register(page, id);
  const good = await fakeModule(page, 'good-module', { 'Header.js': header('good-module-b1-box', 'Box'), 'Box.js': defineBox('good-module-b1-box', 'the good one') });
  const broken = await fakeModule(page, 'broken-module', { 'bc-manifest.json': 500 });
  const gone = await fakeModule(page, 'gone-module', { 'bc-manifest.json': 404 });
  await page.clock.install();
  await page.goto('/tasks');
  await expect(page.getByText('the good one')).toBeVisible();
  await expect(page.locator('[data-module="broken-module"] [data-testid="part-note"]')).toHaveAttribute('data-kind', 'ask-failed');
  await expect(page.locator('[data-module="gone-module"]')).toHaveCount(0);
  await comeBackAfterAMinute(page);
  await comeBackAfterAMinute(page);
  await expect.poll(() => good.count('bc-manifest.json')).toBeGreaterThan(1);
  expect(gone.count('bc-manifest.json')).toBe(1);
  expect(broken.count('bc-manifest.json')).toBeGreaterThan(0);
});

test('EXT-052 a data entry without the function it has to export is loaded and shows nothing, and the console names the module', async ({ page }) => {
  await register(page, 'fake-module');
  const module = await fakeModule(page, 'fake-module', { 'Header.js': 'export const somethingElse = () => 1;' });
  const texts = textsOf(page);
  await page.goto('/tasks');
  await expect.poll(() => module.count('Header.js')).toBe(1);
  await expect.poll(() => texts.some((text) => text.includes('fake-module'))).toBe(true);
  await expect(page.getByTestId('module-part')).toHaveCount(0);
  await expect(page.getByTestId('part-note')).toHaveCount(0);
});

test('EXT-053 two modules with the same prefix give a warning in the console', async ({ page }) => {
  await register(page, 'TaxiRide');
  await register(page, 'taxi-ride');
  await register(page, 'other-module');
  const texts = textsOf(page);
  await page.goto('/tasks');
  await expect.poll(() => texts.filter((text) => text.startsWith('warning') && text.includes('TaxiRide') && text.includes('taxi-ride'))).toHaveLength(1);
  expect(texts.filter((text) => text.includes('other-module') && text.startsWith('warning'))).toEqual([]);
});
