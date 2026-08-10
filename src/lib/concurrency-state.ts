import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask } from './task.js';
import { assertTaskLease, leaseStatus, releaseTaskLease } from './lease.js';

export type ConcurrencyAccess = 'task-local' | 'isolated-write' | 'blocked-write' | 'terminal';
export type ConcurrencyLaneState = 'ready' | 'waiting' | 'reserved' | 'active' | 'blocked' | 'terminal';

export interface ConcurrencyReservation {
  sessionId: string;
  reservedAt: string;
  heartbeatAt?: string;
}

export interface ConcurrencyLane {
  taskId: string;
  title: string;
  phase: string;
  status: string;
  access: ConcurrencyAccess;
  state: ConcurrencyLaneState;
  dependencies: string[];
  blockedBy: string[];
  scope: string[];
  scopeKnown: boolean;
  conflictsWith: string[];
  worktreePath: string | null;
  worktreeBranch: string | null;
  sessionId: string | null;
}

export interface ConcurrencyWave {
  index: number;
  taskIds: string[];
}

export interface ConcurrencyPlan {
  schemaVersion: 2;
  id: string;
  parentTaskId: string;
  taskIds: string[];
  maxParallel: number;
  status: 'planned' | 'running' | 'blocked' | 'complete';
  lanes: ConcurrencyLane[];
  waves: ConcurrencyWave[];
  reservations: Record<string, ConcurrencyReservation>;
  createdAt: string;
  updatedAt: string;
  planDigest: string;
}

export function concurrencyPlanFile(root: string, parentId: string): string {
  return path.join(path.resolve(root), '.ai', 'runtime', 'concurrency', `${parentId}.json`);
}

export function concurrencyDirectory(root: string): string {
  return path.join(path.resolve(root), '.ai', 'runtime', 'concurrency');
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

function planDigest(value: Omit<ConcurrencyPlan, 'planDigest'> | ConcurrencyPlan): string {
  const { planDigest: _ignored, ...payload } = value as ConcurrencyPlan;
  return createHash('sha256').update(stable(payload)).digest('hex');
}

export function sealConcurrencyPlan(value: Omit<ConcurrencyPlan, 'planDigest'>): ConcurrencyPlan {
  return { ...value, planDigest: planDigest(value) };
}

export function validateStoredConcurrencyPlan(value: unknown, expectedParent?: string): ConcurrencyPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Concurrency plan is not a valid object');
  const plan = value as ConcurrencyPlan;
  if (plan.schemaVersion !== 2) throw new Error(`Unsupported concurrency plan schema ${String((plan as { schemaVersion?: unknown }).schemaVersion ?? 'missing')}; recreate the plan`);
  if (!plan.parentTaskId || plan.id !== `CONC-${plan.parentTaskId}`) throw new Error('Concurrency plan identity is invalid');
  if (expectedParent && plan.parentTaskId !== expectedParent) throw new Error(`Concurrency plan ${plan.id} does not belong to ${expectedParent}`);
  if (!Array.isArray(plan.taskIds) || !Number.isFinite(plan.maxParallel) || !plan.createdAt || !plan.planDigest) throw new Error(`Concurrency plan ${plan.id} is incomplete`);
  for (const [taskId, reservation] of Object.entries(plan.reservations || {})) {
    if (!reservation || typeof reservation.sessionId !== 'string' || !reservation.sessionId.trim() || !Number.isFinite(Date.parse(reservation.reservedAt))) throw new Error(`Concurrency reservation for ${taskId} is invalid`);
    if (reservation.heartbeatAt !== undefined && !Number.isFinite(Date.parse(reservation.heartbeatAt))) throw new Error(`Concurrency reservation heartbeat for ${taskId} is invalid`);
  }
  if (plan.planDigest !== planDigest(plan)) throw new Error(`Concurrency plan ${plan.id} integrity check failed; recreate the plan before dispatching agents`);
  return plan;
}

export function readConcurrencyPlanFile(file: string, expectedParent?: string): ConcurrencyPlan {
  try {
    return validateStoredConcurrencyPlan(JSON.parse(readFileSync(file, 'utf8')) as unknown, expectedParent);
  } catch (error) {
    throw new Error(`Invalid concurrency plan ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parentFromRef(reference: string): string {
  return reference.startsWith('CONC-') ? reference.slice(5) : reference;
}

export function loadConcurrencyPlan(root: string, reference: string): ConcurrencyPlan | null {
  const parent = parentFromRef(reference);
  const file = concurrencyPlanFile(root, parent);
  return existsSync(file) ? readConcurrencyPlanFile(file, parent) : null;
}

export function reservationPersisted(value: ConcurrencyReservation | undefined): value is ConcurrencyReservation {
  return Boolean(value?.sessionId && value.reservedAt && Number.isFinite(Date.parse(value.reservedAt)) && (value.heartbeatAt === undefined || Number.isFinite(Date.parse(value.heartbeatAt))));
}

export function reservationAuthoritative(root: string, taskId: string, value: ConcurrencyReservation | undefined): value is ConcurrencyReservation {
  if (!reservationPersisted(value)) return false;
  const lease = leaseStatus(root, taskId, value.sessionId);
  return Boolean(lease.active && !lease.conflict && lease.owner === value.sessionId);
}

export function concurrencyPlansForTask(root: string, taskId: string, excludeParent?: string): Array<{ parentTaskId: string; plan: ConcurrencyPlan }> {
  const directory = concurrencyDirectory(root);
  if (!existsSync(directory)) return [];
  const matches: Array<{ parentTaskId: string; plan: ConcurrencyPlan }> = [];
  for (const name of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
    const parentTaskId = name.slice(0, -5);
    if (excludeParent && parentTaskId === excludeParent) continue;
    const plan = readConcurrencyPlanFile(path.join(directory, name), parentTaskId);
    if (plan.taskIds.includes(taskId)) matches.push({ parentTaskId, plan });
  }
  return matches;
}

export function activeReservationsForTask(root: string, taskId: string, excludeParent?: string): Array<{ parentTaskId: string; reservation: ConcurrencyReservation }> {
  const matches: Array<{ parentTaskId: string; reservation: ConcurrencyReservation }> = [];
  for (const { parentTaskId, plan } of concurrencyPlansForTask(root, taskId, excludeParent)) {
    const reservation = plan.reservations?.[taskId];
    if (reservationAuthoritative(root, taskId, reservation)) matches.push({ parentTaskId, reservation });
  }
  return matches;
}

export function heldReservationsForTask(root: string, taskId: string, excludeParent?: string): Array<{ parentTaskId: string; reservation: ConcurrencyReservation }> {
  const matches: Array<{ parentTaskId: string; reservation: ConcurrencyReservation }> = [];
  for (const { parentTaskId, plan } of concurrencyPlansForTask(root, taskId, excludeParent)) {
    const reservation = plan.reservations?.[taskId];
    if (reservationPersisted(reservation)) matches.push({ parentTaskId, reservation });
  }
  return matches;
}

export function projectReservedTaskIds(root: string): Set<string> {
  const directory = concurrencyDirectory(root);
  const reserved = new Set<string>();
  if (!existsSync(directory)) return reserved;
  for (const name of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
    const parentTaskId = name.slice(0, -5);
    const plan = readConcurrencyPlanFile(path.join(directory, name), parentTaskId);
    for (const [taskId, reservation] of Object.entries(plan.reservations || {})) {
      if (reservationPersisted(reservation)) reserved.add(taskId);
    }
  }
  return reserved;
}

export interface ConcurrencyTaskAuthorityStatus {
  planned: boolean;
  planIds: string[];
  reserved: boolean;
  reservationSessionId: string | null;
  sessionAuthorized: boolean;
}

export function concurrencyTaskAuthorityStatus(root: string, taskId: string, sessionId?: string | null): ConcurrencyTaskAuthorityStatus {
  const canonical = loadTask(findTask(root, taskId)).meta.id;
  const plans = concurrencyPlansForTask(root, canonical);
  const held = heldReservationsForTask(root, canonical);
  const current = String(sessionId || '').trim();
  const reservation = held.length === 1 ? held[0]!.reservation : null;
  const lease = reservation && current === reservation.sessionId ? leaseStatus(root, canonical, current) : null;
  return {
    planned: plans.length > 0,
    planIds: plans.map(item => item.plan.id).sort(),
    reserved: held.length > 0,
    reservationSessionId: reservation?.sessionId ?? null,
    sessionAuthorized: Boolean(reservation && current && current === reservation.sessionId && lease?.active && !lease.conflict && lease.owner === current)
  };
}

export function assertConcurrencyReservation(root: string, taskId: string, sessionId?: string | null): void {
  const canonical = loadTask(findTask(root, taskId)).meta.id;
  const reservations = heldReservationsForTask(root, canonical);
  if (!reservations.length) return;
  const currentSession = String(sessionId || '').trim();
  if (!currentSession || reservations.some(entry => entry.reservation.sessionId !== currentSession)) {
    const owners = reservations.map(entry => `${entry.parentTaskId}:${entry.reservation.sessionId}`).join(', ');
    throw new Error(`Task ${canonical} is reserved by another concurrency session (${owners}); use the session returned by concurrency prepare or release the reservation explicitly`);
  }
}

export function assertConcurrencyMutationAuthority(root: string, taskId: string, sessionId?: string | null): void {
  const canonical = loadTask(findTask(root, taskId)).meta.id;
  const memberships = concurrencyPlansForTask(root, canonical);
  if (!memberships.length) return;
  const reservations = heldReservationsForTask(root, canonical);
  if (!reservations.length) {
    throw new Error(`Task ${canonical} belongs to concurrency plan ${memberships.map(entry => entry.plan.id).join(', ')} but has no active lane reservation; run concurrency prepare before agent mutations or cancel the plan explicitly`);
  }
  assertConcurrencyReservation(root, canonical, sessionId);
  const currentSession = String(sessionId || '').trim();
  const status = leaseStatus(root, canonical, currentSession);
  if (!currentSession || !status.active || status.conflict || status.owner !== currentSession) {
    throw new Error(`Task ${canonical} has a concurrency reservation but no active task lease owned by this lane session; heartbeat the matching lane session or recover/release the stale reservation before mutating it`);
  }
  assertTaskLease(root, canonical, { sessionId: currentSession });
}


function sleep(ms: number): void { const buffer = new SharedArrayBuffer(4); Atomics.wait(new Int32Array(buffer), 0, 0, ms); }
function processAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code || '') : ''; return code !== 'ESRCH'; } }
function lockStale(lock: string): boolean {
  try {
    const ownerFile = path.join(lock, 'owner.json');
    if (existsSync(ownerFile)) {
      try { const owner = JSON.parse(readFileSync(ownerFile, 'utf8')) as { pid?: unknown }; const pid = Number(owner.pid); if (Number.isInteger(pid) && pid > 0) return !processAlive(pid); } catch { /* fall through to age */ }
    }
    return Date.now() - statSync(lock).mtimeMs > 5 * 60_000;
  } catch { return true; }
}
function withRuntimeLock<T>(lock: string, operation: () => T): T {
  mkdirSync(path.dirname(lock), { recursive: true });
  const started = Date.now();
  for (;;) {
    try { mkdirSync(lock); writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`); break; }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code || '') : '';
      if (code !== 'EEXIST') throw error;
      if (lockStale(lock)) { rmSync(lock, { recursive: true, force: true }); continue; }
      if (Date.now() - started >= 30_000) throw new Error(`Timed out waiting for concurrency authority lock ${path.basename(lock)}`);
      sleep(20);
    }
  }
  try { return operation(); } finally { rmSync(lock, { recursive: true, force: true }); }
}
function writePlanSnapshot(root: string, plan: ConcurrencyPlan): void {
  const file = concurrencyPlanFile(root, plan.parentTaskId), tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(plan, null, 2)}\n`);
  renameSync(tmp, file);
}
function removePersistedReservation(root: string, parentTaskId: string, taskId: string, expectedSessionId: string | null, force: boolean): ConcurrencyReservation | null {
  return withRuntimeLock(path.join(concurrencyDirectory(root), '.scheduler.lock'), () =>
    withRuntimeLock(`${concurrencyPlanFile(root, parentTaskId)}.lock`, () => {
      const plan = loadConcurrencyPlan(root, parentTaskId);
      const reservation = plan?.reservations?.[taskId];
      if (!plan || !reservationPersisted(reservation)) return null;
      if (!force && (!expectedSessionId || reservation.sessionId !== expectedSessionId)) throw new Error(`Task ${taskId} is reserved by another concurrency session (${parentTaskId}:${reservation.sessionId})`);
      const reservations = { ...(plan.reservations || {}) }; delete reservations[taskId];
      const lanes = plan.lanes.map(lane => lane.taskId === taskId ? { ...lane, sessionId: null, state: lane.state === 'reserved' ? 'ready' as const : lane.state } : lane);
      const { planDigest: _previousDigest, ...payload } = plan;
      writePlanSnapshot(root, sealConcurrencyPlan({ ...payload, reservations, lanes, updatedAt: new Date().toISOString() }));
      return reservation;
    })
  );
}

export function yieldConcurrencyTaskReservation(root: string, taskId: string, options: { sessionId?: string | null; force?: boolean } = {}): void {
  const canonical = loadTask(findTask(root, taskId)).meta.id;
  const reservations = heldReservationsForTask(root, canonical);
  if (!reservations.length) return;
  const sessionId = String(options.sessionId || '').trim();
  if (!options.force && !sessionId) throw new Error(`Yielding ${canonical} requires the active concurrency session ID`);
  for (const { parentTaskId, reservation } of reservations) {
    const removed = removePersistedReservation(root, parentTaskId, canonical, sessionId || null, Boolean(options.force));
    if (!removed) continue;
    try { releaseTaskLease(root, canonical, { sessionId: reservation.sessionId, force: Boolean(options.force) }); }
    catch (error) { if (!options.force) throw error; }
  }
}
