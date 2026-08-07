// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { blockTask, completePhase, startRefinement } from '../dist/src/lib/workflow.js';
import { writeReviewCockpit } from '../dist/src/lib/cockpit.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-cockpit-'));
function preparedSpec(root){
  initProject(root,{name:'Cockpit Test'});readyProjectContext(root);
  const task=createTask(root,{title:'Improve Home Spotlight heading',type:'task',surfaces:['frontend']});
  startRefinement(root,task.meta.id);
  const loaded=loadTask(findTask(root,task.meta.id));
  loaded.body=setSection(loaded.body,'Need','Reduce the Home Spotlight heading dominance on mobile.');
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
  completePhase(root,task.meta.id);
  return task.meta.id;
}

test('Review Cockpit is generated from real task artifacts as a self-contained read-only HTML',()=>{
  const root=repo(),id=preparedSpec(root);
  const result=writeReviewCockpit(root,id,'spec');
  const html=readFileSync(result.path,'utf8');
  assert.equal(result.stage,'spec');
  assert.match(result.relativePath,/\.ai\/reviews\/TASK-0001-spec-cockpit\.html$/);
  assert.match(html,/SpecRail Review Cockpit/);
  assert.match(html,/Before \/ proposal \/ after/);
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

test('approval presentation attaches the interactive Cockpit before Markdown and evidence',()=>{
  const root=repo(),id=preparedSpec(root);
  const interaction=interactionForTask(root,id,'spec-approval');
  assert.equal(interaction.presentation.attachments[0].kind,'review-cockpit');
  assert.equal(interaction.presentation.attachments[0].mediaType,'text/html');
  assert.equal(interaction.presentation.attachments[0].display,'inline');
  assert.match(interaction.presentation.markdown,/Review Cockpit interactivo/i);
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
