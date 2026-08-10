import { existsSync } from 'node:fs';
import path from 'node:path';
import { codeGraphStatus } from './codegraph.js';
import { contextStatus } from './context.js';
import { validateEvidence } from './evidence.js';
import { leaseStatus } from './lease.js';
import { projectContextStatus } from './project.js';
import { projectGovernanceHash } from './project-governance.js';
import { repairStatus } from './repairs.js';
import { lintSpecification, specificationHash } from './specification.js';
import { findTask, loadTask, unfinishedDependencies } from './task.js';
import { validateQAMission } from './qa.js';
import { validateTrace } from './trace.js';
import { acceptanceCoverage } from './acceptance.js';
import { pendingAmendments, effectiveSpecificationHash } from './amendments.js';
import { loadBlastRadius, scopeGuardStatus } from './scope-guard.js';
import { finalProductOwnerRequired, finalProductOwnerReviewStatus, productOwnerRequired, productOwnerReviewStatus, targetAudienceRequired, targetAudienceReviewStatus } from './product-intelligence.js';
import { autonomyPolicy, type AutonomyPolicy } from './autonomy-policy.js';
import { activeRevision, revisionPreservesArtifact } from './revisions.js';
import { hasUserCloseOverride, hasUserWaiver } from './user-overrides.js';
import type { TaskDocument } from './types.js';

export type ReadinessGateStatus = 'pass' | 'pending' | 'fail' | 'stale' | 'warning' | 'not-applicable';
export type ReadinessOwner = 'user' | 'agent' | 'system' | 'external';
export type ReadinessMilestone = 'specification' | 'execution' | 'final-review' | 'delivery' | 'complete';

export interface ReadinessGate {
  id: string;
  label: string;
  status: ReadinessGateStatus;
  owner: ReadinessOwner;
  detail: string;
  action: string | null;
  blocking: boolean;
}

export interface ReadinessResult {
  schemaVersion: 1;
  taskId: string;
  status: string;
  phase: string;
  milestone: ReadinessMilestone;
  ready: boolean;
  score: { value: number; passed: number; applicable: number; explanation: string };
  blockers: ReadinessGate[];
  gates: ReadinessGate[];
  next: { owner: ReadinessOwner; action: string; gateId: string | null };
  generatedAt: string;
}

function gate(id: string, label: string, status: ReadinessGateStatus, owner: ReadinessOwner, detail: string, action: string | null = null): ReadinessGate {
  return { id, label, status, owner, detail, action, blocking: status === 'fail' || status === 'stale' };
}
function milestoneFor(task: TaskDocument): ReadinessMilestone {
  if (task.meta.status === 'done' || task.meta.status === 'rejected') return 'complete';
  if (task.meta.phase === 'delivery' || task.meta.status === 'awaiting_delivery') return 'delivery';
  if (['final-customer', 'final-approval'].includes(task.meta.phase) || ['customer_validation', 'awaiting_final_approval'].includes(task.meta.status)) return 'final-review';
  if (['builder', 'technical-reviewer', 'qa-engineer'].includes(task.meta.phase) || ['active', 'review', 'qa'].includes(task.meta.status)) return 'execution';
  return 'specification';
}
function requiredPreApproval(task: TaskDocument): boolean {
  return Boolean(task.meta.route.design || task.meta.route.architecture || task.meta.route.database || task.meta.surfaces.some(item => ['frontend', 'ui', 'ux'].includes(item)));
}
function staleEvidence(messages: string[]): boolean { return messages.some(message => /stale|changed|hash|digest|modified|mismatch/i.test(message)); }
function explicitBlockOwner(reason: string): ReadinessOwner {
  if (/codegraph|command|tool|browser|environment|permission|eperm|dependency/i.test(reason)) return 'system';
  if (/approval|decision|question|user/i.test(reason)) return 'user';
  return 'agent';
}
function phaseAction(task: TaskDocument, autonomy: AutonomyPolicy): { owner: ReadinessOwner; action: string } {
  if (task.meta.status === 'done') return { owner: 'system', action: 'No action is required; the task is complete.' };
  if (task.meta.status === 'rejected') return { owner: 'system', action: 'No action is required; the task was rejected.' };
  if (task.meta.phase === 'spec-approval') return autonomy.level === 'guided' ? { owner: 'user', action: 'Review the specification and approve it, request refinement, or reject the task.' } : { owner: 'system', action: 'Advance the clean specification gate under the active autonomy policy.' };
  if (task.meta.phase === 'final-approval') return autonomy.level === 'guided' ? { owner: 'user', action: 'Review the implemented result and approve it or request changes.' } : { owner: 'system', action: 'Advance the clean final gate under the active autonomy policy.' };
  if (task.meta.phase === 'delivery') return autonomy.level !== 'guided' && autonomy.delivery === 'merge-local' ? { owner: 'system', action: 'Complete the explicitly authorized local merge delivery.' } : { owner: 'user', action: 'Choose the deterministic delivery action for the approved result.' };
  const labels: Record<string, string> = {
    'product-specifier': 'Complete product specification and resolve material ambiguity.',
    'ux-ui-designer': 'Complete the approved-target UI/UX proposal and its evidence.',
    'technical-architecture': 'Complete architecture/data design and its evidence.',
    builder: 'Implement the approved specification in the isolated task runtime.',
    'technical-reviewer': 'Run the selected independent technical review modes.',
    'qa-engineer': 'Execute the immutable QA mission against the real result.',
    'final-customer': 'Evaluate the result with the configured Target Audience profiles.'
  };
  return { owner: 'agent', action: labels[task.meta.phase] || `Continue the ${task.meta.phase} phase.` };
}

export interface ReadinessOptions { sessionId?: string | null; }
export function taskReadiness(root: string, reference: string, options: ReadinessOptions = {}): ReadinessResult {
  const projectRoot = path.resolve(root);
  const task = loadTask(findTask(projectRoot, reference));
  const revision = activeRevision(projectRoot, task.meta.id);
  const milestone = milestoneFor(task);
  const gates: ReadinessGate[] = [];
  const projectContext = projectContextStatus(projectRoot);
  const codegraph = codeGraphStatus(projectRoot);
  const dependencies = unfinishedDependencies(projectRoot, task);
  const lint = lintSpecification(task, { stage: 'approval' });
  const pre = validateEvidence(projectRoot, task.meta.id, 'pre-approval');
  const final = validateEvidence(projectRoot, task.meta.id, 'final');
  const trace = validateTrace(projectRoot, task.meta.id);
  const repairs = repairStatus(projectRoot, task.meta.id);
  const context = contextStatus(projectRoot, task.meta.id);
  const lease = leaseStatus(projectRoot, task.meta.id, options.sessionId ?? undefined);
  const currentHash = specificationHash(task);
  const amendments=pendingAmendments(projectRoot,task.meta.id);
  const coverage=acceptanceCoverage(projectRoot,task.meta.id);
  const scope=scopeGuardStatus(projectRoot,task.meta.id);
  const autonomy=autonomyPolicy(projectRoot);
  const approved = task.meta.spec_approval === 'approved' && Boolean(task.meta.spec_approval_hash);
  const integrityVersion=Number(task.meta.spec_integrity_version||1),currentGovernanceHash=projectGovernanceHash(projectRoot),governanceValid=!approved||(integrityVersion>=2&&Boolean(task.meta.project_governance_hash)&&task.meta.project_governance_hash===currentGovernanceHash);
  const preMessages = [...pre.missing, ...pre.errors];
  const finalMessages = [...final.missing, ...final.errors];

  gates.push(gate('project-context', 'Project context', projectContext.status === 'ready' ? 'pass' : task.meta.phase === 'product-specifier' ? 'pending' : 'fail', 'agent', projectContext.status === 'ready' ? 'Product, users, architecture and runbook are ready.' : 'Project context is not complete.', 'Complete the project context before finishing refinement.'));
  const cgReady = codegraph.status === 'ready' && codegraph.contract?.compatible === true && existsSync(path.join(projectRoot, '.codegraph'));
  gates.push(gate('codegraph', 'CodeGraph preflight', cgReady ? 'pass' : 'fail', 'system', cgReady ? 'CodeGraph index and CLI contract are ready.' : codegraph.detail || 'CodeGraph preflight has not completed.', 'Run the deterministic CodeGraph preflight and repair the environment if it fails.'));
  gates.push(gate('open-questions', 'Material questions', task.meta.open_questions === 0 ? 'pass' : 'fail', 'user', task.meta.open_questions === 0 ? 'No material user question is open.' : `${task.meta.open_questions} material question(s) still need an answer.`, 'Answer the outstanding material question(s).'));
  gates.push(gate('dependencies', 'Task dependencies', dependencies.length === 0 ? 'pass' : 'fail', 'system', dependencies.length === 0 ? 'No unfinished dependency.' : `Waiting for ${dependencies.map(item => item.meta.id).join(', ')}.`, 'Complete or explicitly change the blocking dependency relationship.'));
  gates.push(gate('lease', 'Task lease', lease.conflict ? 'fail' : 'pass', lease.conflict ? 'user' : 'system', lease.conflict ? `Another session owns the task lease (${lease.owner || 'unknown session'}).` : 'No conflicting writer session.', lease.conflict ? 'Resolve the competing session before writing to the task.' : null));
  gates.push(gate('trace', 'Trace integrity', trace.valid ? 'pass' : 'fail', 'system', trace.valid ? `${trace.eventCount} event(s), ${trace.branchCount} branch(es), valid signed chain.` : trace.errors.join('; '), 'Repair or restore the corrupted local trace before trusting later metrics or replay data.'));
  gates.push(gate('repair-budget', 'Repair budget', repairs.exhausted ? 'fail' : 'pass', repairs.exhausted ? 'user' : 'system', repairs.exhausted ? `Repair budget exhausted after ${Object.values(repairs.attempts).reduce((sum, value) => sum + value, 0)}/${repairs.limit} attempts.` : `Repair budget is within ${repairs.limit} attempts.`, repairs.exhausted ? 'Choose whether to change approach, refine the specification, reset the budget, or stop.' : null));
  const contextExceeded = context.files.length > context.policy.maxFiles || context.expansionCount > context.policy.maxAutomaticExpansions;
  gates.push(gate('context-budget', 'Context budget', contextExceeded ? 'fail' : 'pass', contextExceeded ? 'user' : 'system', `${context.files.length}/${context.policy.maxFiles} files and ${context.expansionCount}/${context.policy.maxAutomaticExpansions} automatic expansion(s).`, contextExceeded ? 'Review and explicitly authorize any further context expansion.' : null));
  gates.push(gate('spec-amendments','Specification amendments',amendments.length?'fail':'pass',amendments.length?'user':'system',amendments.length?`${amendments.length} proposed amendment(s) await a user decision.`:'No proposed amendment is waiting for approval.',amendments.length?'Review, approve, or reject each proposed amendment before execution continues.':null));
  if (productOwnerRequired(projectRoot)) {
    if (approved) {
      // The Product Owner opinion is a pre-specification product gate. Its rendered
      // section is part of the approved specification hash, so later durable
      // learnings should inform future tasks rather than retroactively stale an
      // already-approved task. Product/governance changes remain protected by
      // spec drift + the project-governance seal below.
      gates.push(gate('product-owner-review', 'Project Product Owner review', 'pass', 'system', 'The Product Owner opinion was resolved before specification approval and is sealed into the approved specification. Later project learnings apply to future product decisions.', null));
    } else {
      const productOwner = productOwnerReviewStatus(projectRoot, task.meta.id);
      const guidedAcknowledgement = autonomy.level === 'guided' && Boolean(productOwner.review) && productOwner.integrityValid && !productOwner.stale && !productOwner.review?.humanDecision;
      const status: ReadinessGateStatus = productOwner.stale ? 'stale' : productOwner.valid && !guidedAcknowledgement ? 'pass' : 'fail';
      const owner: ReadinessOwner = productOwner.needsHumanJudgment || guidedAcknowledgement ? 'user' : 'agent';
      const detail = guidedAcknowledgement ? 'Product Owner review is current; Guided autonomy requires the user to review and acknowledge its opinion before specification work continues.' : productOwner.detail;
      const action = productOwner.needsHumanJudgment ? 'Resolve the Product Owner recommendation before specification work continues.' : guidedAcknowledgement ? 'Review the Product Owner opinion and explicitly continue, request rework, or reject the task.' : 'Run or refresh the Project Product Owner review before specification approval.';
      gates.push(gate('product-owner-review', 'Project Product Owner review', status, owner, detail, action));
    }
  } else gates.push(gate('product-owner-review', 'Project Product Owner review', 'not-applicable', 'system', 'Project Product Owner review is disabled by Product Intelligence policy.'));
  gates.push(gate('approval-integrity','Approval integrity seal',!approved?'not-applicable':integrityVersion>=2?'pass':'stale','user',!approved?'No approved specification exists yet.':integrityVersion>=2?'The approved specification includes the hardened scope and project-governance integrity seal.':'This approval predates the hardened integrity seal.','Review and approve the specification once with the hardened integrity seal.'));
  gates.push(gate('project-governance','Governed .ai project context',!approved?'not-applicable':governanceValid?'pass':'stale','user',!approved?'Project governance is sealed at approval.':governanceValid?'Governed project context and policy are unchanged since approval.':'Governed .ai project context or policy changed after approval.','Review the changed project governance context and reapprove the affected specification.'));
  if(scope.applicable){const radius=loadBlastRadius(projectRoot,task.meta.id);const preApproval=!approved;const waived=approved&&hasUserWaiver(projectRoot,task.meta.id,'scope-guard');const status:ReadinessGateStatus=waived?'pass':preApproval?(radius?'pass':'fail'):(scope.valid?'pass':'fail');const action=waived?null:preApproval&&!radius?'Define the expected files/symbols and protected areas before specification approval.':approved&&!radius?'This legacy approved task has no sealed blast radius. Return it to specification, define the boundary, and reapprove once before execution.':!scope.valid?'Resolve unexpected changes through rollback or an approved amendment.':null;const detail=waived?'Explicit user governance override waived Scope Guard for this task.':preApproval?(radius?`Blast radius is defined and will be sealed on approval: ${radius.allowedFiles.join(', ')}.`:'Implementation work has no blast radius defined.'):scope.detail;gates.push(gate('scope-guard','Scope Guard / blast radius',status,status==='fail'?(preApproval?'agent':'user'):'system',detail,action));}else gates.push(gate('scope-guard','Scope Guard / blast radius','not-applicable','system','This task has no implementation route.'));

  const needsSpecChecks = milestone !== 'complete' || approved;
  gates.push(gate('spec-lint', 'Specification lint', needsSpecChecks ? (lint.valid ? 'pass' : 'fail') : 'not-applicable', 'agent', lint.valid ? `${lint.score}/100 with no blocking ambiguity.` : lint.errors.join('; '), lint.valid ? null : 'Refine the specification until all acceptance criteria are observable and complete.'));
  const qaMissionErrors = validateQAMission(task);
  const qaMissionReady = qaMissionErrors.length === 0;
  const qaMissingStatus: ReadinessGateStatus = task.meta.phase === 'spec-approval' || ['execution','final-review','delivery','complete'].includes(milestone) ? 'fail' : 'pending';
  gates.push(gate('qa-mission', 'Executable QA mission', needsSpecChecks ? (qaMissionReady ? 'pass' : qaMissingStatus) : 'not-applicable', 'agent', qaMissionReady ? (task.meta.qa_mission_hash ? 'QA mission is sealed with the approved specification.' : 'QA mission is executable and will be sealed on approval.') : qaMissionErrors.join('; '), 'Write the executable QA mission before specification approval.'));
  if (requiredPreApproval(task)) {
    const waivedPre=[hasUserWaiver(projectRoot,task.meta.id,'design')?'design':null,hasUserWaiver(projectRoot,task.meta.id,'technical-architecture')?'technical-architecture':null].filter(Boolean);
    gates.push(gate('pre-evidence', 'Pre-approval evidence', pre.valid ? 'pass' : staleEvidence(preMessages) ? 'stale' : 'fail', pre.valid&&waivedPre.length?'system':'agent', pre.valid ? (waivedPre.length?`Remaining pre-approval evidence is valid; explicit user override waived: ${waivedPre.join(', ')}.`:'Required design/architecture evidence is valid.') : preMessages.join('; '), pre.valid?null:'Regenerate the missing or stale pre-approval evidence from the exact approved target.'));
  }
  else gates.push(gate('pre-evidence', 'Pre-approval evidence', 'not-applicable', 'agent', 'This route does not require pre-approval visual/architecture evidence.'));

  const specNeeded = ['execution', 'final-review', 'delivery', 'complete'].includes(milestone) || task.meta.phase === 'spec-approval';
  gates.push(gate('spec-approval', 'Specification approval', specNeeded ? (approved ? 'pass' : 'pending') : 'pending', autonomy.level==='guided'?'user':'system', approved ? `Approved specification ${String(task.meta.spec_approval_hash).slice(0, 12)}…` : autonomy.level==='guided'?'The specification has not been approved by the user.':'The specification awaits a mechanically safe autonomy-policy transition.', approved?null:autonomy.level==='guided'?'Review and explicitly approve the specification.':'Advance only when all deterministic blockers are clear.'));
  const effectiveHash=approved&&task.meta.spec_approval_hash?effectiveSpecificationHash(projectRoot,task.meta.id,currentHash):null;
  const driftStatus: ReadinessGateStatus = !approved ? 'not-applicable' : task.meta.spec_approval_hash !== currentHash || (task.meta.spec_effective_hash&&task.meta.spec_effective_hash!==effectiveHash) ? 'stale' : 'pass';
  gates.push(gate('spec-drift', 'Approved specification unchanged', driftStatus, 'user', driftStatus === 'pass' ? `Base and effective specification hashes are intact${task.meta.spec_effective_hash?' including approved amendments':''}.` : driftStatus === 'stale' ? 'Governed base specification or approved amendment set changed after approval.' : 'No approved specification exists yet.', driftStatus === 'stale' ? 'Restore the approved state or review the change through the formal approval/amendment flow.' : null));

  const needsFinal = ['final-review', 'delivery', 'complete'].includes(milestone);
  {const waived=needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'acceptance-coverage');gates.push(gate('acceptance-coverage','Acceptance Coverage Matrix',needsFinal?(waived||coverage.complete?'pass':'fail'):'not-applicable',needsFinal&&!waived&&!coverage.complete?'agent':'system',needsFinal?(waived?'Explicit user governance override waived Acceptance Coverage for this task.':coverage.complete?`All ${coverage.criteria.length} effective acceptance criteria have valid evidence.`:`${coverage.uncovered.length} acceptance criterion/criteria lack valid evidence: ${coverage.uncovered.join(', ')||'invalid evidence references'}.`):'Coverage becomes blocking at final review.',needsFinal&&!waived&&!coverage.complete?'Attach valid evidence to every uncovered AC-* criterion before final approval.':null));}
  {const waived=needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'final-evidence');gates.push(gate('final-evidence', 'Final evidence', needsFinal ? (waived||final.valid ? 'pass' : staleEvidence(finalMessages) ? 'stale' : 'fail') : 'not-applicable', waived?'system':'agent', needsFinal ? (waived?'Explicit user governance override waived final evidence for this task.':final.valid ? 'All risk-selected final evidence is valid.' : finalMessages.join('; ')) : 'Final evidence is required after implementation and review.', needsFinal && !waived && !final.valid ? 'Regenerate or complete the required final evidence against the real implementation.' : null));}
  if (needsFinal && task.meta.route.target_audience && targetAudienceRequired(projectRoot) && !hasUserWaiver(projectRoot,task.meta.id,'target-audience')) {
    const audience = targetAudienceReviewStatus(projectRoot, task.meta.id);
    const preserved = Boolean(revision?.status === 'validated' && revisionPreservesArtifact(projectRoot, task.meta.id, 'target-audience') && audience.reviews.length);
    const status: ReadinessGateStatus = audience.valid || preserved ? 'pass' : audience.stale ? 'stale' : task.meta.phase === 'final-customer' ? 'fail' : 'pending';
    gates.push(gate('target-audience-review', 'Target Audience validation', status, !audience.configurationValid || audience.requiresProductDecision ? 'user' : status === 'pass' ? 'system' : 'agent', preserved ? `Previous Target Audience validation is intentionally preserved for bounded ${revision!.id}; the revision does not invalidate audience/product judgment.` : audience.detail, !audience.configurationValid ? 'Resolve the Target Audience profile configuration before validation can continue.' : audience.requiresProductDecision ? 'Resolve the product trade-off raised by the Target Audience review.' : status === 'pass' ? null : 'Run the configured primary Target Audience profiles against the public result.'));
  } else gates.push(gate('target-audience-review', 'Target Audience validation', needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'target-audience')?'pass':'not-applicable', 'system', needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'target-audience')?'Explicit user governance override waived Target Audience validation for this task.':needsFinal ? 'This task route does not require Target Audience validation.' : 'Target Audience validation becomes applicable during final review.'));
  if (needsFinal && finalProductOwnerRequired(projectRoot) && !hasUserWaiver(projectRoot,task.meta.id,'final-product-owner')) {
    const finalOwner = finalProductOwnerReviewStatus(projectRoot, task.meta.id);
    const preserved = Boolean(revision?.status === 'validated' && revisionPreservesArtifact(projectRoot, task.meta.id, 'product-owner') && finalOwner.review);
    const guidedAcknowledgement = autonomy.level === 'guided' && Boolean(finalOwner.review) && finalOwner.integrityValid && !finalOwner.stale && !finalOwner.review?.humanDecision;
    const beforeFinalOwner = task.meta.phase === 'final-customer';
    const status: ReadinessGateStatus = task.meta.final_approval === 'approved' ? 'pass' : preserved ? 'pass' : beforeFinalOwner ? 'pending' : finalOwner.stale ? 'stale' : finalOwner.valid && !guidedAcknowledgement ? 'pass' : 'fail';
    const owner: ReadinessOwner = preserved ? 'system' : finalOwner.needsHumanJudgment || guidedAcknowledgement ? 'user' : status === 'pass' ? 'system' : 'agent';
    const detail = task.meta.final_approval === 'approved' ? 'The final Product Owner outcome review was resolved before final approval and is sealed into the accepted delivery state.' : preserved ? `Previous final Product Owner outcome review is intentionally preserved for bounded ${revision!.id}; user-requested refinement does not require a second product judgment.` : beforeFinalOwner ? 'Final Product Owner review runs after Target Audience validation completes.' : guidedAcknowledgement ? 'Final Product Owner review is current; Guided autonomy requires the user to acknowledge the outcome opinion before final approval.' : finalOwner.detail;
    const action = preserved ? null : beforeFinalOwner ? 'Complete Target Audience validation before the final Product Owner re-evaluates the implemented outcome.' : finalOwner.needsHumanJudgment ? 'Resolve the final Product Owner recommendation before final approval.' : guidedAcknowledgement ? 'Review the final Product Owner outcome opinion and explicitly proceed or request revision.' : status === 'pass' ? null : 'Run or refresh the final Product Owner review against the implemented result.';
    gates.push(gate('product-owner-final-review', 'Final Product Owner outcome review', status, owner, detail, action));
  } else gates.push(gate('product-owner-final-review', 'Final Product Owner outcome review', needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'final-product-owner')?'pass':'not-applicable', 'system', needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'final-product-owner')?'Explicit user governance override waived the final Product Owner review for this task.':needsFinal ? 'Final Product Owner outcome review is disabled by Product Intelligence policy.' : 'Final Product Owner outcome review becomes applicable during final review.'));
  const learningMissingStatus: ReadinessGateStatus = ['final-approval','delivery'].includes(task.meta.phase) || ['delivery','complete'].includes(milestone) ? 'fail' : 'pending';
  {const waived=needsFinal&&hasUserWaiver(projectRoot,task.meta.id,'project-learning');gates.push(gate('project-learning', 'Durable project learning', needsFinal ? (waived||task.meta.learning_recorded ? 'pass' : learningMissingStatus) : 'not-applicable', waived?'system':'agent', waived?'Explicit user governance override waived durable project learning for this task.':task.meta.learning_recorded ? 'Durable project learning has been recorded.' : 'Learning is recorded before final approval when the task produced reusable facts.', needsFinal && !waived && !task.meta.learning_recorded ? 'Record durable project learning before final approval.' : null));}
  const finalApproved = task.meta.final_approval === 'approved';
  gates.push(gate('final-approval', 'Final approval', ['delivery', 'complete'].includes(milestone) ? (finalApproved ? 'pass' : 'pending') : needsFinal ? (finalApproved ? 'pass' : 'pending') : 'not-applicable', autonomy.level==='guided'?'user':'system', finalApproved ? 'The final result is accepted under the recorded approval policy.' : autonomy.level==='guided'?'The final result has not been accepted by the user.':'The final result awaits a mechanically safe autonomy-policy transition.', needsFinal && !finalApproved ? (autonomy.level==='guided'?'Review the final result and explicitly approve it or request changes.':'Advance only when all deterministic final-review blockers are clear.') : null));
  const deliveryApplicable = task.meta.worktree_path !== null || task.meta.delivery_status === 'completed' || milestone === 'delivery';
  const deliveryPass = task.meta.delivery_status === 'completed' || (task.meta.status === 'done' && task.meta.delivery_status === 'not_required');
  gates.push(gate('delivery', 'Deterministic delivery', deliveryApplicable ? (deliveryPass ? 'pass' : 'pending') : 'not-applicable', autonomy.level!=='guided'&&autonomy.delivery==='merge-local'?'system':'user', deliveryPass ? 'Delivery is complete.' : deliveryApplicable ? (autonomy.level!=='guided'&&autonomy.delivery==='merge-local'?'Project policy explicitly authorizes local merge delivery.':'Approved work still needs an explicit delivery decision.') : 'No separate worktree delivery is required.', deliveryApplicable && !deliveryPass ? (autonomy.level!=='guided'&&autonomy.delivery==='merge-local'?'Complete the deterministic local merge.':'Choose the deterministic delivery action.') : null));

  if (task.meta.status === 'blocked') {
    const reason = String(task.meta.block_reason || 'The workflow is explicitly blocked.');
    gates.unshift(gate('workflow-blocker', 'Explicit workflow blocker', 'fail', explicitBlockOwner(reason), reason, `Resolve the blocker before resuming ${task.meta.resume_phase || task.meta.phase}.`));
  }

  if(task.meta.status==='done'&&hasUserCloseOverride(projectRoot,task.meta.id)){
    for(const item of gates){
      if(item.status==='fail'||item.status==='stale'||item.status==='pending'){
        const original=item.detail;item.status='pass';item.owner='system';item.action=null;item.blocking=false;item.detail=`Terminal user governance override closed the task without asserting this gate normally: ${original}`;
      }
    }
    gates.unshift(gate('user-governance-override','Explicit user closure override','pass','system','The user explicitly ordered this task closed. Normal completion guarantees that were incomplete are preserved as waived audit details, not reported as verified evidence.',null));
  }
  const applicable = gates.filter(item => item.status !== 'warning' && item.status !== 'not-applicable');
  const passed = applicable.filter(item => item.status === 'pass').length;
  const blockers = gates.filter(item => item.blocking);
  const scoreValue = applicable.length ? Math.round((passed / applicable.length) * 100) : 100;
  const firstBlocking = blockers[0] ?? null;
  const fallback = phaseAction(task, autonomy);
  const next = firstBlocking
    ? { owner: firstBlocking.owner, action: firstBlocking.action || firstBlocking.detail, gateId: firstBlocking.id }
    : { owner: fallback.owner, action: fallback.action, gateId: null };
  return {
    schemaVersion: 1,
    taskId: task.meta.id,
    status: task.meta.status,
    phase: task.meta.phase,
    milestone,
    ready: blockers.length === 0 && (task.meta.status === 'done' || task.meta.status === 'rejected' || applicable.every(item => item.status === 'pass' || item.status === 'pending')),
    score: { value: scoreValue, passed, applicable: applicable.length, explanation: `${passed}/${applicable.length} applicable deterministic gates currently pass; warnings and non-applicable gates are excluded.` },
    blockers,
    gates,
    next,
    generatedAt: new Date().toISOString()
  };
}
