// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveRevisionChangeSignals, revisionDependencyPlan } from '../dist/src/lib/artifact-dependencies.js';
import { USER_OVERRIDE_TARGETS, WORKFLOW_GATES } from '../dist/src/lib/workflow-gates.js';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { approveSpecification, completePhase, startExecution, startIncrementalRevision, waiveWorkflowStep } from '../dist/src/lib/workflow.js';
import { activeRevision } from '../dist/src/lib/revisions.js';
import { readyProjectContext, setDefaultBlastRadius, enterCurrentPhaseBoundary } from './helpers.mjs';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-revision-v2-'));
function writeSpec(root,id){
  const task=loadTask(findTask(root,id));
  task.body=setSection(task.body,'Need','Expose a bounded behavior that can be refined safely.');
  task.body=setSection(task.body,'Product Value','Allow low-cost iteration after implementation is visible.');
  task.body=setSection(task.body,'Scope','- Bounded implementation');
  task.body=setSection(task.body,'UI Target','- Not applicable');
  task.body=setSection(task.body,'Out of Scope','- Architecture changes');
  task.body=setSection(task.body,'Acceptance Criteria','- AC-001: Response is returned\n- AC-002: Existing behavior remains compatible');
  saveTask(task);setDefaultBlastRadius(root,id);
}

test('artifact dependency graph derives invalidation and phases instead of hard-coding workflow replay',()=>{
  const signals=deriveRevisionChangeSignals({request:'Reduce card padding and improve visual contrast.',files:['src/components/Card.css'],taskSurfaces:['frontend']});
  const ui=revisionDependencyPlan(signals);
  assert.ok(ui.invalidatedArtifacts.includes('visual-validation'));
  assert.ok(ui.invalidatedArtifacts.includes('acceptance-coverage'));
  assert.ok(ui.preservedArtifacts.includes('technical-review'));
  assert.ok(ui.preservedArtifacts.includes('target-audience'));
  assert.ok(ui.preservedArtifacts.includes('product-owner'));
  assert.deepEqual(ui.revalidateEvidenceKinds,['frontend-after','ui-after-validation']);
  assert.deepEqual(ui.requiredPhases,['qa-engineer']);
});

test('bounded user revision can start from QA, not only Final Approval',()=>{
  const root=repo();initProject(root,{name:'Universal revision'});readyProjectContext(root);
  const task=createTask(root,{title:'Revise from QA',type:'feature',surfaces:['backend']});writeSpec(root,task.meta.id);
  let current=loadTask(findTask(root,task.meta.id));current.meta.route.technical_review='none';current.meta.route.qa='command';saveTask(current);
  completePhase(root,task.meta.id);approveSpecification(root,task.meta.id,'approved');
  enterCurrentPhaseBoundary(root,task.meta.id,'builder-1');startExecution(root,task.meta.id,{sessionId:'builder-1'});completePhase(root,task.meta.id,{sessionId:'builder-1'});
  current=loadTask(findTask(root,task.meta.id));assert.equal(current.meta.phase,'qa-engineer');
  current=startIncrementalRevision(root,task.meta.id,'Adjust the small response behavior before finishing QA.',{classification:'behavior-refinement',affectedAcceptanceCriteria:['AC-001']},{sessionId:'qa-session',userAuthorized:true});
  assert.equal(current.meta.phase,'builder');assert.equal(current.meta.status,'ready');
  const revision=activeRevision(root,task.meta.id);assert.equal(revision.sourceGate,'qa-engineer');assert.equal(revision.schemaVersion,3);assert.ok(revision.invalidatedArtifacts.includes('behavior-validation'));assert.deepEqual(revision.requiredPhases,['qa-engineer']);
});

test('waivable targets are derived from gate metadata and pre-approval design can be explicitly waived once',()=>{
  assert.equal(WORKFLOW_GATES.design.waivable,true);assert.ok(USER_OVERRIDE_TARGETS.includes('design'));assert.ok(!USER_OVERRIDE_TARGETS.includes('builder'));
  const root=repo();initProject(root,{name:'Declarative gates'});const task=createTask(root,{title:'Skip design',type:'feature',surfaces:['frontend']});writeSpec(root,task.meta.id);
  let current=loadTask(findTask(root,task.meta.id));current.meta.phase='ux-ui-designer';current.meta.status='refining';current.meta.route.design=true;current.meta.route.architecture=true;current.meta.route.database=false;current.meta.completed_architecture=false;saveTask(current);
  current=waiveWorkflowStep(root,task.meta.id,'design','User explicitly wants to skip the design proposal for this task.',{userAuthorized:true});
  assert.equal(current.meta.phase,'technical-architecture');assert.equal(current.meta.status,'refining');assert.equal(current.meta.completed_design,true);
});
