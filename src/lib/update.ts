import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SPEC_RAIL_PACKAGE = '@saulmarti/specrail';
export type UpdateChannel = 'beta' | 'latest';

export interface UpdateCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export type UpdateCommandRunner = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv }
) => UpdateCommandResult;

export interface UpdateOptions {
  currentVersion: string;
  channel?: UpdateChannel;
  dryRun?: boolean;
  npmCommand?: string;
  packageName?: string;
  env?: NodeJS.ProcessEnv;
  runner?: UpdateCommandRunner;
}

export interface UpdateResult {
  status: 'planned' | 'updated';
  packageName: string;
  channel: UpdateChannel;
  target: string;
  fromVersion: string;
  toVersion: string | null;
  changed: boolean | null;
  managedInstallationRefreshed: boolean;
  managedRoot: string;
  globalPackageRoot: string | null;
  commands: string[][];
}

function defaultRunner(command: string, args: string[], options: { env: NodeJS.ProcessEnv }): UpdateCommandResult {
  const result = spawnSync(command, args, { encoding: 'utf8', env: options.env });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null
  };
}

function readVersion(packageFile: string): string {
  if (!existsSync(packageFile)) throw new Error(`Expected package metadata is missing: ${packageFile}`);
  const value = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: unknown };
  if (typeof value.version !== 'string' || !value.version.trim()) throw new Error(`Package metadata has no valid version: ${packageFile}`);
  return value.version.trim();
}

function checkedRun(runner: UpdateCommandRunner, command: string, args: string[], env: NodeJS.ProcessEnv, label: string): UpdateCommandResult {
  const result = runner(command, args, { env });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error || '').trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function inferUpdateChannel(version: string): UpdateChannel {
  return /-beta(?:\.|$)/i.test(String(version || '').trim()) ? 'beta' : 'latest';
}

export function updateSpecRail(options: UpdateOptions): UpdateResult {
  const packageName = options.packageName || SPEC_RAIL_PACKAGE;
  const channel = options.channel || inferUpdateChannel(options.currentVersion);
  const npmCommand = options.npmCommand || 'npm';
  const env = options.env || process.env;
  const runner = options.runner || defaultRunner;
  const installHome = path.resolve(env.AI_FLOW_HOME || os.homedir());
  const managedRoot = path.join(installHome, '.ai-flow');
  const target = `${packageName}@${channel}`;
  const installArgs = ['install', '--global', '--no-audit', '--no-fund', target];
  const rootArgs = ['root', '--global'];
  const commands: string[][] = [[npmCommand, ...installArgs]];

  if (options.dryRun) {
    commands.push([npmCommand, ...rootArgs], [process.execPath, '<global-package-root>/dist/src/cli.js', 'install']);
    return {
      status: 'planned',
      packageName,
      channel,
      target,
      fromVersion: options.currentVersion,
      toVersion: null,
      changed: null,
      managedInstallationRefreshed: false,
      managedRoot,
      globalPackageRoot: null,
      commands
    };
  }

  checkedRun(runner, npmCommand, installArgs, env, `Installing ${target}`);
  const rootResult = checkedRun(runner, npmCommand, rootArgs, env, 'Resolving the global npm package root');
  const globalRoot = rootResult.stdout.trim();
  if (!globalRoot) throw new Error('npm returned an empty global package root');

  const globalPackageRoot = path.resolve(globalRoot, packageName);
  const globalPackageFile = path.join(globalPackageRoot, 'package.json');
  const installedVersion = readVersion(globalPackageFile);
  const updatedCli = path.join(globalPackageRoot, 'dist', 'src', 'cli.js');
  if (!existsSync(updatedCli)) throw new Error(`Updated SpecRail CLI is missing: ${updatedCli}`);

  commands.push([npmCommand, ...rootArgs], [process.execPath, updatedCli, 'install']);
  checkedRun(runner, process.execPath, [updatedCli, 'install'], env, 'Refreshing the managed SpecRail installation');

  const managedVersion = readVersion(path.join(managedRoot, 'package.json'));
  if (managedVersion !== installedVersion) {
    throw new Error(`Managed SpecRail version ${managedVersion} does not match globally installed version ${installedVersion}`);
  }

  return {
    status: 'updated',
    packageName,
    channel,
    target,
    fromVersion: options.currentVersion,
    toVersion: installedVersion,
    changed: installedVersion !== options.currentVersion,
    managedInstallationRefreshed: true,
    managedRoot,
    globalPackageRoot,
    commands
  };
}
