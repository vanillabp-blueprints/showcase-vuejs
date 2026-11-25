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
  ...extra,
});

type Request = { body: { sort?: string; sortAscending?: boolean }; initialTimestamp?: string; serverTimestamp?: string };

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const listRequests = async (page: Page): Promise<Request[]> => (await page.request.get('/simulator-api/list-requests')).json();
const lastRequest = async (page: Page) => (await listRequests(page)).at(-1)!;
const rows = (page: Page) => page.getByTestId('task-row');
const header = (page: Page, column: string) => page.getByTestId(`column-header-${column}`);
const titles = (page: Page) => page.getByTestId('task-title');

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('SRCH-007 a click on a sortable header sorts by it, a second turns the direction, a third goes back to the default', async ({ page }) => {
  await seed(page, [task('b'), task('c'), task('a')]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(3);
  expect((await lastRequest(page)).body.sort).toBeUndefined();
  await header(page, 'businessId').click();
  await expect(titles(page)).toHaveText(['Check a', 'Check b', 'Check c']);
  expect(await lastRequest(page)).toMatchObject({ body: { sort: 'businessId', sortAscending: true } });
  await expect(header(page, 'businessId')).toHaveAttribute('data-sort', 'asc');
  await header(page, 'businessId').click();
  await expect(titles(page)).toHaveText(['Check c', 'Check b', 'Check a']);
  expect(await lastRequest(page)).toMatchObject({ body: { sort: 'businessId', sortAscending: false } });
  await expect(header(page, 'businessId')).toHaveAttribute('data-sort', 'desc');
  await header(page, 'businessId').click();
  await expect(titles(page)).toHaveText(['Check b', 'Check c', 'Check a']);
  expect((await lastRequest(page)).body.sort).toBeUndefined();
  await expect(header(page, 'businessId')).not.toHaveAttribute('data-sort', /.+/);
  // another column starts again with ascending
  await header(page, 'businessId').click();
  await header(page, 'id').click();
  expect(await lastRequest(page)).toMatchObject({ body: { sort: 'id', sortAscending: true } });
  await expect(header(page, 'businessId')).not.toHaveAttribute('data-sort', /.+/);
});

test('SRCH-008 an i18n column sorts by path and language, a person column by sort and id', async ({ page }) => {
  const anna = { id: 'anna', display: 'Anna Berger' };
  const ben = { id: 'ben', display: 'Ben Adler' };
  await seed(page, [
    task('t1', { assignee: anna, title: { en: 'Zeta', de: 'Alpha' } }),
    task('t2', { assignee: ben, title: { en: 'Alpha', de: 'Zeta' } }),
  ]);
  await page.goto('/tasks');
  await header(page, 'title').click();
  expect((await lastRequest(page)).body.sort).toBe('title.en');
  await expect(titles(page)).toHaveText(['Alpha', 'Zeta']);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await page.mouse.click(700, 500);
  await expect.poll(async () => (await lastRequest(page)).body.sort).toBe('title.de');
  await expect(titles(page)).toHaveText(['Alpha', 'Zeta']);
  await expect(page.getByTestId('cell-id').first()).toHaveText('t1');
  await header(page, 'assignee').click();
  expect(await lastRequest(page)).toMatchObject({ body: { sort: 'assignee.sort,assignee.id', sortAscending: true } });
  await expect(page.getByTestId('assignee-name')).toHaveText(['Anna Berger', 'Ben Adler']);
  await header(page, 'caseKind').click();
  expect((await lastRequest(page)).body.sort).toBe('workflowTitle.de');
});

test('SRCH-009 only columns with sortable offer sorting, only columns with filterable offer a filter', async ({ page }) => {
  await seed(page, [task('a')]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(1);
  for (const column of ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'note']) {
    await expect(header(page, column), column).toHaveAttribute('data-sortable', 'true');
  }
  for (const column of ['candidateUsers', 'tools']) {
    await expect(header(page, column), column).not.toHaveAttribute('data-sortable', 'true');
  }
  const before = (await listRequests(page)).length;
  await header(page, 'candidateUsers').click();
  await header(page, 'tools').click();
  await page.waitForTimeout(300);
  expect((await listRequests(page)).length).toBe(before);
  await expect(page.getByTestId('column-filter-id')).toBeVisible();
  for (const column of ['dueDate', 'assignee', 'candidateUsers']) {
    await expect(page.getByTestId(`column-filter-${column}`), column).toHaveCount(0);
  }
});

test('SRCH-026 the full-text search ignores case, a click takes a suggestion, the Enter key takes the input', async ({ page }) => {
  await seed(page, [task('a1', { detailsFulltextSearch: 'Apple Pie' }), task('b1', { detailsFulltextSearch: 'banana' })]);
  await page.goto('/tasks');
  const input = page.getByTestId('search-input');
  await input.fill('aPPLE');
  await input.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await input.fill('');
  await input.press('Enter');
  await expect(rows(page)).toHaveCount(2);
  await input.fill('BAN');
  await page.getByTestId('search-suggestion').first().click();
  await expect(input).toHaveValue('banana');
  await expect(rows(page)).toHaveCount(1);
  await expect(titles(page)).toHaveText('Check b1');
});

test('SRCH-027 a new sort or a new search loads the list again with a new start timestamp', async ({ page }) => {
  await seed(page, [task('a', { read: true, detailsFulltextSearch: 'check' }), task('b', { read: true, detailsFulltextSearch: 'check' })]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(2);
  // the first request of the list after its action, wherever the action leads to more requests
  const requestAfter = async (action: () => Promise<unknown>): Promise<Request> => {
    const before = (await listRequests(page)).length;
    await action();
    await expect.poll(async () => (await listRequests(page)).length).toBeGreaterThan(before);
    return (await listRequests(page))[before]!;
  };
  const first = (await listRequests(page))[0]!;
  expect(first.initialTimestamp).toBeUndefined();
  // a reread for another reason keeps the timestamp
  const reread = await requestAfter(() => rows(page).first().locator('[data-testid^="mark-"]').click());
  expect(reread.initialTimestamp).toBe(first.serverTimestamp);
  await page.waitForTimeout(50);
  const afterSort = await requestAfter(() => header(page, 'id').click());
  expect(afterSort.initialTimestamp).toBeUndefined();
  expect(Date.parse(afterSort.serverTimestamp!)).toBeGreaterThan(Date.parse(first.serverTimestamp!));
  await page.waitForTimeout(50);
  const afterSearch = await requestAfter(async () => {
    await page.getByTestId('search-input').fill('Check');
    await page.getByTestId('search-input').press('Enter');
  });
  expect(afterSearch.initialTimestamp).toBeUndefined();
  expect(Date.parse(afterSearch.serverTimestamp!)).toBeGreaterThan(Date.parse(afterSort.serverTimestamp!));
  // the next reread keeps the new one
  const next = await requestAfter(() => rows(page).first().locator('[data-testid^="mark-"]').click());
  expect(next.initialTimestamp).toBe(afterSearch.serverTimestamp);
});

test('SRCH-033 the full-text search stands in the toolbar after the tools and takes the rest of its width', async ({ page }) => {
  await seed(page, [task('a')]);
  await page.goto('/tasks');
  const toolbar = page.getByTestId('toolbar');
  const field = toolbar.getByTestId('search-input');
  await expect(field).toBeVisible();
  const bar = (await toolbar.boundingBox())!;
  const input = (await field.boundingBox())!;
  const tools = (await toolbar.getByTestId('toolbar-tools').count()) > 0 ? await toolbar.getByTestId('toolbar-tools').boundingBox() : null;
  if (tools) expect(input.x).toBeGreaterThanOrEqual(tools.x + tools.width);
  // the rest of the width: the input reaches nearly to the end of the bar, only the reset button is behind it
  const reset = (await toolbar.getByTestId('search-reset').boundingBox())!;
  expect(input.x + input.width).toBeGreaterThan(reset.x - 16);
  expect(input.width).toBeGreaterThan(bar.width * 0.6);
  await page.setViewportSize({ width: 1700, height: 900 });
  const wider = (await field.boundingBox())!;
  expect(wider.width).toBeGreaterThan(input.width);
});

test('SRCH-034 a sort the server refuses with 400 shows the text of the answer as it is and falls back to the default order', async ({ page }) => {
  const refusal = 'Sorting by two fields which hold lists is not possible.';
  await seed(page, [task('b'), task('c'), task('a')]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(3);
  await page.request.post('/simulator-api/refuse-sort', { data: { text: refusal } });
  await header(page, 'businessId').click();
  await expect(page.getByTestId('list-toast')).toHaveText(refusal);
  await expect(titles(page)).toHaveText(['Check b', 'Check c', 'Check a']);
  await expect(header(page, 'businessId')).not.toHaveAttribute('data-sort', /.+/);
  await expect(page.getByTestId('sort-mark')).toHaveCount(0);
  expect((await lastRequest(page)).body.sort).toBeUndefined();
});
