import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, getSection, loadTask } from './task.js';
import { loadProjectConfig } from './project.js';
import { contextProfileForTask } from './phase-role.js';
import type { ContextManifest, ContextPolicy, NativeInteraction, TaskDocument } from './types.js';
function now(): string { return new Date().toISOString(); }
function manifestPath(root: string,id: string): string { return path.join(path.resolve(root),'.ai','runtime','context',`${id}.json`); }
function normalizeRepositoryFiles(root: string,files: string[]=[]): string[] {
  const base=path.resolve(root),prefix=`${base}${path.sep}`;
  return files.map(value=>{const raw=String(value||'').trim();if(!raw)throw new Error('Context file path is required');if(path.isAbsolute(raw))throw new Error(`Context file must be repository-relative: ${raw}`);const absolute=path.resolve(base,raw);if(absolute!==base&&!absolute.startsWith(prefix))throw new Error(`Context file is outside the repository: ${raw}`);return path.relative(base,absolute).split(path.sep).join('/');});
}
function profileFor(root: string,task: TaskDocument): {name:string;policy:ContextPolicy} {
  const config=loadProjectConfig(root),profiles=config.contextBudget?.profiles||{},name=contextProfileForTask(config,task);
  return{name,policy:profiles[name]||profiles[task.meta.execution_profile]||profiles.standard||{initialFiles:12,maxFiles:24,codegraphDepth:2,maxDepth:3,handoffMaxWords:300,maxAutomaticExpansions:3}};
}
export function ensureContextManifest(root: string,id: string): ContextManifest {
  const task=loadTask(findTask(root,id)),file=manifestPath(root,task.meta.id),profile=profileFor(root,task),config=loadProjectConfig(root),stamp=now();
  if(existsSync(file)){
    const manifest=JSON.parse(readFileSync(file,'utf8')) as ContextManifest;
    if(manifest.profile!==profile.name){
      manifest.history.push({at:stamp,reason:`Runtime role changed context profile from ${manifest.profile} to ${profile.name}; active file/symbol context reset for a fresh phase handoff.`,files:[...manifest.files],symbols:[...manifest.symbols],depth:manifest.policy.codegraphDepth,readOnly:true,status:'profile-reset'});
      manifest.profile=profile.name;manifest.policy=profile.policy;manifest.files=[];manifest.symbols=[];manifest.expansionCount=0;manifest.updatedAt=stamp;writeFileSync(file,`${JSON.stringify(manifest,null,2)}\n`);
    }else manifest.policy=profile.policy;
    return manifest;
  }
  const manifest:ContextManifest={taskId:task.meta.id,profile:profile.name,fullRepositoryScan:Boolean(config.contextBudget?.fullRepositoryScan),policy:profile.policy,files:[],symbols:[],expansionCount:0,history:[],createdAt:stamp,updatedAt:stamp};
  mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,`${JSON.stringify(manifest,null,2)}\n`);return manifest;
}
function save(root: string,id: string,manifest: ContextManifest): ContextManifest {manifest.updatedAt=now();writeFileSync(manifestPath(root,id),`${JSON.stringify(manifest,null,2)}\n`);return manifest;}
export function contextStatus(root: string,id: string): ContextManifest & {remainingFiles:number;automaticExpansionsRemaining:number} {
  const manifest=ensureContextManifest(root,id);return{...manifest,remainingFiles:Math.max(0,manifest.policy.maxFiles-manifest.files.length),automaticExpansionsRemaining:Math.max(0,manifest.policy.maxAutomaticExpansions-manifest.expansionCount)};
}

export function resetContextForPhaseBoundary(root: string,id: string,reason: string): ContextManifest {
  const why=String(reason||'').trim();if(why.length<12)throw new Error('Phase-boundary context reset requires a concrete reason');
  const manifest=ensureContextManifest(root,id);
  if(!manifest.files.length&&!manifest.symbols.length&&manifest.expansionCount===0)return manifest;
  manifest.history.push({at:now(),reason:why,files:[...manifest.files],symbols:[...manifest.symbols],depth:manifest.policy.codegraphDepth,readOnly:true,status:'phase-boundary-reset'});
  manifest.files=[];manifest.symbols=[];manifest.expansionCount=0;
  return save(root,id,manifest);
}

export interface ContextExpansionRequest {reason?:string;files?:string[];symbols?:string[];depth?:number;readOnly?:boolean}
export type ContextExpansionResult =
 | {status:'approved';manifest:ReturnType<typeof contextStatus>}
 | {status:'user-approval-required';reason:string;requested:{files:string[];symbols:string[];depth:number;readOnly:boolean};policy:ContextPolicy;interaction:NativeInteraction};
export function requestContextExpansion(root: string,id: string,{reason,files=[],symbols=[],depth=1,readOnly=true}: ContextExpansionRequest={}): ContextExpansionResult {
  const why=String(reason||'').trim();if(why.length<12)throw new Error('Context expansion requires a concrete reason');
  const safeFiles=normalizeRepositoryFiles(root,files),manifest=ensureContextManifest(root,id),nextFiles=[...new Set([...manifest.files,...safeFiles])],nextSymbols=[...new Set([...manifest.symbols,...symbols.map(String)])];
  const exceeds=nextFiles.length>manifest.policy.maxFiles||depth>manifest.policy.maxDepth||manifest.expansionCount>=manifest.policy.maxAutomaticExpansions||!readOnly;
  if(exceeds)return{status:'user-approval-required',reason:why,requested:{files:safeFiles,symbols,depth,readOnly},policy:manifest.policy,interaction:{tool:'request_user_input',questions:[{id:'context-expansion',header:'Más contexto',question:`La tarea necesita ampliar el contexto: ${why}`,options:[{label:'Permitir ampliación',description:'Autorizar esta lectura adicional'},{label:'Mantener contexto actual',description:'Continuar sin ampliar'},{label:'Volver a especificación',description:'Revisar alcance o enfoque'}],isOther:true}]}};
  manifest.files=nextFiles;manifest.symbols=nextSymbols;manifest.expansionCount+=1;manifest.history.push({at:now(),reason:why,files:safeFiles,symbols,depth,readOnly,status:'approved'});save(root,id,manifest);return{status:'approved',manifest:contextStatus(root,id)};
}
function wordCount(value: unknown): number {return String(value||'').trim().split(/\s+/).filter(Boolean).length;}
export function validateHandoffBudget(root: string,task: TaskDocument): {valid:boolean;words:number;limit:number;errors:string[]} {
  const manifest=ensureContextManifest(root,task.meta.id),words=wordCount(getSection(task.body,'Handoff')),errors:string[]=[];
  if(words>manifest.policy.handoffMaxWords)errors.push(`Handoff exceeds context budget: ${words}/${manifest.policy.handoffMaxWords} words`);
  return{valid:errors.length===0,words,limit:manifest.policy.handoffMaxWords,errors};
}
