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