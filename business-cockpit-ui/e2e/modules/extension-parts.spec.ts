// EXT-012, EXT-013, EXT-014, EXT-018, EXT-023, EXT-060: what a module puts into the cockpit: its parts, its dialogs and its toasts.
// Pages are not an extension point of this cockpit (Q-EXTENSION-POINTS: Header yes, Pages no), so nothing here is a page of a module.
import { expect, test, type Page } from '@playwright/test';
import { THEME_TOKENS } from '../../packages/bc-types/src/index';
import { lightValues } from '../../packages/bc-theme/src/index';

const JS = 'text/javascript';
const register = (page: Page, id: string) => page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });

/** A module with a header part which has nothing but the functions of the cockpit, and a dialog with an OK and a cancel button. */
async function partsModule(page: Page) {
  const manifest = { manifestVersion: 1, entries: { Header: 'Header.js', Views: 'Views.js' }, buildVersion: '1', buildTimestamp: '2026-11-25T00:00:00Z' };
  const views = `
customElements.define('fake-module-b1-note', class extends HTMLElement {});
customElements.define('fake-module-b1-dialog', class extends HTMLElement {
  connectedCallback() {
    for (const [id, value] of [['ok', 'ok-value'], ['cancel', undefined]]) {
      const button = this.appendChild(document.createElement('button'));
      button.dataset.testid = 'dialog-' + id;
      button.textContent = id;
      button.addEventListener('click', () => this.closeDialog(value));
    }
  }
});`;
  const files: Record<string, string> = {
    'bc-manifest.json': JSON.stringify(manifest),
    'Header.js': `export const header = () => ({ entry: 'Views', element: 'fake-module-b1-note' });`,
    'Views.js': views,
  };
  await page.route('**/wm/fake-module/**', (route) => {
    const body = files[new URL(route.request().url()).pathname.replace('/wm/fake-module/', '')];
    return body === undefined ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: JS, body });
  });
  await register(page, 'fake-module');
  await page.goto('/tasks');
  await expect(page.locator('fake-module-b1-note')).toHaveCount(1);
}

/** Shows a toast the way a part does: through the function of its element. */
const notify = (page: Page, level: string, text: string, sticky = false) =>
  page.locator('fake-module-b1-note').evaluate((element: any, notification) => element.showNotification(notification), { level, text, sticky });
const openDialog = (page: Page) => {
  void page.locator('fake-module-b1-note').evaluate((element: any) => {
    (window as any).dialogResult = 'pending';
    return element.openDialog({ element: 'fake-module-b1-dialog', entry: 'Views' }).then((result: unknown) => { (window as any).dialogResult = { result }; });
  });
};

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('EXT-012 every extension point and area of the interview shows the parts of the test modules', async ({ page }) => {
  // the Header, in the bar of the cockpit: the parts of the React and the Angular module
  await register(page, 'react-module');
  await register(page, 'angular-module');
  await register(page, 'vue-module');
  await page.goto('/tasks');
  await expect(page.getByTestId('module-header').getByTestId('react-header')).toHaveText('React risk');
  await expect(page.getByTestId('module-header').getByTestId('angular-header')).toHaveText('Angular tickets');
  // the areas of the page of a user task: body, information and actions, from the React module
  const at = '2026-11-20T08:00:00Z';
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [{ id: 't1', workflowModuleId: 'react-module', bpmnProcessId: 'areas', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json', createdAt: at, updatedAt: at, title: { en: 'Check t1' }, assignee: { id: 'anna', display: 'Anna Sales', displayShort: 'Anna', email: 'anna@acme.example' } }] } });
  await page.goto('/tasks/t1');
  for (const area of ['body', 'information', 'actions']) await expect(page.getByTestId(`react-${area}`)).toBeVisible();
  // the page of a case, from the Vue module, which names the whole page (`all`)
  await page.request.post('/simulator-api/workflows', { data: { workflows: [{ id: 'c1', workflowModuleId: 'vue-module', bpmnProcessId: 'ride', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json', createdAt: at, updatedAt: at, businessId: 'B-c1', title: { en: 'Ride c1' } }] } });
  await page.goto('/workflows/c1');
  await expect(page.getByTestId('vue-all')).toBeVisible();
});

test('EXT-013 the custom properties of the theme reach the shadow DOM of a part, in the light and in the dark mode', async ({ page }) => {
  await register(page, 'react-module');
  await page.goto('/tasks');
  const badge = page.getByTestId('react-header');
  await expect(badge).toBeVisible();
  const tokens = () => badge.evaluate((element, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(element).getPropertyValue(name).trim()])), [...THEME_TOKENS]);
  expect(await badge.evaluate((element) => element.getRootNode() instanceof ShadowRoot)).toBe(true);
  expect(await tokens()).toEqual(Object.fromEntries(THEME_TOKENS.map((name) => [name, lightValues[name]])));
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await tokens();
  expect(dark['--bc-color-background']).toBe('#121212');
  expect(dark['--bc-color-text']).toBe('#ffffff');
  expect(Object.values(dark).every((value) => value !== '')).toBe(true);
});

test('EXT-014 when the language changes every visible web component gets the new language', async ({ page }) => {
  await register(page, 'react-module');
  await partsModule(page);
  const languages = () => page.locator('[data-testid="module-header"] [data-testid="module-part"] > span:first-child > *').evaluateAll((all: any[]) => all.map((element) => element.language));
  expect(await languages()).toEqual(['en', 'en']);
  await page.getByTestId('menu-button').click();
  for (const code of ['de', 'fr']) {
    await page.getByTestId(`language-${code}`).click();
    await expect.poll(languages).toEqual([code, code]);
  }
});

test('EXT-018 a part opens a modal dialog and the promise resolves with what the dialog closed with', async ({ page }) => {
  await partsModule(page);
  openDialog(page);
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('fake-module-b1-dialog')).toHaveCount(1);
  expect(await dialog.evaluate((element: HTMLDialogElement) => element.matches(':modal'))).toBe(true);
  await dialog.getByTestId('dialog-ok').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).dialogResult)).toEqual({ result: 'ok-value' });
  openDialog(page);
  await page.locator('dialog[open]').getByTestId('dialog-cancel').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).dialogResult)).toEqual({ result: undefined });
  // the user closes it with Escape: the part is not left waiting
  openDialog(page);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).dialogResult)).toEqual({ result: undefined });
});

test('EXT-023 a toast has the look of its level, a sticky one stays until clicked, another goes away by itself', async ({ page }) => {
  await page.clock.install();
  await partsModule(page);
  const levels = ['info', 'success', 'warning', 'error'];
  for (const level of levels) await notify(page, level, `a ${level}`, level === 'error');
  const toasts = page.getByTestId('toast');
  await expect(toasts).toHaveCount(4);
  const looks = await toasts.evaluateAll((all) => all.map((toast) => [toast.getAttribute('data-level'), getComputedStyle(toast).backgroundColor, getComputedStyle(toast).color]));
  expect(looks.map(([level]) => level).sort()).toEqual([...levels].sort());
  expect(new Set(looks.map(([, background]) => background)).size).toBe(4);
  expect(await page.getByTestId('toast').filter({ hasText: 'a error' }).getAttribute('role')).toBe('alert');
  await page.clock.fastForward(60_000);
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toHaveText(/a error/);
  await toasts.click();
  await expect(toasts).toHaveCount(0);
});

test('EXT-060 a toast lies above a modal dialog and a sticky one can be clicked away while the dialog is open', async ({ page }) => {
  await partsModule(page);
  openDialog(page);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await notify(page, 'warning', 'look here', true);
  const toast = page.getByTestId('toast');
  await expect(toast).toBeVisible();
  const above = await toast.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!top && (element === top || element.contains(top) || top.getRootNode() === element.getRootNode() && element.contains(top));
  });
  expect(above).toBe(true);
  await toast.click({ timeout: 3000 });
  await expect(toast).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1); // the dialog is still open
  // a toast which comes while the dialog is closed is in the page again
  await page.locator('dialog[open]').getByTestId('dialog-ok').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await notify(page, 'info', 'after', true);
  await expect(toast).toBeVisible();
  await toast.click();
  await expect(toast).toHaveCount(0);
});
