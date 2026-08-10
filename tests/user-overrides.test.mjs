// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { approveFinal, approveSpecification, closeTaskByUserOverride, completePhase, startExecution, waiveWorkflowStep } from '../dist/src/lib/workflow.js';
import { addEvidence, validateEvidence } from '../dist/src/lib/evidence.js';
import { listUserOverrides } from '../dist/src/lib/user-overrides.js';
import { taskReadiness } from '../dist/src/lib/readiness.js';
import { readyProjectContext, setDefaultBlastRadius, enterCurrentPhaseBoundary } from './helpers.mjs';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-user-override-'));
function spec(root,id){
  const task=loadTask(findTask(root,id));
  task.body=setSection(task.body,'Need','Expose a small backend behavior.');
  task.body=setSection(task.body,'Product Value','Keep a deterministic response.');
  task.body=setSection(task.body,'Scope','- Bounded backend behavior');
  task.body=setSection(task.body,'UI Target','- Not applicable');
  task.body=setSection(task.body,'Out of Scope','- Architecture changes');
  task.body=setSection(task.body,'Acceptance Criteria','- AC-001: Response is returned');
  saveTask(task);setDefaultBlastRadius(root,id);
}
function reachFinal(root){
  initProject(root,{name:'Override test'});readyProjectContext(root);
  const task=createTask(root,{title:'Override final gate',type:'feature',surfaces:['backend']});
  spec(root,task.meta.id);completePhase(root,task.meta.id);approveSpecification(root,task.meta.id,'approved');
  enterCurrentPhaseBoundary(root,task.meta.id,'builder');startExecution(root,task.meta.id,{sessionId:'builder'});completePhase(root,task.meta.id,{sessionId:'builder'});
  const reviewDir=path.join(root,'.ai/evidence',task.meta.id,'review');mkdirSync(reviewDir,{recursive:true});
  const review=path.join(reviewDir,'technical-review.md');writeFileSync(review,'# Technical Review\n\nNo blocking findings.\n');addEvidence(root,task.meta.id,{kind:'technical-review-report',path:review,source:'technical-review',label:'Technical review'});
  const dir=path.join(root,'.ai/evidence',task.meta.id,'backend');mkdirSync(dir,{recursive:true});
  const demo=path.join(dir,'response.txt'),tests=path.join(dir,'tests.txt'),qa=path.join(dir,'qa.md');
  writeFileSync(demo,'HTTP/1.1 200 OK\n');writeFileSync(tests,'tests pass\n');writeFileSync(qa,'# QA\n\nValidated.\n');
  addEvidence(root,task.meta.id,{kind:'backend-demo',path:demo,source:'executed-command',label:'Demo',command:'curl /demo',exitCode:0});
  addEvidence(root,task.meta.id,{kind:'test-log',path:tests,source:'executed-command',label:'Tests',command:'npm test',exitCode:0});
  addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',attributes:{proves:['AC-001']}});
  enterCurrentPhaseBoundary(root,task.meta.id,'reviewer');completePhase(root,task.meta.id,{sessionId:'reviewer'});completePhase(root,task.meta.id,{sessionId:'reviewer'});
  return {id:task.meta.id,qa};
}

test('explicit user close is terminal, auditable, and cannot be invoked without current-turn authorization',()=>{
  const root=repo();initProject(root,{name:'Close override'});const task=createTask(root,{title:'Close me',type:'task',surfaces:['backend']});
  assert.throws(()=>closeTaskByUserOverride(root,task.meta.id,'User said close it now.',{}),/explicit current-turn user authorization/i);
  const closed=closeTaskByUserOverride(root,task.meta.id,'User explicitly said to close the task now.',{userAuthorized:true});
  assert.equal(closed.meta.status,'done');assert.equal(closed.meta.phase,'done');assert.equal(closed.meta.final_approval,'overridden');
  const overrides=listUserOverrides(root,task.meta.id);assert.equal(overrides.length,1);assert.equal(overrides[0].kind,'close');assert.equal(overrides[0].target,'task');
});

test('waiving the current QA step advances once and removes QA evidence requirements from final validation',()=>{
  const root=repo();initProject(root,{name:'Skip QA'});const task=createTask(root,{title:'Skip QA',type:'task',surfaces:['backend']});
  let current=loadTask(findTask(root,task.meta.id));current.meta.phase='qa-engineer';current.meta.status='qa';current.meta.route.qa='command';current.meta.route.technical_review='none';saveTask(current);
  current=waiveWorkflowStep(root,task.meta.id,'qa','User explicitly requested skipping QA.',{userAuthorized:true});
  assert.equal(current.meta.phase,'final-approval');assert.equal(current.meta.status,'awaiting_final_approval');
  const evidence=validateEvidence(root,task.meta.id,'final');assert.ok(!evidence.missing.includes('qa-report'));assert.ok(!evidence.missing.includes('test-log'));assert.ok(!evidence.missing.includes('backend-demo'));
});

test('waived final blockers stay resolved instead of reappearing and final approval can continue',()=>{
  const root=repo(),{id,qa}=reachFinal(root);rmSync(qa);
  assert.equal(validateEvidence(root,id,'final').valid,false);
  waiveWorkflowStep(root,id,'final-evidence','User explicitly accepts closing without the remaining final evidence.',{userAuthorized:true});
  waiveWorkflowStep(root,id,'acceptance-coverage','User explicitly accepts closing without complete evidence coverage.',{userAuthorized:true});
  waiveWorkflowStep(root,id,'project-learning','User explicitly asked to finish without recording project learning.',{userAuthorized:true});
  const readiness=taskReadiness(root,id);assert.equal(readiness.gates.find(g=>g.id==='final-evidence').status,'pass');assert.match(readiness.gates.find(g=>g.id==='final-evidence').detail,/override waived/i);
  const approved=approveFinal(root,id,'Approved with explicit user governance waivers.');assert.equal(approved.meta.status,'done');
});
