import { findTask, loadTask, unfinishedDependencies } from './task.js';
import { validateEvidence } from './evidence.js';
import { interactionForTask, type InteractionResult } from './interactions.js';
import { loadProjectConfig, projectContextStatus } from './project.js';
import { leaseConflictInteraction, leaseStatus } from './lease.js';
import { contextStatus } from './context.js';
import { workflowVisualization } from './visualization.js';
import type { TaskPhase, NativeInteraction } from './types.js';
import { listEvalCandidates, applicableActiveEvals } from './failures.js';
import { taskReadiness } from './readiness.js';
import { pendingAmendments } from './amendments.js';
import { runtimeRecommendation } from './phase-handoff.js';
import { choosePhaseBoundary } from './phase-boundary.js';
import { finalProductOwnerRequired, finalProductOwnerReviewStatus, productIntelligenceContextStatus, productOwnerRequired, productOwnerReviewStatus, targetAudienceRequired, targetAudienceReviewStatus } from './product-intelligence.js';
import { autonomyPolicy } from './autonomy-policy.js';
import { concurrencyRecommendation, concurrencyTaskAuthorityStatus } from './concurrency.js';
import { activeRevision, revisionPreservesArtifact } from './revisions.js';
import { hasUserWaiver } from './user-overrides.js';
import { fastModeActive, requiresProductIntelligenceControls } from './control-profile.js';
import { intelligenceRecommendation } from './intelligence-routing.js';

const SKILL:Partial<Record<TaskPhase,string>>={'product-specifier':'ai-flow-product-specifier','ux-ui-designer':'ai-flow-ux-ui-designer','technical-architecture':'ai-flow-technical-reviewer','builder':'ai-flow-builder','technical-reviewer':'ai-flow-technical-reviewer','qa-engineer':'ai-flow-qa-engineer'};
function skillForPhase(root:string,phase:TaskPhase):string|null{if(phase==='final-customer')return targetAudienceRequired(root)?'ai-flow-target-audience':'ai-flow-final-customer';return SKILL[phase]||null;}

export interface NextOptions { sessionId?:string|null|undefined; }
export function nextAction(root:string,id:string,options:NextOptions={}){
 const task=loadTask(findTask(root,id));
 const revision=activeRevision(root,task.meta.id);
 const deps=unfinishedDependencies(root,task).map(x=>x.meta.id);
 const concurrency=concurrencyRecommendation(root,task.meta.id);
 const concurrencyAuthority=concurrencyTaskAuthorityStatus(root,task.meta.id,options.sessionId ?? null);
 const projectContext=projectContextStatus(root);
 const lease=leaseStatus(root,task.meta.id,options.sessionId ?? undefined);
 const amendments=pendingAmendments(root,task.meta.id);
 const policy=autonomyPolicy(root);
 const fastActive=fastModeActive(task);
 const productIntelligenceActive=requiresProductIntelligenceControls(task);
 let actor=skillForPhase(root,task.meta.phase)||'user';
 let action='continue';
 let interaction:InteractionResult|null=null;
 if(task.meta.status==='done'){actor='system';action='task-complete';}
 if(task.meta.status==='rejected'){actor='system';action='task-rejected';}
 const productContext=productIntelligenceContextStatus(root);
 const productOwner=productIntelligenceActive?productOwnerReviewStatus(root,task.meta.id):null;
 if(task.meta.phase==='product-specifier'&&!fastActive){
  if(productIntelligenceActive&&productOwnerRequired(root)&&!productContext.ready){actor='ai-flow-product-owner';action='bootstrap-product-intelligence-context';}
  else if(productIntelligenceActive&&productOwnerRequired(root)){
   const owner=productOwner??productOwnerReviewStatus(root,task.meta.id);
   const guidedAcknowledgement=policy.level==='guided'&&Boolean(owner.review)&&owner.integrityValid&&!owner.stale&&!owner.review?.humanDecision;
   if(owner.stale){actor='ai-flow-product-owner';action='refresh-product-owner-review';}
   else if(owner.needsHumanJudgment){actor='user';action='resolve-product-owner-recommendation';interaction=interactionForTask(root,id,'product-owner-decision',{sessionId:options.sessionId});}
   else if(guidedAcknowledgement){actor='user';action='review-product-owner-opinion';interaction=interactionForTask(root,id,'product-owner-decision',{sessionId:options.sessionId});}
   else if(projectContext.status!=='ready'){actor='ai-flow-product-specifier';action='bootstrap-project-and-refine';}
   else if(!owner.valid){actor='ai-flow-product-owner';action='product-owner-review';}
  }
  else if(projectContext.status!=='ready'){actor='ai-flow-product-specifier';action='bootstrap-project-and-refine';}
 }
 const audience=task.meta.phase==='final-customer'&&targetAudienceRequired(root)?targetAudienceReviewStatus(root,task.meta.id):null;
 if(audience){
  if(!audience.configurationValid){actor='user';action='resolve-target-audience-configuration';interaction=null;}
  else if((audience.reviews.length&&!audience.integrityValid)||audience.stale){actor='ai-flow-target-audience';action='refresh-target-audience-review';}
  else if(audience.requiresProductDecision){actor='user';action='resolve-target-audience-tradeoff';interaction=interactionForTask(root,id,'target-audience-decision',{sessionId:options.sessionId});}
  else if(audience.needsMorePrimaryProfiles||!audience.reviews.length){actor='ai-flow-target-audience';action='target-audience-review';}
  else if(audience.reviews.length&&!audience.valid){actor='ai-flow-target-audience';action='route-target-audience-revision';}
 }
 if((task.meta.open_questions>0||task.meta.waiting_for==='user')&&action==='continue'){actor='user';action='wait-for-user';interaction=interactionForTask(root,id,'current',{sessionId:options.sessionId});}
 if(task.meta.phase==='spec-approval'){actor='user';action='approve-or-refine-specification';interaction=interactionForTask(root,id,'spec-approval',{sessionId:options.sessionId});}
 const finalProductOwner=task.meta.phase==='final-approval'&&productIntelligenceActive&&finalProductOwnerRequired(root)&&!hasUserWaiver(root,task.meta.id,'final-product-owner')?finalProductOwnerReviewStatus(root,task.meta.id):null;
 if(task.meta.phase==='final-approval'){
  if(finalProductOwner){
   const guidedAcknowledgement=policy.level==='guided'&&Boolean(finalProductOwner.review)&&finalProductOwner.integrityValid&&!finalProductOwner.stale&&!finalProductOwner.review?.humanDecision;
   if(finalProductOwner.stale&&revisionPreservesArtifact(root,id,'product-owner')&&revision?.status==='validated'){actor='user';action='approve-or-reject-final-result';interaction=interactionForTask(root,id,'final-approval',{sessionId:options.sessionId});}
   else if(finalProductOwner.stale){actor='ai-flow-product-owner';action='refresh-final-product-owner-review';interaction=null;}
   else if(finalProductOwner.needsHumanJudgment){actor='user';action='resolve-final-product-owner-recommendation';interaction=interactionForTask(root,id,'final-product-owner-decision',{sessionId:options.sessionId});}
   else if(guidedAcknowledgement){actor='user';action='review-final-product-owner-opinion';interaction=interactionForTask(root,id,'final-product-owner-decision',{sessionId:options.sessionId});}
   else if(!finalProductOwner.valid){actor='ai-flow-product-owner';action='final-product-owner-review';interaction=null;}
   else{actor='user';action='approve-or-reject-final-result';interaction=interactionForTask(root,id,'final-approval',{sessionId:options.sessionId});}
  }else{actor='user';action='approve-or-reject-final-result';interaction=interactionForTask(root,id,'final-approval',{sessionId:options.sessionId});}
 }
 if(task.meta.phase==='delivery'){actor='user';action='choose-delivery';interaction=interactionForTask(root,id,'delivery',{sessionId:options.sessionId});}
 const localActionBeforeDependencies=action,localInteractionBeforeDependencies=interaction;
 if(deps.length&&localActionBeforeDependencies==='continue'&&!localInteractionBeforeDependencies){
  actor='system';action='wait-for-dependencies';interaction=null;
  if(concurrency.applicable&&concurrency.runnableCount>0){actor='ai-flow-multi-agent';action='prepare-concurrency-wave';}
 }
 if(amendments.length&&!['done','rejected'].includes(task.meta.status)){actor='user';action='review-specification-amendment';interaction=interactionForTask(root,id,'amendment',{sessionId:options.sessionId});}
 // A child/member of a persisted concurrency plan must be dispatched by the
 // scheduler before any agent-owned mutation. Human gates always win.
 if(concurrencyAuthority.planned&&actor!=='user'&&!['system','done','rejected'].includes(actor)&&!['done','rejected'].includes(task.meta.status)){
  if(!concurrencyAuthority.reserved){actor='ai-flow-multi-agent';action='prepare-concurrency-lane';interaction=null;}
  else if(!concurrencyAuthority.sessionAuthorized){actor='ai-flow-multi-agent';action='use-concurrency-session';interaction=null;}
 }
 const humanDecisionOwnsLeaseExit=['resolve-target-audience-tradeoff','resolve-product-owner-recommendation','review-product-owner-opinion','resolve-final-product-owner-recommendation','review-final-product-owner-opinion','review-specification-amendment'].includes(action);
 if(lease.conflict&&!humanDecisionOwnsLeaseExit&&!concurrencyAuthority.planned&&!['done','rejected'].includes(task.meta.status)){actor='user';action='resolve-task-lease';interaction=leaseConflictInteraction(root,task.meta.id,options.sessionId ?? undefined,task.meta.title);}
 const evalCandidates=listEvalCandidates(root).filter(candidate=>candidate.status==='candidate'&&candidate.taskIds.includes(task.meta.id));
 const activeEvals=applicableActiveEvals(root,{phase:task.meta.phase,surfaces:task.meta.surfaces});
 if(interaction?.tool==='request_user_input'&&evalCandidates.length){const candidate=evalCandidates[0]!;(interaction as NativeInteraction).questions.push({id:`eval:${candidate.id}`,header:'Regresión',question:`Este fallo se ha repetido ${candidate.occurrences} veces. ¿Quieres convertirlo en una evaluación permanente?`,options:[{label:'Aprobar evaluación',description:'Activar la regresión para futuras tareas'},{label:'Descartar',description:'No convertir este patrón en una evaluación'},{label:'Decidir más tarde',description:'Mantenerlo como candidato'}],isOther:true});}
 if(interaction?.tool==='host_actions'){actor='host';action='present-review';}
 let runtime=runtimeRecommendation(root,task.meta.id,{sessionId:options.sessionId ?? null});
 // runtimeRecommendation may prepare a new phase boundary and deliberately reset
 // active CodeGraph context after compiling its seeds into the sealed handoff.
 // Read context *after* that transition so `next` never returns stale planning
 // files that are no longer authoritative for the new phase.
 const contextInfo=contextStatus(root,task.meta.id);
 const readiness=taskReadiness(root,task.meta.id,{sessionId:options.sessionId ?? null});
 const legacyIntegrity=task.meta.spec_approval==='approved'&&Number(task.meta.spec_integrity_version||1)<2;
 if(legacyIntegrity&&!amendments.length&&!lease.conflict&&!['done','rejected'].includes(task.meta.status)){actor='user';action='reapprove-hardened-specification';interaction=interactionForTask(root,id,'spec-approval',{sessionId:options.sessionId});}
 let autonomyDecision:{automatic:boolean;headlessStop:boolean;reason:string|null}={automatic:false,headlessStop:false,reason:null};
 const safeForAutomaticGate=!legacyIntegrity&&!amendments.length&&!lease.conflict&&!concurrencyAuthority.reserved&&!deps.length&&!readiness.blockers.length&&!evalCandidates.length;
 if(policy.level!=='guided'&&safeForAutomaticGate&&['approve-or-refine-specification','approve-or-reject-final-result'].includes(action)){actor='system';action='autonomy-advance';interaction=null;autonomyDecision={automatic:true,headlessStop:false,reason:'Deterministic approval gates are clean under the active autonomy policy.'};}
 else if(policy.level!=='guided'&&safeForAutomaticGate&&task.meta.phase==='delivery'&&policy.delivery==='merge-local'){actor='system';action='autonomy-advance';interaction=null;autonomyDecision={automatic:true,headlessStop:false,reason:'Project policy explicitly authorizes deterministic local merge delivery.'};}
 const humanReadinessBlocker=readiness.blockers.find(blocker=>(blocker.owner==='user'||blocker.owner==='external')&&!(concurrencyAuthority.planned&&blocker.id==='lease'));
 if(policy.level!=='headless'&&humanReadinessBlocker&&actor!=='user'&&!['done','rejected'].includes(task.meta.status)){
  actor='user';action='resolve-readiness-blocker';interaction=null;autonomyDecision={automatic:false,headlessStop:false,reason:`Human judgment is required by ${humanReadinessBlocker.label}: ${humanReadinessBlocker.detail}`};
 }
 if(policy.level==='headless'&&((actor==='user'&&interaction)||humanReadinessBlocker)&&!['done','rejected'].includes(task.meta.status)){
  const blockedAction=humanReadinessBlocker?`${humanReadinessBlocker.label}: ${humanReadinessBlocker.detail}`:action;
  actor='system';action='headless-stop';interaction=null;autonomyDecision={automatic:false,headlessStop:true,reason:`Headless mode stopped at human judgment: ${blockedAction}.`};
 }
 const evidence={preApproval:validateEvidence(root,id,'pre-approval'),final:validateEvidence(root,id,'final')};
 const boundaryCanPreempt=action==='continue'||(task.meta.status==='blocked'&&action==='wait-for-user');
 if(runtime.stopBeforePhaseWork&&boundaryCanPreempt&&!deps.length&&!amendments.length&&!lease.conflict){
  if(runtime.boundary?.status==='chosen'){action='enter-phase-boundary';actor='system';interaction=null;}
  else if(runtime.boundary?.status==='required'&&policy.level!=='guided'&&runtime.boundary.sameChatAllowed){
   const stableSession=String(options.sessionId||'').trim();
   if(stableSession){
    choosePhaseBoundary(root,task.meta.id,'continue-current',{sessionId:stableSession,handoffDigest:runtime.handoffDigest,handoffContentDigest:runtime.handoffContentDigest,handoffWords:runtime.handoffWords});
    runtime=runtimeRecommendation(root,task.meta.id,{sessionId:stableSession});
    action='enter-phase-boundary';actor='system';interaction=null;autonomyDecision={automatic:true,headlessStop:false,reason:'Autonomy policy selected the mechanically safe same-session phase boundary; no product judgment is required.'};
   }else if(policy.level==='headless'){
    action='headless-stop';actor='system';interaction=null;autonomyDecision={automatic:false,headlessStop:true,reason:'Headless mode cannot safely enter the phase boundary without a stable host session ID.'};
   }else{
    action='provide-stable-session';actor='system';interaction=null;autonomyDecision={automatic:false,headlessStop:false,reason:'Autonomous phase-boundary entry requires a stable host session ID, not a human product decision.'};
   }
  }
  else if(policy.level==='headless'){action='headless-stop';actor='system';interaction=null;autonomyDecision={automatic:false,headlessStop:true,reason:'Headless mode stopped because this phase boundary cannot be entered safely without a supported deterministic choice.'};}
  else{action='phase-boundary';actor='user';interaction=interactionForTask(root,id,'phase-boundary',{sessionId:options.sessionId});}
 }
 const userInputRequired=interaction?.tool==='request_user_input';
 const visualization=workflowVisualization(root,loadProjectConfig(root),task,{dependencies:deps,evidence,context:contextInfo,action,actor},options.sessionId ?? undefined);
 const recommendedSkill=['prepare-concurrency-wave','prepare-concurrency-lane','use-concurrency-session'].includes(action)?'ai-flow-multi-agent':['resolve-product-owner-recommendation','review-product-owner-opinion','resolve-final-product-owner-recommendation','review-final-product-owner-opinion'].includes(action)?'ai-flow-product-owner':actor.startsWith('ai-flow-')?actor:skillForPhase(root,task.meta.phase);
 const intelligence=intelligenceRecommendation(task,{actor,action,recommendedSkill});
 return{task:task.meta.id,status:task.meta.status,projectContext:projectContext.status,phase:task.meta.phase,workflowMode:task.meta.workflow_mode||'standard',fastActive,controlProfile:task.meta.route.control_profile||null,controlReasons:Array.isArray(task.meta.route.control_reasons)?task.meta.route.control_reasons:[],intelligence,autonomy:{...policy,...autonomyDecision},productIntelligence:{context:productContext,productOwner,finalProductOwner,audience},concurrency,concurrencyAuthority,readiness,actor,recommendedSkill,action,userInputRequired,dependencies:deps,interaction,evalCandidates,activeEvals:activeEvals.map(item=>({id:item.id,category:item.category,statement:item.statement,path:item.path})),lease,context:contextInfo,evidence,runtime,visualization};
}