import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runSync(cwd, ...args) {
  return spawnSync(process.execPath, ['scripts/sync-version.mjs', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('version sync repairs plugin and lock metadata from package.json', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'specrail-version-sync-'));
  const scriptsDir = path.join(fixture, 'scripts');
  cpSync(path.join(root, 'scripts'), scriptsDir, { recursive: true });

  writeJson(path.join(fixture, 'package.json'), { name: '@saulmarti/specrail', version: '9.8.7-beta.6' });
  writeJson(path.join(fixture, 'plugin.json'), { name: 'specrail', version: '0.0.1' });
  writeJson(path.join(fixture, 'package-lock.json'), {
    name: '@saulmarti/specrail',
    version: '0.0.1',
    lockfileVersion: 3,
    packages: { '': { name: '@saulmarti/specrail', version: '0.0.1' } },
  });

  const before = runSync(fixture, '--check');
  assert.notEqual(before.status, 0);
  assert.match(before.stderr, /out of sync/i);

  const sync = runSync(fixture);
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);

  const plugin = JSON.parse(readFileSync(path.join(fixture, 'plugin.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(fixture, 'package-lock.json'), 'utf8'));
  assert.equal(plugin.version, '9.8.7-beta.6');
  assert.equal(lock.version, '9.8.7-beta.6');
  assert.equal(lock.packages[''].version, '9.8.7-beta.6');

  const after = runSync(fixture, '--check');
  assert.equal(after.status, 0, after.stderr || after.stdout);
});

test('package lifecycle validates and synchronizes all release version metadata', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['version:sync'], 'node scripts/sync-version.mjs');
  assert.equal(pkg.scripts['version:check'], 'node scripts/sync-version.mjs --check');
  assert.equal(pkg.scripts.version, 'npm run version:sync && npm run version:check');
  assert.match(pkg.scripts.check, /version:check/);

  const result = runSync(root, '--check');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
