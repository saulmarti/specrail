import type { TaskDocument } from './types.js';
import { controlProfile, fastModeActive } from './control-profile.js';

export const INTELLIGENCE_TIERS = ['none', 'executor', 'frontier'] as const;
export type IntelligenceTier = typeof INTELLIGENCE_TIERS[number];

export interface IntelligenceRoutingInput {
  actor: string;
  action: string;
  recommendedSkill?: string | null;
}

export interface IntelligenceRecommendation {
  schemaVersion: 1;
  tier: IntelligenceTier;
  hostOwnedSelection: true;
  routingPrinciple: 'marginal-gain';
  reason: string;
  controlProfile: string;
  escalation: {
    mode: 'evidence-first';
    allowed: boolean;
    requiresNewEvidence: true;
    capsuleMaxWords: 900;
    triggers: string[];
    forbiddenReasons: string[];
  };
  frontierOutput: {
    mode: 'decision-only';
    requiredFields: string[];
    forbidden: string[];
  };
  measurement: {
    hostReportedUsageOnly: true;
    trackFrontierShare: true;
    trackByPhase: true;
  };
}

const NO_MODEL_ACTORS = new Set(['user', 'system', 'host']);
const PRODUCT_OWNER_JUDGMENT_ACTIONS = new Set([
  'product-owner-review',
  'refresh-product-owner-review',
  'final-product-owner-review',
  'refresh-final-product-owner-review'
]);
const ARCHITECTURE_ACTIONS = new Set([
  'technical-architecture',
  'architecture-review',
  'database-design'
]);

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function highRisk(task: TaskDocument): boolean {
  return ['high', 'critical'].includes(normalized(task.meta.risk));
}

function criticalRisk(task: TaskDocument): boolean {
  return normalized(task.meta.risk) === 'critical';
}

function baseRecommendation(task: TaskDocument, tier: IntelligenceTier, reason: string): IntelligenceRecommendation {
  return {
    schemaVersion: 1,
    tier,
    hostOwnedSelection: true,
    routingPrinciple: 'marginal-gain',
    reason,
    controlProfile: controlProfile(task),
    escalation: {
      mode: 'evidence-first',
      allowed: tier === 'executor',
      requiresNewEvidence: true,
      capsuleMaxWords: 900,
      triggers: [
        'A material product, architecture, contract, security, migration, or UX decision is still unsealed after deterministic repository lookup.',
        'The executor has concrete failing validation or tool evidence and cannot repair it inside the existing approved authority.',
        'Two materially different interpretations remain after authoritative repository facts and approved decisions are exhausted.',
        'An independent review finds a high-impact uncertainty that a stronger reasoning pass can resolve without inventing user intent.'
      ],
      forbiddenReasons: [
        'The task merely looks difficult or large.',
        'A full workflow phase exists, without evidence that a stronger model adds value.',
        'The executor wants a step-by-step implementation plan before trying the bounded work.',
        'The previous conversation is long and can be replayed instead of using the sealed capsule.'
      ]
    },
    frontierOutput: {
      mode: 'decision-only',
      requiredFields: ['decision', 'governed constraints', 'supporting facts', 'stop/escalation condition'],
      forbidden: ['step-by-step implementation plan', 'full conversation replay', 'repository-wide restatement', 'speculative implementation detail']
    },
    measurement: {
      hostReportedUsageOnly: true,
      trackFrontierShare: true,
      trackByPhase: true
    }
  };
}

/**
 * Sparse Intelligence is deliberately independent from provider/model names.
 * SpecRail recommends the capability tier; Codex/Pi/the host owns the actual
 * model and reasoning selector. The default is always the cheaper executor.
 * Frontier is reserved for work where a stronger reasoning pass is expected to
 * add material value, never merely because the workflow is standard/rigorous.
 */
export function intelligenceRecommendation(task: TaskDocument, input: IntelligenceRoutingInput): IntelligenceRecommendation {
  const actor = normalized(input.actor);
  const action = normalized(input.action);
  const skill = normalized(input.recommendedSkill);
  const profile = controlProfile(task);

  if (NO_MODEL_ACTORS.has(actor) || ['task-complete', 'task-rejected', 'wait-for-dependencies', 'autonomy-advance', 'enter-phase-boundary'].includes(action)) {
    return baseRecommendation(task, 'none', 'The next step is deterministic or human-owned; no model capability upgrade is justified.');
  }

  // Product Intelligence bootstrap is fact extraction/synthesis, not product
  // judgment. Keeping it on the executor prevents an expensive one-time repo
  // summary from consuming frontier budget before any decision is required.
  if (action === 'bootstrap-product-intelligence-context') {
    return baseRecommendation(task, 'executor', 'Project Product Intelligence bootstrap is deterministic-fact synthesis; reserve frontier for the later Product Owner judgment.');
  }

  if (actor === 'ai-flow-product-owner' || PRODUCT_OWNER_JUDGMENT_ACTIONS.has(action) || skill === 'ai-flow-product-owner') {
    return baseRecommendation(task, 'frontier', 'This step is explicit product judgment; use the stronger tier for the compact decision, not for implementation planning.');
  }

  if (actor === 'ai-flow-technical-reviewer' && task.meta.phase === 'technical-architecture') {
    return baseRecommendation(task, 'frontier', 'The routed phase owns the material architecture/data decision; concentrate stronger reasoning here instead of duplicating it in Product Specifier.');
  }

  if (ARCHITECTURE_ACTIONS.has(action)) {
    return baseRecommendation(task, 'frontier', 'The action is explicitly a material architecture/data judgment.');
  }

  if (actor === 'ai-flow-product-specifier' || skill === 'ai-flow-product-specifier') {
    if (fastModeActive(task) || profile === 'micro' || profile === 'light') {
      return baseRecommendation(task, 'executor', 'Bounded low-control specification should be produced by the fast tier from deterministic facts and only escalate on a concrete material unknown.');
    }
    // Even architecture/database work stays executor-owned here: Product
    // Specifier gathers facts and seals product constraints, while the dedicated
    // technical-architecture phase owns the frontier decision. This avoids paying
    // twice for the same architectural reasoning.
    return baseRecommendation(task, 'executor', criticalRisk(task)
      ? 'Critical-risk specification still starts on executor for fact gathering; escalate only a concrete unresolved decision, while dedicated judgment phases remain frontier.'
      : 'A normal specification does not by itself justify frontier planning; keep it high-level and escalate only a concrete decision with evidence.');
  }

  if (actor === 'ai-flow-ux-ui-designer' || skill === 'ai-flow-ux-ui-designer') {
    if (profile === 'rigorous' || criticalRisk(task)) {
      return baseRecommendation(task, 'frontier', 'Rigorous/critical visual direction can justify stronger judgment, while implementation remains delegated.');
    }
    return baseRecommendation(task, 'executor', 'Use the fast tier for bounded visual work and escalate only an unresolved material design decision.');
  }

  if (actor === 'ai-flow-builder' || skill === 'ai-flow-builder' || task.meta.phase === 'builder') {
    return baseRecommendation(task, 'executor', 'Implementation is executor-owned. Approved product/architecture decisions are inputs; new material decisions must be escalated instead of pre-planned by frontier.');
  }

  if (actor === 'ai-flow-qa-engineer' || skill === 'ai-flow-qa-engineer') {
    return baseRecommendation(task, 'executor', 'Verification should start with deterministic tests and the fast tier; frontier is reserved for high-impact ambiguity exposed by evidence.');
  }

  if (actor === 'ai-flow-technical-reviewer' || skill === 'ai-flow-technical-reviewer') {
    if (profile === 'rigorous' || criticalRisk(task)) {
      return baseRecommendation(task, 'frontier', 'Independent review is at the rigorous/critical boundary where stronger judgment is expected to add material value.');
    }
    return baseRecommendation(task, 'executor', 'Focused review should run on the fast tier and escalate only a concrete high-impact uncertainty.');
  }

  if (actor === 'ai-flow-target-audience' || actor === 'ai-flow-final-customer' || skill === 'ai-flow-target-audience' || skill === 'ai-flow-final-customer') {
    if (profile === 'rigorous' || criticalRisk(task)) {
      return baseRecommendation(task, 'frontier', 'Rigorous/critical outcome judgment may justify the stronger tier after implementation evidence exists.');
    }
    return baseRecommendation(task, 'executor', 'Outcome simulation starts on the fast tier; evidence, not phase name, decides whether escalation is worthwhile.');
  }

  if (highRisk(task) && profile === 'rigorous') {
    return baseRecommendation(task, 'frontier', 'Unknown agent-owned work is both high-risk and rigorous; fail conservatively to stronger reasoning until the action is classified.');
  }

  return baseRecommendation(task, 'executor', 'Default to the fast executor tier; frontier requires a concrete marginal-value reason.');
}
