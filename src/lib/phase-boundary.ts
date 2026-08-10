import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acquireTaskLease, leaseStatus, releaseTaskLease } from './lease.js';
import { findTask, loadTask, saveTask } from './task.js';
import { assertConcurrencyMutationAuthority } from './concurrency-state.js';
import type { TaskPhase } from './types.js';

export type BoundaryMode = 'same-chat' | 'fresh-chat' | 'unknown';
export type BoundaryRecommendation = 'same-chat-ok' | 'fresh-chat-recommended' | 'fresh-chat-required';
export type BoundaryRole = 'implementer' | 'reviewer' | 'target-audience';
export type BoundaryChoice = 'continue-current' | 'pause-model-change' | 'fresh-chat';

export interface PhaseBoundaryRecord {
  schemaVersion: 3;
  taskId: string;
  phase: TaskPhase;
  role: BoundaryRole;
  handoffDigest: string;
  handoffContentDigest: string;
  status: 'required' | 'chosen' | 'entered';
  recommendation: BoundaryRecommendation;
  sameChatAllowed: boolean;
  originSessionId: string | null;
  choice: BoundaryChoice | null;
  choiceSessionId: string | null;
  chosenAt: string | null;
  enteredSessionId: string | null;
  mode: BoundaryMode | null;
  forbiddenSessionIds?: string[];
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
  if (phase === 'final-customer') return 'target-audience';
  return null;
}

function audienceForbiddenSessions(task: ReturnType<typeof loadTask>, originSessionId?: string | null): string[] {
  const raw = Array.isArray(task.meta.target_audience_forbidden_session_ids) ? task.meta.target_audience_forbidden_session_ids : [];
  const values = [...raw.map(String), String(task.meta.target_audience_origin_session_id || ''), String(originSessionId || '')]
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(values)].sort();
}

function rememberTargetAudienceSession(root: string, id: string, sessionId: string, updateOrigin: boolean): string[] {
  const task = loadTask(findTask(root, id));
  const values = audienceForbiddenSessions(task, sessionId);
  if (updateOrigin) task.meta.target_audience_origin_session_id = sessionId;
  task.meta.target_audience_forbidden_session_ids = values;
  saveTask(task);
  return values;
}

export function rememberTargetAudienceSourceSession(root: string, id: string, sessionId?: string | null): string[] {
  const value = String(sessionId || '').trim();
  if (!value) throw new Error('Target Audience source-session tracking requires a stable session ID');
  return rememberTargetAudienceSession(root, id, value, true);
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
  if (record.schemaVersion !== 3) throw new Error('Unsupported phase-boundary schema');
  if (digest(recordPayload(record)) !== record.recordDigest) throw new Error(`Phase-boundary integrity check failed for ${record.taskId} ${record.phase}`);
  if (!/^[a-f0-9]{64}$/.test(record.handoffDigest) || !/^[a-f0-9]{64}$/.test(record.handoffContentDigest)) throw new Error(`Phase-boundary handoff integrity metadata is invalid for ${record.taskId} ${record.phase}`);
  if (record.status === 'required' && (record.choice || record.choiceSessionId || record.chosenAt)) throw new Error(`Phase-boundary required state cannot already contain a user choice for ${record.taskId} ${record.phase}`);
  if (record.status !== 'required' && (!record.choice || !record.choiceSessionId || !record.chosenAt)) throw new Error(`Phase-boundary ${record.status} state is missing the persisted user choice for ${record.taskId} ${record.phase}`);
}
function recommendationForTask(task: ReturnType<typeof loadTask>, role: BoundaryRole, handoffWords: number): BoundaryRecommendation {
  if (role === 'target-audience') return 'fresh-chat-required';
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
  // Older boundary schemas did not persist the explicit native boundary choice.
  // Requiring the choice again is safer than silently promoting legacy state.
  if ([1,2].includes(Number(raw.schemaVersion))) { rmSync(file, { force: true }); return null; }
  const record = raw as unknown as PhaseBoundaryRecord;
  validateRecord(record);
  if (record.taskId !== task.meta.id || record.phase !== phase) throw new Error(`Phase-boundary identity mismatch for ${task.meta.id} ${phase}`);
  return record;
}

export function invalidatePhaseBoundary(root: string, id: string, phase: TaskPhase): void {
  const task = loadTask(findTask(root, id));
  const file = fileFor(root, task.meta.id, phase);
  if (!existsSync(file)) return;
  const record = loadPhaseBoundary(root, task.meta.id, phase);
  rmSync(file, { force: true });
  // A boundary is the ownership record for its phase. Once its source is stale
  // or the workflow rotates to another role/persona, the old session must not
  // retain the task lease; otherwise a required fresh session cannot enter.
  if (record?.enteredSessionId) releaseTaskLease(root, task.meta.id, { sessionId: record.enteredSessionId });
}


export function resetPhaseBoundary(root: string, id: string, phase?: TaskPhase | null, options: { force?: boolean } = {}): { taskId: string; phase: TaskPhase; reset: true } {
  if (!options.force) throw new Error('Phase-boundary reset is administrative recovery and requires force=true');
  const task = loadTask(findTask(root, id));
  const targetPhase = phase ?? task.meta.phase;
  if (!boundaryRole(targetPhase)) throw new Error(`No phase boundary is defined for ${targetPhase}`);
  // Recovery deliberately does not parse or trust the existing boundary JSON.
  // Removing the task lease as well prevents an owner encoded only in a corrupt
  // record from blocking the freshly compiled replacement boundary.
  rmSync(fileFor(root, task.meta.id, targetPhase), { force: true });
  releaseTaskLease(root, task.meta.id, { force: true });
  return { taskId: task.meta.id, phase: targetPhase, reset: true };
}

export function phaseBoundaryStatus(
  root: string,
  id: string,
  options: { sessionId?: string | null; originSessionId?: string | null; handoffDigest?: string | null; handoffContentDigest?: string | null; handoffWords?: number | null } = {}
): PhaseBoundaryRecord | null {
  const task = loadTask(findTask(root, id));
  const role = boundaryRole(task.meta.phase);
  if (!role) return null;
  const handoffDigest = String(options.handoffDigest || '').trim();
  const handoffContentDigest = String(options.handoffContentDigest || '').trim();
  if (!handoffDigest || !handoffContentDigest) throw new Error(`Phase boundary for ${task.meta.phase} requires deterministic handoff source and content digests`);
  const handoffWords = Number(options.handoffWords || 0);
  const existing = loadPhaseBoundary(root, task.meta.id, task.meta.phase);
  const boundaryOriginSessionId = options.originSessionId ? String(options.originSessionId) : options.sessionId ? String(options.sessionId) : null;
  if (existing) {
    if (existing.handoffDigest === handoffDigest && existing.handoffContentDigest === handoffContentDigest && existing.role === role) return existing;
    invalidatePhaseBoundary(root, task.meta.id, task.meta.phase);
  }
  const record = signed({
    schemaVersion: 3,
    taskId: task.meta.id,
    phase: task.meta.phase,
    role,
    handoffDigest,
    handoffContentDigest,
    status: role === 'target-audience' ? 'chosen' : 'required',
    recommendation: recommendationForTask(task, role, handoffWords),
    sameChatAllowed: role !== 'target-audience',
    originSessionId: boundaryOriginSessionId,
    choice: role === 'target-audience' ? 'fresh-chat' : null,
    choiceSessionId: role === 'target-audience' ? boundaryOriginSessionId : null,
    chosenAt: role === 'target-audience' ? now() : null,
    enteredSessionId: null,
    mode: null,
    forbiddenSessionIds: role === 'target-audience' ? audienceForbiddenSessions(task, boundaryOriginSessionId) : [],
    createdAt: now(),
    enteredAt: null
  });
  return writeRecord(root, record);
}

export function choosePhaseBoundary(
  root: string,
  id: string,
  choice: BoundaryChoice,
  options: { sessionId?: string | null; handoffDigest?: string | null; handoffContentDigest?: string | null; handoffWords?: number | null } = {}
): PhaseBoundaryRecord {
  if (!['continue-current','pause-model-change','fresh-chat'].includes(choice)) throw new Error(`Unknown phase-boundary choice: ${choice}`);
  const task = loadTask(findTask(root, id));
  const existing = boundaryRole(task.meta.phase) ? loadPhaseBoundary(root, task.meta.id, task.meta.phase) : null;
  const current = phaseBoundaryStatus(root, id, {
    ...options,
    handoffDigest: options.handoffDigest ?? existing?.handoffDigest ?? null,
    handoffContentDigest: options.handoffContentDigest ?? existing?.handoffContentDigest ?? null
  });
  if (!current) throw new Error('No implementation/review phase boundary is active for this task');
  const sessionId = String(options.sessionId || '').trim();
  if (!sessionId) throw new Error('Phase boundary choice requires the stable Codex session ID that presented the native decision');
  if (current.status === 'chosen') throw new Error('Phase boundary choice is already persisted; do not ask the boundary question again');
  if (current.status === 'entered' && current.enteredSessionId === sessionId) throw new Error('This Codex session already owns the entered phase boundary; no new boundary choice is required');
  if (current.status === 'entered' && current.enteredSessionId !== sessionId) {
    const lease = leaseStatus(root, current.taskId, sessionId);
    if (lease.conflict) throw new Error(`Phase boundary ownership transfer requires resolving the active task lease owned by ${lease.owner} before recording a new boundary choice`);
  }
  const next = signed({
    ...recordPayload(current),
    status: 'chosen',
    choice,
    choiceSessionId: sessionId,
    chosenAt: now(),
    enteredSessionId: null,
    mode: null,
    enteredAt: null
  } as Omit<PhaseBoundaryRecord, 'recordDigest'>);
  return writeRecord(root, next);
}

export function enterPhaseBoundary(
  root: string,
  id: string,
  options: { sessionId?: string | null; originSessionId?: string | null; handoffDigest?: string | null; handoffContentDigest?: string | null; handoffWords?: number | null } = {}
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
  // When a session is present, concurrency authority has precedence over the
  // later boundary-choice state so foreign/stale lane owners fail closed.
  if (sessionId) assertConcurrencyMutationAuthority(root, current.taskId, sessionId);
  if (current.status === 'required') throw new Error('Phase boundary must persist the explicit native user choice before it can be entered');
  if (!sessionId) throw new Error('Phase boundary entry requires a stable Codex session ID so ownership and same-chat/fresh-chat mode cannot be forged or left ambiguous');
  if (current.role === 'target-audience') {
    if (!current.originSessionId) throw new Error('Target Audience phase boundary requires the prior phase session ID so fresh-session isolation can be verified');
    const forbidden = [...new Set([...(current.forbiddenSessionIds || []), current.originSessionId].map(String).map(value => value.trim()).filter(Boolean))];
    if (forbidden.includes(sessionId)) throw new Error(`Target Audience requires a fresh session distinct from every implementation/QA or prior audience session in this review cycle (${forbidden.join(', ')})`);
    if (current.choice !== 'fresh-chat') throw new Error('Target Audience phase boundary must remain mechanically bound to a fresh chat');
  } else {
    if (current.choice === 'continue-current' && current.choiceSessionId !== sessionId) throw new Error('The user chose to continue with the current Codex session; enter this boundary from the same session or request a new boundary choice');
    if (current.choice === 'fresh-chat' && current.choiceSessionId === sessionId) throw new Error('The user chose a fresh chat; enter this boundary from a different stable Codex session');
  }
  const inferredMode: BoundaryMode = current.choiceSessionId ? (current.choiceSessionId !== sessionId ? 'fresh-chat' : 'same-chat') : current.originSessionId ? (current.originSessionId !== sessionId ? 'fresh-chat' : 'same-chat') : 'unknown';
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
  try {
    // Close the reservation/lease TOCTOU window: if the lane was redispatched
    // while the lease mutex was being acquired, this session must relinquish
    // ownership instead of persisting an obsolete boundary entry.
    assertConcurrencyMutationAuthority(root, current.taskId, sessionId);
  } catch (error) {
    releaseTaskLease(root, current.taskId, { sessionId });
    throw error;
  }
  writeRecord(root, next);
  if (current.role === 'target-audience') rememberTargetAudienceSession(root, current.taskId, sessionId, false);
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
  return digest({ taskId: record.taskId, phase: record.phase, role: record.role, handoffDigest: record.handoffDigest, handoffContentDigest: record.handoffContentDigest, choice: record.choice, choiceSessionId: record.choiceSessionId, chosenAt: record.chosenAt, mode: record.mode, enteredAt: record.enteredAt });
}
