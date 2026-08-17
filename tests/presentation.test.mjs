// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius, acknowledgePresentation } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification, returnTask } from '../dist/src/lib/workflow.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';
import { nextAction } from '../dist/src/lib/next.js';
import { recordPresentationAction } from '../dist/src/lib/presentation-state.js';
import { specificationPresentation } from '../dist/src/lib/presentation.js';
import { scopeGuardStatus, setBlastRadius } from '../dist/src/lib/scope-guard.js';
import { proposeAmendment } from '../dist/src/lib/amendments.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-presentation-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');
function prepareFrontendSpec(root) {
    initProject(root, { name: 'Preview' });
    readyProjectContext(root);
    const task = createTask(root, { title: 'Ajustar tamaño del h3 de home spotlight en la homepage', type: 'task', surfaces: ['frontend'] });
    startRefinement(root, task.meta.id);
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.body = setSection(loaded.body, 'Need', 'Reducir el tamaño visual del encabezado H3 del bloque Home Spotlight.');
    loaded.body = setSection(loaded.body, 'Product Value', 'Mejorar la jerarquía visual sin cambiar el contenido.');
    loaded.body = setSection(loaded.body, 'Users', 'Visitantes de la homepage en móvil y escritorio.');
    loaded.body = setSection(loaded.body, 'Scope', '- Ajustar únicamente el H3 de Home Spotlight.\n- Mantener tipografía y contenido.');
    loaded.body = setSection(loaded.body, 'UI Target', '- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000` and `390x844`\n- Capture: focused section');
    loaded.body = setSection(loaded.body, 'Out of Scope', '- Rediseñar el resto de la homepage.');
    loaded.body = setSection(loaded.body, 'Acceptance Criteria', '- El H3 se lee completo en 1440x1000 y 390x844.\n- En ambos viewports no hay overflow horizontal, clipping ni solapes.');
    loaded.meta.route.design = true;
    saveTask(loaded);
    setDefaultBlastRadius(root,task.meta.id);
    completePhase(root, task.meta.id);
    addApprovedImageGenProposal(root, task.meta.id, { target: 'section#home-spotlight', beforeLabel: 'Homepage actual', proposalLabel: 'Propuesta H3' });
    addApprovedImageGenProposal(root, task.meta.id, { target: 'section#home-spotlight', viewport: '390x844', beforeLabel: 'Homepage mobile actual', proposalLabel: 'Propuesta H3 mobile' });
    completePhase(root, task.meta.id);
    return task.meta.id;
}
test('spec approval is capsule-first with full Review Details attached before native input', () => {
    const root = repo(), id = prepareFrontendSpec(root);
    const interaction = interactionForTask(root, id, 'spec-approval', { sessionId: 'chat-spec-review' });
    assert.equal(interaction.tool, 'host_actions');
    assert.equal(interaction.presentation.presentationContract.acknowledgement.approvalReady, false);
    assert.equal(interaction.presentation.requiredBeforeInput, true);
    assert.equal(interaction.presentation.kind, 'specification-review');
    assert.match(interaction.presentation.markdown, /READY FOR SPEC APPROVAL/);
    assert.match(interaction.presentation.markdown, /\*\*Outcome:\*\* Mejorar la jerarquía visual/);
    assert.match(interaction.presentation.markdown, /\*\*Scope:\*\*/);
    assert.match(interaction.presentation.markdown, /\*\*Proof:\*\*/);
    assert.match(interaction.presentation.markdown, /Review Details/i);
    assert.doesNotMatch(interaction.presentation.markdown, /## Acceptance Coverage Matrix/);
    assert.doesNotMatch(interaction.presentation.markdown, /Workflow Log/);
    const bundleAttachment=interaction.presentation.attachments.find(item => item.kind === 'review-bundle');
    assert.ok(bundleAttachment);
    assert.equal(bundleAttachment.display,'attachment');
    const bundleText = readFileSync(bundleAttachment.path, 'utf8').trim();
    assert.equal(interaction.presentation.markdown.includes(bundleText),false,'compact chat presentation must not dump the authoritative Review Bundle inline');
    assert.match(bundleText,/Specification review bundle/);
    assert.match(bundleText,/## Need/);
    assert.match(bundleText,/Reducir el tamaño visual/);
    assert.match(bundleText,/## Acceptance Criteria/);
    assert.match(bundleText,/no hay overflow horizontal/);
    assert.match(bundleText,/## Effective specification/);
    assert.match(bundleText,/## Acceptance Coverage Matrix/);
    assert.match(bundleText,/## Scope Guard \/ Blast Radius/);
    assert.match(bundleText,/## Delivery trace/);
    assert.doesNotMatch(bundleText, /!\[[^\]]*(?:Homepage actual|Propuesta H3)[^\]]*\]\(/, 'Review Bundle must not emit broken repository-local image Markdown');
    assert.match(bundleText, /### Review Surface — active canonical visuals/);
    assert.match(bundleText, /REQUIRED VISIBLE/);
    assert.match(bundleText, /Audit metadata \(not presentation\)/);
    assert.match(bundleText, /\*\*Before · \/ · section#home-spotlight · 1440x1000 · focused-section\*\*/);
    assert.match(bundleText, /\*\*Proposal · \/ · section#home-spotlight · 1440x1000 · focused-section\*\*/);
    assert.match(bundleText, /\*\*Before · \/ · section#home-spotlight · 390x844 · focused-section\*\*/);
    assert.match(bundleText, /\*\*Proposal · \/ · section#home-spotlight · 390x844 · focused-section\*\*/);
    assert.equal(interaction.presentation.previewUrl, 'http://127.0.0.1:4173/');
    assert.equal(interaction.presentation.attachments.length, 10);
    assert.ok(interaction.presentation.attachments.every(item => path.isAbsolute(item.path)));
    assert.deepEqual(interaction.presentation.attachments.map(x => x.kind), ['review-cockpit', 'review-bundle', 'frontend-before', 'frontend-before', 'frontend-proposal', 'frontend-proposal', 'ui-design-brief', 'ui-proposal-review', 'ui-design-brief', 'ui-proposal-review']);
    assert.ok(interaction.presentation.attachments.filter(item=>item.kind==='frontend-proposal').every(item=>item.label.includes('/ · section#home-spotlight')&&item.label.includes('focused-section')));
    assert.deepEqual(interaction.presentation.presentationContract.evidence.requiredAttachmentIds, interaction.presentation.attachments.filter(item=>item.requiredVisible).map(item=>item.id));
    assert.equal(interaction.presentation.presentationContract.evidence.localPathsAreAuditOnly,true);
    assert.equal(interaction.presentation.presentationContract.visualize.hostPresentation,'unverified');
    assert.equal(interaction.presentation.presentationContract.visualize.hostPresentationVerified,false);
    assert.equal(interaction.presentation.presentationContract.visualize.fallbackRequired,true);
    assert.equal(interaction.presentation.presentationContract.evidence.requiredSurface,'conversation');
    assert.equal(interaction.presentation.presentationContract.evidence.onUnavailable,'block-approval');
    assert.equal(interaction.presentation.presentationContract.cockpit.openActionRequired,true);
    assert.match(interaction.presentation.presentationContract.cockpit.openUrl,/^file:\/\//);
    assert.equal(interaction.presentation.attachments[0].openUrl,interaction.presentation.presentationContract.cockpit.openUrl);
    assert.equal(interaction.presentation.presentationContract.fallback.mode,'inline-evidence-and-cockpit-open-action');
    const hostActions=interaction.presentation.presentationContract.fallback.requiredHostActions;
    const imageActions=hostActions.filter(item=>item.type==='present-image');
    assert.deepEqual(imageActions.map(item=>item.attachmentId),interaction.presentation.presentationContract.evidence.requiredAttachmentIds);
    assert.ok(imageActions.every(item=>item.surface==='conversation'));
    const cockpitAction=hostActions.find(item=>item.type==='open-url');
    assert.equal(cockpitAction.attachmentId,'REVIEW-COCKPIT');assert.equal(cockpitAction.label,'Abrir Review Cockpit');assert.equal(cockpitAction.url,interaction.presentation.presentationContract.cockpit.openUrl);
    const acknowledged=acknowledgePresentation(root,id,'spec-approval','chat-spec-review');assert.equal(acknowledged.approvalReady,true);
    const ready=interactionForTask(root,id,'spec-approval',{sessionId:'chat-spec-review'});assert.equal(ready.tool,'request_user_input');assert.match(ready.questions[0].question,/mostrada arriba/i);
});

test('final approval is capsule-first and keeps complete final Review Details attached', () => {
    const root = repo(), id = prepareFrontendSpec(root);
    let task = loadTask(findTask(root, id));
    task.body = setSection(task.body, 'QA', '- QA executed the approved public mission and recorded the observed result.');
    task.body = setSection(task.body, 'Final Customer', '- Final customer validated the user-visible outcome.');
    task.body = setSection(task.body, 'Handoff', 'Implementation and evidence are ready for delivery review.');
    task.meta.status = 'awaiting_final_approval';
    task.meta.phase = 'final-approval';
    task.meta.waiting_for = 'user';
    saveTask(task);
    const interaction = interactionForTask(root, id, 'final-approval', { sessionId: 'chat-final-review' });
    const bundle = interaction.presentation.attachments.find(item => item.kind === 'review-bundle');
    const bundleText = readFileSync(bundle.path, 'utf8').trim();
    assert.match(interaction.presentation.markdown,/READY FOR FINAL APPROVAL/);
    assert.match(interaction.presentation.markdown,/Review Details/i);
    assert.equal(interaction.presentation.markdown.includes(bundleText),false);
    assert.match(bundleText, /Final review bundle/);
    assert.match(bundleText, /## Delivery diff summary/);
    assert.match(bundleText, /## QA/);
    assert.match(bundleText, /## Final Customer/);
    assert.equal(interaction.presentation.visualization.skillInvocation, '$visualize');
});

test('next action requires host presentation acknowledgement before the native approval question', () => {
    const root = repo(), id = prepareFrontendSpec(root), sessionId='chat-next-review';
    const first = nextAction(root, id, {sessionId});
    assert.equal(first.action, 'present-review');assert.equal(first.actor,'host');assert.equal(first.userInputRequired,false);assert.equal(first.interaction.tool,'host_actions');
    assert.equal(first.interaction.presentation.requiredBeforeInput, true);
    assert.match(first.interaction.presentation.markdown, /\*\*Scope:\*\*/);
    assert.match(first.interaction.presentation.markdown, /Review Details/i);
    assert.equal(first.interaction.presentation.attachments.length, 10);
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    const ready=nextAction(root,id,{sessionId});assert.equal(ready.action,'approve-or-refine-specification');assert.equal(ready.userInputRequired,true);assert.equal(ready.interaction.tool,'request_user_input');
});
test('orchestrator contract requires the exact SpecRail gate, compact capsule, full Review Details, evidence, and Visualize before asking', () => {
    const skill = readFileSync(path.join(process.cwd(), 'skills/ai-flow/SKILL.md'), 'utf8');
    assert.match(skill, /never construct or paraphrase your own `request_user_input`/i);
    assert.match(skill, /exact `next\.interaction` \/ `interaction` returned by SpecRail/i);
    assert.match(skill, /complete `interaction\.presentation\.markdown`/i);
    assert.match(skill, /complete authoritative Review Bundle/i);
    assert.match(skill, /available on demand|Review Details/i);
    assert.match(skill, /Every `present-image` action must surface.*inside the conversation/i);
    assert.match(skill, /opening a file picker, printing a path.*does not count/i);
    assert.match(skill, /artifactPrepared.*referencePrepared.*not proof of display/i);
    assert.match(skill, /Do not ask for approval/i);
});
test('approval prompts explicitly refer to the preview already shown above', () => {
    const root = repo(), id = prepareFrontendSpec(root), sessionId='chat-prompt-review';
    assert.equal(interactionForTask(root,id,'spec-approval',{sessionId}).tool,'host_actions');
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    const interaction = interactionForTask(root, id, 'spec-approval', {sessionId});
    assert.equal(interaction.tool,'request_user_input');assert.match(interaction.questions[0].question, /mostrada arriba/i);
    assert.equal(interaction.presentation.attachments[0].display, 'inline');
    assert.equal(interaction.presentation.attachments[0].mediaType, 'text/html');
    assert.equal(interaction.presentation.attachments[1].mediaType, 'text/markdown');
    assert.match(interaction.presentation.attachments[2].mediaType, /^image\//);
    assert.match(interaction.presentation.attachments[3].mediaType, /^image\//);
    assert.match(interaction.presentation.attachments[4].mediaType, /^image\//);
    assert.match(interaction.presentation.attachments[5].mediaType, /^image\//);
    for (const index of [2,3,4,5]) { assert.equal(interaction.presentation.attachments[index].display, 'inline'); assert.equal(interaction.presentation.attachments[index].requiredVisible, true); }
    assert.match(interaction.presentation.attachments[2].label, /^Before · \/ · section#home-spotlight · 1440x1000 · focused-section$/);
    assert.match(interaction.presentation.attachments[3].label, /^Before · \/ · section#home-spotlight · 390x844 · focused-section$/);
    assert.match(interaction.presentation.attachments[4].label, /^Proposal · \/ · section#home-spotlight · 1440x1000 · focused-section$/);
    assert.match(interaction.presentation.attachments[5].label, /^Proposal · \/ · section#home-spotlight · 390x844 · focused-section$/);
});
test('managed activation delegates presentation details to the global skill while preserving the approval invariant', () => {
    const managed = readFileSync(path.join(process.cwd(), 'src/lib/managed-installation.ts'), 'utf8');
    assert.match(managed, /follow .*ai-flow\/SKILL\.md/i);
    assert.match(managed, /stable session token/i);
    assert.match(managed, /Generated Cockpit HTML is not proof of display/i);
    assert.match(managed, /never invent request_user_input/i);
    assert.match(managed, /exact SpecRail interaction/i);
    assert.match(managed, /complete Review Bundle/i);
    assert.match(managed, /\$visualize preparation leaves hostPresentation unverified/i);
    assert.match(managed, /Never implement before specification approval/i);
});

test('phase complete returns the newly reached approval gate with compact presentation and stable-session Visualize plan', () => {
    const root = repo();
    initProject(root, { name: 'Phase Gate' });
    readyProjectContext(root);
    const task = createTask(root, { title: 'Backend gate handoff', type: 'task', surfaces: ['backend'] });
    startRefinement(root, task.meta.id);
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.body = setSection(loaded.body, 'Need', 'Expose one observable backend health response for monitoring.');
    loaded.body = setSection(loaded.body, 'Product Value', 'Let operators verify service availability without inspecting internals.');
    loaded.body = setSection(loaded.body, 'Users', 'Operators and automated monitoring clients.');
    loaded.body = setSection(loaded.body, 'Scope', 'Add one read-only health response.');
    loaded.body = setSection(loaded.body, 'Out of Scope', 'No authentication or persistence changes.');
    loaded.body = setSection(loaded.body, 'Acceptance Criteria', '- AC-001: GET /health returns HTTP 200 with JSON status ok.');
    loaded.meta.route.design = false;
    loaded.meta.route.architecture = false;
    loaded.meta.route.database = false;
    saveTask(loaded);
    setDefaultBlastRadius(root, task.meta.id);
    const cli = path.join(process.cwd(), 'dist', 'src', 'cli.js');
    const run = spawnSync(process.execPath, [cli, 'phase', 'complete', task.meta.id, '--root', root, '--session', 'chat-phase-gate'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.phase, 'spec-approval');
    assert.equal(result.next.action, 'approve-or-refine-specification');
    assert.equal(result.next.interaction.tool, 'request_user_input');
    assert.equal(result.next.interaction.presentation.requiredBeforeInput, true);
    assert.match(result.next.interaction.presentation.markdown, /READY FOR SPEC APPROVAL/);
    assert.match(result.next.interaction.presentation.markdown, /\*\*Proof:\*\*/);
    assert.match(result.next.interaction.presentation.markdown, /Review Details/i);
    assert.ok(result.next.interaction.presentation.attachments.some(item=>item.kind==='review-bundle'));
    assert.equal(result.next.interaction.presentation.visualization.skillInvocation, '$visualize');
    assert.equal(result.next.interaction.presentation.visualization.recordRequired, true);
});
//# sourceMappingURL=presentation.test.js.map
test('approval presentation does not attach stale frontend visuals outside the current UI Target',()=>{
    const root=repo(),id=prepareFrontendSpec(root);
    addApprovedImageGenProposal(root,id,{target:'section#historical-target',viewport:'1200x800',beforeLabel:'Historical before',proposalLabel:'Historical proposal'});
    const interaction=interactionForTask(root,id,'spec-approval',{sessionId:'presentation-stale-filter'});
    const frontendVisuals=interaction.presentation.attachments.filter(item=>['frontend-before','frontend-mobile-before','frontend-proposal','frontend-mobile-proposal'].includes(item.kind));
    assert.equal(frontendVisuals.some(item=>item.target==='section#historical-target'),false);
    assert.equal(frontendVisuals.length,4);
    const bundleText=readFileSync(interaction.presentation.attachments.find(item=>item.kind==='review-bundle').path,'utf8');
    const activeSection=bundleText.split('### Review Surface — active canonical visuals')[1]?.split('#### Audit metadata (not presentation)')[0]||'';
    assert.doesNotMatch(activeSection,/historical-target/);
    assert.match(bundleText,/### Historical \/ inactive visual evidence/);
    assert.match(bundleText,/section#historical-target/);
});


test('visual approval is mechanically blocked until the current session acknowledges the exact presentation', () => {
    const root=repo(),id=prepareFrontendSpec(root);
    assert.throws(()=>approveSpecification(root,id,'Bypass attempt'),/presentation acknowledgement|Approval requires --session/i);
    acknowledgePresentation(root,id,'spec-approval','review-session-a');
    assert.throws(()=>approveSpecification(root,id,'Wrong session',{sessionId:'review-session-b'}),/presentation is not ready|presentation acknowledgement/i);
    const approved=approveSpecification(root,id,'Approved after visible review',{sessionId:'review-session-a'});
    assert.equal(approved.meta.spec_approval,'approved');
});

test('presentation acknowledgement is invalidated by changed review content and cannot be reused stale', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='stale-review-session';
    const before=interactionForTask(root,id,'spec-approval',{sessionId});
    const oldDigest=before.presentation.presentationContract.presentationDigest;
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    assert.equal(interactionForTask(root,id,'spec-approval',{sessionId}).tool,'request_user_input');
    const task=loadTask(findTask(root,id));task.body=setSection(task.body,'Scope','- Ajustar únicamente el H3 de Home Spotlight.\n- Mantener tipografía, contenido y espaciado lateral.');saveTask(task);
    const changed=interactionForTask(root,id,'spec-approval',{sessionId});
    assert.equal(changed.tool,'host_actions');assert.notEqual(changed.presentation.presentationContract.presentationDigest,oldDigest);assert.equal(changed.presentation.presentationContract.acknowledgement.approvalReady,false);
});

test('tampering with persisted presentation acknowledgement never grants approval', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='tamper-review-session';
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    const runtimeDir=path.join(root,'.ai','runtime','presentations');const file=path.join(runtimeDir,readdirSync(runtimeDir).find(name=>name.includes(`${id}-spec-approval-`)));
    const stored=JSON.parse(readFileSync(file,'utf8'));stored.recordDigest='forged';writeFileSync(file,JSON.stringify(stored,null,2)+'\n');
    const interaction=interactionForTask(root,id,'spec-approval',{sessionId});assert.equal(interaction.tool,'host_actions');assert.equal(interaction.presentation.presentationContract.acknowledgement.approvalReady,false);
});

test('Cockpit open failure is non-blocking only after every required image is actually presented inline', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='cockpit-fallback-session';
    const interaction=interactionForTask(root,id,'spec-approval',{sessionId});const contract=interaction.presentation.presentationContract;
    let state=contract.acknowledgement;
    for(const action of contract.fallback.requiredHostActions.filter(item=>item.type==='present-image')) state=recordPresentationAction(root,{taskId:id,gate:'spec-approval',sessionId,presentationDigest:contract.presentationDigest,actions:contract.fallback.requiredHostActions,actionId:action.id,outcome:'presented'});
    const cockpit=contract.fallback.requiredHostActions.find(item=>item.type==='open-url');state=recordPresentationAction(root,{taskId:id,gate:'spec-approval',sessionId,presentationDigest:contract.presentationDigest,actions:contract.fallback.requiredHostActions,actionId:cockpit.id,outcome:'unavailable',detail:'Host cannot open or expose local URL actions.'});
    assert.equal(state.approvalReady,true);assert.deepEqual(state.blockingActionIds,[]);assert.ok(state.degradedActionIds.includes(cockpit.id));
    assert.equal(interactionForTask(root,id,'spec-approval',{sessionId}).tool,'request_user_input');
});

test('CLI forwards the stable session to final approval so acknowledged visual gates can complete', () => {
    const cliSource=readFileSync(path.join(process.cwd(),'src','cli.ts'),'utf8');
    assert.match(cliSource,/approveFinal\(root, arg\(2\), flags\.note, \{ sessionId: flags\.session \}\)/);
});

test('CLI presentation acknowledgement is required before a visual amendment can be decided', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='chat-amendment-review';
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    approveSpecification(root,id,'Approve base specification',{sessionId});
    const amendment=proposeAmendment(root,id,{title:'Keep the H3 compact on tablet',reason:'The approved visual rule must also cover the intermediate viewport.',changes:['Apply the approved H3 hierarchy at the tablet breakpoint.'],acceptanceCriteria:['The H3 remains fully visible at the tablet breakpoint.']});
    const cli=path.join(process.cwd(),'dist','src','cli.js');
    const premature=spawnSync(process.execPath,[cli,'amendment','approve',id,amendment.id,'--root',root,'--session',sessionId],{encoding:'utf8'});
    assert.notEqual(premature.status,0);assert.match(`${premature.stderr}${premature.stdout}`,/presentation is not ready|presentation acknowledgement/i);
    const statusRun=spawnSync(process.execPath,[cli,'presentation','status',id,'--root',root,'--gate','spec-approval','--session',sessionId],{encoding:'utf8'});
    assert.equal(statusRun.status,0,statusRun.stderr);const status=JSON.parse(statusRun.stdout);assert.equal(status.acknowledgement.approvalReady,false);assert.ok(status.actions.some(action=>action.type==='present-image'));
    const stale=spawnSync(process.execPath,[cli,'presentation','record',id,'--root',root,'--gate','spec-approval','--session',sessionId,'--presentation-digest','0'.repeat(64),'--action',status.actions[0].id,'--outcome','presented'],{encoding:'utf8'});
    assert.notEqual(stale.status,0);assert.match(`${stale.stderr}${stale.stdout}`,/stale presentation digest/i);
    for(const action of status.actions){
      const args=[cli,'presentation','record',id,'--root',root,'--gate','spec-approval','--session',sessionId,'--presentation-digest',status.presentationDigest,'--action',action.id,'--outcome',action.type==='present-image'?'presented':'offered'];
      const recorded=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(recorded.status,0,recorded.stderr);
    }
    const ready=spawnSync(process.execPath,[cli,'next',id,'--root',root,'--session',sessionId],{encoding:'utf8'});assert.equal(ready.status,0,ready.stderr);const next=JSON.parse(ready.stdout);assert.equal(next.interaction.tool,'request_user_input');assert.match(next.interaction.questions[0].id,/amendment:/);
    const approved=spawnSync(process.execPath,[cli,'amendment','approve',id,amendment.id,'--root',root,'--session',sessionId],{encoding:'utf8'});assert.equal(approved.status,0,approved.stderr);assert.equal(JSON.parse(approved.stdout).status,'approved');
});

test('generic refine/return transitions cannot bypass explicit user approval gates', () => {
    const root=repo();initProject(root,{name:'Gate bypass protection'});readyProjectContext(root);
    const task=createTask(root,{title:'Backend approval gate',type:'task',surfaces:['backend']});startRefinement(root,task.meta.id);
    let loaded=loadTask(findTask(root,task.meta.id));loaded.body=setSection(loaded.body,'Need','Expose a stable health result.');loaded.body=setSection(loaded.body,'Product Value','Let operators confirm availability.');loaded.body=setSection(loaded.body,'Users','Operators.');loaded.body=setSection(loaded.body,'Scope','One read-only health endpoint.');loaded.body=setSection(loaded.body,'Out of Scope','No persistence changes.');loaded.body=setSection(loaded.body,'Acceptance Criteria','- AC-001: GET /health returns 200.');loaded.meta.route.design=false;loaded.meta.route.architecture=false;loaded.meta.route.database=false;saveTask(loaded);setDefaultBlastRadius(root,task.meta.id);completePhase(root,task.meta.id);
    assert.throws(()=>startRefinement(root,task.meta.id),/user decision gate|request-changes/i);
    const atFinal=loadTask(findTask(root,task.meta.id));atFinal.meta.status='awaiting_final_approval';atFinal.meta.phase='final-approval';atFinal.meta.waiting_for='user';saveTask(atFinal);
    assert.throws(()=>returnTask(root,task.meta.id,'builder','bypass'),/user decision gate/i);
});


test('specification presentation normalizes and seals legacy awaiting-review state before computing the acknowledged digest', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='legacy-prep-session';
    let task=loadTask(findTask(root,id));
    task.body=setSection(task.body,'QA Mission','');
    task.body=setSection(task.body,'Quality Strategy','');
    task.body=setSection(task.body,'Operational Evidence','');
    task.meta.spec_integrity_version=1;
    task.meta.project_governance_hash=null;
    task.meta.scope_guard_hash=null;
    task.meta.scope_baseline_commit=null;
    saveTask(task);
    const presented=specificationPresentation(root,id,sessionId);
    task=loadTask(findTask(root,id));
    assert.ok(task.body.includes('## QA Mission\n\n- Persona:'));
    assert.ok(task.body.includes('## Quality Strategy\n\n- Property testing:'));
    assert.equal(task.meta.spec_integrity_version,2);
    assert.ok(task.meta.project_governance_hash);
    assert.ok(task.meta.scope_guard_hash);
    assert.equal(specificationPresentation(root,id,sessionId).presentationContract.presentationDigest,presented.presentationContract.presentationDigest,'re-reading the prepared gate must be digest-stable');
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    assert.equal(approveSpecification(root,id,'Approved exact prepared review',{sessionId}).meta.spec_approval,'approved');
});

test('changing canonical visual bytes after acknowledgement invalidates the presentation before approval', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='visual-byte-freshness';
    const first=interactionForTask(root,id,'spec-approval',{sessionId});
    const firstDigest=first.presentation.presentationContract.presentationDigest;
    const bundle=first.presentation.attachments.find(item=>item.kind==='review-bundle');
    assert.match(String(bundle.sha256||''),/^[a-f0-9]{64}$/,'the exact Review Bundle bytes must participate in presentation freshness');
    acknowledgePresentation(root,id,'spec-approval',sessionId);
    assert.equal(interactionForTask(root,id,'spec-approval',{sessionId}).tool,'request_user_input');
    const visual=first.presentation.attachments.find(item=>item.requiredVisible);
    appendFileSync(visual.path,Buffer.from([9,9,9]));
    const changed=interactionForTask(root,id,'spec-approval',{sessionId});
    assert.equal(changed.tool,'host_actions');
    assert.notEqual(changed.presentation.presentationContract.presentationDigest,firstDigest);
    assert.equal(changed.presentation.presentationContract.acknowledgement.approvalReady,false);
});

test('changing canonical visual bytes after final-review acknowledgement invalidates that final presentation', () => {
    const root=repo(),id=prepareFrontendSpec(root),sessionId='final-byte-freshness';
    let task=loadTask(findTask(root,id));
    task.body=setSection(task.body,'QA','- QA executed the approved public mission.');
    task.body=setSection(task.body,'Final Customer','- Final customer validated the visible outcome.');
    task.body=setSection(task.body,'Handoff','Ready for final review.');
    task.meta.status='awaiting_final_approval';task.meta.phase='final-approval';task.meta.waiting_for='user';saveTask(task);
    const first=interactionForTask(root,id,'final-approval',{sessionId});
    const firstDigest=first.presentation.presentationContract.presentationDigest;
    acknowledgePresentation(root,id,'final-approval',sessionId);
    assert.equal(interactionForTask(root,id,'final-approval',{sessionId}).tool,'request_user_input');
    const visual=first.presentation.attachments.find(item=>item.requiredVisible);
    appendFileSync(visual.path,Buffer.from([7,7,7]));
    const changed=interactionForTask(root,id,'final-approval',{sessionId});
    assert.equal(changed.tool,'host_actions');
    assert.notEqual(changed.presentation.presentationContract.presentationDigest,firstDigest);
    assert.equal(changed.presentation.presentationContract.acknowledgement.approvalReady,false);
});

test('rebuilding specification presentation never moves an already sealed filesystem Scope Guard baseline', () => {
    const root=repo();initProject(root,{name:'Stable scope baseline'});readyProjectContext(root);
    mkdirSync(path.join(root,'src'),{recursive:true});writeFileSync(path.join(root,'src','allowed.ts'),'export const allowed = true;\n');
    const task=createTask(root,{title:'Backend scoped task',type:'task',surfaces:['backend']});startRefinement(root,task.meta.id);
    let loaded=loadTask(findTask(root,task.meta.id));
    loaded.body=setSection(loaded.body,'Need','Expose a scoped backend change.');loaded.body=setSection(loaded.body,'Product Value','Keep the change isolated.');loaded.body=setSection(loaded.body,'Users','Operators.');loaded.body=setSection(loaded.body,'Scope','Only src/allowed.ts.');loaded.body=setSection(loaded.body,'Out of Scope','Any other file.');loaded.body=setSection(loaded.body,'Acceptance Criteria','- AC-001: The allowed change remains isolated.');loaded.meta.route.design=false;loaded.meta.route.architecture=false;loaded.meta.route.database=false;saveTask(loaded);
    setBlastRadius(root,task.meta.id,{allowedFiles:['src/allowed.ts'],protectedFiles:[],expectedSymbols:[],reason:'Only the approved backend file may change.'});completePhase(root,task.meta.id);
    specificationPresentation(root,task.meta.id,'scope-baseline-session');
    writeFileSync(path.join(root,'src','rogue.ts'),'export const rogue = true;\n');
    specificationPresentation(root,task.meta.id,'scope-baseline-session');
    const scope=scopeGuardStatus(root,task.meta.id);
    assert.equal(scope.valid,false);
    assert.deepEqual(scope.unexpectedFiles,['src/rogue.ts']);
});