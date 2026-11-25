// WP-009, WP-010, WP-011, WP-012, WP-014, WP-015: the note, loading states and notes, the header, the areas, updates and the look of a case page.
import { expect, test, type Locator, type Page } from '@playwright/test';

type FileAnswer = string | number | ((count: number) => string | number | Promise<string | number>);
type Simulated = Record<string, unknown>;

const JS = 'text/javascript';
const ID = 'fake-module';
const aCase = (id: string, extra: Simulated = {}): Simulated => ({
  id, workflowModuleId: ID, bpmnProcessId: 'p', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', businessId: `B-${id}`, title: { en: `Ride ${id}`, de: `Fahrt ${id}` }, ...extra,
});
const seed = async (page: Page, workflows: Simulated[]) => {
  await page.request.post(`/bpms/api/v1_1/workflow-module/${ID}`, { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/workflows', { data: { workflows } });
};

/** A module made of the given files; a number answers that HTTP status, a function answers by how often the file was asked. */
async function fakeModule(page: Page, files: Record<string, FileAnswer>) {
  const requests: string[] = [];
  const entries = Object.fromEntries(Object.keys(files).map((file) => [file.replace(/\.js$/, ''), file]));
  const all: Record<string, FileAnswer> = { 'bc-manifest.json': JSON.stringify({ manifestVersion: 1, entries, buildVersion: '1.0.0', buildTimestamp: '2026-11-25T00:00:00Z' }), ...files };
  await page.route(`**/wm/${ID}/**`, async (route) => {
    const file = new URL(route.request().url()).pathname.replace(`/wm/${ID}/`, '');
    requests.push(file);
    const answer = all[file];
    const body = typeof answer === 'function' ? await answer(requests.filter((name) => name === file).length) : answer;
    if (body === undefined) return route.fulfill({ status: 404 });
    if (typeof body === 'number') return route.fulfill({ status: body });
    return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : JS, body });
  });
}

const pageFile = (answer: unknown) => `export const workflowPage = () => (${JSON.stringify(answer)});`;
const define = (name: string, text: string) =>
  `customElements.define('${name}', class extends HTMLElement { connectedCallback() { this.dataset.testid = '${name}'; this.textContent = '${text}'; } });`;
const views = (...names: string[]) => names.map((name) => define(name, name)).join('\n');
const gate = () => { let open!: () => void; const wait = new Promise<void>((resolve) => { open = resolve; }); return { wait, open }; };
const style = (target: Locator, property: string) => target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

const casePage = (page: Page) => page.getByTestId('case-page');
const note = (page: Page) => casePage(page).getByTestId('case-note');
const ONE = { 'WorkflowPage.js': pageFile({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': views('fake-module-v1-page') };

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('WP-009 the note of the open case is an input field of the header, visible at once, with no button to open it first', async ({ page }) => {
  await fakeModule(page, ONE);
  await seed(page, [aCase('c1', { note: 'call back' })]);
  await page.goto('/workflows/c1');
  const input = page.getByTestId('header').getByTestId('case-note-input');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('call back');
  await expect(input).toBeEditable();
  await expect(page.getByTestId('header').locator('button:has-text("ote")')).toHaveCount(0);
});

test('WP-010 the page shows a loading state of its own for the case, for the data entry and for the visual entry', async ({ page }) => {
  const workflow = gate(); const data = gate(); const visual = gate();
  await page.route('**/gui/api/v1/workflow/c1', async (route) => { await workflow.wait; await route.fallback(); });
  await fakeModule(page, {
    'WorkflowPage.js': async () => { await data.wait; return pageFile({ element: 'fake-module-v1-page', entry: 'Views' }); },
    'Views.js': async () => { await visual.wait; return views('fake-module-v1-page'); },
  });
  await seed(page, [aCase('c1')]);
  await page.goto('/workflows/c1');
  await expect(casePage(page)).toHaveAttribute('data-state', 'loading-case');
  workflow.open();
  await expect(casePage(page)).toHaveAttribute('data-state', 'loading-page');
  data.open();
  await expect(casePage(page)).toHaveAttribute('data-state', 'loading-visual');
  visual.open();
  await expect(casePage(page)).toHaveAttribute('data-state', 'drawn');
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
});

test('WP-010 each failure of the case page shows its own note, with retry where retrying can help', async ({ page }) => {
  await fakeModule(page, { ...ONE, 'WorkflowPage.js': (count) => (count === 1 ? 500 : pageFile({ element: 'fake-module-v1-page', entry: 'Views' })) });
  await seed(page, [aCase('c1')]);
  let fail = true;
  await page.route('**/gui/api/v1/workflow/c1', (route) => (fail ? route.fulfill({ status: 500 }) : route.fallback()));
  await page.goto('/workflows/c1');
  await expect(note(page)).toHaveAttribute('data-kind', 'case-failed');
  fail = false;
  await casePage(page).getByTestId('case-retry').click();
  // the data entry fails once, then answers
  await expect(note(page)).toHaveAttribute('data-kind', 'ask-failed');
  await expect(note(page)).toContainText(ID);
  await casePage(page).getByTestId('case-retry').click();
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  await expect(note(page)).toHaveCount(0);
});

test('WP-010 a visual entry which fails to load, a module with no page and a web component not defined in time have their notes', async ({ page }) => {
  await fakeModule(page, { ...ONE, 'Views.js': (count) => (count === 1 ? 500 : 'export {};') });
  await seed(page, [aCase('c1'), aCase('c2', { workflowModuleId: 'empty-module' })]);
  await page.request.post('/bpms/api/v1_1/workflow-module/empty-module', { data: { uri: '/bc-manifest.json' } });
  await page.clock.install();
  await page.goto('/workflows/c1');
  await expect(note(page)).toHaveAttribute('data-kind', 'load-failed');
  await casePage(page).getByTestId('case-retry').click();
  await expect(casePage(page)).toHaveAttribute('data-state', 'loading-visual');
  await page.clock.runFor(11_000);
  await expect(note(page)).toHaveAttribute('data-kind', 'not-defined');
  await expect(note(page)).toContainText('fake-module-v1-page');
});

test('WP-010 a module which names no page for the case: a note without retry', async ({ page }) => {
  await fakeModule(page, { 'Header.js': 'export const header = () => undefined;' });
  await seed(page, [aCase('c1')]);
  await page.goto('/workflows/c1');
  await expect(note(page)).toHaveAttribute('data-kind', 'no-page');
  await expect(casePage(page).getByTestId('case-retry')).toHaveCount(0);
});

test('WP-011 the header of an open case shows neither the title of the case nor its business id', async ({ page }) => {
  await fakeModule(page, ONE);
  await seed(page, [aCase('c1', { title: { en: 'Ride to the airport' }, businessId: 'BIZ-4711' })]);
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  const header = page.getByTestId('header');
  await expect(header.getByTestId('case-actions')).toBeVisible();
  await expect(header).not.toContainText('Ride to the airport');
  await expect(header).not.toContainText('BIZ-4711');
});

test('WP-012 the web component of all is drawn when the page names no area the cockpit has, and never together with areas', async ({ page }) => {
  await fakeModule(page, {
    'WorkflowPage.js': pageFile({ element: { footer: 'fake-module-v1-footer', all: 'fake-module-v1-page' }, entry: 'Views' }),
    'Views.js': views('fake-module-v1-footer', 'fake-module-v1-page', 'fake-module-v1-body'),
  });
  await seed(page, [aCase('c1')]);
  await page.goto('/workflows/c1');
  await expect(casePage(page).locator('[data-area="all"] fake-module-v1-page')).toBeVisible();
  await expect(casePage(page).locator('[data-area]')).toHaveCount(1);
  await expect(casePage(page).locator('fake-module-v1-footer')).toHaveCount(0);
});

test('WP-012 the areas the page knows are drawn and all is not drawn with them', async ({ page }) => {
  await fakeModule(page, {
    'WorkflowPage.js': pageFile({ element: { body: 'fake-module-v1-body', footer: 'fake-module-v1-footer', all: 'fake-module-v1-page' }, entry: 'Views' }),
    'Views.js': views('fake-module-v1-body', 'fake-module-v1-footer', 'fake-module-v1-page'),
  });
  await seed(page, [aCase('c1')]);
  await page.goto('/workflows/c1');
  await expect(casePage(page).locator('[data-area="body"] fake-module-v1-body')).toBeVisible();
  await expect(casePage(page).locator('[data-area]')).toHaveCount(1);
  await expect(casePage(page).locator('fake-module-v1-page, fake-module-v1-footer')).toHaveCount(0);
});

// the web component shows the note of the `workflow` it was given last
const SHOWS_NOTE = `customElements.define('fake-module-v1-page', class extends HTMLElement {
  set workflow(value) { this._workflow = value; this.dataset.testid = 'shows-note'; this.textContent = 'note: ' + (value.note ?? ''); }
  get workflow() { return this._workflow; }
});`;
const publishCase = (page: Page, event: Simulated) => page.request.post('/simulator-api/publish', { data: { event: 'Workflow', items: [{ workflowModuleId: ID, event: { name: 'Workflow', id: 'c1', type: 'UPDATE', ...event } }] } });
const toast = (page: Page) => page.getByTestId('toast');

test('WP-014 an update event of the open case reads it again and sets workflow again; a toast comes only for another user', async ({ page }) => {
  await fakeModule(page, { 'WorkflowPage.js': pageFile({ element: 'fake-module-v1-page', entry: 'Views' }), 'Views.js': SHOWS_NOTE });
  await seed(page, [aCase('c1', { note: 'first' }), aCase('c2', { note: 'other' })]);
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('shows-note')).toHaveText('note: first');
  const change = (id: string, text: string) => page.request.post('/simulator-api/workflows', { data: { workflows: [aCase('c1', { note: id === 'c1' ? text : 'first' }), aCase('c2', { note: 'other' })] } });
  // a change by the user themselves: read again, no toast
  await change('c1', 'second');
  await publishCase(page, { initiatorKind: 'USER', initiator: 'anna' });
  await expect(page.getByTestId('shows-note')).toHaveText('note: second');
  await expect(toast(page)).toHaveCount(0);
  // by the system or the cockpit: read again, no toast
  await change('c1', 'third');
  await publishCase(page, { initiatorKind: 'SYSTEM' });
  await expect(page.getByTestId('shows-note')).toHaveText('note: third');
  await change('c1', 'fourth');
  await publishCase(page, { initiatorKind: 'COCKPIT' });
  await expect(page.getByTestId('shows-note')).toHaveText('note: fourth');
  await expect(toast(page)).toHaveCount(0);
  // another case: nothing is read again
  const before = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/workflow/c1')).length);
  await page.request.post('/simulator-api/publish', { data: { event: 'Workflow', items: [{ workflowModuleId: ID, event: { name: 'Workflow', id: 'c2', type: 'UPDATE', initiatorKind: 'USER', initiator: 'bob' } }] } });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/workflow/c1')).length)).toBe(before);
  await expect(toast(page)).toHaveCount(0);
  // by another user: read again and a toast which stays until clicked away
  await change('c1', 'fifth');
  await publishCase(page, { initiatorKind: 'USER', initiator: 'bob' });
  await expect(page.getByTestId('shows-note')).toHaveText('note: fifth');
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toContainText('bob');
  await page.waitForTimeout(6000);
  await expect(toast(page)).toHaveCount(1);
  await toast(page).click();
  await expect(toast(page)).toHaveCount(0);
});

test('WP-015 the header of an open case looks as the state of the case says, the same as its row, and nothing in it is struck through', async ({ page }) => {
  await fakeModule(page, ONE);
  await seed(page, [
    aCase('active'),
    aCase('completed', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' }),
    aCase('cancelled', { endedAt: '2026-11-21T08:00:00Z', endReason: 'CANCELLED' }),
    aCase('suspended', { suspendedAt: '2026-11-21T08:00:00Z' }),
  ]);
  const header = page.getByTestId('header');
  const look = async (id: string) => {
    await page.goto(`/workflows/${id}`);
    await expect(page.getByTestId('case-actions')).toBeVisible();
    await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
    const struck = await header.evaluate((element) => [element, ...element.querySelectorAll('*')].some((one) => getComputedStyle(one).textDecorationLine.includes('line-through')));
    return { background: await style(header, 'background-color'), color: await style(header, 'color'), struck };
  };
  const active = await look('active');
  const completed = await look('completed');
  const cancelled = await look('cancelled');
  const suspended = await look('suspended');
  expect(suspended.background).toBe(active.background);
  expect(suspended.color).not.toBe(active.color);
  expect(completed.background).not.toBe(active.background);
  expect(completed.color).toBe(active.color);
  expect(cancelled).toEqual(completed);
  for (const one of [active, completed, cancelled, suspended]) expect(one.struck).toBe(false);
  // no barrier over the page of a suspended case: its web component takes clicks
  await page.goto('/workflows/suspended');
  await expect(page.getByTestId('fake-module-v1-page')).toBeVisible();
  await expect(page.getByTestId('case-page').locator('[data-testid$="barrier"]')).toHaveCount(0);
  expect(await page.getByTestId('fake-module-v1-page').evaluate((element) => element.closest('[inert]') === null)).toBe(true);
  // a list page has the plain look again
  await page.goto('/workflows');
  expect(await style(header, 'background-color')).toBe(active.background);
});
