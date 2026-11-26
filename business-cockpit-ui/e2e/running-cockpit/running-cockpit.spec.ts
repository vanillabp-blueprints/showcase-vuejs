// EXT-058: against a running cockpit backend (docker compose up, profile local, the user interface behind it) the
// module files reach the browser through /wm/<id>/, the lists show the rows the modules report, the page of a user
// task loads, and the kit's conformance test (EXT-040) passes once more, with `serve.mjs` of the kit serving the modules.
// It needs a running backend, so it is skipped unless BC_BACKEND_URL names it, see RUN-AGAINST-COCKPIT.md.
import { expect, test } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const backend = process.env.BC_BACKEND_URL;
const root = process.cwd() + '/';
const kit = join(root, 'build', 'kit-conformance', 'kit', 'dist', 'conformance'); // built by e2e/conformance/kit-conformance.spec.ts
const testFolder = join(root, 'build', 'kit-conformance', 'run');
const modules = ['react-module', 'vue-module', 'angular-module'] as const;
const moduleServer = 'http://localhost:4173';

test.describe.configure({ timeout: 300_000 });
test.skip(!backend, 'set BC_BACKEND_URL to the address of a running cockpit backend');

test('EXT-058 against a running cockpit backend the module files come through /wm, the lists show the rows, and the conformance test of EXT-040 passes', async ({ browser }) => {
  const server = spawn(process.execPath, [join(kit, 'serve.mjs')], { stdio: 'ignore', env: { ...process.env, PORT: '4173' } });
  try {
    await expect.poll(() => fetch(`${moduleServer}/wm/react-module/bc-manifest.json`).then((a) => a.status, () => 0), { timeout: 10_000 }).toBe(200);
    const bpms = { Authorization: 'Basic ' + Buffer.from('local:local').toString('base64'), 'content-type': 'application/json' };
    const post = async (path: string, data: object) => {
      const answer = await fetch(backend + path, { method: 'POST', headers: bpms, body: JSON.stringify(data) });
      expect(answer.status, path + ' ' + await answer.text()).toBe(200);
    };
    // a task the conformance test completes stays completed, so every run reports tasks of its own
    const run = Date.now().toString(36);
    const pages: string[] = [];
    for (const [index, id] of modules.entries()) {
      const taskId = `kit-${run}-${index}`;
      await post(`/bpms/api/v1_1/workflow-module/${id}`, { uri: `${moduleServer}/wm/${id}`, accessibleToGroups: ['template-group'] });
      await post('/bpms/api/v1_1/workflow/created', {
        id: `wev-${taskId}`, workflowId: `case-${taskId}`, workflowModuleId: id, bpmnProcessId: 'TaxiRide', businessId: `ride-${run}-${index}`,
        timestamp: '2026-11-26T08:00:00Z', title: { en: `Taxi ride ${run}` }, uiUriType: 'ES_MODULES', uiUriPath: '/bc-manifest.json',
      });
      await post('/bpms/api/v1_1/usertask/created', {
        id: `ev-${taskId}`, userTaskId: taskId, workflowId: `case-${taskId}`, workflowModuleId: id, bpmnProcessId: 'TaxiRide',
        taskDefinition: 'confirmRide', uiUriType: 'ES_MODULES', uiUriPath: '/bc-manifest.json', timestamp: '2026-11-26T08:00:00Z',
        title: { en: `Confirm ride ${run}` }, workflowTitle: { en: `Taxi ride ${run}` }, candidateUsers: ['template-user'], assignee: 'template-user',
      });
      pages.push(`${id}=/tasks/${taskId}`);
    }

    // log in at Keycloak as the template user of the backend's realm
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(backend + '/');
    await page.locator('#username').fill('template-user');
    await page.locator('#password').fill('template-user');
    await page.locator('#kc-login').click();
    await expect(page.getByText('template-user').first()).toBeVisible({ timeout: 30_000 });

    // the files of a module come through the backend with the caching headers of the module
    const manifest = await context.request.get(`${backend}/wm/react-module/bc-manifest.json`);
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()['cache-control']).toBe('no-cache');
    const entry = Object.values((await manifest.json()).entries as Record<string, string>)[0];
    const file = await context.request.get(`${backend}/wm/react-module/${entry}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['cache-control']).toBe('max-age=3600');

    // the lists show the rows
    await page.goto(backend + '/tasks');
    await expect(page.getByText(`Confirm ride ${run}`)).toHaveCount(3);
    await page.goto(backend + '/workflows');
    await expect(page.getByText(`Taxi ride ${run}`)).toHaveCount(3);

    mkdirSync(testFolder, { recursive: true });
    const storageState = join(testFolder, 'backend-user.json');
    await context.storageState({ path: storageState });
    await context.close();

    // the conformance test of the kit, once more, against the backend
    const testFile = join(testFolder, 'cockpit.test.js');
    copyFileSync(join(kit, 'cockpit.test.js'), testFile);
    const result = spawnSync(process.execPath, ['--test', testFile], {
      cwd: root, encoding: 'utf8', timeout: 240_000,
      env: {
        ...process.env, BC_COCKPIT_URL: backend, BC_USER_TASK_PAGES: pages.join(' '), BC_STORAGE_STATE: storageState,
        ...(process.env.CHROMIUM_PATH ? { BC_CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {}),
      },
    });
    const report = `${result.stdout}\n${result.stderr}`;
    expect(report, report).toMatch(/\bpass 19\b/);
    expect(report, report).toMatch(/\bfail 0\b/);
    expect(result.status, report).toBe(0);
  } finally {
    server.kill();
  }
});
