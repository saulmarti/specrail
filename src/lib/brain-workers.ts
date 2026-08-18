import type { TaskDocument } from './types.js';
import { controlProfile } from './control-profile.js';

export const WORK_OWNERS = ['none', 'brain', 'worker'] as const;
export type WorkOwner = typeof WORK_OWNERS[number];
export type WorkerKind = 'project-bootstrap'|'spec-materialization'|'design-support'|'implementation'|'verification'|'review-support'|'evidence';

export interface WorkRoutingInput { actor:string; action:string; recommendedSkill?:string|null; }
export interface BrainWorkerRecommendation {
  schemaVersion:1; owner:WorkOwner; reason:string; controlProfile:string;
  brain:{authority:'governed-decisions-only';owns:string[];mustNotDoWhenWorkerAvailable:string[]};
  worker:null|{kind:WorkerKind;preferredModels:string[];allowBrainModelFallback:false;requireModelAttestation:true;isolatedContext:true;capsuleMaxWords:number;reasoningEffort:'low'|'medium';stopIf:string[]};
}
const NO_MODEL_ACTORS=new Set(['user','system','host']);
const PRODUCT_OWNER_JUDGMENT=new Set(['product-owner-review','refresh-product-owner-review','final-product-owner-review','refresh-final-product-owner-review']);
const ARCHITECTURE_JUDGMENT=new Set(['technical-architecture','architecture-review','database-design']);
function norm(value:unknown):string{return String(value??'').trim().toLowerCase();}
function workerPolicy(kind:WorkerKind,profile:string):BrainWorkerRecommendation['worker']{const heavy=['implementation','verification','review-support'].includes(kind);return{kind,preferredModels:['gpt-5.6-luna','gpt-5.6-terra'],allowBrainModelFallback:false,requireModelAttestation:true,isolatedContext:true,capsuleMaxWords:profile==='rigorous'?1400:profile==='standard'?1000:700,reasoningEffort:heavy?'medium':'low',stopIf:['A product outcome, architecture, public contract, security/privacy rule, migration strategy, or governed UX decision must change.','Two materially different interpretations remain after authoritative repository facts and approved decisions are exhausted.','Required work leaves the sealed Scope Guard or protected-file boundary.','The requested worker model cannot be attested as actually selected.','The worker would need to ask the user a consequential question.']};}
function result(task:TaskDocument,owner:WorkOwner,reason:string,kind:WorkerKind|null=null):BrainWorkerRecommendation{const profile=controlProfile(task);return{schemaVersion:1,owner,reason,controlProfile:profile,brain:{authority:'governed-decisions-only',owns:['user intent and product trade-offs','architecture and public-contract choices','security/privacy/migration decisions','governed UX direction','accept/reject/escalation judgments from compact worker evidence'],mustNotDoWhenWorkerAvailable:['repository-wide discovery or repeated file reading','specification prose materialization after decisions are sealed','production-code mutation','test/debug loops','bulk evidence collection or log summarization']},worker:owner==='worker'&&kind?workerPolicy(kind,profile):null};}

/** Brain/Workers keeps the selected chat model as governed decision authority.
 * Heavy work is delegated to a cheaper isolated model-pinned process. Audience
 * simulation remains on the existing fresh-session path until that boundary can
 * be attested by the worker adapter; independence is not weakened for savings.
 */
export function brainWorkerRecommendation(task:TaskDocument,input:WorkRoutingInput):BrainWorkerRecommendation{
  const actor=norm(input.actor),action=norm(input.action),skill=norm(input.recommendedSkill);
  if(NO_MODEL_ACTORS.has(actor)||['task-complete','task-rejected','wait-for-dependencies','autonomy-advance','enter-phase-boundary'].includes(action))return result(task,'none','The next step is deterministic or human-owned.');
  if(PRODUCT_OWNER_JUDGMENT.has(action))return result(task,'brain','Product judgment stays in the user-selected Brain model; workers may provide facts but cannot decide the trade-off.');
  if(actor==='ai-flow-product-owner'&&action!=='bootstrap-product-intelligence-context')return result(task,'brain','The Product Owner role owns a governed product decision.');
  if((actor==='ai-flow-technical-reviewer'&&task.meta.phase==='technical-architecture')||ARCHITECTURE_JUDGMENT.has(action))return result(task,'brain','Material architecture/data decisions remain Brain-owned.');
  if(actor==='ai-flow-target-audience'||actor==='ai-flow-final-customer'||skill==='ai-flow-target-audience'||skill==='ai-flow-final-customer')return result(task,'brain','Audience validation keeps its existing mandatory fresh-session isolation until worker-session independence is explicitly attested; do not weaken review independence for token savings.');
  if(action==='bootstrap-product-intelligence-context')return result(task,'worker','Project-context extraction is high-volume synthesis, not product authority.','project-bootstrap');
  if(actor==='ai-flow-product-specifier'||skill==='ai-flow-product-specifier')return result(task,'worker','Once user/product decisions are known, specification materialization is delegated heavy work.','spec-materialization');
  if(actor==='ai-flow-ux-ui-designer'||skill==='ai-flow-ux-ui-designer')return result(task,'worker','Workers gather/produce bounded design support; any material visual-direction choice escalates to Brain.','design-support');
  if(actor==='ai-flow-builder'||skill==='ai-flow-builder'||task.meta.phase==='builder')return result(task,'worker','Production implementation is worker-owned; the worker may reason locally but cannot alter governed decisions.','implementation');
  if(actor==='ai-flow-qa-engineer'||skill==='ai-flow-qa-engineer')return result(task,'worker','Tests, debugging and evidence are high-volume worker work.','verification');
  if(actor==='ai-flow-technical-reviewer'||skill==='ai-flow-technical-reviewer')return result(task,'worker','Independent review analysis is delegated; material findings are returned to Brain for the governed decision.','review-support');
  return result(task,'worker','Default agent-owned execution work is delegated; unknown governed decisions must escalate.','evidence');
}
