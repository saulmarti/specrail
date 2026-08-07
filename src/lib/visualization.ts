import { getSection } from './task.js';
import {
  computeVisualizationSourceDigest,
  digestJson,
  getVisualizationCapability,
  getVisualizationRun,
  persistVisualizationPlan
} from './capabilities.js';
import type { Attachment, ProjectConfig, TaskDocument, TaskQuestion, VisualizationEvaluatorMode, VisualizationPlan, VisualizationSource } from './types.js';

const PHASES = ['product-specifier','ux-ui-designer','technical-architecture','spec-approval','builder','technical-reviewer','qa-engineer','final-customer','final-approval','delivery','done'] as const;

function clean(value: unknown): string { return String(value ?? '').trim(); }
function enabled(config: ProjectConfig): boolean { return config.visualize.enabled !== false; }
function surface(task: TaskDocument, name: string): boolean { return task.meta.surfaces.some(item => item.toLowerCase() === name); }
function section(task: TaskDocument, name: string): string { return clean(getSection(task.body, name)); }

interface PlanInput {
  root: string;
  config: ProjectConfig;
  task: TaskDocument;
  sessionId?: string | null | undefined;
  gate: string;
  kind: string;
  title: string;
  purpose: string;
  payload: Record<string, unknown>;
  experience: VisualizationPlan['experience'];
  sources?: VisualizationPlan['sources'];
}

function evaluatorMode(task: TaskDocument, kind: string): VisualizationEvaluatorMode {
  if (['ui-spec-review','architecture-spec-review','database-spec-review','final-review'].includes(kind)) return 'fresh-context';
  if (['high','critical'].includes(task.meta.risk)) return 'fresh-context';
  return 'self-check';
}

function plan(input: PlanInput): VisualizationPlan | null {
  if (!enabled(input.config)) return null;
  const capability = getVisualizationCapability(input.root, input.sessionId);
  const previous = getVisualizationRun(input.root, input.task.meta.id, input.gate, input.sessionId);
  const sources = input.sources ?? [];
  const createdAt = new Date().toISOString();
  const payload = {
    ...input.payload,
    gate: input.gate,
    priorRun: previous ? { outcome: previous.outcome, recordedAt: previous.recordedAt, resultDigest: previous.resultDigest } : null
  };
  const sourceDigest = computeVisualizationSourceDigest(input.root, sources, payload);
  const base = {
    schemaVersion: 4 as const,
    capability: 'visualize' as const,
    preferredCapabilityName: 'Visualize' as const,
    preferredSkillName: 'visualize' as const,
    skillInvocation: '$visualize' as const,
    availability: capability.availability,
    exactSkillName: capability.exactSkillName,
    discovery: 'codex-skill-catalog' as const,
    kind: input.kind,
    gate: input.gate,
    title: input.title,
    purpose: input.purpose,
    payload,
    experience: input.experience,
    sources,
    constraints: {
      readOnly: true as const,
      maxInstances: 1 as const,
      mustNotModifyProject: true as const,
      mustNotAnswerForUser: true as const,
      sourceOfTruth: 'markdown' as const
    },
    evaluatorMode: evaluatorMode(input.task, input.kind),
    fallback: 'markdown-and-attachments' as const,
    recordRequired: true as const,
    sourceDigest,
    createdAt
  };
  const result: VisualizationPlan = { ...base, planDigest: digestJson(base) };
  if (input.sessionId?.trim()) persistVisualizationPlan(input.root, input.task.meta.id, input.gate, input.sessionId, result);
  return result;
}

function designKind(task: TaskDocument): string {
  if (surface(task,'frontend') || surface(task,'ui') || surface(task,'ux') || task.meta.route.design) return 'ui-spec-review';
  if (task.meta.route.database || surface(task,'database') || surface(task,'data')) return 'database-spec-review';
  if (task.meta.route.architecture || surface(task,'architecture')) return 'architecture-spec-review';
  if (surface(task,'backend') || surface(task,'api')) return 'backend-spec-review';
  return 'spec-review';
}

function attachmentSources(attachments: Attachment[]): VisualizationSource[] {
  return attachments.map(item => ({ kind: item.kind, path: item.path, mediaType: item.mediaType, sha256: item.sha256 ?? null }));
}

export function specificationVisualization(root: string, config: ProjectConfig, task: TaskDocument, attachments: Attachment[] = [], sessionId?: string | null): VisualizationPlan | null {
  const kind = designKind(task);
  const visuals = attachments.filter(item => item.mediaType.startsWith('image/') || /rendered|proposal/.test(item.kind)).map(item => ({ kind: item.kind, label: item.label, path: item.path, mediaType: item.mediaType }));
  const purpose = kind === 'ui-spec-review'
    ? 'Compare the real focused before state with the Image Gen proposal, preserve approved scope, and make acceptance criteria and risks easy to review without inventing UI.'
    : kind === 'architecture-spec-review'
      ? 'Explain the architecture problem, boundaries, alternatives, dependencies, risks, and rendered diagram from canonical project artifacts.'
      : kind === 'database-spec-review'
        ? 'Explain entities, relationships, migration, rollback, risks, and the rendered ERD from canonical project artifacts.'
        : kind === 'backend-spec-review'
          ? 'Explain the observable backend contract: input, processing, outputs, errors, persistence, authorization, and planned executable evidence.'
          : 'Explain goal, scope, exclusions, acceptance criteria, decisions, risks, and workflow route from the canonical specification.';
  return plan({
    root, config, task, sessionId, gate: 'spec-approval', kind,
    title: `${task.meta.id} — ${task.meta.title}`,
    purpose,
    experience: kind==='ui-spec-review'?{mode:'interactive',pattern:'before-proposal-comparator',views:['Before','Proposal','Acceptance criteria','Risks'],controls:['before/proposal toggle','viewport selector','detail tabs'],defaultView:'Before vs Proposal'}:kind==='architecture-spec-review'?{mode:'interactive',pattern:'architecture-explorer',views:['Current boundaries','Proposed boundaries','Alternatives','Risks'],controls:['layer toggles','alternative selector','dependency focus'],defaultView:'Proposed boundaries'}:kind==='database-spec-review'?{mode:'interactive',pattern:'erd-migration-explorer',views:['Current schema','Proposed schema','Migration','Rollback'],controls:['schema toggle','entity focus','migration step selector'],defaultView:'Proposed schema'}:kind==='backend-spec-review'?{mode:'interactive',pattern:'contract-explorer',views:['Happy path','Invalid input','Errors','Evidence'],controls:['scenario tabs','request/response toggle','step focus'],defaultView:'Happy path'}:{mode:'interactive',pattern:'specification-explorer',views:['Goal','Scope','Criteria','Decisions'],controls:['section tabs','decision focus'],defaultView:'Goal'},
    payload: {
      taskId: task.meta.id, title: task.meta.title, type: task.meta.type, size: task.meta.size, risk: task.meta.risk,
      surfaces: task.meta.surfaces, route: task.meta.route, need: section(task,'Need'), productValue: section(task,'Product Value'),
      scope: section(task,'Scope'), outOfScope: section(task,'Out of Scope'), acceptanceCriteria: section(task,'Acceptance Criteria'),
      decisions: section(task,'Decisions'), uiTarget: section(task,'UI Target'), architecture: section(task,'Architecture and Data Design'), visuals
    },
    sources: attachmentSources(attachments)
  });
}

export function finalVisualization(root: string, config: ProjectConfig, task: TaskDocument, attachments: Attachment[] = [], sessionId?: string | null): VisualizationPlan | null {
  const visuals = attachments.filter(item => item.mediaType.startsWith('image/') || item.kind.includes('rendered')).map(item => ({ kind: item.kind, label: item.label, path: item.path, mediaType: item.mediaType }));
  return plan({
    root, config, task, sessionId, gate: 'final-approval', kind: 'final-review', title: `${task.meta.id} — ${task.meta.title}`,
    purpose: 'Compare approved intent with the actual result and expose tests, independent review, QA, final-customer verdict, remaining risks, and delivery state without hiding failed checks.',
    experience:{mode:'interactive',pattern:'delivery-review-comparator',views:['Before','Approved proposal','Implemented after','Technical evidence','QA and customer'],controls:['before/proposal/after toggle','viewport selector','report tabs'],defaultView:'Before vs After'},
    payload: {
      taskId: task.meta.id, title: task.meta.title, status: task.meta.status, phase: task.meta.phase,
      approvedHash: task.meta.spec_approval_hash, currentScope: section(task,'Scope'), acceptanceCriteria: section(task,'Acceptance Criteria'),
      qa: section(task,'QA'), finalCustomer: section(task,'Final Customer'), handoff: section(task,'Handoff'), visuals
    },
    sources: attachmentSources(attachments)
  });
}

export function questionsVisualization(root: string, config: ProjectConfig, task: TaskDocument, questions: TaskQuestion[] = [], sessionId?: string | null): VisualizationPlan | null {
  return plan({
    root, config, task, sessionId, gate: 'questions', kind: 'decision-support', title: `${task.meta.id} — decisiones pendientes`,
    purpose: 'Present options, recommendation, impact, and consequences neutrally. The native input control remains the only place where the user answers.',
    experience:{mode:'interactive',pattern:'option-comparison',views:['Options','Recommendation','Impact'],controls:['question selector','option comparison'],defaultView:'Options'},
    payload: { taskId: task.meta.id, title: task.meta.title, risk: task.meta.risk, questions: questions.map(q => ({ id:q.id, category:q.category, impact:q.impact, text:q.text, options:q.options, recommendation:q.recommendation })) }
  });
}

export function blockerVisualization(root: string, config: ProjectConfig, task: TaskDocument, sessionId?: string | null): VisualizationPlan | null {
  return plan({
    root, config, task, sessionId, gate: 'blocker', kind: 'blocker-explainer', title: `${task.meta.id} — bloqueo`,
    purpose: 'Explain cause, affected phase, impact, known facts, safe recovery choices, and the next consequence of each choice without modifying the task.',
    experience:{mode:'interactive',pattern:'recovery-path-explorer',views:['Cause','Impact','Recovery choices'],controls:['choice comparison','affected-phase focus'],defaultView:'Cause'},
    payload: { taskId:task.meta.id, title:task.meta.title, risk:task.meta.risk, status:task.meta.status, phase:task.meta.phase, reason:task.meta.block_reason ?? 'Unknown blocker', resumePhase:task.meta.resume_phase, resumeStatus:task.meta.resume_status }
  });
}

interface WorkflowVisualizationInput {
  dependencies?: string[];
  evidence?: unknown;
  context?: { profile?: string; files?: string[]; remainingFiles?: number; automaticExpansionsRemaining?: number } | null;
  action?: string;
  actor?: string;
}

export function workflowVisualization(root: string, config: ProjectConfig, task: TaskDocument, input: WorkflowVisualizationInput = {}, sessionId?: string | null): VisualizationPlan | null {
  const current = Math.max(0, PHASES.indexOf(task.meta.phase));
  const steps = PHASES.map((phase,index) => ({ phase, status:index<current?'complete':index===current?'current':'pending' }));
  return plan({
    root, config, task, sessionId, gate: 'status', kind: 'workflow-status', title: `${task.meta.id} — estado`,
    purpose: 'Show completed, current, and pending phases plus next actor/action, blockers, dependencies, evidence readiness, and context budget using only supplied state.',
    experience:{mode:'interactive',pattern:'workflow-timeline',views:['Timeline','Evidence','Dependencies','Context budget'],controls:['phase focus','detail tabs'],defaultView:'Timeline'},
    payload: {
      taskId:task.meta.id,title:task.meta.title,risk:task.meta.risk,status:task.meta.status,phase:task.meta.phase,actor:input.actor,action:input.action,
      steps,dependencies:input.dependencies ?? [],evidence:input.evidence ?? null,
      context:input.context?{profile:input.context.profile,files:input.context.files?.length ?? 0,remainingFiles:input.context.remainingFiles,expansionsRemaining:input.context.automaticExpansionsRemaining}:null
    }
  });
}

export function validateVisualizationPlan(planValue: VisualizationPlan | null): string[] {
  if (!planValue) return [];
  const errors: string[] = [];
  if (planValue.schemaVersion !== 4) errors.push('Visualization plan schemaVersion must be 4');
  if (planValue.capability !== 'visualize' || planValue.preferredCapabilityName !== 'Visualize' || planValue.preferredSkillName !== 'visualize' || planValue.skillInvocation !== '$visualize') errors.push('Visualization plan must target the installed Codex Visualize skill via $visualize');
  if (planValue.discovery !== 'codex-skill-catalog') errors.push('Visualization capability must be discovered from the current Codex skill catalog');
  if (planValue.availability === 'available' && planValue.exactSkillName !== 'visualize') errors.push('Available visualization plan must include the exact Visualize skill name');
  if (planValue.availability !== 'available' && planValue.exactSkillName) errors.push('Unavailable or unknown visualization plan cannot claim an exact skill name');
  if (planValue.experience?.mode!=='interactive' || !planValue.experience.pattern || !planValue.experience.views?.length || !planValue.experience.controls?.length) errors.push('Visualize must define a useful interactive experience rather than a static decoration');
  if (typeof planValue.gate !== 'string' || !planValue.gate.trim()) errors.push('Visualization plan must identify its workflow gate');
  if (planValue.constraints.maxInstances !== 1) errors.push('Only one visualization may be rendered per gate');
  if (!planValue.constraints.readOnly || !planValue.constraints.mustNotModifyProject || !planValue.constraints.mustNotAnswerForUser) errors.push('Visualization must be read-only and non-decisional');
  if (planValue.fallback !== 'markdown-and-attachments') errors.push('Visualization plan must retain Markdown and attachments as fallback');
  if (!planValue.recordRequired) errors.push('Visualization outcome must be recorded after invocation or fallback');
  if (typeof planValue.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(planValue.planDigest)) errors.push('Visualization plan must include a SHA-256 plan digest');
  if (typeof planValue.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(planValue.sourceDigest)) errors.push('Visualization plan must include a SHA-256 source digest');
  if (!['self-check','fresh-context'].includes(planValue.evaluatorMode)) errors.push('Visualization plan must select a supported evaluator mode');
  return errors;
}
