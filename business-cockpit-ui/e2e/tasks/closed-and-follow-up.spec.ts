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

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const filter = (page: Page, mode: string) => page.getByTestId(`primary-filter-${mode}`);
const putOnFollowUp = (page: Page, id: string, timestamp?: string) =>
  page.request.patch(`/gui/api/v1/usertask/${id}/follow-up-date`, { data: { timestamp } });

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('TL-010 the ended column shows only for ClosedTasksOnly', async ({ page }) => {
  await seed(page, [task('open1'), task('done1', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' })]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('column-header-endedAt')).toHaveCount(0);
  await expect(page.getByTestId('cell-endedAt')).toHaveCount(0);
  await filter(page, 'OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('column-header-followUpDate')).toBeVisible();
  await expect(page.getByTestId('column-header-endedAt')).toHaveCount(0);
  await filter(page, 'ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('column-header-endedAt')).toBeVisible();
  await expect(page.getByTestId('cell-endedAt')).toHaveCount(1);
  await expect(page.getByTestId('cell-endedAt')).not.toBeEmpty();
});

test('TL-021 a task put on follow-up leaves OpenTasksWithoutFollowUp until its date has come', async ({ page }) => {
  await seed(page, [task('open1'), task('open2')]);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await putOnFollowUp(page, 'open1', '2099-01-01T08:00:00Z');
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check open2');
  await expect(filter(page, 'OpenTasksWithoutFollowUp')).toHaveText('Open (1)');
  await expect(filter(page, 'OpenTasksWithFollowUp')).toHaveText('All open (2)');
  await filter(page, 'OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  // the date has come
  await putOnFollowUp(page, 'open1', '2020-01-01T08:00:00Z');
  await filter(page, 'OpenTasksWithoutFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(filter(page, 'OpenTasksWithoutFollowUp')).toHaveText('Open (2)');
});

test('TL-028 the status line is a footer below the rows: it does not scroll with them and is always visible', async ({ page }) => {
  const many = Array.from({ length: 20 }, (_, index) => task(`t${String(index).padStart(2, '0')}`));
  await page.setViewportSize({ width: 1280, height: 500 });
  await seed(page, many);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(20);
  const viewport = page.viewportSize()!;
  const place = async () => {
    const list = (await page.getByTestId('task-list').boundingBox())!;
    const line = (await page.getByTestId('status-line').boundingBox())!;
    return { list, line };
  };
  const before = await place();
  expect(before.line.y).toBeGreaterThanOrEqual(before.list.y + before.list.height - 1);
  expect(before.line.y + before.line.height).toBeLessThanOrEqual(viewport.height);
  // the rows scroll inside the list, the page and the status line stay
  await page.getByTestId('task-list').locator('.v-table__wrapper').evaluate((wrapper) => { wrapper.scrollTop = wrapper.scrollHeight; });
  await page.mouse.wheel(0, 2000);
  const after = await place();
  expect(after.line.y).toBe(before.line.y);
  expect(after.line.y + after.line.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.getByTestId('task-row').last()).toBeInViewport();
  await expect(page.getByTestId('task-row').first()).not.toBeInViewport();
  await expect(page.getByTestId('legend')).toBeInViewport();
  await expect(filter(page, 'ClosedTasksOnly')).toBeInViewport();
});
