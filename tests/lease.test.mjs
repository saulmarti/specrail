// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { completePhase, approveSpecification, startExecution } from '../dist/src/lib/workflow.js';
import { acquireTaskLease, leaseStatus, takeTaskLease } from '../dist/src/lib/lease.js';
import { nextAction } from '../dist/src/lib/next.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
const repo = () => { const root = mkdtempSync(path.join(tmpdir(), 'ai-flow-lease-')); initProject(root); readyProjectContext(root); return root; };
function ready(root) { const task = createTask(root, { title: 'Add health route', type: 'feature', surfaces: ['backend'] }); let t = loadTask(findTask(root, task.meta.id)); t.meta.status = 'refining'; for (const [h, v] of [['Need', 'Expose service health.'], ['Product Value', 'Enable reliable deployment checks.'], ['Users', 'Operators and deployment automation.'], ['Scope', 'Add GET /health.'], ['Out of Scope', 'Dependency diagnostics.'], ['Acceptance Criteria', '- A GET request returns HTTP 200 with status ok.\n- An unsupported method returns HTTP 405.'], ['Implementation Plan', 'Add route and tests.']])
    t.body = setSection(t.body, h, v); saveTask(t); setDefaultBlastRadius(root,t.meta.id); completePhase(root, t.meta.id); return approveSpecification(root, t.meta.id); }
test('one active session owns execution and another receives a native takeover gate', () => {
    const root = repo();
    const task = ready(root);
    startExecution(root, task.meta.id, { sessionId: 'chat-a' });
    const lease = leaseStatus(root, task.meta.id, 'chat-b');
    assert.equal(lease.conflict, true);
    assert.throws(() => acquireTaskLease(root, task.meta.id, { sessionId: 'chat-b' }), /another session/i);
    const next = nextAction(root, task.meta.id, { sessionId: 'chat-b' });
    assert.equal(next.action, 'resolve-task-lease');
    assert.equal(next.interaction.tool, 'request_user_input');
    assert.ok(next.interaction.questions[0].options.some(x => /Tomar control/i.test(x.label)));
    const taken = takeTaskLease(root, task.meta.id, { sessionId: 'chat-b' });
    assert.equal(taken.owner, 'chat-b');
});
test('expired leases can be acquired without user takeover', () => {
    const root = repo();
    const task = ready(root);
    acquireTaskLease(root, task.meta.id, { sessionId: 'chat-old', ttlMs: -1 });
    const lease = acquireTaskLease(root, task.meta.id, { sessionId: 'chat-new' });
    assert.equal(lease.owner, 'chat-new');
});
test('lease acquisition serializes concurrent writers so only one session wins', async () => {
    const root = repo();
    const task = ready(root);
    const script = `import { acquireTaskLease } from ${JSON.stringify(new URL('../dist/src/lib/lease.js', import.meta.url).href)};try{acquireTaskLease(${JSON.stringify(root)},${JSON.stringify(task.meta.id)},{sessionId:process.argv[1],ttlMs:60000});console.log('won')}catch(e){console.log('lost')}`;
    const { spawn } = await import('node:child_process');
    const run = (id) => new Promise(resolve => { const child = spawn(process.execPath, ['--input-type=module', '-e', script, id], { cwd: process.cwd() }); let out = ''; child.stdout.on('data', d => out += d); child.on('close', () => resolve(out.trim())); });
    const results = await Promise.all([run('race-a'), run('race-b')]);
    assert.equal(results.filter(x => x === 'won').length, 1);
    assert.equal(results.filter(x => x === 'lost').length, 1);
});
//# sourceMappingURL=lease.test.js.map