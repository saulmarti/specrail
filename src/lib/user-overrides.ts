import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask } from './task.js';
import { USER_OVERRIDE_TARGETS, isWaivableWorkflowGate, type UserWaivableWorkflowGateId } from './workflow-gates.js';

export { USER_OVERRIDE_TARGETS };
export type UserOverrideTarget = UserWaivableWorkflowGateId;
export type UserOverrideKind = 'waive' | 'close';

export interface UserGovernanceOverride {
  schemaVersion: 1;
  id: string;
  taskId: string;
  kind: UserOverrideKind;
  target: UserOverrideTarget | 'task';
  reason: string;
  actor: 'user';
  taskStatus: string;
  taskPhase: string;
  createdAt: string;
  digest: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function hash(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function base(root: string, id: string): string { return path.join(path.resolve(root), '.ai', 'overrides', id); }
function recordPath(root: string, id: string, overrideId: string): string { return path.join(base(root, id), `${overrideId}.json`); }
function immutable(item: Omit<UserGovernanceOverride, 'digest'> | UserGovernanceOverride) {
  return { schemaVersion:item.schemaVersion,id:item.id,taskId:item.taskId,kind:item.kind,target:item.target,reason:item.reason,actor:item.actor,taskStatus:item.taskStatus,taskPhase:item.taskPhase,createdAt:item.createdAt };
}
function validate(item: UserGovernanceOverride): void {
  if (item.schemaVersion !== 1 || item.actor !== 'user' || !item.id || !item.taskId || !item.reason.trim()) throw new Error(`Invalid user governance override: ${item.id || 'unknown'}`);
  if (hash(immutable(item)) !== item.digest) throw new Error(`User governance override integrity check failed: ${item.id}`);
}
export function listUserOverrides(root: string, id: string): UserGovernanceOverride[] {
  const dir=base(root,id); if(!existsSync(dir)) return [];
  return readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>{
    const item=JSON.parse(readFileSync(path.join(dir,name),'utf8')) as UserGovernanceOverride; validate(item); return item;
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
function nextId(root:string,id:string):string{return `OVR-${String(listUserOverrides(root,id).length+1).padStart(3,'0')}`;}
export function assertExplicitUserAuthorization(options: Record<string, unknown> = {}): void {
  if(options.userAuthorized !== true) throw new Error('User governance override requires explicit current-turn user authorization');
}
export function recordUserOverride(root:string,id:string,input:{kind:UserOverrideKind;target:UserOverrideTarget|'task';reason:string},options:Record<string,unknown>={}):UserGovernanceOverride{
  assertExplicitUserAuthorization(options);
  const task=loadTask(findTask(root,id)); const reason=String(input.reason||'').trim(); if(!reason)throw new Error('User governance override reason is required');
  if(input.target!=='task'&&!isWaivableWorkflowGate(input.target))throw new Error(`Unsupported user governance override target: ${input.target}`);
  const itemWithoutDigest:Omit<UserGovernanceOverride,'digest'>={schemaVersion:1,id:nextId(root,task.meta.id),taskId:task.meta.id,kind:input.kind,target:input.target,reason,actor:'user',taskStatus:task.meta.status,taskPhase:task.meta.phase,createdAt:new Date().toISOString()};
  const item:UserGovernanceOverride={...itemWithoutDigest,digest:hash(itemWithoutDigest)}; mkdirSync(base(root,task.meta.id),{recursive:true}); writeFileSync(recordPath(root,task.meta.id,item.id),`${JSON.stringify(item,null,2)}\n`); return item;
}
export function hasUserWaiver(root:string,id:string,target:UserOverrideTarget):boolean{return listUserOverrides(root,id).some(item=>item.kind==='waive'&&item.target===target);}
export function hasUserCloseOverride(root:string,id:string):boolean{return listUserOverrides(root,id).some(item=>item.kind==='close'&&item.target==='task');}
export function latestUserOverride(root:string,id:string,target?:UserOverrideTarget|'task'):UserGovernanceOverride|null{
  const items=listUserOverrides(root,id).filter(item=>target===undefined||item.target===target); return items.length?items[items.length-1]!:null;
}
