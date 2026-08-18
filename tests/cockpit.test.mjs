// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { blockTask, completePhase, startRefinement } from '../dist/src/lib/workflow.js';
import { writeReviewCockpit } from '../dist/src/lib/cockpit.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';
import { addEvidence } from '../dist/src/lib/evidence.js';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-cockpit-'));
function preparedSpec(root){
  initProject(root,{name:'Cockpit Test'});readyProjectContext(root);
  const task=createTask(root,{title:'Redesign Home Spotlight heading hierarchy',type:'task',surfaces:['frontend']});
  startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Redesign the Home Spotlight heading hierarchy across mobile and desktop.');
  loaded.body=setSection(loaded.body,'Product Value','Make the section hierarchy easier to scan.');
  loaded.body=setSection(loaded.body,'Users','Homepage visitors on mobile and desktop.');
  loaded.body=setSection(loaded.body,'Scope','Only the Home Spotlight heading.');
  loaded.body=setSection(loaded.body,'UI Target','- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `390x844` and `1440x1000`\n- Capture: focused section');
  loaded.body=setSection(loaded.body,'Out of Scope','Cards, navigation, backend and copy.');
  loaded.body=setSection(loaded.body,'Acceptance Criteria','- The heading is fully readable at 390x844 and 1440x1000.\n- There is no overflow, clipping or overlap.');
  loaded.meta.route.design=true;saveTask(loaded);
  setDefaultBlastRadius(root,task.meta.id);
  completePhase(root,task.meta.id);
  addApprovedImageGenProposal(root,task.meta.id,{target:'section#home-spotlight'});
  addApprovedImageGenProposal(root,task.meta.id,{target:'section#home-spotlight',viewport:'390x844',beforeLabel:'Mobile before',proposalLabel:'Mobile proposal'});
  completePhase(root,task.meta.id);
  return task.meta.id;
}

test('Review Cockpit is generated from real task artifacts as a self-contained read-only HTML',()=>{
  const root=repo(),id=preparedSpec(root);
  const result=writeReviewCockpit(root,id,'spec');
  const html=readFileSync(result.path,'utf8');
  assert.equal(result.stage,'spec');
  assert.match(result.relativePath,/\.ai\/reviews\/TASK-0001-spec-cockpit\.html$/);
  assert.match(result.openUrl,/^file:\/\//);assert.ok(result.openUrl.includes('TASK-0001-spec-cockpit.html'));assert.equal(result.openActionRequired,true);
  assert.match(html,/SpecRail Review Cockpit/);
  assert.match(html,/Before \/ proposal \/ after/);
  assert.match(html,/data-specrail-comparator="v2"/);
  assert.match(html,/data-mode="side-by-side"/);
  assert.match(html,/data-mode="slider"/);
  assert.match(html,/data-mode="overlay"/);
  assert.match(html,/data-specrail-control="viewport"/);
  assert.match(html,/data-specrail-control="route-target"/);
  assert.match(html,/data-specrail-control="capture-scope"/);
  assert.match(html,/route, target, viewport and capture scope|route\/target\/viewport\/capture/i);
  assert.match(html,/SpecRail will not mix captures from different contexts/i);
  assert.match(html,/data:image\/png;base64/);
  assert.match(html,/This Cockpit is read-only/);
  assert.match(html,/native Codex decision prompt/);
  assert.equal((html.match(/data-choice=/g) || []).length,3);
  assert.equal((html.match(/data-choice="Approve specification"/g) || []).length,1);
  assert.doesNotMatch(html,/<script src=/i);
  assert.doesNotMatch(html,/fetch\(/i);
  assert.ok(result.readiness.total>=5);
  assert.equal(result.blockers.length,0);
});

test('Review Cockpit inline runtime is syntactically valid JavaScript',()=>{
  const root=repo(),id=preparedSpec(root);
  const html=readFileSync(writeReviewCockpit(root,id,'spec').path,'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match=>match[1])
    .filter(Boolean);
  assert.ok(scripts.length>=1,'Cockpit should contain an inline runtime');
  const scriptPath=path.join(root,'.ai','reviews','cockpit-runtime.js');
  writeFileSync(scriptPath,scripts.join('\n'));
  const checked=spawnSync(process.execPath,['--check',scriptPath],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);
});

test('normal approval presentation excludes Cockpit and exposes Review Details plus inline evidence',()=>{
  const root=repo(),id=preparedSpec(root);
  const interaction=interactionForTask(root,id,'spec-approval');
  assert.equal(interaction.presentation.attachments.some(item=>item.kind==='review-cockpit'),false);
  assert.equal(interaction.presentation.attachments[0].kind,'review-bundle');
  assert.equal(interaction.presentation.attachments[0].mediaType,'text/markdown');
  assert.equal(interaction.presentation.attachments[0].display,'attachment');
  assert.ok(interaction.presentation.attachments.filter(item=>item.requiredVisible).every(item=>item.display==='inline'));
  assert.ok(interaction.actions.every(action=>action.type==='present-image'));
  assert.match(interaction.presentation.markdown,/READY FOR SPEC APPROVAL/i);
  assert.match(interaction.presentation.markdown,/\*\*Outcome:\*\*/i);
  assert.match(interaction.presentation.markdown,/\*\*Scope:\*\*/i);
  assert.match(interaction.presentation.markdown,/Review Details/i);
  const bundleText=readFileSync(interaction.presentation.attachments[0].path,'utf8').trim();
  assert.equal(interaction.presentation.markdown.includes(bundleText),false,'compact approval must not dump Review Details inline');
  assert.doesNotMatch(interaction.presentation.markdown,/interactive Review Cockpit\.html —/i);
});

test('explicit manual Cockpit generation never claims host presentation succeeded',()=>{
  const root=repo(),id=preparedSpec(root);
  const cockpit=writeReviewCockpit(root,id,'spec');
  assert.equal(cockpit.hostPresentation,'unverified');
  assert.equal(cockpit.hostPresentationVerified,false);
  assert.equal(cockpit.openActionRequired,true);
  assert.match(cockpit.openUrl,/^file:\/\//);assert.match(cockpit.presentationHint,/openUrl.*explicit browser fallback/i);
  assert.match(cockpit.presentationHint,/does not confirm/i);
  assert.match(cockpit.presentationHint,/opened|rendered|displayed/i);
});

test('Cockpit escapes blocker content and explains why the task is blocked',()=>{
  const root=repo(),id=preparedSpec(root);
  blockTask(root,id,'Browser failed <script>alert(1)</script> after layout audit.');
  const result=writeReviewCockpit(root,id,'status');
  const html=readFileSync(result.path,'utf8');
  assert.ok(result.blockers.some(item=>item.includes('Browser failed')));
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/Why blocked \/ not ready/);
});

test('Cockpit keeps only the latest canonical visual per role/viewport/target and keeps proposal visible',()=>{
  const root=repo(),id=preparedSpec(root);
  const dir=path.join(root,'.ai','evidence',id,'frontend');mkdirSync(dir,{recursive:true});
  const replacement=path.join(dir,'before-new.png');writeFileSync(replacement,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64'));
  const newest=addEvidence(root,id,{kind:'frontend-before',path:replacement,source:'browser-capture',label:'Newest before',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#home-spotlight',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
  const html=readFileSync(writeReviewCockpit(root,id,'spec').path,'utf8');
  const dataMatch=html.match(/const cockpit=(\{[\s\S]*?\});const roles=/);
  assert.ok(dataMatch,'Cockpit should embed its canonical data model');
  const data=JSON.parse(dataMatch[1]);
  const visuals=data.visuals.filter(item=>item.viewport==='1440x1000'&&item.target==='section#home-spotlight');
  assert.equal(data.comparator.schemaVersion,2);
  assert.deepEqual(data.comparator.modes,['side-by-side','slider','overlay']);
  assert.deepEqual(data.comparator.requiredRoles,['before','proposal']);
  assert.equal(visuals.filter(item=>item.group==='before').length,1);
  assert.equal(visuals.find(item=>item.group==='before').id,newest.id);
  assert.equal(visuals.filter(item=>item.group==='proposal').length,1);
  assert.ok(visuals.find(item=>item.group==='proposal').uri.startsWith('data:image/png;base64,'));
});

test('Cockpit excludes stale visual contexts that are no longer declared by the approved UI Target',()=>{
  const root=repo(),id=preparedSpec(root),dir=path.join(root,'.ai','evidence',id,'frontend');mkdirSync(dir,{recursive:true});
  const base=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');
  const staleBefore=path.join(dir,'stale-before.png'),staleProposal=path.join(dir,'stale-proposal.png');writeFileSync(staleBefore,Buffer.concat([base,Buffer.from([91])]));writeFileSync(staleProposal,Buffer.concat([base,Buffer.from([92])]));
  addEvidence(root,id,{kind:'frontend-before',path:staleBefore,source:'browser-capture',label:'Stale before',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#old-target',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
  addEvidence(root,id,{kind:'frontend-proposal',path:staleProposal,source:'image-gen-proposal',label:'Stale proposal',tool:'ChatGPT Image Gen',route:'/',viewport:'1440x1000',target:'section#old-target',captureScope:'focused-section'});
  const html=readFileSync(writeReviewCockpit(root,id,'spec').path,'utf8'),dataMatch=html.match(/const cockpit=(\{[\s\S]*?\});const roles=/);assert.ok(dataMatch);
  const data=JSON.parse(dataMatch[1]);assert.equal(data.visuals.some(item=>item.target==='section#old-target'),false);assert.ok(data.visuals.every(item=>item.target==='section#home-spotlight'));
});

test('final Cockpit declares Before, Proposal and After as required comparator roles for frontend review',()=>{
  const root=repo(),id=preparedSpec(root);
  const html=readFileSync(writeReviewCockpit(root,id,'final').path,'utf8');
  const dataMatch=html.match(/const cockpit=(\{[\s\S]*?\});const roles=/);
  assert.ok(dataMatch);
  const data=JSON.parse(dataMatch[1]);
  assert.deepEqual(data.comparator.requiredRoles,['before','proposal','after']);
  assert.match(html,/data-specrail-missing-role|dataset\.specrailMissingRole/);
});