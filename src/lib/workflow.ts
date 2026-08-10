import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask, saveTask, appendLog, unfinishedDependencies, getSection, setSection } from './task.js';
import { addEvidence, listEvidence, validateEvidence } from './evidence.js';
import { projectContextStatus } from './project.js';
import { projectGovernanceHash } from './project-governance.js';
import { requireCodeGraphReady } from './codegraph.js';
import { mergeWorktree, removeWorktree } from './worktree.js';
import { lintSpecification, specificationHash } from './specification.js';
import { ensureAcceptanceCriteriaIds, acceptanceCoverage } from './acceptance.js';
import { effectiveSpecificationHash, pendingAmendments, approveAmendment as persistApprovedAmendment, rejectAmendment as persistRejectedAmendment } from './amendments.js';
import { sealBlastRadius, scopeGuardStatus } from './scope-guard.js';
import { validateHandoffBudget } from './context.js';
import { acquireTaskLease, assertTaskLease, releaseTaskLease } from './lease.js';
import { qaMissionHash, validateQAMission } from './qa.js';
import { recordTrace } from './trace.js';
import { recordFailure } from './failures.js';
import { registerRepairAttempt } from './repairs.js';
import { taskMetrics } from './metrics.js';
import { ensureQAMissionContent, ensureStrategySections, prepareSpecificationReviewState } from './spec-review-prep.js';
import { loadSlicePlan, materializeSlices } from './slices.js';
import { assertPhaseBoundaryEntered, invalidatePhaseBoundary, rememberTargetAudienceSourceSession } from './phase-boundary.js';
import { finalPresentation, specificationPresentation } from './presentation.js';
import { assertPresentationReady } from './presentation-state.js';
import { checkConstitution, listConstitution } from './constitution.js';
import { decideFinalProductOwnerReview, decideTargetAudienceReview, finalProductOwnerRequired, finalProductOwnerReviewStatus, invalidateFinalProductOwnerReview, invalidateProductOwnerReview, productIntelligenceEnabled, productOwnerRequired, productOwnerReviewStatus, targetAudienceRequired, targetAudienceReviewStatus } from './product-intelligence.js';
import { autonomyPolicy } from './autonomy-policy.js';
import { assertConcurrencyMutationAuthority, assertConcurrencyReservation, concurrencyPlansForTask, releaseConcurrencyTaskReservation } from './concurrency.js';
import type { JsonValue, TaskDocument, TaskPhase } from './types.js';

function session(options: Record<string, unknown> = {}): string | null {
  return typeof options.sessionId === 'string' ? options.sessionId : null;
}
function approvalActor(options:Record<string,unknown>):string{return options.approvalActor==='specrail-autonomy'?'SpecRail autonomy policy':'user';}
function trace(root: string, task: TaskDocument, event: string, data: Record<string, JsonValue> = {}, options: Record<string, unknown> = {}): void {
  recordTrace(root, task, event, data, session(options));
}
function assertGatePresentationReady(root: string, task: TaskDocument, gate: 'spec-approval' | 'final-approval', options: Record<string, unknown> = {}): void {
  const sessionId=session(options);
  const presentation=gate==='spec-approval'?specificationPresentation(root,task.meta.id,sessionId):finalPresentation(root,task.meta.id,sessionId);
  const contract=presentation.presentationContract;
  if(!contract.evidence.inlineRequired)return;
  assertPresentationReady(root,{taskId:task.meta.id,gate,sessionId,presentationDigest:contract.presentationDigest,actions:contract.fallback.requiredHostActions});
}
function validateSpec(task: TaskDocument, stage: 'product' | 'approval' = 'approval') {
  if (task.meta.open_questions > 0) throw new Error('Cannot continue while there are open questions');
  const lint = lintSpecification(task, { stage });
  if (!lint.valid) throw new Error(`Specification lint failed: ${lint.errors.join(', ')}`);
  return lint;
}
function setAwaitingSpec(task: TaskDocument): void {
  ensureAcceptanceCriteriaIds(task);
  validateSpec(task, 'approval');
  task.meta.status = 'awaiting_spec_approval'; task.meta.phase = 'spec-approval'; task.meta.waiting_for = 'user';
  appendLog(task, 'Specification is linted and ready for user approval.');
}
function nextPreApproval(task: TaskDocument): TaskPhase {
  if (task.meta.route.design && !task.meta.completed_design) return 'ux-ui-designer';
  if ((task.meta.route.architecture || task.meta.route.database) && !task.meta.completed_architecture) return 'technical-architecture';
  return 'spec-approval';
}
function needsTargetAudience(root: string, task: TaskDocument): boolean { return Boolean(task.meta.route.final_customer || (task.meta.route.target_audience && targetAudienceRequired(root))); }
function nextAfterApproval(root: string, task: TaskDocument): TaskPhase {
  if (task.meta.route.implementation) return 'builder';
  if (task.meta.route.qa !== 'none') return 'qa-engineer';
  if (needsTargetAudience(root, task)) return 'final-customer';
  return 'final-approval';
}
function nextAfterBuilder(root: string, task: TaskDocument): TaskPhase {
  if (task.meta.route.technical_review !== 'none') return 'technical-reviewer';
  if (task.meta.route.qa !== 'none') return 'qa-engineer';
  if (needsTargetAudience(root, task)) return 'final-customer';
  return 'final-approval';
}
function statusForPhase(phase: TaskPhase) {
  if (phase === 'builder') return 'active' as const;
  if (phase === 'technical-reviewer') return 'review' as const;
  if (phase === 'qa-engineer') return 'qa' as const;
  if (phase === 'final-customer') return 'customer_validation' as const;
  if (phase === 'final-approval') return 'awaiting_final_approval' as const;
  return 'refining' as const;
}
function invalidateChangedApproval(task: TaskDocument): void {
  task.meta.spec_approval = 'changes_requested'; task.meta.spec_approval_hash = null; task.meta.spec_approved_at = null;
  task.meta.spec_effective_hash = null; task.meta.project_governance_hash = null; task.meta.qa_mission_hash = null; task.meta.scope_guard_hash = null; task.meta.scope_baseline_commit = null; task.meta.status = 'awaiting_spec_approval'; task.meta.phase = 'spec-approval'; task.meta.waiting_for = 'user';
  appendLog(task, 'Approved specification changed; approval was invalidated.'); saveTask(task);
}
function ensureApprovedSpecUnchanged(root:string, task: TaskDocument): string {
  if (task.meta.spec_approval !== 'approved') throw new Error('Specification must be approved before execution');
  if (Number(task.meta.spec_integrity_version||1) < 2) throw new Error('Legacy specification approval must be reviewed and approved once with the hardened integrity seal');
  if (pendingAmendments(root,task.meta.id).length) throw new Error('A pending amendment requires a user decision before execution can continue');
  const current = specificationHash(task);
  if (!task.meta.spec_approval_hash || current !== task.meta.spec_approval_hash) {
    invalidateChangedApproval(task); throw new Error('Specification changed after approval and must be approved again');
  }
  const effective=effectiveSpecificationHash(root,task.meta.id,current);
  if(task.meta.spec_effective_hash && task.meta.spec_effective_hash!==effective) throw new Error('Effective specification changed outside the approved amendment flow');
  const governance=projectGovernanceHash(root);
  if(!task.meta.project_governance_hash||task.meta.project_governance_hash!==governance) throw new Error('Project governance context changed after specification approval and must be reviewed again');
  const missionErrors = validateQAMission(task);
  if (missionErrors.length) throw new Error(`Approved QA mission is invalid: ${missionErrors.join(', ')}`);
  const currentMission = qaMissionHash(task);
  if (!task.meta.qa_mission_hash || currentMission !== task.meta.qa_mission_hash) {
    invalidateChangedApproval(task); throw new Error('QA mission changed after approval and must be approved again');
  }
  return task.meta.spec_effective_hash||effective;
}
function executionPhase(phase: TaskPhase): boolean { return ['builder','technical-reviewer','qa-engineer','final-customer'].includes(phase); }
function ensureConstitutionEvidence(root: string, task: TaskDocument): void {
  if (!listConstitution(root).some(item => item.status === 'active')) return;
  if (listEvidence(root, task.meta.id).some(item => item.kind === 'constitution-report')) return;
  const report = checkConstitution(root, { stage: `${task.meta.id}-technical-review` });
  if (!report.valid) throw new Error(`Project constitution failed: ${report.results.filter(item => !item.ok).map(item => item.id).join(', ')}`);
  const dir = path.join(path.resolve(root), '.ai', 'evidence', task.meta.id, 'technical-review');
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'constitution-report.json'); copyFileSync(report.path, target);
  addEvidence(root, task.meta.id, { kind:'constitution-report', path:target, source:'deterministic-check', label:'Project constitution report', tool:'ai-flow constitution' });
}
function registerReturn(root: string, task: TaskDocument, to: TaskPhase, reason: string, options: Record<string, unknown> = {}): boolean {
  recordFailure(root, task.meta.id, { phase: task.meta.phase, statement: reason });
  const repair = registerRepairAttempt(root, task.meta.id, task.meta.phase, reason);
  trace(root, task, 'repair-attempt', { from:task.meta.phase, to, reason, attempt:repair.attempts[task.meta.phase] ?? 0, limit:repair.limit }, options);
  if (repair.exhausted) {
    task.meta.resume_status = statusForPhase(to); task.meta.resume_phase = to;
    task.meta.status = 'blocked'; task.meta.waiting_for = 'user'; task.meta.block_reason = `Repair limit exceeded in ${task.meta.phase}; user decision required.`;
    releaseTaskLease(root, task.meta.id, { force:true });
    appendLog(task, `Repair limit exceeded. Workflow stopped for user decision: ${reason}`);
    return false;
  }
  return true;
}

export function startRefinement(root: string, id: string, options: Record<string, unknown> = {}) {
  assertConcurrencyMutationAuthority(root, id, session(options));
  let task = loadTask(findTask(root,id));
  if (!['draft','refining','blocked'].includes(task.meta.status)) throw new Error(task.meta.status==='awaiting_spec_approval'?'Specification approval is a user decision gate; use the explicit request-changes decision after review instead of bypassing it with refine':`Cannot refine from status ${task.meta.status}`);
  if (productIntelligenceEnabled(root) && getSection(task.body,'Product Owner Review').trim()) invalidateProductOwnerReview(root,id,'Refinement restarted');
  task=loadTask(findTask(root,id));
  task.meta.status='refining'; task.meta.phase='product-specifier'; task.meta.waiting_for='none'; task.meta.spec_approval='pending';
  task.meta.spec_approval_hash=null; task.meta.spec_effective_hash=null; task.meta.spec_approved_at=null; task.meta.qa_mission_hash=null; task.meta.scope_guard_hash=null; task.meta.scope_baseline_commit=null;
  if(!session(options)) releaseTaskLease(root,task.meta.id,{force:true}); appendLog(task,'Refinement started.'); const saved=saveTask(task); trace(root,saved,'refinement-started',{},options); return saved;
}

export function completePhase(root: string, id: string, options: Record<string, unknown> = {}) {
  assertConcurrencyMutationAuthority(root, id, session(options));
  let task=loadTask(findTask(root,id));
  if(task.meta.open_questions>0)throw new Error('Cannot complete phase while there are open questions');
  if(executionPhase(task.meta.phase)){ensureApprovedSpecUnchanged(root,task);if(task.meta.phase==='builder'||task.meta.phase==='technical-reviewer'||(task.meta.phase==='final-customer'&&targetAudienceRequired(root)))assertPhaseBoundaryEntered(root,task.meta.id,task.meta.phase,session(options));assertTaskLease(root,task.meta.id,{sessionId:session(options)??undefined});}
  const handoff=validateHandoffBudget(root,task);if(!handoff.valid)throw new Error(handoff.errors.join(', '));
  const completedPhase=task.meta.phase;
  switch(task.meta.phase){
    case 'product-specifier':{
      requireCodeGraphReady(root);if(projectContextStatus(root).status!=='ready')throw new Error('Project Product Owner context must be generated before specification approval');
      if (productOwnerRequired(root)) {
        const productReview=productOwnerReviewStatus(root,id);
        if(!productReview.valid) throw new Error(productReview.detail);
        if(autonomyPolicy(root).level==='guided'&&productReview.review&&!productReview.review.humanDecision) throw new Error('Guided autonomy requires the user to review and acknowledge the Product Owner opinion before specification work continues');
      }
      task=ensureStrategySections(ensureQAMissionContent(task));
      validateSpec(task,'product');const next=nextPreApproval(task);if(next==='spec-approval')setAwaitingSpec(task);else{task.meta.phase=next;task.meta.status='refining';appendLog(task,`Product specification completed; next phase: ${next}.`);}break;
    }
    case 'ux-ui-designer':{
      const validation=validateEvidence(root,id,'pre-approval');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.completed_design=true;const next=nextPreApproval(task);if(next==='spec-approval')setAwaitingSpec(task);else{task.meta.phase=next;appendLog(task,`Design proposal completed; next phase: ${next}.`);}break;
    }
    case 'technical-architecture':{
      const validation=validateEvidence(root,id,'pre-approval');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.completed_architecture=true;setAwaitingSpec(task);break;
    }
    case 'builder': { const next=nextAfterBuilder(root,task);if(next==='technical-reviewer')invalidatePhaseBoundary(root,task.meta.id,'technical-reviewer');task.meta.phase=next;task.meta.status=statusForPhase(task.meta.phase);appendLog(task,`Builder completed; next phase: ${task.meta.phase}.`);break; }
    case 'technical-reviewer':{
      ensureConstitutionEvidence(root,task);
      const validation=validateEvidence(root,id,'technical-review');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.phase=task.meta.route.qa!=='none'?'qa-engineer':needsTargetAudience(root,task)?'final-customer':'final-approval';task.meta.status=statusForPhase(task.meta.phase);task.meta.waiting_for=task.meta.phase==='final-approval'?(finalProductOwnerRequired(root)?'none':'user'):'none';appendLog(task,`Technical review completed; next phase: ${task.meta.phase}.`);break;
    }
    case 'qa-engineer':{
      const validation=validateEvidence(root,id,'qa');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.phase=needsTargetAudience(root,task)?'final-customer':'final-approval';task.meta.status=statusForPhase(task.meta.phase);task.meta.waiting_for=task.meta.phase==='final-approval'?(finalProductOwnerRequired(root)?'none':'user'):'none';appendLog(task,`QA completed; next phase: ${task.meta.phase}.`);break;
    }
    case 'final-customer':{
      const validation=validateEvidence(root,id,'final');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      if (targetAudienceRequired(root)) { const audience=targetAudienceReviewStatus(root,id); if(!audience.valid)throw new Error(audience.detail); }
      task.meta.phase='final-approval';task.meta.status='awaiting_final_approval';task.meta.waiting_for=finalProductOwnerRequired(root)?'none':'user';appendLog(task,finalProductOwnerRequired(root)?'Target Audience validation completed; final Product Owner outcome review is required before approval.':'Target Audience validation completed; task awaits user approval.');break;
    }
    default:throw new Error(`Phase cannot be completed: ${task.meta.phase}`);
  }
  if (task.meta.phase === 'final-customer' && completedPhase !== 'final-customer' && targetAudienceRequired(root) && !session(options)) {
    throw new Error('Entering Target Audience validation requires the stable QA/review session ID so fresh-session isolation can be enforced');
  }
  let saved=saveTask(task);
  if (saved.meta.phase === 'final-customer' && completedPhase !== 'final-customer' && targetAudienceRequired(root)) {
    rememberTargetAudienceSourceSession(root, saved.meta.id, session(options));
    saved = loadTask(findTask(root, saved.meta.id));
  }
  trace(root,saved,'phase-completed',{completedPhase,nextPhase:saved.meta.phase},options);if(saved.meta.phase!==completedPhase)trace(root,saved,'phase-entered',{from:completedPhase},options);
  if(saved.meta.phase!==completedPhase) {
    releaseConcurrencyTaskReservation(root, saved.meta.id, session(options) ? { sessionId: session(options) } : {});
  }
  if((completedPhase==='builder'&&saved.meta.phase==='technical-reviewer')||saved.meta.phase==='final-customer'||saved.meta.waiting_for==='user'||['awaiting_spec_approval','awaiting_final_approval'].includes(saved.meta.status))releaseTaskLease(root,saved.meta.id,{sessionId:session(options)??undefined,force:true});return saved;
}

function reapproveLegacyIntegrity(root:string,task:TaskDocument,note:string,options:Record<string,unknown>={}){
 if(Number(task.meta.spec_integrity_version||1)>=2)throw new Error('Specification already uses the hardened integrity seal');
 if(['done','rejected'].includes(task.meta.status))throw new Error('Closed tasks do not require integrity reapproval');
 if(pendingAmendments(root,task.meta.id).length)throw new Error('Resolve pending specification amendments before integrity reapproval');
 const legacyHash=specificationHash(task);if(!task.meta.spec_approval_hash||task.meta.spec_approval_hash!==legacyHash){invalidateChangedApproval(task);throw new Error('Legacy approved specification changed and requires a full specification review');}
 const legacyEffective=effectiveSpecificationHash(root,task.meta.id,legacyHash);if(task.meta.spec_effective_hash&&task.meta.spec_effective_hash!==legacyEffective)throw new Error('Legacy effective specification changed outside the approved amendment flow');
 const missionErrors=validateQAMission(task);if(missionErrors.length)throw new Error(`Approved QA mission is invalid: ${missionErrors.join(', ')}`);const missionHash=qaMissionHash(task);if(!task.meta.qa_mission_hash||task.meta.qa_mission_hash!==missionHash){invalidateChangedApproval(task);throw new Error('Legacy QA mission changed and requires a full specification review');}
 if(task.meta.route.implementation){const scope=scopeGuardStatus(root,task.meta.id);if(!scope.sealIntegrityValid)throw new Error(`Legacy Scope Guard cannot be promoted safely: ${scope.detail} Return the task to specification, define/review the boundary, and approve again.`);}
 validateSpec(task,'approval');const previousStatus=task.meta.status,previousPhase=task.meta.phase,previousWaiting=task.meta.waiting_for;
 task.meta.spec_integrity_version=2;task.meta.project_governance_hash=projectGovernanceHash(root);const lint=validateSpec(task,'approval');task.meta.spec_approval_hash=lint.hash;task.meta.spec_effective_hash=effectiveSpecificationHash(root,task.meta.id,lint.hash);task.meta.spec_approved_at=new Date().toISOString();task.meta.qa_mission_hash=missionHash;task.meta.status=previousStatus;task.meta.phase=previousPhase;task.meta.waiting_for=previousWaiting;appendLog(task,`Legacy specification integrity explicitly reapproved by user with hardened base hash ${lint.hash} and project-governance seal. ${note}`);const saved=saveTask(task);trace(root,saved,'specification-integrity-reapproved',{specificationHash:lint.hash,effectiveSpecificationHash:String(saved.meta.spec_effective_hash||lint.hash),qaMissionHash:missionHash},options);return saved;
}
export function approveSpecification(root:string,id:string,note='Approved by user',options:Record<string,unknown>={}){
  let task=loadTask(findTask(root,id));if(task.meta.spec_approval==='approved'&&Number(task.meta.spec_integrity_version||1)<2){assertGatePresentationReady(root,task,'spec-approval',options);return reapproveLegacyIntegrity(root,task,note,options);}if(task.meta.status!=='awaiting_spec_approval'||task.meta.phase!=='spec-approval')throw new Error('Task is not awaiting specification approval');task=prepareSpecificationReviewState(root,id);if(approvalActor(options)==='user')assertGatePresentationReady(root,task,'spec-approval',options);
  if(task.meta.delivery_strategy==='vertical-slices'&&task.meta.size==='large'&&task.meta.type==='feature'&&!loadSlicePlan(root,task.meta.id))throw new Error('Large feature requires an approved vertical slice plan before specification approval');const lint=validateSpec(task,'approval');const evidence=validateEvidence(root,id,'pre-approval');if(!evidence.valid)throw new Error(`Missing required evidence: ${[...evidence.missing,...evidence.errors].join(', ')}`);
  const missionErrors=validateQAMission(task);if(missionErrors.length)throw new Error(`QA Mission invalid: ${missionErrors.join(', ')}`);
  task.meta.spec_approval='approved';task.meta.spec_approval_hash=lint.hash;task.meta.spec_effective_hash=effectiveSpecificationHash(root,task.meta.id,lint.hash);task.meta.spec_approved_at=new Date().toISOString();task.meta.qa_mission_hash=qaMissionHash(task);task.meta.status='ready';task.meta.phase=nextAfterApproval(root,task);task.meta.waiting_for='none';appendLog(task,`Specification approved by ${approvalActor(options)} with base hash ${lint.hash}, effective hash ${task.meta.spec_effective_hash}, and QA mission ${task.meta.qa_mission_hash}. ${note}`);
  let saved=saveTask(task);if(saved.meta.delivery_strategy==='vertical-slices'&&saved.meta.size==='large'&&loadSlicePlan(root,saved.meta.id)){materializeSlices(root,saved.meta.id);saved=loadTask(findTask(root,saved.meta.id));}if(saved.meta.phase==='builder')invalidatePhaseBoundary(root,saved.meta.id,'builder');
  trace(root,saved,'specification-approved',{specificationHash:lint.hash,effectiveSpecificationHash:String(saved.meta.spec_effective_hash||lint.hash),qaMissionHash:saved.meta.qa_mission_hash},options);return saved;
}
export function requestSpecChanges(root:string,id:string,note:string,options:Record<string,unknown>={}){
  let task=loadTask(findTask(root,id));
  if(task.meta.status!=='awaiting_spec_approval')throw new Error('Task is not awaiting specification approval');
  assertGatePresentationReady(root,task,'spec-approval',options);
  if(productIntelligenceEnabled(root)&&getSection(task.body,'Product Owner Review').trim()){invalidateProductOwnerReview(root,id,'Specification changes requested');task=loadTask(findTask(root,id));}
  recordFailure(root,id,{phase:'spec-approval',category:'user-rejection',statement:note});
  task.meta.spec_approval='changes_requested';task.meta.spec_approval_hash=null;task.meta.spec_effective_hash=null;task.meta.spec_approved_at=null;task.meta.project_governance_hash=null;task.meta.qa_mission_hash=null;task.meta.scope_guard_hash=null;task.meta.scope_baseline_commit=null;task.meta.status='refining';task.meta.phase='product-specifier';task.meta.waiting_for='none';
  appendLog(task,`User requested specification changes: ${note}`);
  const saved=saveTask(task);releaseConcurrencyTaskReservation(root,id,{force:true});releaseTaskLease(root,task.meta.id,{force:true});trace(root,saved,'user-rejection',{gate:'specification',note},options);return saved;
}
export function rejectTask(root:string,id:string,note='Rejected by user',options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));if(!['draft','refining','awaiting_spec_approval','blocked'].includes(task.meta.status))throw new Error('Task cannot be rejected from its current status');
  if(task.meta.status==='awaiting_spec_approval')assertGatePresentationReady(root,task,'spec-approval',options);
  task.meta.spec_approval='rejected';task.meta.spec_approval_hash=null;task.meta.qa_mission_hash=null;task.meta.final_approval='not_applicable';task.meta.status='rejected';task.meta.phase='done';task.meta.waiting_for='none';
  releaseConcurrencyTaskReservation(root,id,{force:true});releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Task rejected by user. ${note}`);return saveTask(task);
}
export function startExecution(root:string,id:string,options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));assertConcurrencyMutationAuthority(root,task.meta.id,session(options));ensureApprovedSpecUnchanged(root,task);
  const scope=scopeGuardStatus(root,id);if(scope.applicable&&!scope.valid)throw new Error(`Scope Guard is not ready: ${scope.detail}`);
  const unfinished=unfinishedDependencies(root,task);if(unfinished.length)throw new Error(`Unfinished dependencies: ${unfinished.map(x=>x.meta.id).join(', ')}`);
  if(task.meta.status!=='ready')throw new Error(`Task is not ready for execution: ${task.meta.status}`);
  if(task.meta.phase==='builder')assertPhaseBoundaryEntered(root,task.meta.id,'builder',session(options));
  const executionSession=session(options);acquireTaskLease(root,task.meta.id,{sessionId:executionSession??undefined,ttlMs:typeof options.ttlMs==='number'?options.ttlMs:undefined,phase:task.meta.phase});
  try{assertConcurrencyMutationAuthority(root,task.meta.id,executionSession);}catch(error){releaseTaskLease(root,task.meta.id,{sessionId:executionSession??undefined});throw error;}
  task.meta.status=statusForPhase(task.meta.phase);task.meta.waiting_for='none';appendLog(task,`Execution started at phase ${task.meta.phase}.`);
  const saved=saveTask(task);trace(root,saved,'execution-started',{phase:saved.meta.phase},options);trace(root,saved,'phase-entered',{from:'spec-approval'},options);return saved;
}
export function blockTask(root:string,id:string,reason:string,options:Record<string,unknown>={}){
  assertConcurrencyMutationAuthority(root,id,session(options));const task=loadTask(findTask(root,id));if(task.meta.status==='done')throw new Error('Completed task cannot be blocked');
  task.meta.resume_status=task.meta.status;task.meta.resume_phase=task.meta.phase;task.meta.block_reason=String(reason);task.meta.status='blocked';task.meta.waiting_for='user';appendLog(task,`Workflow blocked: ${reason}`);
  const saved=saveTask(task);trace(root,saved,'blocked',{reason},options);releaseConcurrencyTaskReservation(root,id,session(options)?{sessionId:session(options)}:{force:true});releaseTaskLease(root,task.meta.id,{force:true});return saved;
}
export function resumeTask(root:string,id:string,options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));if(task.meta.status!=='blocked')throw new Error('Task is not blocked');if(task.meta.open_questions>0)throw new Error('Cannot resume with open questions');
  const resumePhase=task.meta.resume_phase||'product-specifier';const schedulerOwned=concurrencyPlansForTask(root,task.meta.id).length>0;
  if(!schedulerOwned&&(resumePhase==='builder'||resumePhase==='technical-reviewer'))assertPhaseBoundaryEntered(root,task.meta.id,resumePhase,session(options));
  task.meta.status=task.meta.resume_status||'refining';task.meta.phase=resumePhase;task.meta.resume_status=null;task.meta.resume_phase=null;task.meta.block_reason=null;task.meta.waiting_for='none';
  if(schedulerOwned){releaseConcurrencyTaskReservation(root,task.meta.id,{force:true});releaseTaskLease(root,task.meta.id,{force:true});if(resumePhase==='builder'||resumePhase==='technical-reviewer')invalidatePhaseBoundary(root,task.meta.id,resumePhase);}
  else if(executionPhase(task.meta.phase))acquireTaskLease(root,task.meta.id,{sessionId:session(options)??undefined,phase:task.meta.phase});
  appendLog(task,schedulerOwned?'Workflow resumed; concurrency scheduler must re-dispatch the task before agent work continues.':'Workflow resumed.');
  const saved=saveTask(task);trace(root,saved,'resumed',{schedulerOwned},options);return saved;
}
function returnTaskTransition(root:string,id:string,to:TaskPhase,reason:string,options:Record<string,unknown>,enforceConcurrencyAuthority:boolean,allowDecisionGate=false){
  if(enforceConcurrencyAuthority)assertConcurrencyMutationAuthority(root,id,session(options));
  const task=loadTask(findTask(root,id));
  if(!allowDecisionGate&&['awaiting_spec_approval','awaiting_final_approval','awaiting_delivery'].includes(task.meta.status))throw new Error(`Task is at a user decision gate (${task.meta.status}); use the gate-specific user decision command instead of generic return`);
  const allowed:TaskPhase[]=['product-specifier','ux-ui-designer','technical-architecture','builder','technical-reviewer','qa-engineer'];if(!allowed.includes(to))throw new Error(`Invalid return phase: ${to}`);if(['done','rejected'].includes(task.meta.status))throw new Error('Closed task cannot be returned');
  const mayContinue=registerReturn(root,task,to,reason,options);if(!mayContinue){const blocked=saveTask(task);releaseConcurrencyTaskReservation(root,id,enforceConcurrencyAuthority&&session(options)?{sessionId:session(options)}:{force:true});return blocked;}
  task.meta.phase=to;task.meta.status=statusForPhase(to);task.meta.waiting_for='none';task.meta.block_reason=null;if(to==='builder'||to==='technical-reviewer')invalidatePhaseBoundary(root,task.meta.id,to);
  if(['product-specifier','ux-ui-designer','technical-architecture'].includes(to)){task.meta.spec_approval='changes_requested';task.meta.spec_approval_hash=null;task.meta.spec_effective_hash=null;task.meta.spec_approved_at=null;task.meta.project_governance_hash=null;task.meta.qa_mission_hash=null;task.meta.scope_guard_hash=null;task.meta.scope_baseline_commit=null;if(to==='ux-ui-designer')task.meta.completed_design=false;if(to==='technical-architecture')task.meta.completed_architecture=false;}
  appendLog(task,`Task returned to ${to}: ${reason}`);const saved=saveTask(task);releaseConcurrencyTaskReservation(root,id,enforceConcurrencyAuthority&&session(options)?{sessionId:session(options)}:{force:true});releaseTaskLease(root,task.meta.id,{force:true});return saved;
}
export function returnTask(root:string,id:string,to:TaskPhase,reason:string,options:Record<string,unknown>={}){return returnTaskTransition(root,id,to,reason,options,true);}
export function routeTargetAudienceRevision(root:string,id:string,note='',options:Record<string,unknown>={}){
  assertConcurrencyMutationAuthority(root,id,session(options));const task=loadTask(findTask(root,id));
  if(task.meta.phase!=='final-customer')throw new Error('Target Audience revision routing is only available during Target Audience validation');
  const audience=targetAudienceReviewStatus(root,id);
  if(!audience.configurationValid)throw new Error('Target Audience configuration is incomplete; resolve the human-owned profile configuration before routing implementation work');
  if(!audience.integrityValid)throw new Error('Target Audience review integrity is invalid; refresh or recover the review before routing a revision');
  if(audience.stale)throw new Error('Target Audience review is stale; refresh it before routing a revision');
  if(audience.needsMorePrimaryProfiles)throw new Error('Target Audience still requires additional primary profile reviews before revision routing');
  if(audience.requiresProductDecision)throw new Error('Target Audience found a product trade-off; resolve it through the human-owned audience decision gate');
  if(audience.valid||!audience.reviews.some(review=>review.verdict!=='pass'))throw new Error('No failed Target Audience verdict requires implementation revision');
  const reason=String(note||'').trim()||'Target Audience validation requires implementation revision.';
  return{decision:'revise-implementation' as const,reviews:audience.reviews,task:returnTaskTransition(root,id,'builder',reason,options,true)};
}
export function resolveTargetAudienceDecision(root:string,id:string,decision:'accept-tradeoff'|'revise-implementation'|'revisit-product',note='',options:Record<string,unknown>={}){
  const reason=String(note||'').trim();const audience=targetAudienceReviewStatus(root,id);
  if(!audience.integrityValid)throw new Error('Target Audience review integrity is invalid; refresh the review before deciding');
  if(audience.stale)throw new Error('Target Audience review is stale; refresh it before deciding');
  if(!audience.requiresProductDecision)throw new Error('No unresolved Target Audience product trade-off requires a human decision');
  if(decision==='accept-tradeoff')return{decision,reviews:decideTargetAudienceReview(root,id,'accept',reason),task:loadTask(findTask(root,id))};
  decideTargetAudienceReview(root,id,'revise',reason);
  if(decision==='revisit-product'){invalidateProductOwnerReview(root,id,'Target Audience requested product reconsideration');return{decision,reviews:[],task:returnTaskTransition(root,id,'product-specifier',reason||'Target Audience review requires product reconsideration.',options,false)};}
  return{decision,reviews:[],task:returnTaskTransition(root,id,'builder',reason||'Target Audience review requires implementation revision.',options,false)};
}
export function resolveFinalProductOwnerDecision(root:string,id:string,decision:'proceed'|'revise-implementation'|'revisit-product',note='',options:Record<string,unknown>={}){
  const reason=String(note||'').trim();
  const status=finalProductOwnerReviewStatus(root,id);
  if(!status.review)throw new Error('No final Product Owner review exists');
  if(!status.integrityValid)throw new Error('Final Product Owner review integrity is invalid; refresh it before deciding');
  if(status.stale)throw new Error('Final Product Owner review is stale; refresh it before deciding');
  if(decision==='proceed')return{decision,review:decideFinalProductOwnerReview(root,id,'proceed',reason),task:loadTask(findTask(root,id))};
  if(decision==='revise-implementation'){
    decideFinalProductOwnerReview(root,id,'revise-implementation',reason);
    invalidateFinalProductOwnerReview(root,id,'Final Product Owner requested implementation revision');
    return{decision,review:null,task:returnTaskTransition(root,id,'builder',reason||'Final Product Owner requested implementation revision.',options,false,true)};
  }
  decideFinalProductOwnerReview(root,id,'revisit-product',reason);
  invalidateFinalProductOwnerReview(root,id,'Final Product Owner requested product reconsideration');
  invalidateProductOwnerReview(root,id,'Final Product Owner requested product reconsideration');
  return{decision,review:null,task:returnTaskTransition(root,id,'product-specifier',reason||'Final Product Owner requested product reconsideration.',options,false,true)};
}

export function approveFinal(root:string,id:string,note='Accepted by user',options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_final_approval'||task.meta.phase!=='final-approval')throw new Error('Task is not awaiting final approval');
  if(finalProductOwnerRequired(root)){
    const finalOwner=finalProductOwnerReviewStatus(root,id);
    if(!finalOwner.valid)throw new Error(finalOwner.detail);
    if(autonomyPolicy(root).level==='guided'&&finalOwner.review&&!finalOwner.review.humanDecision)throw new Error('Guided autonomy requires the user to review and acknowledge the final Product Owner outcome opinion before final approval');
  }
  if(approvalActor(options)==='user')assertGatePresentationReady(root,task,'final-approval',options);
  ensureApprovedSpecUnchanged(root,task);const coverage=acceptanceCoverage(root,id);if(!coverage.complete)throw new Error(`Acceptance coverage incomplete: ${coverage.uncovered.join(', ')||coverage.invalidReferences.join(', ')}`);
  const scope=scopeGuardStatus(root,id);if(scope.applicable&&!scope.valid)throw new Error(`Scope Guard failed: ${scope.detail}`);if(!task.meta.learning_recorded)throw new Error('Durable project learning must be recorded before final approval');
  const evidence=validateEvidence(root,id,'final');if(!evidence.valid)throw new Error(`Missing required evidence: ${[...evidence.missing,...evidence.errors].join(', ')}`);
  task.meta.final_approval='approved';task.meta.final_approved_at=new Date().toISOString();
  if(task.meta.worktree_path&&task.meta.worktree_branch){task.meta.status='awaiting_delivery';task.meta.phase='delivery';task.meta.waiting_for='user';task.meta.delivery_status='pending';appendLog(task,`Final result approved by ${approvalActor(options)}. Delivery decision required. ${note}`);}
  else{task.meta.status='done';task.meta.phase='done';task.meta.waiting_for='none';task.meta.delivery_status='not_required';appendLog(task,`Final result approved by ${approvalActor(options)}. ${note}`);}
  releaseTaskLease(root,task.meta.id,{force:true});const saved=saveTask(task);trace(root,saved,'final-approved',{note},options);taskMetrics(root,id);return saved;
}
export function completeDelivery(root:string,id:string,action:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_delivery'||task.meta.phase!=='delivery')throw new Error('Task is not awaiting delivery');if(action==='keep-open'){appendLog(task,'Delivery kept open by user; worktree preserved.');return saveTask(task);}if(action==='merge-local'){mergeWorktree(root,task.meta.worktree_path,task.meta.worktree_branch,task.meta.worktree_base);}else if(action==='confirm-external'){removeWorktree(root,task.meta.worktree_path,task.meta.worktree_branch);}else throw new Error(`Unknown delivery action: ${action}`);task.meta.delivery_status='completed';task.meta.delivered_at=new Date().toISOString();task.meta.delivery_action=action;task.meta.status='done';task.meta.phase='done';task.meta.waiting_for='none';releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Delivery completed: ${action}.`);const saved=saveTask(task);trace(root,saved,'delivery-completed',{action},options);taskMetrics(root,id);return saved;}
export function rejectFinal(root:string,id:string,note:string,returnTo:TaskPhase='builder',options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_final_approval')throw new Error('Task is not awaiting final approval');assertGatePresentationReady(root,task,'final-approval',options);const allowed:TaskPhase[]=['product-specifier','ux-ui-designer','technical-architecture','builder','technical-reviewer','qa-engineer'];if(!allowed.includes(returnTo))throw new Error(`Invalid return phase: ${returnTo}`);task.meta.final_approval='changes_requested';const mayContinue=registerReturn(root,task,returnTo,note,options);if(!mayContinue)return saveTask(task);task.meta.phase=returnTo;task.meta.status=statusForPhase(returnTo);task.meta.waiting_for='none';if(returnTo==='builder'||returnTo==='technical-reviewer')invalidatePhaseBoundary(root,task.meta.id,returnTo);releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`User rejected final result and returned to ${returnTo}: ${note}`);const saved=saveTask(task);trace(root,saved,'user-rejection',{gate:'final',note,returnTo},options);return saved;}

export function approveAmendmentDecision(root:string,id:string,amendmentId:string,note='Approved by user',options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));
  if(!pendingAmendments(root,task.meta.id).some(item=>item.id===amendmentId))throw new Error(`Pending amendment not found: ${amendmentId}`);
  assertGatePresentationReady(root,task,'spec-approval',options);
  return persistApprovedAmendment(root,task.meta.id,amendmentId,note);
}
export function rejectAmendmentDecision(root:string,id:string,amendmentId:string,note='Rejected by user',options:Record<string,unknown>={}){
  const task=loadTask(findTask(root,id));
  if(!pendingAmendments(root,task.meta.id).some(item=>item.id===amendmentId))throw new Error(`Pending amendment not found: ${amendmentId}`);
  assertGatePresentationReady(root,task,'spec-approval',options);
  return persistRejectedAmendment(root,task.meta.id,amendmentId,note);
}
