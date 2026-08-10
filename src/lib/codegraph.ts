import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import type { CodeGraphContractReport, CodeGraphState } from './types.js';

const STATE_FILE='codegraph.json';
const METRICS_FILE='codegraph-metrics.jsonl';
const DEFAULT_HEALTH_INTERVAL_MS=5*60*1000;
const DEFAULT_TIMEOUT_MS=10*60*1000;
const MAX_METRICS_BYTES=2*1024*1024;
const RETAIN_METRICS_BYTES=768*1024;
const SUPPORTED_CONTRACT='codegraph-cli-v1';

export interface CodeGraphOptions {
  command?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
  skipContractProbe?: boolean;
  forceSync?: boolean;
  allowFullReindex?: boolean;
  reason?: string;
}

interface BinaryIdentity { resolvedCommand:string; size:number|null; mtimeMs:number|null; }
interface Metric { at:string; operation:string; durationMs:number; status:number|null; reason:string; detail?:string; }

function now(): string { return new Date().toISOString(); }
function statePath(root: string): string { return path.join(path.resolve(root),'.ai','runtime',STATE_FILE); }
function metricsPath(root:string):string{return path.join(path.resolve(root),'.ai','runtime',METRICS_FILE);}
function trimOutput(result: SpawnSyncReturns<string>): string { return String(result.stdout||result.stderr||result.error?.message||'').trim().slice(0,4000); }
function resolveCommand(command:string,env:NodeJS.ProcessEnv):string{
  if(command.includes(path.sep))return path.resolve(command);
  const search=String(env.PATH||process.env.PATH||'').split(path.delimiter);
  for(const dir of search){const candidate=path.join(dir,command);if(existsSync(candidate))return candidate;}
  return command;
}
function binaryIdentity(command:string,options:CodeGraphOptions):BinaryIdentity{
  const resolvedCommand=resolveCommand(command,{...process.env,...(options.env||{})});
  try{const st=statSync(resolvedCommand);return{resolvedCommand,size:st.size,mtimeMs:st.mtimeMs};}catch{return{resolvedCommand,size:null,mtimeMs:null};}
}
function metric(root:string,operation:string,start:number,result:SpawnSyncReturns<string>,reason:string):void{
  const row:Metric={at:now(),operation,durationMs:Number((performance.now()-start).toFixed(3)),status:result.status,reason};
  const detail=trimOutput(result);if(result.status!==0&&detail)row.detail=detail.slice(0,500);
  const file=metricsPath(root);mkdirSync(path.dirname(file),{recursive:true});
  try{if(existsSync(file)&&statSync(file).size>=MAX_METRICS_BYTES){const raw=readFileSync(file);const tail=raw.subarray(Math.max(0,raw.length-RETAIN_METRICS_BYTES));const newline=tail.indexOf(10);writeFileSync(file,newline>=0?tail.subarray(newline+1):tail);}}catch{/* metrics rotation never blocks delivery */}
  appendFileSync(file,`${JSON.stringify(row)}\n`);
}
function run(command: string,args: string[],root: string,options: CodeGraphOptions={},operation=args[0]||command): SpawnSyncReturns<string> {
  const start=performance.now();
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:options.timeoutMs||DEFAULT_TIMEOUT_MS,env:{...process.env,...(options.env||{})}});
  metric(root,operation,start,result,options.reason||'unspecified');return result;
}
function save(root: string,state: CodeGraphState): CodeGraphState { mkdirSync(path.dirname(statePath(root)),{recursive:true}); writeFileSync(statePath(root),`${JSON.stringify(state,null,2)}\n`); return state; }
function versionFrom(output: string): string | null { return output.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?\b/)?.[0] ?? null; }
function fingerprint(parts: string[]): string { return createHash('sha256').update(parts.join('\n---\n')).digest('hex'); }
function sameBinary(state:CodeGraphState,identity:BinaryIdentity):boolean{
  return state.binary?.resolvedCommand===identity.resolvedCommand&&state.binary?.size===identity.size&&state.binary?.mtimeMs===identity.mtimeMs;
}
function legacyInitNeedsIndex(contract:CodeGraphContractReport|undefined):boolean{
  const detail=contract?.checks.find(check=>check.command==='init')?.detail||'';return /--index\b/i.test(detail);
}
function statusNeedsSync(output:string):boolean{
  return /(?:^|\n)\s*(?:#{1,6}\s*)?Pending sync\s*:/i.test(output)||/index is not up to date|out of date|stale index/i.test(output);
}

export function probeCodeGraphContract(root: string, options: CodeGraphOptions={}, suppliedVersion?: SpawnSyncReturns<string>): CodeGraphContractReport {
  const command=options.command||process.env.AI_FLOW_CODEGRAPH_COMMAND||'codegraph';
  const versionResult=suppliedVersion??run(command,['--version'],root,options,'version');
  const versionOutput=trimOutput(versionResult);
  const commands: Array<{name:string;args:string[];required:RegExp[]}> = [
    // Modern CodeGraph `init` builds the graph in one step. Older releases exposed
    // `--index`; we detect that flag from the cached help text and use it only there.
    {name:'init',args:['init','--help'],required:[]}, {name:'sync',args:['sync','--help'],required:[]}, {name:'index',args:['index','--help'],required:[/--force\b/i,/--quiet\b/i]}, {name:'status',args:['status','--help'],required:[]}
  ];
  const outputs=[versionOutput],checks:CodeGraphContractReport['checks']=[];
  for(const entry of commands){const result=run(command,entry.args,root,options,`contract:${entry.name}`),detail=trimOutput(result);outputs.push(`${entry.name}:${detail}`);const flagsOk=entry.required.every(pattern=>pattern.test(detail));checks.push({command:entry.name,ok:result.status===0&&flagsOk,detail:detail||`exit ${String(result.status)}`});}
  return{version:versionFrom(versionOutput),compatible:versionResult.status===0&&checks.every(check=>check.ok),checks,fingerprint:fingerprint(outputs)};
}

export function codeGraphStatus(root: string): CodeGraphState {
  const file=statePath(root);if(!existsSync(file))return{version:3,status:'pending',ok:false,action:null,lastCheckedAt:null};
  try{return JSON.parse(readFileSync(file,'utf8')) as CodeGraphState;}catch{return{version:3,status:'blocked',ok:false,action:'invalid-state',lastCheckedAt:null,detail:'Invalid CodeGraph runtime state'};}
}
export function markCodeGraphReadyForTests(root: string,details: Partial<CodeGraphState>={}): CodeGraphState {
  mkdirSync(path.join(path.resolve(root),'.codegraph'),{recursive:true});const stamp=now();
  return save(root,{version:3,status:'ready',ok:true,action:details.action||'test-ready',projectRoot:path.resolve(root),command:details.command||'codegraph',lastCheckedAt:stamp,lastReadyAt:stamp,lastMaintenanceAt:stamp,detail:details.detail||'Test fixture',contract:details.contract||{version:'0.0.0-test',compatible:true,checks:[],fingerprint:'test'},binary:details.binary});
}
export function prepareCodeGraph(root: string,options: CodeGraphOptions={}): CodeGraphState {
  const projectRoot=path.resolve(root),command=options.command||process.env.AI_FLOW_CODEGRAPH_COMMAND||'codegraph';
  const interval=options.minIntervalMs??DEFAULT_HEALTH_INTERVAL_MS,previous=codeGraphStatus(projectRoot),identity=binaryIdentity(command,options),hasIndex=existsSync(path.join(projectRoot,'.codegraph'));
  const checkedAt=previous.lastCheckedAt?Date.parse(previous.lastCheckedAt):0;
  if(!options.force&&hasIndex&&previous.status==='ready'&&previous.contract?.compatible&&sameBinary(previous,identity)&&Date.now()-checkedAt<interval){return{...previous,action:'cached',cached:true};}
  let contract=previous.contract;
  let versionDetail=previous.versionDetail;
  if(options.skipContractProbe){contract={version:contract?.version??null,compatible:true,checks:[],fingerprint:contract?.fingerprint||'skipped'};}
  else if(!contract?.compatible||!sameBinary(previous,identity)){
    const version=run(command,['--version'],projectRoot,options,'version');
    if(version.status!==0)return save(projectRoot,{version:3,status:'blocked',ok:false,action:'codegraph-command-unavailable',projectRoot,command,binary:identity,lastCheckedAt:now(),detail:trimOutput(version)||`Unable to execute ${command}`});
    versionDetail=trimOutput(version);contract=probeCodeGraphContract(projectRoot,{...options,command},version);
    if(!contract.compatible){const failed=contract.checks.filter(check=>!check.ok).map(check=>check.command).join(', ');return save(projectRoot,{version:3,status:'blocked',ok:false,action:'codegraph-contract-incompatible',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:now(),detail:`Unsupported CodeGraph CLI contract (${SUPPORTED_CONTRACT}); failed probes: ${failed||'version'}`});}
  }
  if(!hasIndex){
    const initArgs=legacyInitNeedsIndex(contract)?['init',projectRoot,'--index']:['init',projectRoot];
    const init=run(command,initArgs,projectRoot,{...options,reason:options.reason||'first-index'},'init-index');
    if(init.status!==0||!existsSync(path.join(projectRoot,'.codegraph')))return save(projectRoot,{version:3,status:'blocked',ok:false,action:'codegraph-init-failed',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:now(),detail:trimOutput(init)||'codegraph init did not create .codegraph'});
    const status=run(command,['status',projectRoot],projectRoot,{...options,reason:'post-init-health'},'status');
    if(status.status!==0)return save(projectRoot,{version:3,status:'blocked',ok:false,action:'codegraph-status-failed',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:now(),detail:trimOutput(status)||'CodeGraph status validation failed'});
    const stamp=now();return save(projectRoot,{version:3,status:'ready',ok:true,action:'initialized',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:stamp,lastReadyAt:stamp,lastMaintenanceAt:stamp,detail:trimOutput(status)||trimOutput(init)||'CodeGraph ready'});
  }
  const status=run(command,['status',projectRoot],projectRoot,{...options,reason:options.reason||'periodic-health'},'status');
  const statusOutput=trimOutput(status);
  if(status.status===0&&!statusNeedsSync(statusOutput)&&!options.forceSync){const stamp=now();return save(projectRoot,{...previous,version:3,status:'ready',ok:true,action:'health-checked',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:stamp,lastReadyAt:stamp,detail:statusOutput||'CodeGraph healthy'});}
  const sync=run(command,['sync',projectRoot],projectRoot,{...options,reason:options.reason||'health-recovery'},'sync');
  if(sync.status===0){const after=run(command,['status',projectRoot],projectRoot,{...options,reason:'post-sync-health'},'status');if(after.status===0){const stamp=now();return save(projectRoot,{version:3,status:'ready',ok:true,action:'synced',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:stamp,lastReadyAt:stamp,lastMaintenanceAt:stamp,detail:trimOutput(after)||trimOutput(sync)||'CodeGraph ready'});}}
  if(options.allowFullReindex){const index=run(command,['index',projectRoot,'--force','--quiet'],projectRoot,{...options,reason:options.reason||'explicit-full-reindex'},'full-index');if(index.status===0){const after=run(command,['status',projectRoot],projectRoot,{...options,reason:'post-index-health'},'status');if(after.status===0){const stamp=now();return save(projectRoot,{version:3,status:'ready',ok:true,action:'reindexed',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:stamp,lastReadyAt:stamp,lastMaintenanceAt:stamp,detail:trimOutput(after)||trimOutput(index)||'CodeGraph ready'});}}
  }
  return save(projectRoot,{version:3,status:'blocked',ok:false,action:'codegraph-full-reindex-required',projectRoot,command,binary:identity,versionDetail,contract,lastCheckedAt:now(),detail:`CodeGraph health/sync recovery failed. Full reindex was not run automatically; use the explicit Doctor repair if the index is corrupt or incompatible.`});
}
export function requireCodeGraphReady(root: string): CodeGraphState {const state=codeGraphStatus(root);if(state.status!=='ready'||!state.contract?.compatible||!existsSync(path.join(path.resolve(root),'.codegraph')))throw new Error('CodeGraph preflight and contract validation must complete before Product Owner context or refinement');return state;}
export function readCodeGraphMetrics(root:string,limit=100):Metric[]{const file=metricsPath(root);if(!existsSync(file))return[];return readFileSync(file,'utf8').trim().split('\n').filter(Boolean).slice(-Math.max(1,limit)).map(line=>JSON.parse(line) as Metric);}
