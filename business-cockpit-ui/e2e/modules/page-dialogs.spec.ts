// EXT-024, EXT-039, EXT-042: the subscription of an area of a page and the dialog a part opens and closes.
// EXT-040 (the conformance test of the kit) is not built in this story, see ASK-037.
import { build } from 'esbuild';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const root = join(new URL('.', import.meta.url).pathname, '../..');
const JS = 'text/javascript';
const register = (page: Page, id: string) => page.request.post(`/bpms/api/v1_1/workflow-module/${id}`, { data: { uri: '/bc-manifest.json' } });

/** Serves the files of the module `fake-module` and counts the requests for each of them. */
async function serve(page: Page, files: Record<string, string>) {
  const fetched: string[] = [];
  await page.route('**/wm/fake-module/**', (route) => {
    const name = new URL(route.request().url()).pathname.replace('/wm/fake-module/', '');
    fetched.push(name);
    const body = files[name];
    return body === undefined ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: JS, body });
  });
  return fetched;
}

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

test('EXT-024 page.subscribe answers with a subscriptionId and after page.unsubscribe nothing is delivered any more', async ({ page }) => {
  const bundle = (await build({
    stdin: { contents: `export * from './packages/bc-module-host/src/index.ts';`, resolveDir: root, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'bc', logLevel: 'silent',
  })).outputFiles[0].text;
  const manifest = { manifestVersion: 1, entries: { UserTaskForm: 'UserTaskForm.js', Views: 'Views.js' } };
  await serve(page, {
    'bc-manifest.json': JSON.stringify(manifest),
    'UserTaskForm.js': `export const userTaskForm = () => ({ entry: 'Views', element: { body: 'fake-module-b1-body', information: 'fake-module-b1-information' } });`,
    'Views.js': `customElements.define('fake-module-b1-body', class extends HTMLElement {});
customElements.define('fake-module-b1-information', class extends HTMLElement {});`,
  });
  await page.goto('/gui/api/v1/app/info');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const host = (window as any).bc.createModuleHost({ actions: {}, context: () => ({ language: 'de', currentUser: { id: 'u1' } }) });
    const drawn = await host.drawPage('fake-module', '/wm/fake-module/', 'UserTaskForm', { id: 't1' }, ['body', 'information'], document.body);
    const seen: unknown[] = [];
    // what the host delivers to the element, whether or not a handler listens
    const hostDelivered: unknown[] = [];
    drawn.information.addEventListener('bc-message', (event: any) => hostDelivered.push(event.detail.message));
    const subscription = drawn.information.receiveMessage((message: unknown) => seen.push(message));
    await subscription.ready;
    await drawn.body.sendTo('information', 'before');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const delivered = [...seen];
    await subscription.unsubscribe();
    await drawn.body.sendTo('information', 'after');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const raw = await drawn.information.request('page.subscribe');
    await drawn.information.request('page.unsubscribe', { subscriptionId: raw.subscriptionId });
    return { delivered, seen, hostDelivered, subscriptionId: raw.subscriptionId };
  });
  expect(result.delivered).toEqual(['before']);
  expect(result.seen).toEqual(['before']);
  expect(result.hostDelivered).toEqual(['before']);
  expect(typeof result.subscriptionId).toBe('string');
  expect(result.subscriptionId).not.toBe('');
});

/** A header part which opens the dialog of `Dialogs.js`; the web component is defined only after `definedAfterMs`. */
async function dialogModule(page: Page, definedAfterMs: number) {
  const manifest = { manifestVersion: 1, entries: { Header: 'Header.js', Views: 'Views.js', Dialogs: 'Dialogs.js' }, buildVersion: '1', buildTimestamp: '2026-11-26T00:00:00Z' };
  const fetched = await serve(page, {
    'bc-manifest.json': JSON.stringify(manifest),
    'Header.js': `export const header = () => ({ entry: 'Views', element: 'fake-module-b1-note' });`,
    'Views.js': `customElements.define('fake-module-b1-note', class extends HTMLElement {});`,
    'Dialogs.js': `setTimeout(() => customElements.define('fake-module-b1-dialog', class extends HTMLElement {
  connectedCallback() {
    this.dataset.testid = 'the-dialog-part';
    window.partLog = ['connected'];
    setTimeout(() => this.closeDialog('done').then(() => window.partLog.push('resolved'), (error) => window.partLog.push(error.code)), 0);
  }
  disconnectedCallback() { window.partLog.push('disconnected'); }
}), ${definedAfterMs});`,
  });
  await register(page, 'fake-module');
  await page.goto('/tasks');
  await expect(page.locator('fake-module-b1-note')).toHaveCount(1);
  return fetched;
}
const openDialog = (page: Page) => page.locator('fake-module-b1-note').evaluate((element: any) => {
  (window as any).dialogResult = 'pending';
  return element.openDialog({ element: 'fake-module-b1-dialog', entry: 'Dialogs' }).then((result: unknown) => { (window as any).dialogResult = { result }; });
});

test('EXT-039 openDialog loads the visual entry when it is needed, waits for the web component and then shows it', async ({ page }) => {
  const fetched = await dialogModule(page, 400);
  expect(fetched.some((name) => name.startsWith('Dialogs'))).toBe(false);
  const opened = openDialog(page);
  // the entry is loaded, the web component is not defined yet: no dialog is shown and no web component is on the page
  expect(await page.getByTestId('the-dialog-part').count()).toBe(0);
  await expect.poll(() => fetched.filter((name) => name.startsWith('Dialogs')).length).toBe(1);
  expect(await page.locator('dialog[open]').count()).toBe(0);
  await opened;
  expect(await page.evaluate(() => (window as any).dialogResult)).toEqual({ result: 'done' });
  expect(fetched.filter((name) => name.startsWith('Dialogs'))).toHaveLength(1);
});

test('EXT-042 closeDialog is answered before the web component leaves the page', async ({ page }) => {
  await dialogModule(page, 0);
  await openDialog(page);
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).partLog)).toEqual(['connected', 'resolved', 'disconnected']);
});
