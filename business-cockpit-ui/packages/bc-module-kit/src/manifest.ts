import { MANIFEST_VERSION, type BcManifest } from '@acme/bc-types';

export class BcManifestError extends Error {}

/** Every rule the manifest breaks; empty when it is fine. */
export function checkManifest(manifest: unknown): string[] {
  const m = manifest as Partial<BcManifest> | null;
  if (!m || typeof m !== 'object') return ['the manifest is no object'];
  const problems: string[] = [];
  if (typeof m.manifestVersion !== 'number' || m.manifestVersion > MANIFEST_VERSION) problems.push(`manifestVersion ${String(m.manifestVersion)} is not known, the newest known is ${MANIFEST_VERSION}`);
  if (!m.entries || typeof m.entries !== 'object') return [...problems, 'entries is missing'];
  for (const [entry, file] of Object.entries(m.entries)) {
    const path = String(file).split(/[?#]/)[0];
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') || path.split('/').includes('..') || !path) {
      problems.push(`entry ${entry}: the file "${String(file)}" is no relative path below the module`);
    }
  }
  return problems;
}

export function readManifest(source: string | unknown): BcManifest {
  const manifest = typeof source === 'string' ? JSON.parse(source) : source;
  const problems = checkManifest(manifest);
  if (problems.length) throw new BcManifestError(problems.join('; '));
  return manifest as BcManifest;
}

export function createManifest(options: { entries: BcManifest['entries']; buildVersion?: string; buildTimestamp?: string }): BcManifest {
  return { manifestVersion: MANIFEST_VERSION, ...options };
}

export function entryUrl(manifest: BcManifest, entry: string, manifestUrl: string): string {
  const file = manifest.entries[entry];
  if (file === undefined) throw new BcManifestError(`the manifest has no entry ${entry}`);
  return new URL(file, manifestUrl).href;
}
