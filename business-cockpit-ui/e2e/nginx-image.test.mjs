// PKG-025: the nginx image serves the files of the user interface, answers an unknown path with
// index.html and forwards nothing to the backend. The tests build and run the real image.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const image = 'business-cockpit-ui-nginx:pkg-025-test';
const docker = (...args) => execFileSync('docker', args, { cwd: root, encoding: 'utf8' }).trim();
let container;
let address;

before(() => {
  docker('build', '-q', '-f', 'docker/Dockerfile', '-t', image, '.');
  container = docker('run', '-d', '--rm', '-p', '127.0.0.1::80', image);
  address = `http://${docker('port', container, '80/tcp').split('\n')[0]}`;
});

after(() => {
  if (container) docker('stop', '-t', '1', container);
  docker('rmi', '-f', image);
});

const get = async (path) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${address}${path}`, { redirect: 'manual' });
      return { status: response.status, headers: response.headers, body: await response.text() };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('the nginx does not answer');
};

test('PKG-025 the image serves index.html and a file of the bundle as they are', async () => {
  const dist = join(root, 'packages', 'ui', 'dist');
  const index = readFileSync(join(dist, 'index.html'), 'utf8');
  const bundle = readdirSync(join(dist, 'assets')).find((name) => name.endsWith('.js'));

  const home = await get('/');
  const file = await get(`/assets/${bundle}`);

  assert.equal(home.body, index);
  assert.equal(file.status, 200);
  assert.equal(file.body, readFileSync(join(dist, 'assets', bundle), 'utf8'));
});

test('PKG-025 an unknown path gets index.html and index.html is sent with Cache-Control no-cache', async () => {
  const index = readFileSync(join(root, 'packages', 'ui', 'dist', 'index.html'), 'utf8');

  for (const path of ['/cases/4711', '/tasks/open/9', '/gui/api/v1/tasks', '/wm/module/x']) {
    const answer = await get(path);
    assert.equal(answer.status, 200, path);
    assert.equal(answer.body, index, path);
    assert.equal(answer.headers.get('cache-control'), 'no-cache', path);
  }
});

test('PKG-025 the configuration forwards nothing to the backend', () => {
  assert.ok(existsSync(join(root, 'docker', 'nginx.conf.template')));
  const configuration = readFileSync(join(root, 'docker', 'nginx.conf.template'), 'utf8');

  assert.match(configuration, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.doesNotMatch(configuration, /proxy_pass|proxy_set_header|fastcgi_pass|uwsgi_pass/);
});

test('PKG-025 the image is based on the official nginx and copies the bundle and the template', () => {
  const dockerfile = readFileSync(join(root, 'docker', 'Dockerfile'), 'utf8');

  assert.match(dockerfile, /^FROM nginx:/m);
  assert.match(dockerfile, /COPY packages\/ui\/dist \/usr\/share\/nginx\/html/);
  assert.match(dockerfile, /COPY docker\/nginx\.conf\.template \/etc\/nginx\/templates\//);
});
