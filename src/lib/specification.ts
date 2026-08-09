import { createHash } from 'node:crypto';
import { getSection } from './task.js';
import type { JsonValue, TaskDocument } from './types.js';
import { validateQAMission } from './qa.js';
import { qualityPolicy } from './quality.js';
import { operationalPolicy } from './observability.js';
import { parseUiTargetContexts } from './evidence.js';

export const GOVERNED_SPEC_SECTIONS = ['Need','Product Value','Users','Scope','UI Target','Blast Radius','Out of Scope','Questions','Acceptance Criteria','Gherkin','QA Mission','Quality Strategy','Operational Evidence','Vertical Slices','Constitution Impact','UX/UI Proposal','Architecture and Data Design','Implementation Plan','Decisions'] as const;
const GOVERNED_META_V1 = ['title','type','size','risk','execution_profile','surfaces','route','file_scope','dependencies','parent_id'] as const;
const GOVERNED_META_V2 = [...GOVERNED_META_V1,'spec_integrity_version','project_governance_hash','scope_guard_hash','scope_baseline_commit'] as const;
const VAGUE=[/\b(?:work|works|working|funcione|funciona)\s+(?:correctly|properly|bien|correctamente)\b/i,/\b(?:look|looks|se vea|verse)\s+(?:good|better|nice|bien|mejor|bonito)\b/i,/\b(?:improve|mejorar)\s+(?:the\s+)?(?:design|ux|ui|usability|diseño|experiencia|usabilidad)\b/i,/\b(?:responsive|usable|user[- ]friendly|intuitive|intuitivo|usable)\b[.!]?$/i,/\b(?:best practices|buenas prácticas)\b/i];
function clean(value:unknown):string{return String(value??'').replace(/<!-- AI-FLOW:QUESTIONS-DATA[\s\S]*?AI-FLOW:QUESTIONS-DATA -->/g,'').replace(/^_No open questions\._$/gim,'').trim();}
function stable(value:unknown):JsonValue{
 if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable((value as Record<string,unknown>)[key])]));
 return String(value??'');
}
export function specificationSnapshot(task:TaskDocument):{schemaVersion:1|2;meta:Record<string,JsonValue>;sections:Record<string,string>}{
 const schemaVersion=Number(task.meta.spec_integrity_version||1)>=2?2 as const:1 as const;
 const governedMeta=schemaVersion===2?GOVERNED_META_V2:GOVERNED_META_V1;
 const meta:Record<string,JsonValue>={};for(const key of governedMeta)meta[key]=stable(task.meta[key]??null);
 const sections:Record<string,string>={};for(const name of GOVERNED_SPEC_SECTIONS)sections[name]=clean(getSection(task.body,name));
 return{schemaVersion,meta,sections};
}
export function specificationHash(task:TaskDocument):string{return createHash('sha256').update(JSON.stringify(stable(specificationSnapshot(task)))).digest('hex');}
function bullets(value:unknown):string[]{return String(value??'').split('\n').map(x=>x.trim()).filter(x=>/^(?:[-*]|\d+[.)])\s+/.test(x)).map(x=>x.replace(/^(?:[-*]|\d+[.)])\s+/,''));}
function vagueCriterion(value:unknown):boolean{const text=String(value??'').trim();const vague=VAGUE.some(rx=>rx.test(text));if(!vague)return false;const observable=/(?:`[^`]+`|\bHTTP\s*\d{3}\b|\bGET\b|\bPOST\b|\bPUT\b|\bDELETE\b|\bPATCH\b|\breturns?\b|\bdevuelve\b|\bshows?\b|\bmuestra\b|\bcontains?\b|\bcontiene\b|\b(?:no|without|sin)\s+(?:overflow|clipping|solapes?|overlap)|\b\d+(?:[.,]\d+)?\s*(?:px|ms|s|seconds?|segundos?|%|lines?|líneas?|requests?|solicitudes?|viewports?|pantallas?|items?|elementos?)\b)/i.test(text);return !observable;}
export interface SpecificationLint{valid:boolean;stage:string;score:number;errors:string[];warnings:string[];hash:string;}
export function lintSpecification(task:TaskDocument,{stage='approval'}:{stage?:string}={}):SpecificationLint{
 const errors:string[]=[],warnings:string[]=[];const sections:Record<string,string>=Object.fromEntries(GOVERNED_SPEC_SECTIONS.map(name=>[name,clean(getSection(task.body,name))]));
 for(const name of ['Need','Product Value','Scope','Out of Scope','Acceptance Criteria'])if(!sections[name])errors.push(`${name} is required`);
 const criteria=bullets(sections['Acceptance Criteria']??'');if(!criteria.length)errors.push('Acceptance Criteria must contain observable bullet points');for(const criterion of criteria)if(vagueCriterion(criterion))errors.push(`Acceptance criterion is vague or non-observable: ${criterion}`);const criterionIds=criteria.map(item=>item.match(/^(AC-[A-Z0-9-]+)\s*:/i)?.[1]?.toUpperCase()).filter((value):value is string=>Boolean(value));if(stage==='approval'&&criterionIds.length!==criteria.length)errors.push('Every acceptance criterion must have a stable AC-* id before approval');if(new Set(criterionIds).size!==criterionIds.length)errors.push('Acceptance criterion ids must be unique');if(task.meta.route.implementation&&!sections['Blast Radius'])errors.push('Blast Radius is required for implementation work before approval');
 if((sections.Need??'').length>0&&(sections.Need??'').length<18)warnings.push('Need is unusually short');if(sections['Product Value']&&VAGUE.some(rx=>rx.test(sections['Product Value']!)))warnings.push('Product Value contains vague language');
 const frontend=task.meta.surfaces.some(x=>['frontend','ui','ux'].includes(x))||task.meta.route.design;if(frontend){const target=sections['UI Target']??'';if(!target)errors.push('UI Target is required for frontend/UI work');else{const routeField=target.match(/(?:route|ruta|screen|pantalla)\s*:\s*([^\n\r]+)/i);const routeValue=routeField?.[1]?.trim()??'';if(!routeField||/^(?:`?\d{2,5}\s*[x×]\s*\d{2,5}`?)$/.test(routeValue))errors.push('UI Target must identify the route or screen separately from viewport dimensions');if(!/(?:target|selector|objetivo|anchor|ancla|section|componente)\s*:/i.test(target))errors.push('UI Target must identify the exact element or visible anchor');if(!/(?:capture|captura)\s*:/i.test(target))errors.push('UI Target must define the capture scope for each visual context');const parsed=parseUiTargetContexts(target);errors.push(...parsed.errors);if(!parsed.contexts.length)errors.push('UI Target must define at least one complete Route → Target → exact pixel Viewport → Capture context such as / → section#hero → 1440x1000 → focused-section');}}
 const qaErrors=task.meta.route.qa!=='none'?validateQAMission(task):[];errors.push(...qaErrors);
 const q=qualityPolicy(task);if((q.propertyTesting!=='none'||q.mutationTesting!=='none')&&!sections['Quality Strategy'])errors.push('Quality Strategy is required for selected property/mutation testing');
 const ops=operationalPolicy(task);if(ops.level!=='none'&&!sections['Operational Evidence'])errors.push('Operational Evidence is required for selected observability policy');
 if(task.meta.delivery_strategy==='vertical-slices'&&task.meta.size==='large'&&!sections['Vertical Slices'])errors.push('Large features require a Vertical Slices plan');
 const backend=task.meta.surfaces.some(x=>['backend','api'].includes(x));if(backend&&criteria.length){const all=criteria.join(' ');if(!/(?:request|input|entrada|solicitud|\bGET\b|\bPOST\b|\bPUT\b|\bDELETE\b|\bPATCH\b)/i.test(all))warnings.push('Backend criteria should identify an input or request');if(!/(?:response|output|respuesta|status|c[oó]digo|returns?|devuelve)/i.test(all))warnings.push('Backend criteria should identify an observable response or output');}
 if(stage==='approval'&&(task.meta.route.architecture||task.meta.route.database)&&!sections['Architecture and Data Design'])errors.push('Architecture and Data Design is required before approval');
 const score=Math.max(0,100-errors.length*18-warnings.length*4);return{valid:errors.length===0,stage,score,errors,warnings,hash:specificationHash(task)};
}
