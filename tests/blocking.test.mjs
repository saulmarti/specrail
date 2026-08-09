// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask } from '../dist/src/lib/task.js';
import { blockTask, resumeTask, returnTask } from '../dist/src/lib/workflow.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';
import { readyProjectContext } from './helpers.mjs';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-block-'));
test('material workflow problems create a native blocker questionnaire and resume the interrupted phase', () => {
    const root = repo();
    initProject(root, { name: 'Blocked' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Feature', surfaces: ['backend'] });
    let task = loadTask(findTask(root, created.meta.id));
    task.meta.status = 'refining';
    task.meta.phase = 'product-specifier';
    saveTask(task);
    blockTask(root, created.meta.id, 'The existing API contract conflicts with the approved schema.');
    const prompt = interactionForTask(root, created.meta.id, 'current');
    assert.equal(prompt.tool, 'request_user_input');
    assert.equal(prompt.questions[0].id, 'workflow-blocker');
    assert.equal(prompt.questions[0].options.length, 3);
    resumeTask(root, created.meta.id);
    assert.equal(loadTask(findTask(root, created.meta.id)).meta.phase, 'product-specifier');
});
test('review and QA can deterministically return work to the correct phase', () => {
    const root = repo();
    initProject(root, { name: 'Return' });
    readyProjectContext(root);
    const created = createTask(root, { title: 'Feature', surfaces: ['backend'] });
    let task = loadTask(findTask(root, created.meta.id));
    task.meta.status = 'qa';
    task.meta.phase = 'qa-engineer';
    task.meta.spec_approval = 'approved';
    saveTask(task);
    returnTask(root, created.meta.id, 'builder', 'Negative request returns the wrong status.');
    task = loadTask(findTask(root, created.meta.id));
    assert.equal(task.meta.phase, 'builder');
    assert.equal(task.meta.status, 'active');
});
//# sourceMappingURL=blocking.test.js.map