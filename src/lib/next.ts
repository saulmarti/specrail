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

const SKILL:Partial<Record<TaskPhase,string>>={'product-specifier':'ai-flow-product-specifier','ux-ui-designer':'ai-flow-ux-ui-designer','technical-architecture':'ai-flow-technical-reviewer','builder':'ai-flow-builder','technical-reviewer':'ai-flow-technical-reviewer','qa-engineer':'ai-flow-qa-engineer','final-customer':'ai-flow-final-customer'};

export interface NextOptions { sessionId?:string|null|undefined; }
export function nextAction(root:string,id:string,options:NextOptions={}){
 const task=loadTask(findTask(root,id));
 const deps=unfinishedDependencies(root,task).map(x=>x.meta.id);
 const projectContext=projectContextStatus(root);
 const lease=leaseStatus(root,task.meta.id,options.sessionId ?? undefined);
 const amendments=pendingAmendments(root,task.meta.id);
 let actor=SKILL[task.meta.phase]||'user';
 let action='continue';
 let interaction:InteractionResult|null=null;
 if(task.meta.status==='done'){actor='system';action='task-complete';}
 if(task.meta.status==='rejected'){actor='system';action='task-rejected';}
 if(projectContext.status!=='ready'&&task.meta.phase==='product-specifier'){actor='ai-flow-product-specifier';action='bootstrap-project-and-refine';}
 if(task.meta.open_questions>0||task.meta.waiting_for==='user'){actor='user';action='wait-for-user';interaction=interactionForTask(root,id,'current',{sessionId:options.sessionId});}
 if(task.meta.phase==='spec-approval'){actor='user';action='approve-or-refine-specification';interaction=interactionForTask(root,id,'spec-approval',{sessionId:options.sessionId});}
 if(task.meta.phase==='final-approval'){actor='user';action='approve-or-reject-final-result';interaction=interactionForTask(root,id,'final-approval',{sessionId:options.sessionId});}
 if(task.meta.phase==='delivery'){actor='user';action='choose-delivery';interaction=interactionForTask(root,id,'delivery',{sessionId:options.sessionId});}
 if(deps.length){actor='system';action='wait-for-dependencies';interaction=null;}
 if(amendments.length&&!['done','rejected'].includes(task.meta.status)){actor='user';action='review-specification-amendment';interaction=interactionForTask(root,id,'amendment',{sessionId:options.sessionId});}
 if(lease.conflict&&!['done','rejected'].includes(task.meta.status)){actor='user';action='resolve-task-lease';interaction=leaseConflictInteraction(root,task.meta.id,options.sessionId ?? undefined,task.meta.title);}
 const evalCandidates=listEvalCandidates(root).filter(candidate=>candidate.status==='candidate'&&candidate.taskIds.includes(task.meta.id));
 const activeEvals=applicableActiveEvals(root,{phase:task.meta.phase,surfaces:task.meta.surfaces});
 if(interaction?.tool==='request_user_input'&&evalCandidates.length){const candidate=evalCandidates[0]!;(interaction as NativeInteraction).questions.push({id:`eval:${candidate.id}`,header:'Regresión',question:`Este fallo se ha repetido ${candidate.occurrences} veces. ¿Quieres convertirlo en una evaluación permanente?`,options:[{label:'Aprobar evaluación',description:'Activar la regresión para futuras tareas'},{label:'Descartar',description:'No convertir este patrón en una evaluación'},{label:'Decidir más tarde',description:'Mantenerlo como candidato'}],isOther:true});}
 const runtime=runtimeRecommendation(root,task.meta.id,{sessionId:options.sessionId ?? null});
 // runtimeRecommendation may prepare a new phase boundary and deliberately reset
 // active CodeGraph context after compiling its seeds into the sealed handoff.
 // Read context *after* that transition so `next` never returns stale planning
 // files that are no longer authoritative for the new phase.
 const contextInfo=contextStatus(root,task.meta.id);
 const readiness=taskReadiness(root,task.meta.id,{sessionId:options.sessionId ?? null});
 const legacyIntegrity=task.meta.spec_approval==='approved'&&Number(task.meta.spec_integrity_version||1)<2;
 if(legacyIntegrity&&!amendments.length&&!lease.conflict&&!['done','rejected'].includes(task.meta.status)){actor='user';action='reapprove-hardened-specification';interaction=interactionForTask(root,id,'spec-approval',{sessionId:options.sessionId});}
 const evidence={preApproval:validateEvidence(root,id,'pre-approval'),final:validateEvidence(root,id,'final')};
 if(runtime.stopBeforePhaseWork&&action==='continue'&&!interaction&&!deps.length&&!amendments.length&&!lease.conflict)action='phase-boundary';
 const visualization=workflowVisualization(root,loadProjectConfig(root),task,{dependencies:deps,evidence,context:contextInfo,action,actor},options.sessionId ?? undefined);
 return{task:task.meta.id,status:task.meta.status,projectContext:projectContext.status,phase:task.meta.phase,readiness,actor,recommendedSkill:SKILL[task.meta.phase]||null,action,dependencies:deps,interaction,evalCandidates,activeEvals:activeEvals.map(item=>({id:item.id,category:item.category,statement:item.statement,path:item.path})),lease,context:contextInfo,evidence,runtime,visualization};
}
