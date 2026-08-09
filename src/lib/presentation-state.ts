import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PresentationAcknowledgementState, PresentationActionAcknowledgement, PresentationActionOutcome, PresentationHostAction } from './types.js';

export type PresentationGate = 'spec-approval' | 'final-approval';

interface StoredPresentationState extends PresentationAcknowledgementState {
  updatedAt: string;
  recordDigest: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function normalizedSession(sessionId?: string | null): string { return String(sessionId || '').trim() || 'unspecified'; }
function stateFile(root: string, taskId: string, gate: PresentationGate, sessionId: string): string {
  const sessionDigest = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return path.join(path.resolve(root), '.ai', 'runtime', 'presentations', `${taskId}-${gate}-${sessionDigest}.json`);
}
function actionSuccess(action: PresentationHostAction, outcome: PresentationActionOutcome): boolean {
  return action.type === 'present-image' ? outcome === 'presented' : outcome === 'opened' || outcome === 'offered';
}
function validOutcome(action: PresentationHostAction, outcome: PresentationActionOutcome): boolean {
  if (outcome === 'pending') return false;
  return action.type === 'present-image'
    ? ['presented', 'failed', 'unavailable'].includes(outcome)
    : ['opened', 'offered', 'failed', 'unavailable'].includes(outcome);
}
function initialAcknowledgements(actions: PresentationHostAction[]): PresentationActionAcknowledgement[] {
  return actions.map(action => ({ actionId: action.id, type: action.type, outcome: 'pending', detail: null, acknowledgedAt: null }));
}
function summarize(taskId: string, gate: PresentationGate, sessionId: string, presentationDigest: string, actions: PresentationHostAction[], acknowledgements: PresentationActionAcknowledgement[]): PresentationAcknowledgementState {
  const byId = new Map(acknowledgements.map(item => [item.actionId, item]));
  const pendingActionIds: string[] = [];
  const blockingActionIds: string[] = [];
  const completedActionIds: string[] = [];
  const degradedActionIds: string[] = [];
  for (const action of actions) {
    const ack = byId.get(action.id);
    if (!ack || ack.outcome === 'pending') { pendingActionIds.push(action.id); continue; }
    if (actionSuccess(action, ack.outcome)) completedActionIds.push(action.id);
    else {
      degradedActionIds.push(action.id);
      if (action.blocking) blockingActionIds.push(action.id);
    }
  }
  const status = blockingActionIds.length ? 'blocked' : pendingActionIds.length ? 'pending' : 'ready';
  return { schemaVersion: 1, taskId, gate, sessionId, presentationDigest, status, approvalReady: status === 'ready', pendingActionIds, blockingActionIds, completedActionIds, degradedActionIds, actions: actions.map(action => byId.get(action.id) ?? { actionId: action.id, type: action.type, outcome: 'pending', detail: null, acknowledgedAt: null }) };
}

export function presentationDigest(input: { taskId: string; gate: PresentationGate; actions: PresentationHostAction[]; attachments: Array<{ id?: string; sha256?: string | null; openUrl?: string | null; requiredVisible?: boolean; }>; }): string {
  return digest({ taskId: input.taskId, gate: input.gate, actions: input.actions, attachments: input.attachments.map(item => ({ id: item.id ?? null, sha256: item.sha256 ?? null, openUrl: item.openUrl ?? null, requiredVisible: item.requiredVisible === true })) });
}

export function presentationAcknowledgementState(root: string, input: { taskId: string; gate: PresentationGate; sessionId?: string | null; presentationDigest: string; actions: PresentationHostAction[]; }): PresentationAcknowledgementState {
  const sessionId = normalizedSession(input.sessionId);
  const file = stateFile(root, input.taskId, input.gate, sessionId);
  let acknowledgements = initialAcknowledgements(input.actions);
  if (existsSync(file)) {
    try {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoredPresentationState>;
      const { recordDigest, ...unsigned } = stored;
      const integrityValid = typeof recordDigest === 'string' && recordDigest === digest(unsigned);
      if (integrityValid && stored.presentationDigest === input.presentationDigest && stored.taskId === input.taskId && stored.gate === input.gate && stored.sessionId === sessionId && Array.isArray(stored.actions)) {
        acknowledgements = stored.actions.filter((item): item is PresentationActionAcknowledgement => Boolean(item && typeof item === 'object' && typeof item.actionId === 'string'));
      }
    } catch { /* a corrupt/stale runtime acknowledgement never grants approval */ }
  }
  return summarize(input.taskId, input.gate, sessionId, input.presentationDigest, input.actions, acknowledgements);
}

export function recordPresentationAction(root: string, input: { taskId: string; gate: PresentationGate; sessionId: string; presentationDigest: string; actions: PresentationHostAction[]; actionId: string; outcome: PresentationActionOutcome; detail?: string | null; }): PresentationAcknowledgementState {
  const sessionId = normalizedSession(input.sessionId);
  if (sessionId === 'unspecified') throw new Error('Presentation acknowledgement requires --session <stable-codex-session-id>');
  const action = input.actions.find(item => item.id === input.actionId);
  if (!action) throw new Error(`Unknown or stale presentation action: ${input.actionId}`);
  if (!validOutcome(action, input.outcome)) throw new Error(`Invalid outcome ${input.outcome} for ${action.type}`);
  if (['failed', 'unavailable'].includes(input.outcome) && !String(input.detail || '').trim()) throw new Error(`${input.outcome} presentation actions require a concrete --detail reason`);
  const current = presentationAcknowledgementState(root, input);
  if (current.presentationDigest !== input.presentationDigest) throw new Error('Presentation digest mismatch');
  const now = new Date().toISOString();
  const updated = current.actions.map(item => item.actionId === action.id ? { ...item, outcome: input.outcome, detail: String(input.detail || '').trim() || null, acknowledgedAt: now } : item);
  const summary = summarize(input.taskId, input.gate, sessionId, input.presentationDigest, input.actions, updated);
  const file = stateFile(root, input.taskId, input.gate, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  const unsigned = { ...summary, updatedAt: now };
  const stored: StoredPresentationState = { ...unsigned, recordDigest: digest(unsigned) };
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
  return summary;
}

export function assertPresentationReady(root: string, input: { taskId: string; gate: PresentationGate; sessionId?: string | null; presentationDigest: string; actions: PresentationHostAction[]; }): PresentationAcknowledgementState {
  const state = presentationAcknowledgementState(root, input);
  if (!input.sessionId || !String(input.sessionId).trim()) throw new Error('Approval requires --session <stable-codex-session-id> after presentation acknowledgement');
  if (!state.approvalReady) {
    const details = [...state.pendingActionIds.map(id => `${id}:pending`), ...state.blockingActionIds.map(id => `${id}:blocked`)].join(', ');
    throw new Error(`Review presentation is not ready for approval${details ? `: ${details}` : ''}. Execute and acknowledge the current presentation host actions first.`);
  }
  return state;
}
