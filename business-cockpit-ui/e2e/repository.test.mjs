// Tests of the shape of the UI repository. Run them with `npm test` after `npm run build`.
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  'e2e/modules',
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

const workspaceFolders = () => workspacesInBuildOrder.flatMap((path) => path.endsWith('*')
  ? readdirSync(join(root, dirname(path))).filter((name) => name.startsWith('bc-dev-shell-')).sort().map((name) => `${dirname(path)}/${name}`)
  : [path]);
const manifestsByName = () => Object.fromEntries(workspaceFolders().map((folder) => {
  const manifest = readJson(`${folder}/package.json`);
  return [manifest.name, { folder, manifest }];
}));

function sourceFilesBelow(folder) {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.name === 'generated' || entry.name === 'node_modules' || entry.name === 'dist') return [];
    return entry.isDirectory() ? sourceFilesBelow(path) : [path];
  });
}

test('PKG-055 the base path of the GUI API is one configuration value of the user interface', () => {
  const config = readFileSync(join(root, 'packages/ui/src/config.ts'), 'utf8');
  assert.match(config, /guiApiBasePath[^\n]*'\/gui\/api\/v1'/);
});

test('PKG-055 both generated clients and the update stream take the base path', () => {
  const clients = readFileSync(join(root, 'packages/ui/src/api/clients.ts'), 'utf8');
  assert.match(clients, /officialClient\.setConfig\(\{ baseUrl: basePath \}\)/);
  assert.match(clients, /cockpitClient\.setConfig\(\{ baseUrl: basePath \}\)/);
  assert.match(clients, /return `\$\{basePath\}\/updates`/);
});

test('PKG-055 no other code names the path', () => {
  const sources = ['packages/ui', 'packages/bc-module-kit', 'packages/bc-module-host', 'packages/bc-theme', 'packages/bc-types']
    .flatMap((folder) => sourceFilesBelow(`${folder}/src`))
    .filter((path) => path !== 'packages/ui/src/config.ts');
  assert.ok(sources.length > 0);
  for (const path of sources) {
    assert.doesNotMatch(readFileSync(join(root, path), 'utf8'), /gui\/api\/v1/, path);
  }
});

test('PKG-047 each workspace names the workspaces it depends on with their exact version', () => {
  const workspaces = manifestsByName();
  const expected = {
    '@acme/bc-module-kit': ['@acme/bc-types'],
    '@acme/bc-module-host': ['@acme/bc-module-kit'],
    '@acme/bc-ui': ['@acme/bc-module-host', '@acme/bc-module-kit', '@acme/bc-theme'],
    '@acme/bc-dev-shell-vue': ['@acme/bc-module-kit', '@acme/bc-theme'],
    '@acme/bc-dev-shell-react': ['@acme/bc-module-kit', '@acme/bc-theme'],
    '@acme/bc-dev-shell-angular': ['@acme/bc-module-kit', '@acme/bc-theme'],
    '@acme/e2e-modules': ['@acme/bc-module-kit'],
  };
  for (const [name, { manifest }] of Object.entries(workspaces)) {
    const own = Object.keys(manifest.dependencies ?? {}).filter((dependency) => dependency in workspaces);
    assert.deepEqual(own.sort(), (expected[name] ?? []).sort(), name);
    for (const dependency of own) assert.equal(manifest.dependencies[dependency], rootPackage.version, `${name} -> ${dependency}`);
  }
});

test('PKG-047 npm ci links the workspaces from the repository instead of downloading them', () => {
  const lock = readJson('package-lock.json');
  for (const name of Object.keys(manifestsByName()).filter((workspace) => workspace.startsWith('@acme/'))) {
    assert.deepEqual(lock.packages[`node_modules/${name}`]?.link, true, name);
  }
});

test('PKG-046 every workspace has the version of the root package.json', () => {
  for (const [name, { manifest }] of Object.entries(manifestsByName())) {
    assert.equal(manifest.version, rootPackage.version, name);
  }
});

test('PKG-046 the libraries are published in build order and the rest is private', () => {
  const workspaces = Object.values(manifestsByName());
  const published = workspaces.filter(({ manifest }) => !manifest.private).map(({ manifest }) => manifest.name);
  assert.deepEqual(published, [
    '@acme/bc-types', '@acme/bc-module-kit', '@acme/bc-module-host', '@acme/bc-theme',
    '@acme/bc-dev-shell-angular', '@acme/bc-dev-shell-react', '@acme/bc-dev-shell-vue',
  ]);
  assert.equal(rootPackage.private, true);
  for (const name of ['@acme/bc-ui', '@acme/bc-e2e-compare', '@acme/e2e-modules']) {
    assert.equal(manifestsByName()[name].manifest.private, true, name);
  }
});

test('PKG-046 set-version.mjs writes a new version into every package.json and the dependencies between workspaces', () => {
  const copy = mkdtempSync(join(tmpdir(), 'set-version-'));
  const manifests = ['package.json', ...workspaceFolders().map((folder) => `${folder}/package.json`)];
  for (const path of manifests) {
    mkdirSync(join(copy, dirname(path)), { recursive: true });
    copyFileSync(join(root, path), join(copy, path));
  }
  try {
    execSync('node scripts/set-version.mjs 7.8.9-SNAPSHOT --no-install', { cwd: root, env: { ...process.env, REPOSITORY_ROOT: copy } });
    for (const path of manifests) {
      const manifest = JSON.parse(readFileSync(join(copy, path), 'utf8'));
      assert.equal(manifest.version, '7.8.9-SNAPSHOT', path);
      for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
        if (dependency.startsWith('@acme/')) assert.equal(version, '7.8.9-SNAPSHOT', `${path} ${dependency}`);
      }
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('PKG-014 the UI repository has no pom.xml or Gradle file and the backend repository no package.json', () => {
  const tracked = (folder, pattern) => execSync(`git ls-files "${pattern}"`, { cwd: join(root, folder), encoding: 'utf8' }).trim();
  assert.equal(tracked('.', '*pom.xml'), '');
  assert.equal(tracked('.', '*build.gradle*'), '');
  assert.equal(tracked('.', '*settings.gradle*'), '');
  assert.equal(tracked('../business-cockpit-backend', '*package.json'), '');
});

test('PKG-008 INTERVIEW.md and CHECKLIST.md are in the project and name the version of the reference', () => {
  for (const file of ['INTERVIEW.md', 'CHECKLIST.md']) {
    assert.match(readFileSync(join(root, file), 'utf8'), /^(Reference:|Reference version:) 1\.0\.0$/m, file);
  }
});

test('PKG-052 INTERVIEW.md has a section with an answer for every question of the interview', () => {
  const questions = [
  'Q-FRAMEWORK',
  'Q-DESIGN-LIBRARY',
  'Q-MODULE-FRAMEWORKS',
  'Q-BUNDLER',
  'Q-THEME',
  'Q-THEME-TOKENS',
  'Q-STATE-MARKERS',
  'Q-WORDING',
  'Q-CASE-KIND',
  'Q-AVATARS',
  'Q-LANGUAGE-DEFAULT',
  'Q-LANGUAGE-SWITCH',
  'Q-LANGUAGES',
  'Q-SCREENS',
  'Q-DASHBOARD',
  'Q-NOTIFICATIONS',
  'Q-SUB-LISTS',
  'Q-ROUTES',
  'Q-VISIBLE-GROUPS',
  'Q-FOLLOW-UP',
  'Q-CLOSED-TASKS',
  'Q-PRIMARY-FILTERS',
  'Q-WORKFLOW-FILTERS',
  'Q-NOTES',
  'Q-TASK-COLUMNS',
  'Q-WORKFLOW-COLUMNS',
  'Q-MODULE-COLUMNS',
  'Q-BULK-ACTIONS',
  'Q-CLAIM',
  'Q-PAGE-SIZE',
  'Q-MAX-LIST-ENTRIES',
  'Q-HEADER',
  'Q-TASK-PAGE-AREAS',
  'Q-WORKFLOW-PAGE-AREAS',
  'Q-TASK-INFORMATION-AREA',
  'Q-TASK-HEADER-INFO',
  'Q-TASK-HEADER-ACTIONS',
  'Q-WORKFLOW-HEADER-INFO',
  'Q-WORKFLOW-HEADER-ACTIONS',
  'Q-OWN-WINDOW',
  'Q-LIVE-MODE',
  'Q-EXTENSION-POINTS',
  'Q-CELL-RENDERING',
  'Q-UI-URI-TYPE',
  'Q-DATA-ENTRY-LIMIT',
  'Q-BACKEND',
  'Q-BACKEND-FRAMEWORK',
  'Q-BUILD-TOOL',
  'Q-LOGIN-KIND',
  'Q-TOKEN',
  'Q-HOSTING',
  'Q-LOGIN',
  'Q-COCKPIT-VERSION',
  'Q-COCKPIT-REPOSITORY',
  'Q-UI-JAR',
  'Q-TYPES-JAR',
  'Q-MAVEN-REPOSITORY',
  'Q-NPM-SCOPE',
  'Q-BACKEND-COORDINATES',
  'Q-JAVA-VERSION',
  'Q-OIDC-PROVIDER',
  'Q-USER-DIRECTORY',
  'Q-AVATAR-SOURCE',
  'Q-AVATAR-CACHE',
  'Q-LIST-CONTROLLERS',
  'Q-BPMS-API-USER',
  'Q-KAFKA',
  'Q-MAIL',
  'Q-E2E-TOOL',
  'Q-MEMORY-LIMIT'
  ];
  const interview = readFileSync(join(root, 'INTERVIEW.md'), 'utf8');
  assert.ok(questions.length >= 70);
  for (const question of questions) {
    const section = interview.split(`\n## ${question}\n`)[1]?.split(/\n## /)[0];
    assert.ok(section, `no section ${question}`);
    assert.match(section, /^(Answer:|Not asked)/m, question);
  }
});

const checklistRows = readFileSync(join(root, 'CHECKLIST.md'), 'utf8')
  .split('\n')
  .filter((line) => /^\| `[A-Z0-9]+-\d+` \|/.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()));

test('PKG-063 CHECKLIST.md keeps every item of the reference', () => {
  const ids = readFileSync(join(root, 'plan/ids.txt'), 'utf8').split('\n').filter(Boolean);
  const kept = new Set(checklistRows.map((row) => row[1].replaceAll('`', '')));
  const missing = ids.filter((id) => !kept.has(id));
  assert.deepEqual(missing, []);
});

test('PKG-063 an item of an answer given the other way is marked not chosen with the question id', () => {
  const marked = checklistRows.filter((row) => row[3].startsWith('not chosen'));
  assert.ok(marked.length > 0);
  for (const row of marked) {
    assert.match(row[3], /^not chosen: Q-[A-Z0-9-]+/, row[1]);
  }
});

test('PKG-063 the customer own items have ids from CUST-001 on', () => {
  const own = checklistRows.map((row) => row[1].replaceAll('`', '')).filter((id) => id.startsWith('CUST-'));
  own.forEach((id, index) => assert.equal(id, `CUST-${String(index + 1).padStart(3, '0')}`));
});

test('PKG-063 every end-to-end test names the id of the item it proves', () => {
  for (const file of readdirSync(join(root, 'e2e')).filter((name) => name.endsWith('.test.mjs'))) {
    const titles = [...readFileSync(join(root, 'e2e', file), 'utf8').matchAll(/^\s*test\('([^']*)'/gm)].map((m) => m[1]);
    assert.ok(titles.length > 0, file);
    for (const title of titles) {
      assert.match(title, /^[A-Z0-9]+-\d{3}[ ,]/, `${file}: ${title}`);
    }
  }
});

test('PKG-064 the root script dev starts the dev server of packages/ui', () => {
  assert.equal(rootPackage.scripts.dev, 'npm run dev --workspace packages/ui');
});

test('PKG-064 the dev server listens on 127.0.0.1 at a fixed port, at the base path /', () => {
  const config = readFileSync(join(root, 'packages/ui/vite.config.ts'), 'utf8');
  assert.match(config, /host: '127\.0\.0\.1'/);
  assert.match(config, /const devServerPort = 5173;/);
  assert.match(config, /port: devServerPort/);
  assert.match(config, /strictPort: true/);
  assert.match(config, /clientPort: devServerPort/);
  assert.match(config, /base: '\/'/);
});

test('PKG-064 the running dev server answers an unknown path with index.html', async () => {
  const server = spawn('npm', ['run', 'dev'], { cwd: root, stdio: 'ignore', detached: true });
  try {
    let page;
    for (let attempt = 0; attempt < 60 && !page; attempt++) {
      page = await fetch('http://127.0.0.1:5173/some/unknown/path').then((r) => (r.ok ? r.text() : undefined), () => undefined);
      if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(page, 'the dev server did not answer');
    assert.match(page, /<div id="app">/);
    assert.match(page, /src\/main\.ts/);
  } finally {
    process.kill(-server.pid);
  }
});

test('PKG-064 the README says how to develop against the backend', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /^## Developing against the backend$/m);
  assert.match(readme, /ui-dev-server/);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /5173/);
  assert.match(readme, /hot reload/i);
});
