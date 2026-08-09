import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
import { getVisualizationCapability, getVisualizationPlan, recordVisualizationCapability, recordVisualizationRun, getVisualizationRun, visualizationPlanPath } from '../dist/src/lib/capabilities.js';
import { validateVisualizationPlan } from '../dist/src/lib/visualization.js';
import { specificationPresentation } from '../dist/src/lib/presentation.js';

const repo=()=>{const root=mkdtempSync(path.join(tmpdir(),'ai-flow-visualize-'));initProject(root,{name:'Visualize'});readyProjectContext(root);return root;};
function frontendAtApproval(root){
 const task=createTask(root,{title:'Rediseñar spotlight',type:'feature',surfaces:['frontend'],size:'medium',risk:'medium'});startRefinement(root,task.meta.id);let t=loadTask(findTask(root,task.meta.id));
 for(const[h,v]of [['Need','Clarificar la jerarquía visual de Home Spotlight sin cambiar su función.'],['Product Value','Los visitantes identifican antes el contenido principal y la acción disponible.'],['Users','Visitantes de escritorio y móvil.'],['Scope','Rediseñar únicamente Home Spotlight conservando el contenido y comportamiento.'],['UI Target','- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000` and `390x844`\n- Capture: focused section'],['Out of Scope','Navegación, footer y otras secciones de la homepage.'],['Acceptance Criteria','- En 1440x1000 y 390x844 el título y CTA se muestran completos sin overflow horizontal.\n- La propuesta mantiene el contenido y la acción existentes.'],['Implementation Plan','Aplicar la propuesta aprobada, validar el DOM y capturar el mismo objetivo antes y después.']])t.body=setSection(t.body,h,v);
 t.meta.route.design=true;saveTask(t);setDefaultBlastRadius(root,t.meta.id);completePhase(root,t.meta.id);addApprovedImageGenProposal(root,t.meta.id,{target:'section#home-spotlight'});addApprovedImageGenProposal(root,t.meta.id,{target:'section#home-spotlight',viewport:'390x844',beforeLabel:'Mobile before',proposalLabel:'Mobile proposal'});
 const evaluatorDir=path.join(root,'.ai','evidence',t.meta.id,'frontend');mkdirSync(evaluatorDir,{recursive:true});const evaluator=path.join(evaluatorDir,'visual-proposal-evaluator.json');writeFileSync(evaluator,JSON.stringify({schemaVersion:1,reviewerRole:'technical-reviewer',freshContext:true,sourceDigest:visualEvidenceDigest(root,t.meta.id,'proposal'),verdict:'pass',score:92,checks:{sourceFaithful:true,mobileReadable:true,noOverflow:true,noClipping:true,scopePreserved:true,targetMatch:true,noVisibleOverflow:true,noTextClipping:true,noOverlappingElements:true,readableText:true,designSystemConsistency:true}}));addEvidence(root,t.meta.id,{kind:'visual-proposal-evaluator-report',path:evaluator,source:'technical-review',label:'Independent visual proposal evaluation',tool:'Technical Reviewer'});
 completePhase(root,t.meta.id);return t.meta.id;
}
const goodQuality={evaluator:'fresh-context',clearPurpose:true,sourceFaithful:true,mobileReadable:true,noOverflow:true,noClipping:true,concise:true,score:95};

function planFor(root,id,session){
 return interactionForTask(root,id,'spec-approval',{sessionId:session}).presentation.visualization;
}
function visualArtifact(name='review.html',plan=null,ids=null,{substituteId=null,staticComparator=false}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'codex-visualize-'));const file=path.join(dir,name);const requiredIds=ids??plan?.requiredSourceIds??[];const sources=new Map((plan?.sources??[]).map(source=>[source.id,source]));
 const blocks=requiredIds.map(id=>{const role=sources.get(id)?.reviewRole??'supporting';const source=sources.get(id);const route=source?.route?` data-specrail-route="${source.route}"`:'';const target=source?.target?` data-specrail-target="${source.target}"`:'';const viewport=source?.viewport?` data-specrail-viewport="${source.viewport}"`:'';const captureScope=source?.captureScope?` data-specrail-capture-scope="${source.captureScope}"`:'';const bytes=id===substituteId?Buffer.from('wrong canonical image'):readFileSync(source.path);const mediaType=source?.mediaType||'image/png';const encoded=bytes.toString('base64');return `<figure><img data-specrail-evidence-id="${id}" data-specrail-source-sha256="${source?.sha256??''}" data-specrail-comparator-source="v2" data-specrail-review-role="${role}"${route}${target}${viewport}${captureScope} alt="${id}" src="data:${mediaType};base64,${encoded}"></figure>`}).join('');
 const runtime=staticComparator?'':`<input type="range" data-specrail-control="split"><input type="range" data-specrail-control="opacity"><script data-specrail-comparator-runtime="v2">document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{}));document.querySelector('[data-specrail-control=viewport]').addEventListener('change',()=>{});document.querySelector('[data-specrail-control=route-target]').addEventListener('change',()=>{});document.querySelector('[data-specrail-control=capture-scope]').addEventListener('change',()=>{});document.querySelector('[data-specrail-control=split]').addEventListener('input',event=>{document.body.style.clipPath='inset(0 '+event.target.value+'% 0 0)'});document.querySelector('[data-specrail-control=opacity]').addEventListener('input',event=>{document.body.style.opacity=String(Number(event.target.value)/100)});</script>`;
 const comparator=plan?.experience?.pattern==='visual-comparator-v2'?`<div data-specrail-comparator="v2"><button data-mode="side-by-side">Side by side</button><button data-mode="slider">Slider</button><button data-mode="overlay">Overlay</button><select data-specrail-control="viewport"></select><select data-specrail-control="route-target"></select><select data-specrail-control="capture-scope"></select>${blocks}${runtime}</div>`:`<div id="visual-root">${blocks||'Review'}</div>`;writeFileSync(file,comparator);return file;
}

test('project config describes Codex skill discovery and explicit $visualize invocation',()=>{
 const config=loadProjectConfig(repo());
 assert.equal(config.visualize.enabled,true);
 assert.equal(config.visualize.capability,'visualize');
 assert.equal(config.visualize.discovery,'codex-skill-catalog');
 assert.equal(config.visualize.skill,'visualize');
 assert.equal(config.visualize.invocation,'$visualize');
 assert.equal(config.visualize.fallback,'markdown-and-attachments');
 assert.equal(config.visualize.sourceOfTruth,'markdown');
 assert.equal(config.visualize.maxPerGate,1);
 assert.equal('provider' in config.visualize,false);
});

test('unknown capability produces a signed fallback-first plan and never claims rendering',()=>{
 const root=repo(),id=frontendAtApproval(root),interaction=interactionForTask(root,id,'spec-approval',{sessionId:'chat-a'});
 const plan=interaction.presentation.visualization;
 assert.equal(plan.schemaVersion,4);
 assert.equal(plan.capability,'visualize');
 assert.equal(plan.preferredCapabilityName,'Visualize');
 assert.equal(plan.preferredSkillName,'visualize');
 assert.equal(plan.skillInvocation,'$visualize');
 assert.equal(plan.discovery,'codex-skill-catalog');
 assert.equal(plan.availability,'unknown');
 assert.equal(plan.exactSkillName,null);
 assert.equal(plan.kind,'ui-spec-review');
 assert.equal(plan.experience.pattern,'visual-comparator-v2');
 assert.deepEqual(plan.payload.renderingContract.comparator.modes,['side-by-side','slider','overlay']);
 assert.deepEqual(plan.payload.renderingContract.comparator.filters,['viewport','route-target','capture-scope']);
 assert.deepEqual(plan.payload.renderingContract.comparator.groupBy,['route','target','viewport','captureScope']);
 assert.equal(plan.payload.renderingContract.comparator.crossContextComparison,'forbidden');
 assert.deepEqual(plan.payload.renderingContract.comparator.requiredRoles,['before','proposal']);
 assert.equal(plan.evaluatorMode,'fresh-context');
 assert.match(plan.planDigest,/^[a-f0-9]{64}$/);
 assert.match(plan.sourceDigest,/^[a-f0-9]{64}$/);
 assert.equal(plan.fallback,'markdown-and-attachments');
 assert.equal(plan.recordRequired,true);
 assert.equal(plan.constraints.requiredEvidenceContent,'embedded-data-image');
 assert.deepEqual(plan.sources.filter(x=>x.requiredInVisual).map(x=>x.reviewRole).sort(),['before','before','proposal','proposal']);
 assert.deepEqual([...plan.requiredSourceIds].sort(),plan.sources.filter(x=>x.requiredInVisual).map(x=>x.id).sort());
 assert.equal(validateVisualizationPlan(plan).length,0);
 assert.equal(getVisualizationPlan(root,id,'spec-approval','chat-a').planDigest,plan.planDigest);
 assert.ok(interaction.presentation.attachments.some(x=>x.kind==='review-bundle'));
});



test('Visualize required sources exclude stale frontend contexts outside the current UI Target',()=>{
 const root=repo(),id=frontendAtApproval(root),dir=path.join(root,'.ai','evidence',id,'frontend'),base=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');mkdirSync(dir,{recursive:true});
 const before=path.join(dir,'stale-before.png'),proposal=path.join(dir,'stale-proposal.png');writeFileSync(before,Buffer.concat([base,Buffer.from([61])]));writeFileSync(proposal,Buffer.concat([base,Buffer.from([62])]));
 addEvidence(root,id,{kind:'frontend-before',path:before,source:'browser-capture',label:'Old target before',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#old-target',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});addEvidence(root,id,{kind:'frontend-proposal',path:proposal,source:'image-gen-proposal',label:'Old target proposal',tool:'ChatGPT Image Gen',route:'/',viewport:'1440x1000',target:'section#old-target',captureScope:'focused-section'});
 const plan=interactionForTask(root,id,'spec-approval',{sessionId:'stale-filter'}).presentation.visualization;
 const required=plan.sources.filter(source=>plan.requiredSourceIds.includes(source.id));assert.equal(required.some(source=>source.target==='section#old-target'),false);assert.ok(required.every(source=>source.target==='section#home-spotlight'));
});

test('architecture and database rendered diagrams are mandatory visual sources when those review routes are active',()=>{
 const root=repo(),task=createTask(root,{title:'Review architecture boundary',type:'architecture',surfaces:['architecture'],size:'medium',risk:'medium'});
 let t=loadTask(findTask(root,task.meta.id));t.meta.route.architecture=true;saveTask(t);
 const dir=path.join(root,'.ai','evidence',task.meta.id,'architecture');mkdirSync(dir,{recursive:true});
 const diagram=path.join(dir,'diagram.svg');writeFileSync(diagram,'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80"/></svg>');
 addEvidence(root,task.meta.id,{kind:'architecture-rendered',path:diagram,source:'design-proposal',label:'Rendered architecture',tool:'Codex'});
 const presentation=specificationPresentation(root,task.meta.id,'architecture-review'),plan=presentation.visualization;
 assert.equal(plan.kind,'architecture-spec-review');
 const required=plan.sources.filter(source=>source.requiredInVisual);
 assert.equal(required.length,1);assert.equal(required[0].kind,'architecture-rendered');assert.equal(required[0].mediaType,'image/svg+xml');assert.deepEqual(plan.requiredSourceIds,[required[0].id]);
});
test('a rendered result requires the exact Visualize skill, signed plan, content reference, result summary, and fresh evaluation',()=>{
 const root=repo(),id=frontendAtApproval(root);
 const before=getVisualizationCapability(root,'chat-b');assert.equal(before.availability,'unknown');
 recordVisualizationCapability(root,{sessionId:'chat-b',availability:'available',exactSkillName:'visualize',reason:'The current Codex skill catalog exposes $visualize'});
 const plan=planFor(root,id,'chat-b');
 assert.equal(plan.availability,'available');assert.equal(plan.exactSkillName,'visualize');assert.equal(plan.skillInvocation,'$visualize');
 assert.equal(plan.constraints.imageSourcePolicy,'embed-data-uri');assert.equal(plan.constraints.forbidLocalFileImageSrc,true);assert.equal(plan.payload.renderingContract.localImages,'read-bytes-and-embed-as-data-uri');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-missing-plan',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'call-1',resultText:'Rendered a canonical comparison without inventing facts.',artifactPath:visualArtifact(),quality:goodQuality}),/persists.*plan/i);
 const artifact=visualArtifact('review.html',plan);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,resultText:'Rendered a canonical comparison without inventing facts.',artifactPath:artifact,quality:goodQuality}),/native Visualize content reference/i);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'visualize-content-ref:'+artifact,resultText:'Rendered a canonical comparison without inventing facts.',artifactPath:artifact,quality:goodQuality}),/exact native.*visualize content reference/i);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'visualize{\"path\":\"/tmp/different.html\"}',resultText:'Rendered a canonical comparison without inventing facts.',artifactPath:artifact,quality:goodQuality}),/path must match artifactPath/i);
 const contentRef=`visualize${JSON.stringify({path:artifact,title:'SpecRail review'})}`;
 const record=recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:contentRef,resultText:'Rendered a canonical comparison of the approved screenshots and criteria.',artifactPath:artifact,quality:goodQuality});
 assert.equal(record.outcome,'rendered');assert.equal(record.invocationRef,contentRef);assert.match(record.resultDigest,/^[a-f0-9]{64}$/);assert.deepEqual([...record.displayedSourceIds].sort(),[...plan.requiredSourceIds].sort());assert.equal(getVisualizationRun(root,id,'spec-approval','chat-b').provider,'$visualize');
 const flat=path.join(path.dirname(artifact),'flat.html');writeFileSync(flat,readFileSync(artifact,'utf8').replace('data-specrail-comparator="v2"',''));
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:flat})}`,resultText:'A static evidence gallery must not satisfy the comparator v2 contract.',artifactPath:flat,quality:goodQuality}),/Comparator v2|side-by-side|viewport/i);
 const mislabeled=path.join(path.dirname(artifact),'mislabeled.html');writeFileSync(mislabeled,readFileSync(artifact,'utf8').replace(/data-specrail-review-role="(?:before|proposal|after)"/g,'data-specrail-review-role="supporting"'));
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:mislabeled})}`,resultText:'Comparator markup with wrong role metadata must be rejected.',artifactPath:mislabeled,quality:goodQuality}),/review role|data-specrail-route|viewport/i);
 const missingProposal=visualArtifact('missing-proposal.html',plan,plan.requiredSourceIds.slice(0,1));
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:missingProposal})}`,resultText:'Rendered only part of the canonical evidence, which must be rejected.',artifactPath:missingProposal,quality:goodQuality}),/missing visible embedded canonical evidence/i);
 const wrapperOnly=path.join(path.dirname(artifact),'wrapper-only.html');writeFileSync(wrapperOnly,readFileSync(artifact,'utf8').replace(/data-specrail-evidence-id="[^"]+"/g,''));
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-b',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:wrapperOnly})}`,resultText:'Wrapper markers must not be enough to claim the canonical images were shown.',artifactPath:wrapperOnly,quality:goodQuality}),/missing visible embedded canonical evidence/i);
});


test('Visualize can register its task-owned HTML fragment outside the checked-out repository',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='chat-artifact';
 recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId);
 const visualDir=mkdtempSync(path.join(tmpdir(),'codex-visualization-'));
 const artifact=path.join(visualDir,'review-cockpit.html');const generated=visualArtifact('external-source.html',plan);writeFileSync(artifact,readFileSync(generated));
 const record=recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Visualize prepared the signed review comparator and its native content reference.',artifactPath:artifact,quality:goodQuality});
 assert.equal(record.artifactPath,artifact);
 const bad=path.join(visualDir,'review.txt');writeFileSync(bad,'not html');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:bad})}`,resultText:'Visualize prepared a non-HTML artifact that must be rejected by the contract.',artifactPath:bad,quality:goodQuality}),/HTML fragments/i);
});


test('Visualize rejects symlink HTML artifacts even when the lexical path is outside the checkout',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='chat-symlink-artifact';recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),inside=path.join(root,'review-inside.html');writeFileSync(inside,readFileSync(visualArtifact('symlink-source.html',plan)));
 const externalDir=mkdtempSync(path.join(tmpdir(),'codex-visualization-link-')),link=path.join(externalDir,'review.html');symlinkSync(inside,link);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:link})}`,resultText:'Attempted Visualize render through an external symlink into the checkout.',artifactPath:link,quality:goodQuality}),/symbolic links|outside the checked-out repository/i);
});

test('rendered Visualize rejects substituted image bytes even when evidence IDs and declared hashes look correct',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='chat-substitution';
 recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),victim=plan.requiredSourceIds[0],artifact=visualArtifact('substituted.html',plan,null,{substituteId:victim});
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Attempted rendered comparator with substituted bytes.',artifactPath:artifact,quality:goodQuality}),/embedded bytes do not match canonical evidence/i);
});

test('Visual Comparator v2 rejects a static gallery with decorative mode buttons and filters',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='chat-static';
 recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),artifact=visualArtifact('static.html',plan,null,{staticComparator:true});
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Decorative controls without comparator runtime must not count.',artifactPath:artifact,quality:goodQuality}),/split range|opacity control|interactive runtime/i);
});

test('low-quality and self-approved high-impact visuals are rejected while an unavailable host records fallback',()=>{
 const root=repo(),id=frontendAtApproval(root);
 recordVisualizationCapability(root,{sessionId:'chat-quality',availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,'chat-quality'),artifact=visualArtifact('quality.html',plan);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-quality',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Rendered output with known layout and readability defects.',artifactPath:artifact,quality:{evaluator:'self-check',clearPurpose:true,sourceFaithful:true,mobileReadable:false,noOverflow:false,noClipping:true,concise:true,score:65}}),/fresh-context|quality|mobileReadable|overflow/i);
 recordVisualizationCapability(root,{sessionId:'chat-no-tool',availability:'unavailable',reason:'The current Codex skill catalog does not expose visualize'});
 const fallbackPlan=planFor(root,id,'chat-no-tool');
 const fallback=recordVisualizationRun(root,{taskId:id,sessionId:'chat-no-tool',gate:'spec-approval',outcome:'fallback',provider:null,planDigest:fallbackPlan.planDigest,sourceDigest:fallbackPlan.sourceDigest,quality:null});
 assert.equal(fallback.outcome,'fallback');
});


test('tampering with persisted visualization plan structure invalidates its signed plan digest',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='chat-plan-tamper';
 recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),file=visualizationPlanPath(root,id,'spec-approval',sessionId),tampered=JSON.parse(readFileSync(file,'utf8'));
 tampered.experience.pattern='static-gallery';writeFileSync(file,JSON.stringify(tampered,null,2));
 const artifact=visualArtifact('tampered-plan.html',plan);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Attempted render from a tampered persisted plan.',artifactPath:artifact,quality:goodQuality}),/plan integrity check failed/i);
});

test('changed source evidence invalidates a visualization plan before rendering',()=>{
 const root=repo(),id=frontendAtApproval(root);
 recordVisualizationCapability(root,{sessionId:'chat-stale',availability:'available',exactSkillName:'visualize'});
 const interaction=interactionForTask(root,id,'spec-approval',{sessionId:'chat-stale'}),plan=interaction.presentation.visualization;
 const bundle=interaction.presentation.attachments.find(item=>item.kind==='review-bundle');
 appendFileSync(bundle.path,'\nChanged after visualization planning.\n');
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId:'chat-stale',gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:'call-stale',resultText:'Rendered an obsolete source set that should not be accepted.',artifactPath:visualArtifact(),quality:goodQuality}),/sources changed/i);
});

test('questions, blockers, and status plans use structured payloads without answering for the user',()=>{
 const root=repo(),task=createTask(root,{title:'Elegir persistencia',type:'feature',surfaces:['backend'],size:'medium'});
 addQuestion(root,task.meta.id,{text:'¿Dónde deben persistirse los favoritos?',category:'data-model',impact:'high',options:['Solo local','Servidor'],recommendation:'Servidor'});
 const question=interactionForTask(root,task.meta.id,'open-questions',{sessionId:'chat-a'});assert.equal(question.visualization.kind,'decision-support');assert.equal(question.visualization.payload.questions[0].options.length,2);assert.equal(question.visualization.constraints.mustNotAnswerForUser,true);
 let t=loadTask(findTask(root,task.meta.id));t.meta.status='blocked';t.meta.block_reason='La migración existente no admite rollback seguro.';saveTask(t);
 const blocker=interactionForTask(root,task.meta.id,'blocker',{sessionId:'chat-a'});assert.equal(blocker.visualization.kind,'blocker-explainer');assert.match(blocker.visualization.purpose,/cause|causa|impact/i);
 const next=nextAction(root,task.meta.id,{sessionId:'chat-a'});assert.equal(next.visualization.kind,'workflow-status');assert.equal(next.visualization.payload.taskId,task.meta.id);assert.ok(Array.isArray(next.visualization.payload.steps));
});

test('skills use explicit $visualize invocation, signed outcome recording, and Markdown fallback',()=>{
 const primary=readFileSync(path.join(process.cwd(),'skills/ai-flow/SKILL.md'),'utf8');
 const ux=readFileSync(path.join(process.cwd(),'skills/ai-flow-ux-ui-designer/SKILL.md'),'utf8');
 const managed=readFileSync(path.join(process.cwd(),'src/lib/managed-installation.ts'),'utf8');
 assert.match(primary,/\$visualize/);assert.match(primary,/skill catalog/i);assert.match(primary,/signed plan/i);assert.match(primary,/content reference|invocation reference/i);assert.match(primary,/fallback|unavailable|non-blocking/i);
 assert.match(primary,/do not ask the user to type `?\/visualize/i);assert.match(primary,/render\.py/i);
 assert.match(primary,/data:image|data URI/i);assert.match(primary,/data-specrail-evidence-id/i);assert.match(primary,/directly on the `<img>`|directly to the embedded <img>/i);assert.match(primary,/Never use `file:\/\//i);
 assert.match(ux,/\$visualize/);assert.match(ux,/skill catalog/i);assert.match(managed,/\$visualize/);assert.match(managed,/ai-flow\/SKILL\.md|complete workflow contract/i);
});

test('legacy host-tool capability records are invalidated and must rediscover the Visualize skill',()=>{
 const root=repo(),file=path.join(root,'.ai','runtime','capabilities','legacy-chat.json');
 mkdirSync(path.dirname(file),{recursive:true});
 writeFileSync(file,JSON.stringify({schemaVersion:2,capability:'visualize',sessionId:'legacy-chat',availability:'available',exactToolName:'legacy.visualize',reason:null,checkedAt:'2026-08-01T00:00:00.000Z'}));
 const migrated=getVisualizationCapability(root,'legacy-chat');
 assert.equal(migrated.schemaVersion,3);assert.equal(migrated.preferredSkillName,'visualize');assert.equal(migrated.skillInvocation,'$visualize');assert.equal(migrated.availability,'unknown');assert.equal(migrated.exactSkillName,null);assert.match(migrated.reason,/legacy.*host-tool|rediscover/i);
});

test('Visualize availability accepts only the canonical visualize skill and rejects invented tool names',()=>{
 const root=repo();
 assert.throws(()=>recordVisualizationCapability(root,{sessionId:'chat-tool',availability:'available',exactSkillName:'visualize.render'}),/skill name.*visualize/i);
 const record=recordVisualizationCapability(root,{sessionId:'chat-skill',availability:'available',exactSkillName:'$visualize'});
 assert.equal(record.exactSkillName,'visualize');assert.equal(record.skillInvocation,'$visualize');
});

test('Visual Comparator v2 requires exact case-sensitive context metadata and capture scope on canonical images',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='case-sensitive-artifact';recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),artifact=visualArtifact('case-mismatch.html',plan);let html=readFileSync(artifact,'utf8');
 const victim=plan.sources.find(source=>plan.requiredSourceIds.includes(source.id)&&source.target);assert.ok(victim);
 html=html.replace(`data-specrail-target="${victim.target}"`,`data-specrail-target="${String(victim.target).replace('home-spotlight','Home-Spotlight')}"`);writeFileSync(artifact,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Attempted comparator with case-changed context metadata.',artifactPath:artifact,quality:goodQuality}),/data-specrail-target/i);
});

test('Visual Comparator v2 rejects required canonical images that are directly hidden or not marked as comparator sources',()=>{
 const root=repo(),id=frontendAtApproval(root),sessionId='hidden-source-artifact';recordVisualizationCapability(root,{sessionId,availability:'available',exactSkillName:'visualize'});
 const plan=planFor(root,id,sessionId),artifact=visualArtifact('hidden-source.html',plan);let html=readFileSync(artifact,'utf8');const victim=plan.requiredSourceIds[0];
 html=html.replace(`data-specrail-evidence-id="${victim}"`,`data-specrail-evidence-id="${victim}" hidden`);writeFileSync(artifact,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:artifact})}`,resultText:'Attempted comparator with a hidden canonical source.',artifactPath:artifact,quality:goodQuality}),/must not be hidden|directly visible/i);
 const clean=visualArtifact('missing-source-marker.html',plan);html=readFileSync(clean,'utf8').replace(' data-specrail-comparator-source="v2"','');writeFileSync(clean,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:clean})}`,resultText:'Attempted comparator without the canonical comparator-source marker.',artifactPath:clean,quality:goodQuality}),/data-specrail-comparator-source/i);
 const styled=visualArtifact('zero-opacity-source.html',plan);html=readFileSync(styled,'utf8').replace(`data-specrail-evidence-id="${victim}"`,`data-specrail-evidence-id="${victim}" style="opacity: 0.0 !important" aria-hidden="TRUE"`);writeFileSync(styled,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:styled})}`,resultText:'Attempted comparator with a zero-opacity canonical source.',artifactPath:styled,quality:goodQuality}),/must not be hidden|directly visible/i);
 const wrongCase=visualArtifact('wrong-case-evidence-id.html',plan);html=readFileSync(wrongCase,'utf8').replace(`data-specrail-evidence-id="${victim}"`,`data-specrail-evidence-id="${String(victim).toLowerCase()}"`);writeFileSync(wrongCase,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:wrongCase})}`,resultText:'Attempted comparator with a case-changed canonical evidence ID.',artifactPath:wrongCase,quality:goodQuality}),/missing visible embedded canonical evidence/i);
 const zeroSize=visualArtifact('zero-size-source.html',plan);html=readFileSync(zeroSize,'utf8').replace(`data-specrail-evidence-id="${victim}"`,`data-specrail-evidence-id="${victim}" width="0"`);writeFileSync(zeroSize,html);
 assert.throws(()=>recordVisualizationRun(root,{taskId:id,sessionId,gate:'spec-approval',outcome:'rendered',provider:'$visualize',planDigest:plan.planDigest,sourceDigest:plan.sourceDigest,invocationRef:`visualize${JSON.stringify({path:zeroSize})}`,resultText:'Attempted comparator with a zero-size canonical source.',artifactPath:zeroSize,quality:goodQuality}),/directly visible/i);
});
