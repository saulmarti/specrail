import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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

test('npm metadata exposes the SpecRail brand, backward-compatible alias, and one package version',()=>{
  assert.equal(pkg.name,'@saulmarti/specrail');
  assert.equal(pkg.bin.specrail,'dist/src/cli.js');
  assert.equal(pkg.bin['ai-flow'],'dist/src/cli.js');
  assert.equal(plugin.name,'specrail');
  assert.equal(plugin.version,pkg.version);
  assert.equal(pkg.publishConfig.access,'public');
  assert.ok(pkg.files.includes('dist'));
  assert.ok(!pkg.files.includes('types'));
  assert.ok(!pkg.files.includes('src'));
});

test('the packaged CLI can install SpecRail through its public install command',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-npx-home-'));
  const output=run(process.execPath,['dist/src/cli.js','install'],{cwd:root,env:{...process.env,AI_FLOW_HOME:home}});
  assert.match(output,/SpecRail installed/i);
  assert.ok(existsSync(path.join(home,'.local','bin','specrail')));
  assert.ok(existsSync(path.join(home,'.local','bin','ai-flow')));
  assert.equal(run(path.join(home,'.local','bin','specrail'),['--version']),pkg.version);
});

test('the installed CLI generates a local Review Cockpit without a server or external database',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-cockpit-home-'));
  const repo=mkdtempSync(path.join(tmpdir(),'specrail-cockpit-repo-'));
  run(process.execPath,['dist/src/cli.js','install'],{cwd:root,env:{...process.env,AI_FLOW_HOME:home}});
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
