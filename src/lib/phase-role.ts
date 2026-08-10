import type { TaskDocument, TaskPhase } from './types.js';

const THINKING_PHASES = new Set<TaskPhase>(['product-specifier','ux-ui-designer','technical-architecture','spec-approval']);
const IMPLEMENTATION_PHASES = new Set<TaskPhase>(['builder']);
const REVIEW_PHASES = new Set<TaskPhase>(['technical-reviewer','qa-engineer','final-customer','final-approval']);
const PROFILES = ['fast','standard','rigorous'] as const;
type ContextProfileName = typeof PROFILES[number];
export type RuntimeRole = 'thinker' | 'implementer' | 'reviewer' | 'target-audience' | 'system';

function profileName(value: unknown, fallback: ContextProfileName): ContextProfileName {
  const normalized = String(value || '').trim().toLowerCase();
  return (PROFILES as readonly string[]).includes(normalized) ? normalized as ContextProfileName : fallback;
}
function profileRank(value: ContextProfileName): number { return PROFILES.indexOf(value); }
function atLeast(value: ContextProfileName, floor: ContextProfileName): ContextProfileName {
  return profileRank(value) >= profileRank(floor) ? value : floor;
}
function risk(task: TaskDocument): string { return String(task.meta.risk || '').trim().toLowerCase(); }
function size(task: TaskDocument): string { return String(task.meta.size || '').trim().toLowerCase(); }
function highRisk(task: TaskDocument): boolean { return ['high','critical'].includes(risk(task)); }
function largeTask(task: TaskDocument): boolean { return ['large','xlarge','extra-large','complex'].includes(size(task)); }

export function runtimeRoleForPhase(phase: TaskPhase): RuntimeRole {
  if (THINKING_PHASES.has(phase)) return 'thinker';
  if (IMPLEMENTATION_PHASES.has(phase)) return 'implementer';
  if (REVIEW_PHASES.has(phase)) return 'reviewer';
  return 'system';
}

/**
 * Context policy is deliberately independent from the Codex model selector.
 * SpecRail controls how much repository/task context a phase receives, never
 * which model or reasoning setting the user selected in the host.
 */
export function contextProfileForTask(_config: unknown, task: TaskDocument): ContextProfileName {
  const role = runtimeRoleForPhase(task.meta.phase);
  const executionProfile = profileName(task.meta.execution_profile, 'standard');
  if (role === 'implementer') return atLeast(executionProfile, 'standard');
  if (role === 'thinker') return highRisk(task) || largeTask(task) || executionProfile === 'rigorous' ? 'standard' : 'fast';
  if (role === 'reviewer') return highRisk(task) || executionProfile === 'rigorous' ? 'standard' : 'fast';
  if (role === 'target-audience') return 'fast';
  return executionProfile;
}
