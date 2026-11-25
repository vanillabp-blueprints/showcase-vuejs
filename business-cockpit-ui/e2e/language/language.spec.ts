import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { formatDate, formatNumber } from '../../packages/ui/src/i18n/format';
import { pickTranslation } from '../../packages/ui/src/i18n/translatable';

const languages = ['en', 'de', 'fr', 'es'];
const i18nFolder = 'packages/ui/src/i18n';

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
  await request.post('/simulator-api/counts', { data: { myTasks: 1234567, allTasks: 7, cases: 5 } });
});

test('NAV-031 the header shows the title of app/info at its left as a link to the start page, also on the page of a user task', async ({ page }) => {
  for (const path of ['/', '/tasks/some-task', '/aufgabe/some-task']) {
    await page.goto(path);
    const title = page.getByTestId('title');
    await expect(title).toHaveText('Business Cockpit of acme');
    await expect(title).toHaveAttribute('href', '/');
    const header = await page.getByTestId('header').boundingBox();
    const titleBox = await title.boundingBox();
    const toggleBox = await page.getByTestId('toggle').boundingBox();
    expect(titleBox!.x).toBeLessThan(toggleBox!.x);
    expect(titleBox!.x - header!.x).toBeLessThan(40);
  }
  await page.goto('/tasks/some-task');
  await page.getByTestId('title').click();
  await expect(page).toHaveURL(/\/$/);
});

test('NAV-032 every control of header and menu is a Vuetify component, an action is never a plain link', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.locator('header')).toHaveClass(/v-toolbar/);
  await expect(page.getByTestId('menu-button')).toHaveClass(/v-btn--icon/);
  await expect(page.getByTestId('toggle')).toHaveClass(/v-btn-group/);
  for (const id of ['toggle-my-tasks', 'toggle-all-tasks', 'toggle-cases', 'language-en', 'language-de']) {
    await expect(page.getByTestId(id)).toHaveClass(/v-btn/);
  }
  for (const id of ['menu-tasks', 'menu-my-tasks', 'menu-cases', 'menu-notifications', 'logout']) {
    await expect(page.getByTestId(id)).toHaveClass(/v-list-item/);
  }
  await expect(page.getByTestId('user-badge')).toHaveClass(/v-avatar/);
  // a plain anchor of the page is only the title, which leads to the start page
  const plain = await page.locator('header a:not([class*="v-"]):not([data-testid="title"]), nav a:not([class*="v-"])').count();
  expect(plain).toBe(0);
  const plainTitle = await page.locator('a[data-testid="title"]').count();
  expect(plainTitle).toBe(1);
});

test('I18N-001 every language has its own file with the same keys and no text stays in the components', async () => {
  const keysOf = (source: string): string[] =>
    [...source.matchAll(/^\s*([a-zA-Z]+):/gm)].map((match) => match[1]).sort();
  const english = keysOf(readFileSync(`${i18nFolder}/en.ts`, 'utf8'));
  expect(english.length).toBeGreaterThan(5);
  for (const language of languages) {
    expect(existsSync(`${i18nFolder}/${language}.ts`), `${language}.ts`).toBe(true);
    expect(keysOf(readFileSync(`${i18nFolder}/${language}.ts`, 'utf8'))).toEqual(english);
  }
  const app = readFileSync('packages/ui/src/App.vue', 'utf8');
  for (const word of ['My tasks', 'All tasks', 'Log out', 'Notifications', 'Language']) expect(app).not.toContain(word);
});

test('I18N-002 the user interface starts in the default language English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('toggle-all-tasks')).toContainText('All tasks');
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('logout')).toContainText('Log out');
});

test('I18N-004 a missing translation falls back to the default language, then to the first language there is', async () => {
  expect(pickTranslation({ de: 'Hallo', en: 'Hello' }, 'fr')).toBe('Hello');
  expect(pickTranslation({ de: 'Hallo', fr: 'Salut' }, 'es')).toBe('Hallo');
  expect(pickTranslation({ es: 'Hola', de: 'Hallo' }, 'fr')).toBe('Hola');
  expect(pickTranslation({ de: 'Hallo', en: 'Hello' }, 'de')).toBe('Hallo');
  expect(pickTranslation({ de: '', en: 'Hello' }, 'de')).toBe('Hello');
  expect(pickTranslation({}, 'de')).toBe('');
});

test('I18N-005 numbers and dates are formatted for the chosen language', async ({ page }) => {
  expect(formatNumber(1000000, 'de')).toBe('1.000.000');
  expect(formatNumber(1000000, 'en')).toBe('1,000,000');
  const day = new Date(2026, 10, 25, 14, 30);
  expect(formatDate(day, 'en')).toContain('11/25/2026');
  expect(formatDate(day, 'de')).toContain('25.11.2026');
  expect(formatDate(day, 'fr')).toContain('25/11/2026');
  await page.goto('/');
  await expect(page.getByTestId('toggle-my-tasks')).toHaveText('My tasks (1,234,567)');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(page.getByTestId('toggle-my-tasks')).toHaveText('Meine Aufgaben (1.234.567)');
});
