
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { prepareCodeGraph, codeGraphStatus } from '../dist/src/lib/codegraph.js';
import { intakeTask, ensureTaskCodeGraph } from '../dist/src/lib/automation.js';
import { createFakeCodeGraph } from './helpers.mjs';
import { blockTask } from '../dist/src/lib/workflow.js';
const repo = () => { const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-codegraph-')); initProject(root, { name: 'CodeGraph test' }); return root; };
test('missing project index is initialized and indexed deterministically', () => {
    const root = repo();
    const fake = createFakeCodeGraph();
    const result = prepareCodeGraph(root, { command: fake.command, minIntervalMs: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'initialized');
    assert.ok(existsSync(path.join(root, '.codegraph')));
    const calls = fake.calls();
    assert.deepEqual(calls[0], ['--version']);
    assert.deepEqual(calls.filter(x => x[1] !== '--help').slice(1), [['init', root, '--index'], ['status', root]]);
    assert.deepEqual(calls.filter(x => x[1] === '--help').map(x => x[0]), ['init','sync','index','status']);
    assert.equal(codeGraphStatus(root).status, 'ready');
});
test('existing project index is incrementally synced before agents use it', () => {
    const root = repo();
    mkdirSync(path.join(root, '.codegraph'), { recursive: true });
    const fake = createFakeCodeGraph();
    const result = prepareCodeGraph(root, { command: fake.command, minIntervalMs: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'synced');
    assert.ok(existsSync(path.join(root, '.codegraph', 'synced')));
    assert.deepEqual(fake.calls().filter(x => x[1] !== '--help').map(x => x[0]), ['--version', 'sync', 'status']);
});
test('failed sync falls back to a deterministic full index', () => {
    const root = repo();
    mkdirSync(path.join(root, '.codegraph'), { recursive: true });
    const fake = createFakeCodeGraph({ failSync: true });
    const result = prepareCodeGraph(root, { command: fake.command, minIntervalMs: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'reindexed');
    assert.ok(existsSync(path.join(root, '.codegraph', 'reindexed')));
    assert.deepEqual(fake.calls().filter(x => x[1] !== '--help').map(x => x[0]), ['--version', 'sync', 'index', 'status']);
});
test('missing CodeGraph command blocks the natural task before Product Owner refinement', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-no-codegraph-'));
    const result = intakeTask(root, { title: 'Create favorites', need: 'Create favorites.', surfaces: ['backend'] }, { codegraph: { command: path.join(root, 'missing-codegraph'), minIntervalMs: 0 } });
    assert.equal(result.task.meta.status, 'blocked');
    assert.equal(result.task.meta.phase, 'product-specifier');
    assert.match(result.task.meta.block_reason, /codegraph-command-unavailable/);
    assert.equal(result.codegraph.ok, false);
});
test('natural intake initializes CodeGraph before returning Product Specifier work', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-natural-cg-'));
    const fake = createFakeCodeGraph();
    const result = intakeTask(root, { title: 'Create favorites', need: 'Create favorites.', surfaces: ['backend'] }, { codegraph: { command: fake.command, minIntervalMs: 0 } });
    assert.equal(result.task.meta.status, 'refining');
    assert.equal(result.task.meta.phase, 'product-specifier');
    assert.equal(result.codegraph.action, 'initialized');
    assert.ok(existsSync(path.join(root, '.codegraph')));
});
test('CodeGraph readiness never depends on writing Git metadata', () => {
    const root = repo();
    writeFileSync(path.join(root, '.git'), 'gitdir: /protected/git/metadata\n');
    const fake = createFakeCodeGraph();
    const result = prepareCodeGraph(root, { command: fake.command, minIntervalMs: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'ready');
    assert.equal(readFileSync(path.join(root, '.git'), 'utf8'), 'gitdir: /protected/git/metadata\n');
});
test('a task blocked by the previous Git exclude EPERM is resumed automatically after a healthy preflight', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-old-exclude-block-'));
    const fake = createFakeCodeGraph();
    const intake = intakeTask(root, { title: 'Adjust homepage heading', need: 'Adjust the heading.', surfaces: ['frontend'] }, { codegraph: { command: fake.command, minIntervalMs: 0 } });
    blockTask(root, intake.task.meta.id, "CodeGraph preflight failed: EPERM writing .git/info/exclude");
    const recovered = ensureTaskCodeGraph(root, intake.task.meta.id, { command: fake.command, minIntervalMs: 0 });
    assert.equal(recovered.codegraph.ok, true);
    assert.equal(recovered.task.meta.status, 'refining');
    assert.equal(recovered.task.meta.block_reason, null);
});

//# sourceMappingURL=codegraph-preflight.test.js.map

test('an incompatible CodeGraph CLI update blocks before agents use an unverified contract',()=>{
 const root=repo(),fake=createFakeCodeGraph({incompatibleContract:true});
 const result=prepareCodeGraph(root,{command:fake.command,minIntervalMs:0});
 assert.equal(result.ok,false);assert.equal(result.action,'codegraph-contract-incompatible');
 assert.equal(result.contract.compatible,false);assert.match(result.detail,/failed probes/i);
 assert.equal(existsSync(path.join(root,'.codegraph')),false);
});
