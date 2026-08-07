import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');

const files = {
  package: path.join(root, 'package.json'),
  plugin: path.join(root, 'plugin.json'),
  lock: path.join(root, 'package-lock.json'),
};

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const pkg = readJson(files.package);
const plugin = readJson(files.plugin);
const lock = readJson(files.lock);
const expected = pkg.version;

if (typeof expected !== 'string' || expected.length === 0) {
  throw new Error('package.json must define a non-empty version');
}

const mismatches = [];

if (plugin.version !== expected) {
  mismatches.push(`plugin.json: ${plugin.version ?? '<missing>'} != ${expected}`);
}
if (lock.version !== expected) {
  mismatches.push(`package-lock.json: ${lock.version ?? '<missing>'} != ${expected}`);
}
if (lock.packages?.['']?.version !== expected) {
  mismatches.push(`package-lock.json packages[""]: ${lock.packages?.['']?.version ?? '<missing>'} != ${expected}`);
}

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error('SpecRail version metadata is out of sync:');
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    console.error('Run `npm run version:sync` and retry.');
    process.exitCode = 1;
  } else {
    console.log(`SpecRail version metadata is synchronized at ${expected}.`);
  }
} else {
  let changed = false;

  if (plugin.version !== expected) {
    plugin.version = expected;
    writeJson(files.plugin, plugin);
    changed = true;
  }

  if (lock.version !== expected || lock.packages?.['']?.version !== expected) {
    lock.version = expected;
    if (!lock.packages || !lock.packages['']) {
      throw new Error('package-lock.json is missing packages[""] metadata');
    }
    lock.packages[''].version = expected;
    writeJson(files.lock, lock);
    changed = true;
  }

  console.log(changed
    ? `Synced SpecRail version metadata to ${expected}.`
    : `SpecRail version metadata already synchronized at ${expected}.`);
}
