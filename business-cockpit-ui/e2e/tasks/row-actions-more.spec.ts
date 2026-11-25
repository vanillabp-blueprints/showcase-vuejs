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

test('ACT-005 removing a candidate user takes the person off the task', async ({ page }) => {
  await seed(page, [task('t1', { candidateUsers: [anna, ben] })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-candidateUsers').hover();
  await t1.getByTestId('candidate-person').filter({ hasText: 'Ben Support' }).getByTestId('candidate-remove').click();
  await expect(t1.getByTestId('candidate-person')).toHaveCount(1);
  await expect(t1.getByTestId('candidate-person')).toContainText('Anna Sales');
  const [found] = await stored(page);
  expect((found.candidateUsers as { id: string }[]).map((candidate) => candidate.id)).toEqual(['anna']);
});

test('ACT-006 mark as read and mark as unread change the bold state of the row', async ({ page }) => {
  await seed(page, [task('t1', { read: false })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await expect(t1).toHaveClass(/unread/);
  await expect(t1.getByTestId('cell-title')).toHaveCSS('font-weight', '700');
  await t1.getByTestId('mark-read').click();
  await expect(t1).not.toHaveClass(/unread/);
  await expect(t1.getByTestId('cell-title')).not.toHaveCSS('font-weight', '700');
  expect((await stored(page))[0]!.read).toBe(true);
  await t1.getByTestId('mark-unread').click();
  await expect(t1).toHaveClass(/unread/);
  await expect(t1.getByTestId('cell-title')).toHaveCSS('font-weight', '700');
  expect((await stored(page))[0]!.read).toBe(false);
});

test('ACT-007 setting and deleting a follow-up date works for one task', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('follow-up-edit').click();
  await t1.getByTestId('follow-up-input').fill('2099-12-01');
  await t1.getByTestId('follow-up-save').click();
  // the task is put aside, so it leaves the default list
  await expect(row(page, 't1')).toHaveCount(0);
  const date = new Date(String((await stored(page))[0]!.followUpDate));
  expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2099, 11, 1, 0, 0]);
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await row(page, 't1').getByTestId('follow-up-edit').click();
  await expect(row(page, 't1').getByTestId('follow-up-input')).toHaveValue('2099-12-01');
  await row(page, 't1').getByTestId('follow-up-delete').click();
  await expect(row(page, 't1').getByTestId('cell-followUpDate')).toHaveText('');
  expect((await stored(page))[0]!.followUpDate).toBeUndefined();
});

test('ACT-008 the effect of the user\'s own action shows as soon as the server has accepted it, without a stream event', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await t1.getByTestId('claim-checkbox').click();
  await expect(t1.getByTestId('assignee-name')).toHaveText('Anna');
  await t1.getByTestId('cell-candidateUsers').hover();
  await t1.getByTestId('propose-search').fill('ben');
  await t1.getByTestId('propose-result').click();
  await expect(t1.getByTestId('candidate-person')).toContainText('Ben Support');
  await t1.getByTestId('mark-read').click();
  await expect(t1.getByTestId('mark-unread')).toBeVisible();
});

test('ACT-009 actions are disabled for an ended task, mark as read and unread stay enabled', async ({ page }) => {
  await seed(page, [task('t1', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED', candidateUsers: [ben], read: true })]);
  await page.goto('/tasks');
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  await expect(t1.getByTestId('claim-checkbox')).toBeDisabled();
  await t1.getByTestId('cell-candidateUsers').hover();
  await expect(t1.getByTestId('candidate-remove')).toBeDisabled();
  await expect(t1.getByTestId('propose-search')).toBeDisabled();
  await expect(t1.getByTestId('follow-up-edit')).toBeDisabled();
  await t1.getByTestId('cell-note').hover();
  await expect(t1.getByTestId('note-edit')).toBeDisabled();
  await expect(t1.getByTestId('mark-unread')).toBeEnabled();
  await t1.getByTestId('mark-unread').click();
  await expect(t1).toHaveClass(/unread/);
  await expect(t1.getByTestId('mark-read')).toBeEnabled();
});

test('ACT-010 a failed single action tells the user, without revealing whether the task exists', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-assignee').hover();
  // the task is gone for this user before the click, the server answers 404 for it
  await seed(page, []);
  await t1.getByTestId('claim-checkbox').click();
  const toast = page.getByTestId('action-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('The action could not be done');
  await expect(toast).not.toContainText(/not found|exist|404|forbidden|allowed/i);
});
