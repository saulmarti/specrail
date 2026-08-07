import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getSection } from './task.js';
import { applicableActiveEvals } from './failures.js';
import { qualityPolicy } from './quality.js';
import { operationalPolicy } from './observability.js';
import type { JsonValue, TaskDocument, TraceContext, TraceEvent, TraceValidation } from './types.js';

function file(root:string,id:string){return path.join(path.resolve(root),'.ai','runtime','traces',`${id}.jsonl`);}
function stable(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  const object=value as Record<string,unknown>;
  return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}
function digest(value:unknown):string{return createHash('sha256').update(stable(value)).digest('hex');}
function defaultActor(phase:string):string{
  const map:Record<string,string>={
    'product-specifier':'product-specifier','ux-ui-designer':'ux-ui-designer','technical-architecture':'technical-reviewer',
    'spec-approval':'orchestrator','builder':'builder','technical-reviewer':'technical-reviewer','qa-engineer':'qa-engineer',
    'final-customer':'final-customer','final-approval':'orchestrator','delivery':'orchestrator','done':'orchestrator'
  };
  return map[phase]||'orchestrator';
}
function defaultSkills(actor:string):string[]{
  const map:Record<string,string>={
    'orchestrator':'ai-flow','product-specifier':'ai-flow-product-specifier','ux-ui-designer':'ai-flow-ux-ui-designer',
    'builder':'ai-flow-builder','technical-reviewer':'ai-flow-technical-reviewer','qa-engineer':'ai-flow-qa-engineer','final-customer':'ai-flow-final-customer'
  };
  return map[actor]?[map[actor]!]:[];
}
function snapshots(root:string,task:TaskDocument,context:TraceContext={}){
  const acceptance=getSection(task.body,'Acceptance Criteria').trim();
  const activeEvals=applicableActiveEvals(root,{phase:task.meta.phase,surfaces:task.meta.surfaces}).map(item=>item.id).sort();
  const quality=qualityPolicy(task),operations=operationalPolicy(task);
  const tasksetBase={
    specificationHash:task.meta.spec_approval_hash||null,
    qaMissionHash:task.meta.qa_mission_hash||null,
    acceptanceHash:acceptance?digest(acceptance):null,
    routeHash:digest(task.meta.route),
    surfaces:[...task.meta.surfaces].sort(),
    activeEvalIds:activeEvals,
    verification:{quality,operations}
  };
  const actor=context.actor||defaultActor(task.meta.phase);
  const harnessBase={
    name:'specrail' as const,
    actor,
    phase:task.meta.phase,
    executionProfile:task.meta.execution_profile,
    codegraph:'mcp' as const,
    skills:[...(context.skills||defaultSkills(actor))].sort(),
    tools:[...(context.tools||['specrail-cli','codegraph-mcp'])].sort()
  };
  const runtimeBase={
    kind:(task.meta.worktree_path?'worktree':'local') as 'local'|'worktree',
    repositoryRoot:path.resolve(root),
    workspacePath:task.meta.worktree_path||path.resolve(root),
    branch:task.meta.worktree_branch||null,
    platform:process.platform,
    architecture:process.arch,
    nodeVersion:process.version
  };
  return{
    taskset:{...tasksetBase,digest:digest(tasksetBase)},
    harness:{...harnessBase,digest:digest(harnessBase)},
    runtime:{...runtimeBase,digest:digest(runtimeBase)}
  };
}
function eventDigest(event:Omit<TraceEvent,'eventHash'>):string{return digest(event);}
function normalizeContext(input:string|TraceContext|null|undefined):TraceContext{
  if(typeof input==='string')return{sessionId:input};
  return input||{};
}

export function recordTrace(root:string,task:TaskDocument,event:string,data:Record<string,JsonValue>={},input:string|TraceContext|null=null):TraceEvent{
  const context=normalizeContext(input),existing=listTrace(root,task.meta.id),eventId=`TRACE-${randomUUID()}`;
  const sessionId=context.sessionId||null;
  const branchId=context.branchId|| (sessionId?createHash('sha256').update(`${task.meta.id}|${sessionId}`).digest('hex').slice(0,16):'main');
  const sameBranch=[...existing].reverse().find(item=>item.branchId===branchId)??null;
  const explicitParent=context.parentEventId?existing.find(item=>item.eventId===context.parentEventId)??null:null;
  if(context.parentEventId&&!explicitParent)throw new Error(`Trace parent not found: ${context.parentEventId}`);
  const branchPoint=explicitParent??sameBranch??existing.at(-1)??null;
  const snap=snapshots(root,task,context);
  const withoutHash:Omit<TraceEvent,'eventHash'>={
    schemaVersion:3,eventId,parentEventId:branchPoint?.eventId??null,parentHash:branchPoint?.eventHash??null,branchId,taskId:task.meta.id,
    event,phase:task.meta.phase,status:task.meta.status,at:new Date().toISOString(),sessionId,
    taskset:snap.taskset,harness:snap.harness,runtime:snap.runtime,data
  };
  const item:TraceEvent={...withoutHash,eventHash:eventDigest(withoutHash)};
  const target=file(root,task.meta.id);mkdirSync(path.dirname(target),{recursive:true});appendFileSync(target,`${JSON.stringify(item)}\n`);return item;
}

function migrateLegacy(raw:Record<string,unknown>,id:string,index:number,parent:TraceEvent|null):TraceEvent{
  const eventId=typeof raw.eventId==='string'?raw.eventId:`TRACE-LEGACY-${createHash('sha256').update(`${id}|${index}|${stable(raw)}`).digest('hex').slice(0,24)}`;
  const oldTaskset=(raw.taskset&&typeof raw.taskset==='object'?raw.taskset:{}) as Record<string,unknown>;
  const oldHarness=(raw.harness&&typeof raw.harness==='object'?raw.harness:{}) as Record<string,unknown>;
  const oldRuntime=(raw.runtime&&typeof raw.runtime==='object'?raw.runtime:{}) as Record<string,unknown>;
  const tasksetBase={
    specificationHash:typeof oldTaskset.specificationHash==='string'?oldTaskset.specificationHash:null,
    qaMissionHash:typeof oldTaskset.qaMissionHash==='string'?oldTaskset.qaMissionHash:null,
    acceptanceHash:null,routeHash:null,surfaces:[],activeEvalIds:[],verification:{quality:null,operations:null}
  };
  const harnessBase={name:'specrail' as const,actor:'legacy',phase:String(raw.phase||''),executionProfile:'legacy',codegraph:'mcp' as const,skills:Array.isArray(oldHarness.skills)?oldHarness.skills.map(String):[],tools:['specrail-cli','codegraph-mcp']};
  const runtimeBase={kind:oldRuntime.kind==='worktree'?'worktree' as const:'local' as const,repositoryRoot:'unknown',workspacePath:typeof oldRuntime.path==='string'?oldRuntime.path:'unknown',branch:null,platform:'unknown',architecture:'unknown',nodeVersion:'unknown'};
  const withoutHash:Omit<TraceEvent,'eventHash'>={
    schemaVersion:3,eventId,parentEventId:typeof raw.parentEventId==='string'?raw.parentEventId:parent?.eventId??null,parentHash:parent?.eventHash??null,
    branchId:typeof raw.branchId==='string'?raw.branchId:'legacy-main',taskId:id,event:String(raw.event||'legacy-event'),phase:String(raw.phase||''),status:String(raw.status||''),at:String(raw.at||new Date(0).toISOString()),sessionId:typeof raw.sessionId==='string'?raw.sessionId:null,
    taskset:{...tasksetBase,digest:digest(tasksetBase)},harness:{...harnessBase,digest:digest(harnessBase)},runtime:{...runtimeBase,digest:digest(runtimeBase)},
    data:{...(raw.data&&typeof raw.data==='object'&&!Array.isArray(raw.data)?raw.data as Record<string,JsonValue>:{}),migratedFromSchema:Number(raw.schemaVersion||1)}
  };
  return{...withoutHash,eventHash:eventDigest(withoutHash)};
}

export function listTrace(root:string,id:string):TraceEvent[]{
  const target=file(root,id);if(!existsSync(target))return[];const output:TraceEvent[]=[];
  for(const [index,line] of readFileSync(target,'utf8').split('\n').filter(Boolean).entries()){
    const raw=JSON.parse(line) as Record<string,unknown>;
    if(raw.schemaVersion===3&&typeof raw.eventId==='string'&&typeof raw.eventHash==='string')output.push(raw as unknown as TraceEvent);
    else output.push(migrateLegacy(raw,id,index,output.at(-1)??null));
  }
  return output;
}

export function validateTrace(root:string,id:string):TraceValidation{
  const events=listTrace(root,id),errors:string[]=[],byId=new Map<string,TraceEvent>();
  for(const event of events){
    if(byId.has(event.eventId)){errors.push(`Duplicate trace event ${event.eventId}`);continue;}
    if(event.parentEventId){const parent=byId.get(event.parentEventId);if(!parent)errors.push(`Trace parent ${event.parentEventId} must appear before ${event.eventId}`);else if(event.parentHash!==parent.eventHash)errors.push(`Trace parent hash mismatch for ${event.eventId}`);}
    const {eventHash,...withoutHash}=event;if(eventDigest(withoutHash)!==eventHash)errors.push(`Trace event hash mismatch for ${event.eventId}`);
    const {digest:tasksetDigest,...taskset}=event.taskset;if(digest(taskset)!==tasksetDigest)errors.push(`Taskset digest mismatch for ${event.eventId}`);
    const {digest:harnessDigest,...harness}=event.harness;if(digest(harness)!==harnessDigest)errors.push(`Harness digest mismatch for ${event.eventId}`);
    const {digest:runtimeDigest,...runtime}=event.runtime;if(digest(runtime)!==runtimeDigest)errors.push(`Runtime digest mismatch for ${event.eventId}`);
    byId.set(event.eventId,event);
  }
  return{valid:errors.length===0,taskId:id,eventCount:events.length,branchCount:new Set(events.map(item=>item.branchId)).size,errors};
}
