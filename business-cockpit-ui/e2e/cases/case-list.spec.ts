// NAV-003, WL-001 to WL-010, WL-012, WL-013: the case list.
import { expect, test, type Page } from '@playwright/test';

type SimulatedCase = Record<string, unknown>;

const aCase = (id: string, extra: SimulatedCase = {}): SimulatedCase => ({
  id,
  workflowModuleId: 'orders',
  bpmnProcessId: 'order',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Order ${id}`, de: `Bestellung ${id}` },
  ...extra,
});

const cases = [
  aCase('c1', { note: 'call back' }),
  aCase('c2'),
  aCase('c3', { suspendedAt: '2026-11-21T08:00:00Z' }),
  aCase('d1', { endedAt: '2026-11-22T08:00:00Z', endReason: 'COMPLETED' }),
];

const seed = (page: Page, workflows: SimulatedCase[]) => page.request.post('/simulator-api/workflows', { data: { workflows } });
const listRequests = async (page: Page): Promise<{ path: string; body: Record<string, unknown> }[]> => (await page.request.get('/simulator-api/list-requests')).json();
const headers = (page: Page) => page.locator('[data-testid="case-list"] thead tr:first-child th');
const headerKeys = async (page: Page): Promise<string[]> =>
  (await headers(page).evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')!.replace('column-header-', ''))));
const inGerman = async (page: Page) => {
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await page.keyboard.press('Escape');
};

const manifest = JSON.stringify({ manifestVersion: 1, entries: { WorkflowList: 'WorkflowList.js', UserTaskList: 'UserTaskList.js' }, buildVersion: '1', buildTimestamp: '2026-11-25T00:00:00Z' });
const fakeModule = async (page: Page, id: string) => {
  await page.route(`**/wm/${id}/bc-manifest.json`, (route) => route.fulfill({ contentType: 'application/json', body: manifest, headers: { 'cache-control': 'no-cache' } }));
  await page.route(`**/wm/${id}/WorkflowList.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const workflowListColumns = (c) => c.details?.caseColumns;' }));
  await page.route(`**/wm/${id}/UserTaskList.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const userTaskListColumns = (t) => t.details?.taskColumns;' }));
  await page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });
};
const column = (path: string, title: string) =>
  ({ path, title: { en: title }, type: 'value', priority: 10, width: '', show: true, sortable: false, filterable: false, resizeable: false });

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('NAV-003 there is exactly one case list, the toggle and the menu lead to it, in every language', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-list')).toBeVisible();
  await expect(page.getByTestId('toggle-cases')).toHaveAttribute('href', '/workflows');
  await page.getByTestId('menu-button').click();
  await expect(page.locator('[data-menu-part="cases"]')).toHaveCount(1);
  await expect(page.getByTestId('menu-cases')).toHaveAttribute('href', '/workflows');
  await page.keyboard.press('Escape');
  // the other paths of the interview open the same list and no other path does
  await page.goto('/vorgaenge');
  await expect(page.getByTestId('case-list')).toHaveCount(1);
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await page.goto('/cases');
  await expect(page.getByTestId('case-list')).toHaveCount(0);
  await page.goto('/tasks');
  await expect(page.getByTestId('case-list')).toHaveCount(0);
});

test('WL-001 the case list offers In progress and Done, In progress first and chosen, labels follow the language', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  // the page starts after it read the language of the user, so wait for it
  await expect(page.getByTestId('status-line')).toBeVisible();
  const buttons = page.getByTestId('status-line').locator('[data-testid^="primary-filter-"]');
  expect(await buttons.evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')))).toEqual(['primary-filter-InProgress', 'primary-filter-Done']);
  await expect(buttons).toHaveText(['In progress (3)', 'Done (1)']);
  await expect(page.getByTestId('primary-filter-InProgress')).toHaveAttribute('aria-pressed', 'true');
  expect((await listRequests(page)).at(-1)?.path).toBe('/gui/api/v1/workflow');
  expect((await listRequests(page)).at(-1)?.body.mode).toBe('InProgress');
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  expect((await listRequests(page)).at(-1)?.body.mode).toBe('Done');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(buttons).toHaveText(['In Bearbeitung (3)', 'Abgeschlossen (1)']);
  await page.getByTestId('language-fr').click();
  await expect(buttons).toHaveText(['En cours (3)', 'Terminés (1)']);
  await page.getByTestId('language-es').click();
  await expect(buttons).toHaveText(['En curso (3)', 'Finalizados (1)']);
});

test('WL-002 the fixed columns are id, business id, title, notes, created, ended, in this order, the cells show the fields', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  // the ended column shows only where an ended case can be (WL-013 states it)
  expect(await headerKeys(page)).toEqual(['id', 'businessId', 'title', 'note', 'createdAt', 'tools']);
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  expect(await headerKeys(page)).toEqual(['id', 'businessId', 'title', 'note', 'createdAt', 'endedAt', 'tools']);
  const paths = await page.locator('[data-testid="case-list"] thead tr:first-child th[data-path]').evaluateAll((all) => all.map((one) => one.getAttribute('data-path')));
  expect(paths).toEqual(['id', 'businessId', 'title', 'note', 'createdAt', 'endedAt']);
  await expect(page.getByTestId('column-header-businessId')).toHaveText('Business ID');
  await page.getByTestId('primary-filter-InProgress').click();
  const row = page.locator('[data-case-id="c1"]');
  await expect(row.getByTestId('cell-businessId')).toHaveText('B-c1');
  await expect(row.getByTestId('cell-title')).toContainText('Order c1');
  await expect(row.getByTestId('cell-note')).toContainText('call back');
  await expect(row.getByTestId('cell-createdAt')).not.toHaveText('');
  await inGerman(page);
  await expect(page.getByTestId('column-header-businessId')).toHaveText('Geschäfts-ID');
  await expect(row.getByTestId('cell-title')).toContainText('Bestellung c1');
});

test('WL-003 modules add case columns after the fixed ones, from their case entry, not from their task entry', async ({ page }) => {
  await fakeModule(page, 'orders');
  await seed(page, [aCase('c1', {
    uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json',
    details: { amount: 12.5, caseColumns: [column('details.amount', 'Amount')], taskColumns: [column('details.other', 'Other')] },
  })]);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  const module = page.locator('[data-testid^="column-header-module-"]');
  await expect(module).toHaveCount(1);
  await expect(module).toHaveAttribute('data-path', 'details.amount');
  await expect(module).toHaveText('Amount');
  const keys = await headerKeys(page);
  expect(keys.slice(-2)).toEqual(['module-details.amount', 'tools']);
  await expect(page.getByTestId('cell-module-details.amount')).toHaveText('12.5');
});

test('WL-004 the case list has no read marker, no read function and no bold unread rows', async ({ page }) => {
  await seed(page, [aCase('c1', { read: false }), aCase('c2', { read: true })]);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(2);
  await expect(page.getByTestId('mark-read')).toHaveCount(0);
  await expect(page.getByTestId('mark-unread')).toHaveCount(0);
  await expect(page.locator('[data-testid="case-list"] .unread')).toHaveCount(0);
  await expect(page.getByTestId('column-header-read')).toHaveCount(0);
  const weights = await page.getByTestId('case-row').evaluateAll((all) => all.map((row) => getComputedStyle(row.querySelector('td:nth-child(2)')!).fontWeight));
  expect(new Set(weights).size).toBe(1);
  expect(weights[0]).not.toBe('700');
});

test('WL-005 accessibleToUsers and accessibleToGroups are not shown as columns', async ({ page }) => {
  await seed(page, [aCase('c1', { accessibleToUsers: [{ id: 'anna', display: 'Anna Sales' }], accessibleToGroups: [{ id: 'sales' }] })]);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  await expect(page.locator('[data-testid="case-list"]')).not.toContainText(/accessibleTo|Anna Sales|sales/);
  expect((await headerKeys(page)).filter((key) => /accessible/i.test(key))).toEqual([]);
  await expect(page.locator('[data-path^="accessibleTo"]')).toHaveCount(0);
});

const caseRow = (page: Page, id: string) => page.locator(`[data-case-id="${id}"]`);
const bulkRequests = async (page: Page): Promise<{ action: string; ids: string[]; body: Record<string, unknown> }[]> => (await page.request.get('/simulator-api/bulk-requests')).json();

test('WL-006 the title opens the case page, and open in new tab works on it', async ({ page, context }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  const title = caseRow(page, 'c1').getByTestId('case-title');
  await expect(title).toHaveAttribute('href', '/workflows/c1');
  // open in new tab: the modified click leaves the list where it is and the link works on its own
  const [other] = await Promise.all([context.waitForEvent('page'), title.click({ modifiers: ['ControlOrMeta'] })]);
  await other.waitForLoadState();
  expect(new URL(other.url()).pathname).toBe('/workflows/c1');
  await expect(page).toHaveURL(/\/workflows$/);
  // a plain click goes to the case page
  await title.click();
  await expect(page).toHaveURL(/\/workflows\/c1$/);
  await expect(page.getByTestId('case-list')).toHaveCount(0);
  // in another language the case page has the path of that language
  await page.goto('/workflows');
  await inGerman(page);
  await expect(caseRow(page, 'c1').getByTestId('case-title')).toHaveAttribute('href', '/vorgang/c1');
});

test('WL-007 a case row looks as its state says, like a task row', async ({ page }) => {
  await seed(page, [...cases, aCase('d2', { endedAt: '2026-11-22T08:00:00Z', endReason: 'CANCELLED' })]);
  await page.goto('/workflows');
  const look = (id: string) => caseRow(page, id).evaluate((row) => {
    const style = getComputedStyle(row);
    const cell = getComputedStyle(row.querySelector('[data-testid="cell-title"]')!);
    return { background: style.backgroundColor, color: cell.color, line: cell.textDecorationLine };
  });
  await expect(caseRow(page, 'c1')).toBeVisible();
  const active = await look('c1');
  const suspended = await look('c3');
  expect(suspended.background).toBe(active.background);
  expect(suspended.color).not.toBe(active.color);
  expect(suspended.line).toBe('none');
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('case-row')).toHaveCount(2);
  const completed = await look('d1');
  const cancelled = await look('d2');
  expect(completed.background).not.toBe(active.background);
  expect(completed.color).toBe(active.color);
  expect(completed.line).toBe('none');
  expect(cancelled.background).toBe(completed.background);
  expect(cancelled.line).toBe('line-through');
  await expect(caseRow(page, 'd1').getByTestId('cell-businessId')).toHaveCSS('text-decoration-line', 'none');
  await expect(caseRow(page, 'd2')).toHaveAttribute('data-state', 'cancelled');
});

test('WL-008 a note is written per row and for all selected cases at once', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  const noteCell = caseRow(page, 'c2').getByTestId('cell-note');
  await noteCell.hover();
  await noteCell.getByTestId('note-edit').click();
  await noteCell.getByTestId('note-input').fill('ring Anna');
  await noteCell.getByTestId('note-save').click();
  await expect(noteCell).toContainText('ring Anna');
  expect((await bulkRequests(page)).at(-1)).toMatchObject({ action: 'case-note', ids: ['c2'], body: { text: 'ring Anna' } });
  await caseRow(page, 'c1').getByTestId('select-row').check();
  await caseRow(page, 'c3').getByTestId('select-row').check();
  await page.getByTestId('tool-note').click();
  await page.getByTestId('bulk-note-input').fill('all together');
  await page.getByTestId('bulk-note-save').click();
  await expect(caseRow(page, 'c1').getByTestId('cell-note')).toContainText('all together');
  await expect(caseRow(page, 'c3').getByTestId('cell-note')).toContainText('all together');
  await expect(caseRow(page, 'c2').getByTestId('cell-note')).toContainText('ring Anna');
  expect((await bulkRequests(page)).at(-1)).toMatchObject({ action: 'cases-note', ids: ['c1', 'c3'], body: { text: 'all together' } });
});

test('WL-009 the default primary filter of the case list is the one of the interview, In progress', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await expect(page.getByTestId('primary-filter-InProgress')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('primary-filter-Done')).toHaveAttribute('aria-pressed', 'false');
  expect((await listRequests(page))[0]!.body.mode).toBe('InProgress');
});

test('WL-010 the case list has a selection column for the note, and no read function', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await expect(page.getByTestId('column-header-id')).toHaveCount(1);
  await expect(page.getByTestId('select-row')).toHaveCount(3);
  await expect(page.getByTestId('cell-id')).toHaveCount(3);
  await expect(page.getByTestId('cell-id').first()).toHaveText('');
  await expect(page.getByTestId('selected-count')).toHaveText('0');
  await expect(page.getByTestId('tool-note')).toBeDisabled();
  for (const name of ['mark-read', 'mark-unread', 'claim', 'propose', 'follow-up']) await expect(page.getByTestId(`tool-${name}`)).toHaveCount(0);
  await caseRow(page, 'c1').getByTestId('select-row').check();
  await expect(page.getByTestId('selected-count')).toHaveText('1');
  await expect(page.getByTestId('tool-note')).toBeEnabled();
  // another list is other rows, nothing stays selected
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
});

test('WL-012 the status line of the case list shows the legend of new, changed, removed, completed, cancelled and suspended rows', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  const legend = page.getByTestId('status-line').getByTestId('legend');
  await expect(legend.locator('[data-legend]')).toHaveText(['New', 'Changed', 'Removed', 'Completed', 'Cancelled', 'Suspended']);
  await inGerman(page);
  await expect(legend.locator('[data-legend]')).toHaveText(['Neu', 'Geändert', 'Entfernt', 'Erledigt', 'Abgebrochen', 'Ausgesetzt']);
});

test('WL-013 the ended column of the case list shows only for the primary filters which hold ended cases', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await expect(page.getByTestId('column-header-endedAt')).toHaveCount(0);
  await expect(page.getByTestId('cell-endedAt')).toHaveCount(0);
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  await expect(page.getByTestId('column-header-endedAt')).toHaveCount(1);
  await expect(page.getByTestId('cell-endedAt')).toHaveCount(1);
  await expect(page.getByTestId('cell-endedAt')).not.toHaveText('');
  // the header and the cells go together, so no cell is out of line with its header
  const cellsPerRow = await page.locator('[data-testid="case-row"] > td').count();
  expect(cellsPerRow).toBe((await headerKeys(page)).length);
  await page.getByTestId('primary-filter-InProgress').click();
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await expect(page.getByTestId('column-header-endedAt')).toHaveCount(0);
  await expect(page.getByTestId('cell-endedAt')).toHaveCount(0);
});

test('WL-009 the primary filter of the case list the user chose last is kept as a setting and used on the next visit', async ({ page }) => {
  await seed(page, cases);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await page.getByTestId('primary-filter-Done').click();
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  await expect.poll(async () => (await page.request.get('/gui/api/v1/app/current-user/settings/bc:cases:primaryFilter')).status()).toBe(200);
  await page.goto('/workflows');
  await expect(page.getByTestId('primary-filter-Done')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('case-row')).toHaveCount(1);
  expect((await listRequests(page)).at(-1)!.body.mode).toBe('Done');
});
