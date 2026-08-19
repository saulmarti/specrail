import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { ensureRequestCapsule, requestWorkSummary } from '../dist/src/lib/request-capsule.js';
import { ensureWorkerOrder } from '../dist/src/lib/worker-orders.js';

function repo(){const root=mkdtempSync(path.join(tmpdir(),'specrail-brain-worker-fast-'));initProject(root,{name:'Fast'});return root;}
function specInput(){return{actor:'ai-flow-product-specifier',action:'continue',recommendedSkill:'ai-flow-product-specifier'};}

test('request capsule seals the original Need and stays immutable when specification sections change',()=>{
  const root=repo(),task=createTask(root,{title:'RiskAdapt changes',need:'Apply four requested UI changes without changing unrelated behavior.'});
  const first=ensureRequestCapsule(root,task.meta.id);assert.ok(first);assert.match(first.requestText,/four requested UI changes/);
  let current=loadTask(findTask(root,task.meta.id));current.body=setSection(current.body,'Need','A later materialized Need that must not replace original input.');saveTask(current);
  const again=ensureRequestCapsule(root,task.meta.id);assert.equal(again.requestDigest,first.requestDigest);assert.equal(again.requestText,first.requestText);
  assert.match(requestWorkSummary(again),/^TASK-\d{4}:/);
});

test('title-only task fails closed before a worker can reconstruct the missing user prompt',()=>{
  const root=repo(),task=createTask(root,{title:'Only a title'});
  assert.throws(()=>ensureWorkerOrder(root,task.meta.id,specInput()),/WORKER_INPUT_INCOMPLETE/);
});

test('Product Specifier order binds original request and is not invalidated by its own Scope or AC output',()=>{
  const root=repo(),task=createTask(root,{title:'RiskAdapt changes',need:'1. Fix actions breadcrumb. 2. Owner uses currentProfile. 3. Members sits by Documents. 4. Tags are read-only.'});
  const first=ensureWorkerOrder(root,task.meta.id,specInput());assert.ok(first);assert.match(first.order.request.text,/currentProfile/);assert.equal(first.order.kind,'spec-materialization');assert.equal(first.order.maxRuntimeMs,90_000);assert.ok(first.order.capsule.contextFiles.length<=6);assert.ok(first.order.capsule.contextSymbols.length<=12);
  let current=loadTask(findTask(root,task.meta.id));current.body=setSection(current.body,'Scope','Materialized bounded scope.');current.body=setSection(current.body,'Acceptance Criteria','AC-001 — observable behavior.');saveTask(current);
  const second=ensureWorkerOrder(root,task.meta.id,specInput());assert.ok(second);assert.equal(second.order.id,first.order.id);assert.equal(second.path,first.path);
});
