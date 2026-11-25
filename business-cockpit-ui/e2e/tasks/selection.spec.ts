import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const anna = { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' };
const rowHeight = 46;

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
const storedTask = async (page: Page, id: string): Promise<SimulatedTask> => (await stored(page)).find((candidate) => candidate.id === id)!;
const sent = async (page: Page): Promise<{ action: string; ids: string[]; query: Record<string, string> }[]> =>
  (await page.request.get('/simulator-api/bulk-requests')).json();
const row = (page: Page, id: string) => page.getByTestId('task-row').filter({ hasText: `Check ${id}` });
const select = async (page: Page, ...ids: string[]) => {
  for (const id of ids) await row(page, id).getByTestId('select-row').check();
};
const tool = (page: Page, name: string) => page.getByTestId('toolbar').getByTestId(`tool-${name}`);
const answer = (page: Page, yes: boolean) => page.getByTestId(yes ? 'bulk-confirm-yes' : 'bulk-confirm-no').click();

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('TL-011 the id column is a checkbox that selects the row, and the id is not shown', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  const t1 = row(page, 't1');
  await expect(t1.getByTestId('cell-id')).not.toContainText('t1');
  await expect(t1.getByTestId('cell-id').getByTestId('select-row')).not.toBeChecked();
  await t1.getByTestId('select-row').check();
  await expect(t1.getByTestId('select-row')).toBeChecked();
  await expect(row(page, 't2').getByTestId('select-row')).not.toBeChecked();
  await expect(page.getByTestId('selected-count')).toHaveText('1');
  await t1.getByTestId('select-row').uncheck();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
});

test('TL-011 the selection holds rows that left the window of loaded rows', async ({ page }) => {
  await page.request.post('/simulator-api/generate-user-tasks', { data: { count: 3000, closedEvery: 1000000 } });
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row').first()).toBeVisible();
  const firstId = (await page.getByTestId('task-title').first().innerText()).replace('Check ', '');
  await page.getByTestId('task-row').first().getByTestId('select-row').check();
  const scroller = page.getByTestId('task-list').locator('.v-table__wrapper');
  await scroller.evaluate((element, top) => { element.scrollTop = top; }, 2000 * rowHeight);
  await page.waitForTimeout(400);
  await expect(page.getByTestId('task-list')).toHaveAttribute('data-pending', '0');
  await expect(page.getByTestId('task-row').first()).not.toContainText(firstId);
  await page.getByTestId('task-row').nth(2).getByTestId('select-row').check();
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await page.waitForTimeout(400);
  await expect(page.getByTestId('task-row').first().getByTestId('select-row')).toBeChecked();
  // a bulk action reaches the row that is out of the window, too
  await tool(page, 'mark-unread').click();
  await expect.poll(async () => (await sent(page)).at(-1)?.ids.length).toBe(2);
  expect((await sent(page)).at(-1)!.ids).toContain(firstId);
});

test('TL-029 the tools stand in the toolbar, are always shown and the ones that act on the selection are disabled without a selection', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const toolbar = page.getByTestId('toolbar');
  for (const name of ['claim', 'propose', 'mark-read', 'mark-unread', 'follow-up', 'note']) {
    await expect(tool(page, name)).toBeVisible();
    await expect(tool(page, name)).toBeDisabled();
  }
  await expect(tool(page, 'unclaim')).toHaveCount(0);
  await expect(toolbar.getByTestId('search-reset')).toBeEnabled();
  await select(page, 't1');
  for (const name of ['claim', 'propose', 'mark-read', 'mark-unread', 'follow-up', 'note']) await expect(tool(page, name)).toBeEnabled();
  // the tools stand before the search
  const tools = (await toolbar.getByTestId('toolbar-tools').boundingBox())!;
  const input = (await toolbar.getByTestId('search-input').boundingBox())!;
  expect(input.x).toBeGreaterThanOrEqual(tools.x + tools.width);
  await row(page, 't1').getByTestId('select-row').uncheck();
  await expect(tool(page, 'claim')).toBeDisabled();
});

test('TL-030 the details of a tool lie over the list and do not move it', async ({ page }) => {
  await seed(page, [task('t1'), task('t2')]);
  await page.goto('/tasks');
  await select(page, 't1');
  const before = (await page.getByTestId('task-list').boundingBox())!;
  const firstRow = (await row(page, 't1').boundingBox())!;
  for (const name of ['propose', 'note', 'follow-up']) {
    await tool(page, name).click();
    const popup = page.getByTestId(`bulk-${name}-popup`);
    await expect(popup).toBeVisible();
    expect(await popup.evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
    expect(await page.getByTestId('task-list').boundingBox()).toEqual(before);
    expect(await row(page, 't1').boundingBox()).toEqual(firstRow);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
  }
  // the selection stays in sight
  await expect(row(page, 't1').getByTestId('select-row')).toBeChecked();
});

test('TL-031 switching to another list drops the selection', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna }), task('t2')]);
  await page.goto('/tasks');
  await select(page, 't1', 't2');
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await page.getByTestId('toggle-my-tasks').click();
  await expect(page).toHaveURL(/my-tasks/);
  await expect(row(page, 't1')).toBeVisible();
  await expect(row(page, 't1').getByTestId('select-row')).not.toBeChecked();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
  await expect(tool(page, 'claim')).toBeDisabled();
});

test('TL-019 TL-025 ACT-007 the bulk actions claim, propose, read, unread, follow-up and note reach all selected tasks', async ({ page }) => {
  await seed(page, [task('t1', { read: true }), task('t2', { read: true }), task('t3')]);
  await page.goto('/tasks');
  await select(page, 't1', 't2');
  await tool(page, 'claim').click();
  await expect(row(page, 't1').getByTestId('assignee-name')).toHaveText('Anna');
  await expect(row(page, 't2').getByTestId('assignee-name')).toHaveText('Anna');
  await expect(row(page, 't3').getByTestId('assignee-name')).toHaveCount(0);
  expect((await sent(page)).filter((request) => request.action === 'claim')).toHaveLength(1);

  await tool(page, 'propose').click();
  await page.getByTestId('bulk-propose-search').fill('ben');
  await page.getByTestId('bulk-propose-result').filter({ hasText: 'Ben Support' }).click();
  await expect.poll(async () => ((await storedTask(page, 't2')).candidateUsers as unknown[] | undefined)?.length).toBe(1);
  expect((await storedTask(page, 't1')).candidateUsers).toHaveLength(1);
  expect((await storedTask(page, 't3')).candidateUsers).toBeUndefined();

  await tool(page, 'mark-unread').click();
  await expect(row(page, 't1')).toHaveClass(/unread/);
  await expect(row(page, 't2')).toHaveClass(/unread/);
  await tool(page, 'mark-read').click();
  await expect(row(page, 't1')).not.toHaveClass(/unread/);
  expect((await sent(page)).filter((request) => request.action === 'mark-as-read').map((request) => request.query.unread === 'true')).toEqual([true, false]);

  await tool(page, 'note').click();
  await page.getByTestId('bulk-note-input').fill('call back');
  await page.getByTestId('bulk-note-save').click();
  await expect(row(page, 't1').getByTestId('cell-note')).toHaveText('call back');
  await expect(row(page, 't2').getByTestId('cell-note')).toHaveText('call back');
  await expect(row(page, 't3').getByTestId('cell-note')).toHaveText('');

  await tool(page, 'follow-up').click();
  await page.getByTestId('bulk-follow-up-input').fill('2099-03-05');
  await page.getByTestId('bulk-follow-up-save').click();
  await expect.poll(async () => (await storedTask(page, 't2')).followUpDate).toBeTruthy();
  expect((await storedTask(page, 't1')).followUpDate).toBeTruthy();
  expect((await storedTask(page, 't3')).followUpDate).toBeUndefined();
  // and the follow-up is deleted for all of them
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await select(page, 't3');
  await row(page, 't1').getByTestId('select-row').check();
  await tool(page, 'follow-up').click();
  await page.getByTestId('bulk-follow-up-delete').click();
  await expect.poll(async () => (await storedTask(page, 't1')).followUpDate).toBeUndefined();
  expect((await storedTask(page, 't2')).followUpDate).toBeUndefined();
});

test('ACT-018 ACT-009 ACT-007 the rule per action for ended and suspended tasks in the selection', async ({ page }) => {
  await seed(page, [
    task('open', { read: true }),
    task('suspended', { suspendedAt: '2026-11-21T08:00:00Z', read: true }),
    task('ended', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED', read: true }),
  ]);
  await page.goto('/tasks');
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  // an ended task alone: claim, propose, follow-up and note would send nothing and are disabled, read and unread stay enabled
  await row(page, 'ended').getByTestId('select-row').check();
  for (const name of ['claim', 'propose', 'follow-up', 'note']) await expect(tool(page, name)).toBeDisabled();
  for (const name of ['mark-read', 'mark-unread']) await expect(tool(page, name)).toBeEnabled();
  await row(page, 'ended').getByTestId('select-row').uncheck();
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect(row(page, 'suspended')).toBeVisible();
  await select(page, 'open', 'suspended');
  // ended tasks only show in the closed list, so the selection is kept across the filter
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  await row(page, 'ended').getByTestId('select-row').check();
  await expect(page.getByTestId('selected-count')).toHaveText('3');

  // no: nothing is sent
  await tool(page, 'claim').click();
  await expect(page.getByTestId('bulk-confirm')).toContainText(/ended or suspended/i);
  await answer(page, false);
  await expect(page.getByTestId('bulk-confirm')).toBeHidden();
  expect(await sent(page)).toEqual([]);

  // yes: the request leaves the ended and the suspended tasks out
  await tool(page, 'claim').click();
  await answer(page, true);
  await expect.poll(async () => (await sent(page)).length).toBe(1);
  expect((await sent(page))[0]!.ids).toEqual(['open']);
  expect((await storedTask(page, 'open')).assignee).toBeTruthy();

  // propose asks as well, worded for the action
  await tool(page, 'propose').click();
  await page.getByTestId('bulk-propose-search').fill('ben');
  await page.getByTestId('bulk-propose-result').filter({ hasText: 'Ben Support' }).click();
  await expect(page.getByTestId('bulk-confirm')).toContainText(/propose/i);
  await answer(page, true);
  await expect.poll(async () => (await sent(page)).at(-1)?.action).toBe('assign');
  expect((await sent(page)).at(-1)!.ids).toEqual(['open']);

  // follow-up: no question, the ended task is left out, the suspended one goes
  await tool(page, 'follow-up').click();
  await page.getByTestId('bulk-follow-up-input').fill('2099-03-05');
  await page.getByTestId('bulk-follow-up-save').click();
  await expect.poll(async () => (await sent(page)).filter((request) => request.action === 'follow-up-date').length).toBe(2);
  await expect(page.getByTestId('bulk-confirm')).toBeHidden();
  expect((await storedTask(page, 'suspended')).followUpDate).toBeTruthy();
  expect((await storedTask(page, 'ended')).followUpDate).toBeUndefined();

  // note: same rule, one request without the ended task
  await tool(page, 'note').click();
  await page.getByTestId('bulk-note-input').fill('hello');
  await page.getByTestId('bulk-note-save').click();
  await expect.poll(async () => (await sent(page)).at(-1)?.action).toBe('note');
  expect((await sent(page)).at(-1)!.ids.sort()).toEqual(['open', 'suspended']);
  await expect(page.getByTestId('bulk-confirm')).toBeHidden();

  // read goes out for all three, without a question
  await tool(page, 'mark-unread').click();
  await expect.poll(async () => (await sent(page)).at(-1)?.action).toBe('mark-as-read');
  expect((await sent(page)).at(-1)!.ids.sort()).toEqual(['ended', 'open', 'suspended']);
  await expect(page.getByTestId('bulk-confirm')).toBeHidden();
  expect((await storedTask(page, 'ended')).read).toBe(false);
});
