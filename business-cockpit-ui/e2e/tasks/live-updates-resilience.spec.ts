// LIVE-013, LIVE-014, LIVE-015, LIVE-016, LIVE-017, LIVE-018: the update stream when it breaks, and what an update leaves alone.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const loginPath = '/oauth2/authorization/keycloak';
const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'orders',
  bpmnProcessId: 'order',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  read: '2026-11-21T08:00:00Z',
  ...extra,
});
const now = () => new Date().toISOString();
const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const row = (page: Page, id: string) => page.getByTestId('task-row').filter({ hasText: `Check ${id}` });
const publish = (page: Page, id: string | undefined, type: string, initiatorKind: string, initiator?: string) =>
  page.request.post('/simulator-api/publish', { data: { event: 'UserTask', items: [{ workflowModuleId: 'orders', event: { name: 'UserTask', id, type, initiatorKind, initiator } }] } });
const ids = (count: number) => Array.from({ length: count }, (_, index) => `t${String(index + 1).padStart(3, '0')}`);
const attempts = async (page: Page): Promise<number[]> => (await page.request.get('/simulator-api/stream-attempts')).json();
const refuse = (page: Page, status?: number) => page.request.post('/simulator-api/stream-refusal', { data: { status } });
const listRequests = async (page: Page): Promise<{ path: string; body: { pageNumber?: number } }[]> =>
  (await page.request.get('/simulator-api/list-requests')).json();

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('LIVE-013 after a lost connection the pause before connecting again grows', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json()).toBeGreaterThan(0);
  await refuse(page, 503);
  const before = (await attempts(page)).length;
  await page.request.post('/simulator-api/end-streams');
  // each open component has its own stream, so the tries of one round come together
  const rounds = async (): Promise<number[]> => (await attempts(page)).slice(before).filter((time, index, all) => index === 0 || time - all[index - 1]! > 100);
  await expect.poll(async () => (await rounds()).length, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  const times = await rounds();
  const gaps = times.slice(1).map((time, index) => time - times[index]!);
  expect(gaps[2]!).toBeGreaterThan(gaps[0]! * 2);
  expect(gaps[1]!).toBeGreaterThan(gaps[0]!);
});

test('LIVE-013 the pause never grows beyond 15 seconds, and a connection which holds starts it again', async ({ page }) => {
  await page.clock.install();
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await refuse(page, 503);
  await page.request.post('/simulator-api/end-streams');
  // eleven pauses: doubling from 0.3 seconds would pass 15 seconds long before
  for (let round = 1; round <= 11; round++) {
    const count = (await attempts(page)).length;
    await page.clock.fastForward(15000);
    await expect.poll(async () => (await attempts(page)).length, { timeout: 3000 }).toBeGreaterThan(count);
  }
  await refuse(page, undefined);
  const count = (await attempts(page)).length;
  await page.clock.fastForward(15000);
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json()).toBeGreaterThan(0);
  // held: the next loss is answered after the first short pause again
  await page.request.post('/simulator-api/end-streams');
  await page.clock.fastForward(400);
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json(), { timeout: 3000 }).toBeGreaterThan(0);
  expect((await attempts(page)).length).toBeGreaterThan(count);
});

test('LIVE-014 when connecting again answers 401 the user interface stops trying and goes to the login', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json()).toBeGreaterThan(0);
  // the login is held back, so the page stays and can show whether it tries again
  await page.route(`**${loginPath}`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'login' }));
  await refuse(page, 401);
  const before = (await attempts(page)).length;
  const login = page.waitForRequest((request) => new URL(request.url()).pathname === loginPath);
  await page.request.post('/simulator-api/end-streams');
  await login;
  await page.waitForTimeout(500);
  const stopped = (await attempts(page)).length;
  await page.waitForTimeout(2000);
  expect((await attempts(page)).length).toBe(stopped);
  expect(stopped).toBeGreaterThan(before);
});

test('LIVE-015 the selection stays when the list updates and when a row is removed', async ({ page }) => {
  await seed(page, [task('t1'), task('t2'), task('t3')]);
  await page.goto('/tasks');
  await row(page, 't1').getByTestId('select-row').check();
  await row(page, 't2').getByTestId('select-row').check();
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await seed(page, [task('t1'), task('t2'), task('t3', { title: { en: 'Check t3', de: 'Prüfe t3' }, updatedAt: now() })]);
  await publish(page, 't3', 'UPDATE', 'USER', 'ben');
  await expect(row(page, 't3')).toHaveAttribute('data-mark', 'changed');
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await expect(row(page, 't1').getByTestId('select-row')).toBeChecked();
  await seed(page, [task('t2'), task('t3')]);
  await publish(page, 't1', 'DELETE', 'SYSTEM');
  await expect(row(page, 't1')).toHaveAttribute('data-mark', 'removed');
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await expect(row(page, 't2').getByTestId('select-row')).toBeChecked();
});

test('LIVE-016 an update reads only the pages of the loaded window', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await seed(page, ids(400).map((id) => task(id)));
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row').first()).toBeVisible();
  await page.waitForTimeout(800);
  const before = await listRequests(page);
  const loaded = new Set(before.map(({ body }) => body.pageNumber ?? 0));
  const mark = before.length;
  await seed(page, ids(400).map((id) => task(id, id === 't002' ? { updatedAt: now() } : {})));
  await publish(page, 't002', 'UPDATE', 'USER', 'ben');
  await expect.poll(async () => (await listRequests(page)).length, { timeout: 5000 }).toBeGreaterThan(mark);
  await page.waitForTimeout(500);
  const asked = (await listRequests(page)).slice(mark);
  for (const { body } of asked) expect(loaded.has(body.pageNumber ?? 0)).toBe(true);
  expect(asked.length).toBeLessThanOrEqual(loaded.size);
});

test('LIVE-017 the events are typed by the generated client and the stream is opened with EventSource or fetch', () => {
  const events = readFileSync('packages/ui/src/tasks/updateEvents.ts', 'utf8');
  const stream = readFileSync('packages/ui/src/api/updateStream.ts', 'utf8');
  expect(events).toMatch(/from '\.\.\/generated\/cockpit-gui-api'/);
  expect(events).not.toMatch(/export interface UpdateEvent/);
  expect(stream).toMatch(/EventSource|fetch\(/);
  expect(stream).not.toMatch(/getUpdates|sdk\.gen|CockpitApi|\.sse\./);
});

test('LIVE-018 after a live update a filtered list shows only rows which match the filter', async ({ page }) => {
  await seed(page, [task('a1'), task('a2'), task('b1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const title = page.getByTestId('column-filter-title');
  await title.fill('Check a');
  await title.press('Enter');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const fresh = { createdAt: now(), updatedAt: now() };
  await seed(page, [task('a1'), task('a2'), task('b1'), task('b2', fresh), task('a3', fresh)]);
  await publish(page, 'b2', 'INSERT', 'USER', 'ben');
  await publish(page, 'a3', 'INSERT', 'USER', 'ben');
  await expect(row(page, 'a3')).toHaveAttribute('data-mark', 'new');
  await expect(row(page, 'b2')).toHaveCount(0);
  await expect(row(page, 'b1')).toHaveCount(0);
  await expect(page.getByTestId('task-row')).toHaveCount(3);
});
