// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { initProject, loadProjectConfig } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { contextStatus, requestContextExpansion, validateHandoffBudget } from '../dist/src/lib/context.js';
const repo = () => { const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-context-')); initProject(root); return root; };
test('project config defines progressive context budgets without repository-wide scans', () => {
    const root = repo();
    const config = loadProjectConfig(root);
    assert.equal(config.contextBudget.fullRepositoryScan, false);
    assert.ok(config.contextBudget.profiles.fast.initialFiles < config.contextBudget.profiles.standard.initialFiles);
});
test('safe read-only context expansions are automatic and excessive expansions require native user input', () => {
    const root = repo();
    const task = createTask(root, { title: 'Small backend change', surfaces: ['backend'], executionProfile: 'fast' });
    const first = requestContextExpansion(root, task.meta.id, { reason: 'Inspect the service and its tests.', files: ['src/service.ts', 'tests/service.test.ts'], symbols: ['Service'], depth: 1 });
    assert.equal(first.status, 'approved');
    const tooLarge = requestContextExpansion(root, task.meta.id, { reason: 'Read many unrelated files.', files: Array.from({ length: 30 }, (_, i) => `src/file-${i}.ts`), symbols: [], depth: 3 });
    assert.equal(tooLarge.status, 'user-approval-required');
    assert.equal(tooLarge.interaction.tool, 'request_user_input');
    const status = contextStatus(root, task.meta.id);
    assert.equal(status.profile, 'fast');
    assert.equal(status.fullRepositoryScan, false);
});
test('handoffs larger than the active context budget are rejected', () => {
    const root = repo();
    const task = createTask(root, { title: 'Compact handoff', surfaces: ['backend'], executionProfile: 'fast' });
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.body = setSection(loaded.body, 'Handoff', Array.from({ length: 500 }, () => 'word').join(' '));
    saveTask(loaded);
    const result = validateHandoffBudget(root, loadTask(findTask(root, task.meta.id)));
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /handoff/i);
});
test('upgrading an existing project preserves custom profiles while restoring required defaults', () => {
    const root = repo();
    const config = loadProjectConfig(root);
    config.contextBudget = { profiles: { custom: { initialFiles: 4, maxFiles: 9, codegraphDepth: 1, maxDepth: 2, handoffMaxWords: 90, maxAutomaticExpansions: 1 } }, fullRepositoryScan: true };
    writeFileSync(path.join(root, '.ai', 'config.json'), JSON.stringify(config, null, 2));
    initProject(root);
    const upgraded = loadProjectConfig(root);
    assert.equal(upgraded.contextBudget.fullRepositoryScan, false);
    assert.ok(upgraded.contextBudget.profiles.fast);
    assert.equal(upgraded.contextBudget.profiles.custom.maxFiles, 9);
});
test('CLI parses an explicit non-read-only expansion as a user approval gate', () => {
    const root = repo();
    const task = createTask(root, { title: 'Context write request', surfaces: ['backend'], executionProfile: 'fast' });
    const run = spawnSync(process.execPath, ['dist/src/cli.js', 'context', 'request', task.meta.id, '--reason', 'Inspect and potentially modify external context.', '--files', 'src/service.ts', '--read-only', 'false', '--root', root, '--json'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.status, 'user-approval-required');
    assert.equal(result.requested.readOnly, false);
});
test('context expansion rejects absolute and parent traversal paths outside the repository', () => {
    const root = repo();
    const task = createTask(root, { title: 'Unsafe context request', surfaces: ['backend'], executionProfile: 'fast' });
    assert.throws(() => requestContextExpansion(root, task.meta.id, { reason: 'Inspect a file outside the repository boundary.', files: ['../secrets.txt'], depth: 1 }), /outside|repository|relative/i);
    assert.throws(() => requestContextExpansion(root, task.meta.id, { reason: 'Inspect an absolute file outside the repository.', files: ['/etc/passwd'], depth: 1 }), /outside|repository|relative/i);
});
//# sourceMappingURL=context-budget.test.js.map