// Tests of the shape of the UI repository. Run them with `npm test` after `npm run build`.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const rootPackage = readJson('package.json');

const workspacesInBuildOrder = [
  'packages/bc-types',
  'packages/bc-module-kit',
  'packages/bc-module-host',
  'packages/bc-theme',
  'packages/ui',
  'packages/bc-dev-shell-*',
  'e2e/compare',
];

test('PKG-044 the root lists every workspace and the one lock file lies at the root', () => {
  assert.deepEqual(rootPackage.workspaces, workspacesInBuildOrder);
  assert.ok(existsSync(join(root, 'package-lock.json')));
  const lockFilesBelowTheRoot = execSync('git ls-files "*/package-lock.json"', { cwd: root, encoding: 'utf8' });
  assert.equal(lockFilesBelowTheRoot.trim(), '');
});

test('PKG-044 each dev shell of the interview is a workspace', () => {
  const shells = readdirSync(join(root, 'packages')).filter((name) => name.startsWith('bc-dev-shell-'));
  assert.deepEqual(shells.sort(), ['bc-dev-shell-angular', 'bc-dev-shell-react', 'bc-dev-shell-vue']);
});

test('PKG-035 the build needs no Maven, Gradle or Java', () => {
  const buildScripts = JSON.stringify([rootPackage.scripts, ...workspacesInBuildOrder
    .filter((path) => !path.includes('*'))
    .map((path) => readJson(`${path}/package.json`).scripts)]);
  assert.doesNotMatch(buildScripts, /\b(mvn|mvnw|gradle|gradlew|java)\b/);
});

test('PKG-045 npm run build builds the workspaces in order and then the UI jar', () => {
  assert.equal(rootPackage.scripts.build, 'npm run build --workspaces --if-present && npm run build:jars');
  assert.match(rootPackage.scripts['build:jars'], /jars\/build-jars\.mjs/);
});

test('PKG-045 the build produced the UI jar with the shell at static/index.html', () => {
  const jar = join(root, 'build/jars', `business-cockpit-ui-${rootPackage.version}.jar`);
  assert.ok(existsSync(jar), 'run npm run build first');
  const listing = execSync(`node -e "const {unzipSync}=require('fflate');console.log(Object.keys(unzipSync(require('fs').readFileSync(process.argv[1]))).join('\\n'))" ${jar}`, { cwd: root, encoding: 'utf8' });
  assert.match(listing, /^META-INF\/MANIFEST\.MF$/m);
  assert.match(listing, /^static\/index\.html$/m);
  assert.match(listing, /^static\/assets\/.+\.js$/m);
});

test('PKG-019 the OpenAPI files come from the cockpit jars in Maven Central, with an optional token', () => {
  const script = readFileSync(join(root, 'scripts/fetch-openapi.mjs'), 'utf8');
  assert.match(script, /repo1\.maven\.org\/maven2/);
  assert.match(script, /central\.sonatype\.com\/repository\/maven-snapshots/);
  assert.match(script, /official-gui-api-server/);
  assert.match(script, /api\/gui\/v1\.yaml/);
  assert.match(script, /process\.env\.COCKPIT_REPOSITORY_TOKEN/);
  assert.match(script, /maven-metadata\.xml/);
});

test('PKG-019 the fetched files are the two OpenAPI descriptions', () => {
  for (const file of ['official-gui-api.yaml', 'cockpit-gui-api.yaml']) {
    assert.match(readFileSync(join(root, 'build/openapi', file), 'utf8'), /^openapi:/m, file);
  }
});

test('PKG-002 the GUI API client is generated and Git does not track it', () => {
  const client = 'packages/ui/src/generated/official-gui-api/sdk.gen.ts';
  assert.ok(existsSync(join(root, client)), 'run npm run build first');
  assert.match(readFileSync(join(root, client), 'utf8'), /class \w+Api/);
  assert.equal(execSync('git ls-files packages/ui/src/generated packages/bc-types/src/generated build', { cwd: root, encoding: 'utf8' }).trim(), '');
  execSync(`git check-ignore ${client}`, { cwd: root });
});

test('PKG-062 the generator is pinned exactly, Node 24 is required and the types come without a client', () => {
  assert.match(rootPackage.devDependencies['@hey-api/openapi-ts'], /^\d+\.\d+\.\d+$/);
  assert.equal(rootPackage.engines.node, '>=24');
  const typesGenerated = 'packages/bc-types/src/generated';
  assert.ok(existsSync(join(root, typesGenerated, 'types.gen.ts')), 'run npm run build first');
  assert.ok(!existsSync(join(root, typesGenerated, 'sdk.gen.ts')));
  execSync(`git check-ignore ${typesGenerated}/types.gen.ts`, { cwd: root });
});
