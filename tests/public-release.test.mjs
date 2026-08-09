import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const text=(name)=>readFileSync(path.join(root,name),'utf8');
const pkg=JSON.parse(text('package.json'));
const plugin=JSON.parse(text('plugin.json'));
const lock=JSON.parse(text('package-lock.json'));

test('public metadata matches the maintainer and release channel',()=>{
  assert.equal(pkg.name,'@saulmarti/specrail');
  assert.deepEqual(pkg.author,{name:'Saúl Martí',email:'me@saulmarti.dev'});
  assert.equal(pkg.repository.url,'git+https://github.com/saulmarti/specrail.git');
  assert.equal(pkg.bugs.url,'https://github.com/saulmarti/specrail/issues');
  assert.equal(pkg.homepage,'https://github.com/saulmarti/specrail#readme');
  assert.equal(pkg.license,'MIT');
  assert.equal(pkg.publishConfig.access,'public');
  assert.equal(plugin.version,pkg.version);
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
});

test('public roadmap and agent rules are canonical and packaged',()=>{
  for(const file of ['ROADMAP.md','AGENTS.md','docs/REVIEW-COCKPIT.md','docs/GITHUB-DELIVERY.md','docs/BRANDING.md','docs/prototypes/review-cockpit.html','docs/EXPERIMENTS.md','docs/ADAPTIVE-POLICY.md']){
    assert.ok(existsSync(path.join(root,file)),file);
    assert.ok(pkg.files.includes(file),`${file} must be included in npm package files`);
  }
  const roadmap=text('ROADMAP.md');
  assert.match(roadmap,/## Current beta hardening/i);
  assert.doesNotMatch(roadmap,/Current release line — `0\.9\.x beta`/i);
  for(const feature of ['Review Cockpit','Readiness / Why blocked','specrail doctor --fix','Replayable Tasksets','Adaptive workflow policy','GitHub Issue → PR → CI → merge']) assert.match(roadmap,new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  assert.match(roadmap,/GitHub Issue → PR → CI → merge[\s\S]*Deferred/i);
  assert.match(roadmap,/Signed Delivery Bundle[\s\S]*Deferred/i);
  assert.match(roadmap,/Review Cockpit MVP/i);
  for(const feature of ['Visual Comparator v2','Implementation Capsule Quality Gate','Builder Comprehension Preflight','Preview Session Manager','Real phase token telemetry','Requirement Source Ledger','Review Inbox']) assert.match(roadmap,new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  assert.ok(roadmap.indexOf('## Execution reliability — highest priority') < roadmap.indexOf('## Specification intelligence — priority P2'));
  assert.ok(roadmap.indexOf('## Runtime and review reliability') < roadmap.indexOf('## Human attention layer'));
  const agents=text('AGENTS.md');
  assert.match(agents,/Every user-facing behavior change must update/i);
  assert.match(agents,/ROADMAP\.md/);
  assert.match(agents,/Never run `npm publish`/);
  assert.match(agents,/npm run release:check/);
});

test('source archive command excludes local caches and macOS metadata',()=>{
  const archive=pkg.scripts.tar;
  assert.match(archive,/COPYFILE_DISABLE=1/);
  for(const excluded of [".codegraph","._*",".DS_Store"]) assert.ok(archive.includes(excluded),`source tar must exclude ${excluded}`);
});

test('README and publishing docs use the canonical scoped package and specrail CLI',()=>{
  assert.match(text('README.md'),/npm install -g @saulmarti\/specrail@beta/);
  assert.match(text('README.md'),/npx --package=@saulmarti\/specrail@beta specrail install/);
  assert.match(text('README.md'),/Review Cockpit — beta/);
  assert.match(text('README.md'),/specrail cockpit TASK-0001/);
  const publishing=text('docs/PUBLISHING.md');
  assert.match(publishing,/@saulmarti\/specrail/);
  assert.match(publishing,/npm publish --access public --tag beta/);
  assert.match(publishing,/canonical npm package is scoped/i);
  assert.match(publishing,/do not publish this code under the unscoped `specrail` name/i);
});


test('plugin validate falls back to the packaged Agent Plugin before a managed install exists',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-plugin-home-'));
  const result=JSON.parse(execFileSync(process.execPath,[path.join(root,'dist','src','cli.js'),'plugin','validate'],{cwd:root,env:{...process.env,HOME:home,AI_FLOW_HOME:''},encoding:'utf8'}));
  assert.equal(result.valid,true);
  assert.equal(result.name,'specrail');
  assert.ok(result.skills.length>=7);
});
