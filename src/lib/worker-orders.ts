import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, getSection, loadTask } from './task.js';
import { contextStatus } from './context.js';
import { scopeGuardStatus } from './scope-guard.js';
import { brainWorkerRecommendation, type BrainWorkerRecommendation, type WorkRoutingInput } from './brain-workers.js';

export interface WorkerOrder {
  schemaVersion: 2;
  id: string;
  taskId: string;
  phase: string;
  actor: string;
  action: string;
  recommendedSkill: string | null;
  kind: NonNullable<BrainWorkerRecommendation['worker']>['kind'];
  requestedModels: string[];
  reasoningEffort: 'low'|'medium';
  access: 'workspace-write';
  mutationAuthority: 'specrail-state-only'|'production-with-scope';
  cwd: string;
  authority: {
    specificationHash: string | null;
    qaMissionHash: string | null;
    scopeGuardHash: string | null;
    decisions: string;
  };
  capsule: {
    goal: string;
    scope: string;
    outOfScope: string;
    acceptanceCriteria: string;
    allowedFiles: string[];
    protectedFiles: string[];
    contextFiles: string[];
    contextSymbols: string[];
    stopIf: string[];
  };
  sourceDigest: string;
  createdAt: string;
  orderDigest: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function payload(order: Omit<WorkerOrder,'orderDigest'>|WorkerOrder) { const {orderDigest:_ignored,...rest}=order as WorkerOrder; return rest; }
function dir(root:string,taskId:string){return path.join(path.resolve(root),'.ai','runtime','workers',taskId);}
function fileFor(root:string,taskId:string,id:string){return path.join(dir(root,taskId),`${id}.json`);}
function atomicJson(file:string,value:unknown){mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`);renameSync(tmp,file);}
function bounded(value:string,maxWords:number){const parts=String(value||'').trim().split(/\s+/).filter(Boolean);return parts.length<=maxWords?parts.join(' '):`${parts.slice(0,maxWords).join(' ')} …`;}

export function validateWorkerOrder(order: WorkerOrder): void {
  if(order.schemaVersion!==2)throw new Error('Unsupported worker-order schema');
  if(!/^WO-[A-F0-9]{12}$/.test(order.id))throw new Error('Invalid worker-order id');
  if(!order.taskId||!order.actor||!order.action)throw new Error('Worker order is missing identity fields');
  if(!order.requestedModels.length)throw new Error('Worker order requires at least one explicit worker model');
  if(order.requestedModels.some(model=>!String(model).trim()))throw new Error('Worker order contains an empty model id');
  if(!['specrail-state-only','production-with-scope'].includes(order.mutationAuthority))throw new Error('Worker order has invalid mutation authority');
  if(order.mutationAuthority==='production-with-scope'&&!order.capsule.allowedFiles.length)throw new Error('Production worker order requires a sealed allowed-file scope');
  if(order.orderDigest!==digest(payload(order)))throw new Error(`Worker-order integrity check failed for ${order.id}`);
}

export function loadWorkerOrder(file:string):WorkerOrder{
  const order=JSON.parse(readFileSync(path.resolve(file),'utf8')) as WorkerOrder;validateWorkerOrder(order);return order;
}

export function ensureWorkerOrder(root:string,reference:string,input:WorkRoutingInput):{order:WorkerOrder;path:string;relativePath:string}|null{
  const projectRoot=path.resolve(root),task=loadTask(findTask(projectRoot,reference));
  const routing=brainWorkerRecommendation(task,input);if(routing.owner!=='worker'||!routing.worker)return null;
  const scope=scopeGuardStatus(projectRoot,task.meta.id),context=contextStatus(projectRoot,task.meta.id);
  const productionMutation=task.meta.phase==='builder';
  if(productionMutation&&(!scope.valid||!scope.sealed||!scope.sealIntegrityValid))throw new Error('Builder worker requires a valid sealed Scope Guard before production mutation');
  const workspace=task.meta.worktree_path&&existsSync(task.meta.worktree_path)?path.resolve(task.meta.worktree_path):projectRoot;
  const source={
    taskId:task.meta.id,phase:task.meta.phase,actor:input.actor,action:input.action,recommendedSkill:input.recommendedSkill??null,
    spec:task.meta.spec_effective_hash||task.meta.spec_approval_hash||null,qa:task.meta.qa_mission_hash||null,scopeHash:task.meta.scope_guard_hash||null,
    need:getSection(task.body,'Need'),scope:getSection(task.body,'Scope'),out:getSection(task.body,'Out of Scope'),acceptance:getSection(task.body,'Acceptance Criteria'),decisions:getSection(task.body,'Decisions'),
    allowed:scope.allowedFiles,protected:scope.protectedFiles,contextFiles:context.files,contextSymbols:context.symbols,worker:routing.worker,
    mutationAuthority:productionMutation?'production-with-scope':'specrail-state-only'
  };
  const sourceDigest=digest(source),id=`WO-${sourceDigest.slice(0,12).toUpperCase()}`;
  const base:Omit<WorkerOrder,'orderDigest'>={
    schemaVersion:2,id,taskId:task.meta.id,phase:task.meta.phase,actor:input.actor,action:input.action,recommendedSkill:input.recommendedSkill??null,
    kind:routing.worker.kind,requestedModels:[...routing.worker.preferredModels],reasoningEffort:routing.worker.reasoningEffort,
    access:'workspace-write',mutationAuthority:productionMutation?'production-with-scope':'specrail-state-only',cwd:workspace,
    authority:{specificationHash:task.meta.spec_effective_hash||task.meta.spec_approval_hash||null,qaMissionHash:task.meta.qa_mission_hash||null,scopeGuardHash:task.meta.scope_guard_hash||null,decisions:bounded(getSection(task.body,'Decisions'),220)},
    capsule:{goal:bounded(getSection(task.body,'Need')||task.meta.title,180),scope:bounded(getSection(task.body,'Scope'),220),outOfScope:bounded(getSection(task.body,'Out of Scope'),160),acceptanceCriteria:bounded(getSection(task.body,'Acceptance Criteria'),360),allowedFiles:[...scope.allowedFiles].slice(0,40),protectedFiles:[...scope.protectedFiles].slice(0,30),contextFiles:[...context.files].slice(0,24),contextSymbols:[...context.symbols].slice(0,40),stopIf:[...routing.worker.stopIf]},
    sourceDigest,createdAt:new Date().toISOString()
  };
  const order:WorkerOrder={...base,orderDigest:digest(base)};const file=fileFor(projectRoot,task.meta.id,id);
  if(existsSync(file)){const existing=loadWorkerOrder(file);if(existing.sourceDigest===sourceDigest)return{order:existing,path:file,relativePath:path.relative(projectRoot,file).split(path.sep).join('/')};}
  atomicJson(file,order);return{order,path:file,relativePath:path.relative(projectRoot,file).split(path.sep).join('/')};
}
