import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;}
function digest(value){return createHash('sha256').update(stable(value)).digest('hex');}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function repo(){const root=mkdtempSync(path.join(tmpdir(),'specrail-worker-'));git(root,['init','-b','main']);git(root,['config','user.email','test@example.com']);git(root,['config','user.name','SpecRail Test']);writeFileSync(path.join(root,'app.txt'),'base\n');git(root,['add','app.txt']);git(root,['commit','-m','base']);return root;}
function fakeCodex(root){const file=path.join(root,'fake-codex.mjs');writeFileSync(file,`#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nimport path from 'node:path';\nconst args=process.argv.slice(2),i=args.indexOf('--model'),model=i>=0?args[i+1]:'';\nif(process.env.FAKE_MODE==='unavailable-luna'&&model==='gpt-5.6-luna'){console.error('unknown model gpt-5.6-luna');process.exit(5);}\nif(process.env.FAKE_MODE==='ordinary-failure'){console.error('tests failed normally');process.exit(7);}\nif(process.env.FAKE_MODE==='mutate-production')writeFileSync(path.join(process.cwd(),'app.txt'),'worker changed\\n');\nconsole.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'STATUS: COMPLETED\\nCHANGED: none\\nVALIDATED: fake\\nESCALATION: none'},model}));\n`);chmodSync(file,0o755);return file;}
function workerOrder(root,models=['gpt-5.6-luna','gpt-5.6-terra']){const base={schemaVersion:2,id:'WO-ABCDEF123456',taskId:'TASK-0001',phase:'qa-engineer',actor:'ai-flow-qa-engineer',action:'continue',recommendedSkill:'ai-flow-qa-engineer',kind:'verification',requestedModels:models,reasoningEffort:'low',access:'workspace-write',mutationAuthority:'specrail-state-only',cwd:root,authority:{specificationHash:null,qaMissionHash:null,scopeGuardHash:null,decisions:''},capsule:{goal:'validate',scope:'',outOfScope:'',acceptanceCriteria:'',allowedFiles:[],protectedFiles:[],contextFiles:[],contextSymbols:[],stopIf:['material decision']},sourceDigest:'source',createdAt:new Date(0).toISOString()};const order={...base,orderDigest:digest(base)},file=path.join(root,'order.json');writeFileSync(file,`${JSON.stringify(order,null,2)}\n`);return file;}
function run(root,mode,models){const order=workerOrder(root,models),fake=fakeCodex(root);const result=spawnSync(process.execPath,['scripts/specrail-worker.mjs','--order',order,'--host','codex'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,SPEC_RAIL_CODEX_BIN:fake,FAKE_MODE:mode||''}});let payload=null;try{payload=JSON.parse(result.stdout);}catch{}return{process:result,payload};}

test('state-only worker ignores an unchanged pre-existing dirty production file',()=>{
  const root=repo();writeFileSync(path.join(root,'app.txt'),'already dirty\n');const result=run(root,'');
  assert.equal(result.process.status,0,result.process.stderr);assert.deepEqual(result.payload.result.changedFiles,[]);assert.deepEqual(result.payload.result.forbiddenProductionChanges,[]);assert.equal(result.payload.result.status,'completed');
});

test('state-only worker fails when it actually mutates production code',()=>{
  const root=repo(),result=run(root,'mutate-production');
  assert.equal(result.process.status,2);assert.equal(result.payload.result.status,'failed');assert.deepEqual(result.payload.result.forbiddenProductionChanges,['app.txt']);assert.match(result.payload.result.summary,/WORKER_MUTATION_AUTHORITY_VIOLATION/);
});

test('worker falls back Luna to Terra only when Luna is unavailable',()=>{
  const root=repo(),result=run(root,'unavailable-luna');
  assert.equal(result.process.status,0,result.process.stderr);assert.deepEqual(result.payload.result.attempts.map(x=>x.model),['gpt-5.6-luna','gpt-5.6-terra']);assert.equal(result.payload.result.requestedModel,'gpt-5.6-terra');assert.equal(result.payload.result.brainModelFallbackUsed,false);
});

test('ordinary Luna failure does not retry Terra or Brain',()=>{
  const root=repo(),result=run(root,'ordinary-failure');
  assert.equal(result.process.status,7);assert.deepEqual(result.payload.result.attempts.map(x=>x.model),['gpt-5.6-luna']);assert.equal(result.payload.result.brainModelFallbackUsed,false);
});
