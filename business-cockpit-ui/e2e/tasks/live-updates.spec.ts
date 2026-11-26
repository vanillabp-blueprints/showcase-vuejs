// LIVE-001, LIVE-002, LIVE-003, LIVE-004: the open task list shows changes of the update stream without a reload (Q-LIVE-MODE = live).
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

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('LIVE-001 a task created by somebody else appears without a reload, highlighted as new', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await seed(page, [task('t1'), task('t2', { createdAt: now(), updatedAt: now() })]);
  await publish(page, 't2', 'INSERT', 'USER', 'ben');
  await expect(row(page, 't2')).toHaveAttribute('data-mark', 'new');
  await expect(row(page, 't2')).toHaveCSS('background-color', 'rgb(200, 230, 201)');
  await expect(row(page, 't1')).not.toHaveAttribute('data-mark', /.+/);
});

test('LIVE-002 a task changed by somebody else is updated in place and highlighted as changed; an own change only shows the data', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await seed(page, [task('t1', { title: { en: 'Check t1 mine' }, updatedAt: now() }), task('t2')]);
  await publish(page, 't1', 'UPDATE', 'USER', 'anna');
  await expect(page.getByTestId('task-row').first()).toContainText('Check t1 mine');
  await expect(page.getByTestId('task-row').first()).not.toHaveAttribute('data-mark', /.+/);
  await seed(page, [task('t1', { title: { en: 'Check t1 mine' }, updatedAt: now() }), task('t2', { title: { en: 'Check t2 theirs' }, updatedAt: now() })]);
  await publish(page, 't2', 'UPDATE', 'SYSTEM');
  await expect(page.getByTestId('task-row').nth(1)).toContainText('Check t2 theirs');
  await expect(page.getByTestId('task-row').nth(1)).toHaveAttribute('data-mark', 'changed');
  await expect(page.getByTestId('task-row').nth(1)).toHaveCSS('background-color', 'rgb(255, 245, 157)');
  // several events for one row: marked unless all of them were the user's own
  await seed(page, [task('t1', { updatedAt: now() }), task('t2', { updatedAt: now() })]);
  await publish(page, 't1', 'UPDATE', 'USER', 'ben');
  await publish(page, 't1', 'UPDATE', 'USER', 'anna');
  await expect(page.getByTestId('task-row').first()).toHaveAttribute('data-mark', 'changed');
});

test('LIVE-003 an ended task stays and looks ended, a suspended one gets the suspended look and loses it when activated again', async ({ page }) => {
  await seed(page, [task('t1'), task('t2'), task('t3')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await seed(page, [task('t1', { endedAt: now(), endReason: 'COMPLETED' }), task('t2', { endedAt: now(), endReason: 'CANCELLED' }), task('t3', { suspendedAt: now(), updatedAt: now() })]);
  await publish(page, 't1', 'UPDATE', 'SYSTEM');
  await expect(row(page, 't1')).toHaveAttribute('data-state', 'completed');
  await expect(row(page, 't2')).toHaveAttribute('data-state', 'cancelled');
  await expect(row(page, 't3')).toHaveAttribute('data-state', 'suspended');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await seed(page, [task('t1', { endedAt: now(), endReason: 'COMPLETED' }), task('t2', { endedAt: now(), endReason: 'CANCELLED' }), task('t3', { updatedAt: now() })]);
  await publish(page, 't3', 'UPDATE', 'SYSTEM');
  await expect(row(page, 't3')).toHaveAttribute('data-state', 'active');
});

test('LIVE-004 a row the server no longer returns stays in place, marked as removed', async ({ page }) => {
  await seed(page, [task('t1'), task('t2'), task('t3')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await seed(page, [task('t1'), task('t3')]);
  await publish(page, 't2', 'DELETE', 'SYSTEM');
  await expect(row(page, 't2')).toHaveAttribute('data-mark', 'removed');
  await expect(row(page, 't2')).toHaveCSS('background-color', 'rgb(255, 205, 210)');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await expect(page.getByTestId('task-row').nth(1)).toContainText('Check t2');
});
