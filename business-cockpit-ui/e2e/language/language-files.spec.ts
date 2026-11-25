import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const failureOf = (command: string, args: string[], env: NodeJS.ProcessEnv = {}, cwd = '.'): string => {
  try {
    execFileSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
  } catch (error) {
    const { stdout, stderr } = error as { stdout: Buffer; stderr: Buffer };
    return `${stdout}${stderr}`;
  }
  return '';
};

const folderWithoutKey = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'i18n-'));
  cpSync('packages/ui/src/i18n', folder, { recursive: true });
  const german = join(folder, 'de.ts');
  writeFileSync(german, readFileSync(german, 'utf8').replace("  logout: 'Abmelden',\n", ''));
  return folder;
};

test('I18N-006 the check names the language file and the key it misses, and passes on complete files', () => {
  const folder = folderWithoutKey();
  const output = failureOf('node', ['scripts/check-languages.mjs', folder]);
  expect(output).toContain(join(folder, 'de.ts'));
  expect(output).toContain("'logout'");
  expect(failureOf('node', ['scripts/check-languages.mjs'])).toBe('');
});

test('I18N-006 the build fails when a language file misses a key, naming the file and the key', () => {
  const folder = folderWithoutKey();
  const output = failureOf('npx', ['vite', 'build', '--outDir', join(folder, 'dist'), '--emptyOutDir'], {
    BC_I18N_FOLDER: folder,
  }, 'packages/ui');
  expect(output).toContain(join(folder, 'de.ts'));
  expect(output).toContain("'logout'");
});
