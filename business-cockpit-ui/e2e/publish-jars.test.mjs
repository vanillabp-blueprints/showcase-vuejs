// PKG-011: jars/publish-jars.mjs puts jar, pom and their four checksums into a Maven repository with
// HTTP PUT. A small local HTTP server stands in for the repository; nothing leaves this machine.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'jars', 'publish-jars.mjs');
const folders = [];

/** A repository folder in memory: the paths already stored, and every request seen. */
async function startRepository(alreadyThere = []) {
  const stored = new Map(alreadyThere.map((path) => [path, Buffer.from('old')]));
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization });
      if (request.method === 'PUT') {
        stored.set(request.url, Buffer.concat(chunks));
        response.writeHead(201).end();
      } else {
        response.writeHead(stored.has(request.url) ? 200 : 404).end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { stored, requests, url: `http://127.0.0.1:${server.address().port}/releases`, stop: () => server.close() };
}

/** A repository folder with a package.json and the built jar and pom, as npm run build leaves them. */
function builtFolder(version) {
  const folder = mkdtempSync(join(tmpdir(), 'publish-jars-'));
  folders.push(folder);
  mkdirSync(join(folder, 'build', 'jars'), { recursive: true });
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'x', version }));
  writeFileSync(join(folder, 'build', 'jars', `business-cockpit-ui-${version}.jar`), 'the jar');
  writeFileSync(join(folder, 'build', 'jars', `business-cockpit-ui-${version}.pom`), '<project/>');
  return folder;
}

// Asynchronous: the repository runs in this process, and a blocked process cannot answer.
function publish(folder, environment) {
  return new Promise((resolve) => {
    const child = spawn('node', [script], {
      cwd: root,
      env: { PATH: process.env.PATH, REPOSITORY_ROOT: folder, ...environment },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const sum = (algorithm, content) => createHash(algorithm).update(content).digest('hex');
const folderOf = (version) => `/releases/com/acme/business-cockpit-ui/${version}`;

after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

test('PKG-011 jar, pom and their .sha1 .md5 .sha256 .sha512 are PUT with the credentials of the environment', async () => {
  const repository = await startRepository();
  const folder = builtFolder('1.4.0');

  const result = await publish(folder, {
    MAVEN_REPOSITORY_URL: repository.url,
    MAVEN_REPOSITORY_USER: 'deployer',
    MAVEN_REPOSITORY_PASSWORD: 'secret',
  });
  repository.stop();

  assert.equal(result.status, 0, result.stderr + result.stdout);
  const base = `${folderOf('1.4.0')}/business-cockpit-ui-1.4.0`;
  assert.deepEqual([...repository.stored.keys()].sort(), ['.jar', '.pom']
    .flatMap((extension) => ['', '.sha1', '.md5', '.sha256', '.sha512'].map((suffix) => `${base}${extension}${suffix}`))
    .sort());
  assert.equal(repository.stored.get(`${base}.jar`).toString(), 'the jar');
  assert.equal(repository.stored.get(`${base}.jar.sha1`).toString(), sum('sha1', 'the jar'));
  assert.equal(repository.stored.get(`${base}.pom.sha512`).toString(), sum('sha512', '<project/>'));
  const expected = `Basic ${Buffer.from('deployer:secret').toString('base64')}`;
  assert.ok(repository.requests.every((request) => request.authorization === expected));
});

test('PKG-011 the script asks with HEAD for the jar first and refuses to overwrite a release', async () => {
  const repository = await startRepository([`${folderOf('1.4.0')}/business-cockpit-ui-1.4.0.jar`]);

  const result = await publish(builtFolder('1.4.0'), { MAVEN_REPOSITORY_URL: repository.url });
  repository.stop();

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already/i);
  assert.deepEqual(repository.requests.map((request) => request.method), ['HEAD']);
  assert.equal(repository.stored.get(`${folderOf('1.4.0')}/business-cockpit-ui-1.4.0.jar`).toString(), 'old');
});

test('PKG-011 the script uploads no version that ends in -SNAPSHOT and sends no request', async () => {
  const repository = await startRepository();

  const result = await publish(builtFolder('1.4.0-SNAPSHOT'), { MAVEN_REPOSITORY_URL: repository.url });
  repository.stop();

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SNAPSHOT/);
  assert.deepEqual(repository.requests, []);
});

test('PKG-011 a version like 1.4.0-snapshot.7 is a release version and is uploaded', async () => {
  const repository = await startRepository();

  const result = await publish(builtFolder('1.4.0-snapshot.7'), { MAVEN_REPOSITORY_URL: repository.url });
  repository.stop();

  assert.equal(result.status, 0, result.stderr);
  assert.ok(repository.stored.has(`${folderOf('1.4.0-snapshot.7')}/business-cockpit-ui-1.4.0-snapshot.7.jar`));
  assert.ok(repository.requests.every((request) => request.authorization === undefined));
});

test('PKG-011 the credentials come from the environment, not from a file of the repository', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(script, 'utf8');
  assert.match(source, /process\.env\.MAVEN_REPOSITORY_USER/);
  assert.match(source, /process\.env\.MAVEN_REPOSITORY_PASSWORD/);
  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(rootPackage.scripts['publish:jars'], /jars\/publish-jars\.mjs/);
});
