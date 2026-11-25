// Every language file has the keys of the file of the default language (I18N-006).
// Run `node scripts/check-languages.mjs [folder]`, or call missingKeys from the build.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultLanguageFile = 'en.ts';
const defaultFolder = 'packages/ui/src/i18n';
const nonLanguageFiles = ['messages.ts', 'translatable.ts', 'format.ts'];

const keysOf = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, inner]) =>
    inner !== null && typeof inner === 'object' ? keysOf(inner, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

const load = async (folder, file) => (await import(pathToFileURL(resolve(folder, file)).href)).default;

// Returns one { file, key } for every key a language file misses.
export const missingKeys = async (folder = defaultFolder) => {
  const languageFiles = readdirSync(folder).filter(
    (file) => file.endsWith('.ts') && !nonLanguageFiles.includes(file),
  );
  const expected = keysOf(await load(folder, defaultLanguageFile));
  const missing = [];
  for (const file of languageFiles.filter((file) => file !== defaultLanguageFile)) {
    const present = new Set(keysOf(await load(folder, file)));
    for (const key of expected.filter((key) => !present.has(key))) {
      missing.push({ file: join(folder, file), key });
    }
  }
  return missing;
};

export const describeMissing = (missing) =>
  missing.map(({ file, key }) => `Language file ${file} misses the key '${key}' of ${defaultLanguageFile}`).join('\n');

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const missing = await missingKeys(process.argv[2]);
  if (missing.length > 0) {
    console.error(describeMissing(missing));
    process.exit(1);
  }
}
