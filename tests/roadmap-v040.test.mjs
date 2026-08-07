// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { lintSpecification } from '../dist/src/lib/specification.js';
import { approveSpecification, returnTask, rejectFinal, startExecution } from '../dist/src/lib/workflow.js';
import { addEvidence, validateEvidence, visualEvidenceDigest } from '../dist/src/lib/evidence.js';
import { qaMissionHash } from '../dist/src/lib/qa.js';
import { recordFailure, listEvalCandidates, approveEvalCandidate } from '../dist/src/lib/failures.js';
import { repairStatus } from '../dist/src/lib/repairs.js';
import { taskMetrics } from '../dist/src/lib/metrics.js';
import { addConstitutionPrinciple, checkConstitution } from '../dist/src/lib/constitution.js';
import { qualityPolicy } from '../dist/src/lib/quality.js';
import { operationalPolicy } from '../dist/src/lib/observability.js';
import { createSlicePlan, materializeSlices } from '../dist/src/lib/slices.js';
import { validateTasteBrief } from '../dist/src/lib/taste.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';

const repo=()=>{const root=mkdtempSync(path.join(tmpdir(),'ai-flow-040-'));initProject(root);readyProjectContext(root);return root;};
function fillSpec(root,task,{frontend=false}={}){let t=loadTask(findTask(root,task.meta.id));for(const [h,v] of [['Need','Deliver a concrete observable capability for real users.'],['Product Value','Users can complete the intended outcome with less friction.'],['Users','Primary product users and operators.'],['Scope','Implement only the approved behavior and evidence.'],['Out of Scope','Unrelated redesigns and infrastructure changes.'],['Acceptance Criteria','- A real request or user action produces the specified observable result.\n- Invalid input produces an explicit error without changing state.'],['Implementation Plan','Implement a vertical behavior, tests, evidence, review, and QA.'],['QA Mission','- Persona: primary user\n- Starting point: public product entry point\n- Goal: complete the approved outcome\n- Allowed interface: public UI or API only\n- Success: acceptance criteria pass with real evidence\n- Failure: any blocked path, incorrect result, overflow, or hidden workaround']])t.body=setSection(t.body,h,v);if(frontend)t.body=setSection(t.body,'UI Target','- Route: `/`\n- Target: `section#target`\n- Viewport: `1440x1000`\n- Capture: focused-section');saveTask(t);setDefaultBlastRadius(root,t.meta.id);return loadTask(findTask(root,t.meta.id));}
function evidenceFile(root,id,name,content='report'){const dir=path.join(root,'.ai/evidence',id,'reports');mkdirSync(dir,{recursive:true});const file=path.join(dir,name);writeFileSync(file,content);return file;}

test('QA mission is governed, hashed at approval, and QA evidence must execute the approved mission',()=>{
 const root=repo();let task=createTask(root,{title:'Health behavior',surfaces:['backend'],type:'feature'});task=fillSpec(root,task);
 task.meta.status='awaiting_spec_approval';task.meta.phase='spec-approval';saveTask(task);
 task=approveSpecification(root,task.meta.id);
 assert.match(task.meta.qa_mission_hash,/^[a-f0-9]{64}$/);assert.equal(task.meta.qa_mission_hash,qaMissionHash(task));
 const report=evidenceFile(root,task.meta.id,'qa.md','# QA\n\nMission completed.');
 addEvidence(root,task.meta.id,{kind:'qa-report',path:report,source:'qa-validation',label:'QA',tool:'Codex',missionHash:'bad'});
 assert.ok(validateEvidence(root,task.meta.id,'qa').errors.some(x=>/QA mission hash/i.test(x)));
});

test('repeated failures create a human-approved regression candidate',()=>{
 const root=repo();const a=createTask(root,{title:'A',surfaces:['frontend']}),b=createTask(root,{title:'B',surfaces:['frontend']});
 recordFailure(root,a.meta.id,{phase:'ux-ui-designer',category:'wrong-target',statement:'Screenshot showed page top instead of requested section'});
 const second=recordFailure(root,b.meta.id,{phase:'ux-ui-designer',category:'wrong-target',statement:'Screenshot showed page top instead of requested section'});
 assert.equal(second.evalCandidateCreated,true);const candidates=listEvalCandidates(root);assert.equal(candidates.length,1);assert.equal(candidates[0].status,'candidate');
 const approved=approveEvalCandidate(root,candidates[0].id,'approved by user');assert.equal(approved.status,'active');assert.ok(existsSync(approved.path));
});

test('repair budget blocks repeated returns and asks the user instead of looping forever',()=>{
 const root=repo();let task=createTask(root,{title:'Looping fix',surfaces:['backend'],risk:'low',executionProfile:'fast'});task=fillSpec(root,task);task.meta.status='active';task.meta.phase='technical-reviewer';task.meta.spec_approval='approved';task.meta.spec_approval_hash='x';saveTask(task);
 let last;for(let i=0;i<2;i++)last=returnTask(root,task.meta.id,'builder','Tests still fail in the same way');
 assert.equal(last.meta.status,'blocked');assert.match(last.meta.block_reason,/repair limit/i);assert.equal(repairStatus(root,task.meta.id).exhausted,true);
});

test('structured traces produce local delivery metrics without telemetry',()=>{
 const root=repo();let task=createTask(root,{title:'Measured task',surfaces:['backend']});task=fillSpec(root,task);task.meta.status='awaiting_spec_approval';task.meta.phase='spec-approval';saveTask(task);task=approveSpecification(root,task.meta.id);startExecution(root,task.meta.id,{sessionId:'s1'});
 const metrics=taskMetrics(root,task.meta.id);assert.equal(metrics.taskId,task.meta.id);assert.ok(metrics.events>=2);assert.ok(metrics.phaseEntries.builder>=1);assert.equal(metrics.telemetry,'local-only');
});

test('risk-based visual evaluator is required independently for material UI work',()=>{
 const root=repo();let task=createTask(root,{title:'Major redesign',surfaces:['frontend'],size:'large',risk:'high'});task=fillSpec(root,task,{frontend:true});
 task.meta.route.design=true;saveTask(task);
 const validation=validateEvidence(root,task.meta.id,'pre-approval');assert.ok(validation.missing.includes('visual-proposal-evaluator-report'));
});

test('constitution stores approved mechanical principles and runs deterministic checks',()=>{
 const root=repo();const added=addConstitutionPrinciple(root,{id:'CONST-001',title:'Tests stay green',statement:'The test suite must pass.',scope:['**'],enforcement:{kind:'command',command:`${process.execPath} -e "process.exit(0)"`},approvedBy:'user',approvalRef:'request-user-input:CONST-001'});assert.equal(added.status,'active');
 const report=checkConstitution(root,{stage:'review'});assert.equal(report.valid,true);assert.equal(report.results[0].exitCode,0);assert.ok(existsSync(report.path));
});

test('property, mutation, and operational evidence policies are selected by risk',()=>{
 const root=repo();const high=createTask(root,{title:'Critical pricing engine',surfaces:['backend','data'],size:'large',risk:'critical'});const q=qualityPolicy(high);assert.equal(q.propertyTesting,'required');assert.equal(q.mutationTesting,'required');
 const ops=operationalPolicy(high);assert.equal(ops.level,'full');assert.deepEqual(ops.requiredEvidence,['operational-log','operational-trace','operational-metrics']);
});

test('large features are materialized as approved vertical slices',()=>{
 const root=repo();let parent=createTask(root,{title:'Large routes feature',type:'feature',surfaces:['frontend','backend'],size:'large',risk:'medium'});parent=fillSpec(root,parent,{frontend:true});
 const plan=createSlicePlan(root,parent.meta.id,[{title:'Create one route end to end',outcome:'A user creates and sees one route',surfaces:['frontend','backend'],acceptance:['Route is persisted and visible'],evidence:['frontend-after','backend-demo']},{title:'Share one route end to end',outcome:'A user shares a route',surfaces:['frontend','backend'],acceptance:['Public link opens the route'],evidence:['frontend-after','backend-demo']}]);
 assert.equal(plan.slices.length,2);const result=materializeSlices(root,parent.meta.id);assert.equal(result.children.length,2);assert.ok(result.children.every(x=>x.meta.parent_id===parent.meta.id));
});

test('Taste Skill contract selects the official skills for Codex redesign and image-first implementation',()=>{
 const root=repo(),base=path.join(root,'.agents','skills');for(const name of ['design-taste-frontend','gpt-taste','redesign-existing-projects','imagegen-frontend-web','image-to-code']){const dir=path.join(base,name);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'SKILL.md'),`---\nname: ${name}\ndescription: official Taste Skill workflow\n---\n# ${name}\n`);}
 const brief={schemaVersion:2,agent:'codex',taskMode:'redesign',surface:'web',skills:['design-taste-frontend','gpt-taste','redesign-existing-projects','imagegen-frontend-web','image-to-code'].map(name=>({name,path:path.join(base,name,'SKILL.md')})),briefInference:{pageKind:'homepage section',audience:'visitors',direction:'editorial',variance:5,density:4,motion:2},locks:{color:'single-accent',shape:'consistent',theme:'light'},auditFirst:true,preflightPassed:true};
 assert.deepEqual(validateTasteBrief(brief),[]);
});
