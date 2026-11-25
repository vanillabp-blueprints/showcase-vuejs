import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const person = (id: string, display: string, displayShort: string) => ({ id, display, displayShort, email: `${id}@acme.example` });
const anna = person('anna', 'Anna Sales', 'Anna');
const ben = person('ben', 'Ben Support', 'Ben');

const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'orders',
  bpmnProcessId: 'order',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  ...extra,
});

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const stored = async (page: Page): Promise<SimulatedTask[]> => (await page.request.get('/simulator-api/user-tasks')).json();
const row = (page: Page, id: string) => page.getByTestId('task-row').filter({ hasText: `Check ${id}` });

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('ACT-012 claiming a task of another assignee asks every time, with no way to stop asking', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await t1.getByTestId('claim-checkbox').click();
  const question = page.getByTestId('claim-confirm');
  await expect(question).toBeVisible();
  await expect(question).toContainText('Ben Support');
  await expect(question.locator('input[type=checkbox]')).toHaveCount(0);
  await expect(question).not.toContainText(/again|always|remember/i);
  await page.getByTestId('claim-confirm-no').click();
  await expect(question).toBeHidden();
  expect(((await stored(page))[0]!.assignee as { id: string }).id).toBe('ben');
  await t1.getByTestId('cell-assignee').hover();
  await expect(t1.getByTestId('claim-checkbox')).not.toBeChecked();
  await t1.getByTestId('claim-checkbox').click();
  await expect(question).toBeVisible();
  await page.getByTestId('claim-confirm-yes').click();
  await expect(t1.getByTestId('assignee-name')).toHaveText('Anna');
  expect(((await stored(page))[0]!.assignee as { id: string }).id).toBe('anna');
  // the answer is not kept: the next claim of a task of another assignee asks again
  await seed(page, [task('t1', { assignee: ben })]);
  await page.reload();
  await t1.getByTestId('cell-assignee').hover();
  await t1.getByTestId('claim-checkbox').click();
  await expect(question).toBeVisible();
  await page.getByTestId('claim-confirm-no').click();
  const settings = await (await page.request.get('/simulator-api/setting-requests')).json() as { key: string }[];
  expect(settings.filter((request) => /claim/i.test(request.key))).toEqual([]);
});

test('ACT-013 a 409 of an action redraws the row and says whether the task ended or was suspended', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  const toast = page.getByTestId('action-toast');
  await row(page, 't1').getByTestId('cell-assignee').hover();
  // the task ends after the list was drawn
  await seed(page, [task('t1', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' }), task('t2')]);
  await row(page, 't1').getByTestId('claim-checkbox').click();
  await expect(toast).toHaveText('The task has ended');
  await expect(row(page, 't1')).toHaveCount(0);
  await expect(row(page, 't2')).toHaveCount(1);
  // the task is suspended after the list was drawn
  await row(page, 't2').getByTestId('cell-assignee').hover();
  await seed(page, [task('t2', { suspendedAt: '2026-11-21T08:00:00Z' })]);
  await row(page, 't2').getByTestId('claim-checkbox').click();
  await expect(toast).toHaveText('The task was suspended');
  await expect(row(page, 't2')).toHaveAttribute('data-state', 'suspended');
});

test('ACT-015 a 400 of unclaim redraws the row and says another user holds the task', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await seed(page, [task('t1', { assignee: ben })]);
  await t1.getByTestId('claim-checkbox').click();
  await expect(page.getByTestId('action-toast')).toHaveText('Another user holds the task');
  await expect(t1.getByTestId('assignee-name')).toHaveText('Ben');
  expect(((await stored(page))[0]!.assignee as { id: string }).id).toBe('ben');
});

test('ACT-016 a suspended task disables claim, unclaim, propose and remove candidate, and nothing else', async ({ page }) => {
  await seed(page, [
    task('t1', { suspendedAt: '2026-11-21T08:00:00Z', candidateUsers: [ben], read: true }),
    task('t2', { suspendedAt: '2026-11-21T08:00:00Z', assignee: anna }),
  ]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await expect(t1.getByTestId('claim-checkbox')).toBeDisabled();
  await row(page, 't2').getByTestId('cell-assignee').hover();
  await expect(row(page, 't2').getByTestId('claim-checkbox')).toBeDisabled();
  await t1.getByTestId('cell-candidateUsers').hover();
  await expect(t1.getByTestId('candidate-remove')).toBeDisabled();
  await expect(t1.getByTestId('propose-search')).toBeDisabled();
  await expect(t1.getByTestId('follow-up-edit')).toBeEnabled();
  await t1.getByTestId('cell-note').hover();
  await expect(t1.getByTestId('note-edit')).toBeEnabled();
  await expect(t1.getByTestId('mark-unread')).toBeEnabled();
  await t1.getByTestId('mark-unread').click();
  await expect(t1.getByTestId('mark-read')).toBeEnabled();
});

test('ACT-017 an update that shows the task active again enables its actions without a reload', async ({ page }) => {
  await seed(page, [task('t1', { suspendedAt: '2026-11-21T08:00:00Z', candidateUsers: [ben] })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await expect(t1.getByTestId('claim-checkbox')).toBeDisabled();
  await seed(page, [task('t1', { candidateUsers: [ben] })]);
  await page.request.post('/simulator-api/publish', { data: { event: 'UserTask' } });
  await expect(t1).toHaveAttribute('data-state', 'active');
  await t1.getByTestId('cell-assignee').hover();
  await expect(t1.getByTestId('claim-checkbox')).toBeEnabled();
  await t1.getByTestId('cell-candidateUsers').hover();
  await expect(t1.getByTestId('candidate-remove')).toBeEnabled();
  await expect(t1.getByTestId('propose-search')).toBeEnabled();
});
