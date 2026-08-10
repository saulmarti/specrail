import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findTask, getSection, loadTask } from './task.js';
import { listEvidence, matchesAnyExpectedVisualContext } from './evidence.js';
import { writeReviewBundle } from './review.js';
import { writeReviewCockpit } from './cockpit.js';
import { loadProjectConfig } from './project.js';
import { finalVisualization, specificationVisualization } from './visualization.js';
import { getVisualizationRun } from './capabilities.js';
import { presentationAcknowledgementState, presentationDigest as computePresentationDigest } from './presentation-state.js';
import { prepareSpecificationReviewState } from './spec-review-prep.js';
import type { Attachment, EvidenceRecord, Presentation, PresentationHostAction, TaskDocument, TaskRoute } from './types.js';

const SPEC_SECTIONS: Array<[string,string]> = [
 ['Need','Necesidad'],['Product Value','Valor para el usuario'],['Users','Usuarios'],['Product Owner Review','Revisión de Product Owner'],['Scope','Alcance'],['UI Target','Objetivo visual'],['Out of Scope','Fuera de alcance'],
 ['Questions','Preguntas resueltas'],['Acceptance Criteria','Criterios de aceptación'],['Gherkin','Escenarios de aceptación'],['UX/UI Proposal','Propuesta UX/UI'],
 ['Architecture and Data Design','Arquitectura y diseño de datos'],['Implementation Plan','Plan de implementación'],['Decisions','Decisiones']
];
const FINAL_SECTIONS: Array<[string,string]> = [...SPEC_SECTIONS,['QA','QA'],['Target Audience Review','Público objetivo'],['Final Customer','Cliente final']];
const SPEC_EVIDENCE = new Set(['frontend-before','frontend-mobile-before','ui-design-brief','frontend-proposal','frontend-mobile-proposal','ui-proposal-review','architecture-source','architecture-rendered','database-source','database-rendered','migration-plan']);

function cleanSection(value: unknown): string {
 return String(value ?? '').replace(/<!-- AI-FLOW:QUESTIONS-DATA[\s\S]*?AI-FLOW:QUESTIONS-DATA -->/g,'').replace(/^_No open questions\._$/gim,'').trim();
}
function routeSummary(route: TaskRoute): string {
 const entries=Object.entries(route).filter(([,value])=>value!==false&&value!==null&&value!==undefined&&value!=='none');
 return entries.length?entries.map(([key,value])=>`${key.replace(/_/g,' ')}: ${String(value)}`).join(' · '):'flujo mínimo';
}
function taskRelativePath(root: string,file: string): string {return path.relative(path.resolve(root),file).split(path.sep).join('/');}
function evidencePath(root: string,id: string,item: EvidenceRecord): string {return path.resolve(root,'.ai/evidence',id,item.path);}
function fileSha256(file: string): string | null { try { return createHash('sha256').update(readFileSync(file)).digest('hex'); } catch { return null; } }
function mediaType(file: string): string {const ext=path.extname(file).toLowerCase();return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.md':'text/markdown','.json':'application/json','.txt':'text/plain','.log':'text/plain','.http':'text/plain'} as Record<string,string>)[ext] ?? 'application/octet-stream';}
function visualRole(kind: string): 'Before'|'Proposal'|'After'|null { if(kind.includes('proposal'))return'Proposal';if(kind.includes('after'))return'After';if(kind.includes('before'))return'Before';return null; }
function presentationLabel(item: EvidenceRecord): string { const role=visualRole(item.kind);if(!role)return item.label;const details=[item.route,item.target,item.viewport,item.captureScope].filter(Boolean).join(' · ');return details?`${role} · ${details}`:role; }
function evidenceForStage(root: string,id: string,stage: 'specification'|'final'): Attachment[] {
 const task=loadTask(findTask(root,id));
 const items=listEvidence(root,id).filter(item=>stage==='specification'?SPEC_EVIDENCE.has(item.kind):true);
 const visualKinds=new Set(['frontend-before','frontend-mobile-before','frontend-proposal','frontend-mobile-proposal','frontend-after','frontend-mobile-after']);
 const canonicalVisuals=new Map<string,(typeof items)[number]>();const nonVisuals=[] as typeof items;
 for(const item of items){
   if(!visualKinds.has(item.kind)){nonVisuals.push(item);continue;}
   if(!matchesAnyExpectedVisualContext(task,item)) continue;
   const role=item.kind.includes('proposal')?'proposal':item.kind.includes('after')?'after':'before';
   canonicalVisuals.set(`${role}|${item.viewport||'unspecified'}|${item.route||''}|${item.target||''}|${item.captureScope||''}`,item);
 }
 const visualOrder={before:0,proposal:1,after:2} as const;
 const visuals=[...canonicalVisuals.values()].sort((a,b)=>{const ra=a.kind.includes('proposal')?'proposal':a.kind.includes('after')?'after':'before';const rb=b.kind.includes('proposal')?'proposal':b.kind.includes('after')?'after':'before';return visualOrder[ra]-visualOrder[rb]||String(a.viewport||'').localeCompare(String(b.viewport||''));});
 const selected=[...visuals,...nonVisuals];
 return selected.map(item=>{const file=evidencePath(root,id,item),type=mediaType(file),role=visualRole(item.kind);const requiredVisible=type.startsWith('image/');return{id:item.id,kind:item.kind,label:presentationLabel(item),source:item.source,tool:item.tool,route:item.route,viewport:item.viewport,target:item.target,captureScope:item.captureScope,runtimeUrl:item.runtimeUrl??null,path:file,mediaType:type,display:requiredVisible?'inline':'attachment',sha256:fileSha256(file),reviewRole:role?role.toLowerCase() as 'before'|'proposal'|'after':'supporting',requiredVisible};});
}
function sectionsMarkdown(task: TaskDocument,sections: Array<[string,string]>): string {return sections.map(([source,title])=>{const content=cleanSection(getSection(task.body,source));return content?`## ${title}\n\n${content}`:'';}).filter(Boolean).join('\n\n');}
function previewUrlFor(items: Attachment[], specification: boolean): string | null {
 const preferred=specification?['frontend-before','frontend-mobile-before']:['frontend-after','frontend-mobile-after'];
 for(const kind of preferred){const item=[...items].reverse().find(candidate=>candidate.kind===kind&&candidate.runtimeUrl);if(item?.runtimeUrl)return item.runtimeUrl;}
 return null;
}
function build(root: string,id: string,kind: 'specification-review'|'final-result-review',sessionId?: string|null): Presentation {
 const specification=kind==='specification-review';
 if(specification)prepareSpecificationReviewState(root,id);
 const task=loadTask(findTask(root,id));
 const bundle=writeReviewBundle(root,id,specification?'spec':'final');
 const cockpit=writeReviewCockpit(root,id,specification?'spec':'final');
 const cockpitDocument: Attachment={id:'REVIEW-COCKPIT',kind:'review-cockpit',label:`${task.meta.id} — interactive Review Cockpit.html`,source:'specrail-review-cockpit',tool:'SpecRail',route:null,viewport:null,path:cockpit.path,mediaType:'text/html',display:'inline',sha256:cockpit.sourceDigest,openUrl:cockpit.openUrl};
 const bundleDocument: Attachment={id:'REVIEW-BUNDLE',kind:'review-bundle',label:`${task.meta.id} — ${specification?'specification':'final'} review.md`,source:'specrail-review-bundle',tool:'SpecRail',route:null,viewport:null,path:bundle.path,mediaType:'text/markdown',display:'inline',sha256:fileSha256(bundle.path)};
 const attachments=[cockpitDocument,bundleDocument,...evidenceForStage(root,id,specification?'specification':'final')];
 const heading=specification?'Especificación lista para validar':'Resultado listo para validar';
 const bundleMarkdown=readFileSync(bundle.path,'utf8').trim();
 const markdown=[`> **${heading}.** El Review Bundle completo que sigue es autoritativo y debe mostrarse íntegramente antes de pedir aprobación. Toda evidencia con \`requiredVisible=true\` debe presentarse directamente en una superficie visible del host; una ruta local, un nombre de archivo o un HTML generado nunca satisfacen por sí solos “mostrar evidencia”. Los paths son únicamente metadata de auditoría. SpecRail genera además un Review Cockpit, pero su generación no prueba que el host lo haya abierto o mostrado.`,bundleMarkdown].filter(Boolean).join('\n\n');
 const config=loadProjectConfig(root);
 const visualization=specification?specificationVisualization(root,config,task,attachments,sessionId):finalVisualization(root,config,task,attachments,sessionId);
 const gate=specification?'spec-approval' as const:'final-approval' as const;
 const run=getVisualizationRun(root,task.meta.id,gate,sessionId);
 const requiredAttachmentIds=attachments.filter(item=>item.requiredVisible&&item.id).map(item=>String(item.id));
 const requiredHostActions:PresentationHostAction[]=attachments.filter(item=>item.requiredVisible&&item.id).map(item=>({id:`present:${String(item.id)}`,type:'present-image',surface:'conversation',attachmentId:String(item.id),label:item.label,reviewRole:item.reviewRole||'supporting',mediaType:item.mediaType,blocking:true}));
 requiredHostActions.push({id:'cockpit:open-or-offer',type:'open-url',surface:'browser',attachmentId:'REVIEW-COCKPIT',label:'Abrir Review Cockpit',url:cockpit.openUrl,blocking:false});
 const presentationDigest=computePresentationDigest({taskId:task.meta.id,gate,actions:requiredHostActions,attachments});
 const acknowledgement=presentationAcknowledgementState(root,{taskId:task.meta.id,gate,sessionId:sessionId??null,presentationDigest,actions:requiredHostActions});
 const presentationContract={
   gate,sessionId:String(sessionId||'').trim()||'unspecified',presentationDigest,
   evidence:{inlineRequired:requiredAttachmentIds.length>0,requiredAttachmentIds,localPathsAreAuditOnly:true as const,requiredSurface:'conversation' as const,onUnavailable:'block-approval' as const},
   visualize:{artifactPrepared:run?.artifactPrepared===true,referencePrepared:run?.referencePrepared===true,hostPresentation:'unverified' as const,hostPresentationVerified:false as const,fallbackRequired:true},
   cockpit:{artifactPrepared:true,hostPresentation:'unverified' as const,hostPresentationVerified:false as const,openActionRequired:true as const,attachmentId:'REVIEW-COCKPIT' as const,openUrl:cockpit.openUrl},
   acknowledgement,
   fallback:{required:true,mode:'inline-evidence-and-cockpit-open-action' as const,requiredHostActions}
 };
 return{kind,requiredBeforeInput:true,title:`${task.meta.id} — ${task.meta.title}`,markdown,taskPath:task.path,taskRelativePath:taskRelativePath(root,task.path),previewUrl:previewUrlFor(attachments,specification),attachments,visualization,presentationContract};
}
export function specificationPresentation(root:string,id:string,sessionId?:string|null):Presentation{return build(root,id,'specification-review',sessionId);}
export function finalPresentation(root:string,id:string,sessionId?:string|null):Presentation{return build(root,id,'final-result-review',sessionId);}
