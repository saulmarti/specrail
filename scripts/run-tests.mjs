import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'tests');
const files=readdirSync(dir).filter(name=>name.endsWith('.test.mjs')).sort();
const timeoutMs=Number(process.env.SPEC_RAIL_TEST_FILE_TIMEOUT_MS||120_000);
const env={...process.env,SPEC_RAIL_RUNTIME_IDLE_MS:process.env.SPEC_RAIL_RUNTIME_IDLE_MS||'1000',TERM:process.env.TERM||'xterm'};
let executions=0;
function run(args,label,timeout=timeoutMs){process.stdout.write(`\n=== ${label} ===\n`);executions++;const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',timeout});if(result.error){if(result.error.code==='ETIMEDOUT')throw new Error(`${label} timed out after ${timeout}ms`);throw result.error;}if(result.status!==0)throw new Error(`${label} exited ${String(result.status)}${result.signal?` (${result.signal})`:''}`);}
try{for(const name of files){const file=path.join('tests',name);if(name==='installed-e2e.test.mjs'){const source=readFileSync(path.join(root,file),'utf8'),names=[...source.matchAll(/\btest\('([^']+)'/g)].map(match=>match[1]);for(const testName of names){const escaped=testName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');run(['--test','--test-force-exit','--experimental-test-isolation=none','--test-concurrency=1',`--test-name-pattern=${escaped}`,file],`${file} :: ${testName}`,Math.max(timeoutMs,150_000));}continue;}run(['--test','--test-force-exit','--experimental-test-isolation=none',file],file);}process.stdout.write(`\nSpecRail deterministic test runner: ${files.length} files, ${executions} isolated executions passed.\n`);}catch(error){process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
