// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { initProject } from '../dist/src/lib/project.js';
import { createTask } from '../dist/src/lib/task.js';

function execute(socketPath,args){return new Promise((resolve,reject)=>{const body=new URLSearchParams(args.map(value=>['arg',value])).toString();const req=http.request({socketPath,path:'/v1/execute',method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','content-length':Buffer.byteLength(body)}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),headers:res.headers,status:res.statusCode}))});req.on('error',reject);req.end(body);});}
async function waitFor(file){for(let i=0;i<100;i++){if(existsSync(file))return;await new Promise(r=>setTimeout(r,10));}throw new Error('runtime socket did not start');}

test('persistent TypeScript runtime keeps next readiness and interaction as separate warm operations',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'specrail-runtime-'));initProject(root,{name:'Runtime'});createTask(root,{title:'Runtime task',need:'Exercise warm routing.',surfaces:['backend']});
 const socket=path.join(root,'.ai','runtime','specrail-test.sock');
 const child=spawn(process.execPath,['dist/src/runtime-server.js','--root',root,'--socket',socket],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,SPEC_RAIL_RUNTIME_IDLE_MS:'60000'}});
 try{await waitFor(socket);
   const readiness=await execute(socket,['readiness','TASK-0001','--root',root]);
   const next=await execute(socket,['next','TASK-0001','--root',root,'--session','warm']);
   const interaction=await execute(socket,['interaction','TASK-0001','--root',root,'--session','warm']);
   for(const response of [readiness,next,interaction]){assert.equal(response.status,200);assert.equal(response.headers['x-specrail-runtime'],'warm');assert.ok(Number(response.headers['x-specrail-duration-ms'])>=0);}
   const readinessBody=JSON.parse(readiness.body),nextBody=JSON.parse(next.body),interactionBody=JSON.parse(interaction.body);
   assert.ok('score' in readinessBody);assert.ok('action' in nextBody);assert.ok('tool' in interactionBody);
   assert.equal('readiness' in interactionBody,false,'interaction remains a separate contract');
 }finally{child.kill('SIGTERM');}
});

const launcher=path.join(process.cwd(),'scripts','specrail-fast.sh');
const runtimeEnv={...process.env,SPEC_RAIL_RUNTIME_IDLE_MS:'60000'};
function shell(args,{cwd=process.cwd()}={}){return spawnSync(launcher,args,{cwd,encoding:'utf8',env:runtimeEnv,timeout:15000});}
function shellAsync(args,{cwd=process.cwd()}={}){return new Promise((resolve,reject)=>{const child=spawn(launcher,args,{cwd,stdio:['ignore','pipe','pipe'],env:runtimeEnv});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});}

test('canonical specrail dispatcher reuses one runtime across concurrent calls and honors --root outside the repository',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'specrail-runtime-launcher-'));initProject(root,{name:'Runtime launcher'});createTask(root,{title:'Launcher task',need:'Exercise transparent warm routing.',surfaces:['backend']});
 const outside=mkdtempSync(path.join(tmpdir(),'specrail-runtime-outside-'));
 try{
   const [a,b]=await Promise.all([shellAsync(['list','--root',root],{cwd:outside}),shellAsync(['readiness','TASK-0001','--root',root],{cwd:outside})]);
   assert.equal(a.code,0,a.err);assert.equal(b.code,0,b.err);assert.ok(JSON.parse(a.out));assert.ok(JSON.parse(b.out));
   const first=JSON.parse(shell(['runtime-status','--root',root],{cwd:outside}).stdout);assert.equal(first.ok,true);
   const next=shell(['next','TASK-0001','--root',root,'--session','launcher-session'],{cwd:outside});assert.equal(next.status,0,next.stderr);const nextBody=JSON.parse(next.stdout);assert.ok('action' in nextBody);assert.notEqual(nextBody.runtime?.warm,true,'transport metadata must never overwrite next.runtime');
   const second=JSON.parse(shell(['runtime-status','--root',root],{cwd:outside}).stdout);assert.equal(second.pid,first.pid,'commands reuse the same TypeScript process');
   const runtimeFiles=readdirSync(path.join(root,'.ai','runtime')).filter(name=>name.startsWith('specrail-runtime-')&&name.endsWith('.json'));assert.equal(runtimeFiles.length,1);
   const metadata=JSON.parse(readFileSync(path.join(root,'.ai','runtime',runtimeFiles[0]),'utf8'));assert.equal(metadata.pid,first.pid);
 }finally{const stop=shell(['runtime-stop','--root',root],{cwd:outside});assert.equal(stop.status,0,stop.stderr);}
});
