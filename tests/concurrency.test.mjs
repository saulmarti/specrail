// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { initProject } from '../dist/src/lib/project.js';
import { addDependency, createSubtask, createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { approveSpecification, blockTask, completePhase, resolveTargetAudienceDecision, resumeTask, routeTargetAudienceRevision, startRefinement } from '../dist/src/lib/workflow.js';
import { assertConcurrencyMutationAuthority, assertConcurrencyReservation, cancelConcurrencyPlan, createConcurrencyPlan, concurrencyStatus, heartbeatConcurrencyLane, nextConcurrencyWave, prepareConcurrencyWave, releaseConcurrencyLane } from '../dist/src/lib/concurrency.js';
import { decideProductOwnerReview, recordFinalProductOwnerReview, recordProductOwnerReview, recordTargetAudienceReview } from '../dist/src/lib/product-intelligence.js';
import { nextAction } from '../dist/src/lib/next.js';
import { addQuestion, answerQuestion } from '../dist/src/lib/questions.js';
import { requestContextExpansion } from '../dist/src/lib/context.js';
import { proposeAmendment } from '../dist/src/lib/amendments.js';
import { choosePhaseBoundary, enterPhaseBoundary } from '../dist/src/lib/phase-boundary.js';
import { runtimeRecommendation } from '../dist/src/lib/phase-handoff.js';
import { acquireTaskLease, leaseStatus, releaseTaskLease } from '../dist/src/lib/lease.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
import { setAutonomyPolicy } from '../dist/src/lib/autonomy-policy.js';
import { advanceAutonomy } from '../dist/src/lib/autonomy.js';
import { getHostCapabilityStatus, recordHostCapabilities, resetHostCapabilities } from '../dist/src/lib/host-capabilities.js';

function tempRoot(prefix='specrail-concurrency-') { return mkdtempSync(path.join(tmpdir(), prefix)); }

const PARALLEL_HOST_SESSION='TEST-PARALLEL-HOST';
function prepareWave(root,ref){
  recordHostCapabilities(root,{sessionId:PARALLEL_HOST_SESSION,host:'node-test-host',subagentSpawn:true,parallelSubagents:true,attestation:'Node test harness explicitly launches independent lane workers in parallel fixtures.'});
  return prepareConcurrencyWave(root,ref,{hostSessionId:PARALLEL_HOST_SESSION});
}
function enterPreparedAudienceBoundary(root,id,sessionId){
  const task=loadTask(findTask(root,id));
  if(!task.meta.target_audience_origin_session_id){
    task.meta.target_audience_origin_session_id=`QA-ORIGIN-${task.meta.id}`;
    saveTask(task);
  }
  const runtime=runtimeRecommendation(root,id,{sessionId:String(task.meta.target_audience_origin_session_id)});
  return enterPhaseBoundary(root,id,{sessionId,handoffDigest:runtime.handoffDigest,handoffContentDigest:runtime.handoffContentDigest,handoffWords:runtime.handoffWords});
}
function acknowledgeParentProductOwner(root,id){
  const parent=loadTask(findTask(root,id));
  parent.body=setSection(parent.body,'Need','Coordinate bounded child work that serves the documented product outcome.');
  saveTask(parent);
  recordProductOwnerReview(root,id,{verdict:'build',summary:'The parent coordinates bounded child delivery that directly serves the documented product workflow.',value:'The grouped work creates a coherent useful outcome without introducing an unrelated product concept.'});
  decideProductOwnerReview(root,id,'proceed','Acknowledge parent Product Owner review before child concurrency dispatch.');
}
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}
function gitRoot(){
  const root=tempRoot('specrail-concurrency-git-');
  git(root,['init','-b','main']);
  git(root,['config','user.email','test@example.test']);
  git(root,['config','user.name','Test']);
  writeFileSync(path.join(root,'README.md'),'seed\n');
  git(root,['add','.']); git(root,['commit','-m','seed']);
  initProject(root); readyProjectContext(root);
  return root;
}
function approveBackend(root,id,allowedFiles){
  startRefinement(root,id);
  const task=loadTask(findTask(root,id));
  task.body=setSection(task.body,'Need',`Deliver ${id} independently.`);
  task.body=setSection(task.body,'Product Value','Allow independent delivery without broad repository changes.');
  task.body=setSection(task.body,'Scope','Implement only the bounded backend behavior.');
  task.body=setSection(task.body,'Out of Scope','Unrelated refactors and cross-task changes.');
  task.body=setSection(task.body,'Acceptance Criteria','- The bounded behavior is externally observable\n- Existing unrelated behavior remains unchanged');
  saveTask(task);
  setDefaultBlastRadius(root,id,allowedFiles);
  completePhase(root,id);
  approveSpecification(root,id,'Concurrency fixture approval');
  const approved=loadTask(findTask(root,id));
  assert.equal(approved.meta.phase,'builder');
  assert.equal(approved.meta.status,'ready');
}

test('Multi-Agent Concurrency plans dependency-aware task-local waves and next routes a blocked parent to the scheduler',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Parent feature',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Slice A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Slice B',type:'task',surfaces:['backend']});
  const c=createSubtask(root,parent.meta.id,{title:'Slice C',type:'task',surfaces:['backend']});
  addDependency(root,b.meta.id,a.meta.id);
  const plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:3});
  assert.equal(plan.lanes.every(lane=>lane.access==='task-local'),true);
  assert.deepEqual(plan.waves[0].taskIds.sort(),[a.meta.id,c.meta.id].sort());
  assert.deepEqual(plan.waves[1].taskIds,[b.meta.id]);
  const next=nextAction(root,parent.meta.id);
  assert.equal(next.action,'prepare-concurrency-wave');
  assert.equal(next.actor,'ai-flow-multi-agent');
  assert.equal(next.recommendedSkill,'ai-flow-multi-agent');
  assert.equal(next.concurrency.runnableCount,2);
});

test('lane reservations make wave preparation idempotent until a lane progresses or is released',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Reserved parent',type:'task',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Reserved A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Reserved B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const first=prepareWave(root,parent.meta.id);
  assert.equal(first.lanes.length,2);
  assert.equal(first.lanes.every(lane=>lane.state==='reserved'&&lane.sessionId?.startsWith(`CONC-${parent.meta.id}:`)),true);
  const second=prepareWave(root,parent.meta.id);
  assert.equal(second.lanes.length,0);
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.filter(lane=>lane.state==='reserved').length,2);
  const firstSession=first.lanes.find(lane=>lane.taskId===a.meta.id).sessionId;
  releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:firstSession});
  const third=nextConcurrencyWave(root,parent.meta.id);
  assert.equal(third.lanes.length,1);
  assert.equal(third.lanes[0].taskId,a.meta.id);
  const rePrepared=prepareWave(root,parent.meta.id);
  assert.equal(rePrepared.lanes.length,1);
  assert.equal(rePrepared.lanes[0].taskId,a.meta.id);
  assert.notEqual(rePrepared.lanes[0].sessionId,firstSession);
});

test('parallel Builder lanes require sealed bounded scope and serialize possible write conflicts',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Write parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Writer A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Writer B',type:'task',surfaces:['backend']});
  approveBackend(root,a.meta.id,['src/shared.ts']);
  approveBackend(root,b.meta.id,['src/shared.ts']);
  const conflicting=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  assert.equal(conflicting.lanes.every(lane=>lane.access==='isolated-write'),true);
  assert.deepEqual(conflicting.lanes[0].conflictsWith,[conflicting.lanes[1].taskId]);
  assert.equal(nextConcurrencyWave(root,parent.meta.id).lanes.length,1);

  // Approved scope is immutable; use a fresh independent task for the non-overlap case.
  const c=createSubtask(root,parent.meta.id,{title:'Writer C',type:'task',surfaces:['backend']});
  approveBackend(root,c.meta.id,['src/c.ts']);
  const independent=createConcurrencyPlan(root,parent.meta.id,{taskIds:[a.meta.id,c.meta.id],maxParallel:2});
  assert.equal(independent.lanes.every(lane=>lane.conflictsWith.length===0),true);
  assert.equal(nextConcurrencyWave(root,parent.meta.id).lanes.length,2);
});

test('preparing independent write lanes creates separate worktrees and reservation-specific lane sessions',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Parallel write parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'API slice',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Worker slice',type:'task',surfaces:['backend']});
  approveBackend(root,a.meta.id,['src/api/**']);
  approveBackend(root,b.meta.id,['src/worker/**']);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  assert.equal(prepared.lanes.length,2);
  assert.notEqual(prepared.lanes[0].worktreePath,prepared.lanes[1].worktreePath);
  for(const lane of prepared.lanes){
    assert.equal(lane.state,'reserved');
    assert.ok(lane.sessionId);
    assert.ok(lane.worktreePath && existsSync(lane.worktreePath));
    assert.ok(lane.worktreeBranch?.startsWith('ai-flow/'));
  }
  assert.equal(path.resolve(prepared.controlRoot),path.resolve(root));
});


test('prepare rolls back a worktree and lease when a later lane fails before the wave is committed',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Transactional prepare parent',type:'feature',surfaces:['backend']});
  const writer=createSubtask(root,parent.meta.id,{title:'Transactional writer',type:'task',surfaces:['backend']});
  const blocked=createSubtask(root,parent.meta.id,{title:'Conflicting lease lane',type:'task',surfaces:['backend']});
  approveBackend(root,writer.meta.id,['src/transactional/**']);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  acquireTaskLease(root,blocked.meta.id,{sessionId:'foreign-owner',phase:'product-specifier'});
  assert.throws(()=>prepareWave(root,parent.meta.id),/locked by another session/i);
  const writerTask=loadTask(findTask(root,writer.meta.id));
  assert.equal(writerTask.meta.worktree_path,null);
  assert.equal(writerTask.meta.worktree_branch,null);
  assert.equal(writerTask.meta.delivery_status,'not_required');
  assert.equal(existsSync(path.join(root,'.ai-flow-worktrees',writer.meta.id)),false);
  assert.equal(leaseStatus(root,writer.meta.id).active,false);
  const status=concurrencyStatus(root,parent.meta.id);
  assert.equal(Object.keys(status.reservations).length,0);
});

test('Concurrency never bypasses a parent Product Owner gate even when child lanes are runnable',()=>{
  const root=tempRoot(); initProject(root);
  // Make project context/codegraph usable without disabling Product Intelligence.
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const docs={
    'product.md':'# Product\n\nA product with explicit user value and bounded priorities.',
    'product-owner.md':'# Product Owner\n\nProtect product value and require explicit consequential decisions.',
    'users.md':'# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows.',
    'architecture.md':'# Architecture\n\nRepository boundaries are discovered through CodeGraph.',
    'runbook.md':'# Runbook\n\nUse repository build, test, validation, and runtime inspection commands before governed delivery work.'
  };
  for(const [name,content] of Object.entries(docs)) writeFileSync(path.join(root,'.ai','project',name),`${content}\n`);
  // Reuse the helper only for deterministic CodeGraph readiness, then restore Product Intelligence and product docs it may normalize.
  readyProjectContext(root);
  for(const [name,content] of Object.entries(docs)) writeFileSync(path.join(root,'.ai','project',name),`${content}\n`);
  const restored=JSON.parse(readFileSync(configPath,'utf8'));
  restored.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true};
  writeFileSync(configPath,`${JSON.stringify(restored,null,2)}\n`);
  const parent=createTask(root,{title:'Product-gated parent',type:'feature',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Lane one',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Lane two',type:'task',surfaces:['backend']});
  const next=nextAction(root,parent.meta.id);
  assert.equal(next.concurrency.applicable,true);
  assert.equal(next.concurrency.runnableCount,2);
  assert.equal(next.action,'product-owner-review');
  assert.equal(next.actor,'ai-flow-product-owner');
  assert.equal(next.recommendedSkill,'ai-flow-product-owner');
  assert.throws(()=>prepareWave(root,parent.meta.id),/requires a current Product Owner review/i);
});

test('Concurrency lanes wait on every unfinished dependency including external and rejected dependencies',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Dependency parent',type:'task',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Lane A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Lane B',type:'task',surfaces:['backend']});
  const external=createTask(root,{title:'External prerequisite',type:'task',surfaces:['backend']});
  addDependency(root,a.meta.id,external.meta.id);
  let plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  let lane=plan.lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(lane.state,'waiting');
  assert.deepEqual(lane.blockedBy,[external.meta.id]);
  const rejected=loadTask(findTask(root,external.meta.id)); rejected.meta.status='rejected'; rejected.meta.phase='done'; saveTask(rejected);
  plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  lane=plan.lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(lane.state,'waiting');
  assert.deepEqual(lane.blockedBy,[external.meta.id]);
  const done=loadTask(findTask(root,external.meta.id)); done.meta.status='done'; done.meta.phase='done'; saveTask(done);
  plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  assert.equal(plan.lanes.find(item=>item.taskId===a.meta.id).state,'ready');
  assert.equal(plan.lanes.find(item=>item.taskId===b.meta.id).state,'ready');
});

test('Concurrency enforces subagents.maxDepth for nested parent plans',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const top=createTask(root,{title:'Top epic',type:'feature',surfaces:['backend']});
  const nested=createSubtask(root,top.meta.id,{title:'Nested epic',type:'feature',surfaces:['backend']});
  createSubtask(root,nested.meta.id,{title:'Nested A',type:'task',surfaces:['backend']});
  createSubtask(root,nested.meta.id,{title:'Nested B',type:'task',surfaces:['backend']});
  assert.throws(()=>createConcurrencyPlan(root,nested.meta.id),/exceeds project subagents\.maxDepth 1/i);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8')); config.subagents.maxDepth=2; writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  assert.equal(createConcurrencyPlan(root,nested.meta.id).lanes.length,2);
});

test('parallel Builder scheduling requires a currently valid Scope Guard, not merely a historical seal',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Guarded writers',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Guarded A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Guarded B',type:'task',surfaces:['backend']});
  approveBackend(root,a.meta.id,['src/a.ts']);
  approveBackend(root,b.meta.id,['src/b.ts']);
  const radiusPath=path.join(root,'.ai','scope',`${a.meta.id}.json`);
  const radius=JSON.parse(readFileSync(radiusPath,'utf8')); radius.reason='tampered after approval'; writeFileSync(radiusPath,`${JSON.stringify(radius,null,2)}\n`);
  const plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const lane=plan.lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(lane.access,'blocked-write');
  assert.equal(lane.state,'blocked');
  assert.deepEqual(lane.blockedBy,['approved-bounded-scope-required-before-parallel-write']);
});

test('Concurrency treats project maxParallel as a hard ceiling and canonicalizes task references',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8')); config.subagents.maxParallel=2; writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const parent=createTask(root,{title:'Canonical parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Canonical lane A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Canonical lane B',type:'task',surfaces:['backend']});
  const plan=createConcurrencyPlan(root,parent.meta.id,{taskIds:[a.meta.id,a.meta.title,b.meta.title],maxParallel:10});
  assert.equal(plan.maxParallel,2);
  assert.deepEqual(plan.taskIds,[a.meta.id,b.meta.id]);
  config.subagents.maxParallel=1; writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  assert.equal(concurrencyStatus(root,parent.meta.id).maxParallel,1);
});

test('Concurrency plan integrity rejects persisted scheduling tampering',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Integrity parent',type:'feature',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Integrity A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Integrity B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const file=path.join(root,'.ai/runtime/concurrency',`${parent.meta.id}.json`);
  const stored=JSON.parse(readFileSync(file,'utf8')); stored.maxParallel=16; writeFileSync(file,`${JSON.stringify(stored,null,2)}\n`);
  assert.throws(()=>concurrencyStatus(root,parent.meta.id),/integrity check failed/i);
  assert.throws(()=>prepareWave(root,parent.meta.id),/integrity check failed/i);
});

test('two real Node processes racing prepare cannot double-dispatch the same concurrency lanes',async()=>{
  const root=tempRoot();initProject(root);readyProjectContext(root);
  const parent=createTask(root,{title:'Interprocess race parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Race lane A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Race lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  recordHostCapabilities(root,{sessionId:'race-host',host:'node-test-host',subagentSpawn:true,parallelSubagents:true,attestation:'The Node race fixture launches independent worker processes concurrently.'});
  const moduleUrl=new URL('../dist/src/lib/concurrency.js',import.meta.url).href;
  const script=`import {prepareConcurrencyWave} from ${JSON.stringify(moduleUrl)}; const result=prepareConcurrencyWave(${JSON.stringify(root)},${JSON.stringify(parent.meta.id)},{hostSessionId:'race-host'}); console.log(JSON.stringify(result.lanes.map(l=>({taskId:l.taskId,sessionId:l.sessionId}))));`;
  const launch=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','--eval',script],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out.trim()||'[]')):reject(new Error(err||`child exited ${code}`)));});
  const [left,right]=await Promise.all([launch(),launch()]);
  const all=[...left,...right],ids=all.map(item=>item.taskId);
  assert.equal(new Set(ids).size,ids.length,`duplicate interprocess dispatch: ${JSON.stringify(all)}`);
  assert.deepEqual(new Set(ids),new Set([a.meta.id,b.meta.id]));
  const status=concurrencyStatus(root,parent.meta.id);
  const reservations=Object.values(status.reservations);
  assert.equal(reservations.length,2);
  assert.equal(new Set(reservations.map(item=>item.sessionId)).size,2);
});

test('two real Node processes racing different parents cannot exceed the project-global maxParallel ceiling',async()=>{
  const root=tempRoot();initProject(root);readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.subagents={...(config.subagents||{}),maxParallel:1};writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const leftParent=createTask(root,{title:'Global race parent left',type:'feature',surfaces:['backend']});
  const rightParent=createTask(root,{title:'Global race parent right',type:'feature',surfaces:['backend']});
  createSubtask(root,leftParent.meta.id,{title:'Global race left A',type:'task',surfaces:['backend']});
  createSubtask(root,leftParent.meta.id,{title:'Global race left B',type:'task',surfaces:['backend']});
  createSubtask(root,rightParent.meta.id,{title:'Global race right A',type:'task',surfaces:['backend']});
  createSubtask(root,rightParent.meta.id,{title:'Global race right B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,leftParent.meta.id,{maxParallel:1});
  createConcurrencyPlan(root,rightParent.meta.id,{maxParallel:1});
  const moduleUrl=new URL('../dist/src/lib/concurrency.js',import.meta.url).href;
  const launch=(parentId)=>new Promise((resolve,reject)=>{
    const script=`import {prepareConcurrencyWave} from ${JSON.stringify(moduleUrl)}; const result=prepareConcurrencyWave(${JSON.stringify(root)},${JSON.stringify('PARENT_PLACEHOLDER')}.replace('PARENT_PLACEHOLDER',${JSON.stringify(parentId)})); console.log(JSON.stringify(result.lanes.map(l=>({taskId:l.taskId,sessionId:l.sessionId}))));`;
    const child=spawn(process.execPath,['--input-type=module','--eval',script],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let out='',err='';
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out.trim()||'[]')):reject(new Error(err||`child exited ${code}`)));
  });
  const [left,right]=await Promise.all([launch(leftParent.meta.id),launch(rightParent.meta.id)]);
  assert.equal(left.length+right.length,1,`global maxParallel was exceeded: ${JSON.stringify({left,right})}`);
  const reserved=[...Object.values(concurrencyStatus(root,leftParent.meta.id).reservations),...Object.values(concurrencyStatus(root,rightParent.meta.id).reservations)];
  assert.equal(reserved.length,1);
});

test('global scheduler fails closed when any persisted concurrency plan loses integrity',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parentA=createTask(root,{title:'Corrupt scheduler parent',type:'feature',surfaces:['backend']});
  const parentB=createTask(root,{title:'Healthy scheduler parent',type:'feature',surfaces:['backend']});
  const a1=createTask(root,{title:'Corrupt lane A',type:'task',surfaces:['backend']});
  const a2=createTask(root,{title:'Corrupt lane B',type:'task',surfaces:['backend']});
  const b1=createTask(root,{title:'Healthy lane A',type:'task',surfaces:['backend']});
  const b2=createTask(root,{title:'Healthy lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parentA.meta.id,{taskIds:[a1.meta.id,a2.meta.id],maxParallel:2});
  createConcurrencyPlan(root,parentB.meta.id,{taskIds:[b1.meta.id,b2.meta.id],maxParallel:2});
  const file=path.join(root,'.ai/runtime/concurrency',`${parentA.meta.id}.json`);
  const stored=JSON.parse(readFileSync(file,'utf8')); stored.taskIds=[]; writeFileSync(file,`${JSON.stringify(stored,null,2)}\n`);
  assert.throws(()=>prepareWave(root,parentB.meta.id),/integrity check failed/i);
});

test('force cancellation recovers a corrupt scheduler plan without trusting its tampered reservation payload',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Recover corrupt parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Recover lane A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Recover lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  assert.equal(prepared.lanes.length,2);
  assert.equal(leaseStatus(root,a.meta.id).active,true);
  assert.equal(leaseStatus(root,b.meta.id).active,true);
  const file=path.join(root,'.ai/runtime/concurrency',`${parent.meta.id}.json`);
  const stored=JSON.parse(readFileSync(file,'utf8'));
  // Corrupt both the seal and payload. Recovery must derive lease ownership from
  // actual lease records/session prefixes instead of trusting these task IDs.
  stored.taskIds=['TASK-NOT-TRUSTED'];
  stored.reservations={'TASK-NOT-TRUSTED':{sessionId:'malicious-session',reservedAt:new Date().toISOString()}};
  writeFileSync(file,`${JSON.stringify(stored,null,2)}\n`);
  assert.throws(()=>cancelConcurrencyPlan(root,parent.meta.id),/integrity check failed/i);
  const recovered=cancelConcurrencyPlan(root,parent.meta.id,{force:true});
  assert.equal(recovered.cancelled,true);
  assert.equal(recovered.recoveredCorruptPlan,true);
  assert.equal(existsSync(file),false);
  assert.equal(leaseStatus(root,a.meta.id).active,false);
  assert.equal(leaseStatus(root,b.meta.id).active,false);
});

test('replanning an active concurrency plan preserves reservations instead of redispatching lanes',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Stable plan parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Stable A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Stable B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const sessions=new Map(prepared.lanes.map(lane=>[lane.taskId,lane.sessionId]));
  const replanned=createConcurrencyPlan(root,parent.meta.id,{taskIds:[a.meta.title,b.meta.id],maxParallel:2});
  assert.equal(replanned.lanes.filter(lane=>lane.state==='reserved').length,2);
  assert.equal(replanned.lanes.find(lane=>lane.taskId===a.meta.id).sessionId,sessions.get(a.meta.id));
  assert.equal(prepareWave(root,parent.meta.id).lanes.length,0);
});

test('a persisted reservation without its matching task lease fails closed until the same lane heartbeats or is explicitly released',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Lease recovery parent',type:'task',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Lease recovery A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Lease recovery B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:1});
  const first=prepareWave(root,parent.meta.id);
  const firstLane=first.lanes.find(lane=>lane.taskId===a.meta.id) ?? first.lanes[0];
  assert.ok(firstLane?.sessionId);
  releaseTaskLease(root,firstLane.taskId,{sessionId:firstLane.sessionId});
  const blocked=concurrencyStatus(root,parent.meta.id).lanes.find(lane=>lane.taskId===firstLane.taskId);
  assert.equal(blocked.state,'blocked');
  assert.match(blocked.blockedBy.join(' '),/stale-reservation-recovery-required/);
  assert.equal(nextConcurrencyWave(root,parent.meta.id).lanes.some(lane=>lane.taskId===firstLane.taskId),false);
  assert.equal(prepareWave(root,parent.meta.id).lanes.length,0);
  assert.throws(()=>heartbeatConcurrencyLane(root,parent.meta.id,firstLane.taskId,{sessionId:'wrong-session'}),/belongs to another session/i);
  const renewed=heartbeatConcurrencyLane(root,parent.meta.id,firstLane.taskId,{sessionId:firstLane.sessionId});
  assert.equal(renewed.lanes.find(lane=>lane.taskId===firstLane.taskId).sessionId,firstLane.sessionId);
  assert.equal(leaseStatus(root,firstLane.taskId,firstLane.sessionId).active,true);
  assert.doesNotThrow(()=>assertConcurrencyMutationAuthority(root,firstLane.taskId,firstLane.sessionId));
});

test('reservation release and task ownership are session-bound across redispatches',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Session parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Session A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Session B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const first=prepareWave(root,parent.meta.id);
  const firstSession=first.lanes.find(lane=>lane.taskId===a.meta.id).sessionId;
  assert.throws(()=>assertConcurrencyReservation(root,a.meta.id,'wrong-session'),/reserved by another concurrency session/i);
  assert.doesNotThrow(()=>assertConcurrencyReservation(root,a.meta.id,firstSession));
  assert.throws(()=>releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:'wrong-session'}),/belongs to another session/i);
  releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:firstSession});
  const second=prepareWave(root,parent.meta.id);
  const secondSession=second.lanes.find(lane=>lane.taskId===a.meta.id).sessionId;
  assert.notEqual(secondSession,firstSession);
  assert.throws(()=>releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:firstSession}),/belongs to another session/i);
  assert.doesNotThrow(()=>releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:secondSession}));
});

test('project subagents.maxParallel is a global scheduler ceiling across independent parent plans',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.subagents={...(config.subagents||{}),maxParallel:2};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const p1=createTask(root,{title:'Global cap parent A',type:'task',surfaces:['backend']});
  const a1=createSubtask(root,p1.meta.id,{title:'Global cap A1',type:'task',surfaces:['backend']});
  const a2=createSubtask(root,p1.meta.id,{title:'Global cap A2',type:'task',surfaces:['backend']});
  const p2=createTask(root,{title:'Global cap parent B',type:'task',surfaces:['backend']});
  createSubtask(root,p2.meta.id,{title:'Global cap B1',type:'task',surfaces:['backend']});
  createSubtask(root,p2.meta.id,{title:'Global cap B2',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,p1.meta.id,{maxParallel:2});
  createConcurrencyPlan(root,p2.meta.id,{maxParallel:2});
  const first=prepareWave(root,p1.meta.id);
  assert.equal(first.lanes.length,2);
  assert.equal(nextConcurrencyWave(root,p2.meta.id).availableSlots,0);
  assert.equal(prepareWave(root,p2.meta.id).lanes.length,0);
  releaseConcurrencyLane(root,p1.meta.id,a1.meta.id,{sessionId:first.lanes.find(lane=>lane.taskId===a1.meta.id).sessionId});
  assert.equal(nextConcurrencyWave(root,p2.meta.id).availableSlots,1);
  assert.equal(prepareWave(root,p2.meta.id).lanes.length,1);
  // Keep the second A lane referenced so the fixture proves the first parent really occupied both global slots.
  assert.ok(first.lanes.some(lane=>lane.taskId===a2.meta.id));
});

test('global scheduler reservation prevents the same task from being dispatched by two parent plans',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parentA=createTask(root,{title:'Parent A',type:'feature',surfaces:['backend']});
  const parentB=createTask(root,{title:'Parent B',type:'feature',surfaces:['backend']});
  const shared=createTask(root,{title:'Shared lane',type:'task',surfaces:['backend']});
  const onlyA=createTask(root,{title:'Only A',type:'task',surfaces:['backend']});
  const onlyB=createTask(root,{title:'Only B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parentA.meta.id,{taskIds:[shared.meta.id,onlyA.meta.id],maxParallel:2});
  createConcurrencyPlan(root,parentB.meta.id,{taskIds:[shared.meta.id,onlyB.meta.id],maxParallel:2});
  const first=prepareWave(root,parentA.meta.id);
  assert.ok(first.lanes.some(lane=>lane.taskId===shared.meta.id));
  const second=prepareWave(root,parentB.meta.id);
  assert.equal(second.lanes.some(lane=>lane.taskId===shared.meta.id),false);
  const foreign=concurrencyStatus(root,parentB.meta.id).lanes.find(lane=>lane.taskId===shared.meta.id);
  assert.equal(foreign.state,'reserved');
  assert.ok(foreign.blockedBy.includes(`reserved-by:${parentA.meta.id}`));
});

test('reserved Builder lanes cannot enter the phase boundary with a stale or foreign session',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Authority parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Authority A',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Authority B',type:'task',surfaces:['backend']});
  approveBackend(root,a.meta.id,['src/authority-a/**']);
  approveBackend(root,b.meta.id,['src/authority-b/**']);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  const intruder=nextAction(root,a.meta.id,{sessionId:'foreign-session'}).runtime;
  assert.throws(()=>enterPhaseBoundary(root,a.meta.id,{sessionId:'foreign-session',handoffDigest:intruder.handoffDigest,handoffContentDigest:intruder.handoffContentDigest,handoffWords:intruder.handoffWords}),/reserved by another concurrency session/i);
  const owner=nextAction(root,a.meta.id,{sessionId:lane.sessionId}).runtime;
  choosePhaseBoundary(root,a.meta.id,'continue-current',{sessionId:lane.sessionId,handoffDigest:owner.handoffDigest,handoffContentDigest:owner.handoffContentDigest,handoffWords:owner.handoffWords});
  assert.doesNotThrow(()=>enterPhaseBoundary(root,a.meta.id,{sessionId:lane.sessionId,handoffDigest:owner.handoffDigest,handoffContentDigest:owner.handoffContentDigest,handoffWords:owner.handoffWords}));
});

test('task-local concurrency reservations require the exact lane session and a matching task lease for Product Owner mutations',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  // Re-enable concrete Product Intelligence context after the generic helper.
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireTargetAudience:true,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  writeFileSync(path.join(root,'.ai/project/product.md'),'# Product\n\nA concrete workflow product for operators who need predictable outcomes and low avoidable friction.\n');
  writeFileSync(path.join(root,'.ai/project/product-owner.md'),'# Product Owner\n\nProtect user value, product coherence, bounded complexity, and explicit consequential product decisions.\n');
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls and predictable workflows.\n');
  const parent=createTask(root,{title:'PO authority parent',type:'feature',surfaces:['backend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  const a=createSubtask(root,parent.meta.id,{title:'PO lane A',type:'feature',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'PO lane B',type:'feature',surfaces:['backend']});
  const task=loadTask(findTask(root,a.meta.id)); task.body=setSection(task.body,'Need','Add a bounded operator capability with explicit product value.'); saveTask(task);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(lane?.sessionId);
  assert.throws(()=>recordProductOwnerReview(root,a.meta.id,{verdict:'build',summary:'This capability directly supports the documented operator workflow without broadening product scope.',value:'Operators gain a useful bounded outcome without learning a new product concept.'},{sessionId:'foreign-session'}),/reserved by another concurrency session/i);
  assert.doesNotThrow(()=>recordProductOwnerReview(root,a.meta.id,{verdict:'build',summary:'This capability directly supports the documented operator workflow without broadening product scope.',value:'Operators gain a useful bounded outcome without learning a new product concept.'},{sessionId:lane.sessionId}));
  const status=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(status.state,'blocked');
  assert.deepEqual(status.blockedBy,['human-judgment-required']);
  assert.equal(status.sessionId,null);
});

test('human Product Owner decisions release any scheduler reservation created while the decision gate is waiting',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireTargetAudience:true,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  writeFileSync(path.join(root,'.ai/project/product.md'),'# Product\n\nA concrete workflow product for operators who need predictable outcomes and low avoidable friction.\n');
  writeFileSync(path.join(root,'.ai/project/product-owner.md'),'# Product Owner\n\nProtect user value, product coherence, bounded complexity, and explicit consequential product decisions.\n');
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls and predictable workflows.\n');
  const parent=createTask(root,{title:'PO decision parent',type:'feature',surfaces:['backend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  const a=createSubtask(root,parent.meta.id,{title:'PO decision lane',type:'feature',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'PO sibling lane',type:'feature',surfaces:['backend']});
  const task=loadTask(findTask(root,a.meta.id)); task.body=setSection(task.body,'Need','Add a bounded operator capability with explicit product value.'); saveTask(task);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const first=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  recordProductOwnerReview(root,a.meta.id,{verdict:'revise',summary:'The proposal has useful intent but introduces a product trade-off that needs explicit judgment before specification.',value:'Operators could benefit, but only if the additional concept remains justified and understandable.',concerns:['The extra concept may increase product complexity.']},{sessionId:first.sessionId});
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id).sessionId,null);
  const gated=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(gated.state,'blocked');
  assert.deepEqual(gated.blockedBy,['human-judgment-required']);
  assert.equal(prepareWave(root,parent.meta.id).lanes.some(item=>item.taskId===a.meta.id),false);
  decideProductOwnerReview(root,a.meta.id,'proceed','Accept the bounded product trade-off and continue.');
  const yielded=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(yielded.sessionId,null);
  assert.equal(leaseStatus(root,a.meta.id).active,false);
});

test('normal Target Audience failures retain lane authority through agent-owned revision routing',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireTargetAudience:true,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  writeFileSync(path.join(root,'.ai/project/product.md'),'# Product\n\nA concrete workflow product for operators who need predictable outcomes and low avoidable friction.\n');
  writeFileSync(path.join(root,'.ai/project/product-owner.md'),'# Product Owner\n\nProtect user value, product coherence, bounded complexity, and explicit consequential product decisions.\n');
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls and predictable workflows.\n');
  const parent=createTask(root,{title:'Audience decision parent',type:'feature',surfaces:['frontend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  const a=createSubtask(root,parent.meta.id,{title:'Audience decision lane',type:'feature',surfaces:['frontend']});
  createSubtask(root,parent.meta.id,{title:'Audience sibling lane',type:'feature',surfaces:['frontend']});
  const task=loadTask(findTask(root,a.meta.id));
  task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_approval='approved'; task.meta.spec_approval_hash='approved'; task.meta.spec_effective_hash='approved'; task.meta.route.target_audience=true;
  saveTask(task);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(lane?.sessionId);
  enterPreparedAudienceBoundary(root,a.meta.id,lane.sessionId);
  recordTargetAudienceReview(root,a.meta.id,{profileId:'operator',verdict:'revise',comprehension:'pass',utility:'pass',discoverability:'fail',friction:'warn',trust:'pass',repeatValue:'pass',findings:['The useful result is too difficult for the configured audience to discover.']},{sessionId:lane.sessionId});
  const retained=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(retained.state,'active');
  assert.equal(retained.sessionId,lane.sessionId);
  assert.throws(()=>routeTargetAudienceRevision(root,a.meta.id,'Foreign session must not route the lane.',{sessionId:'foreign-session'}),/reserved by another concurrency session/i);
  const result=routeTargetAudienceRevision(root,a.meta.id,'Improve discoverability for the intended audience.',{sessionId:lane.sessionId});
  assert.equal(result.task.meta.phase,'builder');
  assert.equal(result.task.meta.status,'active');
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id).sessionId,null);
  assert.throws(()=>startRefinement(root,a.meta.id),/no active lane reservation/i);
});

test('human-question gates yield planned lane authority and answering does not bypass re-dispatch',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Question lane parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Question lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Question lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const lane=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  const question=addQuestion(root,a.meta.id,{text:'Which externally visible behavior should the task preserve?',impact:'high'},{sessionId:lane.sessionId});
  const yielded=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(yielded.state,'blocked');
  assert.deepEqual(yielded.blockedBy,['human-judgment-required']);
  assert.equal(yielded.sessionId,null);
  answerQuestion(root,a.meta.id,question.id,'Preserve the current public behavior while adding the requested capability.');
  assert.throws(()=>startRefinement(root,a.meta.id),/no active lane reservation/i);
  const redispatched=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(redispatched?.sessionId);
  assert.notEqual(redispatched.sessionId,lane.sessionId);
});

test('explicit blockers yield a planned lane and human resume returns control to the scheduler',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Blocked lane parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Blocked lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Blocked lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const lane=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  startRefinement(root,a.meta.id,{sessionId:lane.sessionId});
  blockTask(root,a.meta.id,'A consequential user decision is required before refinement can continue.',{sessionId:lane.sessionId});
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id).sessionId,null);
  resumeTask(root,a.meta.id);
  assert.throws(()=>startRefinement(root,a.meta.id),/no active lane reservation/i);
  const redispatched=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(redispatched?.sessionId);
  assert.notEqual(redispatched.sessionId,lane.sessionId);
});

test('pending amendment and context-approval gates yield task-local concurrency authority',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Human gate parent',type:'feature',surfaces:['backend']});
  const amendmentTask=createSubtask(root,parent.meta.id,{title:'Amendment lane',type:'task',surfaces:['backend']});
  const contextTask=createSubtask(root,parent.meta.id,{title:'Context lane',type:'task',surfaces:['backend']});
  const amended=loadTask(findTask(root,amendmentTask.meta.id)); amended.meta.spec_approval='approved'; amended.meta.spec_approval_hash='approved'; amended.meta.spec_effective_hash='approved'; saveTask(amended);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const amendmentLane=prepared.lanes.find(item=>item.taskId===amendmentTask.meta.id);
  const contextLane=prepared.lanes.find(item=>item.taskId===contextTask.meta.id);
  proposeAmendment(root,amendmentTask.meta.id,{title:'Clarify contract',reason:'A newly discovered product constraint changes the approved behavior.',changes:['Clarify the externally visible behavior.']},{sessionId:amendmentLane.sessionId});
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===amendmentTask.meta.id).sessionId,null);
  const expansion=requestContextExpansion(root,contextTask.meta.id,{reason:'The task needs a write-capable expansion that requires explicit approval.',files:[],symbols:[],depth:1,readOnly:false},{sessionId:contextLane.sessionId});
  assert.equal(expansion.status,'user-approval-required');
  assert.equal(concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===contextTask.meta.id).sessionId,null);
});

test('CLI task mutations cannot bypass a scheduler-owned task-local lane session',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'CLI authority parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'CLI lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'CLI lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  const cli=path.resolve('dist/src/cli.js');
  assert.throws(()=>execFileSync(process.execPath,[cli,'section','set',a.meta.id,'Need','--text','Unauthorized mutation','--root',root,'--session','foreign-session'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),/Command failed/);
  execFileSync(process.execPath,[cli,'section','set',a.meta.id,'Need','--text','Authorized mutation through the exact reserved lane session.','--root',root,'--session',lane.sessionId],{encoding:'utf8'});
  assert.match(loadTask(findTask(root,a.meta.id)).body,/Authorized mutation through the exact reserved lane session/);
});

test('CLI concurrency heartbeat renews the exact stale lane session without redispatching it',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'CLI heartbeat parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'CLI heartbeat lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'CLI heartbeat lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(lane?.sessionId);
  releaseTaskLease(root,a.meta.id,{sessionId:lane.sessionId});
  assert.equal(leaseStatus(root,a.meta.id).active,false);
  const cli=path.resolve('dist/src/cli.js');
  JSON.parse(execFileSync(process.execPath,[cli,'concurrency','heartbeat',parent.meta.id,a.meta.id,'--session',lane.sessionId,'--root',root],{encoding:'utf8'}));
  const refreshed=concurrencyStatus(root,parent.meta.id);
  assert.equal(refreshed.reservations[a.meta.id].sessionId,lane.sessionId);
  const lease=leaseStatus(root,a.meta.id);
  assert.equal(lease.active,true);
  assert.equal(lease.lease?.owner,lane.sessionId);
  assert.doesNotThrow(()=>assertConcurrencyMutationAuthority(root,a.meta.id,lane.sessionId));
});

test('planned tasks cannot bypass the scheduler between role dispatches and explicit cancellation restores normal ownership',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Binding plan parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Binding lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Binding lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  assert.throws(()=>startRefinement(root,a.meta.id),/belongs to concurrency plan .* no active lane reservation/i);
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  startRefinement(root,a.meta.id,{sessionId:lane.sessionId});
  const active=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(active.state,'active');
  assert.equal(active.sessionId,lane.sessionId);
  releaseConcurrencyLane(root,parent.meta.id,a.meta.id,{sessionId:lane.sessionId});
  assert.throws(()=>startRefinement(root,a.meta.id),/no active lane reservation/i);
  cancelConcurrencyPlan(root,parent.meta.id,{force:true});
  assert.doesNotThrow(()=>startRefinement(root,a.meta.id));
});


test('Autonomous can cross a clean mechanical approval gate for a planned child before scheduler redispatch',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root); setAutonomyPolicy(root,'autonomous');
  const parent=createTask(root,{title:'Autonomy concurrency parent',type:'task',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Autonomy concurrency A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Autonomy concurrency B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const prepared=prepareWave(root,parent.meta.id);
  const lane=prepared.lanes.find(item=>item.taskId===a.meta.id);
  assert.ok(lane?.sessionId);
  startRefinement(root,a.meta.id,{sessionId:lane.sessionId});
  const task=loadTask(findTask(root,a.meta.id));
  task.body=setSection(task.body,'Need','Expose one bounded observable response for operators.');
  task.body=setSection(task.body,'Product Value','Operators can verify the bounded behavior without internal access.');
  task.body=setSection(task.body,'Scope','Implement only the bounded observable response.');
  task.body=setSection(task.body,'Out of Scope','Unrelated refactors and product changes.');
  task.body=setSection(task.body,'Acceptance Criteria','- The bounded request returns an observable successful response\n- Existing unrelated behavior remains unchanged');
  saveTask(task);
  setDefaultBlastRadius(root,a.meta.id,['src/autonomy-a.ts']);
  completePhase(root,a.meta.id,{sessionId:lane.sessionId});
  const afterPhase=loadTask(findTask(root,a.meta.id));
  assert.equal(afterPhase.meta.phase,'spec-approval');
  const next=nextAction(root,a.meta.id);
  assert.equal(next.concurrencyAuthority.planned,true);
  assert.equal(next.concurrencyAuthority.reserved,false);
  assert.equal(next.action,'autonomy-advance');
  assert.equal(next.actor,'system');
  const advanced=advanceAutonomy(root,a.meta.id);
  assert.equal(advanced.advanced,true);
  assert.equal(loadTask(findTask(root,a.meta.id)).meta.phase,'builder');
  const redispatch=nextAction(root,a.meta.id);
  assert.equal(redispatch.action,'prepare-concurrency-lane');
  assert.equal(redispatch.actor,'ai-flow-multi-agent');
});

test('planned child next routes through the concurrency scheduler until the exact lane session is supplied',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const parent=createTask(root,{title:'Next authority parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Next authority A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Next authority B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  let next=nextAction(root,a.meta.id);
  assert.equal(next.action,'prepare-concurrency-lane');
  assert.equal(next.actor,'ai-flow-multi-agent');
  assert.equal(next.recommendedSkill,'ai-flow-multi-agent');
  const lane=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  next=nextAction(root,a.meta.id,{sessionId:'foreign-session'});
  assert.equal(next.action,'use-concurrency-session');
  assert.equal(next.actor,'ai-flow-multi-agent');
  next=nextAction(root,a.meta.id,{sessionId:lane.sessionId});
  assert.notEqual(next.actor,'ai-flow-multi-agent');
  assert.equal(next.concurrencyAuthority.sessionAuthorized,true);
});

test('task-local product phases cannot dispatch concurrently before shared project context bootstrap is complete',()=>{
  const root=tempRoot(); initProject(root);
  const parent=createTask(root,{title:'Bootstrap race parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Bootstrap race A',type:'feature',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Bootstrap race B',type:'feature',surfaces:['backend']});
  const plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  for(const lane of plan.lanes.filter(item=>[a.meta.id,b.meta.id].includes(item.taskId))){
    assert.equal(lane.state,'blocked');
    assert.deepEqual(lane.blockedBy,['shared-project-context-bootstrap-required-before-concurrency']);
  }
  assert.throws(()=>prepareWave(root,parent.meta.id),/requires a current Product Owner review/i);
});

test('historically ready project context is revalidated before task-local product lanes can dispatch',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireTargetAudience:true,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls, predictable workflows, and clear feedback.\n');
  const parent=createTask(root,{title:'Revalidation parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Revalidation A',type:'feature',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Revalidation B',type:'feature',surfaces:['backend']});
  let plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  assert.equal(plan.lanes.filter(lane=>[a.meta.id,b.meta.id].includes(lane.taskId)).every(lane=>lane.state==='ready'),true);
  // Leave config.context.status historically "ready" but invalidate the audience contract on disk.
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\nPrimary users need understandable controls, predictable workflows, and clear feedback, but no explicit stable audience profile is declared.\n');
  plan=concurrencyStatus(root,parent.meta.id);
  for(const lane of plan.lanes.filter(item=>[a.meta.id,b.meta.id].includes(item.taskId))){
    assert.equal(lane.state,'blocked');
    assert.deepEqual(lane.blockedBy,['shared-project-context-bootstrap-required-before-concurrency']);
  }
});

test('human Target Audience trade-offs yield the lane and block scheduler redispatch until the user decides',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireTargetAudience:true,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls and predictable workflows.\n');
  const parent=createTask(root,{title:'Audience tradeoff parent',type:'feature',surfaces:['frontend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  const a=createSubtask(root,parent.meta.id,{title:'Audience tradeoff A',type:'feature',surfaces:['frontend']});
  createSubtask(root,parent.meta.id,{title:'Audience tradeoff B',type:'feature',surfaces:['frontend']});
  const task=loadTask(findTask(root,a.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; task.meta.route.target_audience=true; saveTask(task);
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const lane=prepareWave(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  enterPreparedAudienceBoundary(root,a.meta.id,lane.sessionId);
  recordTargetAudienceReview(root,a.meta.id,{profileId:'operator',verdict:'revise',comprehension:'pass',utility:'pass',discoverability:'warn',friction:'warn',trust:'pass',repeatValue:'pass',findings:['The trade-off changes simplicity for advanced control.'],requiresProductDecision:true},{sessionId:lane.sessionId});
  const gated=concurrencyStatus(root,parent.meta.id).lanes.find(item=>item.taskId===a.meta.id);
  assert.equal(gated.state,'blocked');
  assert.equal(gated.sessionId,null);
  assert.deepEqual(gated.blockedBy,['human-judgment-required']);
  assert.equal(prepareWave(root,parent.meta.id).lanes.some(item=>item.taskId===a.meta.id),false);
  const next=nextAction(root,a.meta.id);
  assert.equal(next.action,'resolve-target-audience-tradeoff');
  assert.equal(next.actor,'user');
});

test('exact directory/file scopes are conservatively serialized as overlapping',()=>{
  const root=gitRoot();
  const parent=createTask(root,{title:'Directory overlap parent',type:'feature',surfaces:['backend']});
  const a=createSubtask(root,parent.meta.id,{title:'Directory scope',type:'task',surfaces:['backend']});
  const b=createSubtask(root,parent.meta.id,{title:'Nested file scope',type:'task',surfaces:['backend']});
  approveBackend(root,a.meta.id,['src/components']);
  approveBackend(root,b.meta.id,['src/components/Button.tsx']);
  const plan=createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const laneA=plan.lanes.find(item=>item.taskId===a.meta.id),laneB=plan.lanes.find(item=>item.taskId===b.meta.id);
  assert.ok(laneA.conflictsWith.includes(b.meta.id));
  assert.ok(laneB.conflictsWith.includes(a.meta.id));
  assert.equal(nextConcurrencyWave(root,parent.meta.id).lanes.length,1);
});

test('parallel dispatch fails closed to one lane until the host session attests real parallel subagent capability',()=>{
  const root=tempRoot();initProject(root);readyProjectContext(root);
  const parent=createTask(root,{title:'Host capability parent',type:'feature',surfaces:['backend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  createSubtask(root,parent.meta.id,{title:'Host lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Host lane B',type:'task',surfaces:['backend']});
  createConcurrencyPlan(root,parent.meta.id,{maxParallel:2});
  const fallback=prepareConcurrencyWave(root,parent.meta.id);
  assert.equal(fallback.dispatch.mode,'serial-fallback');
  assert.equal(fallback.dispatch.hostCapabilityVerified,false);
  assert.equal(fallback.dispatch.structurallyRunnable,2);
  assert.equal(fallback.lanes.length,1);
  releaseConcurrencyLane(root,parent.meta.id,fallback.lanes[0].taskId,{sessionId:fallback.lanes[0].sessionId});

  recordHostCapabilities(root,{sessionId:'parallel-host',host:'test-host',subagentSpawn:true,parallelSubagents:true,attestation:'The test host creates independent parallel worker sessions for every prepared lane.'});
  const parallel=prepareConcurrencyWave(root,parent.meta.id,{hostSessionId:'parallel-host'});
  assert.equal(parallel.dispatch.mode,'parallel');
  assert.equal(parallel.dispatch.hostCapabilityVerified,true);
  assert.equal(parallel.lanes.length,2);
});

test('host capability records are immutable and integrity tampering removes parallel authority',()=>{
  const root=tempRoot();initProject(root);
  const recorded=recordHostCapabilities(root,{sessionId:'host-proof',host:'test-host',subagentSpawn:true,parallelSubagents:true,attestation:'The host explicitly supports independent worker spawning and simultaneous execution.'});
  assert.equal(getHostCapabilityStatus(root,'host-proof').parallelVerified,true);
  assert.throws(()=>recordHostCapabilities(root,{sessionId:'host-proof',host:'changed-host',subagentSpawn:true,parallelSubagents:true,attestation:'The host explicitly supports independent worker spawning and simultaneous execution.'}),/immutable/i);
  const file=path.join(root,'.ai','runtime','host-capabilities','host-proof.json');
  const forged=JSON.parse(readFileSync(file,'utf8'));forged.parallelSubagents=false;writeFileSync(file,`${JSON.stringify(forged,null,2)}\n`);
  const status=getHostCapabilityStatus(root,'host-proof');
  assert.equal(status.valid,false);assert.equal(status.parallelVerified,false);assert.match(status.detail,/integrity check failed/i);
  assert.equal(recorded.sessionId,'host-proof');
});

test('corrupt host capability attestations have explicit force-only recovery and can be re-attested afterwards',()=>{
  const root=tempRoot();initProject(root);
  recordHostCapabilities(root,{sessionId:'recover-host',host:'test-host',subagentSpawn:true,parallelSubagents:true,attestation:'The host launches independent worker sessions concurrently for this test run.'});
  const file=path.join(root,'.ai','runtime','host-capabilities','recover-host.json'),forged=JSON.parse(readFileSync(file,'utf8'));forged.host='tampered';writeFileSync(file,`${JSON.stringify(forged,null,2)}\n`);
  assert.equal(getHostCapabilityStatus(root,'recover-host').valid,false);
  assert.throws(()=>resetHostCapabilities(root,'recover-host'),/requires force=true/i);
  assert.deepEqual(resetHostCapabilities(root,'recover-host',{force:true}),{sessionId:'recover-host',reset:true});
  assert.equal(getHostCapabilityStatus(root,'recover-host').valid,false);
  const restored=recordHostCapabilities(root,{sessionId:'recover-host',host:'test-host',subagentSpawn:true,parallelSubagents:true,attestation:'The host launches independent worker sessions concurrently for this test run.'});
  assert.equal(restored.parallelSubagents,true);assert.equal(getHostCapabilityStatus(root,'recover-host').parallelVerified,true);
});

test('unsupported distributed concurrency coordination is rejected instead of being silently treated as local-safe',()=>{
  const root=tempRoot();initProject(root);readyProjectContext(root);
  const configPath=path.join(root,'.ai','config.json');const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.subagents={...(config.subagents||{}),coordination:'distributed'};writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const parent=createTask(root,{title:'Unsupported coordinator',type:'feature',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Remote lane A',type:'task',surfaces:['backend']});
  createSubtask(root,parent.meta.id,{title:'Remote lane B',type:'task',surfaces:['backend']});
  assert.throws(()=>createConcurrencyPlan(root,parent.meta.id,{maxParallel:2}),/unsupported concurrency coordination mode.*local-filesystem/i);
});


test('planned final Product Owner lanes require the exact concurrency session and yield authority after recording the outcome review',()=>{
  const root=tempRoot(); initProject(root); readyProjectContext(root);
  writeFileSync(path.join(root,'.ai/project/product.md'),'# Product\n\nA concrete operator product with bounded workflows, explicit user value, and predictable outcomes.\n');
  writeFileSync(path.join(root,'.ai/project/product-owner.md'),'# Project Product Owner\n\nProtect product coherence, user value, bounded complexity, and explicit consequential decisions.\n');
  writeFileSync(path.join(root,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need understandable controls, predictable workflows, and useful outcomes.\n');
  const configPath=path.join(root,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireFinalProductOwnerReview:true,requireTargetAudience:false,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);

  const parent=createTask(root,{title:'Final Product Owner concurrency parent',type:'feature',surfaces:['backend']});
  acknowledgeParentProductOwner(root,parent.meta.id);
  const child=createSubtask(root,parent.meta.id,{title:'Final outcome lane',type:'design',surfaces:[]});
  const follower=createSubtask(root,parent.meta.id,{title:'Follower after final outcome',type:'design',surfaces:[]});
  addDependency(root,follower.meta.id,child.meta.id);
  const childTask=loadTask(findTask(root,child.meta.id));
  childTask.meta.phase='final-approval'; childTask.meta.status='awaiting_final_approval'; childTask.meta.waiting_for='none';
  childTask.meta.spec_approval='approved'; childTask.meta.spec_approval_hash='approved-spec'; childTask.meta.spec_effective_hash='approved-spec';
  childTask.meta.route={...childTask.meta.route,implementation:false,technical_review:'none',qa:'none',target_audience:false,final_customer:false};
  childTask.body=setSection(childTask.body,'Need','Confirm the final product outcome remains aligned before this child is approved.');
  saveTask(childTask);

  createConcurrencyPlan(root,parent.meta.id,{taskIds:[child.meta.id,follower.meta.id],maxParallel:1});
  const prepared=prepareWave(root,parent.meta.id);
  assert.equal(prepared.lanes.length,1);
  const lane=prepared.lanes[0];
  assert.equal(lane.taskId,child.meta.id);
  assert.equal(lane.state,'reserved');
  assert.throws(()=>recordFinalProductOwnerReview(root,child.meta.id,{verdict:'ship',summary:'The final outcome remains aligned with the approved product intent and introduces no new trade-off.',value:'Operators receive the intended value with bounded complexity and predictable behavior.'}),/reserved by another concurrency session/i);
  assert.throws(()=>recordFinalProductOwnerReview(root,child.meta.id,{verdict:'ship',summary:'The final outcome remains aligned with the approved product intent and introduces no new trade-off.',value:'Operators receive the intended value with bounded complexity and predictable behavior.'},{sessionId:'foreign-session'}),/reserved by another concurrency session/i);
  assert.doesNotThrow(()=>recordFinalProductOwnerReview(root,child.meta.id,{verdict:'ship',summary:'The final outcome remains aligned with the approved product intent and introduces no new trade-off.',value:'Operators receive the intended value with bounded complexity and predictable behavior.'},{sessionId:lane.sessionId}));
  assert.equal(concurrencyStatus(root,parent.meta.id).reservations[child.meta.id],undefined);
  assert.equal(leaseStatus(root,child.meta.id).active,false);
});
