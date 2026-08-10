import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorktree, removeWorktree } from './worktree.js';
import { findTask, listTasks, loadTask, saveTask, unfinishedDependencies } from './task.js';
import { loadBlastRadius, scopeGuardStatus } from './scope-guard.js';
import { loadProjectConfig, projectContextStatus, validateProjectContext } from './project.js';
import { acquireTaskLease, assertTaskLease, leaseStatus, releaseTaskLease } from './lease.js';
import type { TaskDocument } from './types.js';
import { finalProductOwnerRequired, finalProductOwnerReviewStatus, productOwnerRequired, productOwnerReviewStatus, targetAudienceRequired, targetAudienceReviewStatus } from './product-intelligence.js';
import { getHostCapabilityStatus } from './host-capabilities.js';
import { activeReservationsForTask, heldReservationsForTask, assertConcurrencyMutationAuthority, assertConcurrencyReservation, concurrencyDirectory, concurrencyPlanFile, concurrencyPlansForTask, concurrencyTaskAuthorityStatus, loadConcurrencyPlan, projectReservedTaskIds, readConcurrencyPlanFile, reservationAuthoritative, reservationPersisted, sealConcurrencyPlan, type ConcurrencyAccess, type ConcurrencyLane, type ConcurrencyLaneState, type ConcurrencyPlan, type ConcurrencyReservation, type ConcurrencyWave } from './concurrency-state.js';
export { assertConcurrencyMutationAuthority, assertConcurrencyReservation, concurrencyPlansForTask, concurrencyTaskAuthorityStatus, loadConcurrencyPlan } from './concurrency-state.js';
export type { ConcurrencyAccess, ConcurrencyLane, ConcurrencyLaneState, ConcurrencyPlan, ConcurrencyReservation, ConcurrencyTaskAuthorityStatus, ConcurrencyWave } from './concurrency-state.js';

function now(): string { return new Date().toISOString(); }

function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code || '') : '';
    return code !== 'ESRCH';
  }
}

function writeLockOwner(lock: string): void {
  try { writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, createdAt: now() })}\n`); } catch { /* advisory metadata only */ }
}

function sleep(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function removableStaleLock(lock: string, thresholdMs: number): boolean {
  try {
    const ageMs = Date.now() - statSync(lock).mtimeMs;
    const ownerFile = path.join(lock, 'owner.json');
    if (!existsSync(ownerFile)) return ageMs > thresholdMs;
    try {
      const owner = JSON.parse(readFileSync(ownerFile, 'utf8')) as { pid?: unknown };
      const pid = Number(owner.pid);
      if (Number.isInteger(pid) && pid > 0) return !processAlive(pid);
    } catch {
      // A partially-written or corrupt owner record is not safe to steal while fresh.
    }
    return ageMs > thresholdMs;
  } catch { return true; }
}

function acquireDirectoryLock(lock: string, label: string, options: { waitMs?: number; pollMs?: number; staleMs?: number } = {}): void {
  const waitMs = options.waitMs ?? 30_000;
  const pollMs = options.pollMs ?? 20;
  const staleMs = options.staleMs ?? 5 * 60_000;
  const startedAt = Date.now();
  mkdirSync(path.dirname(lock), { recursive: true });
  for (;;) {
    try {
      mkdirSync(lock);
      writeLockOwner(lock);
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code || '') : '';
      if (code !== 'EEXIST') throw error;
      if (removableStaleLock(lock, staleMs)) {
        try { rmSync(lock, { recursive: true, force: true }); } catch { /* another contender may have removed it */ }
        continue;
      }
      if (Date.now() - startedAt >= waitMs) {
        throw new Error(`Timed out waiting ${waitMs}ms for ${label}; another live process still owns the lock`);
      }
      sleep(pollMs);
    }
  }
}

function withPlanLock<T>(root: string, parentId: string, operation: () => T): T {
  const lock = `${concurrencyPlanFile(root, parentId)}.lock`;
  acquireDirectoryLock(lock, `concurrency plan lock for ${parentId}`);
  try {
    return operation();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function withSchedulerLock<T>(root: string, operation: () => T): T {
  const directory = path.join(path.resolve(root), '.ai', 'runtime', 'concurrency');
  const lock = path.join(directory, '.scheduler.lock');
  acquireDirectoryLock(lock, 'global concurrency scheduler lock');
  try {
    return operation();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function configuredMaxParallel(root: string, override?: number): number {
  const subagents = loadProjectConfig(root).subagents as Record<string, unknown>;
  const coordination = String(subagents?.coordination ?? 'local-filesystem');
  if (coordination !== 'local-filesystem') throw new Error(`Unsupported concurrency coordination mode: ${coordination}. This SpecRail build guarantees only local-filesystem coordination.`);
  const configured = Number(subagents?.maxParallel ?? 3);
  if (!Number.isFinite(configured) || configured < 1) throw new Error('Project subagents.maxParallel must be at least 1');
  if (override !== undefined && (!Number.isFinite(override) || override < 1)) throw new Error('Concurrency maxParallel must be at least 1');
  const requested = override === undefined ? configured : override;
  return Math.min(16, Math.floor(configured), Math.floor(requested));
}

function availableProjectSlots(root: string): number {
  return Math.max(0, configuredMaxParallel(root) - projectReservedTaskIds(root).size);
}

function parallelHostAttestationRequired(root: string): boolean {
  const subagents = loadProjectConfig(root).subagents as Record<string, unknown>;
  return subagents?.requireParallelHostAttestation !== false;
}

function configuredMaxDepth(root: string): number {
  const subagents = loadProjectConfig(root).subagents as Record<string, unknown>;
  const raw = Number(subagents?.maxDepth ?? 1);
  if (!Number.isFinite(raw) || raw < 1) throw new Error('Concurrency maxDepth must be at least 1');
  return Math.min(8, Math.floor(raw));
}

function concurrencyDepth(root: string, parentId: string): number {
  let depth = 1;
  let current = loadTask(findTask(root, parentId));
  const seen = new Set<string>([current.meta.id]);
  while (current.meta.parent_id) {
    const nextId = current.meta.parent_id;
    if (seen.has(nextId)) throw new Error(`Task parent graph contains a cycle at ${nextId}`);
    seen.add(nextId);
    current = loadTask(findTask(root, nextId));
    depth += 1;
  }
  return depth;
}

function assertConcurrencyDepth(root: string, parentId: string): void {
  const depth = concurrencyDepth(root, parentId);
  const maxDepth = configuredMaxDepth(root);
  if (depth > maxDepth) throw new Error(`Concurrency depth ${depth} for ${parentId} exceeds project subagents.maxDepth ${maxDepth}`);
}

function normalizeScope(value: string): string {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function scopePrefix(pattern: string): string {
  const value = normalizeScope(pattern);
  const wildcard = value.search(/[?*[]/);
  return (wildcard < 0 ? value : value.slice(0, wildcard)).replace(/\/$/, '');
}

function hasWildcard(pattern: string): boolean {
  return /[?*[]/.test(pattern);
}

function patternsMayOverlap(a: string, b: string): boolean {
  const x = normalizeScope(a), y = normalizeScope(b);
  if (!x || !y || x === '**' || y === '**') return true;
  if (x === y) return true;
  const px = scopePrefix(x), py = scopePrefix(y);
  if (!px || !py) return true;
  if (!hasWildcard(x) && !hasWildcard(y)) return x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
  return px === py || px.startsWith(`${py}/`) || py.startsWith(`${px}/`) || x.startsWith(py) || y.startsWith(px);
}

function scopesConflict(a: string[], b: string[]): boolean {
  return a.some(x => b.some(y => patternsMayOverlap(x, y)));
}

function sameScope(a: string[], b: string[]): boolean {
  const left = [...a].map(normalizeScope).sort();
  const right = [...b].map(normalizeScope).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertSelectedLaneSnapshot(root: string, lane: ConcurrencyLane): void {
  const task = loadTask(findTask(root, lane.taskId));
  const access = laneAccess(root, task);
  const base = baseLaneState(root, task, access.access);
  if (task.meta.phase !== lane.phase || task.meta.status !== lane.status) {
    throw new Error(`Concurrency lane ${lane.taskId} changed phase/status while dispatch was being prepared; recalculate the wave before dispatch`);
  }
  if (access.access !== lane.access || !sameScope(access.scope, lane.scope)) {
    throw new Error(`Concurrency lane ${lane.taskId} changed access/scope while dispatch was being prepared; recalculate the wave before dispatch`);
  }
  if (base.state !== 'ready') {
    throw new Error(`Concurrency lane ${lane.taskId} is no longer dispatchable (${base.state}${base.blockedBy.length ? `: ${base.blockedBy.join(', ')}` : ''})`);
  }
}

function canonicalTaskIds(root: string, references: string[], parentId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const reference of references.map(String).map(value => value.trim()).filter(Boolean)) {
    const task = loadTask(findTask(root, reference));
    if (task.meta.id === parentId || seen.has(task.meta.id)) continue;
    seen.add(task.meta.id);
    ids.push(task.meta.id);
  }
  return ids;
}

function candidateIds(root: string, parentId: string, explicit?: string[]): string[] {
  const parent = loadTask(findTask(root, parentId));
  if (explicit?.length) return canonicalTaskIds(root, explicit, parent.meta.id);
  if (parent.meta.slice_ids?.length) return canonicalTaskIds(root, parent.meta.slice_ids, parent.meta.id);
  const children = listTasks(root).filter(task => task.meta.parent_id === parent.meta.id).map(task => task.meta.id);
  if (children.length) return canonicalTaskIds(root, children, parent.meta.id);
  return canonicalTaskIds(root, parent.meta.dependencies || [], parent.meta.id);
}

function laneAccess(root: string, task: TaskDocument): { access: ConcurrencyAccess; scope: string[]; scopeKnown: boolean } {
  if (['done', 'rejected'].includes(task.meta.status)) return { access: 'terminal', scope: [], scopeKnown: true };
  const radius = loadBlastRadius(root, task.meta.id);
  const scope = (radius?.allowedFiles?.length ? radius.allowedFiles : task.meta.file_scope || []).map(normalizeScope).filter(Boolean);
  if (task.meta.phase !== 'builder') return { access: 'task-local', scope, scopeKnown: scope.length > 0 };
  const guard = scopeGuardStatus(root, task.meta.id);
  if (task.meta.spec_approval === 'approved' && guard.valid && guard.sealed && guard.sealIntegrityValid && scope.length) {
    return { access: 'isolated-write', scope, scopeKnown: true };
  }
  return { access: 'blocked-write', scope, scopeKnown: scope.length > 0 };
}

function assertParentDispatchReady(root: string, parentId: string): void {
  const parent = loadTask(findTask(root, parentId));
  if (parent.meta.waiting_for === 'user' || parent.meta.open_questions > 0 || parent.meta.status === 'blocked') {
    throw new Error(`Concurrency dispatch for ${parent.meta.id} is blocked by a parent human/workflow gate`);
  }
  if (parent.meta.phase === 'product-specifier' && productOwnerRequired(root)) {
    const review = productOwnerReviewStatus(root, parent.meta.id);
    if (!review.valid) throw new Error(`Concurrency dispatch for ${parent.meta.id} requires a current Product Owner review: ${review.detail}`);
  }
  if (parent.meta.phase === 'final-customer' && targetAudienceRequired(root)) {
    const audience = targetAudienceReviewStatus(root, parent.meta.id);
    if (!audience.valid) throw new Error(`Concurrency dispatch for ${parent.meta.id} requires Target Audience resolution: ${audience.detail}`);
  }
  if (parent.meta.phase === 'final-approval') {
    throw new Error(`Concurrency dispatch for ${parent.meta.id} is blocked by the parent final-review/approval gate`);
  }
}

function baseLaneState(root: string, task: TaskDocument, access: ConcurrencyAccess): { state: ConcurrencyLaneState; blockedBy: string[] } {
  if (['done', 'rejected'].includes(task.meta.status)) return { state: 'terminal', blockedBy: [] };
  if (task.meta.status === 'blocked') return { state: 'blocked', blockedBy: [String(task.meta.block_reason || 'task-blocked')] };
  if (task.meta.waiting_for === 'user' || task.meta.open_questions > 0) return { state: 'blocked', blockedBy: ['human-judgment-required'] };
  // Product/bootstrap documents are shared project state. They must be generated
  // serially before task-local Product Owner / Product Specifier lanes can run
  // concurrently, otherwise multiple children could race on the same files.
  if (task.meta.phase === 'product-specifier' && (projectContextStatus(root).status !== 'ready' || !validateProjectContext(root).valid)) return { state: 'blocked', blockedBy: ['shared-project-context-bootstrap-required-before-concurrency'] };
  const deps = unfinishedDependencies(root, task).map(dep => dep.meta.id);
  if (deps.length) return { state: 'waiting', blockedBy: deps };
  if (access === 'blocked-write') return { state: 'blocked', blockedBy: ['approved-bounded-scope-required-before-parallel-write'] };
  if (['refining', 'active', 'review', 'qa', 'customer_validation'].includes(task.meta.status)) {
    const lease = leaseStatus(root, task.meta.id);
    return lease.active ? { state: 'active', blockedBy: [] } : { state: 'ready', blockedBy: [] };
  }
  if (task.meta.status === 'awaiting_final_approval' && task.meta.phase === 'final-approval' && finalProductOwnerRequired(root)) {
    const finalOwner = finalProductOwnerReviewStatus(root, task.meta.id);
    if (!finalOwner.valid && !finalOwner.needsHumanJudgment) return { state: 'ready', blockedBy: [] };
  }
  if (['awaiting_spec_approval', 'awaiting_final_approval', 'awaiting_delivery'].includes(task.meta.status)) {
    return { state: 'blocked', blockedBy: ['workflow-gate-requires-resolution'] };
  }
  return { state: 'ready', blockedBy: [] };
}

function buildLanes(root: string, parentId: string, ids: string[], reservations: Record<string, ConcurrencyReservation>): { lanes: ConcurrencyLane[]; reservations: Record<string, ConcurrencyReservation> } {
  const candidateSet = new Set(ids);
  const retainedReservations: Record<string, ConcurrencyReservation> = {};
  const lanes = ids.map(id => {
    const task = loadTask(findTask(root, id));
    const access = laneAccess(root, task);
    const base = baseLaneState(root, task, access.access);
    const reservation = reservations[task.meta.id];
    const ownHeld = reservationPersisted(reservation);
    const ownAuthoritative = ownHeld && reservationAuthoritative(root, task.meta.id, reservation);
    const foreignReservations = ownHeld ? [] : heldReservationsForTask(root, task.meta.id, parentId);
    const foreign = foreignReservations[0] ?? null;
    if (ownHeld && reservation) retainedReservations[task.meta.id] = reservation;
    const staleOwnReservation = ownHeld && !ownAuthoritative;
    const ownReservationSession = String(reservation?.sessionId || 'unknown');
    const foreignAuthoritative = foreign ? reservationAuthoritative(root, task.meta.id, foreign.reservation) : false;
    const blockedBy = staleOwnReservation
      ? [...base.blockedBy, `stale-reservation-recovery-required:${ownReservationSession}`]
      : foreign
        ? [...base.blockedBy, `${foreignAuthoritative ? 'reserved-by' : 'stale-reservation-held-by'}:${foreign.parentTaskId}`]
        : base.blockedBy;
    const state: ConcurrencyLaneState = staleOwnReservation || (foreign && !foreignAuthoritative)
      ? 'blocked'
      : base.state === 'ready' && (ownAuthoritative || Boolean(foreign))
        ? 'reserved'
        : base.state;
    return {
      taskId: task.meta.id,
      title: task.meta.title,
      phase: task.meta.phase,
      status: task.meta.status,
      access: access.access,
      state,
      dependencies: (task.meta.dependencies || []).filter(dep => candidateSet.has(dep)),
      blockedBy,
      scope: access.scope,
      scopeKnown: access.scopeKnown,
      conflictsWith: [] as string[],
      worktreePath: task.meta.worktree_path || null,
      worktreeBranch: task.meta.worktree_branch || null,
      sessionId: ownHeld && reservation ? reservation.sessionId : foreign?.reservation.sessionId ?? null
    } satisfies ConcurrencyLane;
  });
  for (let i = 0; i < lanes.length; i++) {
    for (let j = i + 1; j < lanes.length; j++) {
      const a = lanes[i]!, b = lanes[j]!;
      if (a.access === 'isolated-write' && b.access === 'isolated-write' && scopesConflict(a.scope, b.scope)) {
        a.conflictsWith.push(b.taskId);
        b.conflictsWith.push(a.taskId);
      }
    }
  }
  return { lanes, reservations: retainedReservations };
}

function staticWaves(lanes: ConcurrencyLane[], limit: number): ConcurrencyWave[] {
  const remaining = new Set(lanes.map(lane => lane.taskId));
  const scheduled = new Set<string>();
  const byId = new Map(lanes.map(lane => [lane.taskId, lane]));
  const waves: ConcurrencyWave[] = [];
  while (remaining.size) {
    const available = [...remaining]
      .map(id => byId.get(id)!)
      .filter(lane => lane.dependencies.every(dep => scheduled.has(dep)))
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
    if (!available.length) throw new Error('Concurrency task dependencies must be acyclic');
    const chosen: ConcurrencyLane[] = [];
    for (const lane of available) {
      if (chosen.length >= limit) break;
      if (chosen.some(other => lane.conflictsWith.includes(other.taskId))) continue;
      chosen.push(lane);
    }
    if (!chosen.length) chosen.push(available[0]!);
    waves.push({ index: waves.length + 1, taskIds: chosen.map(lane => lane.taskId) });
    for (const lane of chosen) {
      remaining.delete(lane.taskId);
      scheduled.add(lane.taskId);
    }
  }
  return waves;
}

function statusFor(lanes: ConcurrencyLane[]): ConcurrencyPlan['status'] {
  if (lanes.every(lane => lane.state === 'terminal')) return 'complete';
  if (lanes.some(lane => lane.state === 'blocked') && !lanes.some(lane => ['ready', 'reserved', 'active'].includes(lane.state))) return 'blocked';
  if (lanes.some(lane => lane.state === 'reserved' || lane.state === 'active')) return 'running';
  return 'planned';
}

function buildPlan(root: string, parentId: string, ids: string[], limit: number, createdAt = now(), reservations: Record<string, ConcurrencyReservation> = {}): ConcurrencyPlan {
  assertConcurrencyDepth(root, parentId);
  if (ids.length < 2) throw new Error('Multi-Agent Concurrency requires at least two child/slice tasks');
  for (const id of ids) findTask(root, id);
  const built = buildLanes(root, parentId, ids, reservations);
  return sealConcurrencyPlan({
    schemaVersion: 2,
    id: `CONC-${parentId}`,
    parentTaskId: parentId,
    taskIds: ids,
    maxParallel: limit,
    status: statusFor(built.lanes),
    lanes: built.lanes,
    waves: staticWaves(built.lanes, limit),
    reservations: built.reservations,
    createdAt,
    updatedAt: now()
  });
}

function parentFromRef(reference: string): string {
  return reference.startsWith('CONC-') ? reference.slice(5) : reference;
}

function sameTaskSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
}

function createConcurrencyPlanUnlocked(root: string, parentId: string, options: { taskIds?: string[]; maxParallel?: number } = {}): ConcurrencyPlan {
  const ids = candidateIds(root, parentId, options.taskIds);
  const requestedLimit = configuredMaxParallel(root, options.maxParallel);
  const stored = loadConcurrencyPlan(root, parentId);
  if (stored) {
    const effectiveStoredLimit = configuredMaxParallel(root, stored.maxParallel);
    const current = buildPlan(root, parentId, stored.taskIds, effectiveStoredLimit, stored.createdAt, stored.reservations || {});
    const live = current.lanes.some(lane => lane.state === 'reserved' || lane.state === 'active');
    if (live && !sameTaskSet(ids, stored.taskIds)) throw new Error(`Concurrency plan ${stored.id} has active/reserved lanes; release or finish them before changing the task set`);
    if (live && options.maxParallel !== undefined && requestedLimit !== effectiveStoredLimit) throw new Error(`Concurrency plan ${stored.id} has active/reserved lanes; do not change maxParallel until the current dispatch is released`);
    if (sameTaskSet(ids, stored.taskIds)) {
      const plan = buildPlan(root, parentId, ids, requestedLimit, stored.createdAt, stored.reservations || {});
      atomicJson(concurrencyPlanFile(root, parentId), plan);
      return plan;
    }
  }
  const plan = buildPlan(root, parentId, ids, requestedLimit);
  atomicJson(concurrencyPlanFile(root, parentId), plan);
  return plan;
}

export function createConcurrencyPlan(root: string, parentId: string, options: { taskIds?: string[]; maxParallel?: number } = {}): ConcurrencyPlan {
  return withPlanLock(root, parentId, () => createConcurrencyPlanUnlocked(root, parentId, options));
}

export function concurrencyStatus(root: string, reference: string): ConcurrencyPlan {
  const parent = parentFromRef(reference), stored = loadConcurrencyPlan(root, parent);
  if (!stored) throw new Error(`No concurrency plan found for ${parent}`);
  const effectiveLimit = configuredMaxParallel(root, stored.maxParallel);
  return buildPlan(root, parent, stored.taskIds, effectiveLimit, stored.createdAt, stored.reservations || {});
}

export function nextConcurrencyWave(root: string, reference: string): { plan: ConcurrencyPlan; availableSlots: number; lanes: ConcurrencyLane[] } {
  const plan = concurrencyStatus(root, reference);
  const occupied = plan.lanes.filter(lane => lane.state === 'active' || lane.state === 'reserved' || Boolean(lane.sessionId));
  const planSlots = Math.max(0, plan.maxParallel - occupied.length);
  const slots = Math.min(planSlots, availableProjectSlots(root));
  const activeWrites = occupied.filter(lane => lane.access === 'isolated-write');
  const chosen: ConcurrencyLane[] = [];
  for (const lane of plan.lanes.filter(item => item.state === 'ready').sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    if (chosen.length >= slots) break;
    if (lane.access === 'isolated-write' && (
      activeWrites.some(other => scopesConflict(lane.scope, other.scope)) ||
      chosen.some(other => other.access === 'isolated-write' && scopesConflict(lane.scope, other.scope))
    )) continue;
    chosen.push(lane);
  }
  return { plan, availableSlots: slots, lanes: chosen };
}

export type ConcurrencyDispatchMode = 'none' | 'single' | 'parallel' | 'serial-fallback' | 'scheduler-only';
export interface ConcurrencyDispatchStatus { mode: ConcurrencyDispatchMode; hostSessionId: string | null; hostCapabilityVerified: boolean; structurallyRunnable: number; dispatched: number; reason: string; }

export function prepareConcurrencyWave(root: string, reference: string, options: { hostSessionId?: string | null } = {}): { plan: ConcurrencyPlan; lanes: ConcurrencyLane[]; controlRoot: string; dispatch: ConcurrencyDispatchStatus } {
  const parent = parentFromRef(reference);
  assertParentDispatchReady(root, parent);
  return withSchedulerLock(root, () => withPlanLock(root, parent, () => {
    // Parent workflow/product gates can change while this process waits for the
    // scheduler lock. Recheck after serialization so dispatch never relies on a
    // stale pre-lock decision.
    assertParentDispatchReady(root, parent);
    if (!loadConcurrencyPlan(root, parent)) createConcurrencyPlanUnlocked(root, parent);
    const stored = loadConcurrencyPlan(root, parent)!;
    const effectiveLimit = configuredMaxParallel(root, stored.maxParallel);
    const current = buildPlan(root, parent, stored.taskIds, effectiveLimit, stored.createdAt, stored.reservations || {});
    const occupied = current.lanes.filter(lane => lane.state === 'active' || lane.state === 'reserved' || Boolean(lane.sessionId));
    const planSlots = Math.max(0, current.maxParallel - occupied.length);
    const slots = Math.min(planSlots, availableProjectSlots(root));
    const occupiedWrites = occupied.filter(lane => lane.access === 'isolated-write');
    const selected: ConcurrencyLane[] = [];
    for (const lane of current.lanes.filter(item => item.state === 'ready').sort((a, b) => a.taskId.localeCompare(b.taskId))) {
      if (selected.length >= slots) break;
      if (lane.access === 'isolated-write' && (
        occupiedWrites.some(other => scopesConflict(lane.scope, other.scope)) ||
        selected.some(other => other.access === 'isolated-write' && scopesConflict(lane.scope, other.scope))
      )) continue;
      selected.push(lane);
    }
    const structurallyRunnable = selected.length;
    const hostCapability = getHostCapabilityStatus(root, options.hostSessionId ?? null);
    let dispatchMode: ConcurrencyDispatchMode = structurallyRunnable === 0 ? 'none' : structurallyRunnable === 1 ? 'single' : 'parallel';
    let dispatchReason = structurallyRunnable === 0 ? 'No lane is structurally runnable.' : structurallyRunnable === 1 ? 'Only one lane is structurally runnable in this wave.' : hostCapability.detail;
    if (structurallyRunnable > 1 && parallelHostAttestationRequired(root) && !hostCapability.parallelVerified) {
      selected.splice(1);
      dispatchMode = 'serial-fallback';
      dispatchReason = `Parallel host capability is not verified; reserving one lane only. ${hostCapability.detail}`;
    } else if (structurallyRunnable > 1 && !parallelHostAttestationRequired(root) && !hostCapability.parallelVerified) {
      dispatchMode = 'scheduler-only';
      dispatchReason = 'Project policy disabled host attestation. SpecRail prepared multiple scheduler lanes but does not claim that the host actually spawned parallel agents.';
    } else if (structurallyRunnable > 1) {
      dispatchMode = 'parallel';
      dispatchReason = hostCapability.detail;
    }
    const reservations = { ...(current.reservations || {}) };
    const prepared: ConcurrencyLane[] = [];
    const acquired: Array<{ taskId: string; sessionId: string }> = [];
    const createdWorktrees: Array<{ taskId: string; path: string; branch: string; previous: { worktree_path: string | null; worktree_branch: string | null; worktree_base: string | null; delivery_status: string } }> = [];
    try {
      for (const lane of selected) {
        // Human-owned state can change without taking the scheduler lock. Revalidate
        // the exact lane snapshot immediately before acquiring authority so a stale
        // ready decision cannot be committed after a product/workflow transition.
        assertSelectedLaneSnapshot(root, lane);
        const task = loadTask(findTask(root, lane.taskId));
        const sessionId = `${stored.id}:${task.meta.id}:${randomUUID()}`;
        acquireTaskLease(root, task.meta.id, { sessionId, phase: task.meta.phase });
        acquired.push({ taskId: task.meta.id, sessionId });
        if (lane.access === 'isolated-write' && !task.meta.worktree_path) {
          const previous = { worktree_path: task.meta.worktree_path, worktree_branch: task.meta.worktree_branch, worktree_base: task.meta.worktree_base, delivery_status: task.meta.delivery_status };
          const worktree = createWorktree(root, task.meta.id, task.meta.title);
          createdWorktrees.push({ taskId: task.meta.id, path: worktree.path, branch: worktree.branch, previous });
          task.meta.worktree_path = worktree.path;
          task.meta.worktree_branch = worktree.branch;
          task.meta.worktree_base = worktree.baseBranch;
          task.meta.delivery_status = 'pending';
          saveTask(task);
        }
        reservations[task.meta.id] = { sessionId, reservedAt: now(), heartbeatAt: now() };
        const refreshedTask = loadTask(findTask(root, lane.taskId));
        prepared.push({
          ...lane,
          state: 'reserved',
          sessionId,
          worktreePath: refreshedTask.meta.worktree_path || null,
          worktreeBranch: refreshedTask.meta.worktree_branch || null
        });
      }
      const refreshed = buildPlan(root, parent, stored.taskIds, effectiveLimit, stored.createdAt, reservations);
      for (const preparedLane of prepared) {
        const currentLane = refreshed.lanes.find(item => item.taskId === preparedLane.taskId);
        if (!currentLane || !['reserved', 'active'].includes(currentLane.state) || currentLane.phase !== preparedLane.phase) {
          throw new Error(`Concurrency lane ${preparedLane.taskId} changed while dispatch authority was being committed; the wave was rolled back`);
        }
      }
      const heldWrites = refreshed.lanes.filter(lane => Boolean(lane.sessionId) && lane.access === 'isolated-write');
      for (const lane of heldWrites) {
        if (lane.conflictsWith.some(otherId => heldWrites.some(other => other.taskId === otherId))) {
          throw new Error(`Concurrency write scope changed while dispatch authority was being committed; conflicting held lanes were rolled back`);
        }
      }
      atomicJson(concurrencyPlanFile(root, parent), refreshed);
      return {
        plan: refreshed,
        lanes: prepared.map(lane => refreshed.lanes.find(item => item.taskId === lane.taskId) ?? lane),
        controlRoot: path.resolve(root),
        dispatch: {
          mode: dispatchMode,
          hostSessionId: hostCapability.sessionId,
          hostCapabilityVerified: hostCapability.parallelVerified,
          structurallyRunnable,
          dispatched: prepared.length,
          reason: dispatchReason
        }
      };
    } catch (error) {
      for (const worktree of createdWorktrees.reverse()) {
        try { removeWorktree(root, worktree.path, worktree.branch); } catch { /* best-effort rollback; task metadata is still restored below */ }
        try {
          const rollbackTask = loadTask(findTask(root, worktree.taskId));
          rollbackTask.meta.worktree_path = worktree.previous.worktree_path;
          rollbackTask.meta.worktree_branch = worktree.previous.worktree_branch;
          rollbackTask.meta.worktree_base = worktree.previous.worktree_base;
          rollbackTask.meta.delivery_status = worktree.previous.delivery_status as typeof rollbackTask.meta.delivery_status;
          saveTask(rollbackTask);
        } catch { /* best-effort metadata rollback */ }
      }
      for (const item of acquired.reverse()) {
        try { releaseTaskLease(root, item.taskId, { sessionId: item.sessionId }); } catch { /* best-effort rollback */ }
      }
      throw error;
    }
  }));
}

export function heartbeatConcurrencyLane(root: string, reference: string, taskId: string, options: { sessionId?: string | null; ttlMs?: number } = {}): ConcurrencyPlan {
  const parent = parentFromRef(reference);
  const sessionId = String(options.sessionId || '').trim();
  if (!sessionId) throw new Error('Concurrency heartbeat requires the exact lane session ID returned by concurrency prepare');
  return withSchedulerLock(root, () => withPlanLock(root, parent, () => {
    const stored = loadConcurrencyPlan(root, parent);
    if (!stored) throw new Error(`No concurrency plan found for ${parent}`);
    const canonicalTaskId = loadTask(findTask(root, taskId)).meta.id;
    const reservation = stored.reservations?.[canonicalTaskId];
    if (!reservationPersisted(reservation)) throw new Error(`${canonicalTaskId} has no persisted reservation in ${stored.id}`);
    if (reservation.sessionId !== sessionId) throw new Error(`Reservation for ${canonicalTaskId} belongs to another session (${reservation.sessionId})`);
    const task = loadTask(findTask(root, canonicalTaskId));
    acquireTaskLease(root, canonicalTaskId, { sessionId, phase: task.meta.phase, ttlMs: options.ttlMs });
    const reservations = { ...(stored.reservations || {}), [canonicalTaskId]: { ...reservation, heartbeatAt: now() } };
    const refreshed = buildPlan(root, parent, stored.taskIds, configuredMaxParallel(root, stored.maxParallel), stored.createdAt, reservations);
    atomicJson(concurrencyPlanFile(root, parent), refreshed);
    return refreshed;
  }));
}

export function releaseConcurrencyTaskReservation(root: string, taskId: string, options: { sessionId?: string | null; force?: boolean } = {}): void {
  const canonicalTaskId = loadTask(findTask(root, taskId)).meta.id;
  let removed = false;
  let reservationSession: string | null = null;
  withSchedulerLock(root, () => {
    const directory = concurrencyDirectory(root);
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
      const parent = name.slice(0, -5);
      withPlanLock(root, parent, () => {
        const stored = loadConcurrencyPlan(root, parent);
        const reservation = stored?.reservations?.[canonicalTaskId];
        if (!stored || !reservation) return;
        const currentSession = String(options.sessionId || '').trim();
        if (reservationPersisted(reservation) && !options.force && currentSession !== reservation.sessionId) {
          throw new Error(`Reservation for ${canonicalTaskId} belongs to another session (${reservation.sessionId})`);
        }
        removed = true;
        reservationSession = reservation.sessionId;
        const reservations = { ...(stored.reservations || {}) };
        delete reservations[canonicalTaskId];
        const refreshed = buildPlan(root, parent, stored.taskIds, configuredMaxParallel(root, stored.maxParallel), stored.createdAt, reservations);
        atomicJson(concurrencyPlanFile(root, parent), refreshed);
      });
    }
  });
  if (!removed) return;
  const currentSession = String(options.sessionId || reservationSession || '').trim();
  const status = leaseStatus(root, canonicalTaskId, currentSession || undefined);
  if (status.active) {
    if (!options.force && (!currentSession || status.owner !== currentSession)) throw new Error(`Task is locked by another session: ${status.owner}`);
    releaseTaskLease(root, canonicalTaskId, { sessionId: currentSession || undefined, force: Boolean(options.force) });
  }
}

export function releaseConcurrencyLane(root: string, reference: string, taskId: string, options: { sessionId?: string | null; force?: boolean } = {}): ConcurrencyPlan {
  const parent = parentFromRef(reference);
  return withSchedulerLock(root, () => withPlanLock(root, parent, () => {
    const stored = loadConcurrencyPlan(root, parent);
    if (!stored) throw new Error(`No concurrency plan found for ${parent}`);
    const canonicalTaskId = loadTask(findTask(root, taskId)).meta.id;
    if (!stored.taskIds.includes(canonicalTaskId)) throw new Error(`${canonicalTaskId} is not part of concurrency plan ${stored.id}`);
    const reservation = stored.reservations?.[canonicalTaskId];
    if (reservationPersisted(reservation) && !options.force) {
      const sessionId = String(options.sessionId || '').trim();
      if (!sessionId) throw new Error(`Releasing ${canonicalTaskId} requires the reservation session ID; use --force only for an intentional administrative release`);
      if (sessionId !== reservation.sessionId) throw new Error(`Reservation for ${canonicalTaskId} belongs to another session (${reservation.sessionId})`);
    }
    const reservations = { ...(stored.reservations || {}) };
    delete reservations[canonicalTaskId];
    if (reservation?.sessionId) {
      try { releaseTaskLease(root, canonicalTaskId, { sessionId: reservation.sessionId, force: Boolean(options.force) }); } catch (error) {
        if (!options.force) throw error;
      }
    }
    const refreshed = buildPlan(root, parent, stored.taskIds, configuredMaxParallel(root, stored.maxParallel), stored.createdAt, reservations);
    atomicJson(concurrencyPlanFile(root, parent), refreshed);
    return refreshed;
  }));
}

export function cancelConcurrencyPlan(root: string, reference: string, options: { force?: boolean } = {}): { cancelled: boolean; planId: string; recoveredCorruptPlan?: boolean } {
  const parent = parentFromRef(reference);
  return withSchedulerLock(root, () => withPlanLock(root, parent, () => {
    const file = concurrencyPlanFile(root, parent);
    if (!existsSync(file)) throw new Error(`No concurrency plan found for ${parent}`);
    let stored: ConcurrencyPlan;
    try {
      stored = readConcurrencyPlanFile(file, parent);
    } catch (error) {
      if (!options.force) throw error;
      // Administrative recovery must not trust task/reservation IDs from a
      // corrupted plan. Instead derive the only lease identity we can verify
      // independently: sessions minted by this scheduler parent always start
      // with CONC-<parent>:. Preserve worktrees; only release matching task
      // leases and remove the unusable scheduling record.
      const ownerPrefix = `CONC-${parent}:`;
      for (const task of listTasks(root)) {
        const lease = leaseStatus(root, task.meta.id);
        if (lease.active && typeof lease.owner === 'string' && lease.owner.startsWith(ownerPrefix)) {
          try { releaseTaskLease(root, task.meta.id, { sessionId: lease.owner, force: true }); } catch { /* best-effort administrative recovery */ }
        }
      }
      rmSync(file, { force: true });
      return { cancelled: true, planId: `CONC-${parent}`, recoveredCorruptPlan: true };
    }
    const held = Object.entries(stored.reservations || {}).filter(([, reservation]) => reservationPersisted(reservation));
    if (held.length && !options.force) throw new Error(`Concurrency plan ${stored.id} still has held reservations; release or recover them first, or use --force for administrative cancellation`);
    for (const [taskId, reservation] of held) {
      try { releaseTaskLease(root, taskId, { sessionId: reservation.sessionId, force: true }); } catch { /* administrative best effort */ }
    }
    rmSync(file, { force: true });
    return { cancelled: true, planId: stored.id };
  }));
}

export function concurrencyRecommendation(root: string, parentId: string): { applicable: boolean; parentTaskId: string; candidateCount: number; maxParallel: number; runnableCount: number; reason: string } {
  try {
    const stored = loadConcurrencyPlan(root, parentId);
    const ids = stored?.taskIds?.length ? stored.taskIds : candidateIds(root, parentId);
    const limit = stored ? configuredMaxParallel(root, stored.maxParallel) : configuredMaxParallel(root);
    if (ids.length < 2 || limit < 2) return {
      applicable: false,
      parentTaskId: parentId,
      candidateCount: ids.length,
      maxParallel: limit,
      runnableCount: 0,
      reason: ids.length < 2 ? 'Fewer than two child/slice tasks are available.' : 'Project maxParallel disables concurrency.'
    };
    const plan = buildPlan(root, parentId, ids, limit, stored?.createdAt, stored?.reservations || {});
    const occupied = plan.lanes.filter(lane => lane.state === 'active' || lane.state === 'reserved').length;
    const planSlots = Math.max(0, limit - occupied);
    const slots = Math.min(planSlots, availableProjectSlots(root));
    const runnable = nextRunnableCount(plan, slots);
    return {
      applicable: true,
      parentTaskId: parentId,
      candidateCount: ids.length,
      maxParallel: limit,
      runnableCount: runnable,
      reason: runnable ? `${runnable} child task(s) can advance concurrently now.` : 'Child tasks exist but none is currently schedulable.'
    };
  } catch (error) {
    return { applicable: false, parentTaskId: parentId, candidateCount: 0, maxParallel: 1, runnableCount: 0, reason: error instanceof Error ? error.message : String(error) };
  }
}

function nextRunnableCount(plan: ConcurrencyPlan, slots: number): number {
  if (slots <= 0) return 0;
  const occupiedWrites = plan.lanes.filter(lane => (lane.state === 'active' || lane.state === 'reserved') && lane.access === 'isolated-write');
  const chosen: ConcurrencyLane[] = [];
  for (const lane of plan.lanes.filter(item => item.state === 'ready').sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    if (chosen.length >= slots) break;
    if (lane.access === 'isolated-write' && (
      occupiedWrites.some(other => scopesConflict(lane.scope, other.scope)) ||
      chosen.some(other => other.access === 'isolated-write' && scopesConflict(lane.scope, other.scope))
    )) continue;
    chosen.push(lane);
  }
  return chosen.length;
}
