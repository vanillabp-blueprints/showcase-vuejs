// LIVE-019, LIVE-020, LIVE-022, LIVE-023, LIVE-024: who made a change, and the one update stream of a tab (Q-LIVE-MODE = live).
// LIVE-021 needs a list limited to workflow modules; the cockpit has none, so it has no test (ASK-034).
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

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
// the user of the simulator is anna
const publish = (page: Page, id: string, type: string, initiatorKind: string, initiator?: string) =>
  page.request.post('/simulator-api/publish', { data: { event: 'UserTask', items: [{ workflowModuleId: 'orders', event: { name: 'UserTask', id, type, initiatorKind, initiator } }] } });
const attempts = async (page: Page): Promise<number[]> => (await page.request.get('/simulator-api/stream-attempts')).json();
const streamCount = async (page: Page): Promise<number> => (await page.request.get('/simulator-api/stream-count')).json();
const refuse = (page: Page, status?: number) => page.request.post('/simulator-api/stream-refusal', { data: { status } });
const reloadAfterOpen = (page: Page, milliseconds: number) => page.request.post('/simulator-api/reload-after-open', { data: { milliseconds } });
const listReads = async (page: Page): Promise<number> =>
  ((await (await page.request.get('/simulator-api/list-requests')).json()) as { path: string }[]).filter((request) => request.path.endsWith('/usertask')).length;

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('LIVE-019 a change by the system or the cockpit is highlighted as changed, only an own change of a user is not', async ({ page }) => {
  await seed(page, [task('t1'), task('t2'), task('t3')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await seed(page, [task('t1', { updatedAt: now() }), task('t2', { updatedAt: now() }), task('t3', { updatedAt: now() })]);
  await publish(page, 't1', 'UPDATE', 'SYSTEM');
  await publish(page, 't2', 'UPDATE', 'COCKPIT');
  await publish(page, 't3', 'UPDATE', 'USER', 'anna');
  await expect(row(page, 't1')).toHaveAttribute('data-mark', 'changed');
  await expect(row(page, 't2')).toHaveAttribute('data-mark', 'changed');
  await expect(row(page, 't3')).not.toHaveAttribute('data-mark', /.+/);
});

test('LIVE-020 own is decided from the events: one event of somebody else marks the row, whatever the order', async ({ page }) => {
  await seed(page, [task('t1'), task('t2'), task('t3')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await seed(page, [task('t1', { updatedAt: now() }), task('t2', { updatedAt: now() }), task('t3', { updatedAt: now() })]);
  // an own event is not own when the id of the user is the initiator of a SYSTEM event
  await page.request.post('/simulator-api/publish', { data: { event: 'UserTask', items: [
    { workflowModuleId: 'orders', event: { name: 'UserTask', id: 't1', type: 'UPDATE', initiatorKind: 'USER', initiator: 'anna' } },
    { workflowModuleId: 'orders', event: { name: 'UserTask', id: 't1', type: 'UPDATE', initiatorKind: 'SYSTEM', initiator: 'anna' } },
    { workflowModuleId: 'orders', event: { name: 'UserTask', id: 't2', type: 'UPDATE', initiatorKind: 'USER', initiator: 'anna' } },
    { workflowModuleId: 'orders', event: { name: 'UserTask', id: 't2', type: 'UPDATE', initiatorKind: 'USER', initiator: 'anna' } },
  ] } });
  await expect(row(page, 't1')).toHaveAttribute('data-mark', 'changed');
  await expect(row(page, 't2')).not.toHaveAttribute('data-mark', /.+/);
  // the own event comes after the event of another one: still marked
  await publish(page, 't3', 'UPDATE', 'USER', 'ben');
  await publish(page, 't3', 'UPDATE', 'USER', 'anna');
  await expect(row(page, 't3')).toHaveAttribute('data-mark', 'changed');
  await expect(row(page, 't2')).not.toHaveAttribute('data-mark', /.+/);
});

test('LIVE-022 a stream which waits for its next try connects at once before an ordinary request', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(() => streamCount(page)).toBeGreaterThan(0);
  await refuse(page, 503);
  await page.request.post('/simulator-api/end-streams');
  // the pauses grow: 0.3, 0.6, 1.2 and 2.4 seconds
  await expect.poll(async () => (await attempts(page)).length, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  const before = (await attempts(page)).length;
  await refuse(page, undefined);
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect.poll(() => streamCount(page), { timeout: 700, intervals: [25] }).toBeGreaterThan(0);
  expect((await attempts(page)).length).toBeGreaterThan(before);
});

test('LIVE-023 a tab opens one update stream for the counts, the list and the open page', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(() => streamCount(page)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await attempts(page)).toHaveLength(1);
  expect(await streamCount(page)).toBe(1);
  // the page of a task has the counts and the page, and the page of a case the same
  await page.request.post('/simulator-api/reset');
  await seed(page, [task('t1')]);
  await page.goto('/tasks/t1');
  await expect.poll(() => streamCount(page)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await attempts(page)).toHaveLength(1);
  expect(await streamCount(page)).toBe(1);
});

test('LIVE-024 a list which started after the stream opened skips its first RELOAD, a list takes the RELOAD of a stream which connected again', async ({ page }) => {
  await seed(page, [task('t1')]);
  await reloadAfterOpen(page, 2500);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(() => streamCount(page)).toBeGreaterThan(0);
  // a new row marks the list, and the button starts the list again while the stream is open and its RELOAD has not come
  await seed(page, [task('t1'), task('t2', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't2', 'INSERT', 'USER', 'ben');
  await expect(row(page, 't2')).toHaveAttribute('data-mark', 'new');
  await page.getByTestId('acknowledge').click();
  await expect(page.getByTestId('acknowledge')).toHaveCount(0);
  const afterStart = await listReads(page);
  await page.waitForTimeout(3500);
  expect(await listReads(page)).toBe(afterStart);
  // the stream connects again: its RELOAD is read
  await reloadAfterOpen(page, 0);
  await page.request.post('/simulator-api/end-streams');
  await expect.poll(() => listReads(page), { timeout: 4000 }).toBeGreaterThan(afterStart);
});

test('LIVE-024 a list which started before the stream was open takes the first RELOAD', async ({ page }) => {
  await seed(page, [task('t1')]);
  await refuse(page, 503);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  const afterStart = await listReads(page);
  await refuse(page, undefined);
  await expect.poll(() => listReads(page), { timeout: 6000 }).toBeGreaterThan(afterStart);
});
