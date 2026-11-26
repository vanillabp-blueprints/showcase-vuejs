// DS-002 to DS-011: the dev shell shows a form from the GUI API of the simulator, without a cockpit.
import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { createDevShellProxy } from '../../packages/bc-module-kit/dist/dev-server-proxy.js';

const at = '2026-11-20T08:00:00Z';
const task = (id: string, bpmnProcessId: string, title: string) => ({ id, bpmnProcessId, workflowModuleId: 'dev-module', createdAt: at, updatedAt: at, businessId: `B-${id}`, title: { en: title } });
// Q-MODULE-FRAMEWORKS: one test application per framework, each with the same parts, handed to its own dev shell
const apps = { vue: 'index.html', react: 'react.html', angular: 'angular.html' } as const;

async function seed(page: Page, title = 'Assess risk') {
  await page.request.post('/simulator-api/reset');
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [task('t1', 'ride', title), task('t2', 'areas', 'Second task')] } });
  await page.request.post('/simulator-api/workflows', { data: { workflows: [{ ...task('c1', 'ride', 'A case'), workflowTitle: { en: 'A case' } }] } });
  await page.request.post('/dev-shell/user/anna');
}

for (const [framework, file] of Object.entries(apps)) {
const shell = `/dev-shell-app/${file}`;

test(`DS-002 [${framework}] the dev shell draws the component it was handed, in a host element with a shadow root, and loads no module`, async ({ page }) => {
  await seed(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(`${shell}#/tasks/t1`);
  const form = page.getByTestId('part-task');
  await expect(form).toHaveText('task: Assess risk');
  expect(await form.evaluate((element) => (element.getRootNode() as ShadowRoot).host.localName)).toBe('dev-module-dev-ride--check--page');
  expect(await form.evaluate((element) => (element.getRootNode() as ShadowRoot).host.shadowRoot !== null)).toBe(true);
  // the module's style is in the shadow root
  expect(await form.evaluate((element) => (element.getRootNode() as ShadowRoot).querySelector('style')?.textContent)).toContain('.part');
  expect(requests.filter((path) => path.startsWith('/wm/') || path.endsWith('bc-manifest.json'))).toEqual([]);
});

test(`DS-003 [${framework}] the data of the form is the user task of the GUI API of the simulator`, async ({ page }) => {
  await seed(page, 'First title');
  const apiRequests: string[] = [];
  page.on('request', (request) => { const path = new URL(request.url()).pathname; if (path.startsWith('/official-api/')) apiRequests.push(path); });
  await page.goto(`${shell}#/tasks/t1`);
  await expect(page.getByTestId('part-task')).toHaveText('task: First title');
  expect(apiRequests).toContain('/official-api/gui/api/v1/usertask/t1');
  await seed(page, 'Second title');
  await page.reload();
  await expect(page.getByTestId('part-task')).toHaveText('task: Second title');
});

test(`DS-004 [${framework}] the dev shell switches between user tasks, cases and the choice of a user`, async ({ page }) => {
  await seed(page);
  await page.goto(`${shell}#/tasks/t1`);
  await expect(page.getByTestId('part-task')).toBeVisible();
  // the drop-down lists the tasks there are
  await page.getByTestId('entry-select').selectOption('t2');
  await expect(page.getByTestId('part-body')).toHaveText('body: Second task');
  await expect(page).toHaveURL(/#\/tasks\/t2$/);
  await page.getByTestId('kind-select').selectOption('workflows');
  await expect(page.getByTestId('part-case')).toHaveText('case: A case');
  await expect(page).toHaveURL(/#\/workflows\/c1$/);
  await page.getByTestId('kind-select').selectOption('tasks');
  await expect(page.getByTestId('part-task')).toBeVisible();
  // no user: the simulator answers 401, the shell says so; a user again shows the form
  await page.getByTestId('user-select').selectOption('---');
  await expect(page.getByTestId('shell-note')).toBeVisible();
  await page.getByTestId('user-select').selectOption('ben');
  await expect(page.getByTestId('part-task')).toBeVisible();
});

test(`DS-005 [${framework}] the areas are laid out as on the task page of the cockpit, with the same theme and font inside the part`, async ({ page }) => {
  await seed(page);
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [{ ...task('t2', 'areas', 'Second task'), workflowModuleId: 'react-module', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' }] } });
  await page.setViewportSize({ width: 1000, height: 600 });
  const read = async () => {
    const areas = {} as Record<string, unknown>;
    for (const area of ['body', 'information', 'actions']) {
      areas[area] = await page.locator(`[data-area="${area}"]`).evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const host = element.firstElementChild!;
        const inner = host.shadowRoot!.firstElementChild!.nextElementSibling ?? host.shadowRoot!.firstElementChild!;
        // the same colour is written as rgba() or as color(srgb ...); one pixel painted gives the numbers
        const colour = (value: string) => { const context = document.createElement('canvas').getContext('2d')!; context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].join(','); };
        const own = (target: Element) => { const s = getComputedStyle(target); return [s.fontFamily, colour(s.color), s.fontSize, s.lineHeight].join('|'); };
        return {
          display: style.display, overflowY: style.overflowY, gridColumn: style.gridColumnStart, gridRow: style.gridRowStart + '/' + style.gridRowEnd,
          x: Math.round(box.x), width: Math.round(box.width), hostDisplay: getComputedStyle(host).display, hostFont: own(host), innerFont: own(inner),
          theme: ['--bc-color-primary', '--bc-color-text', '--bc-spacing'].map((name) => getComputedStyle(inner).getPropertyValue(name)).join('|'),
        };
      });
    }
    return areas;
  };
  await page.goto('/tasks/t2');
  await expect(page.getByTestId('react-actions')).toBeVisible();
  const cockpit = await read();
  await page.goto(`${shell}#/tasks/t2`);
  await expect(page.getByTestId('part-actions')).toBeVisible();
  const devShell = await read();
  // the text of the parts differs, the boxes, the fonts and the theme do not
  expect(devShell).toEqual(cockpit);
});


test(`DS-006 [${framework}] a toast a part asks for is shown in the look of its level, and a sticky one stays until it is clicked away`, async ({ page }) => {
  await seed(page);
  await page.clock.install();
  await page.goto(`${shell}#/tasks/t1`);
  await page.locator('[data-action="notify-info"]').click();
  const info = page.getByTestId('toast').filter({ hasText: 'Saved' });
  await expect(info).toHaveAttribute('data-level', 'info');
  // the look of the cockpit's toast (Vuetify palette, Q-THEME)
  await expect(info).toHaveCSS('background-color', 'rgb(33, 150, 243)');
  await page.locator('[data-action="notify-sticky"]').click();
  const sticky = page.getByTestId('toast').filter({ hasText: 'Stays here' });
  await expect(sticky).toHaveAttribute('data-level', 'error');
  await page.clock.fastForward(6000);
  await expect(info).toHaveCount(0);
  await expect(sticky).toBeVisible();
  await sticky.click();
  await expect(sticky).toHaveCount(0);
});

test(`DS-007 [${framework}] the developer can choose the language, and every part on the page gets it`, async ({ page }) => {
  await seed(page);
  await page.goto(`${shell}#/tasks/t1`);
  const choice = page.getByTestId('language-select');
  await expect(page.getByTestId('part-language')).toHaveText('language: en');
  // the languages of the cockpit, from its application information
  expect(await choice.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['en', 'de', 'fr', 'es']);
  await choice.selectOption('de');
  await expect(page.getByTestId('part-language')).toHaveText('language: de');
  // the part was not drawn again: the choice reached the same element
  await expect(page.getByTestId('part-task')).toHaveText('task: Assess risk');
});

test(`DS-008 [${framework}] a function the simulator does not answer says so in a toast instead of doing nothing silently`, async ({ page }) => {
  await seed(page);
  await page.goto(`${shell}#/tasks/t1`);
  await page.locator('[data-action="claim"]').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'claim' })).toContainText('does not answer');
  // the promise of the part resolves
  await expect(page.getByTestId('result')).toHaveText('claim: done');
  await page.locator('[data-action="unknown-action"]').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'cockpit.makeCoffee' })).toContainText('does not know');
  await expect(page.getByTestId('result')).toHaveText('unknown-action: failed UNKNOWN_ACTION');
});

test(`DS-009 [${framework}] getUserTasks returns the real user tasks of the case`, async ({ page }) => {
  await seed(page);
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [
    { ...task('t3', 'ride', 'Open one'), workflowId: 'c1' },
    { ...task('t4', 'ride', 'Done one'), workflowId: 'c1', endedAt: at },
    { ...task('t5', 'ride', 'Other case'), workflowId: 'c2' },
  ] } });
  await page.goto(`${shell}#/workflows/c1`);
  await page.locator('[data-action="tasks-all"]').click();
  await expect(page.getByTestId('result')).toHaveText('tasks-all: t3,t4');
  await page.locator('[data-action="tasks-active"]').click();
  await expect(page.getByTestId('result')).toHaveText('tasks-active: t3');
});

test(`DS-011 [${framework}] the dev shell has no lists, no live updates, no login and no copy of a list row`, async ({ page }) => {
  await seed(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
  await page.goto(`${shell}#/tasks/t1`);
  await expect(page.getByTestId('part-task')).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests.filter((request) => /updates|oauth2|login|logout|current-user|\/count|notifications/.test(request))).toEqual([]);
  // the only lists are the drop-down: the primary filter All, nothing else asks for a list
  expect(requests.filter((request) => /\/(usertask|workflow)$/.test(request))).toEqual(['POST /official-api/gui/api/v1/usertask']);
  expect(await page.locator('table, [role="grid"], [data-testid*="list"], [data-testid*="row"]').count()).toBe(0);
});

test(`DS-012 [${framework}] the dev shell offers the users of the simulator, one can be picked, switched and deselected, and picking sets a real JWT cookie`, async ({ page }) => {
  await seed(page);
  await page.request.post('/dev-shell/user/---');
  await page.goto(`${shell}#/tasks/t1`);
  const choice = page.getByTestId('user-select');
  expect(await choice.locator('option').evaluateAll((options) => options.map((option) => [(option as HTMLOptionElement).value, option.textContent]))).toEqual([['---', 'no user'], ['anna', 'Anna Sales'], ['ben', 'Ben Support']]);
  const cookie = async () => (await page.context().cookies()).find((one) => one.name === 'bc');
  const claims = async () => JSON.parse(Buffer.from((await cookie())!.value.split('.')[1]!, 'base64url').toString());
  await choice.selectOption('anna');
  await expect(page.getByTestId('part-task')).toBeVisible();
  // a real JWT: three parts, and the user in its claims
  expect((await cookie())!.value.split('.')).toHaveLength(3);
  expect((await claims()).preferred_username ?? (await claims()).sub).toContain('anna');
  await choice.selectOption('ben');
  await expect(page.getByTestId('part-task')).toBeVisible();
  expect((await claims()).preferred_username ?? (await claims()).sub).toContain('ben');
  await choice.selectOption('---');
  await expect(page.getByTestId('shell-note')).toBeVisible();
  expect(await cookie()).toBeUndefined();
});

test(`DS-013 [${framework}] the header, the extension point the interview chose, can be tried: its buttons show in a header for the user chosen`, async ({ page }) => {
  await seed(page);
  await page.goto(`${shell}#/tasks/t1`);
  const header = page.getByTestId('shell-header');
  await expect(header.getByTestId('part-header')).toHaveText('header: no data');
  // the function is asked with the user chosen: ben gets no button, no user none
  await page.getByTestId('user-select').selectOption('ben');
  await expect(page.getByTestId('part-task')).toBeVisible();
  await expect(header.getByTestId('part-header')).toHaveCount(0);
  await page.getByTestId('user-select').selectOption('---');
  await expect(page.getByTestId('shell-note')).toBeVisible();
  await expect(header.getByTestId('part-header')).toHaveCount(0);
  // Pages and other extension points were not chosen: the shell offers none
  await expect(page.getByTestId('shell-pages')).toHaveCount(0);
});

const talk = (page: Page, area: string, action: string) => page.locator(`[data-area="${area}"] [data-action="${action}"]`);
const talkSeed = async (page: Page) => {
  await seed(page);
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [task('t6', 'talk', 'Talking task')] } });
  await page.goto(`${shell}#/tasks/t6`);
  await expect(talk(page, 'body', 'listen')).toBeVisible();
};

test(`DS-014 [${framework}] sendTo and receiveMessage carry messages between the areas, also those sent before the subscription`, async ({ page }) => {
  await talkSeed(page);
  // sent before the body listens: kept, and handed over after the subscription
  await talk(page, 'actions', 'send').click();
  await expect(page.locator('[data-area="actions"]').getByTestId('result')).toHaveText('send: sent');
  await talk(page, 'body', 'listen').click();
  await expect(page.locator('[data-area="body"]').getByTestId('result')).toHaveText('listen: subscribed');
  await expect(page.locator('[data-area="body"]').getByTestId('received')).toHaveText('actions: hello');
  // now the body listens: delivered at once, `from` is the area of the sender
  await talk(page, 'actions', 'send').click();
  await expect(page.locator('[data-area="body"]').getByTestId('received')).toHaveText('actions: hello');
  // a target without a web component fails with NO_TARGET, as in the cockpit
  await talk(page, 'actions', 'send-nowhere').click();
  await expect(page.locator('[data-area="actions"]').getByTestId('result')).toHaveText('send-nowhere: failed NO_TARGET');
});

test(`DS-015 [${framework}] the drop-down asks for user tasks and for cases with the primary filter All, and offers no other`, async ({ page }) => {
  await seed(page);
  const bodies: Record<string, string> = {};
  page.on('request', (request) => { const path = new URL(request.url()).pathname; if (request.method() === 'POST' && /\/(usertask|workflow)$/.test(path)) bodies[path.split('/').pop()!] = request.postData()!; });
  await page.goto(`${shell}#/tasks/t1`);
  await expect(page.getByTestId('part-task')).toBeVisible();
  await page.getByTestId('kind-select').selectOption('workflows');
  await expect(page.getByTestId('part-case')).toBeVisible();
  expect(Object.keys(bodies).sort()).toEqual(['usertask', 'workflow']);
  for (const body of Object.values(bodies)) expect(JSON.parse(body)).toMatchObject({ mode: 'All' });
  // no control for another filter
  expect(await page.getByTestId('shell-bar').locator('select').evaluateAll((selects) => selects.map((select) => select.getAttribute('data-testid')))).toEqual(['kind-select', 'entry-select', 'user-select', 'language-select']);
});

test(`DS-017 [${framework}] the dev shell asks the module's data entries and shows a note with the name for a web component without a component`, async ({ page }) => {
  await seed(page);
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [task('t7', 'missing', 'No component')] } });
  // the data entry told the shell which component to draw: the task t1 gets the page, the case its own
  await page.goto(`${shell}#/tasks/t7`);
  await expect(page.getByTestId('shell-note')).toContainText('dev-module-dev-missing--check--page');
  await expect(page.getByTestId('shell-note')).toContainText('no component');
  await page.goto(`${shell}#/workflows/c1`);
  await expect(page.getByTestId('part-case')).toBeVisible();
  await expect(page.getByTestId('shell-note')).toBeHidden();
});

}

test('DS-016 [angular] the dev shell for Angular runs zoneless', async ({ page }) => {
  await seed(page);
  await page.goto('/dev-shell-app/angular.html#/tasks/t1');
  await expect(page.getByTestId('part-task')).toBeVisible();
  expect(await page.evaluate(() => 'Zone' in window)).toBe(false);
  await expect(page.getByTestId('part-zone')).toHaveText('NoopNgZone');
  // the language reaches the part by a signal-free input change, repainted without zone.js
  await page.getByTestId('language-select').selectOption('de');
  await expect(page.getByTestId('part-language')).toHaveText('language: de');
});

test('DS-010 the dev server forwards /official-api and /dev-shell to the simulator and /wm/<id>/ to the workflow module, and answers an unknown path with the start page', async ({ baseURL }) => {
  const seen: string[] = [];
  const module: Server = createServer((request, response) => { seen.push(`${request.method} ${request.url}`); response.end('module says hi'); });
  await new Promise<void>((done) => module.listen(0, '127.0.0.1', done));
  const proxy: Server = createServer(createDevShellProxy({
    simulator: baseURL!, workflowModules: { 'dev-module': `http://127.0.0.1:${(module.address() as { port: number }).port}` }, startPage: '<!doctype html><title>start</title>',
  }));
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
  const at = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  try {
    expect((await fetch(`${at}/official-api/gui/api/v1/app/info`)).status).toBe(200);
    expect(await (await fetch(`${at}/dev-shell/user/all/id`)).json()).toEqual(expect.arrayContaining(['anna']));
    // the cookie travels along
    const chosen = await fetch(`${at}/dev-shell/user/anna`, { method: 'POST' });
    expect(chosen.headers.get('set-cookie')).toBeTruthy();
    const forwarded = await fetch(`${at}/wm/dev-module/api/orders?x=1`, { method: 'POST', body: 'data' });
    expect(await forwarded.text()).toBe('module says hi');
    expect(seen).toEqual(['POST /api/orders?x=1']);
    // an unknown path, and a module nobody registered, give the start page of the single-page application
    for (const path of ['/tasks/t1', '/wm/other-module/api']) {
      const answer = await fetch(`${at}${path}`);
      expect([answer.status, await answer.text()]).toEqual([200, '<!doctype html><title>start</title>']);
    }
  } finally {
    proxy.close(); module.close();
  }
});
