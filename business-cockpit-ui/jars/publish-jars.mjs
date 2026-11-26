// Uploads the UI jar and its pom, each with .sha1, .md5, .sha256 and .sha512, with HTTP PUT into a
// Maven repository. Release versions only, and a release is uploaded once.
// Environment: MAVEN_REPOSITORY_URL (required), MAVEN_REPOSITORY_USER and MAVEN_REPOSITORY_PASSWORD
// (optional: a local repository needs no credentials).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_JAR = { group: 'com.acme', artifact: 'business-cockpit-ui' };
const CHECKSUMS = { sha1: 'sha1', md5: 'md5', sha256: 'sha256', sha512: 'sha512' };

const repositoryRoot = process.env.REPOSITORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));

function stop(message) {
  console.error(message);
  process.exit(1);
}

if (version.endsWith('-SNAPSHOT')) {
  stop(`${version} is a SNAPSHOT. Only release versions are uploaded, set one with npm run set-version.`);
}
const repository = process.env.MAVEN_REPOSITORY_URL?.replace(/\/+$/, '');
if (!repository) stop('MAVEN_REPOSITORY_URL is not set.');

const user = process.env.MAVEN_REPOSITORY_USER;
const password = process.env.MAVEN_REPOSITORY_PASSWORD;
const headers = user === undefined ? {} : {
  Authorization: `Basic ${Buffer.from(`${user}:${password ?? ''}`).toString('base64')}`,
};

const folderInRepository = `${repository}/${UI_JAR.group.split('.').join('/')}/${UI_JAR.artifact}/${version}`;
const fileName = (extension) => `${UI_JAR.artifact}-${version}.${extension}`;

async function send(method, url, body) {
  const response = await fetch(url, { method, headers, body });
  return response.status;
}

const jarUrl = `${folderInRepository}/${fileName('jar')}`;
const alreadyThere = await send('HEAD', jarUrl);
if (alreadyThere === 200) stop(`${jarUrl} is already there. A release is never overwritten.`);
if (alreadyThere !== 404) stop(`HEAD ${jarUrl} answered ${alreadyThere}.`);

for (const extension of ['jar', 'pom']) {
  const content = readFileSync(join(repositoryRoot, 'build', 'jars', fileName(extension)));
  const url = `${folderInRepository}/${fileName(extension)}`;
  const uploads = [[url, content], ...Object.entries(CHECKSUMS)
    .map(([suffix, algorithm]) => [`${url}.${suffix}`, createHash(algorithm).update(content).digest('hex')])];
  for (const [target, body] of uploads) {
    const status = await send('PUT', target, body);
    if (status < 200 || status > 299) stop(`PUT ${target} answered ${status}.`);
    console.log(`uploaded ${target}`);
  }
}
