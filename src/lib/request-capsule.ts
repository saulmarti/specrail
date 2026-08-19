import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, getSection, loadTask } from './task.js';

export interface RequestCapsule {
  schemaVersion: 1;
  taskId: string;
  source: 'task-need';
  requestText: string;
  createdAt: string;
  requestDigest: string;
}

function stable(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  const record=value as Record<string,unknown>;
  return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value:unknown):string{return createHash('sha256').update(stable(value)).digest('hex');}
function payload(capsule:Omit<RequestCapsule,'requestDigest'>|RequestCapsule){const{requestDigest:_ignored,...rest}=capsule as RequestCapsule;return rest;}
function capsulePath(root:string,taskId:string){return path.join(path.resolve(root),'.ai','runtime','requests',`${taskId}.json`);}
function atomicJson(file:string,value:unknown){mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`);renameSync(tmp,file);}
function words(value:string){return String(value||'').trim().split(/\s+/).filter(Boolean);}

export function validateRequestCapsule(capsule:RequestCapsule):RequestCapsule{
  if(capsule.schemaVersion!==1||!/^TASK-\d{4,}$/.test(capsule.taskId))throw new Error('Unsupported request-capsule schema or task id');
  if(capsule.source!=='task-need'||!capsule.requestText.trim())throw new Error('Request capsule has no original request text');
  if(capsule.requestDigest!==digest(payload(capsule)))throw new Error(`Request-capsule integrity check failed for ${capsule.taskId}`);
  return capsule;
}

export function loadRequestCapsule(root:string,reference:string):RequestCapsule|null{
  const task=loadTask(findTask(root,reference)),file=capsulePath(root,task.meta.id);
  if(!existsSync(file))return null;
  return validateRequestCapsule(JSON.parse(readFileSync(file,'utf8')) as RequestCapsule);
}

/**
 * Seals the first explicit Need as immutable worker input. Later specification
 * materialization may rewrite governed sections, but it can never rewrite the
 * original request that justified the work.
 */
export function ensureRequestCapsule(root:string,reference:string):RequestCapsule|null{
  const task=loadTask(findTask(root,reference)),file=capsulePath(root,task.meta.id);
  if(existsSync(file))return validateRequestCapsule(JSON.parse(readFileSync(file,'utf8')) as RequestCapsule);
  const requestText=getSection(task.body,'Need').trim();
  if(!requestText)return null;
  const base:Omit<RequestCapsule,'requestDigest'>={schemaVersion:1,taskId:task.meta.id,source:'task-need',requestText,createdAt:new Date().toISOString()};
  const capsule:RequestCapsule={...base,requestDigest:digest(base)};atomicJson(file,capsule);return capsule;
}

export function requireRequestCapsule(root:string,reference:string):RequestCapsule{
  const capsule=ensureRequestCapsule(root,reference);
  if(!capsule)throw new Error('WORKER_INPUT_INCOMPLETE: the task has no sealed original request. Preserve the active user request in Need before launching a Worker; Brain must not materialize the missing specification itself.');
  return capsule;
}

export function requestWorkSummary(capsule:RequestCapsule,maxWords=100):string{
  const all=words(capsule.requestText),summary=all.length<=maxWords?all.join(' '):`${all.slice(0,maxWords).join(' ')} …`;
  return `${capsule.taskId}: ${summary}`;
}
