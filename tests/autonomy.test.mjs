// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { approveFinal, completePhase, resolveFinalProductOwnerDecision, startRefinement } from '../dist/src/lib/workflow.js';
import { nextAction } from '../dist/src/lib/next.js';
import { autonomyPolicy, setAutonomyPolicy } from '../dist/src/lib/autonomy-policy.js';
import { advanceAutonomy } from '../dist/src/lib/autonomy.js';
import { finalProductOwnerReviewStatus, recordFinalProductOwnerReview, recordProductOwnerReview } from '../dist/src/lib/product-intelligence.js';
import { registerRepairAttempt } from '../dist/src/lib/repairs.js';
import { projectGovernanceHash } from '../dist/src/lib/project-governance.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';

function root() { return mkdtempSync(path.join(tmpdir(), 'specrail-autonomy-')); }
function readyBackendSpec(projectRoot, id) {
  const task = loadTask(findTask(projectRoot,id));
  task.body = setSection(task.body,'Need','Expose a stable health status for operators.');
  task.body = setSection(task.body,'Product Value','Operators can verify service availability without inspecting internals.');
  task.body = setSection(task.body,'Scope','Add one externally observable health response.');
  task.body = setSection(task.body,'Out of Scope','Dependency diagnostics and monitoring dashboards.');
  task.body = setSection(task.body,'Acceptance Criteria','- Health request returns a successful response\n- Response exposes an observable healthy status');
  saveTask(task);
  setDefaultBlastRadius(projectRoot,id,['health.ts']);
}

test('Autonomy Levels default to Guided and persist Autonomous/Headless policy explicitly', () => {
  const projectRoot=root(); initProject(projectRoot);
  assert.equal(autonomyPolicy(projectRoot).level,'guided');
  assert.equal(autonomyPolicy(projectRoot).delivery,'ask');
  assert.equal(setAutonomyPolicy(projectRoot,'autonomous').level,'autonomous');
  assert.equal(setAutonomyPolicy(projectRoot,'headless','merge-local').delivery,'merge-local');
  assert.equal(autonomyPolicy(projectRoot).level,'headless');
  assert.throws(()=>setAutonomyPolicy(projectRoot,'reckless'),/invalid autonomy level/i);
});

test('Guided autonomy does not mislabel ordinary deterministic blockers as approval gates', () => {
  const projectRoot=root(); initProject(projectRoot);
  const task=createTask(projectRoot,{title:'Guided normal work',type:'task',surfaces:['backend']});
  const result=advanceAutonomy(projectRoot,task.meta.id);
  assert.equal(result.advanced,false);
  assert.equal(result.stopped,false);
  assert.equal(result.action,'blocked');
  assert.match(result.reason,/CodeGraph|project context|specification/i);
});

test('Guided keeps the specification approval native while Autonomous advances a clean gate mechanically', () => {
  const projectRoot=root(); initProject(projectRoot); readyProjectContext(projectRoot);
  const created=createTask(projectRoot,{title:'Health status',type:'task',surfaces:['backend']});
  startRefinement(projectRoot,created.meta.id); readyBackendSpec(projectRoot,created.meta.id); completePhase(projectRoot,created.meta.id);
  let next=nextAction(projectRoot,created.meta.id);
  assert.equal(next.action,'approve-or-refine-specification');
  assert.equal(next.actor,'user');
  assert.equal(next.interaction?.tool,'request_user_input');
  setAutonomyPolicy(projectRoot,'autonomous');
  next=nextAction(projectRoot,created.meta.id);
  assert.equal(next.action,'autonomy-advance');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.autonomy.automatic,true);
  const advanced=advanceAutonomy(projectRoot,created.meta.id);
  assert.equal(advanced.advanced,true);
  assert.equal(advanced.action,'approve-specification');
  assert.equal(loadTask(findTask(projectRoot,created.meta.id)).meta.phase,'builder');
  assert.match(readFileSync(findTask(projectRoot,created.meta.id),'utf8'),/approved by SpecRail autonomy policy/i);
});

test('Autonomous still interrupts for Product Owner judgment while Headless stops without fabricating an answer', () => {
  const projectRoot=root(); initProject(projectRoot); readyProjectContext(projectRoot);
  writeFileSync(path.join(projectRoot,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need predictable shared-workspace behavior and understandable controls.\n');
  const configPath=path.join(projectRoot,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const created=createTask(projectRoot,{title:'Shared folders',type:'feature',surfaces:['frontend']});
  const task=loadTask(findTask(projectRoot,created.meta.id)); task.body=setSection(task.body,'Need','Let members organize shared workspace items together.'); saveTask(task);
  recordProductOwnerReview(projectRoot,created.meta.id,{verdict:'revise',summary:'The value is plausible but folder ownership conflicts with workspace permissions.',value:'Shared organization could reduce duplicate content and repeated navigation.'});
  setAutonomyPolicy(projectRoot,'autonomous');
  let next=nextAction(projectRoot,created.meta.id);
  assert.equal(next.action,'resolve-product-owner-recommendation');
  assert.equal(next.actor,'user');
  assert.equal(next.interaction?.tool,'request_user_input');
  assert.match(next.interaction?.presentation?.markdown || '', /Product value/i);
  assert.match(next.interaction?.presentation?.markdown || '', /folder ownership/i);
  setAutonomyPolicy(projectRoot,'headless');
  next=nextAction(projectRoot,created.meta.id);
  assert.equal(next.action,'headless-stop');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.autonomy.headlessStop,true);
  assert.match(next.autonomy.reason,/human judgment/i);
});

test('Headless does not silently authorize delivery unless merge-local is configured', () => {
  const projectRoot=root(); initProject(projectRoot);
  setAutonomyPolicy(projectRoot,'headless');
  assert.equal(autonomyPolicy(projectRoot).delivery,'ask');
  const status=setAutonomyPolicy(projectRoot,'headless','merge-local');
  assert.equal(status.delivery,'merge-local');
});


test('Autonomous surfaces a user-owned readiness blocker and Headless stops even when no native interaction exists', () => {
  const projectRoot=root(); initProject(projectRoot); readyProjectContext(projectRoot);
  const task=createTask(projectRoot,{title:'Exhausted repair task',type:'task',surfaces:['backend']});
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure one');
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure two');
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure three');
  setAutonomyPolicy(projectRoot,'autonomous');
  let next=nextAction(projectRoot,task.meta.id);
  assert.equal(next.action,'resolve-readiness-blocker');
  assert.equal(next.actor,'user');
  assert.equal(next.interaction,null);
  assert.match(next.autonomy.reason,/repair budget/i);
  setAutonomyPolicy(projectRoot,'headless');
  next=nextAction(projectRoot,task.meta.id);
  assert.equal(next.action,'headless-stop');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.autonomy.headlessStop,true);
  assert.match(next.autonomy.reason,/repair budget/i);
});

test('Headless does not classify ordinary agent/system work as a human-judgment stop', () => {
  const projectRoot=root(); initProject(projectRoot);
  setAutonomyPolicy(projectRoot,'headless');
  const task=createTask(projectRoot,{title:'Normal agent work',type:'task',surfaces:['backend']});
  const result=advanceAutonomy(projectRoot,task.meta.id);
  assert.equal(result.advanced,false);
  assert.equal(result.stopped,false);
  assert.equal(result.action,'blocked'); // CodeGraph is a system-owned deterministic blocker on a fresh project.

  readyProjectContext(projectRoot);
  const stillAgentOwned=advanceAutonomy(projectRoot,task.meta.id);
  assert.equal(stillAgentOwned.advanced,false);
  assert.equal(stillAgentOwned.stopped,false);
  assert.equal(stillAgentOwned.action,'blocked');
});


test('Headless stops when Target Audience configuration requires human product definition', () => {
  const projectRoot=root(); initProject(projectRoot);
  writeFileSync(path.join(projectRoot,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows with understandable controls.\n');
  const configPath=path.join(projectRoot,'.ai/config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence.minPrimaryAudienceProfiles=2;
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const created=createTask(projectRoot,{title:'Audience config gate',type:'feature',surfaces:['frontend']});
  const task=loadTask(findTask(projectRoot,created.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; saveTask(task);
  setAutonomyPolicy(projectRoot,'headless');
  const next=nextAction(projectRoot,created.meta.id);
  assert.equal(next.action,'headless-stop');
  assert.equal(next.actor,'system');
  assert.equal(next.autonomy.headlessStop,true);
  assert.match(next.autonomy.reason,/Target Audience validation/i);
});

test('Guided also routes readiness-only human blockers to the user instead of sending an agent into blocked work', () => {
  const projectRoot=root(); initProject(projectRoot); readyProjectContext(projectRoot);
  const task=createTask(projectRoot,{title:'Guided exhausted repair',type:'task',surfaces:['backend']});
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure one');
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure two');
  registerRepairAttempt(projectRoot,task.meta.id,'builder','failure three');
  const next=nextAction(projectRoot,task.meta.id);
  assert.equal(next.autonomy.level,'guided');
  assert.equal(next.actor,'user');
  assert.equal(next.action,'resolve-readiness-blocker');
  assert.match(next.autonomy.reason,/repair budget/i);
});


test('Autonomous and Headless never ask the user to choose a mechanical Builder phase boundary', () => {
  const autonomousRoot=root(); initProject(autonomousRoot); readyProjectContext(autonomousRoot);
  const autonomousTask=createTask(autonomousRoot,{title:'Autonomous update saved record behavior',type:'task',surfaces:['backend'],size:'small',risk:'low'});
  startRefinement(autonomousRoot,autonomousTask.meta.id); readyBackendSpec(autonomousRoot,autonomousTask.meta.id); completePhase(autonomousRoot,autonomousTask.meta.id);
  setAutonomyPolicy(autonomousRoot,'autonomous');
  advanceAutonomy(autonomousRoot,autonomousTask.meta.id);
  let next=nextAction(autonomousRoot,autonomousTask.meta.id);
  assert.equal(next.action,'provide-stable-session');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  next=nextAction(autonomousRoot,autonomousTask.meta.id,{sessionId:'autonomous-builder'});
  assert.equal(next.action,'enter-phase-boundary');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.runtime.boundary.choice,'continue-current');
  assert.equal(next.runtime.boundary.choiceSessionId,'autonomous-builder');

  const headlessRoot=root(); initProject(headlessRoot); readyProjectContext(headlessRoot);
  const headlessTask=createTask(headlessRoot,{title:'Headless update saved record behavior',type:'task',surfaces:['backend'],size:'small',risk:'low'});
  startRefinement(headlessRoot,headlessTask.meta.id); readyBackendSpec(headlessRoot,headlessTask.meta.id); completePhase(headlessRoot,headlessTask.meta.id);
  setAutonomyPolicy(headlessRoot,'headless');
  advanceAutonomy(headlessRoot,headlessTask.meta.id);
  next=nextAction(headlessRoot,headlessTask.meta.id);
  assert.equal(next.action,'headless-stop');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.match(next.autonomy.reason,/stable host session ID/i);
  next=nextAction(headlessRoot,headlessTask.meta.id,{sessionId:'headless-builder'});
  assert.equal(next.action,'enter-phase-boundary');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.runtime.boundary.choice,'continue-current');
});


function finalProductOwnerAutonomyFixture(projectRoot, title = 'Final autonomy product outcome') {
  initProject(projectRoot); readyProjectContext(projectRoot);
  writeFileSync(path.join(projectRoot,'.ai/project/product.md'),'# Product\n\nA concrete operator product with bounded workflows, explicit value, and low avoidable friction.\n');
  writeFileSync(path.join(projectRoot,'.ai/project/product-owner.md'),'# Project Product Owner\n\nProtect product coherence, user value, bounded complexity, and explicit consequential decisions.\n');
  writeFileSync(path.join(projectRoot,'.ai/project/users.md'),'# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows, understandable controls, and useful outcomes.\n');
  const configPath=path.join(projectRoot,'.ai','config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  config.productIntelligence={...(config.productIntelligence||{}),enabled:true,requireProductOwner:true,requireFinalProductOwnerReview:true,requireTargetAudience:false,minPrimaryAudienceProfiles:1};
  writeFileSync(configPath,`${JSON.stringify(config,null,2)}\n`);
  const created=createTask(projectRoot,{title,type:'design',surfaces:[]});
  const task=loadTask(findTask(projectRoot,created.meta.id));
  task.meta.phase='final-approval'; task.meta.status='awaiting_final_approval'; task.meta.waiting_for='none';
  task.meta.spec_approval='approved'; task.meta.spec_approval_hash='approved-spec'; task.meta.spec_effective_hash='approved-spec'; task.meta.spec_integrity_version=2;
  task.meta.project_governance_hash=projectGovernanceHash(projectRoot);
  task.meta.learning_recorded=true;
  task.meta.route={...task.meta.route,implementation:false,technical_review:'none',qa:'none',target_audience:false,final_customer:false};
  task.body=setSection(task.body,'Need','Confirm that the delivered outcome still serves the approved product value before shipping.');
  saveTask(task);
  return task;
}

test('Guided requires explicit acknowledgement of a clean final Product Owner opinion before final approval', () => {
  const projectRoot=root(); const task=finalProductOwnerAutonomyFixture(projectRoot,'Guided final Product Owner');
  recordFinalProductOwnerReview(projectRoot,task.meta.id,{verdict:'ship',summary:'The delivered outcome remains aligned with the approved product intent and introduces no new product trade-off.',value:'Operators receive the promised outcome with bounded complexity and no avoidable conceptual overhead.'});
  const next=nextAction(projectRoot,task.meta.id);
  assert.equal(next.action,'review-final-product-owner-opinion');
  assert.equal(next.actor,'user');
  assert.equal(next.interaction?.tool,'request_user_input');
  assert.throws(()=>approveFinal(projectRoot,task.meta.id,'Premature final approval'),/requires the user to review and acknowledge the final Product Owner/i);
  resolveFinalProductOwnerDecision(projectRoot,task.meta.id,'proceed','Final product outcome reviewed and accepted.');
  assert.equal(finalProductOwnerReviewStatus(projectRoot,task.meta.id).review?.humanDecision,'proceed');
});

test('Autonomous crosses a clean final Product Owner opinion without adding a human Product Owner gate', () => {
  const projectRoot=root(); const task=finalProductOwnerAutonomyFixture(projectRoot,'Autonomous final Product Owner');
  setAutonomyPolicy(projectRoot,'autonomous');
  recordFinalProductOwnerReview(projectRoot,task.meta.id,{verdict:'ship',summary:'The delivered result preserves the approved product intent without a consequential product trade-off.',value:'The intended operator outcome is delivered with bounded complexity and understandable behavior.'});
  const status=finalProductOwnerReviewStatus(projectRoot,task.meta.id);
  assert.equal(status.valid,true);
  const next=nextAction(projectRoot,task.meta.id);
  assert.notEqual(next.action,'review-final-product-owner-opinion');
  assert.notEqual(next.action,'resolve-final-product-owner-recommendation');
  assert.notEqual(next.recommendedSkill,'ai-flow-product-owner');
});

test('Headless stops on a consequential final Product Owner recommendation instead of inventing a product decision', () => {
  const projectRoot=root(); const task=finalProductOwnerAutonomyFixture(projectRoot,'Headless final Product Owner');
  setAutonomyPolicy(projectRoot,'headless');
  recordFinalProductOwnerReview(projectRoot,task.meta.id,{verdict:'revise',summary:'The implementation is functional but the resulting user flow introduces a consequential product trade-off.',value:'The feature remains valuable only if the avoidable extra interaction is removed.',concerns:['The final workflow adds an unnecessary user step that changes the promised product outcome.']});
  const next=nextAction(projectRoot,task.meta.id);
  assert.equal(next.action,'headless-stop');
  assert.equal(next.actor,'system');
  assert.equal(next.interaction,null);
  assert.equal(next.autonomy.headlessStop,true);
  assert.match(next.autonomy.reason,/human judgment|Product Owner/i);
});
