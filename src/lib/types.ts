export const TASK_STATUSES = [
  'draft','refining','awaiting_spec_approval','ready','active','review','qa',
  'customer_validation','awaiting_final_approval','awaiting_delivery','blocked','done','rejected'
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const TASK_PHASES = [
  'product-specifier','ux-ui-designer','technical-architecture','spec-approval','builder',
  'technical-reviewer','qa-engineer','final-customer','final-approval','delivery','done'
] as const;
export type TaskPhase = typeof TASK_PHASES[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type StringMap = Record<string, string>;

export interface TaskRoute {
  design: boolean;
  architecture: boolean;
  database: boolean;
  implementation: boolean;
  technical_review: 'none' | 'focused' | 'full' | string;
  qa: 'none' | 'focused' | 'browser' | string;
  target_audience: boolean;
  final_customer: boolean;
  mutation_testing: boolean;
  property_testing: 'none' | 'recommended' | 'required' | string;
  observability: 'none' | 'focused' | 'full' | string;
  [key: string]: JsonValue;
}

export interface TaskMeta {
  id: string;
  title: string;
  type: string;
  status: TaskStatus;
  phase: TaskPhase;
  size: string;
  risk: string;
  execution_profile: string;
  surfaces: string[];
  route: TaskRoute;
  spec_approval: string;
  spec_approval_hash: string | null;
  spec_effective_hash?: string | null;
  spec_approved_at: string | null;
  spec_integrity_version?: number;
  project_governance_hash?: string | null;
  scope_guard_hash?: string | null;
  scope_baseline_commit?: string | null;
  qa_mission_hash: string | null;
  delivery_strategy: 'single' | 'vertical-slices' | string;
  slice_ids: string[];
  final_approval: string;
  final_approved_at?: string | null;
  waiting_for: string;
  open_questions: number;
  learning_recorded: boolean;
  dependencies: string[];
  parent_id?: string | null;
  file_scope?: string[];
  resume_status: TaskStatus | null;
  resume_phase: TaskPhase | null;
  block_reason?: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_base: string | null;
  delivery_status: string;
  delivered_at?: string | null;
  delivery_action?: string | null;
  completed_design?: boolean;
  completed_architecture?: boolean;
  product_owner_review_digest?: string | null;
  product_owner_final_review_digest?: string | null;
  target_audience_review_digest?: string | null;
  target_audience_origin_session_id?: string | null;
  target_audience_forbidden_session_ids?: string[];
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface TaskDocument {
  path: string;
  meta: TaskMeta;
  body: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  phase: TaskPhase;
  path: string;
}

export interface TaskInput {
  title: string;
  need?: string;
  type?: string;
  surfaces?: string[];
  size?: string;
  risk?: string;
  executionProfile?: string;
  parentId?: string | null;
  fileScope?: string[];
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface NativeQuestion {
  id: string;
  header: string;
  question: string;
  options: QuestionOption[];
  isOther: boolean;
}

export interface DecisionPresentation {
  kind: string;
  requiredBeforeInput: boolean;
  title: string;
  markdown: string;
  taskPath: string;
  taskRelativePath: string;
  previewUrl: null;
  attachments: Attachment[];
  visualization: null;
}

export interface NativeInteraction {
  tool: 'request_user_input';
  questions: NativeQuestion[];
  presentation?: Presentation | DecisionPresentation;
  visualization?: VisualizationPlan;
  turnPolicy?: {
    afterSelection: 'persist-boundary-choice-and-end-turn';
    sameTurnPhaseWork: 'forbidden';
    resumePrompt: string;
    choiceMap: Record<string, 'continue-current' | 'pause-model-change' | 'fresh-chat'>;
  };
}

export interface HostActionInteraction {
  tool: 'host_actions';
  presentation: Presentation;
  actions: PresentationHostAction[];
  reason: string;
  recordCommand: string;
}

export interface TaskQuestion {
  id: string;
  category: string;
  impact: string;
  text: string;
  options: string[];
  recommendation: string | null;
  status: 'open' | 'answered';
  answer: string | null;
  created_at: string;
  answered_at: string | null;
}

export interface EvidenceRecord {
  id: string;
  kind: string;
  path: string;
  source: string;
  label: string;
  tool: string | null;
  command: string | null;
  exitCode: number | null;
  route: string | null;
  viewport: string | null;
  target: string | null;
  captureScope: string | null;
  runtimeUrl?: string | null;
  missionHash?: string | null;
  attributes?: Record<string, JsonValue>;
  size: number;
  sha256: string;
  createdAt: string;
}

export interface EvidenceManifest {
  taskId: string;
  evidence: EvidenceRecord[];
}

export interface EvidenceInput {
  kind: string;
  path: string;
  source: string;
  label?: string;
  tool?: string;
  command?: string;
  exitCode?: number | null;
  route?: string;
  viewport?: string;
  target?: string;
  captureScope?: string;
  runtimeUrl?: string;
  missionHash?: string;
  attributes?: Record<string, JsonValue>;
}

export interface Attachment {
  id?: string;
  kind: string;
  label: string;
  path: string;
  relativePath?: string;
  mediaType: string;
  display?: 'inline' | 'attachment';
  source?: string;
  tool?: string | null;
  route?: string | null;
  viewport?: string | null;
  target?: string | null;
  captureScope?: string | null;
  runtimeUrl?: string | null;
  sha256?: string | null;
  reviewRole?: 'before' | 'proposal' | 'after' | 'supporting' | null;
  requiredVisible?: boolean;
  openUrl?: string | null;
}

export type PresentationHostAction =
  | { id: string; type: 'present-image'; surface: 'conversation'; attachmentId: string; label: string; reviewRole: 'before' | 'proposal' | 'after' | 'supporting'; mediaType: string; blocking: true; }
  | { id: string; type: 'open-url'; surface: 'browser'; attachmentId: 'REVIEW-COCKPIT'; label: string; url: string; blocking: false; };

export type PresentationActionOutcome = 'pending' | 'presented' | 'opened' | 'offered' | 'failed' | 'unavailable';

export interface PresentationActionAcknowledgement {
  actionId: string;
  type: PresentationHostAction['type'];
  outcome: PresentationActionOutcome;
  detail: string | null;
  acknowledgedAt: string | null;
}

export interface PresentationAcknowledgementState {
  schemaVersion: 1;
  taskId: string;
  gate: 'spec-approval' | 'final-approval';
  sessionId: string;
  presentationDigest: string;
  status: 'pending' | 'ready' | 'blocked';
  approvalReady: boolean;
  pendingActionIds: string[];
  blockingActionIds: string[];
  completedActionIds: string[];
  degradedActionIds: string[];
  actions: PresentationActionAcknowledgement[];
}

export interface PresentationContract {
  gate: 'spec-approval' | 'final-approval';
  sessionId: string;
  presentationDigest: string;
  evidence: { inlineRequired: boolean; requiredAttachmentIds: string[]; localPathsAreAuditOnly: true; requiredSurface: 'conversation'; onUnavailable: 'block-approval'; };
  visualize: { artifactPrepared: boolean; referencePrepared: boolean; hostPresentation: 'unverified'; hostPresentationVerified: false; fallbackRequired: boolean; };
  cockpit: { artifactPrepared: boolean; hostPresentation: 'unverified'; hostPresentationVerified: false; openActionRequired: true; attachmentId: 'REVIEW-COCKPIT'; openUrl: string; };
  acknowledgement: PresentationAcknowledgementState;
  fallback: { required: boolean; mode: 'inline-evidence-and-cockpit-open-action'; requiredHostActions: PresentationHostAction[]; };
}

export interface Presentation {
  kind: string;
  requiredBeforeInput: boolean;
  title: string;
  markdown: string;
  taskPath: string;
  taskRelativePath: string;
  previewUrl: string | null;
  attachments: Attachment[];
  visualization: VisualizationPlan | null;
  presentationContract: PresentationContract;
}

export type VisualizationAvailability = 'unknown' | 'available' | 'unavailable';
export type VisualizationOutcome = 'pending' | 'rendered' | 'fallback' | 'failed';
export type VisualizationEvaluatorMode = 'self-check' | 'fresh-context';

export interface VisualizationSource {
  id: string;
  kind: string;
  label: string;
  path: string;
  mediaType?: string;
  sha256?: string | null;
  reviewRole?: 'before' | 'proposal' | 'after' | 'supporting';
  route?: string | null;
  viewport?: string | null;
  target?: string | null;
  captureScope?: string | null;
  requiredInVisual: boolean;
  runtimeUrl?: string | null;
}

export interface VisualizationPlan {
  schemaVersion: 4;
  capability: 'visualize';
  preferredCapabilityName: 'Visualize';
  preferredSkillName: 'visualize';
  skillInvocation: '$visualize';
  availability: VisualizationAvailability;
  exactSkillName: string | null;
  discovery: 'codex-skill-catalog';
  kind: string;
  gate: string;
  title: string;
  purpose: string;
  payload: Record<string, unknown>;
  experience: { mode:'interactive'; pattern:string; views:string[]; controls:string[]; defaultView:string; };
  sources: VisualizationSource[];
  requiredSourceIds: string[];
  constraints: {
    readOnly: true;
    maxInstances: 1;
    mustNotModifyProject: true;
    mustNotAnswerForUser: true;
    sourceOfTruth: 'markdown';
    imageSourcePolicy: 'embed-data-uri';
    forbidLocalFileImageSrc: true;
    requireEvidenceMarkers: true;
    requiredEvidenceContent: 'embedded-data-image';
  };
  evaluatorMode: VisualizationEvaluatorMode;
  fallback: 'markdown-and-attachments';
  recordRequired: true;
  planDigest: string;
  sourceDigest: string;
  createdAt: string;
}

export interface VisualizationCapabilityRecord {
  schemaVersion: 3;
  capability: 'visualize';
  preferredCapabilityName: 'Visualize';
  preferredSkillName: 'visualize';
  skillInvocation: '$visualize';
  sessionId: string;
  availability: VisualizationAvailability;
  exactSkillName: string | null;
  reason: string | null;
  checkedAt: string;
}

export interface VisualizationRunRecord {
  schemaVersion: 4;
  taskId: string;
  sessionId: string;
  gate: string;
  outcome: VisualizationOutcome;
  provider: string | null;
  planDigest: string;
  sourceDigest: string;
  invocationRef: string | null;
  resultDigest: string | null;
  artifactPath: string | null;
  displayedSourceIds: string[];
  quality: VisualizationQuality | null;
  artifactPrepared: boolean;
  referencePrepared: boolean;
  hostPresentation: 'unverified';
  hostPresentationVerified: false;
  fallbackRequired: boolean;
  recordedAt: string;
}

export interface VisualizationQuality {
  evaluator: VisualizationEvaluatorMode;
  clearPurpose: boolean;
  sourceFaithful: boolean;
  mobileReadable: boolean;
  noOverflow: boolean;
  noClipping: boolean;
  concise: boolean;
  score: number;
  notes?: string;
}


export interface TraceContext {
  sessionId?: string | null;
  branchId?: string;
  parentEventId?: string;
  actor?: string;
  skills?: string[];
  tools?: string[];
}

export interface TraceEvent {
  schemaVersion: 3;
  eventId: string;
  eventHash: string;
  parentEventId: string | null;
  parentHash: string | null;
  branchId: string;
  taskId: string;
  event: string;
  phase: string;
  status: string;
  at: string;
  sessionId: string | null;
  taskset: {
    specificationHash: string | null;
    qaMissionHash: string | null;
    acceptanceHash: string | null;
    routeHash: string | null;
    surfaces: string[];
    activeEvalIds: string[];
    verification: { quality: QualityPolicy | null; operations: OperationalPolicy | null };
    digest: string;
  };
  harness: {
    name: 'specrail';
    actor: string;
    phase: string;
    executionProfile: string;
    codegraph: 'mcp';
    skills: string[];
    tools: string[];
    digest: string;
  };
  runtime: {
    kind: 'local' | 'worktree';
    repositoryRoot: string;
    workspacePath: string;
    branch: string | null;
    platform: string;
    architecture: string;
    nodeVersion: string;
    digest: string;
  };
  data: Record<string, JsonValue>;
}

export interface TraceValidation { valid:boolean; taskId:string; eventCount:number; branchCount:number; errors:string[]; }

export interface RepairState { taskId:string; attempts:Record<string,number>; limit:number; exhausted:boolean; history:Array<{at:string;phase:string;reason:string;attempt:number}>; }
export interface FailureRecord { id:string; taskId:string; phase:string; category:string; statement:string; fingerprint:string; surfaces:string[]; at:string; }
export interface EvalCandidate { id:string; fingerprint:string; category:string; phase:string; statement:string; occurrences:number; taskIds:string[]; status:'candidate'|'active'|'dismissed'; path:string; createdAt:string; updatedAt:string; }
export interface QAMission { text:string; hash:string; }
export interface ConstitutionPrinciple { id:string; title:string; statement:string; scope:string[]; status:'active'|'superseded'; enforcement:{kind:'command';command:string}; approvedBy:'user'; approvalRef:string; approvedAt:string; }
export interface QualityPolicy { propertyTesting:'none'|'recommended'|'required'; mutationTesting:'none'|'recommended'|'required'; reasons:string[]; }
export interface OperationalPolicy { level:'none'|'focused'|'full'; requiredEvidence:string[]; reasons:string[]; }
export interface VerticalSliceDefinition { id:string; title:string; outcome:string; surfaces:string[]; acceptance:string[]; evidence:string[]; dependsOn?:string[]; }
export interface VerticalSlicePlan { schemaVersion:1; taskId:string; status:'draft'|'materialized'; slices:VerticalSliceDefinition[]; createdAt:string; materializedAt:string|null; }
export interface CodeGraphState {
  version: number;
  status: 'pending' | 'ready' | 'blocked';
  ok: boolean;
  action: string | null;
  projectRoot?: string;
  command?: string;
  versionDetail?: string;
  contract?: CodeGraphContractReport;
  lastCheckedAt: string | null;
  lastReadyAt?: string;
  detail?: string;
  cached?: boolean;
}

export interface CodeGraphContractReport {
  version: string | null;
  compatible: boolean;
  checks: Array<{ command: string; ok: boolean; detail: string }>;
  fingerprint: string;
}

export interface ContextPolicy {
  initialFiles: number;
  maxFiles: number;
  codegraphDepth: number;
  maxDepth: number;
  handoffMaxWords: number;
  maxAutomaticExpansions: number;
}

export interface ContextHistoryEntry {
  at: string;
  reason: string;
  files: string[];
  symbols: string[];
  depth: number;
  readOnly: boolean;
  status: string;
}

export interface ContextManifest {
  taskId: string;
  profile: string;
  fullRepositoryScan: boolean;
  policy: ContextPolicy;
  files: string[];
  symbols: string[];
  expansionCount: number;
  history: ContextHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export type RuntimeRole = 'thinker' | 'implementer' | 'reviewer' | 'target-audience' | 'system';

export interface RuntimeRecommendation {
  role: RuntimeRole;
  strategy: 'phase-boundary-handoff';
  contextProfile: string | null;
  freshSessionRecommended: boolean;
  stopBeforePhaseWork: boolean;
  sessionEntryRequired: boolean;
  handoffPath: string | null;
  handoffRelativePath: string | null;
  handoffDigest: string | null;
  handoffContentDigest: string | null;
  handoffWords: number | null;
  handoffWordLimit: number | null;
  handoffEstimatedTokens: number | null;
  handoffTruncated: boolean;
  boundary: null | {
    status: 'required' | 'chosen' | 'entered';
    recommendation: 'same-chat-ok' | 'fresh-chat-recommended' | 'fresh-chat-required';
    sameChatAllowed: boolean;
    choice: 'continue-current' | 'pause-model-change' | 'fresh-chat' | null;
    choiceSessionId: string | null;
    mode: 'same-chat' | 'fresh-chat' | 'unknown' | null;
    originSessionId: string | null;
    enteredSessionId: string | null;
  };
  rationale: string;
  transitionNotice: null | {
    kind: 'implementation-handoff' | 'review-handoff' | 'target-audience-handoff';
    title: string;
    message: string;
    resumePrompt: string;
  };
  transitionInstruction: string | null;
}

export type ProductOwnerVerdict = 'build' | 'revise' | 'do-not-build';
export type FinalProductOwnerVerdict = 'ship' | 'revise' | 'do-not-ship';
export type AudienceVerdict = 'pass' | 'revise' | 'reject';
export type AudienceSignal = 'pass' | 'warn' | 'fail';

export interface ProductOwnerReview {
  schemaVersion: 1;
  taskId: string;
  verdict: ProductOwnerVerdict;
  summary: string;
  value: string;
  concerns: string[];
  questions: string[];
  judgmentRequired: boolean;
  humanDecision: 'proceed' | 'rework' | 'reject' | null;
  humanDecisionNote: string | null;
  sourceDigest: string;
  artifactDigest: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinalProductOwnerReview {
  schemaVersion: 1;
  taskId: string;
  verdict: FinalProductOwnerVerdict;
  summary: string;
  value: string;
  concerns: string[];
  questions: string[];
  judgmentRequired: boolean;
  humanDecision: 'proceed' | 'revise-implementation' | 'revisit-product' | 'reject' | null;
  humanDecisionNote: string | null;
  sourceDigest: string;
  artifactDigest: string;
  createdAt: string;
  updatedAt: string;
}

export interface TargetAudienceReview {
  schemaVersion: 1;
  taskId: string;
  profileId: string;
  primary: boolean;
  verdict: AudienceVerdict;
  comprehension: AudienceSignal;
  utility: AudienceSignal;
  discoverability: AudienceSignal;
  friction: AudienceSignal;
  trust: AudienceSignal;
  repeatValue: AudienceSignal;
  findings: string[];
  requiresProductDecision: boolean;
  humanDecision: 'accept' | 'revise' | null;
  humanDecisionNote: string | null;
  sourceDigest: string;
  artifactDigest: string;
  createdAt: string;
  updatedAt: string;
}

export interface TargetAudienceProfile {
  id: string;
  label: string;
  primary: boolean;
  source: 'explicit';
}

export interface ProjectConfig {
  version: number;
  name: string;
  projectRoot: string;
  codegraph: {
    mode: 'mcp';
    required: boolean;
    command: string;
    supportedContract: string;
    preflight: Record<string, string>;
    [key: string]: unknown;
  };
  context: { status: string; initializedAt?: string | null; updatedAt?: string | null; summary?: string };
  subagents: Record<string, unknown>;
  evidence: Record<string, unknown>;
  visualize: {
    enabled: boolean;
    capability: 'visualize';
    discovery: 'codex-skill-catalog';
    mode: 'adaptive';
    maxPerGate: number;
    fallback: 'markdown-and-attachments';
    sourceOfTruth: 'markdown';
    qualityGate: 'risk-based';
    [key: string]: unknown;
  };
  leases: { ttlMinutes: number; releaseAtUserGate: boolean; [key: string]: unknown };
  adaptivePolicy?: { enabled: boolean; minSamplesPerHarness: number; lowRiskAcceptanceDelta: number; tokenCoverageThreshold: number; [key: string]: unknown };
  contextBudget: {
    fullRepositoryScan: boolean;
    expansionRequiresReason: boolean;
    profiles: Record<string, ContextPolicy>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function defaultRoute(surfaces: readonly string[] = [], type = 'task'): TaskRoute {
  const hasFrontend = surfaces.includes('frontend') || surfaces.includes('ui') || surfaces.includes('ux');
  const hasArchitecture = type === 'architecture';
  const hasDatabase = surfaces.includes('database') || type === 'database';
  const targetAudience = type === 'feature' || surfaces.some(surface => ['frontend','ui','ux','cli','api'].includes(surface));
  const implementation = !['design','architecture'].includes(type);
  return {
    design: hasFrontend,
    architecture: hasArchitecture,
    database: hasDatabase,
    implementation,
    technical_review: implementation ? 'focused' : 'none',
    qa: hasFrontend ? 'browser' : implementation ? 'focused' : 'none',
    target_audience: targetAudience,
    final_customer: hasFrontend,
    mutation_testing: false,
    property_testing: 'none',
    observability: 'none'
  };
}
