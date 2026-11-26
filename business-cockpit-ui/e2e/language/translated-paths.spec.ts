import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

const historyLength = (page: Page): Promise<number> => page.evaluate(() => window.history.length);
const switchTo = async (page: Page, code: string, menuIsOpen = false) => {
  if (!menuIsOpen) await page.getByTestId('menu-button').click();
  await page.getByTestId(`language-${code}`).click();
};

const screens: Record<string, string[]> = {
  en: ['/tasks', '/my-tasks', '/tasks/t1', '/workflows', '/workflows/c1'],
  de: ['/aufgaben', '/meine-aufgaben', '/aufgabe/t1', '/vorgaenge', '/vorgang/c1'],
  fr: ['/taches', '/mes-taches', '/tache/t1', '/dossiers', '/dossier/c1'],
  es: ['/tareas', '/mis-tareas', '/tarea/t1', '/casos', '/caso/c1'],
};
const marks = ['task-list', 'task-list', 'task-page', 'case-list', 'case-page'];

test('NAV-014 every screen has a path in every language and the path of any language opens it', async ({ page }) => {
  for (const [code, paths] of Object.entries(screens)) {
    for (const [index, path] of paths.entries()) {
      await page.goto(path);
      await expect(page.getByTestId(marks[index]!).first(), `${code} ${path}`).toBeVisible();
    }
  }
  // the path of one language opens its screen while the interface is in another
  await page.goto('/aufgaben');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('task-list')).toBeVisible();
  await expect(page.getByTestId('toggle-all-tasks')).toContainText('All tasks');
});

test('NAV-015 the path of another language is replaced by the path of the viewer, without a new history entry', async ({ page }) => {
  await page.goto('/');
  const before = await historyLength(page);
  await page.goto('/meine-aufgaben?x=1');
  await expect(page).toHaveURL(/\/my-tasks\?x=1$/);
  await page.goto('/vorgang/c1');
  await expect(page).toHaveURL(/\/workflows\/c1$/);
  // two page loads add two entries; the replacing added none on top
  expect(await historyLength(page)).toBe(before + 2);
  await page.goto('/caso/c%2F1');
  await expect(page).toHaveURL(/\/workflows\/c%2F1$/);
});

test('NAV-016 switching the language replaces the address by the path of the new language, without a new history entry', async ({ page }) => {
  await page.goto('/tasks?q=7');
  const before = await historyLength(page);
  await switchTo(page, 'de');
  await expect(page).toHaveURL(/\/aufgaben\?q=7$/);
  await switchTo(page, 'fr', true);
  await expect(page).toHaveURL(/\/taches\?q=7$/);
  expect(await historyLength(page)).toBe(before);
  await page.goto('/workflows/c1');
  await switchTo(page, 'es');
  await expect(page).toHaveURL(/\/caso\/c1$/);
});

test('NAV-028 links in the interface use the path of the current language and replacing keeps the query', async ({ page, request }) => {
  await request.post('/simulator-api/user-tasks', { data: { userTasks: [{ id: 'abc', title: { en: 'Check' }, businessId: 'b1', workflowModule: 'm', workflowDefinition: 'w', taskDefinition: 't', createdAt: '2026-11-20T08:00:00Z' }] } });
  await page.goto('/tasks?q=7');
  await expect(page.getByTestId('task-title')).toHaveAttribute('href', '/tasks/abc');
  await switchTo(page, 'de');
  await expect(page.getByTestId('task-title')).toHaveAttribute('href', '/aufgabe/abc');
  await expect(page).toHaveURL(/\/aufgaben\?q=7$/);
  await page.goto('/workflows?a=1&b=2');
  await expect(page).toHaveURL(/\/vorgaenge\?a=1&b=2$/);
});

test('I18N-003 the menu offers the languages of app/info below its entries and the choice is kept', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-button').click();
  const offered = await page.locator('[data-testid^="language-"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')));
  expect(offered).toEqual(['language-en', 'language-de', 'language-fr', 'language-es']);
  const logout = (await page.getByTestId('logout').boundingBox())!;
  const entry = (await page.getByTestId('menu-notifications').boundingBox())!;
  const language = (await page.getByTestId('language-de').boundingBox())!;
  expect(language.y).toBeGreaterThan(entry.y);
  expect(language.y).toBeLessThan(logout.y);
  // what app/info does not name is not offered
  await page.request.post('/simulator-api/app-languages', { data: { languages: 'en,fr' } });
  await page.reload();
  await page.getByTestId('menu-button').click();
  await expect(page.locator('[data-testid^="language-"]')).toHaveCount(2);
  await expect(page.getByTestId('language-de')).toHaveCount(0);
  await page.request.post('/simulator-api/app-languages', { data: { languages: 'en,de,fr,es' } });
  await page.reload();
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-fr').click();
  await expect.poll(async () => (await page.request.get('/gui/api/v1/app/current-user/settings/bc:language')).json()).toBe('fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('SET-003 the language, the primary filter and a column width hold in another browser of the same user', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/');
  await switchTo(page, 'de');
  await page.goto('/aufgaben');
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  const edge = (await page.getByTestId('column-resize-businessId').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + 60, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await page.request.get('/gui/api/v1/app/current-user/settings/bc:tasks:all:width:businessId')).status()).toBe(200);
  const wide = (await page.getByTestId('column-header-businessId').boundingBox())!.width;
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:' + (process.env.SIMULATOR_PORT ?? 8099), viewport: { width: 1600, height: 800 } });
  const second = await other.newPage();
  await second.goto('/');
  await expect(second.locator('html')).toHaveAttribute('lang', 'de');
  await second.goto('/aufgaben');
  await expect(second.getByTestId('primary-filter-ClosedTasksOnly')).toHaveClass(/v-btn--active/);
  await expect.poll(async () => (await second.getByTestId('column-header-businessId').boundingBox())?.width).toBeCloseTo(wide, -1);
  await other.close();
});
