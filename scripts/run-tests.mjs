import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd(),dir=path.join(root,'tests');
const allFiles=readdirSync(dir).filter(name=>name.endsWith('.test.mjs')).sort();
const tierArgIndex=process.argv.indexOf('--tier');
const tier=(tierArgIndex>=0?process.argv[tierArgIndex+1]:'quick')||'quick';
const supported=new Set(['quick','unit','e2e','full']);
if(!supported.has(tier))throw new Error(`Unknown test tier: ${tier}. Use quick, unit, e2e, or full.`);

// Everyday confidence loop: deterministic contracts that catch the majority of
// routing/governance/runtime regressions without installing the package or
// replaying complete delivery workflows.
const quickFiles=[
  'architecture-integrity.test.mjs',
  'control-profile.test.mjs',
  'core.test.mjs',
  'entry-clarity-ponytail.test.mjs',
  'intelligence-routing.test.mjs',
  'pi-compatibility.test.mjs',
  'pi-adapter-runtime.test.mjs',
  'pi-runtime-gates.test.mjs',
  'questions-compatibility.test.mjs',
  'revisions.test.mjs',
  'skills.test.mjs',
  'user-overrides.test.mjs',
  'version-sync.test.mjs'
];
const e2eFile='installed-e2e.test.mjs';
const nonE2E=allFiles.filter(name=>name!==e2eFile);
const selected=tier==='quick'?quickFiles:tier==='unit'?nonE2E:tier==='e2e'?[e2eFile]:allFiles;
const timeoutMs=Number(process.env.SPEC_RAIL_TEST_FILE_TIMEOUT_MS||120_000);
const concurrency=Math.max(1,Number(process.env.SPEC_RAIL_TEST_CONCURRENCY||4));
const baseEnv={
  ...process.env,
  SPEC_RAIL_RUNTIME_IDLE_MS:process.env.SPEC_RAIL_RUNTIME_IDLE_MS||'60000',
  SPEC_RAIL_RUNTIME_REQUEST_TIMEOUT_SECONDS:process.env.SPEC_RAIL_RUNTIME_REQUEST_TIMEOUT_SECONDS||'25',
  SPEC_RAIL_E2E_COMMAND_TIMEOUT_MS:process.env.SPEC_RAIL_E2E_COMMAND_TIMEOUT_MS||'30000',
  SPEC_RAIL_E2E_TRACE:process.env.SPEC_RAIL_E2E_TRACE||'0',
  TERM:process.env.TERM||'xterm'
};
let executions=0;
function run(args,label,timeout=timeoutMs){
  process.stdout.write(`\n=== ${label} ===\n`);executions++;
  const result=spawnSync(process.execPath,args,{cwd:root,env:baseEnv,stdio:'inherit',timeout});
  if(result.error){if(result.error.code==='ETIMEDOUT')throw new Error(`${label} timed out after ${timeout}ms`);throw result.error;}
  if(result.status!==0)throw new Error(`${label} exited ${String(result.status)}${result.signal?` (${result.signal})`:''}`);
}
function runBatch(names,label){
  if(!names.length)return;
  run(['--test','--test-force-exit',`--test-concurrency=${concurrency}`,...names.map(name=>path.join('tests',name))],label,Math.max(timeoutMs,180_000));
}
function runInstalledE2E(){
  const file=path.join('tests',e2eFile),source=readFileSync(path.join(root,file),'utf8');
  const names=[...source.matchAll(/\btest\('([^']+)'/g)].map(match=>match[1]);
  for(const testName of names){
    const escaped=testName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    run(['--test','--test-force-exit','--experimental-test-isolation=none','--test-concurrency=1',`--test-name-pattern=${escaped}`,file],`${file} :: ${testName}`,Math.max(timeoutMs,150_000));
  }
}
try{
  if(tier==='e2e')runInstalledE2E();
  else if(tier==='full'){runBatch(nonE2E,'full non-E2E suite');runInstalledE2E();}
  else runBatch(selected,`${tier} suite`);
  process.stdout.write(`\nSpecRail ${tier} test tier: ${selected.length} files, ${executions} execution${executions===1?'':'s'} passed.\n`);
}catch(error){process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
