import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification, startExecution, approveFinal } from '../dist/src/lib/workflow.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
import { acceptanceCoverage, acceptanceCriteria } from '../dist/src/lib/acceptance.js';
import { setBlastRadius, scopeGuardStatus } from '../dist/src/lib/scope-guard.js';
import { proposeAmendment, approveAmendment, listAmendments, effectiveSpecificationHash } from '../dist/src/lib/amendments.js';
import { specificationHash } from '../dist/src/lib/specification.js';
import { taskReadiness } from '../dist/src/lib/readiness.js';
import { writeReviewCockpit } from '../dist/src/lib/cockpit.js';
import { writeReviewBundle } from '../dist/src/lib/review.js';
import { nextAction } from '../dist/src/lib/next.js';
import { readyProjectContext, enterCurrentPhaseBoundary } from './helpers.mjs';

function repo(prefix='specrail-gov-'){const root=mkdtempSync(path.join(tmpdir(),prefix));git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');writeFileSync(path.join(root,'protected.txt'),'locked\n');writeFileSync(path.join(root,'extra.txt'),'extra\n');git(root,['add','.']);git(root,['commit','-m','base']);return root;}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function refine(root,{type='task',surfaces=['backend']}={}){
  initProject(root,{name:'Governance'});readyProjectContext(root);
  const task=createTask(root,{title:'Change the observable contract',type,surfaces,risk:'medium',size:'medium'});startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Change one observable behavior without broadening unrelated code.');
  loaded.body=setSection(loaded.body,'Product Value','Users receive the approved behavior with evidence for every requirement.');
  loaded.body=setSection(loaded.body,'Users','Product users and maintainers.');
  loaded.body=setSection(loaded.body,'Scope','Change only the approved behavior in the identified implementation boundary.');
  loaded.body=setSection(loaded.body,'Out of Scope','Protected files, unrelated refactors, and undocumented behavior changes.');
  loaded.body=setSection(loaded.body,'Acceptance Criteria','- GET /health returns HTTP 200.\n- The response contains status ok.');
  loaded.body=setSection(loaded.body,'Gherkin','Scenario: health\nGiven the service is healthy\nWhen GET /health is requested\nThen HTTP 200 is returned\nAnd status is ok');
  loaded.body=setSection(loaded.body,'QA Mission','Persona: operator\nStarting point: running service\nGoal: verify the public health contract\nAllowed interface: public API\nSuccess: response is 200 and contains status ok\nFailure: either observable condition is missing');
  loaded.body=setSection(loaded.body,'Implementation Plan','1. Change the smallest approved boundary.\n2. Run deterministic verification.');
  saveTask(loaded);if(loaded.meta.route.implementation)setBlastRadius(root,task.meta.id,{allowedFiles:['app.txt'],protectedFiles:['protected.txt'],reason:'Initial expected implementation boundary.'});completePhase(root,task.meta.id);return task.meta.id;
}

test('approval assigns stable acceptance IDs and final readiness requires evidence coverage for every effective criterion',()=>{
  const root=repo(),id=refine(root,{type:'design',surfaces:[]});
  approveSpecification(root,id,'approved');
  let task=loadTask(findTask(root,id));
  assert.deepEqual(acceptanceCriteria(root,id).map(x=>x.id),['AC-001','AC-002']);
  assert.match(task.body,/AC-001:/);assert.match(task.body,/AC-002:/);
  const evidenceDir=path.join(root,'.ai','evidence',id);mkdirSync(evidenceDir,{recursive:true});writeFileSync(path.join(evidenceDir,'proof.txt'),'proof one\n');
  addEvidence(root,id,{kind:'verification-log',path:path.join(evidenceDir,'proof.txt'),source:'test',attributes:{proves:['AC-001']}});
  let coverage=acceptanceCoverage(root,id);assert.equal(coverage.complete,false);assert.deepEqual(coverage.uncovered,['AC-002']);
  task=loadTask(findTask(root,id));task.meta.status='awaiting_final_approval';task.meta.phase='final-approval';task.meta.learning_recorded=true;saveTask(task);
  let readiness=taskReadiness(root,id);assert.equal(readiness.gates.find(x=>x.id==='acceptance-coverage').status,'fail');
  writeFileSync(path.join(evidenceDir,'proof2.txt'),'proof two\n');addEvidence(root,id,{kind:'verification-log-2',path:path.join(evidenceDir,'proof2.txt'),source:'test',attributes:{proves:['AC-002']}});
  coverage=acceptanceCoverage(root,id);assert.equal(coverage.complete,true);
  readiness=taskReadiness(root,id);assert.equal(readiness.gates.find(x=>x.id==='acceptance-coverage').status,'pass');
  assert.doesNotThrow(()=>approveFinal(root,id,'accepted'));
});

test('scope guard seals approved blast radius and detects unexpected/protected changes',()=>{
  const root=repo(),id=refine(root);
  setBlastRadius(root,id,{allowedFiles:['app.txt'],protectedFiles:['protected.txt'],expectedSymbols:['health'],reason:'Only the health boundary is expected to change.'});
  approveSpecification(root,id,'approved');
  let status=scopeGuardStatus(root,id);assert.equal(status.sealed,true);assert.equal(status.valid,true);
  writeFileSync(path.join(root,'app.txt'),'approved change\n');status=scopeGuardStatus(root,id);assert.equal(status.valid,true);assert.deepEqual(status.unexpectedFiles,[]);
  writeFileSync(path.join(root,'outside-new.txt'),'untracked drift\n');status=scopeGuardStatus(root,id);assert.equal(status.valid,false);assert.ok(status.unexpectedFiles.includes('outside-new.txt'));
  writeFileSync(path.join(root,'protected.txt'),'bad change\n');status=scopeGuardStatus(root,id);assert.equal(status.valid,false);assert.ok(status.protectedChanges.includes('protected.txt'));
});

test('approved amendments extend effective acceptance and blast radius without mutating the approved base specification',()=>{
  const root=repo(),id=refine(root);setBlastRadius(root,id,{allowedFiles:['app.txt'],protectedFiles:['protected.txt'],reason:'Base approved boundary.'});approveSpecification(root,id,'approved');
  const base=loadTask(findTask(root,id));const baseHash=base.meta.spec_approval_hash;
  const amendment=proposeAmendment(root,id,{title:'Allow the supporting file',reason:'Implementation discovered a required supporting boundary.',changes:['Add one observable fallback and permit extra.txt.'],acceptanceCriteria:['Fallback returns HTTP 503 when dependency is unavailable.'],allowedFiles:['extra.txt']});
  assert.equal(amendment.status,'proposed');
  assert.throws(()=>startExecution(root,id),/pending amendment/i);
  let readiness=taskReadiness(root,id);assert.equal(readiness.gates.find(x=>x.id==='spec-amendments').status,'fail');
  approveAmendment(root,id,amendment.id,'approved by user');
  const after=loadTask(findTask(root,id));assert.equal(after.meta.spec_approval_hash,baseHash);assert.notEqual(after.meta.spec_effective_hash,baseHash);
  const criteria=acceptanceCriteria(root,id);assert.equal(criteria.length,3);assert.match(criteria[2].text,/503/);
  assert.ok(scopeGuardStatus(root,id).allowedFiles.includes('extra.txt'));
  assert.equal(listAmendments(root,id).filter(x=>x.status==='approved').length,1);
  enterCurrentPhaseBoundary(root,id,'amended-builder');
  assert.doesNotThrow(()=>startExecution(root,id,{sessionId:'amended-builder'}));
});

test('implementation acceptance coverage ignores conceptual before/proposal evidence and Cockpit/Review show governance state',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');
  const dir=path.join(root,'.ai','evidence',id);mkdirSync(dir,{recursive:true});const proposal=path.join(dir,'concept.txt');writeFileSync(proposal,'concept only\n');const sha=createHash('sha256').update(readFileSync(proposal)).digest('hex');
  writeFileSync(path.join(dir,'evidence.json'),JSON.stringify({taskId:id,evidence:[{id:'EV-CONCEPT',kind:'frontend-proposal',path:'concept.txt',source:'image-gen-proposal',label:'Concept proposal',sha256:sha,attributes:{proves:['AC-001','AC-002']}}]},null,2));
  const coverage=acceptanceCoverage(root,id);assert.equal(coverage.complete,false);assert.deepEqual(coverage.uncovered,['AC-001','AC-002']);
  const cockpit=writeReviewCockpit(root,id,'status'),html=readFileSync(cockpit.path,'utf8');assert.match(html,/Acceptance coverage/i);assert.match(html,/Scope Guard \/ blast radius/i);assert.match(html,/AC-001/);
  const bundle=writeReviewBundle(root,id,'spec'),md=readFileSync(bundle.path,'utf8');assert.match(md,/Acceptance Coverage Matrix/);assert.match(md,/Scope Guard \/ Blast Radius/);
});

test('amendment history is integrity checked and tampering is rejected',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');const amendment=proposeAmendment(root,id,{title:'Bounded support change',reason:'A supporting file is required.',changes:['Permit extra.txt.'],allowedFiles:['extra.txt']});
  const file=path.join(root,'.ai','amendments',id,`${amendment.id}.json`),value=JSON.parse(readFileSync(file,'utf8'));value.reason='tampered after proposal';writeFileSync(file,JSON.stringify(value,null,2));
  assert.throws(()=>listAmendments(root,id),/integrity check failed/i);
});



test('pending specification amendment becomes a native user decision with its material scope visible before input',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');
  const amendment=proposeAmendment(root,id,{title:'Expand health fallback',reason:'The approved implementation cannot preserve the public contract without a bounded fallback.',changes:['Return a controlled fallback when the dependency is unavailable.'],acceptanceCriteria:['Fallback returns HTTP 503 when dependency is unavailable.'],allowedFiles:['extra.txt'],protectedFilesRemoved:['protected.txt'],scopeAdditions:['Dependency-unavailable fallback behavior.']});
  const next=nextAction(root,id,{sessionId:'session-amendment'});
  assert.equal(next.actor,'user');assert.equal(next.action,'review-specification-amendment');
  assert.equal(next.interaction.tool,'request_user_input');
  assert.equal(next.interaction.presentation.kind,'specification-amendment-review');
  assert.match(next.interaction.presentation.markdown,/Expand health fallback/);assert.match(next.interaction.presentation.markdown,/AC-A001-01/);assert.match(next.interaction.presentation.markdown,/extra\.txt/);assert.match(next.interaction.presentation.markdown,/protected\.txt/);
  const question=next.interaction.questions[0];assert.equal(question.id,`amendment:${amendment.id}`);assert.deepEqual(question.options.map(item=>item.label),['Aprobar cambio','Rechazar cambio','Revisar / mantener pendiente']);
});

test('amendment decision state is sealed and cannot be promoted by editing JSON',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');const amendment=proposeAmendment(root,id,{title:'Bounded support change',reason:'A supporting file is required.',changes:['Permit extra.txt.'],allowedFiles:['extra.txt']});
  const target=path.join(root,'.ai','amendments',id,`${amendment.id}.json`),value=JSON.parse(readFileSync(target,'utf8'));value.status='approved';value.decidedAt=new Date().toISOString();value.decisionNote='forged approval';writeFileSync(target,JSON.stringify(value,null,2));
  assert.throws(()=>listAmendments(root,id),/decision integrity check failed/i);
  assert.throws(()=>scopeGuardStatus(root,id),/decision integrity check failed/i);
});

test('bounded amendments reject material architecture migration and security changes',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');
  assert.throws(()=>proposeAmendment(root,id,{title:'Schema migration',reason:'Need a database schema change.',changes:['Add a schema migration and backfill.']}),/bounded-change safety boundary.*data migration/i);
  assert.throws(()=>proposeAmendment(root,id,{title:'Authentication change',reason:'Need OAuth authentication.',changes:['Replace the authentication boundary.']}),/bounded-change safety boundary.*security\/privacy/i);
});

test('scope guard rejects a tampered radius artifact even when its old digest is left intact',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');const target=path.join(root,'.ai','scope',`${id}.json`),value=JSON.parse(readFileSync(target,'utf8'));value.allowedFiles.push('outside-new.txt');writeFileSync(target,JSON.stringify(value,null,2));writeFileSync(path.join(root,'outside-new.txt'),'drift\n');
  const status=scopeGuardStatus(root,id);assert.equal(status.sealed,false);assert.equal(status.valid,false);assert.match(status.detail,/digest does not match its contents/i);
});

test('governed .ai project context drift blocks execution after approval',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');const constitution=path.join(root,'.ai','project','constitution.md');writeFileSync(constitution,`${readFileSync(constitution,'utf8')}\nUnauthorized policy change.\n`);
  const status=scopeGuardStatus(root,id);assert.equal(status.governanceValid,false);assert.equal(status.valid,false);assert.match(status.detail,/governed \.ai project context/i);assert.throws(()=>startExecution(root,id),/project governance context changed/i);
  const readiness=taskReadiness(root,id);assert.equal(readiness.gates.find(x=>x.id==='project-governance').status,'stale');
});

test('renaming a protected file remains a protected change even when the destination is allowed',()=>{
  const root=repo(),id=refine(root);setBlastRadius(root,id,{allowedFiles:['app.txt','moved.txt'],protectedFiles:['protected.txt'],reason:'Allow app and destination but preserve protected source.'});approveSpecification(root,id,'approved');git(root,['mv','protected.txt','moved.txt']);
  const status=scopeGuardStatus(root,id);assert.equal(status.valid,false);assert.ok(status.protectedChanges.includes('protected.txt'));
});

test('legacy approved tasks can be explicitly reapproved in place without rebasing their Scope Guard',()=>{
  const root=repo(),id=refine(root);approveSpecification(root,id,'approved');let legacy=loadTask(findTask(root,id));const originalBaseline=legacy.meta.scope_baseline_commit,originalPhase=legacy.meta.phase,originalStatus=legacy.meta.status;
  legacy.meta.spec_integrity_version=1;legacy.meta.project_governance_hash=null;const legacyHash=specificationHash(legacy);legacy.meta.spec_approval_hash=legacyHash;legacy.meta.spec_effective_hash=effectiveSpecificationHash(root,id,legacyHash);saveTask(legacy);
  const next=nextAction(root,id);assert.equal(next.actor,'user');assert.equal(next.action,'reapprove-hardened-specification');assert.equal(next.interaction.tool,'request_user_input');assert.equal(next.interaction.questions[0].options[0].label,'Reaprobar con sello');
  const migrated=approveSpecification(root,id,'explicit migration approval');assert.equal(migrated.meta.spec_integrity_version,2);assert.ok(migrated.meta.project_governance_hash);assert.equal(migrated.meta.scope_baseline_commit,originalBaseline);assert.equal(migrated.meta.phase,originalPhase);assert.equal(migrated.meta.status,originalStatus);assert.notEqual(migrated.meta.spec_approval_hash,legacyHash);
  enterCurrentPhaseBoundary(root,id,'post-migration');
  assert.doesNotThrow(()=>startExecution(root,id,{sessionId:'post-migration'}));
});

test('blast-radius artifacts with invalid content digests cannot be sealed at approval',()=>{
  const root=repo(),id=refine(root),target=path.join(root,'.ai','scope',`${id}.json`),value=JSON.parse(readFileSync(target,'utf8'));value.allowedFiles.push('forged.txt');writeFileSync(target,JSON.stringify(value,null,2));
  assert.throws(()=>approveSpecification(root,id,'approved'),/blast-radius artifact integrity check failed/i);
});

