import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { intelligenceRecommendation } from '../dist/src/lib/intelligence-routing.js';
import { summarizeIntelligenceUsage, validateIntelligenceUsage } from '../dist/src/lib/intelligence-metrics.js';

function task({ phase='product-specifier', type='feature', risk='medium', profile='standard', architecture=false, database=false, workflowMode='standard' }={}) {
  return {path:'/tmp/TASK-0001.md',body:'',meta:{id:'TASK-0001',title:'Brain worker test',type,status:'refining',phase,size:'medium',risk,execution_profile:'standard',workflow_mode:workflowMode,surfaces:['backend'],route:{design:false,architecture,database,implementation:true,technical_review:profile==='rigorous'?'full':'focused',qa:'focused',target_audience:false,final_customer:false,mutation_testing:false,property_testing:'none',observability:'none',control_profile:profile},spec_approval:'pending',spec_approval_hash:null,spec_approved_at:null,qa_mission_hash:null,delivery_strategy:'single',slice_ids:[],final_approval:'pending',waiting_for:'none',open_questions:0,learning_recorded:false,dependencies:[],resume_status:null,resume_phase:null,worktree_path:null,worktree_branch:null,worktree_base:null,delivery_status:'pending',created_at:new Date(0).toISOString(),updated_at:new Date(0).toISOString()}};
}

test('normal specification is delegated to a cheaper isolated worker with an exact host launch capsule',()=>{
  const result=intelligenceRecommendation(task(),{actor:'ai-flow-product-specifier',action:'bootstrap-project-and-refine',recommendedSkill:'ai-flow-product-specifier'});
  assert.equal(result.tier,'worker');
  assert.equal(result.orchestration,'brain-workers');
  assert.deepEqual(result.worker.preferredModels,['gpt-5.6-luna','gpt-5.6-terra']);
  assert.equal(result.worker.allowBrainModelFallback,false);
  assert.equal(result.worker.requireModelAttestation,true);
  assert.equal(result.worker.isolatedContext,true);
  assert.equal(result.workerLaunch.required,true);
  assert.equal(result.workerLaunch.codex.command,'specrail-worker');
  assert.deepEqual(result.workerLaunch.codex.args,['--task','TASK-0001','--actor','ai-flow-product-specifier','--action','bootstrap-project-and-refine','--skill','ai-flow-product-specifier','--host','codex']);
  assert.deepEqual(result.workerLaunch.pi,{tool:'specrail_worker',args:{task:'TASK-0001',actor:'ai-flow-product-specifier',action:'bootstrap-project-and-refine',skill:'ai-flow-product-specifier'}});
});

test('architecture facts may be delegated but the material architecture decision stays Brain-owned',()=>{
  const source=task({type:'architecture',architecture:true});
  assert.equal(intelligenceRecommendation(source,{actor:'ai-flow-product-specifier',action:'continue',recommendedSkill:'ai-flow-product-specifier'}).tier,'worker');
  source.meta.phase='technical-architecture';
  const architect=intelligenceRecommendation(source,{actor:'ai-flow-technical-reviewer',action:'continue',recommendedSkill:'ai-flow-technical-reviewer'});
  assert.equal(architect.tier,'brain');
  assert.equal(architect.workerLaunch,null);
  assert.match(architect.reason,/architecture|data/i);
});

test('Product Intelligence bootstrap is worker work while Product Owner judgment stays in Brain',()=>{
  const bootstrap=intelligenceRecommendation(task(),{actor:'ai-flow-product-owner',action:'bootstrap-product-intelligence-context',recommendedSkill:'ai-flow-product-owner'});
  assert.equal(bootstrap.tier,'worker');
  assert.equal(bootstrap.worker.kind,'project-bootstrap');
  const owner=intelligenceRecommendation(task(),{actor:'ai-flow-product-owner',action:'product-owner-review',recommendedSkill:'ai-flow-product-owner'});
  assert.equal(owner.tier,'brain');
  assert.equal(owner.workerLaunch,null);
});

test('Builder is worker-owned even for rigorous high-risk implementation, with governed stop conditions',()=>{
  const result=intelligenceRecommendation(task({phase:'builder',risk:'high',profile:'rigorous',architecture:true}),{actor:'ai-flow-builder',action:'continue',recommendedSkill:'ai-flow-builder'});
  assert.equal(result.tier,'worker');
  assert.equal(result.worker.kind,'implementation');
  assert.equal(result.worker.allowBrainModelFallback,false);
  assert.ok(result.worker.stopIf.some(item=>/architecture|contract|security/i.test(item)));
});

test('human and deterministic gates invoke neither Brain nor Worker',()=>{
  const human=intelligenceRecommendation(task(),{actor:'user',action:'approve-or-refine-specification',recommendedSkill:null});
  assert.equal(human.tier,'none');assert.equal(human.workerLaunch,null);
  const system=intelligenceRecommendation(task(),{actor:'system',action:'autonomy-advance',recommendedSkill:null});
  assert.equal(system.tier,'none');assert.equal(system.workerLaunch,null);
});

test('worker launcher pins models explicitly and forbids recursive agents and silent Brain fallback',()=>{
  const launcher=readFileSync(path.join(process.cwd(),'scripts','specrail-worker.mjs'),'utf8');
  assert.match(launcher,/--model/);
  assert.match(launcher,/--no-session/);
  assert.match(launcher,/--ephemeral/);
  assert.match(launcher,/Do not spawn another worker\/subagent/i);
  assert.match(launcher,/brainModelFallbackUsed:false/);
  assert.match(launcher,/forbiddenProductionChanges/);
});

test('token summary measures Brain vs Worker composition without double-counting cached/reasoning tokens',()=>{
  const summary=summarizeIntelligenceUsage([
    {source:'host-reported',owner:'worker',phase:'builder',actor:'ai-flow-builder',model:'gpt-5.6-luna',modelAttested:true,modelAttestation:'runtime-metadata',inputTokens:8000,cachedInputTokens:3000,outputTokens:2000,reasoningTokens:400},
    {source:'host-reported',owner:'brain',phase:'product-specifier',actor:'ai-flow-product-owner',model:'gpt-5.6-sol',inputTokens:1200,cachedInputTokens:200,outputTokens:300,reasoningTokens:100}
  ]);
  assert.equal(summary.totalTokens,11500);
  assert.equal(summary.workerTokens,10000);
  assert.equal(summary.brainTokens,1500);
  assert.equal(summary.uncachedInputTokens,6000);
  assert.equal(summary.reasoningTokens,500);
  assert.equal(summary.brainTokenShare,1500/11500);
  assert.equal(summary.workerCalls,1);
  assert.equal(summary.brainCalls,1);
  assert.equal(summary.workerAttestationCoverage,1);
});

test('worker token accounting fails closed without model attestation',()=>{
  assert.throws(()=>validateIntelligenceUsage({source:'host-reported',owner:'worker',phase:'builder',actor:'builder',model:'gpt-5.6-luna',modelAttested:false,inputTokens:100,cachedInputTokens:0,outputTokens:10}),/requires verified model attestation/i);
  assert.throws(()=>validateIntelligenceUsage({source:'host-reported',owner:'worker',phase:'builder',actor:'builder',model:'x',modelAttested:true,inputTokens:100,cachedInputTokens:101,outputTokens:10}),/cached input tokens cannot exceed input tokens/i);
});
