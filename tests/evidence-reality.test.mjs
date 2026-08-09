// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius, enterCurrentPhaseBoundary, acknowledgePresentation } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { addEvidence, validateEvidence, expectedVisualContexts, visualEvidenceDigest } from '../dist/src/lib/evidence.js';
import { startRefinement, completePhase, approveSpecification, startExecution } from '../dist/src/lib/workflow.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-real-'));
function readySpec(root, id) { const task = loadTask(findTask(root, id)); for (const [h, v] of Object.entries({ Need: 'Improve the real homepage hero.', 'Product Value': 'Help visitors understand the primary action.', Scope: 'Homepage hero and its responsive states.', 'UI Target': '- Route: `/`\n- Target: `section#homepage-hero`\n- Viewport: `1440x1000`\n- Capture: focused section', 'Out of Scope': 'Navigation and backend.', 'Acceptance Criteria': '- Approved visual proposal is implemented\n- At 1440x1000 the hero has no horizontal overflow, clipped text, or overlapping controls' }))
    task.body = setSection(task.body, h, v); saveTask(task); setDefaultBlastRadius(root, id); }
function file(root, id, folder, name, content) { const dir = path.join(root, '.ai/evidence', id, folder); mkdirSync(dir, { recursive: true }); const target = path.join(dir, name); writeFileSync(target, content); return target; }
const png = (marker) => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64'), Buffer.from([marker])]);
test('fake visual evidence and misleading metadata are rejected', () => {
    const root = repo();
    initProject(root, { name: 'Evidence' });
    const task = createTask(root, { title: 'Hero', type: 'feature', surfaces: ['frontend'] });
    const fake = file(root, task.meta.id, 'frontend', 'fake.png', 'not a png');
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-before', path: fake, source: 'running-application', label: 'Fake', route: '/', viewport: '1440x1000' }), /PNG signature/i);
    const real = file(root, task.meta.id, 'frontend', 'before.png', png(1));
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-before', path: real, source: 'design-proposal', label: 'Wrong source', route: '/', viewport: '1440x1000', target: 'section#homepage-hero', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' }), /source must be/i);
    const response = file(root, task.meta.id, 'backend', 'response.txt', 'HTTP/1.1 200 OK');
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'backend-demo', path: response, source: 'executed-command', label: 'Response', command: 'curl /health' }), /numeric exit code/i);
});

test('evidence registration rejects symlink files that escape the task evidence root', () => {
    const root=repo();initProject(root,{name:'Evidence symlink containment'});const task=createTask(root,{title:'Contain evidence',surfaces:['backend']});
    const outside=path.join(root,'outside.txt');writeFileSync(outside,'external evidence');
    const dir=path.join(root,'.ai','evidence',task.meta.id,'backend');mkdirSync(dir,{recursive:true});const link=path.join(dir,'linked.txt');symlinkSync(outside,link);
    assert.throws(()=>addEvidence(root,task.meta.id,{kind:'backend-demo',path:link,source:'executed-command',label:'Linked evidence',tool:'curl',command:'curl /health',exitCode:0}),/symbolic links|real path must stay/i);
});

test('UI Target context parsing distinguishes Spanish Pantalla viewport dimensions from the route',()=>{
    const root=repo();initProject(root,{name:'Spanish target parsing'});const task=createTask(root,{title:'Hero mobile',surfaces:['frontend']});let t=loadTask(findTask(root,task.meta.id));
    t.body=setSection(t.body,'UI Target','- Ruta: `/inicio`\n- Objetivo: `section#hero`\n- Pantalla: `390x844`\n- Captura: focused section');saveTask(t);
    assert.deepEqual(expectedVisualContexts(t),[{route:'/inicio',target:'section#hero',viewport:'390x844',captureScope:'focused-section'}]);
});


test('Spanish Pantalla can still name a screen when it is not a viewport dimension',()=>{
    const root=repo();initProject(root,{name:'Spanish screen name'});const task=createTask(root,{title:'Named screen',surfaces:['frontend']});let t=loadTask(findTask(root,task.meta.id));
    t.body=setSection(t.body,'UI Target','- Pantalla: `Inicio`\n- Objetivo: `section#hero`\n- Viewport: `390x844`\n- Captura: focused section');saveTask(t);
    assert.deepEqual(expectedVisualContexts(t),[{route:'Inicio',target:'section#hero',viewport:'390x844',captureScope:'focused-section'}]);
});
test('every exact viewport declared by UI Target requires its own canonical Before and Proposal', () => {
    const root=repo();initProject(root,{name:'Viewport completeness'});readyProjectContext(root);
    const task=createTask(root,{title:'Refine hero on desktop and mobile',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    let t=loadTask(findTask(root,task.meta.id));t.body=setSection(t.body,'UI Target','- Route: `/`\n- Target: `section#hero`\n- Viewport: `1440x1000` and `390x844`\n- Capture: focused section');t.meta.route.design=true;saveTask(t);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#hero',viewport:'1440x1000'});
    const missing=validateEvidence(root,task.meta.id,'pre-approval');assert.equal(missing.valid,false);assert.match(missing.errors.join('; '),/390x844.*missing canonical Before/i);assert.match(missing.errors.join('; '),/390x844.*missing canonical Proposal/i);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#hero',viewport:'390x844',beforeLabel:'Mobile before',proposalLabel:'Mobile proposal'});
    const complete=validateEvidence(root,task.meta.id,'pre-approval');assert.equal(complete.valid,true,complete.errors.join('; '));
});

test('visual evidence matching uses exact route + target + viewport when one page has multiple reviewed targets', () => {
    const root=repo();initProject(root,{name:'Multi-target visuals'});readyProjectContext(root);
    const task=createTask(root,{title:'Refine two homepage sections',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    let t=loadTask(findTask(root,task.meta.id));t.body=setSection(t.body,'UI Target','- Route: `/`\n- Target: `section#hero`\n- Viewport: `1440x1000`\n- Capture: focused section\n- Route: `/`\n- Target: `section#features`\n- Viewport: `1440x1000`\n- Capture: focused section');t.meta.route.design=true;saveTask(t);
    const first=addApprovedImageGenProposal(root,task.meta.id,{target:'section#hero',viewport:'1440x1000'});
    const secondBefore=file(root,task.meta.id,'frontend','before-features.png',png(11));
    const secondProposal=file(root,task.meta.id,'frontend','proposal-features.png',png(12));
    addEvidence(root,task.meta.id,{kind:'frontend-before',path:secondBefore,source:'browser-capture',label:'Features before',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#features',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
    const firstBrief=JSON.parse(readFileSync(first.brief,'utf8'));firstBrief.context={...firstBrief.context,target:'section#features'};
    const secondBrief=file(root,task.meta.id,'frontend','ui-design-brief-features.json',JSON.stringify(firstBrief));
    addEvidence(root,task.meta.id,{kind:'ui-design-brief',path:secondBrief,source:'ui-design-brief',label:'Features design brief',tool:'Codex'});
    addEvidence(root,task.meta.id,{kind:'frontend-proposal',path:secondProposal,source:'image-gen-proposal',label:'Features proposal',tool:'ChatGPT Image Gen',route:'/',viewport:'1440x1000',target:'section#features',captureScope:'focused-section'});
    const secondReview=file(root,task.meta.id,'frontend','ui-proposal-review-features.json',JSON.stringify({schemaVersion:1,screenshotKind:'frontend-proposal',route:'/',target:'section#features',viewport:'1440x1000',checks:{targetMatch:true,scopePreserved:true,noVisibleOverflow:true,noTextClipping:true,noOverlappingElements:true,readableText:true,designSystemConsistency:true},tasteSkillApplied:true,verdict:'pass'}));
    addEvidence(root,task.meta.id,{kind:'ui-proposal-review',path:secondReview,source:'visual-proposal-review',label:'Features proposal review',tool:'Taste Skill + Codex vision'});
    const pre=validateEvidence(root,task.meta.id,'pre-approval');assert.equal(pre.valid,true,pre.errors.join('; '));
    const secondAfter=file(root,task.meta.id,'frontend','after-features.png',png(13));
    addEvidence(root,task.meta.id,{kind:'frontend-after',path:secondAfter,source:'browser-capture',label:'Features after',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#features',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4174/'});
    const secondAudit=file(root,task.meta.id,'frontend','after-layout-features.json',JSON.stringify({schemaVersion:1,screenshotKind:'frontend-after',route:'/',target:'section#features',viewport:{width:1440,height:1000},capture:{scope:'focused-section',targetFound:true,targetVisible:true,targetCoverage:0.7},checks:{horizontalOverflow:false,textClipping:false,overlappingElements:false,unreadableText:false},measurements:[{selector:'section#features',clientWidth:800,scrollWidth:800,clientHeight:400,scrollHeight:400}]}));
    addEvidence(root,task.meta.id,{kind:'ui-after-validation',path:secondAudit,source:'browser-layout-validation',label:'Features after audit',tool:'Chrome DevTools'});
    const all=validateEvidence(root,task.meta.id,'all');assert.equal(all.errors.some(error=>/after target must match|no matching before\/proposal.*route and viewport/i.test(error)),false,all.errors.join('; '));
});


test('visual context identity is exact and does not merge case-distinct routes or selectors', () => {
    const root=repo();initProject(root,{name:'Exact visual identity'});readyProjectContext(root);
    const task=createTask(root,{title:'Exact hero target',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    let t=loadTask(findTask(root,task.meta.id));t.meta.route.design=true;saveTask(t);
    addApprovedImageGenProposal(root,task.meta.id,{route:'/',target:'section#Homepage-Hero',viewport:'1440x1000'});
    const result=validateEvidence(root,task.meta.id,'pre-approval');assert.equal(result.valid,false);assert.match(result.errors.join('; '),/section#homepage-hero.*missing canonical Before|no matching focused before/i);
});

test('visual evaluator digest ignores historical frontend contexts outside the current UI Target', () => {
    const root=repo();initProject(root,{name:'Current visual digest'});readyProjectContext(root);
    const task=createTask(root,{title:'Current hero proposal',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const current=visualEvidenceDigest(root,task.meta.id,'proposal');
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#old-hero',viewport:'1200x800',beforeLabel:'Historical before',proposalLabel:'Historical proposal'});
    assert.equal(visualEvidenceDigest(root,task.meta.id,'proposal'),current);
});

test('visual evaluator digest ignores superseded frontend visuals inside the same exact review context', () => {
    const root=repo();initProject(root,{name:'Canonical same-context digest'});readyProjectContext(root);
    const task=createTask(root,{title:'Current hero proposal',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    const oldBefore=file(root,task.meta.id,'frontend','historical-before.png',png(21));
    const oldProposal=file(root,task.meta.id,'frontend','historical-proposal.png',png(22));
    addEvidence(root,task.meta.id,{kind:'frontend-before',path:oldBefore,source:'browser-capture',label:'Superseded before',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#homepage-hero',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
    addEvidence(root,task.meta.id,{kind:'frontend-proposal',path:oldProposal,source:'image-gen-proposal',label:'Superseded proposal',tool:'ChatGPT Image Gen',route:'/',viewport:'1440x1000',target:'section#homepage-hero',captureScope:'focused-section'});
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const manifestPath=path.join(root,'.ai','evidence',task.meta.id,'evidence.json');
    const withHistory=visualEvidenceDigest(root,task.meta.id,'proposal');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    manifest.evidence=manifest.evidence.filter(item=>!['Superseded before','Superseded proposal'].includes(item.label));
    writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const withoutHistory=visualEvidenceDigest(root,task.meta.id,'proposal');
    assert.equal(withHistory,withoutHistory);
});


test('a stale proposal review from the same exact context cannot approve a newer proposal', () => {
    const root=repo();initProject(root,{name:'Fresh proposal review'});readyProjectContext(root);
    const task=createTask(root,{title:'Refresh hero proposal',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const replacement=file(root,task.meta.id,'frontend','proposal-new.png',png(31));
    addEvidence(root,task.meta.id,{kind:'frontend-proposal',path:replacement,source:'image-gen-proposal',label:'New proposal',tool:'ChatGPT Image Gen',route:'/',viewport:'1440x1000',target:'section#homepage-hero',captureScope:'focused-section'});
    const result=validateEvidence(root,task.meta.id,'pre-approval');
    assert.equal(result.valid,false);
    assert.match(result.errors.join('; '),/no matching ui-proposal-review registered after this proposal/i);
});

test('a stale layout audit from the same exact context cannot validate a newer After screenshot', () => {
    const root=repo();initProject(root,{name:'Fresh after audit'});readyProjectContext(root);
    const task=createTask(root,{title:'Refresh implemented hero',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const oldAfter=file(root,task.meta.id,'frontend','after-old.png',png(32));
    addEvidence(root,task.meta.id,{kind:'frontend-after',path:oldAfter,source:'browser-capture',label:'Old after',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#homepage-hero',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
    const oldAudit=file(root,task.meta.id,'frontend','after-old-layout.json',JSON.stringify({schemaVersion:1,screenshotKind:'frontend-after',route:'/',target:'section#homepage-hero',viewport:{width:1440,height:1000},capture:{scope:'focused-section',targetFound:true,targetVisible:true,targetCoverage:0.7},checks:{horizontalOverflow:false,textClipping:false,overlappingElements:false,unreadableText:false},measurements:[{selector:'section#homepage-hero',clientWidth:800,scrollWidth:800,clientHeight:400,scrollHeight:400}]}));
    addEvidence(root,task.meta.id,{kind:'ui-after-validation',path:oldAudit,source:'browser-layout-validation',label:'Old after audit',tool:'Chrome DevTools'});
    const replacement=file(root,task.meta.id,'frontend','after-new.png',png(33));
    addEvidence(root,task.meta.id,{kind:'frontend-after',path:replacement,source:'browser-capture',label:'New after',tool:'Codex browser',route:'/',viewport:'1440x1000',target:'section#homepage-hero',captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4174/'});
    const result=validateEvidence(root,task.meta.id,'final');
    assert.match(result.errors.join('; '),/no matching ui-after-validation registered after this After/i);
});

test('visual evaluator digest ignores superseded supporting visual artifacts in the same active context', () => {
    const root=repo();initProject(root,{name:'Canonical supporting digest'});readyProjectContext(root);
    const task=createTask(root,{title:'Canonical visual support',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    const created=addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const briefData=JSON.parse(readFileSync(created.brief,'utf8'));briefData.historicalNote='superseded';
    const oldBrief=file(root,task.meta.id,'frontend','ui-design-brief-old.json',JSON.stringify(briefData));
    const oldBriefRecord=addEvidence(root,task.meta.id,{kind:'ui-design-brief',path:oldBrief,source:'ui-design-brief',label:'Superseded design brief',tool:'Codex'});
    const reviewData=JSON.parse(readFileSync(created.review,'utf8'));reviewData.historicalNote='superseded';
    const oldReview=file(root,task.meta.id,'frontend','ui-proposal-review-old.json',JSON.stringify(reviewData));
    const oldReviewRecord=addEvidence(root,task.meta.id,{kind:'ui-proposal-review',path:oldReview,source:'visual-proposal-review',label:'Superseded proposal review',tool:'Taste Skill + Codex vision'});
    const manifestPath=path.join(root,'.ai','evidence',task.meta.id,'evidence.json');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    const oldIds=new Set([oldBriefRecord.id,oldReviewRecord.id]);
    const historical=manifest.evidence.filter(item=>oldIds.has(item.id));
    const current=manifest.evidence.filter(item=>!oldIds.has(item.id));
    const currentBriefIndex=current.findIndex(item=>item.kind==='ui-design-brief');
    current.splice(Math.max(0,currentBriefIndex),0,...historical);
    manifest.evidence=current;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const withHistory=visualEvidenceDigest(root,task.meta.id,'proposal');
    manifest.evidence=manifest.evidence.filter(item=>!oldIds.has(item.id));writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const withoutHistory=visualEvidenceDigest(root,task.meta.id,'proposal');
    assert.equal(withHistory,withoutHistory);
});


test('visual evaluator digest is bound to the current supporting proposal review', async () => {
    const root=repo();initProject(root,{name:'Supporting digest binding'});readyProjectContext(root);
    const task=createTask(root,{title:'Bind visual review',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    const created=addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000'});
    const before=visualEvidenceDigest(root,task.meta.id,'proposal');
    const review=JSON.parse(readFileSync(created.review,'utf8'));review.auditNote='fresh supporting review mutation';writeFileSync(created.review,JSON.stringify(review));
    const manifestPath=path.join(root,'.ai','evidence',task.meta.id,'evidence.json');const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    const reviewRecord=manifest.evidence.find(item=>item.kind==='ui-proposal-review');
    const {createHash}=await import('node:crypto');reviewRecord.sha256=createHash('sha256').update(readFileSync(created.review)).digest('hex');reviewRecord.size=readFileSync(created.review).length;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const after=visualEvidenceDigest(root,task.meta.id,'proposal');
    assert.notEqual(after,before);
});

test('frontend route requires before, proposal, after, QA, customer, learning, and both user approvals', () => {
    const root = repo();
    initProject(root, { name: 'Frontend' });
    readyProjectContext(root);
    const task = createTask(root, { title: 'Homepage redesign', type: 'feature', surfaces: ['frontend'] });
    startRefinement(root, task.meta.id);
    readySpec(root, task.meta.id);
    completePhase(root, task.meta.id);
    addApprovedImageGenProposal(root, task.meta.id, { target: 'section#homepage-hero' });
    completePhase(root, task.meta.id);
    acknowledgePresentation(root,task.meta.id,'spec-approval','frontend-spec-approval');
    approveSpecification(root, task.meta.id, 'Approved by user', {sessionId:'frontend-spec-approval'});
    enterCurrentPhaseBoundary(root, task.meta.id, 'frontend-builder');
    startExecution(root, task.meta.id, { sessionId: 'frontend-builder' });
    completePhase(root, task.meta.id, { sessionId: 'frontend-builder' });
    const review = file(root, task.meta.id, 'review', 'report.md', '# Technical Review\n\nNo blocking findings.');
    addEvidence(root, task.meta.id, { kind: 'technical-review-report', path: review, source: 'technical-review', label: 'Review', tool: 'Codex' });
    enterCurrentPhaseBoundary(root, task.meta.id, 'frontend-reviewer');
    completePhase(root, task.meta.id, { sessionId: 'frontend-reviewer' });
    const after = file(root, task.meta.id, 'frontend', 'after.png', png(3)), qa = file(root, task.meta.id, 'qa', 'report.md', '# QA\n\nAll acceptance criteria passed in the running application.');
    addEvidence(root, task.meta.id, { kind: 'frontend-after', path: after, source: 'browser-capture', label: 'After', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#homepage-hero', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    const afterAudit = file(root, task.meta.id, 'frontend', 'after-layout.json', JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-after', route: '/', target: 'section#homepage-hero', viewport: { width: 1440, height: 1000 }, capture: { scope: 'focused-section', targetFound: true, targetVisible: true, targetCoverage: 0.7 }, checks: { horizontalOverflow: false, textClipping: false, overlappingElements: false, unreadableText: false }, measurements: [{ selector: 'section#homepage-hero', clientWidth: 800, scrollWidth: 800, clientHeight: 400, scrollHeight: 400 }] }));
    addEvidence(root, task.meta.id, { kind: 'ui-after-validation', path: afterAudit, source: 'browser-layout-validation', label: 'After audit', tool: 'Chrome DevTools' });
    addEvidence(root, task.meta.id, { kind: 'qa-report', path: qa, source: 'qa-validation', label: 'QA', tool: 'Codex browser', attributes: { verification: { type: 'mixed' }, automatedVisualQA: { hostBrowser: 'available', surfaceClass: 'host-browser', attempted: true, status: 'passed', surface: 'chatgpt-desktop-@Browser', attemptRef: 'browser-call-pass-1', targetUrl: 'http://127.0.0.1:4173/' } } });
    completePhase(root, task.meta.id, { sessionId: 'frontend-reviewer' });
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.phase, 'final-customer');
    assert.equal(validateEvidence(root, task.meta.id, 'final').valid, false);
    const customer = file(root, task.meta.id, 'customer', 'report.md', '# Final Customer\n\nMission completed. The primary action was clear and useful.');
    addEvidence(root, task.meta.id, { kind: 'customer-report', path: customer, source: 'customer-validation', label: 'Customer verdict', tool: 'Codex browser' });
    completePhase(root, task.meta.id, { sessionId: 'frontend-reviewer' });
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.status, 'awaiting_final_approval');
    assert.equal(validateEvidence(root, task.meta.id, 'final').valid, true);
});
//# sourceMappingURL=evidence-reality.test.js.map
test('browser QA distinguishes human verification from automated host-browser availability', () => {
    const root=repo();initProject(root,{name:'Browser QA contract'});
    const task=createTask(root,{title:'Browser QA',type:'task',surfaces:['frontend']});
    const qa=file(root,task.meta.id,'qa','browser-unavailable.md','# QA\n\nHuman inspection passed, but the host browser could not run.');
    addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',tool:'Codex',attributes:{verification:{type:'mixed'},automatedVisualQA:{hostBrowser:'available',surfaceClass:'host-browser',attempted:true,status:'unavailable',surface:'chatgpt-desktop-@Browser',attemptRef:'browser-call-unavailable-1',targetUrl:'http://127.0.0.1:4173/',reason:'Host Browser failed to connect to the live localhost runtime.'}}});
    const result=validateEvidence(root,task.meta.id,'qa');
    assert.match(result.errors.join('; '),/AUTOMATED_VISUAL_QA_UNAVAILABLE: Host Browser failed/i);
    assert.equal(result.valid,false);
});

test('a shell localhost failure cannot masquerade as host-browser visual QA', () => {
    const root=repo();initProject(root,{name:'Browser surface contract'});
    const task=createTask(root,{title:'Browser surface',type:'task',surfaces:['frontend']});
    const qa=file(root,task.meta.id,'qa','shell-only.md','# QA\n\nTerminal localhost access failed.');
    addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',tool:'Codex',attributes:{verification:{type:'automated'},automatedVisualQA:{hostBrowser:'available',surfaceClass:'host-browser',attempted:true,status:'unavailable',surface:'agent-shell-sandbox',attemptRef:'shell-probe-1',targetUrl:'http://127.0.0.1:4173/',reason:'Sandboxed curl could not access localhost.'}}});
    const result=validateEvidence(root,task.meta.id,'qa');
    assert.match(result.errors.join('; '),/surface cannot be a shell\/terminal transport/i);
});



test('automated Browser PASS cannot be recorded as human-only verification', () => {
    const root=repo();initProject(root,{name:'Browser QA coherence'});
    const task=createTask(root,{title:'Browser QA coherence',type:'task',surfaces:['frontend']});
    const qa=file(root,task.meta.id,'qa','browser-pass-human.md','# QA\n\nBrowser automation passed but the verification type is incorrectly human-only.');
    addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',tool:'Codex',attributes:{verification:{type:'human'},automatedVisualQA:{hostBrowser:'available',surfaceClass:'host-browser',attempted:true,status:'passed',surface:'chatgpt-desktop-@Browser',attemptRef:'browser-call-pass-human',targetUrl:'http://127.0.0.1:4173/'}}});
    const result=validateEvidence(root,task.meta.id,'qa');
    assert.equal(result.valid,false);assert.match(result.errors.join('; '),/verification\.type=human is inconsistent with an attempted automated Browser QA result/i);
});

test('browser QA requires a concrete host-browser class, invocation reference, and served target URL', () => {
    const root=repo();initProject(root,{name:'Browser QA provenance'});
    const task=createTask(root,{title:'Browser QA provenance',type:'task',surfaces:['frontend']});
    const qa=file(root,task.meta.id,'qa','browser-missing-provenance.md','# QA\n\nClaimed Browser pass without a concrete invocation reference or served target.');
    addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',tool:'Codex',attributes:{verification:{type:'automated'},automatedVisualQA:{hostBrowser:'available',surfaceClass:'host-without-browser',attempted:true,status:'passed',surface:'chatgpt-desktop-@Browser',attemptRef:'',targetUrl:'file:///tmp/index.html'}}});
    const result=validateEvidence(root,task.meta.id,'qa'),errors=result.errors.join('; ');
    assert.equal(result.valid,false);assert.match(errors,/surfaceClass must be host-browser/i);assert.match(errors,/attemptRef/i);assert.match(errors,/targetUrl.*HTTP\(S\)/i);
});

test('current Codex host without Browser is recorded separately from a failed Browser attempt and remains blocking', () => {
    const root=repo();initProject(root,{name:'Host Browser unavailable'});
    const task=createTask(root,{title:'CLI browser capability',type:'task',surfaces:['frontend']});
    const qa=file(root,task.meta.id,'qa','host-browser-unavailable.md','# QA\n\nCurrent Codex host surface has no Browser capability.');
    addEvidence(root,task.meta.id,{kind:'qa-report',path:qa,source:'qa-validation',label:'QA',tool:'Codex CLI',attributes:{verification:{type:'human'},automatedVisualQA:{hostBrowser:'unavailable',surfaceClass:'host-without-browser',attempted:false,status:'unavailable',surface:'codex-cli',reason:'Current Codex CLI surface does not expose Browser.'}}});
    const result=validateEvidence(root,task.meta.id,'qa');
    assert.equal(result.valid,false);assert.match(result.errors.join('; '),/AUTOMATED_VISUAL_QA_UNAVAILABLE: Current Codex CLI surface does not expose Browser/i);
    assert.equal(result.errors.some(error=>/attempted host browser surface/i.test(error)),false,result.errors.join('; '));
});

test('declared capture scope is part of the exact visual evidence context', () => {
    const root=repo();initProject(root,{name:'Capture exactness'});readyProjectContext(root);
    const task=createTask(root,{title:'Exact capture scope',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    let t=loadTask(findTask(root,task.meta.id));t.meta.route.design=true;saveTask(t);
    addApprovedImageGenProposal(root,task.meta.id);
    const manifestPath=path.join(root,'.ai','evidence',task.meta.id,'evidence.json');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    const proposal=manifest.evidence.find(item=>item.kind==='frontend-proposal');proposal.captureScope='focused-element';writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const result=validateEvidence(root,task.meta.id,'pre-approval');
    assert.equal(result.valid,false);assert.match(result.errors.join('; '),/focused-section.*missing canonical Proposal|capture scope|matching focused before/i);
});

test('historical visual proposals outside the current UI Target remain audit evidence without poisoning current relational validation', () => {
    const root=repo();initProject(root,{name:'Historical visual audit'});readyProjectContext(root);
    const task=createTask(root,{title:'Move review target',type:'task',surfaces:['frontend'],size:'small',risk:'low'});startRefinement(root,task.meta.id);readySpec(root,task.meta.id);
    let t=loadTask(findTask(root,task.meta.id));t.meta.route.design=true;saveTask(t);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#homepage-hero',viewport:'1440x1000',beforeLabel:'Historical before',proposalLabel:'Historical proposal'});
    t=loadTask(findTask(root,task.meta.id));t.body=setSection(t.body,'UI Target','- Route: `/`\n- Target: `section#current-hero`\n- Viewport: `390x844`\n- Capture: focused section');saveTask(t);
    addApprovedImageGenProposal(root,task.meta.id,{target:'section#current-hero',viewport:'390x844',beforeLabel:'Current before',proposalLabel:'Current proposal'});
    const result=validateEvidence(root,task.meta.id,'pre-approval');
    assert.equal(result.errors.some(error=>/Historical|homepage-hero|no matching focused before|no matching ui-design-brief|no matching ui-proposal-review/i.test(error)),false,result.errors.join('; '));
    assert.equal(result.valid,true,result.errors.join('; '));
});
