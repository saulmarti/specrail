import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import type { CodeGraphContractReport, CodeGraphState } from './types.js';

const STATE_FILE='codegraph.json';
const DEFAULT_MIN_INTERVAL_MS=0;
const DEFAULT_TIMEOUT_MS=10*60*1000;
const SUPPORTED_CONTRACT='codegraph-cli-v1';

export interface CodeGraphOptions {
  command?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
  skipContractProbe?: boolean;
}

function now(): string { return new Date().toISOString(); }
function statePath(root: string): string { return path.join(path.resolve(root),'.ai','runtime',STATE_FILE); }
function trimOutput(result: SpawnSyncReturns<string>): string {
  return String(result.stdout||result.stderr||result.error?.message||'').trim().slice(0,4000);
}
function run(command: string,args: string[],root: string,options: CodeGraphOptions={}): SpawnSyncReturns<string> {
  return spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:options.timeoutMs||DEFAULT_TIMEOUT_MS,env:{...process.env,...(options.env||{})}});
}
function save(root: string,state: CodeGraphState): CodeGraphState {
  mkdirSync(path.dirname(statePath(root)),{recursive:true});
  writeFileSync(statePath(root),`${JSON.stringify(state,null,2)}\n`);
  return state;
}
function versionFrom(output: string): string | null {
  return output.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?\b/)?.[0] ?? null;
}
function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n---\n')).digest('hex');
}

export function probeCodeGraphContract(root: string, options: CodeGraphOptions={}, suppliedVersion?: SpawnSyncReturns<string>): CodeGraphContractReport {
  const command=options.command||process.env.AI_FLOW_CODEGRAPH_COMMAND||'codegraph';
  const versionResult=suppliedVersion??run(command,['--version'],root,options);
  const versionOutput=trimOutput(versionResult);
  const commands: Array<{name:string;args:string[];required:RegExp[]}> = [
    {name:'init',args:['init','--help'],required:[/--index\b/i]},
    {name:'sync',args:['sync','--help'],required:[]},
    {name:'index',args:['index','--help'],required:[/--force\b/i,/--quiet\b/i]},
    {name:'status',args:['status','--help'],required:[]}
  ];
  const outputs=[versionOutput];
  const checks: CodeGraphContractReport['checks']=[];
  for (const entry of commands) {
    const result=run(command,entry.args,root,options);
    const detail=trimOutput(result);
    outputs.push(`${entry.name}:${detail}`);
    const flagsOk=entry.required.every(pattern=>pattern.test(detail));
    checks.push({command:entry.name,ok:result.status===0&&flagsOk,detail:detail||`exit ${String(result.status)}`});
  }
  return {
    version:versionFrom(versionOutput),
    compatible:versionResult.status===0&&checks.every(check=>check.ok),
    checks,
    fingerprint:fingerprint(outputs)
  };
}

export function codeGraphStatus(root: string): CodeGraphState {
  const file=statePath(root);
  if(!existsSync(file)) return {version:2,status:'pending',ok:false,action:null,lastCheckedAt:null};
  try {
    const parsed=JSON.parse(readFileSync(file,'utf8')) as CodeGraphState;
    return parsed;
  } catch {
    return {version:2,status:'blocked',ok:false,action:'invalid-state',lastCheckedAt:null,detail:'Invalid CodeGraph runtime state'};
  }
}
export function markCodeGraphReadyForTests(root: string,details: Partial<CodeGraphState>={}): CodeGraphState {
  mkdirSync(path.join(path.resolve(root),'.codegraph'),{recursive:true});
  const stamp=now();
  return save(root,{version:2,status:'ready',ok:true,action:details.action||'test-ready',projectRoot:path.resolve(root),command:details.command||'codegraph',lastCheckedAt:stamp,lastReadyAt:stamp,detail:details.detail||'Test fixture',contract:details.contract||{version:'0.0.0-test',compatible:true,checks:[],fingerprint:'test'}});
}
export function prepareCodeGraph(root: string,options: CodeGraphOptions={}): CodeGraphState {
  const projectRoot=path.resolve(root),command=options.command||process.env.AI_FLOW_CODEGRAPH_COMMAND||'codegraph',minIntervalMs=options.minIntervalMs??DEFAULT_MIN_INTERVAL_MS;
  const previous=codeGraphStatus(projectRoot),checkedAt=previous.lastCheckedAt?Date.parse(previous.lastCheckedAt):0;
  if(minIntervalMs>0&&!options.force&&previous.status==='ready'&&existsSync(path.join(projectRoot,'.codegraph'))&&Date.now()-checkedAt<minIntervalMs) return {...previous,action:'cached',cached:true};
  const version=run(command,['--version'],projectRoot,options);
  if(version.status!==0) return save(projectRoot,{version:2,status:'blocked',ok:false,action:'codegraph-command-unavailable',projectRoot,command,lastCheckedAt:now(),detail:trimOutput(version)||`Unable to execute ${command}`});
  const contract=options.skipContractProbe
    ? {version:versionFrom(trimOutput(version)),compatible:true,checks:[],fingerprint:'skipped'} satisfies CodeGraphContractReport
    : probeCodeGraphContract(projectRoot,{...options,command},version);
  if(!contract.compatible) {
    const failed=contract.checks.filter(check=>!check.ok).map(check=>check.command).join(', ');
    return save(projectRoot,{version:2,status:'blocked',ok:false,action:'codegraph-contract-incompatible',projectRoot,command,versionDetail:trimOutput(version),contract,lastCheckedAt:now(),detail:`Unsupported CodeGraph CLI contract (${SUPPORTED_CONTRACT}); failed probes: ${failed||'version'}`});
  }
  let action:string,result:SpawnSyncReturns<string>;
  if(!existsSync(path.join(projectRoot,'.codegraph'))){
    action='initialized';result=run(command,['init',projectRoot,'--index'],projectRoot,options);
    if(result.status!==0||!existsSync(path.join(projectRoot,'.codegraph'))) return save(projectRoot,{version:2,status:'blocked',ok:false,action:'codegraph-init-failed',projectRoot,command,contract,lastCheckedAt:now(),detail:trimOutput(result)||'codegraph init did not create .codegraph'});
  } else {
    action='synced';result=run(command,['sync',projectRoot],projectRoot,options);
    if(result.status!==0){
      action='reindexed';result=run(command,['index',projectRoot,'--force','--quiet'],projectRoot,options);
      if(result.status!==0) return save(projectRoot,{version:2,status:'blocked',ok:false,action:'codegraph-index-failed',projectRoot,command,contract,lastCheckedAt:now(),detail:trimOutput(result)||'codegraph sync and full index failed'});
    }
  }
  let status=run(command,['status',projectRoot],projectRoot,options);
  if(status.status!==0&&action==='synced'){
    action='reindexed';result=run(command,['index',projectRoot,'--force','--quiet'],projectRoot,options);
    if(result.status===0) status=run(command,['status',projectRoot],projectRoot,options);
  }
  if(status.status!==0) return save(projectRoot,{version:2,status:'blocked',ok:false,action:'codegraph-status-failed',projectRoot,command,contract,lastCheckedAt:now(),detail:trimOutput(status)||'CodeGraph status validation failed'});
  const stamp=now();
  return save(projectRoot,{version:2,status:'ready',ok:true,action,projectRoot,command,versionDetail:trimOutput(version),contract,lastCheckedAt:stamp,lastReadyAt:stamp,detail:trimOutput(status)||trimOutput(result)||'CodeGraph ready'});
}
export function requireCodeGraphReady(root: string): CodeGraphState {
  const state=codeGraphStatus(root);
  if(state.status!=='ready'||!state.contract?.compatible||!existsSync(path.join(path.resolve(root),'.codegraph'))) throw new Error('CodeGraph preflight and contract validation must complete before Product Owner context or refinement');
  return state;
}
