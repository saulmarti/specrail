import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification, blockTask } from '../dist/src/lib/workflow.js';
import { readyProjectContext, createFakeCodeGraph, setDefaultBlastRadius } from './helpers.mjs';
import { taskReadiness } from '../dist/src/lib/readiness.js';
import { writeReviewCockpit } from '../dist/src/lib/cockpit.js';
import { doctor, doctorFixPlan, applyDoctorFixes } from '../dist/src/lib/doctor.js';
import { createReplay, startReplayVariant, completeReplayVariant, compareReplay, cleanupReplay, recordReplayEvent } from '../dist/src/lib/replay.js';
import { nextAction } from '../dist/src/lib/next.js';

const packageRoot=process.cwd();
function repo(prefix='specrail-next-'){return mkdtempSync(path.join(tmpdir(),prefix));}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function preparedApprovedTask(root){
  initProject(root,{name:'Next phase test'});readyProjectContext(root);
  const task=createTask(root,{title:'Add deterministic health result',type:'task',surfaces:['backend'],risk:'medium',executionProfile:'standard'});
  startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Expose an externally observable health result so operators can verify the service is available.');
  loaded.body=setSection(loaded.body,'Product Value','Operators can detect service availability before sending production traffic.');
  loaded.body=setSection(loaded.body,'Users','Operators and developers responsible for service availability.');
  loaded.body=setSection(loaded.body,'Scope','Add one deterministic health result through the public service contract.');
  loaded.body=setSection(loaded.body,'Out of Scope','Authentication, dashboards, deployment automation, and unrelated endpoints.');
  loaded.body=setSection(loaded.body,'Acceptance Criteria','- The public health contract returns HTTP 200 when the service is ready.\n- The response contains an observable status value equal to ready.\n- A failing dependency produces a non-200 response instead of a false ready result.');
  saveTask(loaded);setDefaultBlastRadius(root,task.meta.id);completePhase(root,task.meta.id);approveSpecification(root,task.meta.id,'Approved for replay tests');
  return task.meta.id;
}

test('Readiness is a single deterministic why-blocked contract reused by the Review Cockpit',()=>{
  const root=repo(),id=preparedApprovedTask(root);
  blockTask(root,id,'Browser runtime unavailable after two attempts.');
  const readiness=taskReadiness(root,id,{sessionId:'session-a'});
  assert.equal(readiness.ready,false);
  assert.equal(readiness.blockers[0].id,'workflow-blocker');
  assert.equal(readiness.blockers[0].owner,'system');
  assert.match(readiness.next.action,/resolve the blocker/i);
  assert.match(readiness.score.explanation,/deterministic gates/i);
  const cockpit=writeReviewCockpit(root,id,'status');
  assert.equal(cockpit.readiness.score,readiness.score.value);
  assert.equal(cockpit.blockers[0],readiness.blockers[0].detail);
  const html=readFileSync(cockpit.path,'utf8');
  assert.match(html,/Browser runtime unavailable/);
});

test('doctor --fix plans safe local repairs separately from external dependencies and repairs the SpecRail launcher',()=>{
  const root=repo(),home=repo('specrail-doctor-home-');
  initProject(root,{name:'Doctor'});readyProjectContext(root);
  const fake=createFakeCodeGraph();
  const old=process.env.AI_FLOW_CODEGRAPH_COMMAND;process.env.AI_FLOW_CODEGRAPH_COMMAND=fake.command;
  try{
    const before=doctor(root,home);
    assert.equal(before.checks.find(item=>item.name==='specrail-launcher').ok,false);
    assert.equal(before.checks.find(item=>item.name==='ai-flow-compat-launcher').required,false);
    const plan=doctorFixPlan(root,home,packageRoot);
    assert.ok(plan.safeFixIds.includes('managed-installation'));
    assert.ok(plan.manualFixes.some(item=>item.id==='configure-codegraph-mcp'));
    assert.equal(plan.interaction.tool,'request_user_input');
    const result=applyDoctorFixes(root,home,packageRoot,['managed-installation']);
    assert.ok(result.applied.includes('managed-installation'));
    assert.equal(result.after.checks.find(item=>item.name==='specrail-launcher').ok,true);
    assert.ok(existsSync(path.join(home,'.local','bin','specrail')));
    assert.ok(existsSync(path.join(home,'.agents','skills','ai-flow','SKILL.md')));
    assert.match(readFileSync(path.join(home,'.codex','config.toml'),'utf8'),/default_mode_request_user_input\s*=\s*true/);
  } finally { if(old===undefined)delete process.env.AI_FLOW_CODEGRAPH_COMMAND;else process.env.AI_FLOW_CODEGRAPH_COMMAND=old; }
});

test('replayable tasksets isolate harnesses and compare only variants that pass the same immutable verification',()=>{
  const root=repo('specrail-replay-');git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=preparedApprovedTask(root);const replay=createReplay(root,id,['fast','rigorous']);
  assert.equal(replay.taskset.specificationHash,loadTask(findTask(root,id)).meta.spec_effective_hash);
  assert.equal(replay.variants.length,2);
  assert.notEqual(replay.variants[0].harness.digest,replay.variants[1].harness.digest);
  const fast=startReplayVariant(root,replay.id,'fast'),rigorous=startReplayVariant(root,replay.id,'rigorous');
  assert.notEqual(fast.worktreePath,rigorous.worktreePath);
  assert.ok(existsSync(fast.instructionPath));
  assert.match(readFileSync(fast.instructionPath,'utf8'),/taskset is immutable|immutable taskset/i);
  for(const [started,repairs] of [[fast,1],[rigorous,0]]){
    for(let i=0;i<repairs;i++)recordReplayEvent(root,replay.id,started.variant,{kind:'repair-attempt'});
    writeFileSync(path.join(started.worktreePath,'app.txt'),`implementation-${started.variant}\n`);
    writeFileSync(path.join(started.worktreePath,'replay-evidence.txt'),`real evidence for ${started.variant}\n`);
    completeReplayVariant(root,replay.id,started.variant,{
      outcome:'accepted',tasksetDigest:started.tasksetDigest,harnessDigest:started.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,
      verification:{acceptance:'pass',qaMission:'pass',finalCustomer:'pass'},evidence:[{kind:'verification-log',path:'replay-evidence.txt'}],tests:[{command:'npm test',exitCode:0}],metrics:{repairAttempts:repairs,contextFiles:started.variant==='fast'?8:14,contextExpansions:1}
    });
  }
  const comparison=compareReplay(root,replay.id);
  assert.equal(comparison.complete,true);
  assert.equal(comparison.rows.every(row=>row.accepted),true);
  assert.equal(comparison.winner.variant,'rigorous');
  assert.match(comparison.winner.reason,/identical Taskset and QA mission/i);
  const cleaned=cleanupReplay(root,replay.id);assert.deepEqual(new Set(cleaned.cleaned),new Set(['fast','rigorous']));
  assert.equal(existsSync(fast.worktreePath),false);assert.equal(existsSync(rigorous.worktreePath),false);
});

test('replay refuses dirty source code and rejects result records from a different taskset',()=>{
  const root=repo('specrail-replay-guard-');git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=preparedApprovedTask(root);writeFileSync(path.join(root,'app.txt'),'dirty\n');assert.throws(()=>createReplay(root,id,['fast','standard']),/clean code working tree/i);writeFileSync(path.join(root,'app.txt'),'base\n');
  const replay=createReplay(root,id,['fast','standard']);const started=startReplayVariant(root,replay.id,'fast');writeFileSync(path.join(started.worktreePath,'evidence.txt'),'x');
  assert.throws(()=>completeReplayVariant(root,replay.id,'fast',{outcome:'accepted',tasksetDigest:'wrong',harnessDigest:started.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,verification:{acceptance:'pass',qaMission:'pass'},evidence:[{kind:'log',path:'evidence.txt'}]}),/Taskset digest does not match/i);
  cleanupReplay(root,replay.id);rmSync(path.join(root,'.ai-flow-worktrees'),{recursive:true,force:true});
});

test('accepted replay cannot be justified by reported test exit codes without a real worktree evidence artifact',()=>{
  const root=repo('specrail-replay-evidence-');git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=preparedApprovedTask(root),replay=createReplay(root,id,['fast','standard']),started=startReplayVariant(root,replay.id,'fast');
  assert.throws(()=>completeReplayVariant(root,replay.id,'fast',{outcome:'accepted',tasksetDigest:started.tasksetDigest,harnessDigest:started.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,verification:{acceptance:'pass',qaMission:'pass'},tests:[{command:'npm test',exitCode:0}]}),/real evidence artifact/i);
  cleanupReplay(root,replay.id);
});

test('next exposes the exact same readiness contract and required gates block at approval time',()=>{
  const root=repo();initProject(root,{name:'Readiness gate'});readyProjectContext(root);
  const task=createTask(root,{title:'Expose a deterministic status',type:'task',surfaces:['backend'],risk:'medium'});
  startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Expose a public status so callers can detect service readiness.');
  loaded.body=setSection(loaded.body,'Product Value','Callers avoid sending work to a service that is not ready.');
  loaded.body=setSection(loaded.body,'Users','API clients and operators.');
  loaded.body=setSection(loaded.body,'Scope','Expose one observable public readiness result.');
  loaded.body=setSection(loaded.body,'Out of Scope','Dashboards and deployment automation.');
  loaded.body=setSection(loaded.body,'Acceptance Criteria','- The readiness contract returns HTTP 200 when ready.\n- A failing dependency returns a non-200 response.');
  saveTask(loaded);
  setDefaultBlastRadius(root,task.meta.id);
  completePhase(root,task.meta.id);
  // Simulate a corrupted/migrated task whose required QA Mission disappeared after refinement.
  const atApproval=loadTask(findTask(root,task.meta.id));
  atApproval.body=setSection(atApproval.body,'QA Mission','');
  saveTask(atApproval);
  const readiness=taskReadiness(root,task.meta.id);
  assert.equal(readiness.phase,'spec-approval');
  assert.equal(readiness.ready,false);
  assert.equal(readiness.blockers.some(item=>item.id==='qa-mission'),true);
  assert.ok(['spec-lint','qa-mission'].includes(readiness.next.gateId));
  const next=nextAction(root,task.meta.id);
  const preparedReadiness=taskReadiness(root,task.meta.id);
  assert.equal(next.readiness.ready,preparedReadiness.ready);
  assert.deepEqual(next.readiness.gates.map(item=>[item.id,item.status]),preparedReadiness.gates.map(item=>[item.id,item.status]));
  assert.equal(next.readiness.gates.find(item=>item.id==='qa-mission')?.status,'pass','next must prepare the exact review state before exposing the approval surface');
});

test('next normalizes legacy project config blocks before building runtime visualization',()=>{
  const root=repo('specrail-legacy-config-');
  initProject(root,{name:'Legacy config'});readyProjectContext(root);
  const created=createTask(root,{title:'Legacy-config task',type:'task',surfaces:['backend'],risk:'medium',executionProfile:'standard'});
  const configPath=path.join(root,'.ai','config.json');
  const persisted=JSON.parse(readFileSync(configPath,'utf8'));
  delete persisted.visualize;
  delete persisted.contextBudget;
  delete persisted.leases;
  delete persisted.adaptivePolicy;
  persisted.version=8;
  writeFileSync(configPath,`${JSON.stringify(persisted,null,2)}\n`);

  const next=nextAction(root,created.meta.id,{sessionId:'legacy-config-session'});
  assert.equal(next.task,created.meta.id);
  assert.equal(next.phase,'product-specifier');
  assert.equal(next.visualization?.skillInvocation,'$visualize');
  assert.equal(next.context.policy.maxFiles,16);

  // Loading legacy config is compatibility normalization, not a hidden on-read migration.
  const disk=JSON.parse(readFileSync(configPath,'utf8'));
  assert.equal('visualize' in disk,false);
  assert.equal(disk.version,8);
});
