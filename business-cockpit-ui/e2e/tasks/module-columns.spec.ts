// COL-001, COL-003 to COL-013: the task list shows the columns the modules bring.
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

test.describe('typed cells', () => {
  test.use({ timezoneId: 'UTC' });
  const one = (page: Page, path: string) => page.getByTestId(`cell-module-${path}`);
  const hover = async (page: Page, path: string) => { await one(page, path).hover(); return page.getByTestId('cell-details'); };

  test('COL-008 an i18n cell shows the language of the user interface, else the default language', async ({ page }) => {
    await fakeModule(page, 'colmod');
    const columns = [column('details.text', 'Text', { type: 'i18n' })];
    await seed(page, [
      task(0, 'colmod', columns, { text: { en: 'Hello', de: 'Hallo' } }),
      task(1, 'colmod', columns, { text: { en: 'Only English' } }),
    ]);
    await page.goto('/tasks');
    await expect(page.getByTestId('task-row')).toHaveCount(2);
    await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.text')).toHaveText('Hello');
    await inGerman(page);
    await expect(page.locator('[data-task-id="t000"]').getByTestId('cell-module-details.text')).toHaveText('Hallo');
    await expect(page.locator('[data-task-id="t001"]').getByTestId('cell-module-details.text')).toHaveText('Only English');
  });

  test('COL-009 a person cell shows displayShort, else email, else id, and on mouse-over display, id and email', async ({ page }) => {
    await fakeModule(page, 'colmod');
    const columns = [column('details.who', 'Who', { type: 'person' })];
    await seed(page, [
      task(0, 'colmod', columns, { who: { id: 'u1', display: 'Una Full', displayShort: 'UF', email: 'una@example.org' } }),
      task(1, 'colmod', columns, { who: { id: 'u2', email: 'two@example.org' } }),
      task(2, 'colmod', columns, { who: { id: 'u3' } }),
    ]);
    await page.goto('/tasks');
    await expect(page.getByTestId('task-row')).toHaveCount(3);
    const cell = (id: string) => page.locator(`[data-task-id="${id}"]`).getByTestId('cell-module-details.who');
    await expect(cell('t000')).toHaveText('UF');
    await expect(cell('t001')).toHaveText('two@example.org');
    await expect(cell('t002')).toHaveText('u3');
    await cell('t000').hover();
    const details = page.getByTestId('cell-details').filter({ hasText: 'Una Full' });
    await expect(details).toContainText('Una Full');
    await expect(details).toContainText('u1');
    await expect(details).toContainText('una@example.org');
  });

  test('COL-010 a date cell shows the localised date', async ({ page }) => {
    await fakeModule(page, 'colmod');
    await seed(page, [task(0, 'colmod', [column('details.day', 'Day', { type: 'date' })], { day: '2026-11-20' })]);
    await page.goto('/tasks');
    await expect(one(page, 'details.day')).toHaveText('11/20/2026');
    await inGerman(page);
    await expect(one(page, 'details.day')).toHaveText('20.11.2026');
  });

  test('COL-011 a date-time cell shows date, space, hour and minute, no T, and the seconds on mouse-over', async ({ page }) => {
    await fakeModule(page, 'colmod');
    await seed(page, [task(0, 'colmod', [column('details.at', 'At', { type: 'date-time' })], { at: '2026-11-20T14:05:42Z' })]);
    await page.goto('/tasks');
    await expect(one(page, 'details.at')).toHaveText('11/20/2026 02:05 PM');
    await expect(one(page, 'details.at')).not.toContainText('T');
    await expect(await hover(page, 'details.at')).toContainText('02:05:42');
  });

  test('COL-012 a time cell shows hour and minute, and the seconds on mouse-over if present', async ({ page }) => {
    await fakeModule(page, 'colmod');
    const columns = [column('details.at', 'At', { type: 'time' })];
    await seed(page, [task(0, 'colmod', columns, { at: '14:05:42' }), task(1, 'colmod', columns, { at: '14:07' })]);
    await page.goto('/tasks');
    await expect(page.getByTestId('task-row')).toHaveCount(2);
    const cell = (id: string) => page.locator(`[data-task-id="${id}"]`).getByTestId('cell-module-details.at');
    await expect(cell('t000')).toHaveText('02:05 PM');
    await expect(cell('t001')).toHaveText('02:07 PM');
    await cell('t000').hover();
    await expect(page.getByTestId('cell-details')).toContainText('02:05:42');
    await page.mouse.move(0, 0);
    await cell('t001').hover();
    await expect(page.getByTestId('cell-details')).toBeHidden();
  });

  test('COL-013 a cell whose value is an object shows a short note, not [object Object]', async ({ page }) => {
    await fakeModule(page, 'colmod');
    await seed(page, [task(0, 'colmod', [column('details.thing', 'Thing')], { thing: { a: 1 } })]);
    await page.goto('/tasks');
    await expect(one(page, 'details.thing')).toBeVisible();
    await expect(one(page, 'details.thing')).not.toContainText('[object Object]');
    await expect(one(page, 'details.thing')).toHaveText('This column needs a type.');
  });
});

test('COL-016 the column function is called for every loaded row, with that row', async ({ page }) => {
  const recording = 'export const userTaskListColumns = (task) => { (window.__asked ??= []).push([task.id, task.businessId]); return task.details?.columns; };';
  await fakeModule(page, 'colmod', recording);
  await seed(page, [0, 1, 2].map((index) => task(index, 'colmod', [column('details.a', 'A')], { a: index })));
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[][] }).__asked);
  expect(asked.slice().sort()).toEqual([['t000', 'B-0'], ['t001', 'B-1'], ['t002', 'B-2']]);
});

test('COL-020 the list part is asked only for modules of loaded rows, and loaded once for the rows of one build', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => { const path = new URL(request.url()).pathname; if (path.startsWith('/wm/')) requested.push(path); });
  await fakeModule(page, 'col-used');
  await fakeModule(page, 'col-unused');
  await seed(page, Array.from({ length: 5 }, (_, index) => task(index, 'col-used', [column('details.a', 'A')], { a: index })));
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(5);
  await expect(page.getByTestId('cell-module-details.a')).toHaveCount(5);
  expect(requested.filter((path) => path === '/wm/col-unused/UserTaskList.js')).toEqual([]);
  expect(requested.filter((path) => path === '/wm/col-used/UserTaskList.js')).toHaveLength(1);
});

test.describe('column width', () => {
  const edge = (page: Page, key: string) => page.getByTestId(`column-resize-${key}`);
  const widthOf = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!.width;
  const drag = async (page: Page, key: string, by: number) => {
    const box = (await edge(page, key).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + by / 2, box.y + box.height / 2, { steps: 3 });
    await page.mouse.move(box.x + box.width / 2 + by, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
  };

  test('COL-022 a column is resized by its right edge, the width is kept per list and path', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await fakeModule(page, 'colmod');
    await seed(page, [task(0, 'colmod', [column('details.r', 'R', { resizeable: true }), column('details.f', 'F')], { r: 'x', f: 'y' })]);
    await page.goto('/tasks');
    await expect(page.getByTestId('task-row')).toHaveCount(1);
    // no edge on the checkbox column, the candidates column and a module column which is not resizeable
    await expect(edge(page, 'id')).toHaveCount(0);
    await expect(edge(page, 'candidateUsers')).toHaveCount(0);
    await expect(edge(page, 'module-details.f')).toHaveCount(0);
    const before = await widthOf(page, 'column-header-businessId');
    await drag(page, 'businessId', 80);
    await expect.poll(() => widthOf(page, 'column-header-businessId')).toBeGreaterThan(before + 60);
    const beforeModule = await widthOf(page, 'column-header-module-details.r');
    await drag(page, 'module-details.r', 60);
    await expect.poll(() => widthOf(page, 'column-header-module-details.r')).toBeGreaterThan(beforeModule + 40);
    const wide = await widthOf(page, 'column-header-businessId');
    // the width survives a new page load, and is only for this list
    await expect.poll(async () => (await page.request.get('/gui/api/v1/app/current-user/settings/bc:tasks:all:width:businessId')).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('task-row')).toHaveCount(1);
    await expect.poll(() => widthOf(page, 'column-header-businessId')).toBeCloseTo(wide, -1);
    await page.goto('/my-tasks');
    await expect(page.getByTestId('column-header-businessId')).toBeVisible();
    expect(await widthOf(page, 'column-header-businessId')).toBeLessThan(wide - 40);
  });
});
