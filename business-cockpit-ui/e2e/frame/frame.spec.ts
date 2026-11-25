import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type CountRequest = { path: string; mode?: string; keys: string[] };

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
  await request.post('/simulator-api/counts', { data: { myTasks: 3, allTasks: 7, cases: 5 } });
});

const countRequests = async (page: Page): Promise<CountRequest[]> =>
  (await page.request.get('/simulator-api/count-requests')).json();

const openMenu = async (page: Page) => {
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('menu')).toBeVisible();
};

test('NAV-006 the header toggle shows My tasks, All tasks and Cases with their counts and opens the list without narrowing', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('toggle');
  await expect(toggle.getByTestId('toggle-my-tasks')).toHaveText('My tasks (3)');
  await expect(toggle.getByTestId('toggle-all-tasks')).toHaveText('All tasks (7)');
  await expect(toggle.getByTestId('toggle-cases')).toHaveText('Cases (5)');
  await expect(toggle.getByTestId('toggle-my-tasks')).toHaveAttribute('href', '/my-tasks');
  await expect(toggle.getByTestId('toggle-all-tasks')).toHaveAttribute('href', '/tasks');
  await expect(toggle.getByTestId('toggle-cases')).toHaveAttribute('href', '/workflows');
  await toggle.getByTestId('toggle-all-tasks').click();
  await expect(page).toHaveURL(/\/tasks$/);
});

test('NAV-009 every text uses the word Case from the interview and no other word for it', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const texts = await page.locator('body').innerText();
  expect(texts).toContain('Cases');
  expect(texts).not.toMatch(/workflow|process|dossier|vorgang|instance/i);
  // the word stands in one place of the source, the texts of the user interface
  const messages = readFileSync('packages/ui/src/i18n/en.ts', 'utf8');
  expect(messages).toMatch(/Cases/);
  expect(messages).not.toMatch(/Process|Workflow|Instance/);
  await page.getByTestId('language-de').click();
  await expect(page.getByTestId('toggle-cases')).toHaveText('Vorgänge (5)');
});

test('NAV-010 counts are asked again on open, on an update event once, and on return to the tab, always with the default primary filter', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('toggle-cases')).toHaveText('Cases (5)');
  const opened = await countRequests(page);
  // three counts: my tasks and all tasks with the default filter of Q-PRIMARY-FILTERS, cases with the one of Q-WORKFLOW-FILTERS
  expect(opened.filter((r) => r.path.endsWith('/current-user/usertask/count')).map((r) => r.mode)).toEqual(['OpenTasksWithoutFollowUp']);
  expect(opened.filter((r) => r.path === '/gui/api/v1/usertask/count').map((r) => r.mode)).toEqual(['OpenTasksWithoutFollowUp']);
  expect(opened.filter((r) => r.path === '/gui/api/v1/workflow/count').map((r) => r.mode)).toEqual(['InProgress']);

  // a primary filter chosen last in a list never changes what the toggle asks
  await page.request.put('/gui/api/v1/app/current-user/settings/bc:tasks:primaryFilter', { data: JSON.stringify('ClosedTasksOnly'), headers: { 'content-type': 'application/json' } });

  // one update event of the kind UserTask: one delivery, one new request per user task count, none for cases
  await request.post('/simulator-api/counts', { data: { myTasks: 4, allTasks: 8, cases: 5 } });
  await request.post('/simulator-api/publish', { data: { event: 'UserTask', elements: 3 } });
  await expect(page.getByTestId('toggle-my-tasks')).toHaveText('My tasks (4)');
  await expect(page.getByTestId('toggle-all-tasks')).toHaveText('All tasks (8)');
  await page.waitForTimeout(300);
  const afterEvent = await countRequests(page);
  expect(afterEvent.length - opened.length).toBe(2);
  expect(afterEvent.slice(opened.length).every((r) => r.path.includes('usertask'))).toBe(true);

  // an event of the kind Workflow asks the count of cases only
  await request.post('/simulator-api/counts', { data: { myTasks: 4, allTasks: 8, cases: 6 } });
  await request.post('/simulator-api/publish', { data: { event: 'Workflow', elements: 1 } });
  await expect(page.getByTestId('toggle-cases')).toHaveText('Cases (6)');
  await page.waitForTimeout(300);
  const afterWorkflow = await countRequests(page);
  expect(afterWorkflow.length - afterEvent.length).toBe(1);

  // return to the tab: all three again
  await request.post('/simulator-api/counts', { data: { myTasks: 1, allTasks: 2, cases: 3 } });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('toggle-my-tasks')).toHaveText('My tasks (1)');
  await expect(page.getByTestId('toggle-all-tasks')).toHaveText('All tasks (2)');
  await expect(page.getByTestId('toggle-cases')).toHaveText('Cases (3)');
  const afterReturn = await countRequests(page);
  expect(afterReturn.length - afterWorkflow.length).toBe(3);
  // no request ever asked for another mode
  expect(afterReturn.every((r) => ['OpenTasksWithoutFollowUp', 'InProgress'].includes(r.mode ?? ''))).toBe(true);
});

test('NAV-011 the menu starts with a round badge with the initials and the short form, and details on mouse-over of the badge', async ({ page, request }) => {
  await page.goto('/');
  await openMenu(page);
  const badge = page.getByTestId('user-badge');
  await expect(badge).toHaveText('AS');
  await expect(page.getByTestId('user-short')).toHaveText('Anna');
  const box = (await badge.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  expect(await badge.evaluate((element) => getComputedStyle(element).borderRadius)).toMatch(/50%|9999|\d{2,}px/);
  expect(await page.locator('[data-testid=user-badge] img').count()).toBe(0);
  await badge.hover();
  const details = page.getByTestId('user-details');
  await expect(details).toContainText('Anna Sales');
  await expect(details).toContainText('anna');
  await expect(details).toContainText('anna@acme.example');
  // without a long form the initials come from the user id
  await request.post('/simulator-api/current-user', { data: { display: null, displayShort: null } });
  await page.reload();
  await openMenu(page);
  await expect(page.getByTestId('user-badge')).toHaveText('A');
});

test('NAV-013 in the other views the header shows the title, the toggle, the user and the menu button, and nothing else', async ({ page }) => {
  await page.goto('/notifications');
  const header = page.getByTestId('header');
  await expect(header.getByTestId('title')).toHaveText('Business Cockpit of acme');
  await expect(header.getByTestId('title')).toHaveAttribute('href', '/');
  await expect(header.getByTestId('toggle')).toBeVisible();
  await expect(header.getByTestId('current-user')).toHaveText('Anna Sales');
  await expect(header.getByTestId('menu-button')).toBeVisible();
  const controls = await header.locator('a, button, input, select').evaluateAll((all) =>
    all.map((element) => element.getAttribute('data-testid')));
  expect(controls).toEqual(['title', 'toggle-my-tasks', 'toggle-all-tasks', 'toggle-cases', 'menu-button']);
});

test('NAV-029 below the user the menu shows the screens, the notification settings, the language switch and at the end the logout', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const order = await page.getByTestId('menu').locator('[data-menu-part]').evaluateAll((all) =>
    all.map((element) => element.getAttribute('data-menu-part')));
  expect(order).toEqual(['user', 'tasks', 'my-tasks', 'cases', 'notifications', 'language', 'logout']);
  await expect(page.getByTestId('menu-tasks')).toHaveText('All tasks');
  await expect(page.getByTestId('menu-my-tasks')).toHaveText('My tasks');
  await expect(page.getByTestId('menu-cases')).toHaveText('Cases');
  await expect(page.getByTestId('menu-notifications')).toHaveText('Notifications');
  await expect(page.getByTestId('menu-notifications')).toHaveAttribute('href', '/notifications');
  for (const language of ['en', 'de', 'fr', 'es']) await expect(page.getByTestId(`language-${language}`)).toBeVisible();
  await expect(page.getByTestId('logout')).toHaveAttribute('href', '/logout');
});
