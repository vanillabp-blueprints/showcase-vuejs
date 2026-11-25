// PKG-059: the built bundle is index.html plus files below one prefix, /assets/. The backend, the
// nginx image and the UI jar rely on that: index.html is the only file that must never be cached.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'packages', 'ui', 'dist');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dist, join(entry.parentPath, entry.name)));
}

test('PKG-059 index.html lies at the root of the bundle and every other file below assets/', () => {
  const files = filesBelow(dist);

  assert.ok(files.includes('index.html'), 'no index.html');
  assert.deepEqual(files.filter((file) => file !== 'index.html' && !file.startsWith('assets/')), []);
  assert.ok(files.some((file) => file.startsWith('assets/')), 'nothing below assets/');
});

test('PKG-059 index.html asks for its files below /assets/ only', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

  assert.ok(references.length > 0, 'index.html names no file');
  assert.deepEqual(references.filter((reference) => !reference.startsWith('/assets/')), []);
});
