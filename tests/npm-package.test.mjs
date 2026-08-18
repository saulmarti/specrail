import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const plugin=JSON.parse(readFileSync(path.join(root,'plugin.json'),'utf8'));

function run(command,args,options={}){
  const result=spawnSync(command,args,{encoding:'utf8',...options});
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout.trim();
}

test('npm metadata exposes the SpecRail brand, backward-compatible alias, bundled Ponytail, and one package version',()=>{
  assert.equal(pkg.name,'@saulmarti/specrail');
  assert.equal(pkg.bin.specrail,'scripts/specrail-fast.sh');
  assert.equal(pkg.bin['ai-flow'],'scripts/specrail-fast.sh');
  assert.ok(pkg.files.includes('scripts'));
  assert.ok(existsSync(path.join(root,'scripts','specrail-fast.sh')));
  assert.ok(existsSync(path.join(root,'dist','src','cli.js')),'direct TypeScript CLI remains packaged as the runtime/fallback implementation');
  assert.equal(plugin.name,'specrail');
  assert.equal(plugin.version,pkg.version);
  assert.equal(pkg.publishConfig.access,'public');
  assert.ok(pkg.files.includes('dist'));
  assert.ok(!pkg.files.includes('types'));
  assert.ok(!pkg.files.includes('src'));
  assert.ok(pkg.files.includes('extensions'));
  assert.ok(pkg.files.includes('docs/PI.md'));
  assert.ok(pkg.files.includes('docs/VALIDATION-0.10.3-PI.md'));
  assert.ok(pkg.keywords.includes('pi-package'));
  assert.deepEqual(pkg.pi,{extensions:['./node_modules/@dietrichgebert/ponytail/pi-extension/index.js','./extensions/specrail-ponytail-bridge.js','./extensions/specrail.js','./extensions/specrail-runtime-gates.js'],skills:['./node_modules/@dietrichgebert/ponytail/skills','./skills']});
  assert.equal(pkg.dependencies['@dietrichgebert/ponytail'],'4.8.4');
  assert.equal(pkg.dependencies.typebox,'1.3.7');
  assert.equal(pkg.peerDependencies,undefined);
  assert.ok(existsSync(path.join(root,'node_modules','@dietrichgebert','ponytail','package.json')));
  assert.ok(existsSync(path.join(root,'node_modules','@dietrichgebert','ponytail','pi-extension','index.js')));
  assert.ok(existsSync(path.join(root,'extensions','specrail-ponytail-bridge.js')));
  assert.ok(existsSync(path.join(root,'extensions','specrail.js')));
  assert.ok(existsSync(path.join(root,'extensions','specrail-runtime-gates.js')));
});

test('the packaged CLI can install SpecRail through its public install command without silently enabling Pi',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-npx-home-'));
  const output=run(process.execPath,['dist/src/cli.js','install'],{cwd:root,env:{...process.env,AI_FLOW_HOME:home}});
  assert.match(output,/SpecRail installed/i);
  assert.match(output,/Pi integration skipped/i);
  assert.ok(existsSync(path.join(home,'.local','bin','specrail')));
  assert.ok(existsSync(path.join(home,'.local','bin','ai-flow')));
  assert.ok(existsSync(path.join(home,'.ai-flow','node_modules','@dietrichgebert','ponytail','package.json')));
  assert.equal(run(path.join(home,'.local','bin','specrail'),['--version']),pkg.version);
});

test('installed specrail forwards explicit --pi and --no-pi choices through the public dispatcher',()=>{
  const piHome=mkdtempSync(path.join(tmpdir(),'specrail-public-pi-home-'));
  const piEnv={...process.env,AI_FLOW_HOME:piHome};
  run(process.execPath,['dist/src/cli.js','install','--no-pi'],{cwd:root,env:piEnv});
  const piBin=path.join(piHome,'.local','bin','specrail');
  const piOutput=run(piBin,['install','--pi'],{cwd:root,env:piEnv});
  assert.match(piOutput,/Pi integration installed/i);
  const piSettings=JSON.parse(readFileSync(path.join(piHome,'.pi','agent','settings.json'),'utf8'));
  assert.ok(piSettings.packages.includes(path.join(piHome,'.ai-flow')));
  assert.match(readFileSync(path.join(piHome,'.pi','agent','AGENTS.md'),'utf8'),/official.*Ponytail/i);

  const noPiHome=mkdtempSync(path.join(tmpdir(),'specrail-public-no-pi-home-'));
  const noPiEnv={...process.env,AI_FLOW_HOME:noPiHome};
  const piRoot=path.join(noPiHome,'.pi','agent');
  mkdirSync(piRoot,{recursive:true});
  const agentsFile=path.join(piRoot,'AGENTS.md');
  const settingsFile=path.join(piRoot,'settings.json');
  const agentsBefore='# Existing Pi rules\n\nDo not mutate.\n';
  const settingsBefore=`${JSON.stringify({theme:'dark',packages:['npm:other/pi-package'],custom:{keep:true}},null,2)}\n`;
  writeFileSync(agentsFile,agentsBefore);
  writeFileSync(settingsFile,settingsBefore);
  run(process.execPath,['dist/src/cli.js','install','--no-pi'],{cwd:root,env:noPiEnv});
  const noPiBin=path.join(noPiHome,'.local','bin','specrail');
  const noPiOutput=run(noPiBin,['install','--no-pi'],{cwd:root,env:noPiEnv});
  assert.match(noPiOutput,/Pi integration skipped/i);
  assert.equal(readFileSync(agentsFile,'utf8'),agentsBefore);
  assert.equal(readFileSync(settingsFile,'utf8'),settingsBefore);
});

test('the installed CLI keeps the legacy local Review Cockpit available only as an explicit manual command',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-cockpit-home-'));
  const repo=mkdtempSync(path.join(tmpdir(),'specrail-cockpit-repo-'));
  run(process.execPath,['dist/src/cli.js','install','--no-pi'],{cwd:root,env:{...process.env,AI_FLOW_HOME:home}});
  const bin=path.join(home,'.local','bin','specrail');
  run(bin,['init','--root',repo]);
  const created=JSON.parse(run(bin,['create','Cockpit smoke test','--root',repo,'--json']));
  const cockpit=JSON.parse(run(bin,['cockpit',created.id,'--stage','status','--root',repo]));
  assert.equal(cockpit.taskId,created.id);
  assert.ok(existsSync(cockpit.path));
  const html=readFileSync(cockpit.path,'utf8');
  assert.match(html,/SpecRail Review Cockpit/);
  assert.match(html,/This Cockpit is read-only/);
});

test('public CLI persists and reads integrity-checked host concurrency capability attestations',()=>{
  const repo=mkdtempSync(path.join(tmpdir(),'specrail-host-capability-repo-'));
  run(process.execPath,['dist/src/cli.js','init','--root',repo]);
  const recorded=JSON.parse(run(process.execPath,['dist/src/cli.js','capability','host','record','--session','host-cli-session','--host','test-host','--subagents','true','--parallel','true','--attestation','This test host launches independent workers concurrently for prepared lanes.','--root',repo]));
  assert.equal(recorded.sessionId,'host-cli-session');
  assert.equal(recorded.parallelSubagents,true);
  const status=JSON.parse(run(process.execPath,['dist/src/cli.js','capability','host','status','--session','host-cli-session','--root',repo]));
  assert.equal(status.valid,true);assert.equal(status.parallelVerified,true);
  const reset=JSON.parse(run(process.execPath,['dist/src/cli.js','capability','host','reset','--session','host-cli-session','--force','--root',repo]));
  assert.equal(reset.reset,true);
  const after=JSON.parse(run(process.execPath,['dist/src/cli.js','capability','host','status','--session','host-cli-session','--root',repo]));
  assert.equal(after.valid,false);
});

test('published package explicitly includes the trust model for host/session guarantees',()=>{
  assert.ok(pkg.files.includes('docs/TRUST-MODEL.md'));
  assert.ok(existsSync(path.join(root,'docs','TRUST-MODEL.md')));
});

test('Pi adapter source is publishable JavaScript and exposes the first-class host bridge',()=>{
  const source=readFileSync(path.join(root,'extensions','specrail.js'),'utf8');
  assert.equal(spawnSync(process.execPath,['--check','extensions/specrail.js'],{cwd:root,encoding:'utf8'}).status,0);
  assert.equal(spawnSync(process.execPath,['--check','extensions/specrail-ponytail-bridge.js'],{cwd:root,encoding:'utf8'}).status,0);
  assert.match(source,/before_agent_start/);
  assert.match(source,/name: 'specrail_cli'/);
  assert.match(source,/name: 'specrail_host_context'/);
  assert.match(source,/name: 'specrail_skill'/);
  assert.match(source,/name: 'specrail_codegraph'/);
  assert.match(source,/name: 'request_user_input'/);
  assert.match(source,/sessionManager\.getSessionId\(\)/);
  assert.match(source,/ctx\.ui\.select/);
  assert.match(source,/registerCommand\('specrail-handoff'/);
  assert.match(source,/path\.join\(PACKAGE_ROOT, 'scripts', 'specrail-fast\.sh'\)/);
  assert.match(source,/`SPEC_RAIL_HOST=pi`/);
  assert.match(source,/`SPEC_RAIL_PACKAGE_ROOT=\$\{PACKAGE_ROOT\}`/);
});