import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const pkg=path.resolve('.'),launcher=path.join(pkg,'scripts/specrail-fast.sh'),cli=path.join(pkg,'dist/src/cli.js');
function run(cmd,args,{cwd=pkg,env={}}={}){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',env:{...process.env,...env},timeout:15000});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr||r.stdout}`);return r.stdout;}
function repo(){const root=mkdtempSync(path.join(tmpdir(),'specrail-runtime-'));run('git',['init','-q'],{cwd:root});run('git',['config','user.email','test@example.com'],{cwd:root});run('git',['config','user.name','Test'],{cwd:root});writeFileSync(path.join(root,'README.md'),'# fixture\n');run('git',['add','.'],{cwd:root});run('git',['commit','-qm','init'],{cwd:root});return root;}
function direct(root,...args){return run(process.execPath,[cli,...args,'--root',root]);}
function fast(root,...args){return run(launcher,[...args,'--root',root]);}
function stop(root){spawnSync(launcher,['runtime-stop','--root',root],{encoding:'utf8'});}
function asyncFast(root,...args){return new Promise((resolve,reject)=>{const cp=spawn(launcher,[...args,'--root',root],{encoding:'utf8'});let out='',err='';cp.stdout.on('data',d=>out+=d);cp.stderr.on('data',d=>err+=d);cp.on('error',reject);cp.on('close',code=>code===0?resolve(out):reject(new Error(err||`exit ${code}`)));});}

test('resident dispatcher preserves the full TypeScript argv parser for generic commands',()=>{
  const root=repo();try{
    fast(root,'init','--name','Runtime');
    JSON.parse(fast(root,'create','Multi','word','task','title'));
    const before=JSON.parse(fast(root,'runtime-status')),status=JSON.parse(fast(root,'status','Multi','word','task','title'));
    assert.equal(status.title,'Multi word task title');
    JSON.parse(fast(root,'patch','TASK-0001','--json-data','{\"size\":\"medium\"}'));
    const after=JSON.parse(fast(root,'runtime-status')),patched=JSON.parse(fast(root,'status','TASK-0001'));
    assert.equal(patched.id,'TASK-0001');assert.equal(before.pid,after.pid,'generic mutating and read commands reuse one runtime process');
  } finally { stop(root); }
});


test('stale startup locks are recovered instead of permanently forcing cold fallback',()=>{
  const root=repo();direct(root,'init');
  const build=readFileSync(path.join(pkg,'dist/.specrail-build-id'),'utf8').trim().slice(0,16),lock=path.join(root,'.ai/runtime',`specrail-start-${build}.lock`);
  mkdirSync(lock,{recursive:true});writeFileSync(path.join(lock,'pid'),'99999999\n');
  try{assert.ok(Array.isArray(JSON.parse(fast(root,'list'))));assert.equal(JSON.parse(fast(root,'runtime-status')).ok,true);}finally{stop(root);}
});



test('an old startup lock is recovered even if its PID has been reused by a live unrelated process',()=>{
  const root=repo();direct(root,'init');
  const build=readFileSync(path.join(pkg,'dist/.specrail-build-id'),'utf8').trim().slice(0,16),lock=path.join(root,'.ai/runtime',`specrail-start-${build}.lock`);
  mkdirSync(lock,{recursive:true});writeFileSync(path.join(lock,'pid'),`${process.pid}\n`);writeFileSync(path.join(lock,'created_at'),`${Math.floor(Date.now()/1000)-60}\n`);
  try{assert.ok(Array.isArray(JSON.parse(fast(root,'list'))));assert.equal(JSON.parse(fast(root,'runtime-status')).ok,true);}finally{stop(root);}
});

test('a busy resident runtime is never mistaken for a dead runtime by a concurrent launcher',async()=>{
  const root=repo();direct(root,'init');mkdirSync(path.join(root,'.codegraph'),{recursive:true});
  const fakeDir=mkdtempSync(path.join(tmpdir(),'specrail-slow-codegraph-')),fake=path.join(fakeDir,'codegraph');
  writeFileSync(fake,`#!/usr/bin/env node\nconst fs=require('fs'),path=require('path');const a=process.argv.slice(2),c=a[0],target=path.resolve(a.find(x=>!x.startsWith('-')&&x!==c)||process.cwd());if(a[1]==='--help'){console.log(c==='index'?'Usage: index --force --quiet':'Usage: '+c);process.exit(0)}if(c==='--version'){console.log('codegraph 1.0.0');process.exit(0)}if(c==='status'){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200);console.log('healthy');process.exit(0)}if(c==='sync'){console.log('synced');process.exit(0)}if(c==='init'){fs.mkdirSync(path.join(target,'.codegraph'),{recursive:true});console.log('initialized');process.exit(0)}if(c==='index'){console.log('indexed');process.exit(0)}process.exit(2);\n`);chmodSync(fake,0o755);
  const env={...process.env,AI_FLOW_CODEGRAPH_COMMAND:fake,SPEC_RAIL_RUNTIME_IDLE_MS:'60000'};
  const invoke=(args)=>new Promise((resolve,reject)=>{const cp=spawn(launcher,[...args,'--root',root],{encoding:'utf8',env});let out='',err='';cp.stdout.on('data',d=>out+=d);cp.stderr.on('data',d=>err+=d);cp.on('error',reject);cp.on('close',code=>code===0?resolve(out):reject(new Error(err||`exit ${code}`)));});
  try{
    await invoke(['list']);const before=JSON.parse(run(launcher,['runtime-status','--root',root],{env}));
    const slow=invoke(['preflight','--force']);await new Promise(r=>setTimeout(r,150));const queued=invoke(['list']);
    const [slowOut,listOut]=await Promise.all([slow,queued]);assert.equal(JSON.parse(slowOut).ok,true);assert.ok(Array.isArray(JSON.parse(listOut)));
    const after=JSON.parse(run(launcher,['runtime-status','--root',root],{env}));assert.equal(after.pid,before.pid,'busy runtime must keep sole ownership of the repository dispatcher');
  } finally {spawnSync(launcher,['runtime-stop','--root',root],{encoding:'utf8',env});}
});

test('concurrent launchers converge on one resident runtime',async()=>{
  const root=repo();direct(root,'init');
  try{const [a,b]=await Promise.all([asyncFast(root,'list'),asyncFast(root,'list')]);assert.deepEqual(JSON.parse(a),JSON.parse(b));const first=JSON.parse(fast(root,'runtime-status')),second=JSON.parse(fast(root,'runtime-status'));assert.equal(first.pid,second.pid);}finally{stop(root);}
});


test('resident dispatcher preserves per-invocation cwd for relative CLI file arguments',()=>{
  const root=repo(),one=mkdtempSync(path.join(tmpdir(),'specrail-cwd-one-')),two=mkdtempSync(path.join(tmpdir(),'specrail-cwd-two-'));
  direct(root,'init');direct(root,'create','Original title');
  writeFileSync(path.join(one,'scope.json'),JSON.stringify({allowedFiles:['one/**'],protectedFiles:[],expectedSymbols:[],reason:'scope from cwd one'}));
  writeFileSync(path.join(two,'scope.json'),JSON.stringify({allowedFiles:['two/**'],protectedFiles:[],expectedSymbols:[],reason:'scope from cwd two'}));
  const invoke=(cwd)=>run(launcher,['scope','set','TASK-0001','--file','scope.json','--root',root],{cwd});
  try{assert.equal(JSON.parse(invoke(one)).reason,'scope from cwd one');assert.equal(JSON.parse(invoke(two)).reason,'scope from cwd two');}finally{stop(root);}
});

test('resident dispatcher refreshes SpecRail session environment on every invocation',()=>{
  const root=repo();direct(root,'init');direct(root,'create','Lease env task');
  const invoke=(session,...args)=>run(launcher,[...args,'--root',root],{env:{AI_FLOW_SESSION_ID:session,SPEC_RAIL_RUNTIME_IDLE_MS:'60000'}});
  try{
    const first=JSON.parse(invoke('session-a','lease','acquire','TASK-0001'));assert.equal(first.owner,'session-a');
    JSON.parse(run(launcher,['lease','release','TASK-0001','--force','--root',root],{env:{SPEC_RAIL_RUNTIME_IDLE_MS:'60000'}}));
    const second=JSON.parse(invoke('session-b','lease','acquire','TASK-0001'));assert.equal(second.owner,'session-b');
  }finally{stop(root);}
});

test('resident runtime retires after the configured idle interval',async()=>{
  const root=repo();direct(root,'init');const env={SPEC_RAIL_RUNTIME_IDLE_MS:'1000'};
  try{JSON.parse(run(launcher,['list','--root',root],{env}));assert.equal(JSON.parse(run(launcher,['runtime-status','--root',root],{env})).ok,true);await new Promise(resolve=>setTimeout(resolve,1400));assert.equal(JSON.parse(run(launcher,['runtime-status','--root',root],{env})).ok,false);}finally{stop(root);}
});

test('next, readiness and interaction remain separate CLI operations without transport metadata in their bodies',()=>{
  const root=repo();try{
    fast(root,'init');fast(root,'create','Backend','fixture','--surfaces','backend');
    const readiness=JSON.parse(fast(root,'readiness','TASK-0001')),next=JSON.parse(fast(root,'next','TASK-0001')),interaction=JSON.parse(fast(root,'interaction','TASK-0001'));
    assert.equal(readiness.taskId,'TASK-0001');assert.equal('task' in readiness,false);
    assert.equal(next.task,'TASK-0001');assert.ok(next.readiness); // existing next contract intentionally references readiness
    assert.equal('readiness' in interaction,false);assert.ok('tool' in interaction);
    for(const body of [readiness,next,interaction]){assert.equal('_runtime' in body,false);assert.equal('runtimePid' in body,false);}
  }finally{stop(root);}
});
