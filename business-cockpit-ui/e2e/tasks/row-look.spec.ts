import { expect, test, type Locator, type Page } from '@playwright/test';

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

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const row = (page: Page, id: string) => page.getByTestId('task-row').filter({ hasText: `Check ${id}` });
const style = (target: Locator, property: string) => target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('TL-007 a row whose task the user has not read is bold, the whole row', async ({ page }) => {
  await seed(page, [task('seen'), task('fresh', { read: undefined })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  for (const testId of ['cell-id', 'cell-businessId', 'cell-title', 'task-title']) {
    expect(await style(row(page, 'fresh').getByTestId(testId), 'font-weight')).toBe('700');
    expect(await style(row(page, 'seen').getByTestId(testId), 'font-weight')).toBe('400');
  }
});

test('TL-023 a task row looks as its state says; endedAt decides before suspendedAt', async ({ page }) => {
  await seed(page, [
    task('active'),
    task('completed', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' }),
    task('cancelled', { endedAt: '2026-11-21T08:00:00Z', endReason: 'CANCELLED' }),
    task('suspended', { suspendedAt: '2026-11-21T08:00:00Z' }),
    task('suspendedThenCancelled', { endedAt: '2026-11-21T08:00:00Z', endReason: 'CANCELLED', suspendedAt: '2026-11-20T09:00:00Z' }),
  ]);
  await page.goto('/tasks');
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const background = (id: string) => style(row(page, id), 'background-color');
  const color = (id: string, testId: string) => style(row(page, id).getByTestId(testId), 'color');
  const strike = (id: string, testId: string) => style(row(page, id).getByTestId(testId), 'text-decoration-line');
  const normalBackground = await background('active');
  const normalText = await color('active', 'cell-id');
  // suspended: normal background, lighter text
  expect(await background('suspended')).toBe(normalBackground);
  expect(await color('suspended', 'cell-id')).not.toBe(normalText);
  expect(await color('suspended', 'cell-businessId')).not.toBe(normalText);
  expect(await strike('suspended', 'task-title')).not.toContain('line-through');
  expect(await strike('active', 'task-title')).not.toContain('line-through');
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const greyBackground = await background('completed');
  expect(greyBackground).not.toBe(normalBackground);
  // completed: grey, normal text, nothing struck through
  expect(await color('completed', 'cell-id')).toBe(normalText);
  expect(await strike('completed', 'task-title')).not.toContain('line-through');
  // cancelled: grey, normal text, only the title struck through
  expect(await background('cancelled')).toBe(greyBackground);
  expect(await color('cancelled', 'cell-id')).toBe(normalText);
  expect(await strike('cancelled', 'task-title')).toContain('line-through');
  expect(await strike('cancelled', 'cell-id')).not.toContain('line-through');
  expect(await strike('cancelled', 'cell-businessId')).not.toContain('line-through');
  // cancelled while suspended looks cancelled
  expect(await background('suspendedThenCancelled')).toBe(greyBackground);
  expect(await color('suspendedThenCancelled', 'cell-id')).toBe(normalText);
  expect(await strike('suspendedThenCancelled', 'task-title')).toContain('line-through');
  // no symbols (Q-STATE-MARKERS is none)
  await expect(page.getByTestId('task-row').locator('td:not([data-testid="cell-tools"]):not([data-testid="cell-candidateUsers"]):not([data-testid="cell-note"]) .v-icon')).toHaveCount(0);
});
