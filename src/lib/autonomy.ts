import { autonomyPolicy } from './autonomy-policy.js';
import { taskReadiness } from './readiness.js';
import { findTask, loadTask } from './task.js';
import { approveFinal, approveSpecification, completeDelivery } from './workflow.js';

export interface AutonomyAdvanceResult {
  advanced: boolean;
  stopped: boolean;
  action: string;
  reason: string;
  policy: ReturnType<typeof autonomyPolicy>;
  task: Record<string,unknown>;
}

function taskSummary(task: ReturnType<typeof loadTask>): Record<string,unknown> {
  return { id: task.meta.id, status: task.meta.status, phase: task.meta.phase, waitingFor: task.meta.waiting_for, deliveryStatus: task.meta.delivery_status };
}

export function autonomyStatus(root: string, id?: string): Record<string,unknown> {
  const policy = autonomyPolicy(root);
  if (!id) return { ...policy, automaticApproval: policy.level !== 'guided', headlessStopsOnJudgment: policy.level === 'headless' };
  const task = loadTask(findTask(root,id));
  const readiness = taskReadiness(root,id);
  const mechanicalGate = task.meta.phase === 'spec-approval' || task.meta.phase === 'final-approval' || (task.meta.phase === 'delivery' && policy.delivery === 'merge-local');
  return { ...policy, task: taskSummary(task), mechanicalGate, blockers: readiness.blockers.map(item => ({ id:item.id, owner:item.owner, detail:item.detail })) };
}

export function advanceAutonomy(root: string, id: string): AutonomyAdvanceResult {
  const policy = autonomyPolicy(root);
  let task = loadTask(findTask(root,id));
  const readiness = taskReadiness(root,id);
  if (readiness.blockers.length) {
    const blocker = readiness.blockers[0]!;
    const humanOwned = blocker.owner === 'user' || blocker.owner === 'external';
    const stopped = policy.level === 'headless' && humanOwned;
    const guidedHumanGate = policy.level === 'guided' && humanOwned;
    return { advanced:false, stopped, action:stopped?'headless-stop':guidedHumanGate?'guided-user-gate':'blocked', reason:blocker.detail, policy, task:taskSummary(task) };
  }
  if (policy.level === 'guided') {
    const userGate = task.meta.phase === 'spec-approval' || task.meta.phase === 'final-approval' || task.meta.phase === 'delivery';
    return { advanced:false, stopped:false, action:userGate?'guided-user-gate':'no-mechanical-gate', reason:userGate?'Guided autonomy requires the user to cross approval and delivery gates.':`Phase ${task.meta.phase} requires normal agent work; Guided autonomy has no mechanical gate to advance.`, policy, task:taskSummary(task) };
  }
  if (task.meta.phase === 'spec-approval') {
    task = approveSpecification(root,id,'Approved by SpecRail autonomy policy.',{approvalActor:'specrail-autonomy'});
    return { advanced:true, stopped:false, action:'approve-specification', reason:'All deterministic specification gates passed.', policy, task:taskSummary(task) };
  }
  if (task.meta.phase === 'final-approval') {
    task = approveFinal(root,id,'Accepted by SpecRail autonomy policy.',{approvalActor:'specrail-autonomy'});
    return { advanced:true, stopped:false, action:'approve-final', reason:'All deterministic final-review gates passed.', policy, task:taskSummary(task) };
  }
  if (task.meta.phase === 'delivery') {
    if (policy.delivery !== 'merge-local') return { advanced:false, stopped:policy.level==='headless', action:policy.level==='headless'?'headless-stop':'delivery-judgment', reason:'Autonomous delivery is not authorized; choose delivery or configure merge-local explicitly.', policy, task:taskSummary(task) };
    task = completeDelivery(root,id,'merge-local',{approvalActor:'specrail-autonomy'});
    return { advanced:true, stopped:false, action:'merge-local', reason:'Project autonomy policy explicitly authorizes deterministic local merge delivery.', policy, task:taskSummary(task) };
  }
  return { advanced:false, stopped:false, action:'no-mechanical-gate', reason:`Phase ${task.meta.phase} requires normal agent work; there is no deterministic approval or delivery gate to advance.`, policy, task:taskSummary(task) };
}
