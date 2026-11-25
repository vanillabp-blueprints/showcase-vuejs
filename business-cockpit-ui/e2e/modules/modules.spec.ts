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
