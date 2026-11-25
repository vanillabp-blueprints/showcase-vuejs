// TF-025, TF-026, TF-027, TF-029, TF-039, TF-040: loading states and notes of the task page, the areas it draws, what it loads once, its header.
import { expect, test, type Page } from '@playwright/test';

type FileAnswer = string | number | ((count: number) => string | number | Promise<string | number>);

const JS = 'text/javascript';
const ID = 'fake-module';
const register = (page: Page) => page.request.post(`/bpms/api/v1_1/workflow-module/${ID}`, { data: { uri: '/bc-manifest.json' } });
const seed = async (page: Page, tasks: Record<string, unknown>[]) => {
  await register(page);
  await page.request.post('/simulator-api/user-tasks', {
    data: { userTasks: tasks.map((extra, index) => ({
      id: `t${index + 1}`, workflowModuleId: ID, bpmnProcessId: 'p', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json', read: true,
      createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', businessId: `B-${index + 1}`,
      title: { en: `Check t${index + 1}`, de: `Prüfe t${index + 1}` }, ...extra,
    })) },
  });
};

/** A module made of the given files; a number answers that HTTP status, a function answers by how often the file was asked. */
async function fakeModule(page: Page, files: Record<string, FileAnswer>) {
  const requests: string[] = [];
  const entries = Object.fromEntries(Object.keys(files).map((file) => [file.replace(/\.js$/, ''), file]));
  const all: Record<string, FileAnswer> = { 'bc-manifest.json': JSON.stringify({ manifestVersion: 1, entries, buildVersion: '1.0.0', buildTimestamp: '2026-11-25T00:00:00Z' }), ...files };
  await page.route(`**/wm/${ID}/**`, async (route) => {
    const file = new URL(route.request().url()).pathname.replace(`/wm/${ID}/`, '');
    requests.push(file);
    const answer = all[file];
    const body = typeof answer === 'function' ? await answer(requests.filter((name) => name === file).length) : answer;
    if (body === undefined) return route.fulfill({ status: 404 });
    if (typeof body === 'number') return route.fulfill({ status: body });
    return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : JS, body });
  });
  return { requests, count: (file: string) => requests.filter((name) => name === file).length };
}

const form = (answer: unknown) => `export const userTaskForm = () => (${JSON.stringify(answer)});`;
const define = (name: string, text: string) =>
  `customElements.define('${name}', class extends HTMLElement { connectedCallback() { this.dataset.testid = '${name}'; this.textContent = '${text}'; } });`;
const views = (...names: string[]) => names.map((name) => define(name, name)).join('\n');
const gate = () => { let open!: () => void; const wait = new Promise<void>((resolve) => { open = resolve; }); return { wait, open }; };

const page_ = (page: Page) => page.getByTestId('task-page');

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-025 the page shows a loading state of its own for the task, for the data entry and for the visual entry', async ({ page }) => {
  const task = gate(); const data = gate(); const visual = gate();
  await page.route('**/gui/api/v1/usertask/t1*', async (route) => { await task.wait; await route.fallback(); });
  await fakeModule(page, {
    'UserTaskForm.js': async () => { await data.wait; return form({ element: 'fake-module-v1-page', entry: 'Views' }); },
    'Views.js': async () => { await visual.wait; return views('fake-module-v1-page'); },
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page_(page)).toHaveAttribute('data-state', 'loading-task');
  task.open();
  await expect(page_(page)).toHaveAttribute('data-state', 'loading-form');
  data.open();
  await expect(page_(page)).toHaveAttribute('data-state', 'loading-visual');
  visual.open();
  await expect(page_(page)).toHaveAttribute('data-state', 'drawn');
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
});

const note = (page: Page) => page_(page).getByTestId('task-note');

test('TF-026 the task fails to load: a note with retry', async ({ page }) => {
  await fakeModule(page, { 'UserTaskForm.js': form({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': views('fake-module-v1-page') });
  await seed(page, [{}]);
  let fail = true;
  await page.route('**/gui/api/v1/usertask/t1*', (route) => (fail ? route.fulfill({ status: 500 }) : route.fallback()));
  await page.goto('/tasks/t1');
  await expect(note(page)).toHaveAttribute('data-kind', 'task-failed');
  fail = false;
  await page_(page).getByTestId('task-retry').click();
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  await expect(note(page)).toHaveCount(0);
});

test('TF-026 the module has no form for the task: a note without retry', async ({ page }) => {
  await fakeModule(page, { 'Header.js': 'export const header = () => undefined;' });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(note(page)).toHaveAttribute('data-kind', 'no-form');
  await expect(page_(page).getByTestId('task-retry')).toHaveCount(0);
});

test('TF-026 the data entry fails to load: a note with retry', async ({ page }) => {
  await fakeModule(page, {
    'UserTaskForm.js': (count) => (count === 1 ? 500 : form({ element: 'fake-module-v1-page', entry: 'Views' })),
    'Views.js': views('fake-module-v1-page'),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(note(page)).toHaveAttribute('data-kind', 'ask-failed');
  await expect(note(page)).toContainText('fake-module');
  await page_(page).getByTestId('task-retry').click();
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
});

test('TF-026 the visual entry fails to load: a note with retry', async ({ page }) => {
  await fakeModule(page, {
    'UserTaskForm.js': form({ element: 'fake-module-v1-page', entry: 'Views' }),
    'Views.js': (count) => (count === 1 ? 500 : views('fake-module-v1-page')),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(note(page)).toHaveAttribute('data-kind', 'load-failed');
  await page_(page).getByTestId('task-retry').click();
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
});

test('TF-026 a web component not defined in time: the note names module, entry and web component', async ({ page }) => {
  await fakeModule(page, { 'UserTaskForm.js': form({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': 'export {};' });
  await seed(page, [{}]);
  await page.clock.install();
  await page.goto('/tasks/t1');
  await expect(page_(page)).toHaveAttribute('data-state', 'loading-visual');
  await page.clock.runFor(11_000);
  await expect(note(page)).toHaveAttribute('data-kind', 'not-defined');
  await expect(note(page)).toContainText('fake-module');
  await expect(note(page)).toContainText('Views');
  await expect(note(page)).toContainText('fake-module-v1-page');
});

test('TF-027 a string element gets the whole area with no column', async ({ page }) => {
  await fakeModule(page, { 'UserTaskForm.js': form({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': views('fake-module-v1-page') });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  await expect(page_(page).locator('[data-area]')).toHaveCount(1);
  await expect(page_(page).locator('[data-area="all"]')).toHaveCount(1);
  const box = await page_(page).locator('[data-area="all"]').boundingBox();
  const frame = await page_(page).boundingBox();
  expect(box!.width).toBeGreaterThan(frame!.width - 80);
});

test('TF-027 an object gives each named web component its area, the visual entry of entry is loaded', async ({ page }) => {
  const module = await fakeModule(page, {
    'UserTaskForm.js': form({ element: { body: 'fake-module-v1-body', actions: 'fake-module-v1-actions' }, entry: 'Views' }),
    'Views.js': views('fake-module-v1-body', 'fake-module-v1-actions'),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page_(page).locator('[data-area="body"] fake-module-v1-body')).toBeVisible();
  await expect(page_(page).locator('[data-area="actions"] fake-module-v1-actions')).toBeVisible();
  await expect(page_(page).locator('[data-area]')).toHaveCount(2);
  expect(module.count('Views.js')).toBe(1);
});

test('TF-029 the web component of all is drawn when the object names no area the page has', async ({ page }) => {
  await fakeModule(page, {
    'UserTaskForm.js': form({ element: { footer: 'fake-module-v1-footer', all: 'fake-module-v1-page' }, entry: 'Views' }),
    'Views.js': views('fake-module-v1-footer', 'fake-module-v1-page'),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page_(page).locator('[data-area="all"] fake-module-v1-page')).toBeVisible();
  await expect(page_(page).locator('[data-area]')).toHaveCount(1);
});

test('TF-029 the areas the page knows are drawn and never all together with them', async ({ page }) => {
  await fakeModule(page, {
    'UserTaskForm.js': form({ element: { body: 'fake-module-v1-body', footer: 'fake-module-v1-footer', all: 'fake-module-v1-page' }, entry: 'Views' }),
    'Views.js': views('fake-module-v1-body', 'fake-module-v1-footer', 'fake-module-v1-page'),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page_(page).locator('[data-area="body"] fake-module-v1-body')).toBeVisible();
  await expect(page_(page).locator('[data-area]')).toHaveCount(1);
  await expect(page_(page).locator('fake-module-v1-page, fake-module-v1-footer')).toHaveCount(0);
});

test('TF-039 a second task of the same kind and the same task again load no entry again and read no manifest again', async ({ page }) => {
  const module = await fakeModule(page, { 'UserTaskForm.js': form({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': views('fake-module-v1-page') });
  await seed(page, [{}, {}]);
  await page.goto('/tasks');
  await page.getByTestId('task-title').filter({ hasText: 'Check t1' }).click();
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  expect([module.count('bc-manifest.json'), module.count('UserTaskForm.js'), module.count('Views.js')]).toEqual([1, 1, 1]);
  // client-side navigation to the list and to a second task and back to the first
  for (const id of ['t2', 't1']) {
    await page.goBack();
    await page.getByTestId('task-title').filter({ hasText: `Check ${id}` }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${id}$`));
    await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  }
  expect([module.count('bc-manifest.json'), module.count('UserTaskForm.js'), module.count('Views.js')]).toEqual([1, 1, 1]);
});

test('TF-040 the header of an open task shows neither its title nor what the modules draw in the area information', async ({ page }) => {
  await fakeModule(page, {
    'UserTaskForm.js': form({ element: { body: 'fake-module-v1-body', information: 'fake-module-v1-info' }, entry: 'Views' }),
    'Views.js': define('fake-module-v1-body', 'the body') + define('fake-module-v1-info', 'the information of the module'),
  });
  await seed(page, [{}]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('fake-module-v1-info')).toBeVisible();
  const header = page.getByTestId('header');
  await expect(header).not.toContainText('Check t1');
  await expect(header).not.toContainText('the information of the module');
  await expect(header.getByTestId('fake-module-v1-info')).toHaveCount(0);
});
