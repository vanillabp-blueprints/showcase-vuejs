import { expect, test, type Page } from '@playwright/test';

type SimulatedTask = Record<string, unknown>;
type ListRequest = { path: string; body: Record<string, unknown> };

const person = (id: string, display: string, displayShort: string) => ({ id, display, displayShort, email: `${id}@acme.example` });
const anna = person('anna', 'Anna Sales', 'Anna');
const ben = person('ben', 'Ben Support', 'Ben');

const task = (id: string, extra: SimulatedTask = {}): SimulatedTask => ({
  id,
  workflowModuleId: 'orders',
  bpmnProcessId: 'order',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  workflowTitle: { en: 'Order', de: 'Bestellung' },
  title: { en: `Check ${id}`, de: `Prüfe ${id}` },
  dueDate: '2026-12-01T10:30:00Z',
  ...extra,
});

const seed = (page: Page, tasks: SimulatedTask[]) => page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
const listRequests = async (page: Page): Promise<ListRequest[]> => (await page.request.get('/simulator-api/list-requests')).json();

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

const threeTasks = [
  task('t1', { assignee: anna }),
  task('t2', { assignee: ben }),
  task('t3', { candidateUsers: [anna, ben] }),
];

test('NAV-001 /tasks shows all user tasks the user may see, in every language of the paths', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  expect((await listRequests(page)).map((request) => request.path)).toContain('/gui/api/v1/usertask');
  await page.goto('/aufgaben');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
});

test('NAV-002 /my-tasks shows the user tasks where the user is the assignee', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/my-tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('Check t1');
  expect((await listRequests(page)).map((request) => request.path)).toContain('/gui/api/v1/current-user/usertask');
  await page.goto('/meine-aufgaben');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
});

test('TL-008 the fixed columns are the ones from the interview, in its order', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(3);
  const headers = page.locator('[data-testid^="column-header-"]');
  expect(await headers.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-testid')))).toEqual([
    'column-header-id', 'column-header-businessId', 'column-header-caseKind', 'column-header-title', 'column-header-dueDate',
    'column-header-assignee', 'column-header-candidateUsers', 'column-header-note', 'column-header-followUpDate', 'column-header-endedAt',
  ]);
  await expect(headers).toHaveText(['Id', 'Business ID', 'Case kind', 'Title', 'Due', 'Assignee', 'Candidate users', 'Notes', 'Follow-up', 'Ended']);
  const first = page.getByTestId('task-row').first();
  await expect(first.getByTestId('cell-businessId')).toHaveText('B-t1');
  await expect(first.getByTestId('cell-caseKind')).toHaveText('Order');
  await expect(page.getByTestId('task-row').nth(2).getByTestId('cell-candidateUsers')).toHaveText('Anna, Ben');
});

test('TL-012 the title is a real link that opens the task page, and open in new tab works on it', async ({ page, context }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  const link = page.getByTestId('task-title').first();
  expect(await link.evaluate((element) => element.tagName)).toBe('A');
  await expect(link).toHaveAttribute('href', '/tasks/t1');
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })]);
  await opened.waitForLoadState();
  expect(new URL(opened.url()).pathname).toBe('/tasks/t1');
  await expect(page).toHaveURL(/\/tasks$/);
  await link.click();
  await expect(page).toHaveURL(/\/tasks\/t1$/);
});

test('TL-013 the assignee cell shows the short form, and the mouse-over the long form, the user id and the email address', async ({ page }) => {
  await seed(page, threeTasks);
  await page.goto('/tasks');
  const cell = page.getByTestId('task-row').first().getByTestId('cell-assignee');
  await expect(cell).toHaveText('Anna');
  await cell.hover();
  const details = page.getByTestId('assignee-details').filter({ hasText: 'Anna Sales' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('Anna Sales');
  await expect(details).toContainText('anna');
  await expect(details).toContainText('anna@acme.example');
});
