import { findTask, getSection, loadTask, saveTask, setSection, appendLog } from './task.js';
import { ensureAcceptanceCriteriaIds } from './acceptance.js';
import { applyQualityPolicy } from './quality.js';
import { applyOperationalPolicy } from './observability.js';
import { projectGovernanceHash } from './project-governance.js';
import { sealBlastRadius } from './scope-guard.js';
import type { TaskDocument } from './types.js';

export function ensureQAMissionContent(task: TaskDocument): TaskDocument {
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

export function ensureStrategySections(task: TaskDocument): TaskDocument {
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

export function prepareSpecificationReviewState(root:string,id:string):TaskDocument {
  let task=loadTask(findTask(root,id));
  if(task.meta.status!=='awaiting_spec_approval'||task.meta.phase!=='spec-approval'||task.meta.spec_approval==='approved')return task;
  const before=JSON.stringify({body:task.body,route:task.meta.route,specIntegrityVersion:task.meta.spec_integrity_version,projectGovernanceHash:task.meta.project_governance_hash});
  task=ensureAcceptanceCriteriaIds(ensureStrategySections(ensureQAMissionContent(task)));
  task.meta.spec_integrity_version=2;
  task.meta.project_governance_hash=projectGovernanceHash(root);
  const after=JSON.stringify({body:task.body,route:task.meta.route,specIntegrityVersion:task.meta.spec_integrity_version,projectGovernanceHash:task.meta.project_governance_hash});
  if(after!==before)saveTask(task);
  if(task.meta.route.implementation)sealBlastRadius(root,task.meta.id);
  return loadTask(findTask(root,task.meta.id));
}
