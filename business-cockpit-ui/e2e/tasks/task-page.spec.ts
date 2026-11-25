// TL-022, ACT-019, TF-001, TF-004, TF-005, TF-006: a clerk opens a task and works on it in the form of the module.
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const anna = { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' };
const ben = { id: 'ben', display: 'Ben Support', displayShort: 'Ben', email: 'ben@acme.example' };

// a task of the react test module, whose form draws the areas body, information and actions
const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'react-module',
  bpmnProcessId: 'ride',
  uiUriType: 'ES_MODULES',
  uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  ...extra,
});

const seed = async (page: Page, tasks: SimulatedTask[]) => {
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
};
const stored = async (page: Page, id: string): Promise<SimulatedTask> =>
  ((await (await page.request.get('/simulator-api/user-tasks')).json()) as SimulatedTask[]).find((found) => found.id === id)!;
const action = (page: Page, name: string) => page.getByTestId('header').getByTestId(`task-action-${name}`);

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-001 opening a task from the list loads it, marks it as read and draws the web component the module names', async ({ page }) => {
  await seed(page, [task('t1', { read: false })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveClass(/unread/);
  await page.getByTestId('task-title').click();
  await expect(page).toHaveURL(/\/tasks\/t1$/);
  await expect(page.getByTestId('react-all')).toContainText('React all of t1');
  expect((await stored(page, 't1')).read).toBe(true);
});

test('TL-022 a closed task is listed and opened like an open one', async ({ page }) => {
  await seed(page, [task('t1'), task('t2', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED', read: true })]);
  await page.goto('/tasks');
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.getByTestId('task-title').click();
  await expect(page).toHaveURL(/\/tasks\/t2$/);
  await expect(page.getByTestId('react-all')).toContainText('React all of t2');
  // the cockpit treats it the same way, the actions which need an open task are off
  await expect(action(page, 'claim')).toBeDisabled();
  await expect(action(page, 'mark-unread')).toBeEnabled();
});

test('TF-004 the actions sit in the application header at the same place for every kind of task, the page has none of its own', async ({ page }) => {
  await seed(page, [task('t1', { read: true }), task('t2', { workflowModuleId: 'no-parts', uiUriType: 'ES_MODULES', read: true })]);
  const boxes: unknown[] = [];
  for (const id of ['t1', 't2']) {
    await page.goto(`/tasks/${id}`);
    await expect(page.getByTestId('header').getByTestId('task-actions')).toBeVisible();
    boxes.push(await action(page, 'claim').boundingBox());
    // no header and no footer of the task's own, no actions inside the page
    await expect(page.getByTestId('task-page').locator('header, footer, [data-testid="task-actions"]')).toHaveCount(0);
  }
  expect(boxes[0]).toEqual(boxes[1]);
  expect(boxes[0]).not.toBeNull();
});

test('TF-005 the header shows the information of the interview, which is none; the module draws the rest', async ({ page }) => {
  await seed(page, [task('t1', { businessId: 'B-A-VERY-LONG-BUSINESS-ID-FOR-A-TASK' })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-all')).toBeVisible();
  await expect(page.getByTestId('header').getByTestId('task-info')).toHaveCount(0);
  await expect(page.getByTestId('header')).not.toContainText('B-A-VERY-LONG');
});

test('TF-006 the header offers claim and give back, propose, follow-up, note and mark as unread', async ({ page }) => {
  await seed(page, [task('t1', { read: true })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('header').getByTestId('task-actions').locator('[data-testid^="task-action-"]')).toHaveCount(5);
  await action(page, 'claim').click();
  await expect.poll(async () => ((await stored(page, 't1')).assignee as { id: string } | undefined)?.id).toBe('anna');
  await expect(action(page, 'claim')).toHaveAttribute('aria-label', 'Give back');
  await action(page, 'claim').click();
  await expect.poll(async () => (await stored(page, 't1')).assignee).toBeUndefined();

  await action(page, 'propose').click();
  await page.getByTestId('task-propose-search').fill('Ben');
  await page.getByTestId('task-propose-result').filter({ hasText: 'Ben Support' }).click();
  await expect.poll(async () => ((await stored(page, 't1')).candidateUsers as { id: string }[] | undefined)?.map((one) => one.id)).toEqual(['ben']);

  await action(page, 'note').click();
  await page.getByTestId('task-note-input').fill('call back');
  await page.getByTestId('task-note-save').click();
  await expect.poll(async () => (await stored(page, 't1')).note).toBe('call back');

  await action(page, 'follow-up').click();
  await page.getByTestId('task-follow-up-input').fill('2026-12-24');
  await page.getByTestId('task-follow-up-save').click();
  await expect.poll(async () => String((await stored(page, 't1')).followUpDate)).toContain('2026-12-2');

  await action(page, 'mark-unread').click();
  await expect.poll(async () => (await stored(page, 't1')).read).toBe(false);
});

test('TF-006 a task suspended disables claim and propose in the header and nothing else; an update enables them again without a reload', async ({ page }) => {
  await seed(page, [task('t1', { read: true, suspendedAt: '2026-11-21T08:00:00Z' })]);
  await page.goto('/tasks/t1');
  await expect(action(page, 'claim')).toBeDisabled();
  await expect(action(page, 'propose')).toBeDisabled();
  await expect(action(page, 'follow-up')).toBeEnabled();
  await expect(action(page, 'note')).toBeEnabled();
  await expect(action(page, 'mark-unread')).toBeEnabled();
  await seed(page, [task('t1', { read: true })]);
  await page.request.post('/simulator-api/publish', { data: { event: 'UserTask' } });
  await expect(action(page, 'claim')).toBeEnabled();
  await expect(action(page, 'propose')).toBeEnabled();
});

test('ACT-019 what a task tab does shows in the list of another tab at once', async ({ page, context }) => {
  await seed(page, [task('t1', { read: false, note: undefined })]);
  await page.goto('/tasks');
  const row = page.getByTestId('task-row');
  await expect(row).toHaveClass(/unread/);
  const tab = await context.newPage();
  await tab.goto('/tasks/t1');
  await expect(tab.getByTestId('react-all')).toBeVisible();
  // opening marked it as read
  await expect(row).not.toHaveClass(/unread/);
  await tab.getByTestId('header').getByTestId('task-action-mark-unread').click();
  await expect(row).toHaveClass(/unread/);
  await tab.getByTestId('header').getByTestId('task-action-note').click();
  await tab.getByTestId('task-note-input').fill('from the tab');
  await tab.getByTestId('task-note-save').click();
  await expect(row.getByTestId('cell-note')).toContainText('from the tab');
  await tab.getByTestId('header').getByTestId('task-action-claim').click();
  await expect(row.getByTestId('assignee-name')).toHaveText('Anna');
});
