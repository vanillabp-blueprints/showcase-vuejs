#!/usr/bin/env node
// Fails the build of a workflow module when its manifest names an entry without a file, or when a
// data entry (with every file it imports) is too large or contains the code of a framework.
// Usage: bc-check-entries dist/bc-manifest.json [--limit 32kb] [--data-entry Header]
// No dependencies: plain Node.js.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DATA_ENTRIES = ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage', 'Header', 'Pages'];
// The entries which draw something; they are checked for their file only.
const VISUAL_ENTRIES = ['UserTaskForm', 'WorkflowPage'];
const FRAMEWORK_MARKERS = [
  '@license React', 'react.transitional.element', '__CLIENT_INTERNALS_', '__SECRET_INTERNALS_',
  '__vue_app__', '__v_isRef', '@license Angular', 'ɵɵdefineComponent', '__zone_symbol__', 'litHtmlVersions',
];
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"]+)\1/gm;

function parseSize(text) {
  const match = /^(\d+(?:\.\d+)?)\s*(kb|mb)?$/i.exec(text);
  if (!match) throw new Error(`cannot read the limit "${text}"`);
  const unit = { kb: 1024, mb: 1024 * 1024 }[(match[2] ?? '').toLowerCase()] ?? 1;
  return Math.round(Number(match[1]) * unit);
}

function readArguments(argv) {
  const options = { manifest: undefined, limit: parseSize('32kb'), dataEntries: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') options.limit = parseSize(argv[++i]);
    else if (argv[i] === '--data-entry') options.dataEntries.push(argv[++i]);
    else options.manifest = argv[i];
  }
  if (!options.manifest) throw new Error('usage: bc-check-entries <bc-manifest.json> [--limit 32kb] [--data-entry <name>]');
  return options;
}

/** The file and every relative file it imports, statically or dynamically with a fixed string. */
function filesOf(entryFile, problems) {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    if (!existsSync(file)) return void problems.push(`${file} is imported but does not exist`);
    const text = readFileSync(file, 'utf8');
    seen.set(file, text);
    for (const match of text.matchAll(IMPORT)) visit(resolve(dirname(file), match[2]));
  };
  visit(entryFile);
  return seen;
}

function check({ manifest, limit, dataEntries }) {
  const problems = [];
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  if (parsed.manifestVersion !== 1) problems.push('manifestVersion must be 1');
  const folder = dirname(resolve(manifest));
  const names = new Set([...DATA_ENTRIES.filter((name) => !VISUAL_ENTRIES.includes(name)), ...dataEntries]);
  for (const [entry, file] of Object.entries(parsed.entries ?? {})) {
    const path = resolve(folder, file);
    if (!existsSync(path)) {
      problems.push(`entry ${entry}: file ${file} does not exist`);
      continue;
    }
    if (!names.has(entry)) continue;
    const files = filesOf(path, problems);
    const size = [...files.values()].reduce((sum, text) => sum + Buffer.byteLength(text), 0);
    if (size > limit) problems.push(`data entry ${entry} with its imports has ${size} bytes, the limit is ${limit}`);
    for (const [file, text] of files) {
      const marker = FRAMEWORK_MARKERS.find((candidate) => text.includes(candidate));
      if (marker) problems.push(`data entry ${entry}: ${file} contains framework code (${marker})`);
    }
  }
  return problems;
}

try {
  const problems = check(readArguments(process.argv.slice(2)));
  for (const problem of problems) console.error(`bc-check-entries: ${problem}`);
  process.exit(problems.length > 0 ? 1 : 0);
} catch (error) {
  console.error(`bc-check-entries: ${error.message}`);
  process.exit(2);
}
