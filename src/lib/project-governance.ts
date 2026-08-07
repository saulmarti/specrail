import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadProjectConfig } from './project.js';

const GOVERNED_PROJECT_FILES = [
  'product.md',
  'product-owner.md',
  'users.md',
  'architecture.md',
  'design-system.md',
  'runbook.md',
  'constitution.md'
] as const;

const GOVERNED_CONFIG_KEYS = [
  'version',
  'codegraph',
  'subagents',
  'evidence',
  'visualize',
  'repairs',
  'quality',
  'observability',
  'failures',
  'metrics',
  'leases',
  'adaptivePolicy',
  'contextBudget'
] as const;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

function normalizedText(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

export function projectGovernanceSnapshot(root: string): Record<string, unknown> {
  const projectRoot = path.resolve(root), config = loadProjectConfig(projectRoot);
  const policy: Record<string, unknown> = {};
  for (const key of GOVERNED_CONFIG_KEYS) policy[key] = config[key];
  const files: Record<string, string | null> = {};
  for (const name of GOVERNED_PROJECT_FILES) files[`.ai/project/${name}`] = normalizedText(path.join(projectRoot, '.ai', 'project', name));
  return { schemaVersion: 1, policy, files };
}

export function projectGovernanceHash(root: string): string {
  return createHash('sha256').update(stable(projectGovernanceSnapshot(root))).digest('hex');
}
