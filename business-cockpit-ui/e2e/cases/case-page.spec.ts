// NAV-004, TF-013, WP-001, WP-003, WP-007, WP-008: a clerk opens the page of a case.
import { expect, test, type Page } from '@playwright/test';

type Simulated = Record<string, unknown>;

// a case of the vue test module, whose page function names the whole page (`all`)
const aCase = (id: string, extra: Simulated = {}): Simulated => ({
  id,
  workflowModuleId: 'vue-module',
  bpmnProcessId: 'ride',
  uiUriType: 'ES_MODULES',
  uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  businessId: `B-${id}`,
  title: { en: `Ride ${id}`, de: `Fahrt ${id}` },
  ...extra,
});
const aTask = (id: string, workflowId: string, extra: Simulated = {}): Simulated => ({
  id,
  workflowId,
  workflowModuleId: 'vue-module',
  bpmnProcessId: 'ride',
  uiUriType: 'ES_MODULES',
  uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z',
  updatedAt: '2026-11-20T08:00:00Z',
  title: { en: `Check ${id}` },
  ...extra,
});

const seed = async (page: Page, workflows: Simulated[], userTasks: Simulated[] = [], moduleId = 'vue-module') => {
  await page.request.post(`/bpms/api/v1_1/workflow-module/${moduleId}`, { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/workflows', { data: { workflows } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks } });
};

// A module whose page function names one web component for each area; the body one asks the cockpit for the user tasks of its case,
// the one of a task has a button for the link from the task to its case.
const JS = 'text/javascript';
async function areasModule(page: Page) {
  const element = { body: 'fake-module-b1-body', information: 'fake-module-b1-information', actions: 'fake-module-b1-actions' };
  const manifest = { manifestVersion: 1, entries: { UserTaskForm: 'UserTaskForm.js', WorkflowPage: 'WorkflowPage.js', Views: 'Views.js' }, buildVersion: '1', buildTimestamp: '2026-11-25T00:00:00Z' };
  const views = `
customElements.define('fake-module-b1-body', class extends HTMLElement {
  connectedCallback() {
    const button = this.appendChild(document.createElement('button'));
    button.dataset.testid = 'get-user-tasks';
    button.textContent = 'tasks';
    const out = this.appendChild(document.createElement('div'));
    out.dataset.testid = 'user-tasks-seen';
    button.addEventListener('click', async () => {
      const tasks = await this.request('workflow.getUserTasks', { workflowId: this.workflow.id, activeOnly: false, limitListAccordingToCurrentUsersPermissions: false });
      out.textContent = tasks.map((task) => task.id).join(',');
    });
  }
});
customElements.define('fake-module-b1-information', class extends HTMLElement { connectedCallback() { this.dataset.testid = 'part-information'; this.textContent = 'information'; } });
customElements.define('fake-module-b1-actions', class extends HTMLElement { connectedCallback() { this.dataset.testid = 'part-actions'; this.textContent = 'actions'; } });
customElements.define('fake-module-b1-task', class extends HTMLElement {
  connectedCallback() {
    const button = this.appendChild(document.createElement('button'));
    button.dataset.testid = 'to-case';
    button.textContent = 'case';
    button.addEventListener('click', () => this.request('userTask.navigateToWorkflow', { userTaskId: this.userTask.id }));
  }
});`;
  const files: Record<string, string> = {
    'bc-manifest.json': JSON.stringify(manifest),
    'UserTaskForm.js': "export const userTaskForm = () => ({ entry: 'Views', element: 'fake-module-b1-task' });",
    'WorkflowPage.js': `export const workflowPage = () => ({ entry: 'Views', element: ${JSON.stringify(element)} });`,
    'Views.js': views,
  };
  await page.route('**/wm/fake-module/**', (route) => {
    const body = files[new URL(route.request().url()).pathname.replace('/wm/fake-module/', '')];
    return body === undefined ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: body.startsWith('{') ? 'application/json' : JS, body, headers: { 'cache-control': 'no-cache' } });
  });
}

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('NAV-004 a deep link to the page of a case, opened in a new browser, shows it after the login, in the path of every language', async ({ page, request }) => {
  await seed(page, [aCase('c1')]);
  const asked = await request.get('/workflows/c1', { maxRedirects: 0 });
  expect(asked.status()).toBe(302);
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  await expect(page.getByTestId('case-page')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/workflows/c1');
  await page.goto('/vorgang/c1');
  await expect(page.getByTestId('case-page')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/vorgang/c1');
});

test('TF-013 the link from a task to its case opens the case page of the cockpit', async ({ page }) => {
  await areasModule(page);
  await seed(page, [aCase('c1', { workflowModuleId: 'fake-module' })], [aTask('t1', 'c1', { workflowModuleId: 'fake-module', assignee: { id: 'anna', display: 'Anna Sales' } })], 'fake-module');
  await page.goto('/tasks/t1');
  await page.getByTestId('to-case').click();
  await expect(page.getByTestId('case-page')).toBeVisible();
  await expect(page.getByTestId('part-actions')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/workflows/c1');
});

test('WP-001 opening a case loads it and shows the web component the module page function names', async ({ page }) => {
  await seed(page, [aCase('c1')]);
  await page.goto('/workflows');
  await page.getByTestId('case-title').click();
  await expect(page).toHaveURL(/\/workflows\/c1$/);
  await expect(page.getByTestId('vue-all')).toHaveText('Vue all of c1');
  await expect(page.getByTestId('case-page')).toHaveAttribute('data-state', 'drawn');
  // a case which does not exist says so and draws nothing
  await page.goto('/workflows/nope');
  await expect(page.getByTestId('case-note')).toBeVisible();
  await expect(page.getByTestId('vue-all')).toHaveCount(0);
});

test('WP-003 the case page gets getUserTasks and it returns the user tasks of the case', async ({ page }) => {
  await areasModule(page);
  await seed(page, [aCase('c1', { workflowModuleId: 'fake-module' }), aCase('c2', { workflowModuleId: 'fake-module' })],
    [aTask('t1', 'c1', { workflowModuleId: 'fake-module' }), aTask('t2', 'c1', { workflowModuleId: 'fake-module' }), aTask('t3', 'c2', { workflowModuleId: 'fake-module' })], 'fake-module');
  await page.goto('/workflows/c1');
  await page.getByTestId('get-user-tasks').click();
  await expect(page.getByTestId('user-tasks-seen')).toHaveText('t1,t2');
});

test('WP-007 the case page has no header, footer nor red back button; the application header shows the case note and no task actions', async ({ page }) => {
  await seed(page, [aCase('c1', { note: 'call back' })]);
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('vue-all')).toBeVisible();
  const casePage = page.getByTestId('case-page');
  await expect(casePage.locator('header, footer')).toHaveCount(0);
  await expect(page.getByTestId('back-to-list')).toHaveCount(0);
  await expect(page.getByTestId('task-actions')).toHaveCount(0);
  const header = page.getByTestId('header');
  await expect(header.getByTestId('case-actions')).toBeVisible();
  await expect(header.getByTestId('case-note-input')).toHaveValue('call back');
  // the interview names the note as the only action and no information in the header
  await expect(header.getByTestId('case-actions').locator('button, input')).toHaveCount(1);
  await header.getByTestId('case-note-input').fill('wait for the driver');
  await header.getByTestId('case-note-input').press('Enter');
  await expect.poll(async () => (await (await page.request.get('/gui/api/v1/workflow/c1')).json()).note).toBe('wait for the driver');
  await expect(page.getByTestId('menu-button')).toBeVisible();
});

test('WP-008 the case page shows one web component or the areas from the interview, as the page function returns', async ({ page }) => {
  await areasModule(page);
  await seed(page, [aCase('c1', { workflowModuleId: 'fake-module' }), aCase('v1')], [], 'fake-module');
  await page.request.post('/bpms/api/v1_1/workflow-module/vue-module', { data: { uri: '/bc-manifest.json' } });
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('part-actions')).toBeVisible();
  await expect(page.locator('[data-testid="case-page"] [data-area]')).toHaveCount(3);
  await expect(page.locator('[data-testid="case-page"] [data-area]')).toHaveText(['tasks', 'information', 'actions']);
  const [body, information, actions] = await Promise.all(['body', 'information', 'actions'].map((area) => page.locator(`[data-area="${area}"]`).boundingBox()));
  expect(body!.x).toBeLessThan(information!.x);
  expect(information!.y).toBeLessThan(actions!.y);
  await page.goto('/workflows/v1');
  await expect(page.getByTestId('vue-all')).toBeVisible();
  await expect(page.locator('[data-testid="case-page"] [data-area]')).toHaveCount(1);
  await expect(page.locator('[data-area="all"]')).toHaveCount(1);
});
