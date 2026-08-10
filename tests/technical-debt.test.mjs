import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { doctor } from '../dist/src/lib/doctor.js';
import { validateAgentPlugin } from '../dist/src/lib/plugin.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
test('TypeScript sources are checked instead of bypassed with ts-nocheck',()=>{
 const sourceFiles=walk(path.join(process.cwd(),'src')).filter(file=>file.endsWith('.ts'));
 assert.ok(sourceFiles.length>0);for(const file of sourceFiles)assert.doesNotMatch(readFileSync(file,'utf8'),/@ts-nocheck/);
 const config=JSON.parse(readFileSync(path.join(process.cwd(),'tsconfig.json'),'utf8'));assert.equal(config.compilerOptions.strict,true);assert.equal(config.compilerOptions.noUncheckedIndexedAccess,true);assert.equal(config.compilerOptions.exactOptionalPropertyTypes,true);
});
test('package exposes an Agent Plugins manifest while keeping the deterministic CLI installer',()=>{
 const manifest=JSON.parse(readFileSync(path.join(process.cwd(),'plugin.json'),'utf8'));
 const pkg=JSON.parse(readFileSync(path.join(process.cwd(),'package.json'),'utf8'));
 assert.equal(manifest.name,'specrail');assert.equal(manifest.version,pkg.version);assert.match(manifest.$schema,/agent-plugins\.org/);
 for(const skill of ['ai-flow','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-final-customer'])assert.ok(readFileSync(path.join(process.cwd(),'skills',skill,'SKILL.md'),'utf8').includes('description:'));
});
test('doctor treats host visualization discovery as session-specific and non-blocking',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'ai-flow-doctor-'));initProject(root);
 const result=doctor(root,mkdtempSync(path.join(tmpdir(),'ai-flow-home-'))),check=result.checks.find(item=>item.name==='visualize-host-capability');
 assert.equal(check.required,false);assert.equal(check.ok,true);assert.match(check.detail,/session-specific/i);
});


test('Agent Plugin validator checks the portable manifest and all immediate skill contracts',()=>{
 const result=validateAgentPlugin(process.cwd());
 assert.equal(result.valid,true,result.errors.join('; '));
 const pkg=JSON.parse(readFileSync(path.join(process.cwd(),'package.json'),'utf8'));
 assert.equal(result.name,'specrail');
 assert.equal(result.version,pkg.version);
 assert.equal(result.skills.length,10);
});

test('Agent Plugin validator rejects invalid portable manifests and mismatched skill names',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'ai-flow-invalid-plugin-'));
 mkdirSync(path.join(root,'skills','wrong-dir'),{recursive:true});
 writeFileSync(path.join(root,'plugin.json'),JSON.stringify({$schema:'wrong',name:'Invalid--Name',unknown:true}));
 writeFileSync(path.join(root,'skills','wrong-dir','SKILL.md'),'---\nname: another-name\ndescription: Test\n---\n');
 const result=validateAgentPlugin(root);
 assert.equal(result.valid,false);
 assert.match(result.errors.join(' '),/schema|name|match/i);
 assert.match(result.warnings.join(' '),/unknown/i);
});


test('installed CLI help exposes the 0.4 governance and verification commands',()=>{
  const help=execFileSync(process.execPath,[new URL('../dist/src/cli.js',import.meta.url).pathname,'--help'],{encoding:'utf8'});
  for(const command of ['qa mission','failure record|list','eval list|approve|dismiss','repair status|reset','metrics, trace','constitution list|add|check','quality, operations','slice status|create|materialize','harness recommend TASK','replay create|status|start|complete|compare|event|scenarios|cleanup']) assert.match(help,new RegExp(command.replace(/[|]/g,'\\|')));
});
