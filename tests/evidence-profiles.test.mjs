// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask } from '../dist/src/lib/task.js';
import { addEvidence, validateEvidence } from '../dist/src/lib/evidence.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-profile-'));
function file(root, id, sub, name, content = 'real') { const dir = path.join(root, '.ai/evidence', id, sub); mkdirSync(dir, { recursive: true }); const target = path.join(dir, name); writeFileSync(target, content); return target; }
test('architecture requires editable source and rendered diagram before approval', () => {
    const root = repo();
    initProject(root, { name: 'Arch' });
    const task = createTask(root, { title: 'New boundaries', type: 'architecture', surfaces: ['architecture'] });
    assert.deepEqual(validateEvidence(root, task.meta.id, 'pre-approval').missing, ['architecture-source', 'architecture-rendered']);
    addEvidence(root, task.meta.id, { kind: 'architecture-source', path: file(root, task.meta.id, 'architecture', 'diagram.mmd', 'graph TD\nA-->B'), source: 'design-proposal', label: 'Architecture source', tool: 'Codex' });
    addEvidence(root, task.meta.id, { kind: 'architecture-rendered', path: file(root, task.meta.id, 'architecture', 'diagram.svg', '<svg></svg>'), source: 'design-proposal', label: 'Architecture diagram', tool: 'Codex' });
    assert.equal(validateEvidence(root, task.meta.id, 'pre-approval').valid, true);
});
test('database implementation requires proposed ERD and real post-migration evidence', () => {
    const root = repo();
    initProject(root, { name: 'DB' });
    const task = createTask(root, { title: 'Route schema', type: 'database', surfaces: ['database'] });
    const loaded = loadTask(findTask(root, task.meta.id));
    loaded.meta.route.implementation = true;
    loaded.meta.route.qa = 'focused';
    saveTask(loaded);
    for (const [kind, name, source, content] of [['database-source', 'erd.mmd', 'design-proposal', 'erDiagram\n  USER ||--o{ ROUTE : owns'], ['database-rendered', 'erd.svg', 'design-proposal', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'], ['migration-plan', 'migration.md', 'design-proposal', '# Migration Plan\n\nApply and rollback safely.']])
        addEvidence(root, task.meta.id, { kind, path: file(root, task.meta.id, 'database', name, content), source, label: kind, tool: 'Codex' });
    assert.equal(validateEvidence(root, task.meta.id, 'pre-approval').valid, true);
    assert.ok(validateEvidence(root, task.meta.id, 'final').missing.includes('database-final'));
    assert.ok(validateEvidence(root, task.meta.id, 'final').missing.includes('migration-log'));
});
//# sourceMappingURL=evidence-profiles.test.js.map