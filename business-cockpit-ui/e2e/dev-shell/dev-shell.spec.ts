// DS-002, DS-003, DS-004, DS-005: the dev shell shows a form from the GUI API of the simulator, without a cockpit.
import { expect, test, type Page } from '@playwright/test';

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

}
