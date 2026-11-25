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

type Request = { path: string; body: { searchQueries?: { path?: string; query: string; caseInsensitive?: boolean }[] } };
type Suggestion = { query: string; path?: string; at: number };

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const listRequests = async (page: Page): Promise<Request[]> => (await page.request.get('/simulator-api/list-requests')).json();
const lastQueries = async (page: Page) => (await listRequests(page)).at(-1)?.body.searchQueries;
const suggestionRequests = async (page: Page): Promise<Suggestion[]> => (await page.request.get('/simulator-api/suggestion-requests')).json();
const rows = (page: Page) => page.getByTestId('task-row');

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('SRCH-001 the full-text search sends the input and an x button clears it', async ({ page }) => {
  await seed(page, [task('a1', { detailsFulltextSearch: 'apple pie' }), task('b1', { detailsFulltextSearch: 'banana split' })]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('search-clear')).toBeHidden();
  await page.getByTestId('search-input').fill('Apple');
  await page.getByTestId('search-input').press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check a1');
  expect((await lastQueries(page))?.map(({ path, query }) => ({ path, query }))).toEqual([{ query: 'Apple' }]);
  await page.getByTestId('search-clear').click();
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await expect(rows(page)).toHaveCount(2);
  expect((await lastQueries(page)) ?? []).toEqual([]);
});

test('SRCH-002 suggestions are asked from three characters on, 300 milliseconds after the last key', async ({ page }) => {
  await seed(page, [task('a1', { detailsFulltextSearch: 'apple applesauce' })]);
  await page.goto('/tasks');
  const input = page.getByTestId('search-input');
  await input.pressSequentially('ap', { delay: 50 });
  await page.waitForTimeout(600);
  expect(await suggestionRequests(page)).toHaveLength(0);
  await input.pressSequentially('p');
  const lastKey = Date.now();
  await expect(page.getByTestId('search-suggestion').first()).toBeVisible();
  const asked = await suggestionRequests(page);
  expect(asked).toHaveLength(1);
  expect(asked[0]!.query).toBe('app');
  expect(asked[0]!.at - lastKey).toBeGreaterThanOrEqual(250);
  // quick keys ask once, for the last text
  await input.pressSequentially('le', { delay: 60 });
  await page.waitForTimeout(700);
  const again = await suggestionRequests(page);
  expect(again).toHaveLength(2);
  expect(again[1]!.query).toBe('apple');
});

test('SRCH-003 at most 20 suggestions show, in the order the server returns them', async ({ page }) => {
  const many = Array.from({ length: 25 }, (_, index) => task(`t${index}`, { detailsFulltextSearch: `word${String(index).padStart(2, '0')}` }));
  await seed(page, [...many, task('top', { detailsFulltextSearch: 'wordzz wordzz wordzz' })]);
  await page.goto('/tasks');
  await page.getByTestId('search-input').fill('wor');
  const suggestions = page.getByTestId('search-suggestion');
  await expect(suggestions).toHaveCount(20);
  // the most frequent first, then alphabetical, as the simulator answers like the server
  await expect(suggestions.first()).toHaveText('wordzz');
  await expect(suggestions.nth(1)).toHaveText('word00');
  await expect(suggestions.nth(19)).toHaveText('word18');
});

test('SRCH-004 the input goes to the server as typed, a dot or a parenthesis finds only that character', async ({ page }) => {
  await seed(page, [
    task('dot', { detailsFulltextSearch: 'a.b' }),
    task('x', { detailsFulltextSearch: 'axb' }),
    task('par', { detailsFulltextSearch: 'call(me)' }),
    task('plain', { detailsFulltextSearch: 'plain text' }),
  ]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(4);
  const input = page.getByTestId('search-input');
  await input.fill('.');
  await input.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check dot');
  expect((await lastQueries(page))?.[0]?.query).toBe('.');
  await input.fill('(');
  await input.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check par');
  expect((await lastQueries(page))?.[0]?.query).toBe('(');
});

test('SRCH-005 a filter is set and removed per column and only one per path is sent', async ({ page }) => {
  await seed(page, [task('a1'), task('a2'), task('b1')]);
  await page.goto('/tasks');
  await expect(rows(page)).toHaveCount(3);
  const title = page.getByTestId('column-filter-title');
  await title.fill('Check a');
  await title.press('Enter');
  await expect(rows(page)).toHaveCount(2);
  expect(await lastQueries(page)).toMatchObject([{ path: 'title', query: 'Check a' }]);
  await title.fill('Check a2');
  await title.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  expect(await lastQueries(page)).toMatchObject([{ path: 'title', query: 'Check a2' }]);
  const business = page.getByTestId('column-filter-businessId');
  await business.fill('B-a');
  await business.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  const both = (await lastQueries(page))!;
  expect(both.map(({ path }) => path).sort()).toEqual(['businessId', 'title']);
  await page.getByTestId('column-filter-clear-title').click();
  await expect(title).toHaveValue('');
  await expect(rows(page)).toHaveCount(2);
  expect(await lastQueries(page)).toMatchObject([{ path: 'businessId', query: 'B-a' }]);
});

test('SRCH-006 a button resets all searches and filters', async ({ page }) => {
  await seed(page, [task('a1', { detailsFulltextSearch: 'apple' }), task('b1', { detailsFulltextSearch: 'banana' })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('search-reset')).toBeVisible();
  await page.getByTestId('search-input').fill('apple');
  await page.getByTestId('search-input').press('Enter');
  const title = page.getByTestId('column-filter-title');
  await title.fill('Check a');
  await title.press('Enter');
  await page.getByTestId('column-filter-businessId').fill('B-a');
  await page.getByTestId('column-filter-businessId').press('Enter');
  await expect(rows(page)).toHaveCount(1);
  expect(await lastQueries(page)).toHaveLength(3);
  await page.getByTestId('search-reset').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await expect(title).toHaveValue('');
  await expect(page.getByTestId('column-filter-businessId')).toHaveValue('');
  expect((await lastQueries(page)) ?? []).toEqual([]);
});
