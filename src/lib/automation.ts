import { existsSync } from 'node:fs';
import path from 'node:path';
import { initProject, resolveRepositoryRoot } from './project.js';
import { createTask, listTasks, findTask, loadTask, saveTask, setSection, getSection } from './task.js';
import { startRefinement, blockTask, resumeTask } from './workflow.js';
import { codeGraphStatus, prepareCodeGraph, type CodeGraphOptions } from './codegraph.js';
import type { CodeGraphState, TaskDocument, TaskInput } from './types.js';
import { fastModeActive } from './control-profile.js';
import { ensureRequestCapsule, requestWorkSummary } from './request-capsule.js';

function normalize(value: unknown): string { return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
export function ensureProject(root: string,options: {name?:string}={}): {created:boolean;config:ReturnType<typeof initProject>|null} {
  const projectRoot=resolveRepositoryRoot(root);
  if(!existsSync(path.join(projectRoot,'.ai','config.json'))) return{created:true,config:initProject(projectRoot,{name:options.name||path.basename(projectRoot)})};
  return{created:false,config:null};
}
function isCodeGraphBlock(task: TaskDocument): boolean {
  const reason=String(task.meta.block_reason||'');
  return task.meta.status==='blocked'&&(/codegraph/i.test(reason)||(/\.git\/info\/exclude/i.test(reason)&&/eperm|permission|denied/i.test(reason)));
}
export function ensureTaskCodeGraph(root: string,id: string,options: CodeGraphOptions={}): {task:TaskDocument;codegraph:ReturnType<typeof prepareCodeGraph>} {
  let task=loadTask(findTask(root,id));
  if(fastModeActive(task)){const current=codeGraphStatus(root);const codegraph:CodeGraphState=current.status==='ready'?current:{version:3,status:'pending',ok:true,action:'fast-mode-on-demand',projectRoot:path.resolve(root),lastCheckedAt:null,detail:'SpecRail Fast defers CodeGraph unless the task escalates beyond micro/light controls.'};return{task,codegraph:codegraph as ReturnType<typeof prepareCodeGraph>};}
  const result=prepareCodeGraph(root,options);
  if(result.ok){if(isCodeGraphBlock(task))task=resumeTask(root,id);return{task,codegraph:result};}
  if(!['done','rejected'].includes(task.meta.status)&&!isCodeGraphBlock(task)){if(task.meta.status==='draft')task=startRefinement(root,id);task=blockTask(root,id,`${result.action}: ${result.detail||'CodeGraph preflight failed'}`);}
  return{task,codegraph:result};
}
export interface IntakeInput extends TaskInput { projectName?:string }
export interface IntakeOptions { codegraph?:CodeGraphOptions; deferCodeGraph?:boolean; }
export interface IntakeResult { created:boolean; projectCreated:boolean; task:TaskDocument; codegraph:CodeGraphState; requestDigest:string|null; workCapsule:string; codegraphDeferred:boolean; }
export function intakeTask(root: string,input: IntakeInput,options: IntakeOptions={}): IntakeResult {
  const projectRoot=resolveRepositoryRoot(root);const project=ensureProject(projectRoot,input.projectName?{name:input.projectName}:{});
  const existing=listTasks(projectRoot).find(task=>!['done','rejected'].includes(task.meta.status)&&normalize(task.meta.title)===normalize(input.title));
  let task:TaskDocument,created=false;
  if(existing){
    task=existing;
    // Repair a legacy/title-only intake only from an explicit current request;
    // never overwrite an already captured Need.
    if(input.need&&!getSection(task.body,'Need').trim()){
      task.body=setSection(task.body,'Need',String(input.need));
      task=saveTask(task);
    }
  }else{created=true;task=createTask(projectRoot,input);task=startRefinement(projectRoot,task.meta.id);}
  const request=ensureRequestCapsule(projectRoot,task.meta.id);
  const workCapsule=request?requestWorkSummary(request,100):`${task.meta.id}: request not yet sealed`;
  if(options.deferCodeGraph){
    const current=codeGraphStatus(projectRoot);
    return{created,projectCreated:project.created,task,codegraph:current,requestDigest:request?.requestDigest??null,workCapsule,codegraphDeferred:current.status!=='ready'};
  }
  const prepared=ensureTaskCodeGraph(projectRoot,task.meta.id,options.codegraph||{});
  return{created,projectCreated:project.created,task:prepared.task,codegraph:prepared.codegraph,requestDigest:request?.requestDigest??null,workCapsule,codegraphDeferred:false};
}
