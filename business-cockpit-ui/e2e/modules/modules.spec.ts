// PKG-050, PKG-056: the module host loads the built parts of the three test modules, no cockpit page runs.
// The simulator only serves the files below /wm/; the host is bundled into the page of the test.
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

const hostBundle = (async () => {
  const result = await build({
    entryPoints: [new URL('../../packages/bc-module-host/dist/index.js', import.meta.url).pathname],
    bundle: true, format: 'iife', globalName: 'BcHost', write: false, logLevel: 'silent',
  });
  return result.outputFiles[0].text;
})();

const AREAS = ['body', 'information', 'actions', 'all']; // Q-TASK-PAGE-AREAS and Q-WORKFLOW-PAGE-AREAS plus `all`

async function startHost(page: Page, moduleId: string) {
  await page.goto('/gui/api/v1/app/info'); // any page of the origin; it is not the cockpit's page
  await page.addScriptTag({ content: await hostBundle });
  await page.evaluate(() => { (window as any).host = (window as any).BcHost.createModuleHost(); });
}

const ask = (page: Page, moduleId: string, entry: string, ...args: unknown[]) =>
  page.evaluate(([id, e, a]) => (window as any).host.ask(id, `/wm/${id}/`, e, ...(a as unknown[])), [moduleId, entry, args] as const);

const drawAreas = (page: Page, moduleId: string, entry: string, data: unknown, areas: string[]) =>
  page.evaluate(async ([id, e, d, a]) => {
    const drawn = await (window as any).host.drawAreas(id, `/wm/${id}/`, e, d, a, document.body);
    return Object.keys(drawn);
  }, [moduleId, entry, data, areas] as const);

for (const [moduleId, framework, entry, data] of [
  ['react-module', 'react', 'UserTaskForm', { id: 'T-1' }],
  ['vue-module', 'vue', 'WorkflowPage', { id: 'W-1' }],
] as const) {
  test(`PKG-050 PKG-056 the host draws every area of ${moduleId} written in ${framework}`, async ({ page }) => {
    await startHost(page, moduleId);
    expect(await drawAreas(page, moduleId, entry, data, AREAS)).toEqual(AREAS);
    for (const area of AREAS) {
      await expect(page.getByTestId(`${framework}-${area}`)).toContainText(`${data.id}`);
      await expect(page.getByTestId(`${framework}-${area}`)).toHaveAttribute('data-framework', framework);
    }
  });
}

test('PKG-050 PKG-056 the host asks the Header of the Angular module and draws it', async ({ page }) => {
  await startHost(page, 'angular-module');
  const descriptor = (await ask(page, 'angular-module', 'Header')) as { element: string; entry: string };
  expect(descriptor.element).toMatch(/^angular-module-[a-z0-9]+-ticket-link$/);
  await page.evaluate(async ([id, d]) => { await (window as any).host.draw(id, `/wm/${id}/`, d, document.body); }, ['angular-module', descriptor] as const);
  await expect(page.getByTestId('angular-header')).toHaveText('Angular tickets');
});

test('PKG-050 PKG-056 the modules bring different columns', async ({ page }) => {
  const columns = async (moduleId: string, entry: string) => {
    await startHost(page, moduleId);
    return ((await ask(page, moduleId, entry)) as unknown as { id: string }[]).map((c) => c.id);
  };
  expect(await columns('react-module', 'UserTaskList')).toEqual(['risk']);
  expect(await columns('angular-module', 'UserTaskList')).toEqual(['region']);
  expect(await columns('vue-module', 'WorkflowList')).toEqual(['ride']);
});

test('PKG-050 the host refuses a name that does not start with the prefix of its module', async ({ page }) => {
  await startHost(page, 'react-module');
  const message = await page.evaluate(async () => {
    try {
      await (window as any).host.draw('react-module', '/wm/react-module/', { element: 'vue-module-x-page', entry: 'FormViews' }, document.body);
      return 'drawn';
    } catch (error) { return String(error); }
  });
  expect(message).toMatch(/refused.*react-module-/);
});

// EXT-005, EXT-007 to EXT-011: the shadow DOM, the answers of the host and the asking of the modules.
const startHostWith = async (page: Page) => {
  await startHost(page, '');
  await page.evaluate(() => {
    const { ActionRefused } = (window as any).BcHost;
    (window as any).calls = [];
    (window as any).problems = [];
    (window as any).host = (window as any).BcHost.createModuleHost({
      actions: {
        'test.echo': (args: unknown) => { (window as any).calls.push(args); return args; },
        'test.refuse': () => { throw new ActionRefused(409, 'taken'); },
      },
      onProblem: (id: string, e: unknown) => (window as any).problems.push(`${id}: ${e}`),
    });
  });
};

const ref = (id: string) => ({ workflowModuleId: id, webPath: `/wm/${id}/` });

/** Draws the Header of the Angular module and sends one request from its element; returns every response. */
const requestFromDrawn = (page: Page, action: string, args?: unknown) =>
  page.evaluate(async ([a, ar]) => {
    const host = (window as any).host;
    const el: HTMLElement = await host.draw('angular-module', '/wm/angular-module/',
      await host.ask('angular-module', '/wm/angular-module/', 'Header'), document.body);
    const responses: any[] = [];
    el.addEventListener('bc-response', (e) => responses.push((e as CustomEvent).detail));
    el.dispatchEvent(new CustomEvent('bc-request', { detail: { requestId: 'r-1', action: a, args: ar } }));
    await new Promise((r) => setTimeout(r, 100));
    return responses;
  }, [action, args] as const);

test('EXT-005 a web component renders in a shadow DOM which the page styles do not reach and its own styles do not leave', async ({ page }) => {
  await startHostWith(page);
  await page.addStyleTag({ content: '[data-testid="react-body"] { color: rgb(255, 0, 0) !important; }' });
  await page.evaluate(async () => {
    const host = (window as any).host;
    await host.drawAreas('react-module', '/wm/react-module/', 'UserTaskForm', { id: 'T-1' }, ['body'], document.body);
    const outside = document.createElement('p');
    outside.dataset.testid = 'outside';
    outside.textContent = 'outside';
    document.body.append(outside);
  });
  const hostElement = page.locator('react-module-form-views, [data-area="body"] > *').first();
  expect(await hostElement.evaluate((e) => e.shadowRoot !== null)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('[data-testid="react-body"]'))).toBeNull(); // not in the light DOM
  const inner = page.getByTestId('react-body'); // playwright pierces open shadow roots
  expect(await inner.evaluate((e) => getComputedStyle(e).color)).not.toBe('rgb(255, 0, 0)');
  const outsideColor = await page.getByTestId('outside').evaluate((e) => getComputedStyle(e).color);
  expect(outsideColor).toBe(await page.evaluate(() => getComputedStyle(document.body).color));
});

test('EXT-007 a bc-request is answered once with a bc-response of the same requestId', async ({ page }) => {
  await startHostWith(page);
  const responses = await requestFromDrawn(page, 'test.echo', { n: 1 });
  expect(responses).toEqual([{ requestId: 'r-1', ok: true, result: { n: 1 } }]);
});

test('EXT-008 an unknown action is answered with UNKNOWN_ACTION', async ({ page }) => {
  await startHostWith(page);
  const responses = await requestFromDrawn(page, 'nothing.known');
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({ requestId: 'r-1', ok: false, error: { code: 'UNKNOWN_ACTION' } });
  const inherited = await requestFromDrawn(page, 'toString'); // a name from the prototype is no action
  expect(inherited.at(-1).error.code).toBe('UNKNOWN_ACTION');
});

test('EXT-009 an action the server refuses is answered with REFUSED and the status', async ({ page }) => {
  await startHostWith(page);
  const responses = await requestFromDrawn(page, 'test.refuse');
  expect(responses).toEqual([{ requestId: 'r-1', ok: false, error: { code: 'REFUSED', status: 409, message: 'taken' } }]);
});

const ALL = ['react-module', 'vue-module', 'angular-module'];

test('EXT-010 an extension point outside the lists asks every module, a row entry only the module of the row', async ({ page }) => {
  await startHostWith(page);
  const asked = (entry: string, ids: string[]) =>
    page.evaluate(async ([e, i]) => {
      try { return [...(await (window as any).host.askModules((i as string[]).map((id) => ({ workflowModuleId: id, webPath: `/wm/${id}/` })), e)).keys()]; }
      catch (error) { return String(error); }
    }, [entry, ids] as const);
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('bc-manifest.json')) requests.push(r.url()); });
  // react and angular name a Header (S35), vue does not
  expect(((await asked('Header', ALL)) as string[]).sort()).toEqual(['angular-module', 'react-module']);
  expect(requests).toHaveLength(3); // every module was asked
  expect(await asked('UserTaskList', ALL)).toMatch(/only the module of the row/);
  expect(await asked('UserTaskList', ['react-module'])).toEqual(['react-module']);
  void ref;
});

test('EXT-011 a module whose manifest does not name the entry causes no error and no message', async ({ page }) => {
  await startHostWith(page);
  const consoleMessages: string[] = [];
  page.on('console', (m) => consoleMessages.push(m.text()));
  page.on('pageerror', (e) => consoleMessages.push(String(e)));
  const answers = await page.evaluate(async (ids) =>
    [...(await (window as any).host.askModules(ids.map((id) => ({ workflowModuleId: id, webPath: `/wm/${id}/` })), 'Header')).keys()], ALL);
  expect(answers.sort()).toEqual(['angular-module', 'react-module']); // the vue module names no Header and is skipped
  expect(await page.evaluate(() => (window as any).problems)).toEqual([]);
  expect(consoleMessages.filter((m) => !/favicon|404/.test(m))).toEqual([]);
  // a named entry which fails to load is reported
  const entries = { Header: 'Header.js' };
  await page.route('**/wm/ghost-module/**', (route) => route.request().url().endsWith('bc-manifest.json')
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ manifestVersion: 1, entries }) }) : route.fulfill({ status: 500 }));
  const problems = await page.evaluate(async () => {
    await (window as any).host.askModules([{ workflowModuleId: 'ghost-module', webPath: '/wm/ghost-module/' }], 'Header');
    return (window as any).problems as string[];
  });
  expect(problems).toHaveLength(1);
});
