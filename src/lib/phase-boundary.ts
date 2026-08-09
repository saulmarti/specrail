import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acquireTaskLease } from './lease.js';
import { findTask, loadTask } from './task.js';
import type { TaskPhase } from './types.js';

export type BoundaryMode = 'same-chat' | 'fresh-chat' | 'unknown';
export type BoundaryRecommendation = 'same-chat-ok' | 'fresh-chat-recommended';
export type BoundaryRole = 'implementer' | 'reviewer';

export interface PhaseBoundaryRecord {
  schemaVersion: 2;
  taskId: string;
  phase: TaskPhase;
  role: BoundaryRole;
  handoffDigest: string;
  handoffContentDigest: string;
  status: 'required' | 'entered';
  recommendation: BoundaryRecommendation;
  sameChatAllowed: true;
  originSessionId: string | null;
  enteredSessionId: string | null;
  mode: BoundaryMode | null;
  createdAt: string;
  enteredAt: string | null;
  recordDigest: string;
}

function now(): string { return new Date().toISOString(); }
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function fileFor(root: string, taskId: string, phase: TaskPhase): string {
  return path.join(path.resolve(root), '.ai', 'runtime', 'boundaries', `${taskId}-${phase}.json`);
}
function boundaryRole(phase: TaskPhase): BoundaryRole | null {
  if (phase === 'builder') return 'implementer';
  if (phase === 'technical-reviewer') return 'reviewer';
  return null;
}
function recordPayload(record: Omit<PhaseBoundaryRecord, 'recordDigest'> | PhaseBoundaryRecord) {
  const { recordDigest: _ignored, ...payload } = record as PhaseBoundaryRecord;
  return payload;
}
function signed(record: Omit<PhaseBoundaryRecord, 'recordDigest'>): PhaseBoundaryRecord {
  return { ...record, recordDigest: digest(record) };
}
function writeRecord(root: string, record: PhaseBoundaryRecord): PhaseBoundaryRecord {
  const file = fileFor(root, record.taskId, record.phase);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmp, file);
  return record;
}
function validateRecord(record: PhaseBoundaryRecord): void {
  if (record.schemaVersion !== 2) throw new Error('Unsupported phase-boundary schema');
  if (digest(recordPayload(record)) !== record.recordDigest) throw new Error(`Phase-boundary integrity check failed for ${record.taskId} ${record.phase}`);
  if (!/^[a-f0-9]{64}$/.test(record.handoffDigest) || !/^[a-f0-9]{64}$/.test(record.handoffContentDigest)) throw new Error(`Phase-boundary handoff integrity metadata is invalid for ${record.taskId} ${record.phase}`);
}
function recommendationForTask(task: ReturnType<typeof loadTask>, role: BoundaryRole, handoffWords: number): BoundaryRecommendation {
  const size = String(task.meta.size || '').trim().toLowerCase();
  const risk = String(task.meta.risk || '').trim().toLowerCase();
  const tiny = ['tiny', 'small'].includes(size);
  const lowRisk = ['low', 'minor'].includes(risk);
  if (role === 'implementer' && tiny && lowRisk && handoffWords <= 1400) return 'same-chat-ok';
  if (role === 'reviewer' && tiny && lowRisk && handoffWords <= 900) return 'same-chat-ok';
  return 'fresh-chat-recommended';
}

export function loadPhaseBoundary(root: string, id: string, phase: TaskPhase): PhaseBoundaryRecord | null {
  const task = loadTask(findTask(root, id));
  const file = fileFor(root, task.meta.id, phase);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  // Runtime boundary v1 was advisory and unsigned. It is safe to discard and
  // force a new explicit entry rather than silently promote it.
  if (Number(raw.schemaVersion) === 1) { rmSync(file, { force: true }); return null; }
  const record = raw as unknown as PhaseBoundaryRecord;
  validateRecord(record);
  if (record.taskId !== task.meta.id || record.phase !== phase) throw new Error(`Phase-boundary identity mismatch for ${task.meta.id} ${phase}`);
  return record;
}

export function invalidatePhaseBoundary(root: string, id: string, phase: TaskPhase): void {
  const task = loadTask(findTask(root, id));
  rmSync(fileFor(root, task.meta.id, phase), { force: true });
}

export function phaseBoundaryStatus(
  root: string,
  id: string,
  options: { sessionId?: string | null; handoffDigest?: string | null; handoffContentDigest?: string | null; handoffWords?: number | null } = {}
): PhaseBoundaryRecord | null {
  const task = loadTask(findTask(root, id));
  const role = boundaryRole(task.meta.phase);
  if (!role) return null;
  const handoffDigest = String(options.handoffDigest || '').trim();
  const handoffContentDigest = String(options.handoffContentDigest || '').trim();
  if (!handoffDigest || !handoffContentDigest) throw new Error(`Phase boundary for ${task.meta.phase} requires deterministic handoff source and content digests`);
  const handoffWords = Number(options.handoffWords || 0);
  const existing = loadPhaseBoundary(root, task.meta.id, task.meta.phase);
  if (existing) {
    if (existing.handoffDigest === handoffDigest && existing.handoffContentDigest === handoffContentDigest && existing.role === role) return existing;
    invalidatePhaseBoundary(root, task.meta.id, task.meta.phase);
  }
  const record = signed({
    schemaVersion: 2,
    taskId: task.meta.id,
    phase: task.meta.phase,
    role,
    handoffDigest,
    handoffContentDigest,
    status: 'required',
    recommendation: recommendationForTask(task, role, handoffWords),
    sameChatAllowed: true,
    originSessionId: options.sessionId ? String(options.sessionId) : null,
    enteredSessionId: null,
    mode: null,
    createdAt: now(),
    enteredAt: null
  });
  return writeRecord(root, record);
}

export function enterPhaseBoundary(
  root: string,
  id: string,
  options: { sessionId?: string | null; handoffDigest?: string | null; handoffContentDigest?: string | null; handoffWords?: number | null } = {}
): PhaseBoundaryRecord {
  const task = loadTask(findTask(root, id));
  const existing = boundaryRole(task.meta.phase) ? loadPhaseBoundary(root, task.meta.id, task.meta.phase) : null;
  const current = phaseBoundaryStatus(root, id, {
    ...options,
    handoffDigest: options.handoffDigest ?? existing?.handoffDigest ?? null,
    handoffContentDigest: options.handoffContentDigest ?? existing?.handoffContentDigest ?? null
  });
  if (!current) throw new Error('No implementation/review phase boundary is active for this task');
  const sessionId = String(options.sessionId || '').trim();
  if (!sessionId) throw new Error('Phase boundary entry requires a stable Codex session ID so ownership and same-chat/fresh-chat mode cannot be forged or left ambiguous');
  const inferredMode: BoundaryMode = current.originSessionId ? (current.originSessionId !== sessionId ? 'fresh-chat' : 'same-chat') : 'unknown';
  const next = signed({
    ...recordPayload(current),
    status: 'entered',
    enteredSessionId: sessionId,
    mode: inferredMode,
    enteredAt: now()
  } as Omit<PhaseBoundaryRecord, 'recordDigest'>);
  // Entering a writing/review phase is also the ownership boundary. Acquire
  // ownership *before* persisting `entered` so a lease conflict can never leave
  // behind a boundary record that falsely claims the phase is ready to run.
  acquireTaskLease(root, current.taskId, { sessionId, phase: current.phase });
  writeRecord(root, next);
  return next;
}

export function assertPhaseBoundaryEntered(root: string, id: string, phase: TaskPhase, sessionId?: string | null): PhaseBoundaryRecord {
  const record = loadPhaseBoundary(root, id, phase);
  if (!record || record.status !== 'entered') throw new Error(`Phase boundary for ${phase} must be explicitly entered before phase work can continue`);
  const currentSession = String(sessionId || '').trim();
  if (!currentSession) throw new Error(`Phase boundary for ${phase} requires the stable Codex session ID that entered it`);
  if (!record.enteredSessionId || record.enteredSessionId !== currentSession) throw new Error(`Phase boundary for ${phase} was entered by another session: ${record.enteredSessionId || 'unknown'}`);
  return record;
}

export function boundaryRecordDigest(record: PhaseBoundaryRecord): string {
  validateRecord(record);
  return digest({ taskId: record.taskId, phase: record.phase, role: record.role, handoffDigest: record.handoffDigest, handoffContentDigest: record.handoffContentDigest, mode: record.mode, enteredAt: record.enteredAt });
}
