// COL-001, COL-003, COL-004, COL-005, COL-006, COL-007: the task list shows the columns the modules bring.
import { expect, test, type Page } from '@playwright/test';

// A fake module: its list part gives each row the columns the row carries in `details.columns`.
const manifest = JSON.stringify({ manifestVersion: 1, entries: { UserTaskList: 'UserTaskList.js' }, buildVersion: '1', buildTimestamp: '2026-11-25T00:00:00Z' });
const columnsOfRow = 'export const userTaskListColumns = (task) => task.details?.columns;';
const fakeModule = async (page: Page, id: string, source = columnsOfRow) => {
  await page.route(`**/wm/${id}/bc-manifest.json`, (route) => route.fulfill({ contentType: 'application/json', body: manifest, headers: { 'cache-control': 'no-cache' } }));
  await page.route(`**/wm/${id}/UserTaskList.js`, (route) => (source === '' ? route.fulfill({ status: 500, body: 'broken' }) : route.fulfill({ contentType: 'text/javascript', body: source })));
  await page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });
};
const column = (path: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ path, title: { en: title, de: `${title} DE` }, type: 'value', priority: 10, width: '', show: true, sortable: false, filterable: false, resizeable: false, ...extra });
const task = (index: number, moduleId: string, columns: object[], details: Record<string, unknown> = {}) => ({
  id: `t${String(index).padStart(3, '0')}`, bpmnProcessId: 'p', workflowModuleId: moduleId, uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json',
  createdAt: `2026-11-20T08:${String(59 - (index % 60)).padStart(2, '0')}:00Z`, updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${index}`, title: { en: `Check ${index}` }, details: { ...details, columns },
});
const seed = (page: Page, tasks: object[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const headers = async (page: Page): Promise<string[]> =>
  (await page.locator('[data-testid^="column-header-module-"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-path')!)));
const scroller = (page: Page) => page.getByTestId('task-list').locator('.v-table__wrapper');
const scrollToRow = async (page: Page, row: number) => {
  await scroller(page).evaluate((element, top) => { element.scrollTop = top; }, row * 46);
  await page.waitForTimeout(250);
  await expect(page.getByTestId('task-list')).toHaveAttribute('data-pending', '0');
};

const inGerman = async (page: Page) => {
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await page.keyboard.press('Escape');
};

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('COL-001 the first rows give the starting columns, then the columns follow the loaded window', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await fakeModule(page, 'colmod');
  const tasks = Array.from({ length: 120 }, (_, index) =>
    task(index, 'colmod', index < 40 ? [column('details.early', 'Early')] : index >= 60 ? [column('details.late', 'Late')] : []));
  await seed(page, tasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row').first()).toBeVisible();
  // no flicker: when the first row shows, the header has the column already
  expect(await headers(page)).toEqual(['details.early']);
  await scrollToRow(page, 70);
  await expect(page.locator('[data-path="details.late"]')).toHaveCount(1);
  await expect(page.locator('[data-path="details.early"]')).toHaveCount(0);
  await scrollToRow(page, 0);
  await expect(page.locator('[data-path="details.early"]')).toHaveCount(1);
  await expect(page.locator('[data-path="details.late"]')).toHaveCount(0);
});

test('COL-003 columns with the same path appear once, with the title of the first row in the window', async ({ page }) => {
  await fakeModule(page, 'col-a');
  await fakeModule(page, 'col-b');
  await seed(page, [
    task(0, 'col-a', [column('details.shared', 'From A')], { shared: 'a' }),
    task(1, 'col-b', [column('details.shared', 'From B'), column('details.own', 'Own B', { priority: 5 })], { shared: 'b', own: 'x' }),
  ]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const shared = page.locator('[data-path="details.shared"]');
  await expect(shared).toHaveCount(1);
  // the first row of the window is t000, whichever module answered first
  await expect(shared).toContainText('From A');
  await expect(page.locator('[data-task-id="t001"]').getByTestId('cell-module-details.shared')).toHaveText('b');
  await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.own')).toHaveText('');
});

test('COL-004 module columns stand after the fixed ones, the smallest priority first, show false is not drawn', async ({ page }) => {
  await fakeModule(page, 'colmod');
  await seed(page, [task(0, 'colmod', [
    column('details.c', 'C', { priority: 30 }), column('details.a', 'A', { priority: 1 }),
    column('details.hidden', 'Hidden', { priority: 2, show: false }), column('details.b', 'B', { priority: 20 }),
  ], { a: 1, b: 2, c: 3, hidden: 4 })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  expect(await headers(page)).toEqual(['details.a', 'details.b', 'details.c']);
  const order = await page.locator('thead tr').first().locator('th').evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')));
  expect(order.indexOf('column-header-endedAt') === -1 ? order.indexOf('column-header-note') : order.indexOf('column-header-endedAt')).toBeLessThan(order.indexOf('column-header-module-details.a'));
  expect(order.indexOf('column-header-note')).toBeLessThan(order.indexOf('column-header-module-details.a'));
  expect(order.indexOf('column-header-module-details.c')).toBeLessThan(order.indexOf('column-header-tools'));
  await expect(page.getByTestId('cell-module-details.hidden')).toHaveCount(0);
});

test('COL-005 a module whose list part fails does not keep the list empty', async ({ page }) => {
  await fakeModule(page, 'colmod');
  await fakeModule(page, 'colbad', '');
  await seed(page, [
    task(0, 'colmod', [column('details.a', 'A')], { a: 'fine' }),
    task(1, 'colbad', []),
  ]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const bad = page.locator('[data-task-id="t001"]');
  await expect(bad.getByTestId('task-title')).toHaveText('Check 1');
  await expect(bad.getByTestId('cell-businessId')).toHaveText('B-1');
  await expect(bad.getByTestId('cell-module-details.a').getByTestId('columns-not-loaded')).toBeVisible();
  await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.a')).toHaveText('fine');
});

test('COL-005 a list of rows of failing modules shows the note in the title cell', async ({ page }) => {
  await fakeModule(page, 'colbad', '');
  await seed(page, [task(0, 'colbad', [])]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('cell-title').getByTestId('columns-not-loaded')).toBeVisible();
});

test('COL-006 a value cell is localised, text left, other values right, decimals at the decimal mark', async ({ page }) => {
  await fakeModule(page, 'colmod');
  const columns = [column('details.text', 'Text'), column('details.amount', 'Amount')];
  await seed(page, [
    task(0, 'colmod', columns, { text: 'abc', amount: 12.5 }),
    task(1, 'colmod', columns, { text: 'longer text', amount: 1234567.25 }),
    task(2, 'colmod', columns, { text: 'x', amount: 7 }),
  ]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const cell = (id: string, path: string) => page.locator(`[data-task-id="${id}"]`).getByTestId(`cell-module-${path}`);
  await expect(cell('t001', 'details.amount')).toHaveText('1,234,567.25');
  await expect(cell('t002', 'details.amount')).toHaveText('7');
  expect(await cell('t000', 'details.text').evaluate((one) => getComputedStyle(one).textAlign)).toMatch(/left|start/);
  expect(await cell('t000', 'details.amount').evaluate((one) => getComputedStyle(one).textAlign)).toBe('right');
  const markLeft = (id: string) => cell(id, 'details.amount').locator('.mark').evaluate((one) => one.getBoundingClientRect().left);
  expect(await markLeft('t000')).toBeCloseTo(await markLeft('t001'), 0);
});

test('COL-006 a number follows the language of the user interface', async ({ page }) => {
  await fakeModule(page, 'colmod');
  await seed(page, [task(0, 'colmod', [column('details.amount', 'Amount')], { amount: 1234.5 })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('cell-module-details.amount')).toHaveText('1,234.5');
  await inGerman(page);
  await expect(page.getByTestId('cell-module-details.amount')).toHaveText('1.234,5');
});

test('COL-007 a boolean value cell shows Yes or No in the language of the user', async ({ page }) => {
  await fakeModule(page, 'colmod');
  const columns = [column('details.ok', 'Ok')];
  await seed(page, [task(0, 'colmod', columns, { ok: true }), task(1, 'colmod', columns, { ok: false })]);
  await page.goto('/tasks');
  await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.ok')).toHaveText('Yes');
  await expect(page.locator('[data-task-id="t001"]').getByTestId('cell-module-details.ok')).toHaveText('No');
  await inGerman(page);
  await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.ok')).toHaveText('Ja');
  await expect(page.locator('[data-task-id="t001"]').getByTestId('cell-module-details.ok')).toHaveText('Nein');
});
