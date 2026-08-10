#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRepositoryRoot } from './lib/project.js';
import { runCli } from './cli.js';

function arg(name:string):string|null{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]??null:null;}
function textFile(file:string):string{try{return readFileSync(file,'utf8').trim();}catch{return '';}}
const root=resolveRepositoryRoot(arg('--root')||process.cwd());
const distRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const buildIdFile=path.join(distRoot,'.specrail-build-id');
const loadedBuildId=textFile(buildIdFile);
if(!loadedBuildId)throw new Error('SpecRail runtime requires dist/.specrail-build-id');
const runtimeId=randomUUID();
const runtimeDir=path.join(root,'.ai','runtime');
const socketPath=arg('--socket')||path.join(runtimeDir,`specrail-${loadedBuildId.slice(0,16)}.sock`);
const metaPath=arg('--meta')||path.join(runtimeDir,`specrail-runtime-${loadedBuildId.slice(0,16)}.json`);
const configuredIdle=Number(process.env.SPEC_RAIL_RUNTIME_IDLE_MS||15*60*1000),idleMs=Number.isFinite(configuredIdle)&&configuredIdle>=1000?configuredIdle:15*60*1000;
mkdirSync(runtimeDir,{recursive:true});
if(existsSync(socketPath))rmSync(socketPath,{force:true});
function currentBuild():boolean{return textFile(buildIdFile)===loadedBuildId;}
function send(res:http.ServerResponse,status:number,body:string,contentType='text/plain; charset=utf-8',headers:Record<string,string>={}):void{res.writeHead(status,{'content-type':contentType,'content-length':String(Buffer.byteLength(body)),...headers});res.end(body);}
function sendJson(res:http.ServerResponse,status:number,value:unknown,headers:Record<string,string>={}):void{send(res,status,`${JSON.stringify(value,null,2)}\n`,'application/json',headers);}
async function params(req:http.IncomingMessage):Promise<URLSearchParams>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));}
function stillOwnsRuntime():boolean{try{const meta=JSON.parse(readFileSync(metaPath,'utf8'));return meta?.runtimeId===runtimeId&&meta?.socketPath===socketPath;}catch{return false;}}
let idleTimer:NodeJS.Timeout|null=null,retiring=false;
function cleanup():void{if(!stillOwnsRuntime())return;try{rmSync(socketPath,{force:true});}catch{}try{rmSync(metaPath,{force:true});}catch{}}
function retire():void{if(retiring)return;retiring=true;if(idleTimer)clearTimeout(idleTimer);server.close(()=>{cleanup();process.exit(0);});}
function touch():void{if(idleTimer)clearTimeout(idleTimer);idleTimer=setTimeout(retire,idleMs);idleTimer.unref();}
let queue:Promise<void>=Promise.resolve();
function enqueue<T>(work:()=>Promise<T>):Promise<T>{let resolve!: (value:T)=>void,reject!: (reason?:unknown)=>void;const result=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});queue=queue.then(async()=>{try{resolve(await work());}catch(error){reject(error);}});return result;}
const server=http.createServer(async(req,res)=>{touch();const started=performance.now();try{
  if(req.method==='GET'&&req.url==='/v1/health'){if(!currentBuild()){sendJson(res,409,{ok:false,staleBuild:true,pid:process.pid,root,buildId:loadedBuildId});setImmediate(retire);return;}return sendJson(res,200,{ok:true,pid:process.pid,root,buildId:loadedBuildId,runtimeId});}
  if(req.method==='POST'&&req.url==='/v1/shutdown'){sendJson(res,200,{ok:true,stopping:true,pid:process.pid});setImmediate(retire);return;}
  if(req.method!=='POST'||req.url!=='/v1/execute')return sendJson(res,404,{error:'Unknown SpecRail runtime route'});
  if(!currentBuild()){sendJson(res,409,{error:'SpecRail runtime build changed; restart required',staleBuild:true});setImmediate(retire);return;}
  const input=await params(req),argv=input.getAll('arg'),requestCwd=input.get('cwd')||root,envPairs=input.getAll('env');
  const requestEnv=new Map<string,string>();for(const pair of envPairs){const split=pair.indexOf('=');if(split>0)requestEnv.set(pair.slice(0,split),pair.slice(split+1));}
  const execution=await enqueue(async()=>{let stdout='',stderr='';const previousCwd=process.cwd(),previousEnv=new Map<string,string|undefined>();try{
    process.chdir(requestCwd);
    for(const [key,value] of requestEnv){previousEnv.set(key,process.env[key]);if(value==='')delete process.env[key];else process.env[key]=value;}
    await runCli(argv,{stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});return{ok:true,stdout,stderr};
  }catch(error){return{ok:false,stdout,stderr:stderr||`specrail: ${error instanceof Error?error.message:String(error)}\n`};}
  finally{for(const [key,value] of previousEnv){if(value===undefined)delete process.env[key];else process.env[key]=value;}try{process.chdir(previousCwd);}catch{}}});
  // Idle means time since the last completed command, not time since it started.
  // Long Git/CodeGraph/test operations therefore cannot retire the runtime immediately on completion.
  touch();
  const headers={'x-specrail-runtime':'warm','x-specrail-duration-ms':String(Number((performance.now()-started).toFixed(3))),'x-specrail-runtime-pid':String(process.pid)};
  if(execution.ok){if(execution.stderr)process.stderr.write(execution.stderr);return send(res,200,execution.stdout||'', 'text/plain; charset=utf-8',headers);}
  return send(res,400,execution.stderr||execution.stdout||'specrail: command failed\n','text/plain; charset=utf-8',headers);
}catch(error){return send(res,500,`specrail runtime: ${error instanceof Error?error.message:String(error)}\n`,'text/plain; charset=utf-8');}});
server.listen(socketPath,()=>{try{chmodSync(socketPath,0o600);}catch{}writeFileSync(metaPath,`${JSON.stringify({schemaVersion:2,pid:process.pid,runtimeId,root,socketPath,buildId:loadedBuildId,startedAt:new Date().toISOString(),idleMs},null,2)}\n`);touch();});
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,retire);
process.on('exit',cleanup);
