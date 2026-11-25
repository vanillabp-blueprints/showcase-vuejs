// TF-008, TF-016, TF-019, TF-020, TF-022, TF-023: the frame of the task page, the messages between its areas, external tasks and the note.
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const anna = { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' };

const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  bpmnProcessId: 'areas',
  id,
  workflowModuleId: 'react-module',
  uiUriType: 'ES_MODULES',
  uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  read: true,
  ...extra,
});

const seed = async (page: Page, tasks: SimulatedTask[]) => {
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
};
const stored = async (page: Page, id: string): Promise<SimulatedTask> =>
  ((await (await page.request.get('/simulator-api/user-tasks')).json()) as SimulatedTask[]).find((found) => found.id === id)!;

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-008 long and wide content of a task scrolls in its own area, the application header stays and the frame does not break', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await page.getByTestId('task-page').evaluate((area) => {
    const big = document.createElement('div');
    big.dataset.testid = 'big';
    big.style.cssText = 'height: 4000px; width: 3000px; background: linear-gradient(red, blue)';
    area.append(big);
  });
  const frame = () => page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight, documentWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight, innerWidth: window.innerWidth,
  }));
  const before = await frame();
  expect(before.documentHeight).toBeLessThanOrEqual(before.innerHeight);
  expect(before.documentWidth).toBeLessThanOrEqual(before.innerWidth);
  const area = page.getByTestId('task-page');
  expect(await area.evaluate((element) => element.scrollHeight > element.clientHeight && element.scrollWidth > element.clientWidth)).toBe(true);
  const headerBefore = await page.getByTestId('header').boundingBox();
  await area.evaluate((element) => element.scrollTo(500, 1500));
  expect(await area.evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([500, 1500]);
  expect(await page.getByTestId('header').boundingBox()).toEqual(headerBefore);
  await expect(page.getByTestId('header').getByTestId('task-actions')).toBeInViewport();
  expect(await frame()).toEqual(before);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
});

test('TF-016 a message sent from one area of the page reaches the handler of the named area', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  await page.getByTestId('listen').click();
  await page.getByTestId('send-to-actions').click();
  await expect(page.getByTestId('received').locator('li')).toHaveText(['body: hello from t1']);
  // the area information has no handler: only the named area got it
  await expect(page.getByTestId('react-information')).not.toContainText('hello');
});

test('TF-022 a message sent before the area listened reaches it once it listens, none after unsubscribe', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  await page.getByTestId('send-to-actions').click();
  await page.getByTestId('send-to-actions').click();
  await expect(page.getByTestId('received').locator('li')).toHaveCount(0);
  await page.getByTestId('listen').click();
  await expect(page.getByTestId('received').locator('li')).toHaveText(['body: hello from t1', 'body: hello from t1']);
  await page.getByTestId('stop').click();
  await page.getByTestId('send-to-actions').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('received').locator('li')).toHaveCount(2);
});

test('TF-022 the messages kept for an area are not delivered on a new page of the task', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna }), task('t2', { assignee: anna })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  await page.getByTestId('send-to-actions').click();
  await page.goto('/tasks/t2');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  await page.getByTestId('listen').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('received').locator('li')).toHaveCount(0);
});

test('TF-019 an external task opens in a tab of its own and the list stays intact', async ({ page, context }) => {
  await context.route('https://external.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>external</title>' }));
  await seed(page, [task('t1', { uiUriType: 'EXTERNAL', uiUri: 'https://external.example/form/t1' }), task('t2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const opened = context.waitForEvent('page');
  await page.getByTestId('task-title').filter({ hasText: 'Check t1' }).click();
  const tab = await opened;
  await expect(tab).toHaveURL('https://external.example/form/t1');
  expect(tab.url()).not.toBe(page.url());
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByTestId('task-row')).toHaveCount(2);
});

test('TF-020 the list links an external task to its address', async ({ page }) => {
  // the list links to the address of an external task
  await seed(page, [task('t1', { uiUriType: 'EXTERNAL', uiUri: '/form.html', workflowModuleId: 'billing' }), task('t2', { uiUriType: 'EXTERNAL', uiUri: 'https://x.example/a' })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-title').filter({ hasText: 'Check t1' })).toHaveAttribute('href', '/wm/billing/form.html');
  await expect(page.getByTestId('task-title').filter({ hasText: 'Check t2' })).toHaveAttribute('href', 'https://x.example/a');
});

test('TF-023 the note is an input field in the header, visible at once, and saves what the clerk types', async ({ page }) => {
  await seed(page, [task('t1', { note: 'old note' })]);
  await page.goto('/tasks/t1');
  const input = page.getByTestId('header').getByTestId('task-note-input');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('old note');
  await input.fill('call back');
  await input.press('Enter');
  await expect.poll(async () => (await stored(page, 't1')).note).toBe('call back');
});

test('TF-023 the note of a closed task cannot be changed', async ({ page }) => {
  await seed(page, [task('t1', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('header').getByTestId('task-note-input')).toBeDisabled();
});
