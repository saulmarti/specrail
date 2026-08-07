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
import { effectiveSpecificationHash, pendingAmendments } from './amendments.js';
import { sealBlastRadius, scopeGuardStatus } from './scope-guard.js';
import { validateHandoffBudget } from './context.js';
import { acquireTaskLease, assertTaskLease, releaseTaskLease } from './lease.js';
import { qaMissionHash, validateQAMission } from './qa.js';
import { recordTrace } from './trace.js';
import { recordFailure } from './failures.js';
import { registerRepairAttempt } from './repairs.js';
import { taskMetrics } from './metrics.js';
import { applyQualityPolicy } from './quality.js';
import { applyOperationalPolicy } from './observability.js';
import { loadSlicePlan, materializeSlices } from './slices.js';
import { checkConstitution, listConstitution } from './constitution.js';
import type { JsonValue, TaskDocument, TaskPhase } from './types.js';

function session(options: Record<string, unknown> = {}): string | null {
  return typeof options.sessionId === 'string' ? options.sessionId : null;
}
function trace(root: string, task: TaskDocument, event: string, data: Record<string, JsonValue> = {}, options: Record<string, unknown> = {}): void {
  recordTrace(root, task, event, data, session(options));
}
function ensureQAMissionContent(task: TaskDocument): TaskDocument {
  if (getSection(task.body,'QA Mission').trim()) return task;
  const users=getSection(task.body,'Users').trim().replace(/\s+/g,' ') || 'approved product user';
  const need=getSection(task.body,'Need').trim().replace(/\s+/g,' ') || task.meta.title;
  const criteria=getSection(task.body,'Acceptance Criteria').trim().replace(/\s+/g,' ') || 'all approved acceptance criteria pass with real evidence';
  const ui=task.meta.surfaces.some(item=>['frontend','ui','ux'].includes(item));
  const api=task.meta.surfaces.some(item=>['backend','api'].includes(item));
  const allowed=ui?'public user interface only':api?'public API or externally observable contract only':'public product interface only';
  task.body=setSection(task.body,'QA Mission',`- Persona: ${users.slice(0,180)}\n- Starting point: the approved public entry point for this task\n- Goal: ${need.slice(0,240)}\n- Allowed interface: ${allowed}; do not inspect implementation code before attempting the mission\n- Success: ${criteria.slice(0,320)}\n- Failure: the goal cannot be completed, behavior differs from the approved criteria, required evidence is missing, or a hidden workaround is needed`);
  appendLog(task,'Product Specifier generated the immutable QA mission from the refined specification.');
  return task;
}
function ensureStrategySections(task: TaskDocument): TaskDocument {
  const quality=applyQualityPolicy(task);
  const operational=applyOperationalPolicy(quality);
  if (!getSection(operational.body,'Quality Strategy').trim()) {
    const q=operational.meta.route;
    operational.body=setSection(operational.body,'Quality Strategy',`- Property testing: ${q.property_testing}\n- Mutation testing: ${q.mutation_testing ? 'risk-selected' : 'not required'}\n- Selection basis: task risk ${operational.meta.risk}, size ${operational.meta.size}, surfaces ${operational.meta.surfaces.join(', ')||'unspecified'}.`);
  }
  if (!getSection(operational.body,'Operational Evidence').trim()) {
    operational.body=setSection(operational.body,'Operational Evidence',`- Level: ${operational.meta.route.observability}\n- Collect only evidence required by the risk-based operational policy.\n- Logs, traces, and metrics must come from a real execution and remain linked to this task.`);
  }
  return operational;
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
function nextAfterApproval(task: TaskDocument): TaskPhase {
  if (task.meta.route.implementation) return 'builder';
  if (task.meta.route.qa !== 'none') return 'qa-engineer';
  if (task.meta.route.final_customer) return 'final-customer';
  return 'final-approval';
}
function nextAfterBuilder(task: TaskDocument): TaskPhase {
  if (task.meta.route.technical_review !== 'none') return 'technical-reviewer';
  if (task.meta.route.qa !== 'none') return 'qa-engineer';
  if (task.meta.route.final_customer) return 'final-customer';
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
  const task = loadTask(findTask(root,id));
  if (!['draft','refining','blocked','awaiting_spec_approval'].includes(task.meta.status)) throw new Error(`Cannot refine from status ${task.meta.status}`);
  task.meta.status='refining'; task.meta.phase='product-specifier'; task.meta.waiting_for='none'; task.meta.spec_approval='pending';
  task.meta.spec_approval_hash=null; task.meta.spec_effective_hash=null; task.meta.spec_approved_at=null; task.meta.qa_mission_hash=null; task.meta.scope_guard_hash=null; task.meta.scope_baseline_commit=null;
  releaseTaskLease(root,task.meta.id,{force:true}); appendLog(task,'Refinement started.'); const saved=saveTask(task); trace(root,saved,'refinement-started',{},options); return saved;
}

export function completePhase(root: string, id: string, options: Record<string, unknown> = {}) {
  let task=loadTask(findTask(root,id));
  if(task.meta.open_questions>0)throw new Error('Cannot complete phase while there are open questions');
  if(executionPhase(task.meta.phase)){ensureApprovedSpecUnchanged(root,task);assertTaskLease(root,task.meta.id,{sessionId:session(options)??undefined});}
  const handoff=validateHandoffBudget(root,task);if(!handoff.valid)throw new Error(handoff.errors.join(', '));
  const completedPhase=task.meta.phase;
  switch(task.meta.phase){
    case 'product-specifier':{
      requireCodeGraphReady(root);if(projectContextStatus(root).status!=='ready')throw new Error('Project Product Owner context must be generated before specification approval');
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
    case 'builder': task.meta.phase=nextAfterBuilder(task);task.meta.status=statusForPhase(task.meta.phase);appendLog(task,`Builder completed; next phase: ${task.meta.phase}.`);break;
    case 'technical-reviewer':{
      ensureConstitutionEvidence(root,task);
      const validation=validateEvidence(root,id,'technical-review');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.phase=task.meta.route.qa!=='none'?'qa-engineer':task.meta.route.final_customer?'final-customer':'final-approval';task.meta.status=statusForPhase(task.meta.phase);appendLog(task,`Technical review completed; next phase: ${task.meta.phase}.`);break;
    }
    case 'qa-engineer':{
      const validation=validateEvidence(root,id,'qa');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.phase=task.meta.route.final_customer?'final-customer':'final-approval';task.meta.status=statusForPhase(task.meta.phase);task.meta.waiting_for=task.meta.phase==='final-approval'?'user':'none';appendLog(task,`QA completed; next phase: ${task.meta.phase}.`);break;
    }
    case 'final-customer':{
      const validation=validateEvidence(root,id,'final');if(!validation.valid)throw new Error(`Missing required evidence: ${[...validation.missing,...validation.errors].join(', ')}`);
      task.meta.phase='final-approval';task.meta.status='awaiting_final_approval';task.meta.waiting_for='user';appendLog(task,'Final customer completed; task awaits user approval.');break;
    }
    default:throw new Error(`Phase cannot be completed: ${task.meta.phase}`);
  }
  const saved=saveTask(task);trace(root,saved,'phase-completed',{completedPhase,nextPhase:saved.meta.phase},options);if(saved.meta.phase!==completedPhase)trace(root,saved,'phase-entered',{from:completedPhase},options);
  if(saved.meta.waiting_for==='user'||['awaiting_spec_approval','awaiting_final_approval'].includes(saved.meta.status))releaseTaskLease(root,saved.meta.id,{sessionId:session(options)??undefined,force:true});return saved;
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
  let task=loadTask(findTask(root,id));if(task.meta.spec_approval==='approved'&&Number(task.meta.spec_integrity_version||1)<2)return reapproveLegacyIntegrity(root,task,note,options);if(task.meta.status!=='awaiting_spec_approval'||task.meta.phase!=='spec-approval')throw new Error('Task is not awaiting specification approval');
  task=ensureAcceptanceCriteriaIds(ensureStrategySections(ensureQAMissionContent(task)));task.meta.spec_integrity_version=2;task.meta.project_governance_hash=projectGovernanceHash(root);saveTask(task);if(task.meta.route.implementation){sealBlastRadius(root,task.meta.id);task=loadTask(findTask(root,task.meta.id));}if(task.meta.delivery_strategy==='vertical-slices'&&task.meta.size==='large'&&task.meta.type==='feature'&&!loadSlicePlan(root,task.meta.id))throw new Error('Large feature requires an approved vertical slice plan before specification approval');const lint=validateSpec(task,'approval');const evidence=validateEvidence(root,id,'pre-approval');if(!evidence.valid)throw new Error(`Missing required evidence: ${[...evidence.missing,...evidence.errors].join(', ')}`);
  const missionErrors=validateQAMission(task);if(missionErrors.length)throw new Error(`QA Mission invalid: ${missionErrors.join(', ')}`);
  task.meta.spec_approval='approved';task.meta.spec_approval_hash=lint.hash;task.meta.spec_effective_hash=effectiveSpecificationHash(root,task.meta.id,lint.hash);task.meta.spec_approved_at=new Date().toISOString();task.meta.qa_mission_hash=qaMissionHash(task);task.meta.status='ready';task.meta.phase=nextAfterApproval(task);task.meta.waiting_for='none';appendLog(task,`Specification approved by user with base hash ${lint.hash}, effective hash ${task.meta.spec_effective_hash}, and QA mission ${task.meta.qa_mission_hash}. ${note}`);
  let saved=saveTask(task);if(saved.meta.delivery_strategy==='vertical-slices'&&saved.meta.size==='large'&&loadSlicePlan(root,saved.meta.id)){materializeSlices(root,saved.meta.id);saved=loadTask(findTask(root,saved.meta.id));}
  trace(root,saved,'specification-approved',{specificationHash:lint.hash,effectiveSpecificationHash:String(saved.meta.spec_effective_hash||lint.hash),qaMissionHash:saved.meta.qa_mission_hash},options);return saved;
}
export function requestSpecChanges(root:string,id:string,note:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_spec_approval')throw new Error('Task is not awaiting specification approval');recordFailure(root,id,{phase:'spec-approval',category:'user-rejection',statement:note});task.meta.spec_approval='changes_requested';task.meta.spec_approval_hash=null;task.meta.spec_effective_hash=null;task.meta.spec_approved_at=null;task.meta.project_governance_hash=null;task.meta.qa_mission_hash=null;task.meta.scope_guard_hash=null;task.meta.scope_baseline_commit=null;task.meta.status='refining';task.meta.phase='product-specifier';task.meta.waiting_for='none';appendLog(task,`User requested specification changes: ${note}`);const saved=saveTask(task);trace(root,saved,'user-rejection',{gate:'specification',note},options);return saved;}
export function rejectTask(root:string,id:string,note='Rejected by user'){const task=loadTask(findTask(root,id));if(!['draft','refining','awaiting_spec_approval','blocked'].includes(task.meta.status))throw new Error('Task cannot be rejected from its current status');task.meta.spec_approval='rejected';task.meta.spec_approval_hash=null;task.meta.qa_mission_hash=null;task.meta.final_approval='not_applicable';task.meta.status='rejected';task.meta.phase='done';task.meta.waiting_for='none';releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Task rejected by user. ${note}`);return saveTask(task);}
export function startExecution(root:string,id:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));ensureApprovedSpecUnchanged(root,task);const scope=scopeGuardStatus(root,id);if(scope.applicable&&!scope.valid)throw new Error(`Scope Guard is not ready: ${scope.detail}`);const unfinished=unfinishedDependencies(root,task);if(unfinished.length)throw new Error(`Unfinished dependencies: ${unfinished.map(x=>x.meta.id).join(', ')}`);if(task.meta.status!=='ready')throw new Error(`Task is not ready for execution: ${task.meta.status}`);acquireTaskLease(root,task.meta.id,{sessionId:session(options)??undefined,ttlMs:typeof options.ttlMs==='number'?options.ttlMs:undefined,phase:task.meta.phase});task.meta.status=statusForPhase(task.meta.phase);task.meta.waiting_for='none';appendLog(task,`Execution started at phase ${task.meta.phase}.`);const saved=saveTask(task);trace(root,saved,'execution-started',{phase:saved.meta.phase},options);trace(root,saved,'phase-entered',{from:'spec-approval'},options);return saved;}
export function blockTask(root:string,id:string,reason:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status==='done')throw new Error('Completed task cannot be blocked');task.meta.resume_status=task.meta.status;task.meta.resume_phase=task.meta.phase;task.meta.block_reason=String(reason);task.meta.status='blocked';task.meta.waiting_for='user';releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Workflow blocked: ${reason}`);const saved=saveTask(task);trace(root,saved,'blocked',{reason},options);return saved;}
export function resumeTask(root:string,id:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='blocked')throw new Error('Task is not blocked');if(task.meta.open_questions>0)throw new Error('Cannot resume with open questions');task.meta.status=task.meta.resume_status||'refining';task.meta.phase=task.meta.resume_phase||'product-specifier';task.meta.resume_status=null;task.meta.resume_phase=null;task.meta.block_reason=null;task.meta.waiting_for='none';if(executionPhase(task.meta.phase))acquireTaskLease(root,task.meta.id,{sessionId:session(options)??undefined,phase:task.meta.phase});appendLog(task,'Workflow resumed.');const saved=saveTask(task);trace(root,saved,'resumed',{},options);return saved;}
export function returnTask(root:string,id:string,to:TaskPhase,reason:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));const allowed:TaskPhase[]=['product-specifier','ux-ui-designer','technical-architecture','builder','technical-reviewer','qa-engineer'];if(!allowed.includes(to))throw new Error(`Invalid return phase: ${to}`);if(['done','rejected'].includes(task.meta.status))throw new Error('Closed task cannot be returned');const mayContinue=registerReturn(root,task,to,reason,options);if(!mayContinue)return saveTask(task);task.meta.phase=to;task.meta.status=statusForPhase(to);task.meta.waiting_for='none';task.meta.block_reason=null;if(['product-specifier','ux-ui-designer','technical-architecture'].includes(to)){task.meta.spec_approval='changes_requested';task.meta.spec_approval_hash=null;task.meta.spec_effective_hash=null;task.meta.spec_approved_at=null;task.meta.project_governance_hash=null;task.meta.qa_mission_hash=null;task.meta.scope_guard_hash=null;task.meta.scope_baseline_commit=null;if(to==='ux-ui-designer')task.meta.completed_design=false;if(to==='technical-architecture')task.meta.completed_architecture=false;}releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Task returned to ${to}: ${reason}`);return saveTask(task);}
export function approveFinal(root:string,id:string,note='Accepted by user',options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_final_approval'||task.meta.phase!=='final-approval')throw new Error('Task is not awaiting final approval');ensureApprovedSpecUnchanged(root,task);const coverage=acceptanceCoverage(root,id);if(!coverage.complete)throw new Error(`Acceptance coverage incomplete: ${coverage.uncovered.join(', ')||coverage.invalidReferences.join(', ')}`);const scope=scopeGuardStatus(root,id);if(scope.applicable&&!scope.valid)throw new Error(`Scope Guard failed: ${scope.detail}`);if(!task.meta.learning_recorded)throw new Error('Durable project learning must be recorded before final approval');const evidence=validateEvidence(root,id,'final');if(!evidence.valid)throw new Error(`Missing required evidence: ${[...evidence.missing,...evidence.errors].join(', ')}`);task.meta.final_approval='approved';task.meta.final_approved_at=new Date().toISOString();if(task.meta.worktree_path&&task.meta.worktree_branch){task.meta.status='awaiting_delivery';task.meta.phase='delivery';task.meta.waiting_for='user';task.meta.delivery_status='pending';appendLog(task,`Final result approved by user. Delivery decision required. ${note}`);}else{task.meta.status='done';task.meta.phase='done';task.meta.waiting_for='none';task.meta.delivery_status='not_required';appendLog(task,`Final result approved by user. ${note}`);}releaseTaskLease(root,task.meta.id,{force:true});const saved=saveTask(task);trace(root,saved,'final-approved',{note},options);taskMetrics(root,id);return saved;}
export function completeDelivery(root:string,id:string,action:string,options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_delivery'||task.meta.phase!=='delivery')throw new Error('Task is not awaiting delivery');if(action==='keep-open'){appendLog(task,'Delivery kept open by user; worktree preserved.');return saveTask(task);}if(action==='merge-local'){mergeWorktree(root,task.meta.worktree_path,task.meta.worktree_branch,task.meta.worktree_base);}else if(action==='confirm-external'){removeWorktree(root,task.meta.worktree_path,task.meta.worktree_branch);}else throw new Error(`Unknown delivery action: ${action}`);task.meta.delivery_status='completed';task.meta.delivered_at=new Date().toISOString();task.meta.delivery_action=action;task.meta.status='done';task.meta.phase='done';task.meta.waiting_for='none';releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`Delivery completed: ${action}.`);const saved=saveTask(task);trace(root,saved,'delivery-completed',{action},options);taskMetrics(root,id);return saved;}
export function rejectFinal(root:string,id:string,note:string,returnTo:TaskPhase='builder',options:Record<string,unknown>={}){const task=loadTask(findTask(root,id));if(task.meta.status!=='awaiting_final_approval')throw new Error('Task is not awaiting final approval');const allowed:TaskPhase[]=['product-specifier','ux-ui-designer','technical-architecture','builder','technical-reviewer','qa-engineer'];if(!allowed.includes(returnTo))throw new Error(`Invalid return phase: ${returnTo}`);task.meta.final_approval='changes_requested';const mayContinue=registerReturn(root,task,returnTo,note,options);if(!mayContinue)return saveTask(task);task.meta.phase=returnTo;task.meta.status=statusForPhase(returnTo);task.meta.waiting_for='none';releaseTaskLease(root,task.meta.id,{force:true});appendLog(task,`User rejected final result and returned to ${returnTo}: ${note}`);const saved=saveTask(task);trace(root,saved,'user-rejection',{gate:'final',note,returnTo},options);return saved;}
