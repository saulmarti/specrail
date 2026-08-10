// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection, appendLog } from '../dist/src/lib/task.js';
import { lintSpecification, specificationHash } from '../dist/src/lib/specification.js';
import { completePhase, approveSpecification, startExecution } from '../dist/src/lib/workflow.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
import { specificationPresentation } from '../dist/src/lib/presentation.js';
import { writeReviewBundle } from '../dist/src/lib/review.js';
const repo = () => { const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-spec-gov-')); initProject(root); readyProjectContext(root); return root; };
function completeBackendSpec(root, title = 'Create health endpoint') {
    const task = createTask(root, { title, type: 'feature', surfaces: ['backend'], size: 'small', risk: 'low' });
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.meta.status = 'refining';
    loaded.body = setSection(loaded.body, 'Need', 'Expose a health endpoint for deployment checks.');
    loaded.body = setSection(loaded.body, 'Product Value', 'Operators can detect whether the service is available.');
    loaded.body = setSection(loaded.body, 'Users', 'Deployment automation and operators.');
    loaded.body = setSection(loaded.body, 'Scope', 'Add GET /health with a stable JSON response.');
    loaded.body = setSection(loaded.body, 'Out of Scope', 'Dependency health and detailed diagnostics.');
    loaded.body = setSection(loaded.body, 'Acceptance Criteria', '- A GET request to `/health` returns HTTP 200 and `{ "status": "ok" }`.\n- Unsupported methods return HTTP 405 without changing state.');
    loaded.body = setSection(loaded.body, 'Implementation Plan', 'Add a focused route, unit test, and executable request/response evidence.');
    saveTask(loaded);
    setDefaultBlastRadius(root,task.meta.id);
    completePhase(root, task.meta.id);
    return loadTask(findTask(root, task.meta.id));
}
test('specification linter rejects vague non-observable acceptance criteria', () => {
    const root = repo();
    const task = createTask(root, { title: 'Improve homepage', type: 'feature', surfaces: ['frontend'] });
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.body = setSection(loaded.body, 'Need', 'Improve the homepage.');
    loaded.body = setSection(loaded.body, 'Product Value', 'It should be nicer.');
    loaded.body = setSection(loaded.body, 'Users', 'Visitors.');
    loaded.body = setSection(loaded.body, 'Scope', 'Improve the design.');
    loaded.body = setSection(loaded.body, 'Out of Scope', 'None.');
    loaded.body = setSection(loaded.body, 'UI Target', 'Homepage.');
    loaded.body = setSection(loaded.body, 'Acceptance Criteria', '- It should look good.\n- It should work correctly.');
    saveTask(loaded);
    const lint = lintSpecification(loaded, { stage: 'product' });
    assert.equal(lint.valid, false);
    assert.ok(lint.errors.some(x => /observable|vague|UI Target/i.test(x)));
});
test('frontend UI Target requires an exact pixel viewport so visual evidence contexts are deterministic', () => {
    const root = repo();
    const task = createTask(root, { title: 'Responsive hero', type: 'task', surfaces: ['frontend'] });
    let loaded = loadTask(findTask(root, task.meta.id));
    for (const [h, v] of [['Need','Keep the hero readable on affected screens.'],['Product Value','Visitors can understand the primary action.'],['Users','Desktop and mobile visitors.'],['Scope','Only the homepage hero.'],['UI Target','- Route: `/`\n- Target: `#hero`\n- Viewport: desktop and mobile\n- Capture: focused section'],['Out of Scope','All other sections.'],['Acceptance Criteria','- The hero title remains fully visible without horizontal overflow.']]) loaded.body=setSection(loaded.body,h,v);
    saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});
    assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/exact pixel viewport/i.test(error)));
});


test('frontend UI Target rejects ambiguous multi-target ordering instead of pairing a viewport with the previous target', () => {
    const root=repo();const task=createTask(root,{title:'Two targets out of order',type:'task',surfaces:['frontend']});let loaded=loadTask(findTask(root,task.meta.id));
    const uiTarget="- Route: `/`\n- Viewport: `1440x1000`\n- Target: `section#hero`\n- Route: `/`\n- Target: `section#features`\n- Viewport: `390x844`\n- Capture: focused section";
    for(const [h,v] of [['Need','Keep two homepage sections readable at their approved viewports.'],['Product Value','Visitors see the intended hierarchy without ambiguous review evidence.'],['Users','Homepage visitors.'],['Scope','Only hero and features sections.'],['UI Target',uiTarget],['Out of Scope','Other sections.'],['Acceptance Criteria','- The hero and features remain visible at their explicitly approved viewports without horizontal overflow.']])loaded.body=setSection(loaded.body,h,v);saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/viewport.*follow.*Target|must define.*viewport/i.test(error)),lint.errors.join('; '));
});
test('viewport dimensions cannot masquerade as the UI route through an ambiguous Screen/Pantalla label',()=>{
    const root=repo();const task=createTask(root,{title:'Ambiguous target',type:'task',surfaces:['frontend']});let loaded=loadTask(findTask(root,task.meta.id));
    for(const [h,v] of [['Need','Keep the hero readable for mobile visitors.'],['Product Value','Visitors can read the primary action.'],['Users','Mobile visitors.'],['Scope','Only the hero.'],['UI Target','- Pantalla: `390x844`\n- Objetivo: `#hero`\n- Captura: focused section'],['Out of Scope','Other sections.'],['Acceptance Criteria','- The hero remains fully visible at 390x844 without horizontal overflow.']])loaded.body=setSection(loaded.body,h,v);saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/route or screen separately/i.test(error)));
});

test('approval stores a deterministic hash and execution is invalidated when governed specification changes', () => {
    const root = repo();
    let task = completeBackendSpec(root);
    task = approveSpecification(root, task.meta.id, 'Approved');
    const approvedHash = task.meta.spec_approval_hash;
    assert.match(approvedHash, /^[a-f0-9]{64}$/);
    assert.equal(approvedHash, specificationHash(task));
    task.body = setSection(task.body, 'Scope', 'Add GET /health and expose dependency details.');
    saveTask(task);
    assert.throws(() => startExecution(root, task.meta.id, { sessionId: 'chat-a' }), /changed after approval/i);
    const invalidated = loadTask(findTask(root, task.meta.id));
    assert.equal(invalidated.meta.status, 'awaiting_spec_approval');
    assert.equal(invalidated.meta.spec_approval, 'changes_requested');
    assert.equal(invalidated.meta.spec_approval_hash, null);
});
test('workflow log changes do not invalidate an approved specification', () => {
    const root = repo();
    let task = approveSpecification(root, completeBackendSpec(root).meta.id);
    const hash = task.meta.spec_approval_hash;
    appendLog(task, 'A non-specification diagnostic entry.');
    saveTask(task);
    task = loadTask(findTask(root, task.meta.id));
    assert.equal(specificationHash(task), hash);
});
test('specification presentation creates a compact review bundle and attaches it before approval', () => {
    const root = repo();
    const task = completeBackendSpec(root);
    const presentation = specificationPresentation(root, task.meta.id);
    const bundle = presentation.attachments.find(x => x.kind === 'review-bundle');
    assert.ok(bundle);
    assert.match(presentation.markdown, /Specification lint|Validación de especificación/i);
    assert.match(readFileSync(bundle.path, 'utf8'), /Create health endpoint/);
    assert.match(bundle.path, /\.ai\/reviews\/TASK-0001-spec-review\.md$/);
});
test('final review bundle consolidates user-facing evidence and independent verdicts', () => {
    const root = repo();
    let task = completeBackendSpec(root, 'Deliver observable health route');
    task.body = setSection(task.body, 'QA', '- Real GET /health returned HTTP 200.\n- Negative method test returned HTTP 405.');
    task.body = setSection(task.body, 'Final Customer', '- Mission completed through the public endpoint.\n- Value verdict: useful for operations.');
    task.body = setSection(task.body, 'Handoff', 'Implementation, tests, and executable evidence are ready for final review.');
    saveTask(task);
    const bundle = writeReviewBundle(root, task.meta.id, 'final');
    const text = readFileSync(bundle.path, 'utf8');
    assert.match(text, /Final review bundle/);
    assert.match(text, /Real GET \/health/);
    assert.match(text, /Value verdict/);
    assert.match(text, /Delivery diff summary/);
});
test('a vague criterion remains invalid even when it contains an arbitrary number', () => {
    const root = repo();
    const task = createTask(root, { title: 'Vague numbered UI', type: 'feature', surfaces: ['frontend'] });
    let loaded = loadTask(findTask(root, task.meta.id));
    for (const [h, v] of [['Need', 'Improve the homepage hierarchy.'], ['Product Value', 'Help visitors understand the page.'], ['Users', 'Visitors.'], ['Scope', 'Adjust the hero.'], ['UI Target', '- Route: `/`\n- Target: `#hero`\n- Viewport: `390x844`\n- Capture: focused section'], ['Out of Scope', 'Other sections.'], ['Acceptance Criteria', '- It should look better on 3 screens.']])
        loaded.body = setSection(loaded.body, h, v);
    saveTask(loaded);
    const lint = lintSpecification(loaded, { stage: 'approval' });
    assert.equal(lint.valid, false);
    assert.ok(lint.errors.some(x => /vague|observable/i.test(x)));
});
//# sourceMappingURL=spec-governance.test.js.map
test('frontend UI Target rejects a dangling Route instead of silently dropping an incomplete context',()=>{
    const root=repo();const task=createTask(root,{title:'Dangling route',type:'task',surfaces:['frontend']});let loaded=loadTask(findTask(root,task.meta.id));
    for(const [h,v] of [['Need','Keep reviewed sections deterministic.'],['Product Value','Review evidence maps to every declared route.'],['Users','Frontend reviewers.'],['Scope','Only declared visual contexts.'],['UI Target','- Route: `/`\n- Target: `#hero`\n- Viewport: `1440x1000`\n- Capture: focused section\n- Route: `/settings`'],['Out of Scope','Other routes.'],['Acceptance Criteria','- The hero remains visible at the declared viewport without horizontal overflow.']])loaded.body=setSection(loaded.body,h,v);saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/\/settings.*Target\/Objetivo/i.test(error)),lint.errors.join('; '));
});

test('frontend UI Target requires an explicit focused capture scope for every complete visual context',()=>{
    const root=repo();const task=createTask(root,{title:'Missing capture',type:'task',surfaces:['frontend']});let loaded=loadTask(findTask(root,task.meta.id));
    for(const [h,v] of [['Need','Keep hero review deterministic.'],['Product Value','Reviewers compare the same crop.'],['Users','Frontend reviewers.'],['Scope','Only the hero.'],['UI Target','- Route: `/`\n- Target: `#hero`\n- Viewport: `1440x1000`'],['Out of Scope','Other sections.'],['Acceptance Criteria','- The hero remains visible at 1440x1000 without horizontal overflow.']])loaded.body=setSection(loaded.body,h,v);saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/capture/i.test(error)),lint.errors.join('; '));
});

test('frontend UI Target rejects conflicting capture scopes inside the same visual context',()=>{
    const root=repo();const task=createTask(root,{title:'Conflicting capture',type:'task',surfaces:['frontend']});let loaded=loadTask(findTask(root,task.meta.id));
    for(const [h,v] of [['Need','Keep the hero comparison deterministic.'],['Product Value','Reviewers must see one unambiguous crop contract.'],['Users','Frontend reviewers.'],['Scope','Only the hero.'],['UI Target','- Route: `/`\n- Target: `#hero`\n- Viewport: `1440x1000`\n- Capture: focused section\n- Capture: focused element'],['Out of Scope','Other sections.'],['Acceptance Criteria','- The hero remains visible at 1440x1000 without horizontal overflow.']])loaded.body=setSection(loaded.body,h,v);saveTask(loaded);
    const lint=lintSpecification(loaded,{stage:'product'});assert.equal(lint.valid,false);assert.ok(lint.errors.some(error=>/conflicting.*capture/i.test(error)),lint.errors.join('; '));
});

test('approved tasks are invalidated when Autonomy or Product Intelligence governance is downgraded', async () => {
    const { setAutonomyPolicy } = await import('../dist/src/lib/autonomy-policy.js');
    const { setProductIntelligenceEnabled } = await import('../dist/src/lib/product-intelligence.js');

    const autonomyRoot = repo();
    let autonomyTask = approveSpecification(autonomyRoot, completeBackendSpec(autonomyRoot, 'Governed autonomy').meta.id);
    setAutonomyPolicy(autonomyRoot, 'autonomous');
    assert.throws(() => startExecution(autonomyRoot, autonomyTask.meta.id, { sessionId: 'autonomy-session' }), /Project governance context changed/i);

    const productRoot = repo();
    let productTask = approveSpecification(productRoot, completeBackendSpec(productRoot, 'Governed product intelligence').meta.id);
    setProductIntelligenceEnabled(productRoot, true);
    assert.throws(() => startExecution(productRoot, productTask.meta.id, { sessionId: 'product-session' }), /Project governance context changed/i);
});
