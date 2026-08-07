// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, addDependency, createSubtask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startExecution, approveSpecification } from '../dist/src/lib/workflow.js';
import { setDefaultBlastRadius } from './helpers.mjs';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-deps-'));
test('dependencies and unfinished subtasks block execution', () => {
    const root = repo();
    initProject(root, { name: 'Deps' });
    const dependency = createTask(root, { title: 'Schema', type: 'database', surfaces: ['database'] });
    const parent = createTask(root, { title: 'Feature', type: 'feature', surfaces: ['backend'] });
    addDependency(root, parent.meta.id, dependency.meta.id);
    const child = createSubtask(root, parent.meta.id, { title: 'API slice', type: 'task', surfaces: ['backend'], fileScope: ['src/api/**'] });
    let task = loadTask(findTask(root, parent.meta.id));
    task.meta.status = 'awaiting_spec_approval';
    task.meta.phase = 'spec-approval';
    for (const [heading, text] of Object.entries({ Need: 'Deliver the feature after its schema and API slice.', 'Product Value': 'Users receive the complete behavior only after prerequisite work.', Scope: 'Integrate the completed schema and API slice.', 'Out of Scope': 'Unrelated modules.', 'Acceptance Criteria': '- Execution starts only after both dependency tasks are Done.\n- The integrated feature returns its documented backend response.', 'Implementation Plan': 'Wait for dependencies, then integrate and test.' }))
        task.body = setSection(task.body, heading, text);
    saveTask(task);
    setDefaultBlastRadius(root,parent.meta.id);
    approveSpecification(root, parent.meta.id);
    task = loadTask(findTask(root, parent.meta.id));
    assert.ok(task.meta.dependencies.includes(dependency.meta.id));
    assert.ok(task.meta.dependencies.includes(child.meta.id));
    assert.throws(() => startExecution(root, parent.meta.id), /unfinished dependencies/i);
});
//# sourceMappingURL=dependencies.test.js.map