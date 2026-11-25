// EXT-016, EXT-019, EXT-021, EXT-026, EXT-027, EXT-029: the cockpit page loads the parts of the built test modules.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { addressOf } from '@acme/bc-module-host';
import { DATA_ENTRIES, EXPORT_NAMES } from '@acme/bc-module-kit';

const here = new URL('.', import.meta.url).pathname;
const register = (page: Page, id: string) => page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });
const task = (id: string, extra: Record<string, unknown>) => ({
  id, bpmnProcessId: 'p', createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`, title: { en: `Check ${id}` }, workflowModuleId: 'react-module', ...extra,
});
const seed = (page: Page, tasks: object[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const requestsOf = (page: Page) => {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(new URL(request.url()).pathname));
  return urls;
};

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('EXT-016 the list of modules is asked once and no component of the cockpit imports a part by itself', async ({ page }) => {
  await register(page, 'react-module');
  await register(page, 'angular-module');
  await seed(page, [task('t1', { uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' }), task('t2', { uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' })]);
  const urls = requestsOf(page);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByTestId('task-row').first()).toHaveAttribute('data-parts', 'loaded');
  await expect(page.getByTestId('react-header')).toBeVisible();
  expect(urls.filter((url) => url === '/gui/api/v1/workflow-module')).toHaveLength(1);
  const files = urls.filter((url) => url.startsWith('/wm/'));
  expect(new Set(files).size).toBe(files.length); // every file of a module is fetched once
  const importing: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (name === 'generated' || name === 'node_modules' || name === 'dist') continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|vue)$/.test(name) && /\bimport\s*\(/.test(readFileSync(path, 'utf8'))) importing.push(path);
    }
  };
  walk(join(here, '../../packages/ui/src'));
  expect(importing).toEqual([]);
});

test('EXT-019 a module which registered after the page loaded is added when the first row of it shows up', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(0);
  await register(page, 'react-module');
  await seed(page, [task('late', { uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' })]);
  const urls = requestsOf(page);
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module/usertask/late', { data: task('late', {}) });
  await expect(page.getByTestId('task-row')).toHaveAttribute('data-parts', 'loaded');
  expect(urls.filter((url) => url === '/gui/api/v1/workflow-module/react-module')).toHaveLength(1);
  expect(urls.filter((url) => url === '/gui/api/v1/workflow-module')).toHaveLength(0);
});

test('EXT-021 a row with an unknown uiUriType is shown and the user is told it cannot be opened here', async ({ page }) => {
  await register(page, 'react-module');
  await seed(page, [task('odd', { uiUriType: 'SOMETHING_ELSE', uiUri: '/x' }), task('fine', { uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const odd = page.locator('[data-task-id="odd"]');
  await expect(odd.getByTestId('cannot-open')).toHaveText('This task cannot be opened here.');
  await expect(odd.getByTestId('task-title')).toHaveText('Check odd');
  await expect(page.locator('[data-task-id="fine"]').getByTestId('cannot-open')).toHaveCount(0);
});

test('EXT-026 an ES module row loads its parts through the loader, whatever the form of its address', async ({ page, baseURL }) => {
  // the address of a row: a whole address stays, any other uiUri is a path of the module
  expect(addressOf({ workflowModuleId: 'm', uiUri: '/bc-manifest.json' })).toBe('/wm/m/bc-manifest.json');
  expect(addressOf({ workflowModuleId: 'm', uiUri: 'bc-manifest.json' })).toBe('/wm/m/bc-manifest.json');
  expect(addressOf({ workflowModuleId: 'm', uiUri: 'https://x.example/a/bc-manifest.json' })).toBe('https://x.example/a/bc-manifest.json');
  await register(page, 'react-module');
  await register(page, 'angular-module');
  await seed(page, [
    task('path', { uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' }),
    task('whole', { workflowModuleId: 'angular-module', uiUriType: 'ES_MODULES', uiUri: `${baseURL}/wm/angular-module/bc-manifest.json` }),
  ]);
  const urls = requestsOf(page);
  await page.goto('/tasks');
  await expect(page.locator('[data-parts="loaded"]')).toHaveCount(2);
  for (const id of ['react-module', 'angular-module']) {
    expect(urls.filter((url) => url === `/wm/${id}/bc-manifest.json`)).toHaveLength(1);
    expect(urls.some((url) => new RegExp(`^/wm/${id}/UserTaskList-.*\\.js$`).test(url))).toBe(true);
  }
});

test('EXT-027 the entry names are those of the interview, without ./ in front', async () => {
  expect([...DATA_ENTRIES].sort()).toEqual(['Header', 'UserTaskForm', 'UserTaskList', 'WorkflowList', 'WorkflowPage']);
  expect(Object.keys(EXPORT_NAMES).some((name) => name.startsWith('./'))).toBe(false);
  for (const id of ['react-module', 'vue-module', 'angular-module']) {
    const { entries } = JSON.parse(readFileSync(join(here, id, 'dist/bc-manifest.json'), 'utf8')) as { entries: Record<string, string> };
    for (const name of Object.keys(entries)) expect(name.startsWith('.')).toBe(false);
    for (const name of Object.keys(entries).filter((entry) => (DATA_ENTRIES as readonly string[]).includes(entry))) expect(EXPORT_NAMES).toHaveProperty(name);
  }
  expect(JSON.parse(readFileSync(join(here, 'react-module/dist/bc-manifest.json'), 'utf8')).entries).toHaveProperty('Header');
});

test('EXT-029 one page shows parts of a React and an Angular module in the Vue cockpit', async ({ page }) => {
  await register(page, 'react-module');
  await register(page, 'angular-module');
  await page.goto('/tasks');
  const react = page.getByTestId('react-header');
  const angular = page.getByTestId('angular-header');
  await expect(react).toHaveAttribute('data-framework', 'react');
  await expect(angular).toHaveAttribute('data-framework', 'angular');
  await expect(page.getByTestId('module-header').locator('> span')).toHaveCount(2);
  expect(await page.evaluate(() => (document.querySelector('#app') as any).__vue_app__ !== undefined)).toBe(true);
});
