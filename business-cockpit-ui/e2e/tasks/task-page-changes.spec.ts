// TF-011, TF-037: the page of an open task tells, with a toast, that another user changed it.
import { expect, test, type Page } from '@playwright/test';

const ben = { id: 'ben', display: 'Ben Support', displayShort: 'Ben', email: 'ben@acme.example' };
const cara = { id: 'cara', display: 'Cara Ops', displayShort: 'Cara', email: 'cara@acme.example' };
const task = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 't1', workflowModuleId: 'react-module', bpmnProcessId: 'areas', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json',
  createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:00:00Z', businessId: 'B-t1', title: { en: 'Check t1' }, read: true,
  assignee: { id: 'anna', display: 'Anna Sales', displayShort: 'Anna' }, ...extra,
});
const seed = async (page: Page, tasks: Record<string, unknown>[]) => {
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: tasks } });
};
const publish = (page: Page, id: string, initiatorKind: string, initiator?: string) =>
  page.request.post('/simulator-api/publish', { data: { event: 'UserTask', items: [{ workflowModuleId: 'react-module', event: { name: 'UserTask', id, type: 'UPDATE', initiatorKind, initiator } }] } });
const toast = (page: Page) => page.getByTestId('toast');

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('TF-011 a change by another user shows a sticky toast with the short name of the assignee or a candidate user, else the user id', async ({ page }) => {
  await seed(page, [task({ candidateUsers: [cara] })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  await seed(page, [task({ assignee: ben, candidateUsers: [cara] })]);
  await publish(page, 't1', 'USER', 'ben');
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toContainText('Ben');
  await expect(toast(page)).not.toContainText('Ben Support');
  await page.waitForTimeout(6000);
  await expect(toast(page)).toHaveCount(1);
  await toast(page).click();
  await expect(toast(page)).toHaveCount(0);
  await publish(page, 't1', 'USER', 'cara');
  await expect(toast(page)).toContainText('Cara');
  await toast(page).click();
  await publish(page, 't1', 'USER', 'dora');
  await expect(toast(page)).toContainText('dora');
});

test('TF-037 the toast comes from the event: only USER of another user, for this task; the task is read again whatever the initiator is', async ({ page }) => {
  await seed(page, [task({ title: { en: 'Check t1' } })]);
  await page.goto('/tasks/t1');
  await expect(page.getByTestId('react-body')).toBeVisible();
  const reads = () => page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => /\/usertask\/t1/.test(entry.name)).length);
  let before = await reads();
  await publish(page, 't1', 'USER', 'anna');
  await expect.poll(reads).toBeGreaterThan(before);
  before = await reads();
  await publish(page, 't1', 'SYSTEM');
  await expect.poll(reads).toBeGreaterThan(before);
  before = await reads();
  await publish(page, 't1', 'COCKPIT');
  await expect.poll(reads).toBeGreaterThan(before);
  await publish(page, 'other-task', 'USER', 'ben');
  await page.waitForTimeout(500);
  await expect(toast(page)).toHaveCount(0);
  await publish(page, 't1', 'USER', 'ben');
  await expect(toast(page)).toHaveCount(1);
});
