// I18N-008: every toast is in the language of the user: the cockpit's own and those a part passes to showNotification.
import { expect, test, type Page } from '@playwright/test';

const JS = 'text/javascript';
const at = '2026-11-20T08:00:00Z';
const toast = (page: Page) => page.getByTestId('toast');
const switchTo = async (page: Page, code: string) => {
  await page.getByTestId('menu-button').click();
  await page.getByTestId(`language-${code}`).click();
};
const publish = (page: Page, event: string, id: string) =>
  page.request.post('/simulator-api/publish', { data: { event, items: [{ workflowModuleId: 'fake-module', event: { name: event, id, type: 'UPDATE', initiatorKind: 'USER', initiator: 'ben' } }] } });

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

/** A module with one header part which tells the toast in the language it got. */
async function moduleWithNote(page: Page) {
  const greetings = { en: 'Saved', de: 'Gespeichert', fr: 'Enregistré', es: 'Guardado' };
  const manifest = { manifestVersion: 1, entries: { Header: 'Header.js', Views: 'Views.js' }, buildVersion: '1', buildTimestamp: '2026-11-25T00:00:00Z' };
  const views = `customElements.define('fake-module-b1-note', class extends HTMLElement {
    connectedCallback() { }
    say() { this.showNotification({ level: 'info', text: ${JSON.stringify(greetings)}[this.language] ?? 'no language', sticky: true }); }
  });`;
  const files: Record<string, string> = {
    'bc-manifest.json': JSON.stringify(manifest),
    'Header.js': `export const header = () => ({ entry: 'Views', element: 'fake-module-b1-note' });`,
    'Views.js': views,
  };
  await page.route('**/wm/fake-module/**', (route) => {
    const body = files[new URL(route.request().url()).pathname.replace('/wm/fake-module/', '')];
    return body === undefined ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: file(body), body });
  });
  await page.request.post('/bpms/api/v1_1/workflow-module/fake-module', { data: { uri: '/bc-manifest.json' } });
}
const file = (body: string) => (body.startsWith('{') ? 'application/json' : JS);

test('I18N-008 the cockpit toasts and the toasts of a part come in the language of the user', async ({ page }) => {
  await moduleWithNote(page);
  const base = { workflowModuleId: 'fake-module', bpmnProcessId: 'p', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json', createdAt: at, updatedAt: at };
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [{ ...base, id: 't1', title: { en: 'Check t1' } }] } });
  await page.request.post('/simulator-api/workflows', { data: { workflows: [{ ...base, id: 'c1', businessId: 'B-c1', title: { en: 'Ride c1' } }] } });

  const say = () => page.locator('fake-module-b1-note').evaluate((element: any) => element.say());
  const own = { en: 'changed this task', de: 'hat diese Aufgabe geändert', fr: 'a modifié cette tâche', es: 'ha cambiado esta tarea' };
  const part = { en: 'Saved', de: 'Gespeichert', fr: 'Enregistré', es: 'Guardado' };
  const taskPath = { en: '/tasks/t1', de: '/aufgabe/t1', fr: '/tache/t1', es: '/tarea/t1' };

  // the default language and then each language the user chooses: the part's toast, on the list with the header part
  // of the module, and the cockpit's own toast, on the page of the task
  await page.goto('/tasks');
  await expect(page.locator('fake-module-b1-note')).toHaveCount(1);
  for (const code of ['en', 'de', 'fr', 'es'] as const) {
    if (code !== 'en') await switchTo(page, code);
    await say();
    await expect(toast(page)).toHaveText(part[code]);
    await toast(page).click();
    await page.goto(taskPath[code]);
    await expect(page.getByTestId('task-page')).toBeVisible();
    await publish(page, 'UserTask', 't1');
    await expect(toast(page)).toContainText(own[code]);
    await toast(page).click();
    await page.goto('/tasks');
    await expect(page.locator('fake-module-b1-note')).toHaveCount(1);
  }

  // the toast of a case page, too
  await switchTo(page, 'de');
  await page.goto('/vorgang/c1');
  await expect(page.getByTestId('case-page')).toBeVisible();
  await publish(page, 'Workflow', 'c1');
  await expect(toast(page)).toContainText('hat diesen Vorgang geändert');
});
