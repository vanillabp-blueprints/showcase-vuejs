// LIVE-005, LIVE-006, LIVE-007, LIVE-010, LIVE-011, LIVE-012: the open task list while ended and removed rows stay (Q-LIVE-MODE = live).
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const rowHeight = 46;
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
const ids = (count: number, skip: number[] = []) => Array.from({ length: count }, (_, index) => index + 1).filter((number) => !skip.includes(number)).map((number) => `t${String(number).padStart(2, '0')}`);
const scroller = (page: Page) => page.getByTestId('task-list').locator('.v-table__wrapper');
const listRequests = async (page: Page): Promise<{ path: string; initialTimestamp?: string; serverTimestamp?: string; body: { mode?: string; pageNumber?: number } }[]> =>
  (await page.request.get('/simulator-api/list-requests')).json();

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('LIVE-005 scrolling loads every row once while a removed row is still shown', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
    await seed(page, ids(60).map((id) => task(id)));
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row').first()).toBeVisible();
  await seed(page, ids(60, [2]).map((id) => task(id)));
  await publish(page, 't02', 'DELETE', 'SYSTEM');
  await expect(row(page, 't02')).toHaveAttribute('data-mark', 'removed');
  const seen: string[] = [];
  for (let top = 0; top <= 63 * rowHeight; top += 2 * rowHeight) {
    await scroller(page).evaluate((element, value) => { element.scrollTop = value; }, top);
    await page.waitForTimeout(150);
    await expect(page.getByTestId('task-list')).toHaveAttribute('data-pending', '0');
    seen.push(...(await page.getByTestId('task-row').locator('[data-testid="cell-businessId"]').allInnerTexts()).map((text) => text.trim()));
  }
  for (let again = 0; again < 3; again++) {
    await scroller(page).evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(300);
  }
  seen.push(...(await page.getByTestId('task-row').locator('[data-testid="cell-businessId"]').allInnerTexts()).map((text) => text.trim()));
  const expected = ids(60).map((id) => `B-${id}`);
  expect([...new Set(seen)].sort()).toEqual(expected);
  await expect(page.getByTestId('task-row').last()).toContainText('Check t60');
});

test('LIVE-006 the counts of the status line update after a change', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('primary-filter-OpenTasksWithoutFollowUp')).toContainText('2');
  await expect(page.getByTestId('primary-filter-OpenTasksWithFollowUp')).toContainText('2');
  await seed(page, [task('t1'), task('t2'), task('t3', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't3', 'INSERT', 'USER', 'ben');
  await expect(page.getByTestId('primary-filter-OpenTasksWithoutFollowUp')).toContainText('3');
  await expect(page.getByTestId('primary-filter-OpenTasksWithFollowUp')).toContainText('3');
});

test('LIVE-007 the acknowledge button reads the list again with a new start and drops marks and ended rows', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByTestId('acknowledge')).toHaveCount(0);
  await seed(page, [task('t1', { endedAt: now(), endReason: 'COMPLETED', updatedAt: now() }), task('t2'), task('t3', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't1', 'UPDATE', 'SYSTEM');
  await publish(page, 't3', 'INSERT', 'USER', 'ben');
  await expect(row(page, 't3')).toHaveAttribute('data-mark', 'new');
  await expect(row(page, 't1')).toHaveAttribute('data-state', 'completed');
  const before = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).length;
  await page.getByTestId('acknowledge').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(row(page, 't1')).toHaveCount(0);
  await expect(page.getByTestId('task-row').locator('xpath=self::*[@data-mark]')).toHaveCount(0);
  await expect(page.getByTestId('acknowledge')).toHaveCount(0);
  const asked = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).slice(before);
  expect(asked[0]!.initialTimestamp).toBeUndefined();
});

test('LIVE-010 a RELOAD event reads the list again with the same timestamp, the marks and ended rows stay', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await seed(page, [task('t1', { endedAt: now(), endReason: 'COMPLETED', updatedAt: now() }), task('t2'), task('t3', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't3', 'INSERT', 'USER', 'ben');
  await expect(row(page, 't3')).toHaveAttribute('data-mark', 'new');
  const before = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).length;
  await publish(page, undefined, 'RELOAD', 'SYSTEM');
  await expect.poll(async () => (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).length).toBeGreaterThan(before);
  const all = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask'));
  expect(all.at(-1)!.initialTimestamp).toBe(all[0]!.serverTimestamp);
  expect(all.at(-1)!.body.mode).toBe('OpenTasksWithoutFollowUp');
  await expect(row(page, 't3')).toHaveAttribute('data-mark', 'new');
  await expect(row(page, 't1')).toHaveAttribute('data-state', 'completed');
});

test('LIVE-011 a task whose follow-up date has come appears in OpenTasksWithoutFollowUp', async ({ page }) => {
  const due = new Date(Date.now() + 1500).toISOString();
  await seed(page, [task('t1'), task('t2', { followUpDate: due })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.waitForTimeout(1700);
  await publish(page, 't2', 'FOLLOWUP', 'SYSTEM');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(row(page, 't2')).toBeVisible();
});

test('LIVE-012 when the server ends the stream the user interface connects again within one second', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json()).toBeGreaterThan(0);
  await page.request.post('/simulator-api/end-streams');
  await expect.poll(async () => (await page.request.get('/simulator-api/stream-count')).json(), { timeout: 1000, intervals: [50] }).toBeGreaterThan(0);
  await seed(page, [task('t1'), task('t2', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't2', 'INSERT', 'USER', 'ben');
  await expect(row(page, 't2')).toHaveAttribute('data-mark', 'new');
});
