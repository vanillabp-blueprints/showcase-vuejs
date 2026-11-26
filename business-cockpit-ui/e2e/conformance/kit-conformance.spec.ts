// EXT-040: the conformance test of the VanillaBP kit (`@vanillabp/bc-module-kit`) passes against this cockpit.
// The kit's own React, Vue and Angular conformance modules are served by the simulator in place of the test modules,
// registered and given one user task each, and the kit's `cockpit.test.js` opens their pages in a browser.
// The kit is public but treated as untrusted data: it is cloned and built outside git into build/kit-conformance/,
// only on demand and only once for a commit; its scripts get their paths as arguments.
import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

// npm names the commit each version of the kit was built from: `npm view @vanillabp/bc-module-kit@0.1.0-snapshot.6 gitHead`.
// It is the version of the npm tag `latest`, whose example forms draw the title in the language of the user.
const KIT_VERSION = '0.1.0-snapshot.6';
const KIT_COMMIT = '7caecd7c62a107c3fe89423690d23781a0c45ee2';
const KIT_REPOSITORY = 'https://github.com/vanillabp/business-cockpit-module-kit.git';

const root = process.cwd() + '/'; // Playwright runs from the root of the repository
const work = join(root, 'build', 'kit-conformance');
const source = join(work, 'kit');
const built = join(source, 'dist', 'conformance');
const marker = join(work, 'built-commit.txt');
// The test runs from here, below the repository, so `playwright` resolves from the repository's node_modules.
const testFolder = join(work, 'run');

const run = (command: string, args: string[], cwd: string) => execFileSync(command, args, { cwd, stdio: 'pipe', timeout: 600_000 });

/** Clones, checks out, installs and builds the kit, unless this commit is built already. */
function buildKit() {
  if (existsSync(marker) && readFileSync(marker, 'utf8') === KIT_COMMIT && existsSync(join(built, 'wm', 'react-module'))) return;
  mkdirSync(work, { recursive: true });
  if (!existsSync(join(source, '.git'))) run('git', ['clone', '--quiet', KIT_REPOSITORY, source], work);
  run('git', ['checkout', '--quiet', '--force', KIT_COMMIT], source);
  run('npm', ['ci', '--no-audit', '--no-fund'], source);
  run('npm', ['run', 'build:examples'], source);
  run('npm', ['run', 'build:conformance'], source);
  writeFileSync(marker, KIT_COMMIT);
}

const modules = ['react-module', 'vue-module', 'angular-module'] as const;
let simulator: ChildProcess | undefined;
let base: string;

test.describe.configure({ timeout: 900_000 });

test.beforeAll(async () => {
  buildKit();
  // a simulator of its own on a free port, serving the conformance modules in place of the test modules
  const port = await new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address() as { port: number }; probe.close(() => resolve(port)); });
  });
  simulator = spawn(process.execPath, [join(root, 'e2e', 'simulator', 'main.ts')], {
    stdio: 'ignore', env: { ...process.env, SIMULATOR_PORT: String(port), SIMULATOR_MODULE_FILES: join(built, 'wm') },
  });
  base = `http://127.0.0.1:${port}`;
  await expect.poll(async () => fetch(`${base}/gui/api/v1/app/info`).then((answer) => answer.status, () => 0), { timeout: 30_000 }).toBe(200);
});
test.afterAll(() => { simulator?.kill(); });

test('EXT-040 a module built against the kit loads in the cockpit: the conformance test of the kit passes for React, Vue and Angular', async ({ browser }) => {
  // the setup of every run: the simulator keeps its data in memory only
  const post = async (path: string, data: object) => {
    const answer = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    expect(answer.status, path).toBe(200);
  };
  await post('/simulator-api/reset', {});
  const pages: string[] = [];
  for (const [index, id] of modules.entries()) {
    await post(`/bpms/api/v1_1/workflow-module/${id}`, { uri: `/wm/${id}/`, accessibleToGroups: ['sales'] });
    // claiming is hard (Q-CLAIM): the test fills in the form before it claims, so Anna is the assignee and a candidate
    const taskId = `kit-${4711 + index}`;
    await post('/bpms/api/v1_1/usertask/created', {
      id: taskId, workflowModuleId: id, workflowId: `case-${taskId}`, bpmnProcessId: 'TaxiRide', taskDefinition: 'confirmRide',
      uiUriType: 'ES_MODULES', uiUriPath: '/bc-manifest.json', timestamp: '2026-11-26T08:00:00Z',
      title: { en: 'Confirm ride' }, candidateUsers: ['anna'], assignee: 'anna',
    });
    pages.push(`${id}=/tasks/${taskId}`);
  }

  // a logged-in session: the simulator logs Anna in when the browser opens a page
  const context = await browser.newContext();
  await (await context.newPage()).goto(base + '/');
  mkdirSync(testFolder, { recursive: true });
  const storageState = join(testFolder, 'user.json');
  await context.storageState({ path: storageState });
  await context.close();

  const testFile = join(testFolder, 'cockpit.test.js');
  copyFileSync(join(built, 'cockpit.test.js'), testFile);
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: root, encoding: 'utf8', timeout: 300_000,
    env: {
      ...process.env,
      BC_COCKPIT_URL: base,
      BC_USER_TASK_PAGES: pages.join(' '),
      BC_STORAGE_STATE: storageState,
      ...(process.env.CHROMIUM_PATH ? { BC_CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {}),
    },
  });
  const report = `${result.stdout}\n${result.stderr}`;
  expect(report, report).toMatch(/\bpass 19\b/); // 1 + 3 x 6 checks
  expect(report, report).toMatch(/\bfail 0\b/);
  expect(result.status, report).toBe(0);
});
