// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { addEvidence, validateEvidence } from '../dist/src/lib/evidence.js';
import { startRefinement, completePhase, approveSpecification, startExecution } from '../dist/src/lib/workflow.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-real-'));
function readySpec(root, id) { const task = loadTask(findTask(root, id)); for (const [h, v] of Object.entries({ Need: 'Improve the real homepage hero.', 'Product Value': 'Help visitors understand the primary action.', Scope: 'Homepage hero and its responsive states.', 'UI Target': '- Route: `/`\n- Target: `section#homepage-hero`\n- Capture: focused section', 'Out of Scope': 'Navigation and backend.', 'Acceptance Criteria': '- Approved visual proposal is implemented\n- At 1440x1000 and 390x844 the hero has no horizontal overflow, clipped text, or overlapping controls' }))
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
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-before', path: real, source: 'design-proposal', label: 'Wrong source', route: '/', viewport: '1440x1000', target: 'section#homepage-hero', captureScope: 'focused-section' }), /source must be/i);
    const response = file(root, task.meta.id, 'backend', 'response.txt', 'HTTP/1.1 200 OK');
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'backend-demo', path: response, source: 'executed-command', label: 'Response', command: 'curl /health' }), /numeric exit code/i);
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
    approveSpecification(root, task.meta.id);
    startExecution(root, task.meta.id);
    completePhase(root, task.meta.id);
    const review = file(root, task.meta.id, 'review', 'report.md', '# Technical Review\n\nNo blocking findings.');
    addEvidence(root, task.meta.id, { kind: 'technical-review-report', path: review, source: 'technical-review', label: 'Review', tool: 'Codex' });
    completePhase(root, task.meta.id);
    const after = file(root, task.meta.id, 'frontend', 'after.png', png(3)), qa = file(root, task.meta.id, 'qa', 'report.md', '# QA\n\nAll acceptance criteria passed in the running application.');
    addEvidence(root, task.meta.id, { kind: 'frontend-after', path: after, source: 'browser-capture', label: 'After', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#homepage-hero', captureScope: 'focused-section' });
    const afterAudit = file(root, task.meta.id, 'frontend', 'after-layout.json', JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-after', route: '/', target: 'section#homepage-hero', viewport: { width: 1440, height: 1000 }, capture: { scope: 'focused-section', targetFound: true, targetVisible: true, targetCoverage: 0.7 }, checks: { horizontalOverflow: false, textClipping: false, overlappingElements: false, unreadableText: false }, measurements: [{ selector: 'section#homepage-hero', clientWidth: 800, scrollWidth: 800, clientHeight: 400, scrollHeight: 400 }] }));
    addEvidence(root, task.meta.id, { kind: 'ui-after-validation', path: afterAudit, source: 'browser-layout-validation', label: 'After audit', tool: 'Chrome DevTools' });
    addEvidence(root, task.meta.id, { kind: 'qa-report', path: qa, source: 'qa-validation', label: 'QA', tool: 'Codex browser' });
    completePhase(root, task.meta.id);
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.phase, 'final-customer');
    assert.equal(validateEvidence(root, task.meta.id, 'final').valid, false);
    const customer = file(root, task.meta.id, 'customer', 'report.md', '# Final Customer\n\nMission completed. The primary action was clear and useful.');
    addEvidence(root, task.meta.id, { kind: 'customer-report', path: customer, source: 'customer-validation', label: 'Customer verdict', tool: 'Codex browser' });
    completePhase(root, task.meta.id);
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.status, 'awaiting_final_approval');
    assert.equal(validateEvidence(root, task.meta.id, 'final').valid, true);
});
//# sourceMappingURL=evidence-reality.test.js.map