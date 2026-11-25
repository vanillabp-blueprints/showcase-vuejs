// Loads the two OpenAPI files of the pinned cockpit version out of the jars in the Maven
// repository, and writes them to build/openapi/. The files are not committed.
// Usage: node scripts/fetch-openapi.mjs [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const COCKPIT_GROUP = process.env.COCKPIT_GROUP ?? 'io.vanillabp.businesscockpit';
const COCKPIT_VERSION = process.env.COCKPIT_VERSION ?? '0.9.0-SNAPSHOT';
const RELEASE_REPOSITORY = 'https://repo1.maven.org/maven2';
const SNAPSHOT_REPOSITORY = 'https://central.sonatype.com/repository/maven-snapshots';
// Only a repository that asks for a login needs a token. Maven Central does not.
const REPOSITORY_TOKEN = process.env.COCKPIT_REPOSITORY_TOKEN;

const openApiFiles = [
  { artifact: 'official-gui-api-server', pathInJar: 'v1.yaml', target: 'official-gui-api.yaml' },
  { artifact: 'business-cockpit', pathInJar: 'api/gui/v1.yaml', target: 'cockpit-gui-api.yaml' },
];

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputFolder = join(repositoryRoot, 'build', 'openapi');
const isSnapshot = COCKPIT_VERSION.endsWith('-SNAPSHOT');
const repository = isSnapshot ? SNAPSHOT_REPOSITORY : RELEASE_REPOSITORY;

const requestHeaders = REPOSITORY_TOKEN ? { Authorization: `Bearer ${REPOSITORY_TOKEN}` } : {};

async function download(url) {
  const answer = await fetch(url, { headers: requestHeaders });
  if (!answer.ok) {
    throw new Error(`${url} answered ${answer.status}`);
  }
  return new Uint8Array(await answer.arrayBuffer());
}

function folderOf(artifact) {
  return `${repository}/${COCKPIT_GROUP.replaceAll('.', '/')}/${artifact}/${COCKPIT_VERSION}`;
}

// A snapshot jar has a time stamp in its file name. The metadata file names the newest one.
async function jarFileNameOf(artifact) {
  if (!isSnapshot) {
    return `${artifact}-${COCKPIT_VERSION}.jar`;
  }
  const metadata = new TextDecoder().decode(await download(`${folderOf(artifact)}/maven-metadata.xml`));
  const newestJar = /<snapshotVersion>\s*<extension>jar<\/extension>\s*<value>([^<]+)<\/value>/.exec(metadata);
  if (!newestJar) {
    throw new Error(`No jar listed in the metadata of ${artifact} ${COCKPIT_VERSION}`);
  }
  return `${artifact}-${newestJar[1]}.jar`;
}

async function fetchOpenApiFile({ artifact, pathInJar, target }) {
  const jar = await download(`${folderOf(artifact)}/${await jarFileNameOf(artifact)}`);
  const content = unzipSync(jar, { filter: (entry) => entry.name === pathInJar })[pathInJar];
  if (!content) {
    throw new Error(`The jar of ${artifact} has no ${pathInJar}`);
  }
  writeFileSync(join(outputFolder, target), content);
}

const alreadyThere = openApiFiles.every(({ target }) => existsSync(join(outputFolder, target)));
if (alreadyThere && !process.argv.includes('--force')) {
  process.exit(0);
}
mkdirSync(outputFolder, { recursive: true });
await Promise.all(openApiFiles.map(fetchOpenApiFile));
console.log(`OpenAPI files of ${COCKPIT_VERSION} written to ${outputFolder}`);
