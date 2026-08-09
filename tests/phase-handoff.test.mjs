import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initProject, loadProjectConfig } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification, startExecution, blockTask, resumeTask } from '../dist/src/lib/workflow.js';
import { contextStatus, requestContextExpansion } from '../dist/src/lib/context.js';
import { nextAction } from '../dist/src/lib/next.js';
import { runtimeRecommendation } from '../dist/src/lib/phase-handoff.js';
import { enterPhaseBoundary, loadPhaseBoundary } from '../dist/src/lib/phase-boundary.js';
import { estimatePhaseBoundary } from '../dist/src/lib/boundary-metrics.js';
import { acquireTaskLease, leaseStatus } from '../dist/src/lib/lease.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
import { proposeAmendment, approveAmendment } from '../dist/src/lib/amendments.js';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-handoff-'));
function backendAtSpecApproval(root){
  initProject(root,{name:'Runtime handoff'});readyProjectContext(root);
  const task=createTask(root,{title:'Add health endpoint',type:'feature',surfaces:['backend'],size:'medium',risk:'medium'});startRefinement(root,task.meta.id);let t=loadTask(findTask(root,task.meta.id));
  for(const[h,v]of [['Need','Expose a deterministic service health response for operators.'],['Product Value','Operators can verify service availability without internal access.'],['Users','Operators and monitoring clients.'],['Scope','Add one read-only health endpoint.'],['Out of Scope','No authentication, database, or UI changes.'],['Acceptance Criteria','- GET /health returns HTTP 200 with JSON status ok.'],['Implementation Plan','Add the handler and focused tests without changing unrelated routes.']])t.body=setSection(t.body,h,v);
  t.meta.route.design=false;t.meta.route.architecture=false;t.meta.route.database=false;saveTask(t);setDefaultBlastRadius(root,t.meta.id);
  requestContextExpansion(root,t.meta.id,{reason:'Inspect the health service boundary before approving the implementation plan.',files:['src/service.ts'],symbols:['HealthService'],depth:1});
  completePhase(root,t.meta.id);return t.meta.id;
}
function backendAtBuilder(root){const id=backendAtSpecApproval(root);approveSpecification(root,id);return id;}
function frontendAtBuilder(root){
  initProject(root,{name:'Visual handoff'});readyProjectContext(root);
  const task=createTask(root,{title:'Refine hero hierarchy',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);let t=loadTask(findTask(root,task.meta.id));
  for(const[h,v]of [['Need','Reduce hero heading dominance while preserving content.'],['Product Value','Visitors scan the primary action more easily.'],['Users','Desktop and mobile visitors.'],['Scope','Change only the homepage hero heading presentation.'],['UI Target','- Route: `/`\n- Target: `section#homepage-hero`\n- Viewport: `1440x1000`\n- Capture: focused section'],['Out of Scope','Navigation, footer, backend, and copy.'],['Acceptance Criteria','- The hero heading and CTA remain fully readable without clipping or overflow.'],['UX/UI Proposal','Implement the approved visual proposal exactly on the hero target.'],['Implementation Plan','Apply the approved proposal and verify the same target in the served app.']])t.body=setSection(t.body,h,v);
  t.meta.route.design=true;t.meta.route.architecture=false;t.meta.route.database=false;saveTask(t);setDefaultBlastRadius(root,t.meta.id);completePhase(root,t.meta.id);addApprovedImageGenProposal(root,t.meta.id,{target:'section#homepage-hero'});completePhase(root,t.meta.id);approveSpecification(root,t.meta.id);return t.meta.id;
}

test('project config never stores model selection or model routing defaults',()=>{
  const root=repo(),config=initProject(root,{name:'Defaults'});
  assert.equal(config.version,14);
  assert.equal(Object.prototype.hasOwnProperty.call(config,'modelRouting'),false);
  const disk=JSON.parse(readFileSync(path.join(root,'.ai','config.json'),'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(disk,'modelRouting'),false);
});

test('builder gets a fresh deterministic implementation packet and an explicit model-selector boundary notice',()=>{
  const root=repo(),id=backendAtBuilder(root),next=nextAction(root,id,{sessionId:'planning'});
  assert.equal(next.phase,'builder');assert.equal(next.runtime.role,'implementer');assert.equal(next.runtime.contextProfile,'standard');assert.equal(next.runtime.freshSessionRecommended,true);assert.equal(next.runtime.stopBeforePhaseWork,true);assert.equal(next.runtime.boundary.status,'required');assert.equal(next.runtime.boundary.recommendation,'fresh-chat-recommended');assert.equal(next.runtime.boundary.sameChatAllowed,true);
  assert.equal(next.runtime.transitionNotice.kind,'implementation-handoff');assert.match(next.runtime.transitionNotice.message,/does not choose or store a model/i);assert.match(next.runtime.transitionNotice.message,/Codex selector/i);assert.equal(next.runtime.transitionNotice.resumePrompt,`Continue ${id}`);
  assert.match(next.runtime.handoffDigest,/^[a-f0-9]{64}$/);assert.match(next.runtime.transitionInstruction,/STOP before doing implementation/i);assert.match(next.runtime.transitionInstruction,/Do not replay the previous chat/i);
  assert.equal('preferredModel' in next.runtime,false);assert.equal('modelSelection' in next.runtime,false);assert.equal('reasoningEffort' in next.runtime,false);
  const handoff=readFileSync(next.runtime.handoffPath,'utf8');
  assert.match(handoff,/implementation capsule/i);assert.match(handoff,/## Execution authority/);assert.match(handoff,/## Required execution sequence/);assert.match(handoff,/## Definition of done/);assert.match(handoff,/## Stop and escalate/);assert.match(handoff,/Previous conversational reasoning is non-authoritative/i);assert.match(handoff,/Approved specification:/);assert.match(handoff,/QA Mission:/);assert.match(handoff,/Scope Guard:/);assert.match(handoff,/AC-001/);assert.match(handoff,/src\/service\.ts/);assert.match(handoff,/HealthService/);assert.match(handoff,/progressive CodeGraph/i);assert.doesNotMatch(handoff,/planning conversation transcript/i);
  const context=contextStatus(root,id);assert.equal(context.profile,'standard');assert.ok(context.history.some(item=>item.status==='profile-reset'&&item.files.includes('src/service.ts')));
});

test('frontend implementation handoff carries only current UI-target before/proposal evidence without chat replay',()=>{
  const root=repo(),id=frontendAtBuilder(root),dir=path.join(root,'.ai','evidence',id,'frontend'),base=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');mkdirSync(dir,{recursive:true});
  const stale=path.join(dir,'stale-before.png');writeFileSync(stale,Buffer.concat([base,Buffer.from([71])]));addEvidence(root,id,{kind:'frontend-before',path:stale,source:'browser-capture',label:'Stale target',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#old-hero',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
  const runtime=runtimeRecommendation(root,id),handoff=readFileSync(runtime.handoffPath,'utf8');
  assert.equal(runtime.contextProfile,'standard');assert.equal(runtime.handoffWordLimit,3200);
  assert.match(handoff,/## UI target/);assert.match(handoff,/section#homepage-hero/);assert.match(handoff,/## Canonical visual evidence/);assert.match(handoff,/BEFORE/);assert.match(handoff,/PROPOSAL/);assert.match(handoff,/route \/ · target section#homepage-hero · viewport 1440x1000 · capture focused-section/);assert.match(handoff,/frontend\/before\.png/);assert.match(handoff,/frontend\/proposal\.png/);assert.doesNotMatch(handoff,/section#old-hero|Stale target/);
});

test('independent technical review gets its own compact packet and selector boundary without any model config',()=>{
  const root=repo(),id=backendAtBuilder(root);let task=loadTask(findTask(root,id));task.meta.phase='technical-reviewer';task.meta.status='review';saveTask(task);
  const review=runtimeRecommendation(root,id);assert.equal(review.role,'reviewer');assert.equal(review.contextProfile,'fast');assert.equal(review.freshSessionRecommended,true);assert.equal(review.stopBeforePhaseWork,true);assert.equal(review.transitionNotice.kind,'review-handoff');assert.ok(review.handoffWords>0);assert.ok(review.handoffWords<=review.handoffWordLimit);assert.equal(review.handoffWordLimit,1500);assert.match(review.handoffPath,/reviewer\.md$/);assert.match(readFileSync(review.handoffPath,'utf8'),/do not inherit implementation assumptions/i);
  task=loadTask(findTask(root,id));task.meta.phase='qa-engineer';task.meta.status='qa';saveTask(task);const qa=runtimeRecommendation(root,id);assert.equal(qa.role,'reviewer');assert.equal(qa.freshSessionRecommended,false);assert.equal(qa.stopBeforePhaseWork,false);assert.equal(qa.transitionNotice,null);
});

test('legacy project modelRouting configuration is removed instead of migrated or preserved',()=>{
  const root=repo();let config=initProject(root,{name:'Migration'}),file=path.join(root,'.ai','config.json');
  const legacy={...config,version:13,modelRouting:{enabled:true,roles:{thinker:{model:'expensive-model'},implementer:{model:'coding-model'},reviewer:{model:'review-model'}}}};
  writeFileSync(file,`${JSON.stringify(legacy,null,2)}\n`);
  config=initProject(root,{name:'Migration'});assert.equal(config.version,14);assert.equal(Object.prototype.hasOwnProperty.call(config,'modelRouting'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(readFileSync(file,'utf8')),'modelRouting'),false);
});

test('thinking context stays bounded by risk without controlling the Codex model or reasoning selector',()=>{
  const small=repo();initProject(small,{name:'Small thinker'});readyProjectContext(small);
  const a=createTask(small,{title:'Tighten one label',type:'task',surfaces:['frontend'],size:'small',risk:'low',executionProfile:'fast'});startRefinement(small,a.meta.id);
  const low=runtimeRecommendation(small,a.meta.id);assert.equal(low.role,'thinker');assert.equal(low.contextProfile,'fast');assert.equal(low.freshSessionRecommended,false);assert.match(low.rationale,/model and reasoning setting remain whatever the user selected/i);
  const critical=repo();initProject(critical,{name:'Critical thinker'});readyProjectContext(critical);
  const b=createTask(critical,{title:'Plan critical contract migration',type:'architecture',surfaces:['backend'],size:'large',risk:'critical',executionProfile:'rigorous'});startRefinement(critical,b.meta.id);
  let bt=loadTask(findTask(critical,b.meta.id));bt.meta.phase='technical-architecture';saveTask(bt);
  const high=runtimeRecommendation(critical,b.meta.id);assert.equal(high.contextProfile,'standard');
});

test('implementation keeps rigorous repository context when the approved execution profile requires it',()=>{
  const root=repo(),id=backendAtBuilder(root);let task=loadTask(findTask(root,id));task.meta.execution_profile='rigorous';task.meta.risk='high';saveTask(task);
  const runtime=runtimeRecommendation(root,id);assert.equal(runtime.role,'implementer');assert.equal(runtime.contextProfile,'rigorous');assert.equal(contextStatus(root,id).profile,'rigorous');
});

test('phase boundary resets active repository context even when thinker and implementer use the same context profile',()=>{
  const root=repo();initProject(root,{name:'Same-profile boundary'});readyProjectContext(root);
  const task=createTask(root,{title:'High-risk bounded backend change',type:'feature',surfaces:['backend'],size:'medium',risk:'high',executionProfile:'standard'});startRefinement(root,task.meta.id);let t=loadTask(findTask(root,task.meta.id));
  for(const[h,v]of [['Need','Change one bounded backend behavior.'],['Product Value','Keep a critical public behavior correct.'],['Users','API consumers.'],['Scope','Change one handler only.'],['Out of Scope','No unrelated refactor.'],['Acceptance Criteria','- GET /critical returns HTTP 200.'],['Implementation Plan','Update the handler and run focused tests.']])t.body=setSection(t.body,h,v);
  t.meta.route.design=false;t.meta.route.architecture=false;t.meta.route.database=false;saveTask(t);setDefaultBlastRadius(root,t.meta.id);
  const expansion=requestContextExpansion(root,t.meta.id,{reason:'Inspect the critical handler before sealing the implementation contract.',files:['src/critical.ts'],symbols:['criticalHandler'],depth:1});assert.equal(expansion.status,'approved');assert.equal(contextStatus(root,t.meta.id).profile,'standard');
  completePhase(root,t.meta.id);approveSpecification(root,t.meta.id);
  const next=nextAction(root,t.meta.id,{sessionId:'planner-standard'}),handoff=readFileSync(next.runtime.handoffPath,'utf8');
  assert.equal(next.runtime.contextProfile,'standard');assert.deepEqual(next.context.files,[]);assert.deepEqual(next.context.symbols,[]);assert.match(handoff,/src\/critical\.ts/);assert.match(handoff,/criticalHandler/);
  const after=contextStatus(root,t.meta.id);assert.ok(after.history.some(item=>item.status==='phase-boundary-reset'&&item.files.includes('src/critical.ts')));assert.equal(after.history.some(item=>item.status==='profile-reset'),false);
});

test('high-risk independent review expands context without inheriting builder chat',()=>{
  const root=repo(),id=backendAtBuilder(root);let task=loadTask(findTask(root,id));task.meta.phase='technical-reviewer';task.meta.status='review';task.meta.risk='high';task.meta.execution_profile='rigorous';saveTask(task);
  const runtime=runtimeRecommendation(root,id);assert.equal(runtime.contextProfile,'standard');assert.equal(runtime.freshSessionRecommended,true);assert.match(runtime.transitionInstruction,/Do not replay the previous chat/i);
});


test('phase boundary requires explicit session-bound entry and allows same-chat continuation',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planning-thread'});
  assert.equal(first.runtime.stopBeforePhaseWork,true);assert.equal(first.runtime.boundary.status,'required');
  const entered=enterPhaseBoundary(root,id,{sessionId:'planning-thread',handoffDigest:first.runtime.handoffDigest,handoffWords:first.runtime.handoffWords});
  assert.equal(entered.status,'entered');assert.equal(entered.mode,'same-chat');
  const resumed=nextAction(root,id,{sessionId:'planning-thread'});
  assert.equal(resumed.runtime.stopBeforePhaseWork,false);assert.equal(resumed.runtime.boundary.status,'entered');assert.equal(resumed.runtime.boundary.mode,'same-chat');assert.equal(resumed.runtime.transitionNotice,null);
});



test('phase boundary entry and execution require the stable entering session and mode cannot be forged',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner-session'});
  assert.throws(()=>enterPhaseBoundary(root,id,{handoffDigest:first.runtime.handoffDigest,handoffContentDigest:first.runtime.handoffContentDigest,handoffWords:first.runtime.handoffWords}),/requires a stable Codex session ID/i);
  enterPhaseBoundary(root,id,{sessionId:'builder-session',handoffDigest:first.runtime.handoffDigest,handoffContentDigest:first.runtime.handoffContentDigest,handoffWords:first.runtime.handoffWords});
  assert.throws(()=>startExecution(root,id),/requires the stable Codex session ID that entered it/i);
  assert.throws(()=>startExecution(root,id,{sessionId:'different-session'}),/entered by another session/i);
  assert.doesNotThrow(()=>startExecution(root,id,{sessionId:'builder-session'}));
});

test('fresh chat is inferred from a new stable session and gets the same deterministic capsule',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner-session'});
  const entered=enterPhaseBoundary(root,id,{sessionId:'implementer-session',handoffDigest:first.runtime.handoffDigest,handoffWords:first.runtime.handoffWords});
  assert.equal(entered.mode,'fresh-chat');
  const resumed=nextAction(root,id,{sessionId:'implementer-session'});
  assert.equal(resumed.runtime.stopBeforePhaseWork,false);assert.equal(resumed.runtime.boundary.mode,'fresh-chat');assert.equal(resumed.runtime.handoffDigest,first.runtime.handoffDigest);
});

test('small low-risk work still stops at the phase boundary but does not force or recommend a fresh chat',()=>{
  const root=repo(),id=frontendAtBuilder(root),runtime=nextAction(root,id,{sessionId:'small-planning'}).runtime;
  assert.equal(runtime.stopBeforePhaseWork,true);assert.equal(runtime.boundary.status,'required');assert.equal(runtime.boundary.recommendation,'same-chat-ok');assert.equal(runtime.freshSessionRecommended,false);assert.match(runtime.transitionNotice.message,/same chat is reasonable/i);
});

test('builder context expansion does not re-arm an entered boundary or rewrite the sealed capsule',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner'});
  enterPhaseBoundary(root,id,{sessionId:'builder',handoffDigest:first.runtime.handoffDigest,handoffContentDigest:first.runtime.handoffContentDigest,handoffWords:first.runtime.handoffWords});
  startExecution(root,id,{sessionId:'builder'});
  const expanded=requestContextExpansion(root,id,{reason:'Inspect one concrete helper required by the approved handler implementation.',files:['src/helper.ts'],symbols:['healthHelper'],depth:1});
  assert.equal(expanded.status,'approved');
  const resumed=nextAction(root,id,{sessionId:'builder'});
  assert.equal(resumed.runtime.boundary.status,'entered');assert.equal(resumed.runtime.stopBeforePhaseWork,false);assert.equal(resumed.runtime.handoffDigest,first.runtime.handoffDigest);assert.equal(resumed.runtime.handoffContentDigest,first.runtime.handoffContentDigest);
});

test('workflow mechanically rejects Builder execution until the boundary is entered',()=>{
  const root=repo(),id=backendAtBuilder(root),next=nextAction(root,id,{sessionId:'builder'});
  assert.equal(next.action,'phase-boundary');assert.equal(next.actor,'ai-flow-builder');assert.equal(next.runtime.boundary.status,'required');
  assert.throws(()=>startExecution(root,id,{sessionId:'builder'}),/phase boundary.*explicitly entered/i);
  enterPhaseBoundary(root,id,{sessionId:'builder',handoffDigest:next.runtime.handoffDigest,handoffContentDigest:next.runtime.handoffContentDigest,handoffWords:next.runtime.handoffWords});
  assert.doesNotThrow(()=>startExecution(root,id,{sessionId:'builder'}));
});

test('phase boundary entry is lease-safe: a conflicting owner cannot leave a false entered record',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner'});
  acquireTaskLease(root,id,{sessionId:'other-writer',phase:'builder'});
  assert.throws(()=>enterPhaseBoundary(root,id,{sessionId:'builder',handoffDigest:first.runtime.handoffDigest,handoffContentDigest:first.runtime.handoffContentDigest,handoffWords:first.runtime.handoffWords}),/locked by another session/i);
  const record=loadPhaseBoundary(root,id,'builder');assert.equal(record.status,'required');assert.equal(record.enteredSessionId,null);
});

test('phase boundary state is integrity checked and edited runtime JSON cannot forge entry',()=>{
  const root=repo(),id=backendAtBuilder(root);nextAction(root,id,{sessionId:'planner'});
  const file=path.join(root,'.ai','runtime','boundaries',`${id}-builder.json`),record=JSON.parse(readFileSync(file,'utf8'));record.status='entered';record.enteredSessionId='forged';writeFileSync(file,`${JSON.stringify(record,null,2)}\n`);
  assert.throws(()=>nextAction(root,id,{sessionId:'forged'}),/phase-boundary integrity check failed/i);
});

test('approved amendments invalidate an entered implementation boundary and require a newly compiled capsule',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner'});
  enterPhaseBoundary(root,id,{sessionId:'builder',handoffDigest:first.runtime.handoffDigest,handoffContentDigest:first.runtime.handoffContentDigest,handoffWords:first.runtime.handoffWords});
  const amendment=proposeAmendment(root,id,{title:'Bounded helper change',reason:'The approved handler needs one supporting file discovered during implementation.',changes:['Permit one supporting helper.'],allowedFiles:['src/helper.ts']});
  approveAmendment(root,id,amendment.id,'Approved bounded implementation change');
  const changed=nextAction(root,id,{sessionId:'builder'});
  assert.equal(changed.runtime.boundary.status,'required');assert.equal(changed.runtime.stopBeforePhaseWork,true);assert.notEqual(changed.runtime.handoffDigest,first.runtime.handoffDigest);
  assert.throws(()=>startExecution(root,id,{sessionId:'builder'}),/phase boundary.*explicitly entered/i);
});

test('architecture and database rendered artifacts are included as canonical implementation targets',()=>{
  const root=repo(),id=backendAtBuilder(root),dir=path.join(root,'.ai','evidence',id,'design');mkdirSync(dir,{recursive:true});
  const architecture=path.join(dir,'architecture.svg'),database=path.join(dir,'database.svg');writeFileSync(architecture,'<svg xmlns="http://www.w3.org/2000/svg"><text>architecture</text></svg>');writeFileSync(database,'<svg xmlns="http://www.w3.org/2000/svg"><text>database</text></svg>');
  addEvidence(root,id,{kind:'architecture-rendered',path:architecture,source:'design-proposal',label:'Approved architecture',tool:'Codex'});addEvidence(root,id,{kind:'database-rendered',path:database,source:'design-proposal',label:'Approved ERD',tool:'Codex'});
  const runtime=runtimeRecommendation(root,id),handoff=readFileSync(runtime.handoffPath,'utf8');assert.match(handoff,/architecture-rendered/);assert.match(handoff,/database-rendered/);assert.match(handoff,/Approved architecture/);assert.match(handoff,/Approved ERD/);
});

test('Builder lease is released before independent review and a fresh reviewer acquires ownership through its boundary',()=>{
  const root=repo(),id=backendAtBuilder(root),builder=nextAction(root,id,{sessionId:'planning'}).runtime;
  enterPhaseBoundary(root,id,{sessionId:'builder-chat',handoffDigest:builder.handoffDigest,handoffContentDigest:builder.handoffContentDigest,handoffWords:builder.handoffWords});startExecution(root,id,{sessionId:'builder-chat'});completePhase(root,id,{sessionId:'builder-chat'});
  assert.equal(leaseStatus(root,id,'review-chat').active,false);
  const review=nextAction(root,id,{sessionId:'review-chat'});assert.equal(review.action,'phase-boundary');assert.equal(review.runtime.boundary.status,'required');assert.equal(review.lease.conflict,false);
  enterPhaseBoundary(root,id,{sessionId:'review-chat',handoffDigest:review.runtime.handoffDigest,handoffContentDigest:review.runtime.handoffContentDigest,handoffWords:review.runtime.handoffWords});
  const lease=leaseStatus(root,id,'review-chat');assert.equal(lease.active,true);assert.equal(lease.owner,'review-chat');assert.equal(lease.lease.phase,'technical-reviewer');
});

test('spec approve CLI prepares the implementation boundary in the approval session before returning',()=>{
  const root=repo(),id=backendAtSpecApproval(root),cli=path.join(process.cwd(),'dist','src','cli.js');
  const result=spawnSync(process.execPath,[cli,'spec','approve',id,'--session','approval-session','--root',root],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
  assert.equal(output.phase,'builder');assert.equal(output.next.action,'phase-boundary');assert.equal(output.next.runtime.stopBeforePhaseWork,true);assert.equal(output.next.runtime.boundary.originSessionId,'approval-session');assert.equal(output.next.runtime.transitionNotice.resumePrompt,`Continue ${id}`);
});

test('a different Codex session must explicitly re-enter an already-entered phase boundary before work continues',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner'}).runtime;
  enterPhaseBoundary(root,id,{sessionId:'builder-a',handoffDigest:first.handoffDigest,handoffContentDigest:first.handoffContentDigest,handoffWords:first.handoffWords});startExecution(root,id,{sessionId:'builder-a'});
  const other=nextAction(root,id,{sessionId:'builder-b'});assert.equal(other.runtime.sessionEntryRequired,true);assert.equal(other.runtime.stopBeforePhaseWork,true);assert.match(other.runtime.transitionNotice.title,/ownership.*Codex session/i);
  assert.throws(()=>completePhase(root,id,{sessionId:'builder-b'}),/entered by another session|locked by another session/i);
});

test('a blocked Builder cannot be resumed by another session until that session enters the phase boundary',()=>{
  const root=repo(),id=backendAtBuilder(root),first=nextAction(root,id,{sessionId:'planner'}).runtime;
  enterPhaseBoundary(root,id,{sessionId:'builder-a',handoffDigest:first.handoffDigest,handoffContentDigest:first.handoffContentDigest,handoffWords:first.handoffWords});startExecution(root,id,{sessionId:'builder-a'});blockTask(root,id,'External dependency temporarily failed.');
  assert.throws(()=>resumeTask(root,id,{sessionId:'builder-b'}),/entered by another session/i);
  const runtime=nextAction(root,id,{sessionId:'builder-b'}).runtime;enterPhaseBoundary(root,id,{sessionId:'builder-b',handoffDigest:runtime.handoffDigest,handoffContentDigest:runtime.handoffContentDigest,handoffWords:runtime.handoffWords});
  assert.doesNotThrow(()=>resumeTask(root,id,{sessionId:'builder-b'}));assert.equal(leaseStatus(root,id,'builder-b').owner,'builder-b');
});

test('boundary estimate measures raw context savings without pretending to know host tokenization or caching',()=>{
  const root=repo(),id=backendAtBuilder(root),estimate=estimatePhaseBoundary(root,id,{historyTokens:25000,implementationTurns:6,inputCostPerMillion:2});
  assert.equal(estimate.tokenMethod,'utf8-chars-divided-by-4');assert.ok(estimate.capsuleTokens>0);assert.equal(estimate.scenarios.length,1);
  const row=estimate.scenarios[0];assert.equal(row.sameChatCarryoverTokens,150000);assert.ok(row.freshChatCarryoverTokens<row.sameChatCarryoverTokens);assert.ok(row.savingsPercent>70);assert.ok(row.uncachedInputCostSavings>0);assert.match(estimate.freshChat.caveat,/prompt caching/i);assert.match(estimate.sameChat.tokenSavings,/none/i);
});


test('CLI exposes boundary status, explicit entry, and model-independent token estimate',()=>{
  const root=repo(),id=backendAtBuilder(root),cli=path.join(process.cwd(),'dist','src','cli.js');
  const run=(args)=>{const result=spawnSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const status=run(['boundary','status',id,'--session','planner-cli']);assert.equal(status.boundary.status,'required');
  const estimate=run(['boundary','estimate',id,'--history-tokens','20000','--turns','4']);assert.equal(estimate.scenarios[0].sameChatCarryoverTokens,80000);assert.ok(estimate.scenarios[0].savedInputTokens>0);
  const missingSession=spawnSync(process.execPath,[cli,'boundary','enter',id,'--root',root],{encoding:'utf8'});assert.notEqual(missingSession.status,0);assert.match(missingSession.stderr,/requires --session/i);
  const forgedMode=spawnSync(process.execPath,[cli,'boundary','enter',id,'--session','builder-cli','--mode','same-chat','--root',root],{encoding:'utf8'});assert.notEqual(forgedMode.status,0);assert.match(forgedMode.stderr,/mode is inferred.*cannot be supplied/i);
  const entered=run(['boundary','enter',id,'--session','builder-cli']);assert.equal(entered.boundary.status,'entered');assert.equal(entered.boundary.mode,'fresh-chat');assert.equal(entered.runtime.stopBeforePhaseWork,false);
});
