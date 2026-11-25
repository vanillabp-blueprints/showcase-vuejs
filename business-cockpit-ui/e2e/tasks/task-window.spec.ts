// TF-007, TF-017, TF-018, TF-024, TF-045: a clerk works on a task in a tab of its own and goes back to the list.
import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const anna = { id: 'anna', display: 'Anna Sales' };
const ben = { id: 'ben', display: 'Ben Support' };

const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'react-module',
  bpmnProcessId: 'ride',
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

// opens the list, clicks the title of the first task and returns the tab which opened
const openInTab = async (page: Page) => {
  await page.goto('/tasks');
  const opened = page.waitForEvent('popup');
  await page.getByTestId('task-title').first().click();
  const tab = await opened;
  await expect(tab.getByTestId('task-page')).toBeVisible();
  return tab;
};

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-007 a click on the title opens the task in a tab of its own, the list stays, the tab has a back button instead of the menu', async ({ page }) => {
  await seed(page, [task('t1')]);
  const tab = await openInTab(page);
  await expect(tab).toHaveURL(/\/tasks\/t1$/);
  await expect(page).toHaveURL(/\/tasks$/);
  expect(await page.evaluate(() => window.name)).toBe('bc-list');
  // not opened with noopener
  expect(await tab.evaluate(() => window.opener !== null)).toBe(true);
  await expect(tab.getByTestId('header')).toBeVisible();
  await expect(tab.getByTestId('menu-button')).toHaveCount(0);
  const back = tab.getByTestId('back-to-list');
  await expect(back).toBeVisible();
  await expect(back).toHaveCSS('background-color', 'rgb(211, 47, 47)');
});

test('TF-017 back to the list asks in a dialog of the cockpit only for a task of the current user, and the user can stay', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna })]);
  const tab = await openInTab(page);
  let native = 0;
  tab.on('dialog', (dialog) => { native++; void dialog.dismiss(); });
  await tab.getByTestId('back-to-list').click();
  await expect(tab.getByTestId('leave-confirm')).toBeVisible();
  await tab.getByTestId('leave-confirm-no').click();
  await expect(tab.getByTestId('leave-confirm')).toBeHidden();
  await expect(tab.getByTestId('task-page')).toBeVisible();
  expect(tab.isClosed()).toBe(false);
  // leaving asks once: the dialog of the cockpit, no beforeunload on top of it
  const closed = tab.waitForEvent('close');
  await tab.getByTestId('back-to-list').click();
  await tab.getByTestId('leave-confirm-yes').click();
  await closed;
  expect(native).toBe(0);
});

test('TF-017 a task of another user or none is left without a question, also when the tab is closed', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben })]);
  const tab = await openInTab(page);
  const natives: string[] = [];
  tab.on('dialog', (dialog) => { natives.push(dialog.type()); void dialog.accept(); });
  await tab.getByTestId('task-page').click();
  await tab.close({ runBeforeUnload: true });
  expect(natives).toEqual([]);
  const second = await openInTab(page);
  const closed = second.waitForEvent('close');
  await second.getByTestId('back-to-list').click();
  // a question would keep the tab open
  await closed;
});

test('TF-017 closing the tab of a task of the current user warns with beforeunload', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna })]);
  const tab = await openInTab(page);
  // the browser warns only a page the user has worked in
  await tab.mouse.click(20, 300);
  const asked = tab.waitForEvent('dialog');
  void tab.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.accept();
});

test('TF-018 back to the list focuses the list in the click and the task tab closes itself', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben })]);
  await page.goto('/tasks');
  await page.evaluate(() => { (window as unknown as { focused: number }).focused = 0; window.focus = () => { (window as unknown as { focused: number }).focused++; }; });
  const opened = page.waitForEvent('popup');
  await page.getByTestId('task-title').first().click();
  const tab = await opened;
  await expect(tab.getByTestId('back-to-list')).toBeVisible();
  const closed = tab.waitForEvent('close');
  await tab.getByTestId('back-to-list').click();
  await closed;
  expect(await page.evaluate(() => (window as unknown as { focused: number }).focused)).toBe(1);
});

test('TF-018 without a list the task tab shows the list of all tasks itself', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks/t1');
  await page.getByTestId('back-to-list').click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByTestId('task-row')).toHaveCount(1);
});

test('TF-018 a list in another tab answers, but a tab which cannot close shows a hint', async ({ page, context }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await page.evaluate(() => { window.name = 'bc-list'; });
  const other = await context.newPage();
  await other.goto('/tasks/t1');
  await other.getByTestId('back-to-list').click();
  await expect(other.getByTestId('list-in-other-tab')).toBeVisible();
  await expect(other).toHaveURL(/\/tasks\/t1$/);
});

test('TF-024 the menu and the toggle open no tab, only the title of a task does', async ({ page, context }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  await page.getByTestId('toggle-my-tasks').click();
  await expect(page).toHaveURL(/\/my-tasks$/);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-tasks').click();
  await expect(page).toHaveURL(/\/tasks$/);
  expect(context.pages()).toHaveLength(1);
  await page.getByTestId('task-title').first().click();
  await expect.poll(() => context.pages().length).toBe(2);
  await expect(page).toHaveURL(/\/tasks$/);
});

test('TF-045 a list answers the question on bc-cockpit with its visibility, also after a reload; every page sets the same opener policy', async ({ page, context }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks');
  const ask = async (asker: Page) => asker.evaluate(() => new Promise<string | undefined>((resolve) => {
    const channel = new BroadcastChannel('bc-cockpit');
    channel.onmessage = (event) => { if (event.data?.list) resolve(event.data.visibility); };
    channel.postMessage({ question: 'list' });
    setTimeout(() => resolve(undefined), 1000);
  }));
  const asker = await context.newPage();
  await asker.goto('/tasks/t1');
  expect(await ask(asker)).toBe(await page.evaluate(() => document.visibilityState));
  await page.reload();
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  expect(await ask(asker)).toBe(await page.evaluate(() => document.visibilityState));
  const policies = new Set<string | undefined>();
  for (const address of ['/tasks', '/my-tasks', '/tasks/t1']) policies.add((await page.request.get(address)).headers()['cross-origin-opener-policy']);
  expect(policies.size).toBe(1);
});
