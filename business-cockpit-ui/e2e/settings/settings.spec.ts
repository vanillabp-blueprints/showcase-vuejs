import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { client } from '../../packages/ui/src/generated/cockpit-gui-api/client.gen';
import { Settings, settingKey } from '../../packages/ui/src/settings/settings';

const guiApi = `http://127.0.0.1:${process.env.SIMULATOR_PORT ?? 8099}/gui/api/v1`;
const settingsPath = '/gui/api/v1/app/current-user/settings/';

type SettingRequest = { method: string; key: string; body?: unknown };

const settingRequests = async (request: import('@playwright/test').APIRequestContext): Promise<SettingRequest[]> =>
  (await request.get('/simulator-api/setting-requests')).json();

const sourceFiles = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === 'node_modules' || name === 'dist' || name === 'generated') return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|vue|js|mjs)$/.test(name) ? [path] : [];
  });

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
  const login = await request.post('/dev-shell/user/anna');
  const cookie = login.headers()['set-cookie'].split(';')[0];
  client.setConfig({ baseUrl: guiApi, headers: { cookie } });
});

test('SET-001 the service reads and writes a setting through the endpoints, and no other code calls them', async ({ request }) => {
  const settings = new Settings();
  expect(await settings.read('bc:tasks:primaryFilter')).toBeUndefined();
  settings.write('bc:tasks:primaryFilter', 'ClosedTasksOnly');
  await settings.flush();
  expect(await settingRequests(request)).toEqual([
    { method: 'GET', key: 'bc:tasks:primaryFilter' },
    { method: 'PUT', key: 'bc:tasks:primaryFilter', body: 'ClosedTasksOnly' },
  ]);
  // another instance stands for another browser: it reads what the server holds
  expect(await new Settings().read('bc:tasks:primaryFilter')).toBe('ClosedTasksOnly');

  const callers = sourceFiles('packages').filter((file) => /(UserSettingsApi|current-user\/settings)/.test(readFileSync(file, 'utf8')));
  expect(callers).toEqual(['packages/ui/src/settings/settings.ts']);
});

test('SET-002 a setting read once is answered from the cache, without a new request', async ({ request }) => {
  const settings = new Settings();
  await request.put(`${settingsPath}bc:language`, { data: JSON.stringify('de'), headers: { 'content-type': 'application/json' } });
  await request.post('/simulator-api/setting-requests/clear');
  const answers = await Promise.all([settings.read('bc:language'), settings.read('bc:language')]);
  expect(answers).toEqual(['de', 'de']);
  expect(await settings.read('bc:language')).toBe('de');
  expect((await settingRequests(request)).filter((r) => r.method === 'GET')).toHaveLength(1);
  // a missing setting is cached as well
  await settings.read('bc:nothing');
  await settings.read('bc:nothing');
  expect((await settingRequests(request)).filter((r) => r.key === 'bc:nothing')).toHaveLength(1);
});

test('SET-004 the user interface keeps no setting in localStorage, sessionStorage or a cookie of its own', async ({ page }) => {
  const offenders = sourceFiles('packages').filter((file) => /\b(localStorage|sessionStorage)\b|document\.cookie/.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect((await page.context().cookies()).map((cookie) => cookie.name).filter((name) => !name.startsWith('bc'))).toEqual([]);
});

test('SET-005 every key uses : as its separator and has no dot', async ({ request }) => {
  expect(settingKey('tasks', 'primaryFilter')).toBe('bc:tasks:primaryFilter');
  expect(settingKey('columns', 'tasks', 'width', 'details.customer.name')).toBe('bc:columns:tasks:width:details:customer:name');
  const settings = new Settings();
  expect(() => settings.write('bc.tasks.primaryFilter', 'x')).toThrow(/bc\.tasks\.primaryFilter/);
  await expect(settings.read('bc:a.b')).rejects.toThrow(/bc:a\.b/);
  expect(await settingRequests(request)).toEqual([]);
  // the server refuses a dot, so the simulator does too
  expect((await request.put(`${settingsPath}bc:a.b`, { data: 1 })).status()).toBe(400);
});

test('SET-006 a write reaches the cache at once, and a setting which changes often is written once after it stopped changing', async ({ request }) => {
  const settings = new Settings({ quietMilliseconds: 150 });
  const key = settingKey('columns', 'tasks', 'width', 'title');
  settings.write('bc:language', 'fr');
  // the cache answers before the server did
  expect(await settings.read('bc:language')).toBe('fr');
  await settings.flush();
  expect((await settingRequests(request)).filter((r) => r.method === 'GET')).toEqual([]);

  for (const width of [100, 120, 140, 160, 180]) settings.writeWhenQuiet(key, width);
  expect(await settings.read(key)).toBe(180);
  expect((await settingRequests(request)).filter((r) => r.key === key)).toEqual([]);
  await expect.poll(async () => (await settingRequests(request)).filter((r) => r.key === key)).toEqual([{ method: 'PUT', key, body: 180 }]);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect((await settingRequests(request)).filter((r) => r.key === key)).toHaveLength(1);
});
