import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject, loadProjectConfig } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { addEvidence, visualEvidenceDigest } from '../dist/src/lib/evidence.js';
import { addQuestion } from '../dist/src/lib/questions.js';
import { startRefinement, completePhase } from '../dist/src/lib/workflow.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';
import { nextAction } from '../dist/src/lib/next.js';
import { getVisualizationCapability, getVisualizationPlan, recordVisualizationCapability, recordVisualizationRun, getVisualizationRun } from '../dist/src/lib/capabilities.js';
import { validateVisualizationPlan } from '../dist/src/lib/visualization.js';

const repo=()=>{const root=mkdtempSync(path.join(tmpdir(),'ai-flow-visualize-'));initProject(root,{name:'Visualize'});readyProjectContext(root);return root;};
function frontendAtApproval(root){
 const task=createTask(root,{title:'Rediseñar spotlight',type:'feature',surfaces:['frontend'],size:'medium',risk:'medium'});startRefinement(root,task.meta.id);let t=loadTask(findTask(root,task.meta.id));
 for(const[h,v]of [['Need','Clarificar la jerarquía visual de Home Spotlight sin cambiar su función.'],['Product Value','Los visitantes identifican antes el contenido principal y la acción disponible.'],['Users','Visitantes de escritorio y móvil.'],['Scope','Rediseñar únicamente Home Spotlight conservando el contenido y comportamiento.'],['UI Target','- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000` and `390x844`\n- Capture: focused section'],['Out of Scope','Navegación, footer y otras secciones de la homepage.'],['Acceptance Criteria','- En 1440x1000 y 390x844 el título y CTA se muestran completos sin overflow horizontal.\n- La propuesta mantiene el contenido y la acción existentes.'],['Implementation Plan','Aplicar la propuesta aprobada, validar el DOM y capturar el mismo objetivo antes y después.']])t.body=setSection(t.body,h,v);
 t.meta.route.design=true;saveTask(t);setDefaultBlastRadius(root,t.meta.id);completePhase(root,t.meta.id);addApprovedImageGenProposal(root,t.meta.id,{target:'section#home-spotlight'});
 const evaluatorDir=path.join(root,'.ai','evidence',t.meta.id,'frontend');mkdirSync(evaluatorDir,{recursive:true});const evaluator=path.join(evaluatorDir,'visual-proposal-evaluator.json');writeFileSync(evaluator,JSON.stringify({schemaVersion:1,reviewerRole:'technical-reviewer',freshContext:true,sourceDigest:visualEvidenceDigest(root,t.meta.id,'proposal'),verdict:'pass',score:92,checks:{sourceFaithful:true,mobileReadable:true,noOverflow:true,noClipping:true,scopePreserved:true,targetMatch:true,noVisibleOverflow:true,noTextClipping:true,noOverlappingElements:true,readableText:true,designSystemConsistency:true}}));addEvidence(root,t.meta.id,{kind:'visual-proposal-evaluator-report',path:evaluator,source:'technical-review',label:'Independent visual proposal evaluation',tool:'Technical Reviewer'});
 completePhase(root,t.meta.id);return t.meta.id;
}
const goodQuality={evaluator:'fresh-context',clearPurpose:true,sourceFaithful:true,mobileReadable:true,noOverflow:true,noClipping:true,concise:true,score:95};

function planFor(root,id,session){
 return interactionForTask(root,id,'spec-approval',{sessionId:session}).presentation.visualization;
}

test('project config describes host capability discovery without claiming a Visualize tool exists',()=>{
 const config=loadProjectConfig(repo());
 assert.equal(config.visualize.enabled,true);
 assert.equal(config.visualize.capability,'visualize');
 assert.equal(config.visualize.discovery,'host-tool-list');
 assert.equal(config.visualize.fallback,'markdown-and-attachments');
 assert.equal(config.visualize.sourceOfTruth,'markdown');
 assert.equal(config.visualize.maxPerGate,1);
 assert.equal('provider' in config.visualize,false);
});

test('unknown capability produces a signed fallback-first plan and never claims rendering',()=>{
 const root=repo(),id=frontendAtApproval(root),interaction=interactionForTask(root,id,'spec-approval',{sessionId:'chat-a'});
 const plan=interaction.presentation.visualization;
 assert.equal(plan.schemaVersion,3);
 assert.equal(plan.capability,'visualize');
 assert.equal(plan.preferredCapabilityName,'Visualize');
 assert.equal(plan.availability,'unknown');
 assert.equal(plan.exactToolName,null);
 assert.equal(plan.kind,'ui-spec-review');
 assert.equal(plan.evaluatorMode,'fresh-context');
 assert.match(plan.planDigest,/^[a-f0-9]{64}$/);
 assert.match(plan.sourceDigest,/^[a-f0-9]{64}$/);
 assert.equal(plan.fallback,'markdown-and-attachments');
 assert.equal(plan.recordRequired,true);
 assert.equal(validateVisualizationPlan(plan).length,0);
 assert.equal(getVisualizationPlan(root,id,'spec-approval','chat-a').planDigest,plan.planDigest);
 assert.ok(interaction.presentation.attachments.some(x=>x.kind==='review-bundle'));
});

test('a rendered result requires the exact discovered tool, signed plan, invocation reference, result summary, and fresh evaluation',()=>{
 const root=repo(),id=frontendAtApproval(root);
 const before=getVisualizationCapability(root,'chat-b');assert.equal(before.availability,'unknown');
 recordVisualizationCapability(root,{sessionId:'chat-b',availability:'available',exactToolName:'visualize.render',reason:'Present in the current Codex host tool list'});
 const plan=planFor(root,id,'chat-b');
 assert.equal(plan.availability,'available');assert.equal(plan.exactToolName,'visualize.render');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-missing-plan',gate:'spec-approval',outcome:'rendered',provider:'visualize.render',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'call-1',resultText:'Rendered a canonical comparison without inventing facts.',quality:goodQuality}),/persists.*plan/i);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'visualize.render',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,resultText:'Rendered a canonical comparison without inventing facts.',quality:goodQuality}),/invocation reference/i);
 const record=recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'visualize.render',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'tool-call-42',resultText:'Rendered a canonical comparison of the approved screenshots and criteria.',quality:goodQuality});
 assert.equal(record.outcome,'rendered');assert.equal(record.invocationRef,'tool-call-42');assert.match(record.resultDigest,/^[a-f0-9]{64}$/);assert.equal(getVisualizationRun(root,id,'spec-approval','chat-b').provider,'visualize.render');
});

test('low-quality and self-approved high-impact visuals are rejected while an unavailable host records fallback',()=>{
 const root=repo(),id=frontendAtApproval(root);
 recordVisualizationCapability(root,{sessionId:'chat-quality',availability:'available',exactToolName:'visualize.render'});
 const plan=planFor(root,id,'chat-quality');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-quality',gate:'spec-approval',outcome:'rendered',provider:'visualize.render',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'call-low',resultText:'Rendered output with known layout and readability defects.',quality:{evaluator:'self-check',clearPurpose:true,sourceFaithful:true,mobileReadable:false,noOverflow:false,noClipping:true,concise:true,score:65}}),/fresh-context|quality|mobileReadable|overflow/i);
 recordVisualizationCapability(root,{sessionId:'chat-no-tool',availability:'unavailable',reason:'No matching capability in host tool list'});
 const fallbackPlan=planFor(root,id,'chat-no-tool');
 const fallback=recordVisualizationRun(root,{taskId:id,sessionId:'chat-no-tool',gate:'spec-approval',outcome:'fallback',provider:null,planDigest:fallbackPlan.planDigest,sourceDigest:fallbackPlan.sourceDigest,quality:null});
 assert.equal(fallback.outcome,'fallback');
});

test('changed source evidence invalidates a visualization plan before rendering',()=>{
 const root=repo(),id=frontendAtApproval(root);
 recordVisualizationCapability(root,{sessionId:'chat-stale',availability:'available',exactToolName:'visualize.render'});
 const interaction=interactionForTask(root,id,'spec-approval',{sessionId:'chat-stale'}),plan=interaction.presentation.visualization;
 const bundle=interaction.presentation.attachments.find(item=>item.kind==='review-bundle');
 appendFileSync(bundle.path,'\nChanged after visualization planning.\n');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-stale',gate:'spec-approval',outcome:'rendered',provider:'visualize.render',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'call-stale',resultText:'Rendered an obsolete source set that should not be accepted.',quality:goodQuality}),/sources changed/i);
});

test('questions, blockers, and status plans use structured payloads without answering for the user',()=>{
 const root=repo(),task=createTask(root,{title:'Elegir persistencia',type:'feature',surfaces:['backend'],size:'medium'});
 addQuestion(root,task.meta.id,{text:'¿Dónde deben persistirse los favoritos?',category:'data-model',impact:'high',options:['Solo local','Servidor'],recommendation:'Servidor'});
 const question=interactionForTask(root,task.meta.id,'open-questions',{sessionId:'chat-a'});assert.equal(question.visualization.kind,'decision-support');assert.equal(question.visualization.payload.questions[0].options.length,2);assert.equal(question.visualization.constraints.mustNotAnswerForUser,true);
 let t=loadTask(findTask(root,task.meta.id));t.meta.status='blocked';t.meta.block_reason='La migración existente no admite rollback seguro.';saveTask(t);
 const blocker=interactionForTask(root,task.meta.id,'blocker',{sessionId:'chat-a'});assert.equal(blocker.visualization.kind,'blocker-explainer');assert.match(blocker.visualization.purpose,/cause|causa|impact/i);
 const next=nextAction(root,task.meta.id,{sessionId:'chat-a'});assert.equal(next.visualization.kind,'workflow-status');assert.equal(next.visualization.payload.taskId,task.meta.id);assert.ok(Array.isArray(next.visualization.payload.steps));
});

test('skills require actual capability discovery, signed outcome recording, and Markdown fallback',()=>{
 const primary=readFileSync(path.join(process.cwd(),'skills/ai-flow/SKILL.md'),'utf8');
 const ux=readFileSync(path.join(process.cwd(),'skills/ai-flow-ux-ui-designer/SKILL.md'),'utf8');
 const managed=readFileSync(path.join(process.cwd(),'src/lib/managed-installation.ts'),'utf8');
 assert.match(primary,/host tool|tool list|capabilit/i);assert.match(primary,/plan.?digest|signed plan/i);assert.match(primary,/invocation reference|tool call/i);assert.match(primary,/fallback|unavailable|no disponible/i);
 assert.match(ux,/host tool|tool list|capabilit/i);assert.match(managed,/ai-flow\/SKILL\.md|complete workflow contract/i);
});

test('legacy visualization capability records migrate without deleting project runtime state',()=>{
 const root=repo(),file=path.join(root,'.ai','runtime','capabilities','legacy-chat.json');
 mkdirSync(path.dirname(file),{recursive:true});
 writeFileSync(file,JSON.stringify({schemaVersion:1,capability:'visualize',sessionId:'legacy-chat',availability:'available',exactToolName:'legacy.visualize',reason:null,checkedAt:'2026-08-01T00:00:00.000Z'}));
 const migrated=getVisualizationCapability(root,'legacy-chat');
 assert.equal(migrated.schemaVersion,2);assert.equal(migrated.preferredCapabilityName,'Visualize');assert.equal(migrated.exactToolName,'legacy.visualize');
});
