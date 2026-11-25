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
const row = (page: Page, id: string) => page.getByTestId('task-row').filter({ hasText: `Check ${id}` });

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

// the user of the simulator is anna
test('TL-014 on mouse-over of the assignee cell a checkbox appears, whether or not the details show', async ({ page }) => {
  await seed(page, [task('free'), task('mine', { assignee: anna })]);
  await page.goto('/tasks');
  const free = row(page, 'free');
  await expect(free.getByTestId('claim-checkbox')).toBeHidden();
  await free.getByTestId('cell-assignee').hover();
  await expect(free.getByTestId('claim-checkbox')).toBeVisible();
  await expect(free.getByTestId('claim-checkbox')).not.toBeChecked();
  const mine = row(page, 'mine');
  await expect(mine.getByTestId('claim-checkbox')).toBeHidden();
  await mine.getByTestId('cell-assignee').hover();
  await expect(mine.getByTestId('claim-checkbox')).toBeVisible();
  await expect(mine.getByTestId('claim-checkbox')).toBeChecked();
  await expect(page.getByTestId('assignee-details')).toBeVisible();
  await expect(mine.getByTestId('claim-checkbox')).toBeVisible();
});

test('ACT-001 claim makes the user the assignee and the row shows it', async ({ page }) => {
  await seed(page, [task('free')]);
  await page.goto('/tasks');
  const free = row(page, 'free');
  await free.getByTestId('cell-assignee').hover();
  await free.getByTestId('claim-checkbox').click();
  await expect(free.getByTestId('assignee-name')).toHaveText('Anna');
  await expect(free.getByTestId('claimed-bar')).toBeVisible();
  const tasks = await (await page.request.get('/simulator-api/user-tasks')).json();
  expect(tasks[0].assignee.id).toBe('anna');
});

test('ACT-003 unclaim removes the user as assignee and the row shows it', async ({ page }) => {
  await seed(page, [task('mine', { assignee: anna })]);
  await page.goto('/tasks');
  const mine = row(page, 'mine');
  await mine.getByTestId('cell-assignee').hover();
  await mine.getByTestId('claim-checkbox').click();
  await expect(mine.getByTestId('assignee-name')).toHaveCount(0);
  await expect(mine.getByTestId('claimed-bar')).toHaveCount(0);
  const tasks = await (await page.request.get('/simulator-api/user-tasks')).json();
  expect(tasks[0].assignee).toBeUndefined();
});

test('TL-017 on mouse-over the candidate users column lists all persons, each with a bin icon that removes the person', async ({ page }) => {
  await seed(page, [task('t1', { candidateUsers: [anna, ben] })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await expect(t1.getByTestId('candidate-person')).toHaveCount(0);
  await t1.getByTestId('cell-candidateUsers').hover();
  await expect(t1.getByTestId('candidate-person')).toHaveCount(2);
  await expect(t1.getByTestId('candidate-person').nth(0)).toContainText('Anna Sales');
  await expect(t1.getByTestId('candidate-person').nth(1)).toContainText('Ben Support');
  await t1.getByTestId('candidate-person').nth(0).getByTestId('candidate-remove').click();
  await expect(t1.getByTestId('candidate-person')).toHaveCount(1);
  await expect(t1.getByTestId('candidate-person')).toContainText('Ben Support');
  const tasks = await (await page.request.get('/simulator-api/user-tasks')).json();
  expect(tasks[0].candidateUsers.map((candidate: { id: string }) => candidate.id)).toEqual(['ben']);
});

test('ACT-004 "Propose to" a person found by search makes the person a candidate user', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-candidateUsers').hover();
  await t1.getByTestId('propose-search').fill('ben');
  await t1.getByTestId('propose-result').filter({ hasText: 'Ben Support' }).click();
  await expect(t1.getByTestId('candidate-person')).toHaveCount(1);
  await expect(t1.getByTestId('candidate-person')).toContainText('Ben Support');
  await expect(t1.getByTestId('candidate-icon')).toHaveAttribute('data-persons', 'one');
});

test('TL-025 a note can be written per row in the task list', async ({ page }) => {
  await seed(page, [task('t1'), task('t2', { note: 'old' })]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await t1.getByTestId('cell-note').hover();
  await t1.getByTestId('note-edit').click();
  await t1.getByTestId('note-input').fill('call back');
  await t1.getByTestId('note-save').click();
  await expect(t1.getByTestId('cell-note')).toContainText('call back');
  const t2 = row(page, 't2');
  await t2.getByTestId('cell-note').hover();
  await t2.getByTestId('note-edit').click();
  await expect(t2.getByTestId('note-input')).toHaveValue('old');
  await t2.getByTestId('note-input').fill('');
  await t2.getByTestId('note-save').click();
  await expect(t2.getByTestId('cell-note')).not.toContainText('old');
  const tasks = await (await page.request.get('/simulator-api/user-tasks')).json();
  expect(tasks.find((found: { id: string }) => found.id === 't1').note).toBe('call back');
});
