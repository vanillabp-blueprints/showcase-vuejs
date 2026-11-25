// TF-030, TF-031, TF-035, TF-038, TF-043, TF-044: the barrier over the page of a task not claimed yet or suspended (Q-CLAIM = hard).
import { expect, test, type Locator, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

const anna = { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' };
const ben = { id: 'ben', display: 'Ben Support', displayShort: 'Ben', email: 'ben@acme.example' };

const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'react-module',
  bpmnProcessId: 'areas',
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
const publish = (page: Page) => page.request.post('/simulator-api/publish', { data: { event: 'UserTask' } });
const barrier = (page: Page) => page.getByTestId('task-barrier');
const hosts = (page: Page): Locator => page.locator('[data-area] > *');
const inertOf = (page: Page) => hosts(page).evaluateAll((elements) => elements.map((element) => (element as HTMLElement).inert));
const userTaskOf = (page: Page, area: string) => page.locator(`[data-area="${area}"] > *`).evaluate((element) => (element as unknown as { userTask: Record<string, unknown> }).userTask);

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-035 a task not claimed by the user has a barrier and its web components are inert, a click and the Tab key do not reach the form', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await expect(barrier(page)).toBeVisible();
  await expect(barrier(page)).toHaveAttribute('data-reason', 'claim');
  expect(await inertOf(page)).toEqual([true, true, true]);
  // a click on the button of the form does not reach it: the form got no message, so the list of the actions stays empty
  await page.getByTestId('listen').click({ force: true });
  await page.getByTestId('send-to-actions').click({ force: true });
  await expect(page.getByTestId('received').locator('li')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-area]') ?? null)).toBeNull();
});

test('TF-035 a task nobody holds has the barrier too, an own task and an ended task have none', async ({ page }) => {
  await seed(page, [task('t1'), task('t2', { assignee: anna }), task('t3', { assignee: ben, endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' })]);
  await page.goto('/tasks/t1');
  await expect(barrier(page)).toBeVisible();
  await page.goto('/tasks/t2');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await expect(barrier(page)).toHaveCount(0);
  expect(await inertOf(page)).toEqual([false, false, false]);
  await page.goto('/tasks/t3');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await expect(barrier(page)).toHaveCount(0);
  expect(await inertOf(page)).toEqual([false, false, false]);
});

test('TF-030 while the barrier lies over the page the content stays readable and the area scrolls with the wheel', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben })]);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await page.locator('[data-area="body"]').evaluate((area) => { const big = document.createElement('div'); big.style.height = '4000px'; area.append(big); });
  await expect(barrier(page)).toBeVisible();
  await expect(page.getByTestId('react-body')).toContainText('React body of t1');
  await expect(page.getByTestId('react-information')).toBeVisible();
  const background = await barrier(page).evaluate((element) => getComputedStyle(element).backgroundColor);
  const alpha = background.startsWith('rgba') ? Number(background.split(',')[3].replace(')', '')) : 1;
  expect(alpha).toBeLessThan(0.5);
  // the barrier does not take the mouse nor the touch: the area beneath it gets both and scrolls
  expect(await barrier(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  const area = page.locator('[data-area="body"]');
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('TF-031 the user claims the open task: the web components get userTask with the user as assignee and the barrier goes without a reload', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.goto('/tasks/t1');
  await expect(barrier(page)).toBeVisible();
  await page.evaluate(() => { (window as unknown as { marker: string }).marker = 'same page'; });
  expect((await userTaskOf(page, 'body')).assignee).toBeUndefined();
  await page.getByTestId('header').getByTestId('task-action-claim').click();
  await expect(barrier(page)).toHaveCount(0);
  for (const area of ['body', 'information', 'actions']) expect(await userTaskOf(page, area)).toMatchObject({ id: 't1', assignee: { id: 'anna' } });
  expect(await inertOf(page)).toEqual([false, false, false]);
  expect(await page.evaluate(() => (window as unknown as { marker: string }).marker)).toBe('same page');
  await page.getByTestId('listen').click();
  await page.getByTestId('send-to-actions').click();
  await expect(page.getByTestId('received').locator('li')).toHaveCount(1);
});

test('TF-038 the cockpit sets no read-only flag and disables no input, with the barrier and without it', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben }), task('t2', { assignee: anna })]);
  const flags = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-area], [data-area] *')];
    const shadows = all.flatMap((element) => [...(element.shadowRoot?.querySelectorAll('*') ?? [])]);
    return [...all, ...shadows].filter((element) => ['disabled', 'readonly', 'aria-disabled', 'aria-readonly'].some((name) => element.hasAttribute(name))
      || (element as HTMLInputElement).disabled === true || (element as HTMLInputElement).readOnly === true).length;
  });
  for (const id of ['t1', 't2']) {
    await page.goto(`/tasks/${id}`);
    await expect(page.getByTestId('react-body')).toBeVisible();
    expect(await flags()).toBe(0);
  }
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  const props = await page.locator('[data-area="body"] > *').evaluate((element) => Object.keys(element).concat(Object.keys(Object.getPrototypeOf(element))).filter((key) => /read.?only|disabled/i.test(key)));
  expect(props).toEqual([]);
});

test('TF-043 a suspended task has the barrier with a note, whatever its assignee, the content stays readable and the form is not reached', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna, suspendedAt: '2026-11-21T08:00:00Z' })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await expect(barrier(page)).toBeVisible();
  await expect(barrier(page)).toHaveAttribute('data-reason', 'suspended');
  await expect(barrier(page)).toContainText('suspended');
  expect(await inertOf(page)).toEqual([true, true, true]);
  await expect(page.getByTestId('react-body')).toContainText('React body of t1');
  await page.getByTestId('send-to-actions').click({ force: true });
  await page.getByTestId('listen').click({ force: true });
  await expect(page.getByTestId('received').locator('li')).toHaveCount(0);
  expect(await barrier(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
});

test('TF-043 a suspended task which ended has no barrier', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna, suspendedAt: '2026-11-21T08:00:00Z', endedAt: '2026-11-22T08:00:00Z', endReason: 'CANCELLED' })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await expect(barrier(page)).toHaveCount(0);
});

test('TF-044 the suspended task is activated again: userTask comes again without suspendedAt and the barrier goes without a reload', async ({ page }) => {
  await seed(page, [task('t1', { assignee: anna, suspendedAt: '2026-11-21T08:00:00Z' })]);
  await page.goto('/tasks/t1');
  await expect(barrier(page)).toHaveAttribute('data-reason', 'suspended');
  expect(await userTaskOf(page, 'body')).toMatchObject({ suspendedAt: expect.anything() });
  await page.evaluate(() => { (window as unknown as { marker: string }).marker = 'same page'; });
  await seed(page, [task('t1', { assignee: anna })]);
  await publish(page);
  await expect(barrier(page)).toHaveCount(0);
  expect((await userTaskOf(page, 'body')).suspendedAt).toBeUndefined();
  expect(await inertOf(page)).toEqual([false, false, false]);
  expect(await page.evaluate(() => (window as unknown as { marker: string }).marker)).toBe('same page');
});

test('TF-044 activated again but not claimed: the barrier of the claim stays until the user claims the task', async ({ page }) => {
  await seed(page, [task('t1', { assignee: ben, suspendedAt: '2026-11-21T08:00:00Z' })]);
  await page.goto('/tasks/t1');
  await expect(barrier(page)).toHaveAttribute('data-reason', 'suspended');
  await seed(page, [task('t1', { assignee: ben })]);
  await publish(page);
  await expect(barrier(page)).toHaveAttribute('data-reason', 'claim');
  expect(await inertOf(page)).toEqual([true, true, true]);
  await page.getByTestId('header').getByTestId('task-action-claim').click();
  await page.getByTestId('claim-confirm-yes').click();
  await expect(barrier(page)).toHaveCount(0);
});
