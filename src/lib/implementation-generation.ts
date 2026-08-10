import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { scopeGuardStatus } from './scope-guard.js';
import type { TaskDocument } from './types.js';

export const IMPLEMENTATION_DEPENDENT_EVIDENCE_KINDS = new Set([
  'frontend-after','frontend-mobile-after','ui-after-validation','backend-demo','test-log','migration-log',
  'database-final','architecture-final','technical-review-report','qa-report','customer-report',
  'visual-final-evaluator-report','property-test-report','mutation-test-report','constitution-report',
  'operational-log','operational-trace','operational-metrics','revision-validation-report'
]);

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }

export function implementationDigest(root: string, task: TaskDocument): string {
  const scope = scopeGuardStatus(root, task.meta.id);
  const workspace = task.meta.worktree_path && existsSync(task.meta.worktree_path) ? task.meta.worktree_path : path.resolve(root);
  const files = [...scope.actualFiles].sort().map(file => {
    const absolute = path.join(workspace, file);
    if (!existsSync(absolute)) return { path: file, state: 'deleted' };
    try { return { path: file, sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') }; }
    catch { return { path: file, state: 'unreadable' }; }
  });
  return digest({ taskId: task.meta.id, effectiveSpecification: task.meta.spec_effective_hash || task.meta.spec_approval_hash || null, files });
}

export function advanceImplementationGeneration(root: string, task: TaskDocument, revisionId: string | null = null): { id: string; number: number; digest: string } {
  const number = Math.max(0, Number(task.meta.implementation_generation || 0)) + 1;
  const id = `GEN-${String(number).padStart(3, '0')}`;
  const currentDigest = implementationDigest(root, task);
  task.meta.implementation_generation = number;
  task.meta.implementation_generation_id = id;
  task.meta.implementation_digest = currentDigest;
  task.meta.implementation_revision_id = revisionId;
  return { id, number, digest: currentDigest };
}

export function evidenceGenerationMatches(task: TaskDocument, item: { kind: string; implementationGeneration?: string | null }): boolean {
  if (!IMPLEMENTATION_DEPENDENT_EVIDENCE_KINDS.has(item.kind)) return true;
  const current = String(task.meta.implementation_generation_id || '');
  if (!current) return true;
  return String(item.implementationGeneration || '') === current;
}
