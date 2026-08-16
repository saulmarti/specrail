import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { explicitProcessRoute, isExplicitTaskContinuation, processRouteFromAnswer, processRouteInteraction } from '../dist/src/lib/process-route.js';
import { resolveDecision, assertNoUnresolvedMaterialDecisions } from '../dist/src/lib/decision-resolution.js';
import { structuredQuestion, structuredQuestionInteraction } from '../dist/src/lib/structured-questions.js';
import { minimalismRequirement, ponytailRequiredForRole, assertPonytailForMutation, PONYTAIL_DEFAULT_MODE } from '../dist/src/lib/minimalism.js';
import { conciseProgress, renderDecisionCapsuleMarkdown } from '../dist/src/lib/decision-capsule.js';

const root=process.cwd();
const read=file=>readFileSync(path.join(root,file),'utf8');

test('new work route is explicit and prefixes suppress only the redundant entry question',()=>{
  assert.deepEqual(explicitProcessRoute('SpecRail Fast: cambia el copy'),{route:'specrail',source:'explicit-prefix',workflowMode:'fast'});
  assert.deepEqual(explicitProcessRoute('Sin SpecRail: corrige el typo'),{route:'direct',source:'explicit-prefix'});
  assert.deepEqual(explicitProcessRoute('Directo + verificar: corrige el typo'),{route:'direct_verify',source:'explicit-prefix'});
  assert.equal(explicitProcessRoute('Implementa login'),null);
  assert.equal(isExplicitTaskContinuation('Continue TASK-0042'),true);
  assert.equal(processRouteFromAnswer('Directo + verificar'),'direct_verify');
  const interaction=processRouteInteraction('direct_verify');
  assert.equal(interaction.tool,'request_user_input');
  assert.equal(interaction.questions.length,1);
  assert.deepEqual(interaction.questions[0].options.map(option=>option.label),['SpecRail','Directo','Directo + verificar']);
  assert.equal(interaction.questions[0].isOther,true);
  assert.match(interaction.questions[0].options[2].description,/Recommended/i);
});

test('structured questions require 2-4 unique choices, free text, and at most one recommendation',()=>{
  const q=structuredQuestion({id:'db',header:'Persistencia',question:'¿Qué persistencia?',options:[{label:'SQLite',description:'Local',recommended:true},{label:'Postgres',description:'Servidor'}]});
  assert.equal(q.isOther,true);assert.equal(q.options.length,2);assert.match(q.options[0].description,/Recommended/);
  assert.throws(()=>structuredQuestion({id:'bad',header:'Bad',question:'Bad?',options:[{label:'Only',description:'Only'}]}),/between 2 and 4/);
  assert.throws(()=>structuredQuestion({id:'bad',header:'Bad',question:'Bad?',options:[{label:'A',description:'A',recommended:true},{label:'B',description:'B',recommended:true}]}),/at most one/);
  assert.throws(()=>structuredQuestionInteraction(new Array(5).fill(null).map((_,i)=>({id:`q${i}`,header:'H',question:'Q?',options:[{label:'A',description:'A'},{label:'B',description:'B'}]}))),/between 1 and 4/);
});

test('no-assumption resolver uses authority provenance and fails closed on material conflicts',()=>{
  const repo=resolveDecision({id:'framework',material:false,evidence:[{source:'repository_contract',value:'vitest',ref:'package.json'}]});
  assert.equal(repo.status,'resolved');assert.equal(repo.value,'vitest');
  const userWins=resolveDecision({id:'storage',material:true,evidence:[{source:'active_user',value:'sqlite',ref:'turn'},{source:'repository_contract',value:'postgres',ref:'config'}]});
  assert.equal(userWins.status,'resolved');assert.equal(userWins.value,'sqlite');
  const conflict=resolveDecision({id:'auth',material:true,evidence:[{source:'repository_contract',value:'public',ref:'README'},{source:'repository_contract',value:'admin',ref:'schema'}]});
  assert.equal(conflict.status,'unresolved');
  assert.throws(()=>assertNoUnresolvedMaterialDecisions([{id:'auth',material:true,evidence:[]}]),/UNRESOLVED_MATERIAL_DECISION/);
});

test('Ponytail full is required for code-writing roles and fails closed when absent, off, lite, or imitated',()=>{
  assert.equal(PONYTAIL_DEFAULT_MODE,'full');
  assert.equal(ponytailRequiredForRole('builder'),true);
  assert.equal(ponytailRequiredForRole('qa-engineer'),false);
  const official={available:true,provider:'@dietrichgebert/ponytail',version:'4.8.4',mode:'full',attestation:'official host plugin'};
  assert.equal(minimalismRequirement('builder',official).satisfied,true);
  assert.equal(minimalismRequirement('builder',{available:true,provider:'home-grown-minimalism',version:'99.0.0',mode:'full'}).satisfied,false);
  assert.equal(minimalismRequirement('builder',{available:false}).satisfied,false);
  assert.equal(minimalismRequirement('builder',{available:true,provider:'@dietrichgebert/ponytail',version:'4.8.4',mode:'off'}).satisfied,false);
  assert.equal(minimalismRequirement('builder',{available:true,provider:'@dietrichgebert/ponytail',version:'4.8.4',mode:'lite'}).satisfied,false);
  assert.throws(()=>assertPonytailForMutation('builder',{available:false}),/PONYTAIL_REQUIRED/);
});

test('normal status and approval presentation are capsule-first rather than history-first',()=>{
  const progress=conciseProgress({percent:81,changed:'entry gate',validated:'unit tests',next:'cockpit'});
  assert.ok(progress.split('\n').length<=5);assert.match(progress,/81%/);
  const capsule=renderDecisionCapsuleMarkdown({stage:'final',title:'T',outcome:'Done',scopeSummary:'2 files',proofSummary:['AC 3/3','Scope clean'],riskSummary:'low',detailSections:['Evidence']});
  assert.match(capsule,/READY FOR FINAL APPROVAL/);assert.match(capsule,/Review Details/);
  const presentation=read('src/lib/presentation.ts');assert.match(presentation,/writeCompactReviewCockpit/);assert.match(presentation,/renderDecisionCapsuleMarkdown/);
  const compact=read('src/lib/compact-cockpit.ts');assert.match(compact,/data-specrail-decision-capsule=\\"v1\\"/);assert.match(compact,/<details class=\\"review-details\\">/);
});

test('host contracts force route choice, free text, and official Ponytail without silent install',()=>{
  const skill=read('skills/ai-flow/SKILL.md'),builder=read('skills/ai-flow-builder/SKILL.md'),pi=read('extensions/specrail.js'),managed=read('src/lib/managed-installation.ts');
  for(const text of [skill,managed]){assert.match(text,/SpecRail.*Directo.*Directo \+ verificar.*Other/is);assert.match(text,/Never choose|Never select|Never.*route.*user/i);}
  assert.match(skill,/2–4 concrete choices|2-4 concrete choices/);assert.match(skill,/free text|free-text/i);
  assert.match(builder,/official `ponytail`/i);assert.match(builder,/ponytail-review/i);assert.match(builder,/Never install third-party code silently/i);
  assert.match(pi,/name: 'specrail_entry_gate'/);assert.match(pi,/PROCESS_ROUTE_REQUIRED/);assert.match(pi,/Ponytail capability in full mode/i);
});
