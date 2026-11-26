import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;
type ListRequest = { path: string; body: Record<string, unknown> };
type CountRequest = { path: string; mode?: string; modes: string[]; keys: string[] };
type SettingRequest = { method: string; key: string; body?: unknown };

const anna = { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' };

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

// two open tasks, one put aside until far in the future, two closed ones
const fiveTasks = [
  task('open1', { assignee: anna }),
  task('open2'),
  task('later', { followUpDate: '2099-01-01T08:00:00Z' }),
  task('done1', { endedAt: '2026-11-21T08:00:00Z', endReason: 'COMPLETED' }),
  task('done2', { endedAt: '2026-11-22T08:00:00Z', endReason: 'CANCELLED' }),
];

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const listRequests = async (page: Page): Promise<ListRequest[]> => (await page.request.get('/simulator-api/list-requests')).json();
const countRequests = async (page: Page): Promise<CountRequest[]> => (await page.request.get('/simulator-api/count-requests')).json();
const settingRequests = async (page: Page): Promise<SettingRequest[]> => (await page.request.get('/simulator-api/setting-requests')).json();
const filter = (page: Page, mode: string) => page.getByTestId(`primary-filter-${mode}`);

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('TL-001 the status line offers the primary filters from the interview, below the rows, with short translated labels', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  // the page starts after it read the language of the user, so wait for it
  await expect(page.getByTestId('status-line')).toBeVisible();
  const buttons = page.getByTestId('status-line').locator('[data-testid^="primary-filter-"]');
  expect(await buttons.evaluateAll((all) => all.map((button) => button.getAttribute('data-testid')))).toEqual([
    'primary-filter-OpenTasksWithoutFollowUp', 'primary-filter-OpenTasksWithFollowUp', 'primary-filter-ClosedTasksOnly',
  ]);
  await expect(buttons).toHaveText(['Open (2)', 'All open (3)', 'Closed']);
  const list = await page.getByTestId('task-list').boundingBox();
  const line = await page.getByTestId('status-line').boundingBox();
  expect(line!.y).toBeGreaterThanOrEqual(list!.y + list!.height - 1);
  const viewport = page.viewportSize()!;
  expect(line!.y + line!.height).toBeLessThanOrEqual(viewport.height);
  await page.goto('/aufgaben');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(buttons).toHaveText(['Offen (2)', 'Alle offenen (3)', 'Erledigt']);
  await page.getByTestId('language-fr').click();
  await expect(buttons).toHaveText(['Ouvertes (2)', 'Toutes ouvertes (3)', 'Terminées']);
  await page.getByTestId('language-es').click();
  await expect(buttons).toHaveText(['Abiertas (2)', 'Todas abiertas (3)', 'Cerradas']);
});

test('TL-002 the default primary filter is OpenTasksWithoutFollowUp, and the list sends it', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(filter(page, 'OpenTasksWithoutFollowUp')).toHaveAttribute('aria-pressed', 'true');
  await expect(filter(page, 'ClosedTasksOnly')).toHaveAttribute('aria-pressed', 'false');
  const modes = (await listRequests(page)).map((request) => request.body.mode);
  expect(modes).toEqual(['OpenTasksWithoutFollowUp']);
  await filter(page, 'OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  await filter(page, 'ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  expect((await listRequests(page)).map((request) => request.body.mode)).toEqual(['OpenTasksWithoutFollowUp', 'OpenTasksWithFollowUp', 'ClosedTasksOnly']);
});

test('TL-003 each primary filter shows its count in brackets, except ClosedTasksOnly, which is asked on mouse-over only', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  await expect(filter(page, 'OpenTasksWithoutFollowUp')).toHaveText('Open (2)');
  await expect(filter(page, 'OpenTasksWithFollowUp')).toHaveText('All open (3)');
  await expect(filter(page, 'ClosedTasksOnly')).toHaveText('Closed');
  const asked = (await countRequests(page)).flatMap((request) => request.modes);
  expect(asked).toContain('OpenTasksWithFollowUp');
  expect(asked).not.toContain('ClosedTasksOnly');
  await filter(page, 'ClosedTasksOnly').hover();
  await expect(filter(page, 'ClosedTasksOnly')).toHaveText('Closed (2)');
  expect((await countRequests(page)).flatMap((request) => request.modes)).toContain('ClosedTasksOnly');
  // it is not kept: the next list shows no count of closed tasks
  await page.goto('/tasks');
  await expect(filter(page, 'OpenTasksWithFollowUp')).toHaveText('All open (3)');
  await expect(filter(page, 'ClosedTasksOnly')).toHaveText('Closed');
});

test('TL-005 the primary filter last chosen is used again, and the header toggle keeps the default one', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  await filter(page, 'ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect.poll(async () => (await settingRequests(page)).filter((request) => request.method === 'PUT').map((request) => request.body)).toEqual(['ClosedTasksOnly']);
  await page.request.post('/simulator-api/count-requests/clear');
  await page.goto('/tasks');
  await expect(filter(page, 'ClosedTasksOnly')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  const lists = await listRequests(page);
  expect(lists[lists.length - 1]!.body.mode).toBe('ClosedTasksOnly');
  // the toggle of the header asks with the default primary filter only
  const toggleModes = (await countRequests(page)).filter((request) => request.keys.includes('toggle') && request.path.endsWith('/usertask/count')).map((request) => request.mode);
  expect(toggleModes.length).toBeGreaterThan(0);
  expect(toggleModes.every((mode) => mode === 'OpenTasksWithoutFollowUp')).toBe(true);
  // the lists keep their own choice: my tasks still opens with the default
  await page.goto('/my-tasks');
  await expect(filter(page, 'OpenTasksWithoutFollowUp')).toHaveAttribute('aria-pressed', 'true');
});

test('TL-006 the status line shows a legend for new, changed, removed, completed, cancelled and suspended rows', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  const legend = page.getByTestId('legend');
  await expect(legend.locator('[data-legend]')).toHaveText(['New', 'Changed', 'Removed', 'Completed', 'Cancelled', 'Suspended']);
  const line = await page.getByTestId('status-line').boundingBox();
  const box = await legend.boundingBox();
  expect(box!.x).toBeGreaterThan(line!.x + line!.width / 2);
  const decoration = (name: string) => legend.locator(`[data-legend="${name}"]`).evaluate((element) => getComputedStyle(element).textDecorationLine);
  expect(await decoration('cancelled')).toContain('line-through');
  expect(await decoration('completed')).not.toContain('line-through');
  const colour = (name: string) => legend.locator(`[data-legend="${name}"] .swatch`).evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(new Set([await colour('new'), await colour('changed'), await colour('removed')]).size).toBe(3);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(legend.locator('[data-legend]')).toHaveText(['Neu', 'Geändert', 'Entfernt', 'Erledigt', 'Abgebrochen', 'Ausgesetzt']);
});

test('TL-009 the follow-up column shows only for OpenTasksWithFollowUp', async ({ page }) => {
  await seed(page, fiveTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByTestId('column-header-followUpDate')).toHaveCount(0);
  await expect(page.getByTestId('cell-followUpDate')).toHaveCount(0);
  await filter(page, 'OpenTasksWithFollowUp').click();
  await expect(page.getByTestId('column-header-followUpDate')).toBeVisible();
  await expect(page.getByTestId('cell-followUpDate')).toHaveCount(3);
  await filter(page, 'ClosedTasksOnly').click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByTestId('column-header-followUpDate')).toHaveCount(0);
});
