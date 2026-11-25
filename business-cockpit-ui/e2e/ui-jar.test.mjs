// PKG-003: the UI jar built by jars/build-jars.mjs has the coordinates of Q-UI-JAR, the version of
// the root package.json, index.html and the bundle below static/, and a pom without dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const uiJar = { group: 'com.acme', artifact: 'business-cockpit-ui' };

test('PKG-003 the UI jar holds index.html and the bundle below static/ and its pom has no dependencies', () => {
  execFileSync('node', ['jars/build-jars.mjs'], { cwd: root, stdio: 'pipe' });
  const jarFile = join(root, 'build', 'jars', `${uiJar.artifact}-${version}.jar`);
  const entries = Object.keys(unzipSync(readFileSync(jarFile)));

  assert.equal(entries[0], 'META-INF/MANIFEST.MF');
  assert.ok(entries.includes('static/index.html'));
  assert.ok(entries.some((entry) => /^static\/assets\/.+\.js$/.test(entry)), 'no bundle below static/assets');
  assert.deepEqual(entries.filter((entry) => !entry.startsWith('static/') && !entry.startsWith('META-INF/')), []);

  const pom = strFromU8(readFileSync(join(root, 'build', 'jars', `${uiJar.artifact}-${version}.pom`)));
  assert.match(pom, new RegExp(`<groupId>${uiJar.group}</groupId>`));
  assert.match(pom, new RegExp(`<artifactId>${uiJar.artifact}</artifactId>`));
  assert.match(pom, new RegExp(`<version>${version.replace(/\./g, '\\.')}</version>`));
  assert.match(pom, /<packaging>jar<\/packaging>/);
  assert.doesNotMatch(pom, /<dependenc/);
});
