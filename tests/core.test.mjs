// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject, loadProjectConfig } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius, enterCurrentPhaseBoundary } from './helpers.mjs';
import { recordTaskLearning } from '../dist/src/lib/learning.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { addQuestion, answerQuestion, listQuestions } from '../dist/src/lib/questions.js';
import { approveSpecification, approveFinal, completePhase, startExecution, startRefinement } from '../dist/src/lib/workflow.js';
import { addEvidence, validateEvidence } from '../dist/src/lib/evidence.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-core-'));
function readySpec(root, id) {
    const task = loadTask(findTask(root, id));
    task.body = setSection(task.body, 'Need', 'Replace the homepage hero while preserving navigation.');
    task.body = setSection(task.body, 'Product Value', 'Improve clarity for first-time visitors.');
    task.body = setSection(task.body, 'Scope', '- Homepage hero only');
    const uiTarget = task.meta.surfaces.includes('frontend')
        ? `- Route: \`/\`
- Target: \`section#homepage-hero\`
- Viewport: \`1440x1000\`
- Capture: focused section`
        : `- Route: \`/\`
- Target: \`section#homepage-hero\`
- Capture: focused section`;
    task.body = setSection(task.body, 'UI Target', uiTarget);
    task.body = setSection(task.body, 'Out of Scope', '- Navigation redesign');
    task.body = setSection(task.body, 'Acceptance Criteria', '- New hero is visible\n- Navigation remains unchanged');
    saveTask(task);
    setDefaultBlastRadius(root, id);
}
test('init creates project-only artifacts and requires CodeGraph MCP', () => {
    const root = repo();
    const config = initProject(root, { name: 'Example' });
    assert.equal(config.codegraph.mode, 'mcp');
    assert.equal(config.codegraph.command, 'codegraph serve --mcp');
    assert.equal(config.codegraph.required, true);
    assert.equal(config.version, 14);
    assert.match(config.codegraph.preflight.missing, /init.*--index/);
    assert.match(config.codegraph.preflight.existing, /sync/);
    assert.match(config.codegraph.preflight.recovery, /index.*--force.*--quiet/);
    assert.ok(existsSync(path.join(root, '.ai/project/product.md')));
    assert.ok(existsSync(path.join(root, '.ai/tasks/inbox')));
    assert.deepEqual(loadProjectConfig(root), config);
});
test('every task requires spec approval before execution', () => {
    const root = repo();
    initProject(root, { name: 'Example' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Change image', type: 'task', surfaces: ['frontend'] });
    assert.throws(() => startExecution(root, created.meta.id), /specification must be approved/i);
    startRefinement(root, created.meta.id);
    readySpec(root, created.meta.id);
    completePhase(root, created.meta.id);
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.status, 'refining');
});
test('questions block phase completion and answering restores refinement', () => {
    const root = repo();
    initProject(root, { name: 'Example' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Favorites', type: 'feature', surfaces: ['frontend', 'backend'] });
    startRefinement(root, created.meta.id);
    readySpec(root, created.meta.id);
    const q = addQuestion(root, created.meta.id, { category: 'product', impact: 'high', text: 'Persist in account?', options: ['Account', 'Local'], recommendation: 'Account' });
    assert.throws(() => completePhase(root, created.meta.id), /open questions/i);
    answerQuestion(root, created.meta.id, q.id, 'Account');
    assert.equal(listQuestions(root, created.meta.id)[0]?.status, 'answered');
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.open_questions, 0);
});
test('frontend proposal evidence must be real, embedded, and distinct', () => {
    const root = repo();
    initProject(root, { name: 'Example' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Homepage redesign', type: 'feature', surfaces: ['frontend'] });
    startRefinement(root, created.meta.id);
    readySpec(root, created.meta.id);
    const task = loadTask(findTask(root, created.meta.id));
    task.meta.route.design = true;
    saveTask(task);
    completePhase(root, created.meta.id);
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.phase, 'ux-ui-designer');
    addApprovedImageGenProposal(root, created.meta.id, { target: 'section#homepage-hero', beforeLabel: 'Homepage before', proposalLabel: 'Homepage proposal' });
    const validation = validateEvidence(root, created.meta.id, 'pre-approval');
    assert.equal(validation.valid, true);
    const markdown = readFileSync(findTask(root, created.meta.id), 'utf8');
    assert.match(markdown, /\[Open canonical visual evidence\]\(\.\.\/\.\.\/evidence\/TASK-0001\/frontend\/before\.png\)/);
    assert.match(markdown, /Homepage proposal/);
    assert.doesNotMatch(markdown, /!\[[^\]]*Homepage (?:before|proposal)[^\]]*\]\(/);
});
test('final approval requires post-implementation evidence', () => {
    const root = repo();
    initProject(root, { name: 'Example' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Backend endpoint', type: 'feature', surfaces: ['backend'] });
    startRefinement(root, created.meta.id);
    readySpec(root, created.meta.id);
    completePhase(root, created.meta.id);
    approveSpecification(root, created.meta.id, 'Approved by user');
    enterCurrentPhaseBoundary(root, created.meta.id, 'builder-test');
    startExecution(root, created.meta.id, { sessionId: 'builder-test' });
    completePhase(root, created.meta.id, { sessionId: 'builder-test' }); // builder -> review
    const reviewDir = path.join(root, '.ai/evidence', created.meta.id, 'review');
    mkdirSync(reviewDir, { recursive: true });
    const review = path.join(reviewDir, 'technical-review.md');
    writeFileSync(review, '# Technical Review\n\nNo blocking findings.\n');
    addEvidence(root, created.meta.id, { kind: 'technical-review-report', path: review, source: 'technical-review', label: 'Technical review', tool: 'Codex' });
    enterCurrentPhaseBoundary(root, created.meta.id, 'reviewer-test');
    completePhase(root, created.meta.id, { sessionId: 'reviewer-test' }); // review -> qa
    assert.throws(() => completePhase(root, created.meta.id, { sessionId: 'reviewer-test' }), /missing required evidence/i);
    const dir = path.join(root, '.ai/evidence', created.meta.id, 'backend');
    mkdirSync(dir, { recursive: true });
    const demo = path.join(dir, 'response.txt');
    writeFileSync(demo, 'HTTP/1.1 201 Created\n{"id":1}\n');
    const tests = path.join(dir, 'tests.txt');
    writeFileSync(tests, 'exit=0\n10 tests passed\n');
    const qa = path.join(dir, 'qa.md');
    writeFileSync(qa, '# QA\n\nAPI flow executed successfully.\n');
    addEvidence(root, created.meta.id, { kind: 'backend-demo', path: demo, source: 'executed-command', label: 'Real API response', command: 'curl ...', exitCode: 0, tool: 'Codex terminal' });
    addEvidence(root, created.meta.id, { kind: 'test-log', path: tests, source: 'executed-command', label: 'Test run', command: 'npm test', exitCode: 0, tool: 'Codex terminal' });
    addEvidence(root, created.meta.id, { kind: 'qa-report', path: qa, source: 'running-application', label: 'QA report', tool: 'Codex', attributes:{proves:['AC-001','AC-002']} });
    completePhase(root, created.meta.id, { sessionId: 'reviewer-test' }); // qa -> final approval
    recordTaskLearning(root, created.meta.id, 'Health endpoint behavior and evidence are now part of the product.');
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.status, 'awaiting_final_approval');
    approveFinal(root, created.meta.id, 'Accepted by user');
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.status, 'done');
});
//# sourceMappingURL=core.test.js.map