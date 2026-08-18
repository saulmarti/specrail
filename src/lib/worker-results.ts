import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadWorkerOrder, type WorkerOrder } from './worker-orders.js';
import type { IntelligenceUsageRecord } from './intelligence-metrics.js';

export type WorkerResultStatus='completed'|'escalated'|'failed';
export interface WorkerUsage { inputTokens:number; cachedInputTokens:number; outputTokens:number; cost?:number|null; }
export interface WorkerAttempt { model:string; code:number; attestation:string; effectiveModel:string; sessionId?:string|null; stderr:string; }
export interface WorkerResult {
  schemaVersion:2;
  transport:'isolated-process';
  orderId:string;
  taskId:string;
  host:'codex'|'pi';
  status:WorkerResultStatus;
  workerSessionId:string|null;
  requestedModel:string|null;
  effectiveModel:string|null;
  modelAttestation:string;
  modelAttested:boolean;
  brainModelFallbackUsed:false;
  usage:WorkerUsage|null;
  changedFiles:string[];
  orderTampered:boolean;
  forbiddenProductionChanges:string[];
  unexpectedScopeChanges:string[];
  protectedScopeChanges:string[];
  summary:string;
  attempts:WorkerAttempt[];
  startedFromOrderDigest:string;
  completedAt:string;
  elapsedMs:number|null;
  resultDigest:string;
}
function stable(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;const r=value as Record<string,unknown>;return`{${Object.keys(r).sort().map(k=>`${JSON.stringify(k)}:${stable(r[k])}`).join(',')}}`;}
function digest(value:unknown):string{return createHash('sha256').update(stable(value)).digest('hex');}
function resultPayload(result:WorkerResult){const{resultDigest:_ignored,...payload}=result;return payload;}
function nonNegativeInteger(value:unknown,label:string):number{const n=Number(value);if(!Number.isInteger(n)||n<0)throw new Error(`${label} must be a non-negative integer`);return n;}

export function validateWorkerResult(result:WorkerResult,order:WorkerOrder):WorkerResult{
  if(result.schemaVersion!==2||result.transport!=='isolated-process')throw new Error('Unsupported worker-result schema/transport');
  if(result.resultDigest!==digest(resultPayload(result)))throw new Error(`Worker-result integrity check failed for ${result.orderId}`);
  if(result.orderId!==order.id||result.taskId!==order.taskId||result.startedFromOrderDigest!==order.orderDigest)throw new Error('Worker result is not bound to the expected WorkerOrder');
  if(result.brainModelFallbackUsed!==false)throw new Error('Worker result used forbidden Brain-model fallback');
  if(result.orderTampered)throw new Error('Worker result reports WorkerOrder tampering');
  if(result.forbiddenProductionChanges.length||result.unexpectedScopeChanges.length||result.protectedScopeChanges.length){if(result.status!=='failed')throw new Error('Worker scope/mutation violations must fail the run');}
  if(result.status!=='failed'){
    if(!result.requestedModel||!result.effectiveModel||result.requestedModel!==result.effectiveModel||!result.modelAttested)throw new Error('Successful/escalated worker result requires exact model attestation');
    if(!order.requestedModels.includes(result.effectiveModel))throw new Error(`Worker used a model outside the sealed order: ${result.effectiveModel}`);
  }
  if(result.usage){const input=nonNegativeInteger(result.usage.inputTokens,'worker inputTokens'),cached=nonNegativeInteger(result.usage.cachedInputTokens,'worker cachedInputTokens'),output=nonNegativeInteger(result.usage.outputTokens,'worker outputTokens');if(cached>input)throw new Error('worker cached input tokens cannot exceed input tokens');result={...result,usage:{...result.usage,inputTokens:input,cachedInputTokens:cached,outputTokens:output}};}
  return result;
}

export function loadWorkerResult(resultFile:string,orderFile:string):{result:WorkerResult;order:WorkerOrder}{
  const order=loadWorkerOrder(path.resolve(orderFile));const result=JSON.parse(readFileSync(path.resolve(resultFile),'utf8')) as WorkerResult;return{result:validateWorkerResult(result,order),order};
}

export function workerUsageRecord(result:WorkerResult,order:WorkerOrder):IntelligenceUsageRecord|null{
  const valid=validateWorkerResult(result,order);if(!valid.usage||!valid.effectiveModel||valid.status==='failed')return null;
  return{source:'host-reported',owner:'worker',phase:order.phase,actor:order.actor,model:valid.effectiveModel,modelAttested:valid.modelAttested,modelAttestation:valid.modelAttestation,inputTokens:valid.usage.inputTokens,cachedInputTokens:valid.usage.cachedInputTokens,outputTokens:valid.usage.outputTokens};
}

export function compactWorkerResult(result:WorkerResult,maxWords=420):{status:WorkerResultStatus;model:string|null;changedFiles:string[];summary:string;elapsedMs:number|null}{
  const words=String(result.summary||'').trim().split(/\s+/).filter(Boolean);const summary=words.length<=maxWords?words.join(' '):`${words.slice(0,maxWords).join(' ')} …`;
  return{status:result.status,model:result.effectiveModel,changedFiles:[...result.changedFiles].slice(0,40),summary,elapsedMs:result.elapsedMs};
}
