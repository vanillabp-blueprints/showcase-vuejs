import { expect, test, type Page } from '@playwright/test';
import { formatDate } from '../../packages/ui/src/i18n/format';

type SimulatedTask = Record<string, unknown>;
type ListRequest = { path: string; body: Record<string, unknown> };

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
  workflowTitle: { en: 'Order', de: 'Bestellung' },
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  dueDate: '2026-12-01T10:30:00Z',
  ...extra,
});

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const listRequests = async (page: Page): Promise<ListRequest[]> => (await page.request.get('/simulator-api/list-requests')).json();

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

const threeTasks = [
  task('t1', { assignee: anna }),
  task('t2', { assignee: ben }),
  task('t3', { candidateUsers: [anna, ben] }),
];

test('NAV-001 /tasks shows all user tasks the user may see, in every language of the paths', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  expect((await listRequests(page)).map((request) => request.path)).toContain('/gui/api/v1/usertask');
  await page.goto('/aufgaben');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
});

test('NAV-002 /my-tasks shows the user tasks where the user is the assignee', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/my-tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check t1');
  expect((await listRequests(page)).map((request) => request.path)).toContain('/gui/api/v1/current-user/usertask');
  await page.goto('/meine-aufgaben');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
});

test('TL-008 the fixed columns are the ones from the interview, in its order', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  // TL-009: the follow-up column shows for All open only
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const headers = page.locator('[data-testid^="column-header-"]');
  expect(await headers.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-testid')))).toEqual([
    'column-header-id', 'column-header-businessId', 'column-header-caseKind', 'column-header-title', 'column-header-dueDate',
    'column-header-assignee', 'column-header-candidateUsers', 'column-header-note', 'column-header-followUpDate', 'column-header-endedAt',
  ]);
  await expect(headers).toHaveText(['Id', 'Business ID', 'Case kind', 'Title', 'Due', 'Assignee', '', 'Notes', 'Follow-up', 'Ended']);
  await expect(page.getByTestId('column-header-candidateUsers')).toHaveAttribute('aria-label', 'Candidate users');
  const first = page.getByTestId('task-row').first();
  await expect(first.getByTestId('cell-businessId')).toHaveText('B-t1');
  await expect(first.getByTestId('cell-caseKind')).toHaveText('Order');
  // TL-016 turned the candidate users into icons: the cell of the third task holds the icon of several people
  await expect(page.getByTestId('task-row').nth(2).getByTestId('candidate-icon')).toHaveAttribute('data-persons', 'several');
});

test('TL-012 the title is a real link that opens the task page, and open in new tab works on it', async ({ page, context }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  const link = page.getByTestId('task-title').first();
  expect(await link.evaluate((element) => element.tagName)).toBe('A');
  await expect(link).toHaveAttribute('href', '/tasks/t1');
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })]);
  await opened.waitForLoadState();
  expect(new URL(opened.url()).pathname).toBe('/tasks/t1');
  await expect(page).toHaveURL(/\/tasks$/);
  await link.click();
  await expect(page).toHaveURL(/\/tasks\/t1$/);
});

test('TL-013 the assignee cell shows the short form, and the mouse-over the long form, the user id and the email address', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  const cell = page.getByTestId('task-row').first().getByTestId('cell-assignee');
  await expect(cell).toHaveText('Anna');
  await cell.hover();
  const details = page.getByTestId('assignee-details').filter({ hasText: 'Anna Sales' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('Anna Sales');
  await expect(details).toContainText('anna');
  await expect(details).toContainText('anna@acme.example');
});

test('TL-015 a task the current user has claimed shows a bar before the name, and the names stay aligned', async ({ page }) => {
  // the user of the simulator is anna: t1 is hers, t2 is ben's, t3 has no assignee
  await seed(page, threeTasks);
  await page.goto('/tasks');
  const rows = page.getByTestId('task-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByTestId('claimed-bar')).toBeVisible();
  await expect(rows.nth(1).getByTestId('claimed-bar')).toHaveCount(0);
  await expect(rows.nth(2).getByTestId('claimed-bar')).toHaveCount(0);
  const left = (row: number) => rows.nth(row).getByTestId('assignee-name').evaluate((element) => element.getBoundingClientRect().left);
  const mine = await left(0);
  expect(await left(1)).toBeCloseTo(mine, 0);
  const bar = await rows.nth(0).getByTestId('claimed-bar').boundingBox();
  const name = await rows.nth(0).getByTestId('assignee-name').boundingBox();
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(name!.x + 0.5);
});

test('TL-016 the candidate users column is icon-wide and shows a one-person or a several-people icon', async ({ page }) => {
  await seed(page, [task('t1', { candidateUsers: [anna] }), task('t2', { candidateUsers: [anna, ben] }), task('t3')]);
  await page.goto('/tasks');
  const rows = page.getByTestId('task-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByTestId('candidate-icon')).toHaveAttribute('data-persons', 'one');
  await expect(rows.nth(1).getByTestId('candidate-icon')).toHaveAttribute('data-persons', 'several');
  await expect(rows.nth(2).getByTestId('candidate-icon')).toHaveCount(0);
  await expect(page.getByTestId('column-header-candidateUsers').getByTestId('candidate-header-icon')).toBeVisible();
  const width = await page.getByTestId('column-header-candidateUsers').evaluate((cell) => cell.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(56);
});

test('TL-018 a date column shows the date, or the time if the date is today, and the other one on mouse-over', async ({ page }) => {
  const now = new Date();
  const dateOf = (value: Date) => new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const timeOf = (value: Date) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(value);
  const earlier = new Date('2026-12-01T10:30:00Z');
  await seed(page, [task('t1', { dueDate: earlier.toISOString(), followUpDate: now.toISOString() })]);
  await page.goto('/tasks');
  const due = page.getByTestId('cell-dueDate');
  await expect(due).toHaveText(dateOf(earlier));
  await due.hover();
  await expect(page.getByTestId('date-details').filter({ hasText: timeOf(earlier) })).toBeVisible();
  await expect(page.getByTestId('date-details').filter({ hasText: timeOf(earlier) })).not.toContainText(dateOf(earlier));
  await page.mouse.move(0, 0);
  // the follow-up column shows for All open only (TL-009)
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  const followUp = page.getByTestId('cell-followUpDate');
  await expect(followUp).toHaveText(timeOf(now));
  await followUp.hover();
  await expect(page.getByTestId('date-details').filter({ hasText: dateOf(now) })).toBeVisible();
});

test('TL-024 every count comes from the count endpoint, and no page of a list is asked only for its total', async ({ page }) => {
  await seed(page, threeTasks);
  await page.request.post('/simulator-api/counts', { data: { myTasks: 1, allTasks: 57 } });
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  // 57 is not the size of any page the list asked for, so the number is the answer of a count request
  await expect(page.getByTestId('toggle-all-tasks')).toContainText('(57)');
  const counted = (await page.request.get('/simulator-api/count-requests').then((answer) => answer.json())) as { path: string }[];
  expect(counted.map((request) => request.path)).toContain('/gui/api/v1/usertask/count');
  const lists = await listRequests(page);
  expect(lists.length).toBeGreaterThan(0);
  for (const request of lists) expect(Number(request.body.pageSize)).toBeGreaterThan(1);
});

test('TL-032 the background of the list is white, partly transparent and blurred', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const style = await page.getByTestId('task-list').evaluate((element) => {
    const computed = getComputedStyle(element);
    return { background: computed.backgroundColor, filter: computed.backdropFilter };
  });
  const [red, green, blue, alpha = 1] = style.background.match(/[\d.]+/g)!.map(Number);
  expect([red, green, blue]).toEqual([255, 255, 255]);
  expect(alpha).toBeGreaterThan(0.5);
  expect(alpha).toBeLessThan(1);
  expect(style.filter).toContain('blur');
});

test('COL-015 the fixed columns are always shown, also when the list has no rows', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page.getByTestId('no-tasks')).toBeVisible();
  // the follow-up column belongs to All open only (TL-009), so the default primary filter has nine
  await expect(page.locator('[data-testid^="column-header-"]')).toHaveCount(9);
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect(page.locator('[data-testid^="column-header-"]')).toHaveCount(10);
  await expect(page.getByTestId('column-header-title')).toBeVisible();
});

test('COL-017 a list with more columns than the window has room for scrolls horizontally, and the header scrolls with it', async ({ page }) => {
  await seed(page, threeTasks);
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const scroller = page.locator('.v-table__wrapper');
  const [scrollWidth, clientWidth] = await scroller.evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  const left = (testid: string) => page.getByTestId(testid).first().evaluate((element) => element.getBoundingClientRect().left);
  const headerBefore = await left('column-header-endedAt');
  const cellBefore = await left('cell-endedAt');
  await scroller.evaluate((element) => { element.scrollLeft = 200; });
  expect(await left('column-header-endedAt')).toBeLessThan(headerBefore);
  expect(headerBefore - (await left('column-header-endedAt'))).toBeCloseTo(cellBefore - (await left('cell-endedAt')), 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('COL-018 the room for both scroll bars is reserved always, also while the list is empty', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page.getByTestId('no-tasks')).toBeVisible();
  const overflow = await page.locator('.v-table__wrapper').evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.overflowX, style.overflowY];
  });
  expect(overflow).toEqual(['scroll', 'scroll']);
});

test('COL-019 no date with a time shows the T of ISO 8601, it is the localised date, a space and the localised time', async ({ page }) => {
  const day = new Date('2026-11-25T14:05:00Z');
  expect(formatDate(day, 'en')).toBe(`${new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(day)} ${new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(day)}`);
  expect(formatDate(day, 'de')).not.toMatch(/T/);
  expect(formatDate(day, 'en')).not.toMatch(/\dT\d/);
  await seed(page, [task('t1', { dueDate: '2026-12-01T10:30:00Z', followUpDate: new Date().toISOString() })]);
  await page.goto('/tasks');
  await page.getByTestId('cell-dueDate').hover();
  await expect(page.getByTestId('date-details').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
});

test('COL-021 each fixed column has the path of its field in the GUI API, and the list can be sorted and filtered by it without a 400', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  await page.getByTestId('primary-filter-OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const paths = await page.locator('[data-testid^="column-header-"]').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-path')));
  expect(paths).toEqual(['id', 'businessId', 'workflowTitle', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt']);
  for (const path of paths) {
    const sorted = await page.request.post('/gui/api/v1/usertask', { data: { pageSize: 5, sort: path } });
    expect(sorted.status(), `sort by ${path}`).toBe(200);
    const filtered = await page.request.post('/gui/api/v1/usertask', { data: { pageSize: 5, filters: [{ key: path, value: 'x' }] } });
    expect(filtered.status(), `filter by ${path}`).toBe(200);
  }
  expect((await page.request.post('/gui/api/v1/usertask', { data: { pageSize: 5, sort: 'taskDefinition' } })).status()).toBe(200);
  expect((await page.request.post('/gui/api/v1/usertask', { data: { pageSize: 5, sort: 'no-such-field' } })).status()).toBe(400);
});

test('TL-033 a list whose request fails shows no rows, keeps its header, and shows a toast in the language of the user without a status code, the next load tries again', async ({ page }) => {
  await seed(page, threeTasks);
  await page.request.post('/simulator-api/fail-lists', { data: { fail: true } });
  await page.goto('/tasks');
  const toast = page.getByTestId('list-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('The list could not be loaded');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(toast).toContainText('Die Liste konnte nicht geladen werden');
  await expect(toast).not.toContainText(/50\d|4\d\d/);
  await expect(page.getByTestId('task-row')).toHaveCount(0);
  // nine, because the follow-up column belongs to All open only (TL-009)
  await expect(page.locator('[data-testid^="column-header-"]')).toHaveCount(9);
  await expect(page.getByTestId('header')).toBeVisible();
  await page.request.post('/simulator-api/fail-lists', { data: { fail: false } });
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
});
