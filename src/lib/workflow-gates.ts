import type { TaskPhase } from './types.js';

export interface WorkflowGateDefinition {
  id: string;
  label: string;
  waivable: boolean;
  phase: TaskPhase | null;
  terminalOnWaive?: boolean;
  evidenceStages?: string[];
}

export const WORKFLOW_GATES = {
  'design': { id:'design', label:'UX/UI design', waivable:true, phase:'ux-ui-designer', evidenceStages:['pre-approval'] },
  'technical-architecture': { id:'technical-architecture', label:'Technical architecture', waivable:true, phase:'technical-architecture', evidenceStages:['pre-approval'] },
  'technical-review': { id:'technical-review', label:'Technical review', waivable:true, phase:'technical-reviewer', evidenceStages:['technical-review','qa','final'] },
  'qa': { id:'qa', label:'QA validation', waivable:true, phase:'qa-engineer', evidenceStages:['qa','final'] },
  'target-audience': { id:'target-audience', label:'Target Audience validation', waivable:true, phase:'final-customer', evidenceStages:['final'] },
  'final-product-owner': { id:'final-product-owner', label:'Final Product Owner outcome review', waivable:true, phase:null },
  'host-presentation': { id:'host-presentation', label:'Host presentation', waivable:true, phase:null },
  'acceptance-coverage': { id:'acceptance-coverage', label:'Acceptance Coverage Matrix', waivable:true, phase:null },
  'final-evidence': { id:'final-evidence', label:'Final evidence', waivable:true, phase:null, evidenceStages:['final'] },
  'scope-guard': { id:'scope-guard', label:'Scope Guard', waivable:true, phase:null },
  'project-learning': { id:'project-learning', label:'Durable project learning', waivable:true, phase:null },
  'delivery': { id:'delivery', label:'Delivery', waivable:true, phase:'delivery', terminalOnWaive:true },
  'spec-approval': { id:'spec-approval', label:'Specification approval', waivable:false, phase:'spec-approval' },
  'builder': { id:'builder', label:'Implementation', waivable:false, phase:'builder' },
  'final-approval': { id:'final-approval', label:'Final human approval', waivable:false, phase:'final-approval' }
} as const satisfies Record<string, WorkflowGateDefinition>;

export type WorkflowGateId = keyof typeof WORKFLOW_GATES;
export type UserWaivableWorkflowGateId = {
  [K in WorkflowGateId]: typeof WORKFLOW_GATES[K]['waivable'] extends true ? K : never
}[WorkflowGateId];

export const USER_OVERRIDE_TARGETS = Object.values(WORKFLOW_GATES)
  .filter(gate => gate.waivable)
  .map(gate => gate.id) as UserWaivableWorkflowGateId[];

export function workflowGate(id:string):WorkflowGateDefinition|null {
  return (WORKFLOW_GATES as Record<string,WorkflowGateDefinition>)[id] || null;
}

export function workflowGateForPhase(phase:TaskPhase):WorkflowGateDefinition|null {
  return Object.values(WORKFLOW_GATES).find(gate => gate.phase === phase) || null;
}

export function isWaivableWorkflowGate(id:string):id is UserWaivableWorkflowGateId {
  return USER_OVERRIDE_TARGETS.includes(id as UserWaivableWorkflowGateId);
}
