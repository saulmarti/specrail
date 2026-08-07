import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { recordFailure, listEvalCandidates } from '../dist/src/lib/failures.js';
import { registerRepairAttempt } from '../dist/src/lib/repairs.js';
import { recordTrace, listTrace, validateTrace } from '../dist/src/lib/trace.js';
import { taskMetrics } from '../dist/src/lib/metrics.js';
import { addConstitutionPrinciple } from '../dist/src/lib/constitution.js';
import { createSlicePlan, materializeSlices } from '../dist/src/lib/slices.js';
import { projectGovernanceHash } from '../dist/src/lib/project-governance.js';

const repo=()=>{const root=mkdtempSync(path.join(tmpdir(),'ai-flow-roadmap-int-'));initProject(root);return root;};

test('failure-to-eval uses the configured threshold instead of a hard-coded count',()=>{
  const root=repo(),configPath=path.join(root,'.ai','config.json'),config=JSON.parse(readFileSync(configPath,'utf8'));config.failures.evalThreshold=3;writeFileSync(configPath,JSON.stringify(config,null,2));
  const ids=['A','B','C'].map(title=>createTask(root,{title,surfaces:['frontend']}).meta.id);
  for(let i=0;i<2;i++){const result=recordFailure(root,ids[i],{phase:'ux-ui-designer',category:'wrong-target',statement:'Focused capture showed the page top instead of the approved section'});assert.equal(result.evalCandidateCreated,false);}
  assert.equal(recordFailure(root,ids[2],{phase:'ux-ui-designer',category:'wrong-target',statement:'Focused capture showed the page top instead of the approved section'}).evalCandidateCreated,true);
  assert.equal(listEvalCandidates(root).length,1);
});

test('repair budget stops on the configured Nth failed attempt, not one attempt later',()=>{
  const root=repo(),task=createTask(root,{title:'Finite repair',executionProfile:'fast'});
  const first=registerRepairAttempt(root,task.meta.id,'builder','same deterministic failure');assert.equal(first.exhausted,false);
  const second=registerRepairAttempt(root,task.meta.id,'builder','same deterministic failure');assert.equal(second.limit,2);assert.equal(second.exhausted,true);
});

test('trace branches preserve per-session parent chains for subagents and compaction',()=>{
  const root=repo(),task=createTask(root,{title:'Branch trace'});
  const a1=recordTrace(root,task,'phase-entered',{},'session-a');
  const b1=recordTrace(root,task,'phase-entered',{},'session-b');
  const a2=recordTrace(root,task,'tool-finished',{},'session-a');
  assert.equal(b1.parentEventId,a1.eventId); // first branch forks from current shared state
  assert.equal(a2.parentEventId,a1.eventId); // continuation stays on its branch, not session-b
  assert.equal(new Set(listTrace(root,task.meta.id).map(item=>item.branchId)).size,2);
});

test('local metrics expose delivery speed, retries, failures, branches, and context without telemetry',()=>{
  const root=repo(),task=createTask(root,{title:'Metric task',surfaces:['backend']});
  recordTrace(root,task,'refinement-started',{},'main-chat');recordTrace(root,task,'question-added',{},'main-chat');recordTrace(root,task,'repair-attempt',{reason:'failing test'},'builder-agent');
  recordFailure(root,task.meta.id,{phase:'qa-engineer',category:'test-failure',statement:'The documented negative request still returns HTTP 200'});
  const metrics=taskMetrics(root,task.meta.id);
  assert.equal(metrics.telemetry,'local-only');assert.equal(metrics.branches,2);assert.equal(metrics.questions,1);assert.equal(metrics.repairAttempts,1);assert.equal(metrics.failureCategories['test-failure'],1);assert.equal(metrics.qaReturns,1);assert.ok('timeToSpecApprovalSeconds' in metrics);
});

test('constitution principles require an explicit native user approval reference',()=>{
  const root=repo(),base={id:'CONST-001',title:'No direct DB in handlers',statement:'HTTP handlers cannot access database clients directly.',scope:['src/http/**'],enforcement:{kind:'command',command:`${process.execPath} -e "process.exit(0)"`},approvedBy:'user'};
  assert.throws(()=>addConstitutionPrinciple(root,{...base,approvalRef:''}),/approval reference/i);
  const result=addConstitutionPrinciple(root,{...base,approvalRef:'request_user_input:constitution:CONST-001'});assert.equal(result.approvalRef,'request_user_input:constitution:CONST-001');
});

test('large features materialize demonstrable slices with their approved dependency DAG',()=>{
  const root=repo(),parent=createTask(root,{title:'Large end-to-end feature',type:'feature',size:'large',surfaces:['frontend','backend']});
  createSlicePlan(root,parent.meta.id,[
    {title:'Create first useful record',outcome:'A user creates and immediately sees one record',surfaces:['frontend','backend'],acceptance:['Record is persisted and visible'],evidence:['frontend-after','backend-demo'],dependsOn:[]},
    {title:'Share the useful record',outcome:'A user shares the previously created record publicly',surfaces:['frontend','backend'],acceptance:['Public link opens the same record'],evidence:['frontend-after','backend-demo'],dependsOn:['SLICE-01']}
  ]);
  const {children}=materializeSlices(root,parent.meta.id);assert.equal(children.length,2);
  const second=loadTask(findTask(root,children[1].meta.id));assert.deepEqual(second.meta.dependencies,[children[0].meta.id]);
});

test('vertical slice plans reject cyclic delivery dependencies',()=>{
  const root=repo(),parent=createTask(root,{title:'Cyclic feature',type:'feature',size:'large',surfaces:['frontend','backend']});
  assert.throws(()=>createSlicePlan(root,parent.meta.id,[
    {title:'A',outcome:'A user completes outcome A successfully',surfaces:['frontend'],acceptance:['A works'],evidence:['frontend-after'],dependsOn:['SLICE-02']},
    {title:'B',outcome:'A user completes outcome B successfully',surfaces:['backend'],acceptance:['B works'],evidence:['backend-demo'],dependsOn:['SLICE-01']}
  ]),/acyclic/i);
});

import { approveEvalCandidate, applicableActiveEvals } from '../dist/src/lib/failures.js';
import { nextAction } from '../dist/src/lib/next.js';
import { writeReviewBundle } from '../dist/src/lib/review.js';
import { addEvidence, listEvidence } from '../dist/src/lib/evidence.js';
import { acquireTaskLease } from '../dist/src/lib/lease.js';
import { completePhase } from '../dist/src/lib/workflow.js';
import { specificationHash } from '../dist/src/lib/specification.js';
import { qaMissionHash } from '../dist/src/lib/qa.js';

function reportFile(root,id,name,content='evidence'){const target=path.join(root,'.ai','evidence',id,'reports',name);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,content,{flag:'w'});return target;}

test('approved regression evals are routed into future matching phases and review bundles',()=>{
  const root=repo(),a=createTask(root,{title:'Original A',surfaces:['frontend']}),b=createTask(root,{title:'Original B',surfaces:['frontend']});
  const statement='The focused screenshot showed page top instead of the approved section';
  recordFailure(root,a.meta.id,{phase:'ux-ui-designer',category:'wrong-target',statement});const second=recordFailure(root,b.meta.id,{phase:'ux-ui-designer',category:'wrong-target',statement});
  approveEvalCandidate(root,second.evalCandidateId,'approved through native user input');
  const future=createTask(root,{title:'Future redesign',surfaces:['frontend']});let loaded=loadTask(findTask(root,future.meta.id));loaded.meta.phase='ux-ui-designer';loaded.meta.status='refining';saveTask(loaded)
  const active=applicableActiveEvals(root,{phase:'ux-ui-designer',surfaces:['frontend']});assert.equal(active.length,1);
  const next=nextAction(root,future.meta.id);assert.equal(next.activeEvals.length,1);assert.equal(next.activeEvals[0].category,'wrong-target');
  const bundle=writeReviewBundle(root,future.meta.id,'spec');assert.match(readFileSync(bundle.path,'utf8'),/Active regression evals/);
});

test('review bundle exposes QA mission, quality, operations, vertical slices, and constitution impact',()=>{
  const root=repo(),task=createTask(root,{title:'Governed feature',type:'feature',size:'large',surfaces:['backend']});let loaded=loadTask(findTask(root,task.meta.id));
  for(const [heading,text] of [['QA Mission','- Persona: operator\n- Starting point: API\n- Goal: complete operation\n- Allowed interface: public API\n- Success: HTTP 200\n- Failure: any error'],['Quality Strategy','Mutation testing required at 80%.'],['Operational Evidence','Logs and metrics from staging.'],['Vertical Slices','Slice 1 delivers an observable operation.'],['Constitution Impact','No new principle.']])loaded.body=loaded.body.replace(`## ${heading}\n\n`, `## ${heading}\n\n${text}\n\n`);
  writeFileSync(loaded.path,`---\n${Object.entries(loaded.meta).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${loaded.body}`); // save through parser-compatible path is not needed for bundle source read
  const bundle=writeReviewBundle(root,task.meta.id,'spec'),text=readFileSync(bundle.path,'utf8');
  for(const heading of ['QA Mission','Quality Strategy','Operational Evidence','Vertical Slices','Constitution Impact'])assert.match(text,new RegExp(`## ${heading}`));
});

test('risk evidence requires meaningful property, mutation, and operational metadata',()=>{
  const root=repo(),task=createTask(root,{title:'Critical operation',surfaces:['backend','performance'],risk:'critical',size:'large'}),id=task.meta.id;
  const property=reportFile(root,id,'property.txt','100 generated cases passed');
  assert.throws(()=>addEvidence(root,id,{kind:'property-test-report',path:property,source:'executed-command',tool:'fast-check',command:'npm test',exitCode:0}),/generatedCases|framework/i);
  addEvidence(root,id,{kind:'property-test-report',path:property,source:'executed-command',tool:'fast-check',command:'npm test',exitCode:0,attributes:{generatedCases:100,framework:'fast-check'}});
  const mutation=reportFile(root,id,'mutation.txt','score 72');
  assert.throws(()=>addEvidence(root,id,{kind:'mutation-test-report',path:mutation,source:'executed-command',tool:'stryker',command:'npm run mutation',exitCode:0,attributes:{score:72,threshold:80,totalMutants:50}}),/below/i);
  writeFileSync(mutation,'score 91');addEvidence(root,id,{kind:'mutation-test-report',path:mutation,source:'executed-command',tool:'stryker',command:'npm run mutation',exitCode:0,attributes:{score:91,threshold:80,totalMutants:50}});
  const log=reportFile(root,id,'runtime.log','request completed');
  assert.throws(()=>addEvidence(root,id,{kind:'operational-log',path:log,source:'executed-command',tool:'app',command:'npm run smoke',exitCode:0}),/environment|scenario/i);
  writeFileSync(log,'request completed with correlation abc');addEvidence(root,id,{kind:'operational-log',path:log,source:'executed-command',tool:'app',command:'npm run smoke',exitCode:0,attributes:{environment:'local-test',scenario:'health endpoint load'}});
});

test('active constitution checks can be registered by technical review without fake command metadata',()=>{
  const root=repo();addConstitutionPrinciple(root,{id:'CONST-002',title:'Build passes',statement:'Build command passes.',scope:['**'],enforcement:{kind:'command',command:`${process.execPath} -e "process.exit(0)"`},approvedBy:'user',approvalRef:'request_user_input:CONST-002'});
  let task=createTask(root,{title:'Reviewed change',surfaces:[]});task=loadTask(findTask(root,task.meta.id));
  task.body=setSection(task.body,'QA Mission','- Persona: reviewer\n- Starting point: public docs\n- Goal: verify change\n- Allowed interface: public docs\n- Success: result is present\n- Failure: result missing');
  task.meta.spec_approval='approved';task.meta.spec_integrity_version=2;task.meta.project_governance_hash=projectGovernanceHash(root);task.meta.status='review';task.meta.phase='technical-reviewer';task.meta.route.qa='none';task.meta.route.final_customer=false;task.meta.spec_approval_hash=specificationHash(task);task.meta.qa_mission_hash=qaMissionHash(task);saveTask(task);
  acquireTaskLease(root,task.meta.id,{sessionId:'review-session',phase:'technical-reviewer'});
  const report=reportFile(root,task.meta.id,'technical.md','# Review\n\nPass');addEvidence(root,task.meta.id,{kind:'technical-review-report',path:report,source:'technical-review',tool:'Codex'});
  completePhase(root,task.meta.id,{sessionId:'review-session'});assert.ok(listEvidence(root,task.meta.id).some(item=>item.kind==='constitution-report'));
});


test('Prime-inspired traces capture taskset, harness, runtime, branch ancestry, and tamper evidence',()=>{
  const root=repo(),task=createTask(root,{title:'Auditable trace',surfaces:['frontend','backend']});
  const rootEvent=recordTrace(root,task,'refinement-started',{note:'start'},{sessionId:'main',actor:'product-specifier',skills:['ai-flow-product-specifier'],tools:['specrail-cli','codegraph-mcp']});
  const branchEvent=recordTrace(root,task,'subagent-started',{goal:'inspect UI'},{sessionId:'ui-reviewer',branchId:'ui-review',parentEventId:rootEvent.eventId,actor:'technical-reviewer',skills:['ai-flow-technical-reviewer'],tools:['specrail-cli','codegraph-mcp','browser']});
  assert.equal(branchEvent.parentEventId,rootEvent.eventId);
  assert.equal(branchEvent.harness.name,'specrail');
  assert.deepEqual(branchEvent.harness.skills,['ai-flow-technical-reviewer']);
  assert.equal(branchEvent.runtime.repositoryRoot,path.resolve(root));
  assert.ok(branchEvent.taskset.digest);
  assert.equal(validateTrace(root,task.meta.id).valid,true);
  const tracePath=path.join(root,'.ai','runtime','traces',`${task.meta.id}.jsonl`);
  const lines=readFileSync(tracePath,'utf8').trim().split('\n');
  const tampered=JSON.parse(lines[1]);tampered.data.goal='different goal';lines[1]=JSON.stringify(tampered);writeFileSync(tracePath,`${lines.join('\n')}\n`);
  const validation=validateTrace(root,task.meta.id);
  assert.equal(validation.valid,false);
  assert.match(validation.errors.join(' '),/event hash mismatch/i);
});
