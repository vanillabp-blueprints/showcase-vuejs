// TF-041, TF-042: the column on the right of the task page and the look of the application header by the state of the task.
import { expect, test, type Locator, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;

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
const style = (target: Locator, property: string) => target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
const addHeight = (area: Locator, height: number) => area.evaluate((element, pixels) => {
  const big = document.createElement('div');
  big.style.cssText = `height: ${pixels}px; background: linear-gradient(red, blue)`;
  element.append(big);
}, height);

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-041 information scrolls on its own, actions stays at the bottom of the visible height while a long body scrolls', async ({ page }) => {
  await seed(page, [task('t1')]);
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto('/tasks/t1');
  const body = page.locator('[data-area="body"]');
  const information = page.locator('[data-area="information"]');
  const actions = page.locator('[data-area="actions"]');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  await addHeight(body, 4000);
  await addHeight(information, 2000);
  // the column is on the right of the body
  const bodyBox = (await body.boundingBox())!;
  const informationBox = (await information.boundingBox())!;
  expect(informationBox.x).toBeGreaterThanOrEqual(bodyBox.x + bodyBox.width - 1);
  expect(Math.abs((await actions.boundingBox())!.x - informationBox.x)).toBeLessThan(2);
  // information scrolls on its own, the page does not grow by it
  expect(await information.evaluate((element) => element.scrollHeight > element.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY))).toBe(true);
  await information.evaluate((element) => element.scrollTo(0, 500));
  expect(await information.evaluate((element) => element.scrollTop)).toBe(500);
  // actions is at the bottom of the visible height and stays there while the body scrolls
  const bottom = async () => { const box = (await actions.boundingBox())!; return box.y + box.height; };
  const innerHeight = await page.evaluate(() => window.innerHeight);
  const before = await bottom();
  expect(before).toBeLessThanOrEqual(innerHeight);
  expect(before).toBeGreaterThan(innerHeight - 60);
  await page.getByTestId('task-page').evaluate((element) => element.scrollTo(0, 100000));
  await body.evaluate((element) => element.scrollTo(0, 100000));
  expect(await bottom()).toBe(before);
  await expect(actions).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(innerHeight);
});

test('TF-042 the header of an open task looks as the state says, the same as its row, and nothing in it is struck through', async ({ page }) => {
  await seed(page, [
    task('active'),
    task('completed', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' }),
    task('cancelled', { endedAt: '2026-11-21T08:00:00Z', endReason: 'CANCELLED' }),
    task('suspended', { suspendedAt: '2026-11-21T08:00:00Z' }),
    task('suspendedThenCancelled', { endedAt: '2026-11-21T08:00:00Z', endReason: 'CANCELLED', suspendedAt: '2026-11-20T09:00:00Z' }),
  ]);
  const header = page.getByTestId('header');
  const look = async (id: string) => {
    await page.goto(`/tasks/${id}`);
    await expect(page.getByTestId('task-actions')).toBeVisible();
    const struck = await header.evaluate((element) => [element, ...element.querySelectorAll('*')].some((one) => getComputedStyle(one).textDecorationLine.includes('line-through')));
    return { background: await style(header, 'background-color'), color: await style(header, 'color'), struck };
  };
  const active = await look('active');
  const completed = await look('completed');
  const cancelled = await look('cancelled');
  const suspended = await look('suspended');
  const suspendedThenCancelled = await look('suspendedThenCancelled');
  expect(suspended.background).toBe(active.background);
  expect(suspended.color).not.toBe(active.color);
  expect(completed.background).not.toBe(active.background);
  expect(completed.color).toBe(active.color);
  expect(cancelled).toEqual(completed);
  expect(suspendedThenCancelled).toEqual(completed);
  for (const one of [active, completed, cancelled, suspended, suspendedThenCancelled]) expect(one.struck).toBe(false);
  // a list page has the plain look again
  await page.goto('/tasks');
  expect(await style(header, 'background-color')).toBe(active.background);
});
