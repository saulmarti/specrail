// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, resolveTaskReference, setSection, saveTask } from '../dist/src/lib/task.js';
import { startRefinement, completePhase, approveSpecification } from '../dist/src/lib/workflow.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
import { nextAction } from '../dist/src/lib/next.js';
const repo = () => { const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-resolve-')); initProject(root, { name: 'Resolve' }); return root; };
function makeSpecReady(root, id) {
    readyProjectContext(root);
    startRefinement(root, id);
    let task = loadTask(findTask(root, id));
    for (const [heading, text] of Object.entries({ Need: 'Improve the homepage.', 'Product Value': 'Make key actions clearer.', Scope: 'Redesign the homepage hero.', 'Out of Scope': 'Other pages.', 'Acceptance Criteria': '- Main actions are clear' }))
        task.body = setSection(task.body, heading, text);
    task.meta.route.design = false;
    task.meta.route.architecture = false;
    task.meta.route.database = false;
    saveTask(task);
    setDefaultBlastRadius(root,id);
    completePhase(root, id);
    approveSpecification(root, id);
}
test('task references resolve by ID, exact title, accents, and a unique meaningful phrase', () => {
    const root = repo();
    const task = createTask(root, { title: 'Rediseñar la homepage principal', type: 'feature', surfaces: ['frontend'] });
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.id, task.meta.id);
    assert.equal(loadTask(findTask(root, 'redisenar la homepage principal')).meta.id, task.meta.id);
    assert.equal(loadTask(findTask(root, 'tarea de la homepage')).meta.id, task.meta.id);
    const resolved = resolveTaskReference(root, 'implementa el rediseño de homepage');
    assert.equal(resolved.status, 'matched');
    assert.equal(resolved.task.meta.id, task.meta.id);
});
test('ambiguous references return candidates and a native Codex selector instead of guessing', () => {
    const root = repo();
    const a = createTask(root, { title: 'Rediseñar homepage de escritorio', type: 'feature', surfaces: ['frontend'] });
    const b = createTask(root, { title: 'Rediseñar homepage móvil', type: 'feature', surfaces: ['frontend'] });
    const resolved = resolveTaskReference(root, 'homepage');
    assert.equal(resolved.status, 'ambiguous');
    assert.deepEqual(new Set(resolved.candidates.map(x => x.id)), new Set([a.meta.id, b.meta.id]));
    assert.equal(resolved.interaction.tool, 'request_user_input');
    assert.equal(resolved.interaction.questions[0].isOther, true);
    assert.equal(resolved.interaction.questions[0].options.length, 2);
});
test('a new chat can resume an approved task by title and obtains the exact persisted next phase', () => {
    const root = repo();
    const task = createTask(root, { title: 'Añadir favoritos a artistas', type: 'feature', surfaces: ['backend'] });
    makeSpecReady(root, task.meta.id);
    const next = nextAction(root, 'favoritos a artistas');
    assert.equal(next.task, task.meta.id);
    assert.equal(next.phase, 'builder');
    assert.equal(next.actor, 'user');
    assert.equal(next.action, 'phase-boundary');
    assert.equal(next.userInputRequired, true);
});
test('closed tasks are not selected by a vague title when an open task matches, but explicit IDs still work', () => {
    const root = repo();
    const old = createTask(root, { title: 'Corregir filtros de artistas', type: 'bug', surfaces: ['frontend'] });
    let oldTask = loadTask(findTask(root, old.meta.id));
    oldTask.meta.status = 'done';
    oldTask.meta.phase = 'done';
    saveTask(oldTask);
    const current = createTask(root, { title: 'Mejorar filtros de artistas', type: 'task', surfaces: ['frontend'] });
    const resolved = resolveTaskReference(root, 'filtros de artistas');
    assert.equal(resolved.status, 'matched');
    assert.equal(resolved.task.meta.id, current.meta.id);
    assert.equal(loadTask(findTask(root, old.meta.id)).meta.id, old.meta.id);
});
test('generic continuation resolves the only open task and asks natively when several are open', () => {
    const single = repo();
    const only = createTask(single, { title: 'Preparar nueva navegación', type: 'task', surfaces: ['frontend'] });
    assert.equal(resolveTaskReference(single, 'continúa con la tarea').task.meta.id, only.meta.id);
    const multiple = repo();
    createTask(multiple, { title: 'Primera tarea', type: 'task', surfaces: ['backend'] });
    createTask(multiple, { title: 'Segunda tarea', type: 'task', surfaces: ['frontend'] });
    const result = resolveTaskReference(multiple, 'continúa');
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.interaction.tool, 'request_user_input');
    assert.equal(result.interaction.questions[0].options.length, 2);
});
test('an exact title can explicitly resolve a closed task even when other tasks remain open', () => {
    const root = repo();
    const closed = createTask(root, { title: 'Publicar página 404', type: 'task', surfaces: ['frontend'] });
    let task = loadTask(findTask(root, closed.meta.id));
    task.meta.status = 'done';
    task.meta.phase = 'done';
    saveTask(task);
    createTask(root, { title: 'Corregir galería', type: 'bug', surfaces: ['frontend'] });
    assert.equal(resolveTaskReference(root, 'Publicar página 404').task.meta.id, closed.meta.id);
});
test('an exact repeated title prefers the single open task over an older closed task', () => {
    const root = repo();
    const old = createTask(root, { title: 'Actualizar documentación', type: 'task', surfaces: ['backend'] });
    let closed = loadTask(findTask(root, old.meta.id));
    closed.meta.status = 'done';
    closed.meta.phase = 'done';
    saveTask(closed);
    const current = createTask(root, { title: 'Actualizar documentación', type: 'task', surfaces: ['backend'] });
    assert.equal(resolveTaskReference(root, 'Actualizar documentación').task.meta.id, current.meta.id);
    assert.equal(nextAction(root, old.meta.id).action, 'task-complete');
});
//# sourceMappingURL=task-resolution.test.js.map