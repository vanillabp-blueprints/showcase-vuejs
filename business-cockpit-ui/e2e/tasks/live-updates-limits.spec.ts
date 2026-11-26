// LIVE-025: after a live update, a list limited to workflow modules or business ids shows only rows of these.
// The cockpit has no such list: no request of a task list or of the case list carries workflowModuleIds or
// businessIds, so every list shows every row it gets (ASK-035). This test fails the day a list gets a limit
// without the check of the rows of a live update.
import { expect, test } from '@playwright/test';

type Request = { path: string; body: Record<string, unknown> };
const lists = async (request: import('@playwright/test').APIRequestContext): Promise<Request[]> =>
  (await request.get('/simulator-api/list-requests')).json();

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('LIVE-025 no list is limited to workflow modules or business ids, also not after a live update', async ({ page }) => {
  const task = (id: string) => ({
    id, workflowModuleId: 'orders', bpmnProcessId: 'order', createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z',
    businessId: `B-${id}`, title: { en: `Check ${id}`, de: `Prüfe ${id}` }, read: '2026-11-21T08:00:00Z',
  });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [task('t1')] } });
  await page.goto('/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [task('t1'), task('t2')] } });
  await page.request.post('/simulator-api/publish', { data: { event: 'UserTask', items: [{ workflowModuleId: 'orders', event: { name: 'UserTask', id: 't2', type: 'CREATE', initiatorKind: 'SYSTEM' } }] } });
  await expect(page.getByTestId('task-row')).toHaveCount(2);
  await page.goto('/workflows');
  await expect(page.getByTestId('case-list')).toBeVisible();
  const asked = await lists(page.request);
  expect(asked.length).toBeGreaterThan(1);
  for (const one of asked) {
    expect(one.body, one.path).not.toHaveProperty('workflowModuleIds');
    expect(one.body, one.path).not.toHaveProperty('businessIds');
  }
});
