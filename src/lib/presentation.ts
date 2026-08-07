import path from 'node:path';
import { readFileSync } from 'node:fs';
import { findTask, getSection, loadTask } from './task.js';
import { listEvidence } from './evidence.js';
import { writeReviewBundle } from './review.js';
import { writeReviewCockpit } from './cockpit.js';
import { loadProjectConfig } from './project.js';
import { finalVisualization, specificationVisualization } from './visualization.js';
import type { Attachment, EvidenceRecord, Presentation, TaskDocument, TaskRoute } from './types.js';

const SPEC_SECTIONS: Array<[string,string]> = [
 ['Need','Necesidad'],['Product Value','Valor para el usuario'],['Users','Usuarios'],['Scope','Alcance'],['UI Target','Objetivo visual'],['Out of Scope','Fuera de alcance'],
 ['Questions','Preguntas resueltas'],['Acceptance Criteria','Criterios de aceptación'],['Gherkin','Escenarios de aceptación'],['UX/UI Proposal','Propuesta UX/UI'],
 ['Architecture and Data Design','Arquitectura y diseño de datos'],['Implementation Plan','Plan de implementación'],['Decisions','Decisiones']
];
const FINAL_SECTIONS: Array<[string,string]> = [...SPEC_SECTIONS,['QA','QA'],['Final Customer','Cliente final']];
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
function mediaType(file: string): string {const ext=path.extname(file).toLowerCase();return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.md':'text/markdown','.json':'application/json','.txt':'text/plain','.log':'text/plain','.http':'text/plain'} as Record<string,string>)[ext] ?? 'application/octet-stream';}
function evidenceForStage(root: string,id: string,stage: 'specification'|'final'): Attachment[] {
 const items=listEvidence(root,id).filter(item=>stage==='specification'?SPEC_EVIDENCE.has(item.kind):true);
 return items.map(item=>({id:item.id,kind:item.kind,label:item.label,source:item.source,tool:item.tool,route:item.route,viewport:item.viewport,target:item.target,captureScope:item.captureScope,path:evidencePath(root,id,item),mediaType:mediaType(evidencePath(root,id,item)),display:'inline',sha256:item.sha256}));
}
function evidenceMarkdown(items: Attachment[]): string {
 if(!items.length)return'';
 return `## Evidencias visibles\n\n${items.map(item=>{const details=[`\`${item.kind}\``,item.source?`fuente: \`${item.source}\``:'',item.route?`ruta: \`${item.route}\``:'',item.viewport?`viewport: \`${item.viewport}\``:'',item.target?`objetivo: \`${item.target}\``:'',item.captureScope?`captura: \`${item.captureScope}\``:''].filter(Boolean).join(' · ');return `- **${item.label}** — ${details}\n  - Se debe mostrar como archivo o imagen adjunta en este mismo mensaje.`;}).join('\n')}`;
}
function sectionsMarkdown(task: TaskDocument,sections: Array<[string,string]>): string {return sections.map(([source,title])=>{const content=cleanSection(getSection(task.body,source));return content?`## ${title}\n\n${content}`:'';}).filter(Boolean).join('\n\n');}
function build(root: string,id: string,kind: 'specification-review'|'final-result-review',sessionId?: string|null): Presentation {
 const task=loadTask(findTask(root,id));
 const specification=kind==='specification-review';
 const bundle=writeReviewBundle(root,id,specification?'spec':'final');
 const cockpit=writeReviewCockpit(root,id,specification?'spec':'final');
 const cockpitDocument: Attachment={id:'REVIEW-COCKPIT',kind:'review-cockpit',label:`${task.meta.id} — interactive Review Cockpit.html`,source:'specrail-review-cockpit',tool:'SpecRail',route:null,viewport:null,path:cockpit.path,mediaType:'text/html',display:'inline',sha256:cockpit.sourceDigest};
 const bundleDocument: Attachment={id:'REVIEW-BUNDLE',kind:'review-bundle',label:`${task.meta.id} — ${specification?'specification':'final'} review.md`,source:'specrail-review-bundle',tool:'SpecRail',route:null,viewport:null,path:bundle.path,mediaType:'text/markdown',display:'inline',sha256:null};
 const taskDocument: Attachment={id:'TASK-MARKDOWN',kind:'task-markdown',label:`${task.meta.id} — ${task.meta.title}.md`,source:'task-markdown',tool:'SpecRail',route:null,viewport:null,path:task.path,mediaType:'text/markdown',display:'inline',sha256:null};
 const attachments=[cockpitDocument,bundleDocument,taskDocument,...evidenceForStage(root,id,specification?'specification':'final')];
 const heading=specification?'Especificación lista para validar':'Resultado listo para validar';
 const evidence=evidenceMarkdown(attachments.filter(item=>item.kind!=='task-markdown'&&item.kind!=='review-cockpit'));
 const bundleMarkdown=readFileSync(bundle.path,'utf8').trim();
 const markdown=[`> **${heading}.** SpecRail ha generado un Review Cockpit HTML en \`${cockpit.relativePath}\`. Generarlo no significa que Codex lo haya abierto o mostrado. Cuando la skill \`$visualize\` esté disponible, úsala como superficie interactiva nativa del Review Cockpit. El Review Bundle completo que sigue es autoritativo y debe mostrarse íntegramente en chat antes de pedir aprobación.`,bundleMarkdown,evidence].filter(Boolean).join('\n\n');
 const config=loadProjectConfig(root);
 return{kind,requiredBeforeInput:true,title:`${task.meta.id} — ${task.meta.title}`,markdown,taskPath:task.path,taskRelativePath:taskRelativePath(root,task.path),attachments,visualization:specification?specificationVisualization(root,config,task,attachments,sessionId):finalVisualization(root,config,task,attachments,sessionId)};
}
export function specificationPresentation(root:string,id:string,sessionId?:string|null):Presentation{return build(root,id,'specification-review',sessionId);}
export function finalPresentation(root:string,id:string,sessionId?:string|null):Presentation{return build(root,id,'final-result-review',sessionId);}
