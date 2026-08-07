import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification } from '../dist/src/lib/workflow.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
import { createReplay, startReplayVariant, completeReplayVariant, compareReplay, cleanupReplay, replayScenarios, recordReplayEvent } from '../dist/src/lib/replay.js';
import { recommendHarness } from '../dist/src/lib/policy.js';
import { writeReviewCockpit } from '../dist/src/lib/cockpit.js';

function repo(prefix='specrail-experiment-'){return mkdtempSync(path.join(tmpdir(),prefix));}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function approvedTask(root,{risk='medium',size='medium',surfaces=['backend']}={}){
  initProject(root,{name:'Experiment intelligence'});readyProjectContext(root);
  const task=createTask(root,{title:'Expose a deterministic health contract',type:'feature',surfaces,risk,size,executionProfile:'standard'});
  startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Expose a deterministic health contract so operators can verify service availability.');
  loaded.body=setSection(loaded.body,'Product Value','Operators can detect service readiness before routing traffic.');
  loaded.body=setSection(loaded.body,'Users','Operators and developers responsible for service reliability.');
  loaded.body=setSection(loaded.body,'Scope','Add one externally observable health contract and its automated verification.');
  loaded.body=setSection(loaded.body,'Out of Scope','Dashboards, deployment automation, and unrelated service refactors.');
  loaded.body=setSection(loaded.body,'Acceptance Criteria','- GET /health returns HTTP 200 with {"status":"ok"}.\n- A failing dependency returns a non-200 status.');
  loaded.body=setSection(loaded.body,'Gherkin','Scenario: healthy service\nGiven all required dependencies are available\nWhen GET /health is requested\nThen the response status is 200\nAnd the JSON status is ok');
  loaded.body=setSection(loaded.body,'QA Mission','Persona: operator\nStarting point: running service\nGoal: verify readiness through the public health contract\nAllowed interface: public HTTP API\nSuccess: healthy returns 200 and a dependency failure is non-200\nFailure: either case cannot be observed');
  loaded.body=setSection(loaded.body,'Implementation Plan','1. Locate the health boundary with CodeGraph.\n2. Add the smallest contract change.\n3. Add deterministic tests and real response evidence.');
  saveTask(loaded);setDefaultBlastRadius(root,task.meta.id);completePhase(root,task.meta.id);approveSpecification(root,task.meta.id,'Approved experiment source');
  return task.meta.id;
}
function completeVariant(root,replay,variant,options={}){
  const started=startReplayVariant(root,replay.id,variant);
  writeFileSync(path.join(started.worktreePath,'evidence.txt'),`evidence ${variant}\n`);
  for(let i=0;i<(options.repairs??0);i++)recordReplayEvent(root,replay.id,variant,{kind:'repair-attempt'});
  for(let i=0;i<(options.contextFiles??10);i++)recordReplayEvent(root,replay.id,variant,{kind:'context-file',file:`src/context-${i}.ts`});
  for(let i=0;i<(options.contextExpansions??1);i++)recordReplayEvent(root,replay.id,variant,{kind:'context-expansion'});
  for(let i=0;i<(options.toolCalls??20);i++)recordReplayEvent(root,replay.id,variant,{kind:'tool-call',tool:'test-tool'});
  let tokenUsage=options.tokenUsage;
  if(tokenUsage){const artifactPath='usage.json';writeFileSync(path.join(started.worktreePath,artifactPath),JSON.stringify(tokenUsage));tokenUsage={...tokenUsage,artifactPath};}
  return completeReplayVariant(root,replay.id,variant,{
    outcome:'accepted',tasksetDigest:started.tasksetDigest,harnessDigest:started.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,
    verification:{acceptance:'pass',qaMission:'pass',finalCustomer:'pass'},
    evidence:[{kind:'verification-log',path:'evidence.txt'}],tests:[{command:'npm test',exitCode:0}],
    metrics:{tokenUsage}
  });
}

test('replay comparison records exact reported token usage without double-counting cached input',()=>{
  const root=repo();git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=approvedTask(root),replay=createReplay(root,id,['fast','rigorous']);
  completeVariant(root,replay,'fast',{repairs:1,tokenUsage:{source:'host-reported',scope:'variant-total',model:'codex-model-a',inputTokens:12000,cachedInputTokens:3000,outputTokens:2000,reasoningTokens:700}});
  completeVariant(root,replay,'rigorous',{repairs:0,tokenUsage:{source:'host-reported',scope:'variant-total',model:'codex-model-a',inputTokens:15000,cachedInputTokens:9000,outputTokens:2400,reasoningTokens:900}});
  const comparison=compareReplay(root,replay.id),fast=comparison.rows.find(row=>row.variant==='fast'),rigorous=comparison.rows.find(row=>row.variant==='rigorous');
  assert.equal(fast.totalTokens,14000); // cached input is a subset of input, not additive
  assert.equal(fast.uncachedInputTokens,9000);
  assert.equal(fast.cachedInputTokens,3000);
  assert.equal(fast.tokenUsageSource,'host-reported');
  assert.equal(rigorous.totalTokens,17400);
  assert.equal(comparison.tokenCoverage.complete,true);
  assert.equal(comparison.winner.variant,'rigorous'); // quality/rework stays ahead of token cost
  cleanupReplay(root,replay.id);
});

test('replay rejects inconsistent or estimated token accounting',()=>{
  const root=repo();git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=approvedTask(root),replay=createReplay(root,id,['fast','standard']),started=startReplayVariant(root,replay.id,'fast');writeFileSync(path.join(started.worktreePath,'evidence.txt'),'x');writeFileSync(path.join(started.worktreePath,'usage-invalid.json'),JSON.stringify({source:'host-reported',scope:'variant-total',inputTokens:100,cachedInputTokens:101,outputTokens:10}));
  assert.throws(()=>completeReplayVariant(root,replay.id,'fast',{outcome:'accepted',tasksetDigest:started.tasksetDigest,harnessDigest:started.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,verification:{acceptance:'pass',qaMission:'pass'},evidence:[{kind:'log',path:'evidence.txt'}],metrics:{tokenUsage:{source:'host-reported',scope:'variant-total',inputTokens:100,cachedInputTokens:101,outputTokens:10,artifactPath:'usage-invalid.json'}}}),/cached input tokens cannot exceed input tokens/i);
  const estimated=startReplayVariant(root,replay.id,'standard');writeFileSync(path.join(estimated.worktreePath,'evidence.txt'),'x');
  assert.throws(()=>completeReplayVariant(root,replay.id,'standard',{outcome:'accepted',tasksetDigest:estimated.tasksetDigest,harnessDigest:estimated.harnessDigest,qaMissionHash:replay.taskset.qaMissionHash,verification:{acceptance:'pass',qaMission:'pass'},evidence:[{kind:'log',path:'evidence.txt'}],metrics:{estimatedTokens:1234}}),/Estimated token metrics are not accepted/i);
  cleanupReplay(root,replay.id);
});

test('adaptive harness policy stays advisory and requires enough comparable history',()=>{
  const root=repo();git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=approvedTask(root);
  const early=recommendHarness(root,id);assert.equal(early.status,'insufficient-data');assert.equal(early.appliesAutomatically,false);
  for(let i=0;i<3;i++){
    const replay=createReplay(root,id,['fast','standard']);
    completeVariant(root,replay,'fast',{repairs:2,contextFiles:8,tokenUsage:{source:'host-reported',scope:'variant-total',model:'same',inputTokens:9000+i*100,cachedInputTokens:2000,outputTokens:1800}});
    completeVariant(root,replay,'standard',{repairs:0,contextFiles:12,tokenUsage:{source:'host-reported',scope:'variant-total',model:'same',inputTokens:12000+i*100,cachedInputTokens:5000,outputTokens:2200}});
    cleanupReplay(root,replay.id);
  }
  const recommendation=recommendHarness(root,id);
  assert.equal(recommendation.status,'recommendation');
  assert.equal(recommendation.recommendedProfile,'standard');
  assert.equal(recommendation.appliesAutomatically,false);
  assert.equal(recommendation.cohort.sampledReplays,3);
  assert.equal(recommendation.profiles.fast.samples,3);
  assert.equal(recommendation.profiles.standard.samples,3);
  assert.ok(recommendation.profiles.fast.medianTotalTokens < recommendation.profiles.standard.medianTotalTokens);
  assert.match(recommendation.reason,/repairs|accepted/i);
});

test('replay scenario catalog covers tasks that expose speed, quality, context and risk tradeoffs',()=>{
  const scenarios=replayScenarios();
  assert.ok(scenarios.length>=7);
  assert.ok(scenarios.some(item=>item.id==='micro-ui'));
  assert.ok(scenarios.some(item=>item.id==='backend-validation'));
  assert.ok(scenarios.some(item=>item.id==='data-migration'));
  assert.ok(scenarios.every(item=>item.prompt&&item.measurementFocus.length>=2&&item.harnesses.length>=2));
});

test('review cockpit surfaces latest harness experiment and exact token metrics when available',()=>{
  const root=repo();git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=approvedTask(root),replay=createReplay(root,id,['fast','standard']);
  completeVariant(root,replay,'fast',{repairs:1,tokenUsage:{source:'host-reported',scope:'variant-total',model:'same',inputTokens:10000,cachedInputTokens:4000,outputTokens:2000}});
  completeVariant(root,replay,'standard',{repairs:0,tokenUsage:{source:'host-reported',scope:'variant-total',model:'same',inputTokens:13000,cachedInputTokens:7000,outputTokens:2300}});
  cleanupReplay(root,replay.id);
  const cockpit=writeReviewCockpit(root,id,'status'),html=readFileSync(cockpit.path,'utf8');
  assert.match(html,/Harness experiments/i);
  assert.match(html,/12,000/);
  assert.match(html,/15,300/);
  assert.match(html,/host-reported/i);
});


test('token counts do not decide a replay winner across different models',()=>{
  const root=repo();git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);
  const id=approvedTask(root),replay=createReplay(root,id,['fast','standard']);
  completeVariant(root,replay,'fast',{repairs:0,contextFiles:20,contextExpansions:1,tokenUsage:{source:'host-reported',scope:'variant-total',model:'model-a',inputTokens:1000,cachedInputTokens:0,outputTokens:100}});
  completeVariant(root,replay,'standard',{repairs:0,contextFiles:10,contextExpansions:1,tokenUsage:{source:'host-reported',scope:'variant-total',model:'model-b',inputTokens:50000,cachedInputTokens:0,outputTokens:5000}});
  const comparison=compareReplay(root,replay.id);
  assert.equal(comparison.tokenCoverage.comparable,false);
  assert.equal(comparison.winner.variant,'standard');
  cleanupReplay(root,replay.id);
});
