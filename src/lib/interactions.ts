import path from 'node:path';
import { findTask, loadTask } from './task.js';
import { listQuestions } from './questions.js';
import { finalPresentation, specificationPresentation } from './presentation.js';
import { loadProjectConfig } from './project.js';
import { blockerVisualization, questionsVisualization } from './visualization.js';
import { pendingAmendments } from './amendments.js';
import { runtimeRecommendation } from './phase-handoff.js';
import { finalProductOwnerRequired, finalProductOwnerReviewStatus, productOwnerReviewStatus, targetAudienceReviewStatus } from './product-intelligence.js';
import { autonomyPolicy } from './autonomy-policy.js';
import { hasUserWaiver } from './user-overrides.js';
import type { HostActionInteraction, NativeInteraction, Presentation, QuestionOption, TaskQuestion } from './types.js';

function option(label:string,description=''):QuestionOption{return{label:String(label),description:String(description||label)};}
function header(value:unknown):string{return String(value||'Decision').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).slice(0,30);}
function decisionPresentation(root:string,task:ReturnType<typeof loadTask>,kind:string,title:string,markdown:string){
 const taskPath=path.resolve(task.path);
 return{kind,requiredBeforeInput:true,title,markdown,taskPath,taskRelativePath:path.relative(path.resolve(root),taskPath),previewUrl:null,attachments:[],visualization:null};
}

interface InteractionInput {
  id?: string;
  category?: string;
  impact?: string;
  text?: string;
  options?: string[];
  recommendation?: string|null;
  sessionId?: string|null|undefined;
}

interface NoInteraction { tool:null; questions:[]; reason:string; }
export type InteractionResult = NativeInteraction | HostActionInteraction | NoInteraction;

function presentationHostActions(presentation: Presentation): HostActionInteraction | null {
 if(!presentation.presentationContract.evidence.inlineRequired)return null;
 const acknowledgement=presentation.presentationContract.acknowledgement;
 if(acknowledgement.approvalReady)return null;
 const retryIds=new Set([...acknowledgement.pendingActionIds,...acknowledgement.blockingActionIds]);
 const actions=presentation.presentationContract.fallback.requiredHostActions.filter(action=>retryIds.has(action.id));
 const session=presentation.presentationContract.sessionId==='unspecified'?'<stable-codex-session-id>':presentation.presentationContract.sessionId;
 return{tool:'host_actions',presentation,actions,reason:acknowledgement.status==='blocked'?'Required review evidence was not successfully presented. Retry the blocking host actions before approval.':'Review presentation must be completed and acknowledged before the approval question can be emitted.',recordCommand:`specrail presentation record ${acknowledgement.taskId} --gate ${presentation.presentationContract.gate} --session ${session} --presentation-digest ${presentation.presentationContract.presentationDigest} --action <ACTION_ID> --outcome <presented|opened|offered|failed|unavailable> [--detail ...]`};
}

export function interactionForTask(root:string,id:string,kind='current',input:InteractionInput={}):InteractionResult{
 const task=loadTask(findTask(root,id));
 const sessionId=input.sessionId;
 if(kind==='current'){
  if(pendingAmendments(root,id).length)return interactionForTask(root,id,'amendment',input);
  if(task.meta.phase==='product-specifier'){
   const productOwner=productOwnerReviewStatus(root,id);
   const guidedAcknowledgement=autonomyPolicy(root).level==='guided'&&Boolean(productOwner.review)&&productOwner.integrityValid&&!productOwner.stale&&!productOwner.review?.humanDecision;
   if(productOwner.needsHumanJudgment||guidedAcknowledgement)return interactionForTask(root,id,'product-owner-decision',input);
  }
  if(task.meta.phase==='final-customer'&&targetAudienceReviewStatus(root,id).requiresProductDecision)return interactionForTask(root,id,'target-audience-decision',input);
  if(task.meta.open_questions>0)return interactionForTask(root,id,'open-questions',input);
  if(task.meta.phase==='spec-approval')return interactionForTask(root,id,'spec-approval',input);
  if(task.meta.phase==='final-approval'&&finalProductOwnerRequired(root)&&!hasUserWaiver(root,task.meta.id,'final-product-owner')){
   const finalOwner=finalProductOwnerReviewStatus(root,id);
   const guidedAcknowledgement=autonomyPolicy(root).level==='guided'&&Boolean(finalOwner.review)&&finalOwner.integrityValid&&!finalOwner.stale&&!finalOwner.review?.humanDecision;
   if(finalOwner.needsHumanJudgment||guidedAcknowledgement)return interactionForTask(root,id,'final-product-owner-decision',input);
  }
  if(task.meta.phase==='final-approval')return interactionForTask(root,id,'final-approval',input);
  if(task.meta.phase==='delivery')return interactionForTask(root,id,'delivery',input);
  if(task.meta.status==='blocked')return interactionForTask(root,id,'blocker',input);
  return{tool:null,questions:[],reason:'No user input is currently required'};
 }
 if(kind==='open-questions'){
  const open=listQuestions(root,id).filter(q=>q.status==='open').slice(0,3);
  const visualization=questionsVisualization(root,loadProjectConfig(root),task,open,sessionId) ?? undefined;
  return{tool:'request_user_input',...(visualization?{visualization}:{}),questions:open.map(q=>({id:q.id,header:header(q.category),question:q.text,options:q.options.map(x=>option(x,q.recommendation===x?'Recommended option':x)),isOther:true}))};
 }
 if(kind==='product-question'){
  const q:TaskQuestion={id:input.id||'product-decision',category:input.category||'product-decision',impact:input.impact||'material',text:String(input.text??''),options:input.options||[],recommendation:input.recommendation||null,status:'open',answer:null,created_at:new Date().toISOString(),answered_at:null};
  const visualization=questionsVisualization(root,loadProjectConfig(root),task,[q],sessionId) ?? undefined;
  return{tool:'request_user_input',...(visualization?{visualization}:{}),questions:[{id:q.id,header:header(q.category),question:q.text,options:q.options.map(x=>option(x,q.recommendation===x?'Recommended option':x)),isOther:true}]};
 }

 if(kind==='product-owner-decision'){
  const status=productOwnerReviewStatus(root,id),review=status.review;
  if(!review)return{tool:null,questions:[],reason:'No Product Owner review requires a decision'};
  const concerns=review.concerns.length?review.concerns.map(item=>`- ${item}`).join('\n'):'- None.';
  const questions=review.questions.length?review.questions.map(item=>`- ${item}`).join('\n'):'- None.';
  const presentation=decisionPresentation(root,task,'product-owner-decision',`Product Owner — ${task.meta.id}`,`# Product Owner Review\n\n**Verdict:** ${review.verdict}\n\n## Opinion\n\n${review.summary}\n\n## Product value\n\n${review.value}\n\n## Concerns\n\n${concerns}\n\n## Product questions\n\n${questions}`);
  return{tool:'request_user_input',presentation,questions:[{id:'product-owner-decision',header:'Product Owner',question:`El Product Owner del proyecto recomienda «${review.verdict}». Después de revisar su opinión completa, ¿cómo quieres continuar?`,options:[option('Continuar con la feature','Aceptar conscientemente el trade-off y pasar a especificación'),option('Revisar propuesta','Mantener la tarea en Product Owner y replantear la idea'),option('Rechazar tarea','Cerrar la tarea sin implementarla')],isOther:true}]};
 }
 if(kind==='final-product-owner-decision'){
  const status=finalProductOwnerReviewStatus(root,id),review=status.review;
  if(!review)return{tool:null,questions:[],reason:'No final Product Owner review requires a decision'};
  const concerns=review.concerns.length?review.concerns.map(item=>`- ${item}`).join('\n'):'- None.';
  const questions=review.questions.length?review.questions.map(item=>`- ${item}`).join('\n'):'- None.';
  const presentation=decisionPresentation(root,task,'final-product-owner-decision',`Product Owner outcome review — ${task.meta.id}`,`# Final Product Owner Review\n\n**Verdict:** ${review.verdict}\n\n## Outcome opinion\n\n${review.summary}\n\n## Product value after implementation\n\n${review.value}\n\n## Concerns\n\n${concerns}\n\n## Product questions\n\n${questions}`);
  return{tool:'request_user_input',presentation,questions:[{id:'final-product-owner-decision',header:'Product Owner',question:`El Product Owner reevalúa el resultado implementado como «${review.verdict}». Después de revisar su opinión completa, ¿cómo quieres continuar?`,options:[option('Continuar a aprobación final','Aceptar conscientemente el resultado y pasar al gate final'),option('Revisar implementación','Volver al Builder para corregir el resultado'),option('Revisar producto','Volver a Product Specifier y replantear la feature')],isOther:true}]};
 }
 if(kind==='target-audience-decision'){
  const status=targetAudienceReviewStatus(root,id);
  if(!status.reviews.length)return{tool:null,questions:[],reason:'No Target Audience review requires a decision'};
  const reviews=status.reviews.map(review=>{
   const findings=review.findings.length?review.findings.map(item=>`- ${item}`).join('\n'):'- None.';
   return`## ${review.profileId}${review.primary?' — primary':''}\n\n**Verdict:** ${review.verdict}\n\n| Signal | Result |\n|---|---|\n| Comprehension | ${review.comprehension} |\n| Utility | ${review.utility} |\n| Discoverability | ${review.discoverability} |\n| Friction | ${review.friction} |\n| Trust | ${review.trust} |\n| Repeat value | ${review.repeatValue} |\n\n### Findings\n\n${findings}`;
  }).join('\n\n');
  const presentation=decisionPresentation(root,task,'target-audience-decision',`Target Audience — ${task.meta.id}`,`# Target Audience Review\n\n${reviews}\n\n> This is a simulated audience review, not claimed user research.`);
  return{tool:'request_user_input',presentation,questions:[{id:'target-audience-decision',header:'Público objetivo',question:'La simulación del público objetivo detectó un trade-off de producto. Después de revisar todos los perfiles y findings, ¿qué quieres hacer?',options:[option('Aceptar trade-off','Aceptar explícitamente la decisión de producto y continuar'),option('Revisar implementación','Volver al Builder para reducir fricción o mejorar comprensión'),option('Revisar producto','Volver al Product Owner para replantear la feature')],isOther:true}]};
 }

 if(kind==='amendment'){
  const amendment=pendingAmendments(root,id)[0];
  if(!amendment)return{tool:null,questions:[],reason:'No pending specification amendment requires user input'};
  const base=specificationPresentation(root,id,sessionId);
  const amendmentPath=path.join(path.resolve(root),'.ai','amendments',task.meta.id,`${amendment.id}.json`);
  const changes=amendment.changes.map(value=>`- ${value}`).join('\n')||'- Ninguno';
  const criteria=amendment.acceptanceCriteria.length?amendment.acceptanceCriteria.map(value=>`- **${value.id}** — ${value.text}`).join('\n'):'- Ninguno';
  const allowed=amendment.allowedFiles.length?amendment.allowedFiles.map(value=>`- \`${value}\``).join('\n'):'- Ninguno';
  const protectedRemoved=amendment.protectedFilesRemoved.length?amendment.protectedFilesRemoved.map(value=>`- \`${value}\``).join('\n'):'- Ninguno';
  const scope=amendment.scopeAdditions.length?amendment.scopeAdditions.map(value=>`- ${value}`).join('\n'):'- Ninguno';
  const markdown=`# ${amendment.id} — ${amendment.title}\n\n**Motivo**\n\n${amendment.reason}\n\n## Cambios solicitados\n\n${changes}\n\n## Nuevos criterios de aceptación\n\n${criteria}\n\n## Ampliación del blast radius\n\n### Archivos permitidos añadidos\n\n${allowed}\n\n### Protecciones retiradas\n\n${protectedRemoved}\n\n### Alcance añadido\n\n${scope}\n\n> La especificación base permanece sellada. Aprobar esta Amendment crea una nueva especificación efectiva; rechazarla conserva la especificación efectiva actual.`;
  const presentation={...base,kind:'specification-amendment-review',title:`${amendment.id} — ${amendment.title}`,markdown,attachments:[{id:amendment.id,kind:'specification-amendment',label:`${amendment.id} — ${amendment.title}`,path:amendmentPath,relativePath:path.relative(path.resolve(root),amendmentPath),mediaType:'application/json',display:'inline' as const},...base.attachments],visualization:null};
  const hostActions=presentationHostActions(presentation);if(hostActions)return hostActions;
  return{tool:'request_user_input',presentation,questions:[{id:`amendment:${amendment.id}`,header:'Cambio de alcance',question:`Después de revisar ${amendment.id} — ${amendment.title}, ¿qué quieres hacer con este cambio de especificación?`,options:[option('Aprobar cambio','Incorporar esta Amendment a la especificación efectiva y actualizar sus criterios/límites'),option('Rechazar cambio','Mantener la especificación efectiva actual sin este cambio'),option('Revisar / mantener pendiente','No decidir todavía y devolver el cambio para más contexto o refinamiento')],isOther:true}]};
 }
 if(kind==='spec-approval'){
  const legacyReapproval=task.meta.spec_approval==='approved'&&Number(task.meta.spec_integrity_version||1)<2;
  const presentation=specificationPresentation(root,id,sessionId);const hostActions=presentationHostActions(presentation);if(hostActions)return hostActions;
  return{tool:'request_user_input',presentation,questions:[{id:'spec-approval',header:'Especificación',question:legacyReapproval?`Esta aprobación de ${task.meta.id} — ${task.meta.title} es anterior al sello de integridad endurecido. Después de revisar la especificación, el blast radius y el contexto de proyecto actuales, ¿confirmas la revalidación?`:`Después de revisar la especificación mostrada arriba para ${task.meta.id} — ${task.meta.title}, ¿está lista para ejecutarse?`,options:legacyReapproval?[option('Reaprobar con sello','Conservar el punto actual del workflow y añadir el nuevo sello de integridad sin recalcular el baseline'),option('Solicitar refinamiento','Volver al Product Specifier para revisar alcance o contexto'),option('Rechazar tarea','Cerrar sin continuar')]:[option('Aprobar especificación','Iniciar el workflow aprobado'),option('Solicitar refinamiento','Volver al Product Specifier con comentarios'),option('Rechazar tarea','Cerrar sin implementar')],isOther:true}]};
 }

 if(kind==='phase-boundary'){
  const runtime=runtimeRecommendation(root,id,{sessionId:sessionId??null});
  if(!runtime.stopBeforePhaseWork||!runtime.boundary)return{tool:null,questions:[],reason:'No phase-boundary decision is currently required'};
  const implementation=runtime.role==='implementer';
  const phaseLabel=implementation?'implementación':'revisión independiente';
  const freshRecommended=runtime.boundary.recommendation==='fresh-chat-recommended';
  const choiceMap={
    'Continuar con el modelo actual':'continue-current',
    'Pausar para cambiar modelo o razonamiento':'pause-model-change',
    'Abrir un chat nuevo':'fresh-chat'
  } as const;
  return{tool:'request_user_input',turnPolicy:{afterSelection:'persist-boundary-choice-and-end-turn',sameTurnPhaseWork:'forbidden',resumePrompt:`Continue ${task.meta.id}`,choiceMap},questions:[{id:'phase-boundary',header:implementation?'Implementation Boundary':'Review Boundary',question:`${task.meta.id} — ${task.meta.title} está sellada para ${phaseLabel}. ¿Cómo quieres continuar? Ninguna opción inicia ${phaseLabel} en este turno.`,options:[
    option('Continuar con el modelo actual',`Terminar este turno. En el siguiente turno continuar ${task.meta.id} con el modelo/reasoning que ya está seleccionado en Codex.`),
    option('Pausar para cambiar modelo o razonamiento',`Terminar aquí. Cambia el selector real de Codex y después continúa con: Continue ${task.meta.id}. SpecRail no cambia ni guarda el modelo.`),
    option('Abrir un chat nuevo',`${freshRecommended?'Recomendado para este boundary. ':''}Abrir un chat nuevo para mayor aislamiento de contexto y continuar allí con: Continue ${task.meta.id}.`)
  ],isOther:false}]};
 }
 if(kind==='blocker'){
  const visualization=blockerVisualization(root,loadProjectConfig(root),task,sessionId) ?? undefined;
  return{tool:'request_user_input',...(visualization?{visualization}:{}),questions:[{id:'workflow-blocker',header:'Bloqueo',question:`${task.meta.id} — ${task.meta.title} está bloqueada: ${task.meta.block_reason||'Un problema relevante necesita tu decisión.'}`,options:[option('Reintentar fase','Reanudar desde la fase interrumpida'),option('Volver a especificación','Refinar alcance o decisiones antes de continuar'),option('Rechazar tarea','Cerrar sin implementar')],isOther:true}]};
 }
 if(kind==='final-approval'){const presentation=finalPresentation(root,id,sessionId);const hostActions=hasUserWaiver(root,task.meta.id,'host-presentation')?null:presentationHostActions(presentation);if(hostActions)return hostActions;return{tool:'request_user_input',presentation,questions:[{id:'final-approval',header:'Resultado final',question:`Después de revisar el resultado y las evidencias mostradas arriba para ${task.meta.id} — ${task.meta.title}, ¿aceptas el resultado?`,options:[option('Aprobar resultado','Aceptar el resultado y continuar a su entrega'),option('Solicitar cambios','Volver a la fase adecuada con comentarios'),option('Mantener abierta','Dejarla pendiente de validación')],isOther:true}]};}
 if(kind==='delivery')return{tool:'request_user_input',questions:[{id:'delivery',header:'Entrega',question:`${task.meta.id} — ${task.meta.title} está aprobada. ¿Cómo entregamos los cambios del worktree?`,options:[option('Fusionar localmente','Fusionar la rama de la tarea en su rama base y limpiar el worktree'),option('Confirmar entrega externa','Confirmar que el PR o merge externo ya se completó'),option('Mantener worktree','Conservar la rama y el worktree sin cerrar la tarea')],isOther:false}]};
 throw new Error(`Unknown interaction kind: ${kind}`);
}
