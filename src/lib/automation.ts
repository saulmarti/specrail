import { existsSync } from 'node:fs';
import path from 'node:path';
import { initProject, resolveRepositoryRoot } from './project.js';
import { createTask, listTasks, findTask, loadTask } from './task.js';
import { startRefinement, blockTask, resumeTask } from './workflow.js';
import { prepareCodeGraph, type CodeGraphOptions } from './codegraph.js';
import type { TaskDocument, TaskInput } from './types.js';

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
  const result=prepareCodeGraph(root,options);let task=loadTask(findTask(root,id));
  if(result.ok){if(isCodeGraphBlock(task))task=resumeTask(root,id);return{task,codegraph:result};}
  if(!['done','rejected'].includes(task.meta.status)&&!isCodeGraphBlock(task)){if(task.meta.status==='draft')task=startRefinement(root,id);task=blockTask(root,id,`${result.action}: ${result.detail||'CodeGraph preflight failed'}`);}
  return{task,codegraph:result};
}
export interface IntakeInput extends TaskInput { projectName?:string }
export function intakeTask(root: string,input: IntakeInput,options: {codegraph?:CodeGraphOptions}={}): {created:boolean;projectCreated:boolean;task:TaskDocument;codegraph:ReturnType<typeof prepareCodeGraph>} {
  const projectRoot=resolveRepositoryRoot(root);const project=ensureProject(projectRoot,input.projectName?{name:input.projectName}:{});
  const existing=listTasks(projectRoot).find(task=>!['done','rejected'].includes(task.meta.status)&&normalize(task.meta.title)===normalize(input.title));
  let task:TaskDocument,created=false;
  if(existing)task=existing;else{created=true;task=createTask(projectRoot,input);task=startRefinement(projectRoot,task.meta.id);}
  const prepared=ensureTaskCodeGraph(projectRoot,task.meta.id,options.codegraph||{});
  return{created,projectCreated:project.created,task:prepared.task,codegraph:prepared.codegraph};
}
