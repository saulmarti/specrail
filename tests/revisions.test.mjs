// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { approveFinal, approveSpecification, completePhase, rejectFinal, startExecution } from '../dist/src/lib/workflow.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
import { activeRevision, createRevision, listRevisions, markRevisionImplemented } from '../dist/src/lib/revisions.js';
import { repairStatus } from '../dist/src/lib/repairs.js';
import { recordTaskLearning } from '../dist/src/lib/learning.js';
import { runtimeRecommendation } from '../dist/src/lib/phase-handoff.js';
import { readyProjectContext, setDefaultBlastRadius, enterCurrentPhaseBoundary } from './helpers.mjs';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-revision-'));
function spec(root,id){
  const task=loadTask(findTask(root,id));
  task.body=setSection(task.body,'Need','Expose a small backend behavior with stable user-visible output.');
  task.body=setSection(task.body,'Product Value','Keep the delivered behavior easy to refine after seeing it run.');
  task.body=setSection(task.body,'Scope','- Bounded backend behavior');
  task.body=setSection(task.body,'UI Target','- Not applicable');
  task.body=setSection(task.body,'Out of Scope','- Architecture changes');
  task.body=setSection(task.body,'Acceptance Criteria','- AC-001: Response is returned\n- AC-002: Existing behavior remains compatible');
  saveTask(task);setDefaultBlastRadius(root,id);
}
function addInitialEvidence(root,id){
  const reviewDir=path.join(root,'.ai/evidence',id,'review');mkdirSync(reviewDir,{recursive:true});
  const review=path.join(reviewDir,'technical-review.md');writeFileSync(review,'# Technical Review\n\nNo blocking findings.\n');
  addEvidence(root,id,{kind:'technical-review-report',path:review,source:'technical-review',label:'Technical review',tool:'Codex'});
  const dir=path.join(root,'.ai/evidence',id,'backend');mkdirSync(dir,{recursive:true});
  const demo=path.join(dir,'response.txt'),tests=path.join(dir,'tests.txt'),qa=path.join(dir,'qa.md');
  writeFileSync(demo,'HTTP/1.1 200 OK\n');writeFileSync(tests,'existing tests pass\n');writeFileSync(qa,'# QA\n\nInitial implementation validated.\n');
  addEvidence(root,id,{kind:'backend-demo',path:demo,source:'executed-command',label:'Demo',command:'curl /demo',exitCode:0});
  addEvidence(root,id,{kind:'test-log',path:tests,source:'executed-command',label:'Existing tests',command:'npm test',exitCode:0});
  addEvidence(root,id,{kind:'qa-report',path:qa,source:'running-application',label:'QA',attributes:{proves:['AC-001','AC-002']}});
}
function reachFinal(root){
  initProject(root,{name:'Revision test'});readyProjectContext(root);
  const task=createTask(root,{title:'Revision loop',type:'feature',surfaces:['backend']});
  spec(root,task.meta.id);completePhase(root,task.meta.id);approveSpecification(root,task.meta.id,'approved');
  enterCurrentPhaseBoundary(root,task.meta.id,'builder-1');startExecution(root,task.meta.id,{sessionId:'builder-1'});completePhase(root,task.meta.id,{sessionId:'builder-1'});
  addInitialEvidence(root,task.meta.id);enterCurrentPhaseBoundary(root,task.meta.id,'reviewer-1');completePhase(root,task.meta.id,{sessionId:'reviewer-1'});completePhase(root,task.meta.id,{sessionId:'reviewer-1'});
  return task.meta.id;
}

test('final feedback becomes a bounded revision without repair budget or test-first planning',()=>{
  const root=repo(),id=reachFinal(root);const beforeRepairs=repairStatus(root,id);
  const returned=rejectFinal(root,id,'Adjust the response wording slightly after seeing the result.','builder',{revisionClass:'bounded-refinement',affectedAcceptanceCriteria:['AC-001']});
  assert.equal(returned.meta.status,'ready');assert.equal(returned.meta.phase,'builder');
  const revision=activeRevision(root,id);assert.ok(revision);assert.equal(revision.testPolicy.preImplementationTestPlanning,'not-required');assert.equal(revision.testPolicy.newPermanentTests,'decide-after-stabilization');
  assert.deepEqual(revision.revalidateEvidenceKinds,['revision-validation-report']);
  assert.deepEqual(repairStatus(root,id).attempts,beforeRepairs.attempts);
  const runtime=runtimeRecommendation(root,id,{sessionId:'builder-2'});const capsule=readFileSync(runtime.handoffPath,'utf8');
  assert.match(capsule,/revision delta capsule/i);assert.match(capsule,/Do not design or create a new test before implementing/i);assert.doesNotMatch(capsule,/Read this capsule completely before editing.*Run the required build\/tests/s);
});

test('revision creates a new implementation generation and validates only the affected delta',()=>{
  const root=repo(),id=reachFinal(root);rejectFinal(root,id,'Refine the returned wording only.','builder',{revisionClass:'bounded-refinement',affectedAcceptanceCriteria:['AC-001']});
  enterCurrentPhaseBoundary(root,id,'builder-2');startExecution(root,id,{sessionId:'builder-2'});
  const src=path.join(root,'src');mkdirSync(src,{recursive:true});writeFileSync(path.join(src,'response.ts'),"export const response = 'refined';\n");
  completePhase(root,id,{sessionId:'builder-2'});
  let task=loadTask(findTask(root,id));assert.equal(task.meta.phase,'qa-engineer');assert.equal(task.meta.implementation_generation_id,'GEN-002');
  let revision=activeRevision(root,id);assert.equal(revision.status,'implemented');assert.equal(revision.implementationGeneration,'GEN-002');
  const dir=path.join(root,'.ai/evidence',id,'revision');mkdirSync(dir,{recursive:true});const report=path.join(dir,'REV-001-validation.md');writeFileSync(report,'# Revision validation\n\nRefined response observed in the running application.\n');
  const ev=addEvidence(root,id,{kind:'revision-validation-report',path:report,source:'running-application',label:'REV-001 targeted validation',attributes:{proves:['AC-001']}});
  assert.equal(ev.implementationGeneration,'GEN-002');assert.equal(ev.revisionId,'REV-001');
  completePhase(root,id,{sessionId:'builder-2'});task=loadTask(findTask(root,id));revision=activeRevision(root,id);
  assert.equal(task.meta.phase,'final-approval');assert.equal(task.meta.status,'awaiting_final_approval');assert.equal(revision.status,'validated');
  assert.equal(listRevisions(root,id).length,1);
  recordTaskLearning(root,id,'The refined response wording is now the accepted stable behavior.');
  task=approveFinal(root,id,'accept stabilized revision');
  assert.equal(task.meta.status,'done');
  assert.equal(activeRevision(root,id),null);
  assert.equal(listRevisions(root,id)[0].status,'accepted');
});

test('material feedback is refused by the incremental loop',()=>{
  const root=repo(),id=reachFinal(root);
  assert.throws(()=>rejectFinal(root,id,'Change the architecture and add a new microservice.','builder',{}),/material|Amendment|specification/i);
  assert.equal(activeRevision(root,id),null);
});


test('classification is explanatory only and arbitrary future labels do not control routing',()=>{
  const make=(classification)=>{const root=repo();initProject(root,{name:'Classification independent'});const task=createTask(root,{title:'Class independent',type:'feature',surfaces:['frontend']});let current=loadTask(findTask(root,task.meta.id));current.meta.spec_approval='approved';saveTask(current);const revision=createRevision(root,task.meta.id,{request:'Tweak this small presentation detail.',classification,affectedFiles:['src/components/Card.css'],userAuthorized:true});return revision;};
  const a=make('future-design-polish'),b=make('implementation-defect');
  assert.equal(a.classification,'future-design-polish');assert.equal(b.classification,'implementation-defect');
  assert.deepEqual(a.changeSignals,b.changeSignals);assert.deepEqual(a.invalidatedArtifacts,b.invalidatedArtifacts);assert.deepEqual(a.requiredPhases,b.requiredPhases);
  assert.ok(a.changeSignals.includes('visual-output'));
});

test('schema v3 refines impact from the actual revision delta after Builder',()=>{
  const root=repo();initProject(root,{name:'Actual delta'});const task=createTask(root,{title:'Actual delta',type:'feature',surfaces:['frontend']});let current=loadTask(findTask(root,task.meta.id));current.meta.spec_approval='approved';saveTask(current);
  const revision=createRevision(root,task.meta.id,{request:'Tweak this slightly.',classification:'anything',userAuthorized:true});
  assert.equal(revision.schemaVersion,3);assert.equal(revision.impactSource,'context');
  assert.ok(revision.changeSignals.includes('visual-output'));
  const dir=path.join(root,'src','components');mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'Card.css'),'.card { padding: 8px; }\n');
  const implemented=markRevisionImplemented(root,task.meta.id,'GEN-002','implementation-digest');
  assert.equal(implemented.impactSource,'implementation-delta');assert.deepEqual(implemented.actualChangedFiles,['src/components/Card.css']);
  assert.ok(implemented.changeSignals.includes('visual-output'));assert.deepEqual(implemented.revalidateEvidenceKinds,['frontend-after','ui-after-validation']);
});

test('actual material delta discovered after implementation fails closed',()=>{
  const root=repo();initProject(root,{name:'Material delta'});const task=createTask(root,{title:'Material delta',type:'feature',surfaces:['backend']});let current=loadTask(findTask(root,task.meta.id));current.meta.spec_approval='approved';saveTask(current);
  createRevision(root,task.meta.id,{request:'Tweak this small implementation detail.',userAuthorized:true});
  const dir=path.join(root,'migrations');mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'001_add_table.sql'),'create table example(id int);\n');
  assert.throws(()=>markRevisionImplemented(root,task.meta.id,'GEN-002','implementation-digest'),/became material.*data-model|Amendment/i);
  assert.equal(activeRevision(root,task.meta.id)?.status,'active');
});

test('revision baseline is integrity checked before delta-derived routing',()=>{
  const root=repo();initProject(root,{name:'Baseline integrity'});const task=createTask(root,{title:'Baseline integrity',type:'feature',surfaces:['backend']});let current=loadTask(findTask(root,task.meta.id));current.meta.spec_approval='approved';saveTask(current);
  const src=path.join(root,'src');mkdirSync(src,{recursive:true});writeFileSync(path.join(src,'existing.ts'),'export const value = 1;\n');
  const revision=createRevision(root,task.meta.id,{request:'Tweak this small implementation detail.',userAuthorized:true});
  const snapshot=path.join(root,'.ai','revisions',task.meta.id,'.snapshots',`${revision.id}.json`);writeFileSync(snapshot,'{}\n');
  assert.throws(()=>markRevisionImplemented(root,task.meta.id,'GEN-002','implementation-digest'),/baseline integrity/i);
});
