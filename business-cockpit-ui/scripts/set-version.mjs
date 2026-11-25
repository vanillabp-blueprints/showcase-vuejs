// Writes one version into the root, every workspace and the dependencies between the workspaces.
// Usage: node scripts/set-version.mjs 0.2.0-SNAPSHOT [--no-install]
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, ...flags] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? '')) {
  console.error('usage: node scripts/set-version.mjs <version> [--no-install]');
  process.exit(1);
}

const root = process.env.REPOSITORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const rootPackage = readJson('package.json');

const workspaceFolders = rootPackage.workspaces.flatMap((pattern) => {
  if (!pattern.endsWith('*')) return [pattern];
  const prefix = basename(pattern).slice(0, -1);
  return readdirSync(join(root, dirname(pattern))).filter((name) => name.startsWith(prefix)).sort().map((name) => `${dirname(pattern)}/${name}`);
});
const manifests = ['package.json', ...workspaceFolders.map((folder) => `${folder}/package.json`)];
const workspaceNames = new Set(manifests.slice(1).map((path) => readJson(path).name));

for (const path of manifests) {
  const manifest = readJson(path);
  manifest.version = version;
  for (const kind of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[kind] ?? {})) {
      if (workspaceNames.has(name)) manifest[kind][name] = version;
    }
  }
  writeFileSync(join(root, path), `${JSON.stringify(manifest, null, 2)}\n`);
}

// The lock file follows the new versions.
if (!flags.includes('--no-install')) execSync('npm install --package-lock-only', { cwd: root, stdio: 'inherit' });
