import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validateTasteBrief } from '../dist/src/lib/taste.js';

const root=process.cwd();
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const read=(file)=>readFileSync(path.join(root,file),'utf8');

test('Pi is a declared package host, loads bundled Ponytail, and documentation keeps the adapter boundary explicit',()=>{
  assert.deepEqual(pkg.pi?.extensions,['./node_modules/@dietrichgebert/ponytail/pi-extension/index.js','./extensions/specrail.js','./extensions/specrail-runtime-gates.js']);
  assert.deepEqual(pkg.pi?.skills,['./node_modules/@dietrichgebert/ponytail/skills','./skills']);
  assert.equal(pkg.dependencies['@dietrichgebert/ponytail'],'4.8.4');
  assert.ok(pkg.files.includes('extensions'));
  assert.ok(pkg.keywords.includes('pi-package'));
  const readme=read('README.md');
  const docs=read('docs/PI.md');
  const skill=read('skills/ai-flow/SKILL.md');
  assert.match(readme,/pi install npm:@saulmarti\/specrail@beta/i);
  assert.match(readme,/no global SpecRail CLI required inside Pi/i);
  assert.match(docs,/bundled official `@dietrichgebert\/ponytail`/i);
  assert.match(docs,/specrail install --pi/i);
  assert.match(docs,/specrail install --no-pi/i);
  assert.match(docs,/sessionManager\.getSessionId\(\)/);
  assert.match(docs,/\/specrail-handoff TASK-####/);
  assert.match(docs,/serial fallback/i);
  assert.match(docs,/Review Cockpit is no longer part of the normal approval path/i);
  assert.match(skill,/## Host adapters/);
  assert.match(skill,/\*\*Pi:\*\*/);
  assert.match(skill,/specrail_cli/);
  assert.match(skill,/specrail_host_context/);
  assert.match(skill,/specrail_codegraph/);
  assert.match(skill,/specrail_skill/);
  assert.match(docs,/codegraph explore <query>/i);
});

test('Pi adapter preserves automatic activation, explicit bypass, native decisions, and host-owned model selection',()=>{
  const source=read('extensions/specrail.js');
  assert.match(source,/before_agent_start/);
  assert.match(source,/Sin SpecRail:/);
  assert.match(source,/const FAST = .*specrail\\s\+fast/);
  assert.match(source,/name: 'request_user_input'/);
  assert.match(source,/name: 'specrail_codegraph'/);
  assert.match(source,/name: 'specrail_skill'/);
  assert.match(source,/pi\.exec\(command, \['explore', params\.query\]/);
  assert.match(source,/ctx\.ui\.select/);
  assert.match(source,/ctx\.ui\.input/);
  assert.match(source,/modelSelection: 'host-owned'/);
  assert.match(source,/subagents: 'unattested'/);
  assert.match(source,/visualization: 'discover-or-fallback'/);
});

test('Pi adapter invokes only the packaged SpecRail dispatcher for CLI transport',()=>{
  const source=read('extensions/specrail.js');
  assert.match(source,/path\.join\(PACKAGE_ROOT, 'scripts', 'specrail-fast\.sh'\)/);
  assert.match(source,/pi\.exec\('env', \[`SPEC_RAIL_HOST=pi`, `SPEC_RAIL_PACKAGE_ROOT=\$\{PACKAGE_ROOT\}`, DISPATCHER, \.\.\.params\.args\]/);
  assert.match(source,/cwd: ctx\.cwd/);
  assert.match(source,/signal,/);
  assert.match(source,/timeout: params\.timeoutMs \?\? 120000/);
  assert.doesNotMatch(source,/['"]\/bin\/sh['"]/);
  assert.match(source,/executionMode: 'sequential'/);
  assert.match(source,/execFailure\('SpecRail'/);
  assert.match(source,/execFailure\('CodeGraph'/);
  assert.doesNotMatch(source,/exec\([^\n]*params\.command/);
});

test('Pi is a valid Taste host and can use skill contracts from Pi or shared skill roots',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-pi-taste-'));const base=path.join(home,'.pi','agent','skills');
  const names=['design-taste-frontend','redesign-existing-projects','imagegen-frontend-web','image-to-code'];
  const skills=names.map(name=>{const dir=path.join(base,name);mkdirSync(dir,{recursive:true});const file=path.join(dir,'SKILL.md');writeFileSync(file,`---
name: ${name}
description: taste
---
# ${name}
`);return{name,path:file};});
  const brief={schemaVersion:2,agent:'pi',taskMode:'redesign',surface:'web',skills,briefInference:{pageKind:'page',audience:'users',direction:'editorial',variance:4,density:4,motion:2},locks:{color:'existing',shape:'consistent',theme:'current'},auditFirst:true,preflightPassed:true};
  assert.deepEqual(validateTasteBrief(brief),[]);
});