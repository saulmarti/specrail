import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inferUpdateChannel, updateSpecRail } from '../dist/src/lib/update.js';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function writePackage(dir, version) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: '@saulmarti/specrail', version }, null, 2)}\n`);
}

test('update preserves beta for beta builds and uses latest for stable builds', () => {
  assert.equal(inferUpdateChannel('0.9.0-beta.0'), 'beta');
  assert.equal(inferUpdateChannel('1.0.0'), 'latest');
  assert.equal(inferUpdateChannel('1.0.0-rc.1'), 'latest');
});

test('update installs from the selected npm channel and refreshes managed assets using the newly installed CLI', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'specrail-update-'));
  const home = path.join(sandbox, 'home');
  const globalRoot = path.join(sandbox, 'global', 'node_modules');
  const globalPackage = path.join(globalRoot, '@saulmarti', 'specrail');
  const updatedCli = path.join(globalPackage, 'dist', 'src', 'cli.js');
  const calls = [];
  writePackage(globalPackage, '0.9.0-beta.3');
  mkdirSync(path.dirname(updatedCli), { recursive: true });
  writeFileSync(updatedCli, '// test CLI\n');

  const runner = (command, args, options) => {
    calls.push([command, ...args]);
    if (command === 'npm' && args[0] === 'install') return { status: 0, stdout: 'updated\n', stderr: '', error: null };
    if (command === 'npm' && args[0] === 'root') return { status: 0, stdout: `${globalRoot}\n`, stderr: '', error: null };
    if (command === process.execPath && args[0] === updatedCli && args[1] === 'install') {
      writePackage(path.join(options.env.AI_FLOW_HOME, '.ai-flow'), '0.9.0-beta.3');
      return { status: 0, stdout: 'SpecRail installed\n', stderr: '', error: null };
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${command} ${args.join(' ')}`, error: null };
  };

  const result = updateSpecRail({
    currentVersion: '0.9.0-beta.0',
    channel: 'beta',
    env: { ...process.env, AI_FLOW_HOME: home },
    runner
  });

  assert.equal(result.status, 'updated');
  assert.equal(result.toVersion, '0.9.0-beta.3');
  assert.equal(result.changed, true);
  assert.equal(result.managedInstallationRefreshed, true);
  assert.deepEqual(calls[0], ['npm', 'install', '--global', '--no-audit', '--no-fund', '@saulmarti/specrail@beta']);
  assert.deepEqual(calls[1], ['npm', 'root', '--global']);
  assert.deepEqual(calls[2], [process.execPath, updatedCli, 'install']);
  assert.equal(JSON.parse(readFileSync(path.join(home, '.ai-flow', 'package.json'), 'utf8')).version, '0.9.0-beta.3');
});

test('update dry-run is network-free and exposes the exact update plan', () => {
  let called = false;
  const result = updateSpecRail({
    currentVersion: '1.2.3',
    channel: 'latest',
    dryRun: true,
    runner: () => {
      called = true;
      return { status: 1, stdout: '', stderr: '', error: null };
    }
  });
  assert.equal(called, false);
  assert.equal(result.status, 'planned');
  assert.equal(result.target, '@saulmarti/specrail@latest');
  assert.equal(result.managedInstallationRefreshed, false);
});

test('CLI update defaults to the installed channel and supports explicit channel switching', () => {
  const beta = spawnSync(process.execPath, ['dist/src/cli.js', 'update', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(beta.status, 0, beta.stderr);
  const betaPlan = JSON.parse(beta.stdout);
  assert.equal(betaPlan.channel, pkg.version.includes('-beta.') ? 'beta' : 'latest');

  const latest = spawnSync(process.execPath, ['dist/src/cli.js', 'update', '--latest', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(latest.status, 0, latest.stderr);
  assert.equal(JSON.parse(latest.stdout).channel, 'latest');

  const invalid = spawnSync(process.execPath, ['dist/src/cli.js', 'update', '--beta', '--latest', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /only one update channel/i);
});
