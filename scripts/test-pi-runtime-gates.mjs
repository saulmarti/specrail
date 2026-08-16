import assert from 'node:assert/strict';
import installSpecRailRuntimeGates, {
  PONYTAIL_COMMIT,
  bashMayMutate,
  decisionBlockers,
  excludedFingerprintPath,
  explicitRoute,
  routeFromToolResult,
  verificationCommandAllowed,
  verifyPinnedPonytail,
} from '../extensions/specrail-runtime-gates.js';

assert.equal(typeof installSpecRailRuntimeGates, 'function', 'Pi extension must expose a default factory');
assert.equal(PONYTAIL_COMMIT, '2ed6c52c9d7e5e56942508591085fd45dea277d3');
assert.deepEqual(explicitRoute('SpecRail Fast: fix it'), { route: 'specrail', source: 'explicit-prefix', workflowMode: 'fast' });
assert.equal(explicitRoute('Sin SpecRail: fix it').route, 'direct');
assert.equal(explicitRoute('Directo + verificar: fix it').route, 'direct_verify');
assert.equal(explicitRoute('Continue TASK-1234').route, 'specrail');
assert.equal(explicitRoute('fix it'), null);

assert.equal(bashMayMutate('git status --short'), false);
assert.equal(bashMayMutate('rg TODO src'), false);
assert.equal(bashMayMutate('python scripts/check.py'), true, 'unknown executable must fail closed');
assert.equal(bashMayMutate('git status && rm -rf tmp'), true, 'shell composition must fail closed');
assert.equal(bashMayMutate('npm test'), true, 'build/test commands can write generated files and must pass the mutation gate');

assert.equal(verificationCommandAllowed('npm', ['test']), false, 'package scripts are arbitrary code and cannot be trusted as read-only');
assert.equal(verificationCommandAllowed('python', ['-c', 'open("x", "w").write("x")']), false);
assert.equal(verificationCommandAllowed('node', ['-e', 'process.exit(0)']), false);
assert.equal(verificationCommandAllowed('sh', ['-c', 'npm test']), false);
assert.equal(verificationCommandAllowed('node', ['--version']), true);
assert.equal(verificationCommandAllowed('node', ['--check', 'src/index.js']), true);
assert.equal(verificationCommandAllowed('git', ['status', '--short']), true);
assert.equal(verificationCommandAllowed('git', ['diff', '--output=owned.txt']), false);
assert.equal(excludedFingerprintPath('.specrail'), true);
assert.equal(excludedFingerprintPath('.specrail/runtime/state.json'), true);
assert.equal(excludedFingerprintPath('src/.specrail.js'), false);

assert.deepEqual(decisionBlockers([{ id: 'api', material: true, status: 'open' }]), ['api: unresolved']);
assert.deepEqual(decisionBlockers([{ id: 'api', material: true, status: 'resolved', source: 'model_guess', ref: 'x' }]), ['api: invalid decision source']);
assert.deepEqual(
  decisionBlockers([{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: 'invented' }]),
  ['api: untrusted or mismatched evidence'],
  'the model must not be able to mint trusted provenance itself',
);
assert.deepEqual(
  decisionBlockers(
    [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: 'trusted-ref' }],
    { api: { source: 'active_user', ref: 'trusted-ref' } },
  ),
  [],
);

assert.equal(typeof verifyPinnedPonytail('vendor/ponytail/skills/ponytail/SKILL.md', 'skills/ponytail/SKILL.md'), 'string');
assert.equal(typeof verifyPinnedPonytail('vendor/ponytail/skills/ponytail-review/SKILL.md', 'skills/ponytail-review/SKILL.md'), 'string');

assert.equal(routeFromToolResult({
  toolName: 'specrail_entry_gate',
  isError: false,
  result: { details: { route: 'direct_verify', source: 'native-choice' } },
}).route, 'direct_verify');

const handlers = new Map();
const tools = new Map();
const entries = [];
const followUps = [];
let fingerprintFiles = '';
const pi = {
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
  registerTool(tool) { tools.set(tool.name, tool); },
  appendEntry(customType, data) { entries.push({ type: 'custom', customType, data }); },
  sendMessage(message, options) { followUps.push({ message, options }); },
  async exec(command, args) {
    if (command === 'git' && args[0] === 'rev-parse') return { code: 0, stdout: 'true\n', stderr: '', killed: false };
    if (command === 'git' && args[0] === 'ls-files') return { code: 0, stdout: fingerprintFiles, stderr: '', killed: false };
    return { code: 0, stdout: 'ok\n', stderr: '', killed: false };
  },
};
installSpecRailRuntimeGates(pi);
for (const required of ['specrail_ponytail', 'specrail_decision_evidence', 'specrail_ponytail_review_result', 'specrail_mutation_gate', 'specrail_verify']) {
  assert(tools.has(required), `missing ${required}`);
}
for (const required of ['before_agent_start', 'tool_call', 'tool_execution_end', 'agent_end']) assert(handlers.has(required), `missing ${required}`);

const ctx = {
  cwd: process.cwd(),
  hasUI: true,
  ui: { notify() {} },
  sessionManager: { getSessionId() { return 'test-session'; }, getBranch() { return entries; } },
};
const before = handlers.get('before_agent_start')[0];
const toolCall = handlers.get('tool_call')[0];
const toolEnd = handlers.get('tool_execution_end')[0];
const agentEnd = handlers.get('agent_end')[0];

await before({ prompt: 'Directo + verificar: fix bug', systemPrompt: 'base' }, ctx);
assert.equal(entries.length, 0, 'Direct routes must not create persistent SpecRail runtime state');
await tools.get('specrail_ponytail').execute('p1', { action: 'load' }, undefined, undefined, ctx);

await assert.rejects(
  tools.get('specrail_mutation_gate').execute('spoof', {
    reviewed: true,
    decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: 'invented' }],
  }, undefined, undefined, ctx),
  /untrusted or mismatched evidence/,
);

await toolEnd({
  toolCallId: 'question-1',
  toolName: 'request_user_input',
  isError: false,
  result: { details: { cancelled: false, answers: [{ id: 'api', label: 'REST' }] } },
}, ctx);
const userEvidence = await tools.get('specrail_decision_evidence').execute(
  'e1', { id: 'api', source: 'active_user' }, undefined, undefined, ctx,
);
const userRef = userEvidence.details.ref;
assert.match(userRef, /^evidence:/u);

await assert.rejects(
  tools.get('specrail_mutation_gate').execute('g0', { reviewed: true, decisions: [] }, undefined, undefined, ctx),
  /NO_ASSUMPTION_AUDIT_REQUIRED/,
);
await tools.get('specrail_mutation_gate').execute('g1', {
  reviewed: true,
  decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: userRef }],
}, undefined, undefined, ctx);

assert.equal(await toolCall({ toolCallId: 'failed-write', toolName: 'write', input: { path: 'x' } }, ctx), undefined);
await toolEnd({ toolCallId: 'failed-write', toolName: 'write', isError: true, result: { content: [] } }, ctx);
const blockedAfterFailedMutation = await toolCall({ toolCallId: 'retry-without-gate', toolName: 'write', input: { path: 'x' } }, ctx);
assert.match(blockedAfterFailedMutation.reason, /MUTATION_GATE_REQUIRED/, 'failed mutations must also consume one-shot authorization');

await tools.get('specrail_mutation_gate').execute('g2', {
  reviewed: true,
  decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: userRef }],
}, undefined, undefined, ctx);
assert.equal(await toolCall({ toolCallId: 'w1', toolName: 'write', input: { path: 'x' } }, ctx), undefined);
await toolEnd({ toolCallId: 'w1', toolName: 'write', isError: false, result: { content: [] } }, ctx);
const blockedAfterMutation = await toolCall({ toolCallId: 'w2', toolName: 'write', input: { path: 'y' } }, ctx);
assert.match(blockedAfterMutation.reason, /MUTATION_GATE_REQUIRED/, 'mutation authorization must be one-shot');

await tools.get('specrail_ponytail').execute('p2', { action: 'review' }, undefined, undefined, ctx);
await agentEnd({}, ctx);
assert.equal(followUps.length, 1, 'loading review instructions alone must not satisfy completion');
fingerprintFiles = 'package.json\0';
await assert.rejects(
  tools.get('specrail_ponytail_review_result').execute('stale', { status: 'pass', summary: 'No unnecessary production code remains.', checks: ['root cause'] }, undefined, undefined, ctx),
  /PONYTAIL_REVIEW_STALE/,
  'Ponytail PASS must be tied to the exact reviewed workspace fingerprint',
);
fingerprintFiles = '';
await tools.get('specrail_ponytail').execute('p3', { action: 'review' }, undefined, undefined, ctx);
await tools.get('specrail_ponytail_review_result').execute('pr', { status: 'pass', summary: 'No unnecessary production code remains.', checks: ['root cause', 'reuse'] }, undefined, undefined, ctx);
await tools.get('specrail_verify').execute('v1', { command: 'node', args: ['--version'] }, undefined, undefined, ctx);
await agentEnd({}, ctx);
assert.equal(entries.length, 0, 'Direct + Verify must finish without persistent SpecRail gate/evidence state');

const anonManagerA = { getBranch() { return []; } };
const anonManagerB = { getBranch() { return []; } };
const anonA = { cwd: process.cwd(), hasUI: false, sessionManager: anonManagerA };
const anonB = { cwd: process.cwd(), hasUI: false, sessionManager: anonManagerB };
await before({ prompt: 'Sin SpecRail: fix anonymous session', systemPrompt: 'base' }, anonA);
await tools.get('specrail_ponytail').execute('anon-load', { action: 'load' }, undefined, undefined, anonA);
await tools.get('specrail_mutation_gate').execute('anon-gate', { reviewed: true, decisions: [], noMaterialDecisionsReason: 'The requested edit is fully explicit.' }, undefined, undefined, anonA);
assert.equal(await toolCall({ toolCallId: 'anon-write', toolName: 'write', input: { path: 'x' } }, anonA), undefined, 'anonymous session state must remain stable across hooks');
const isolated = await toolCall({ toolCallId: 'other-write', toolName: 'write', input: { path: 'x' } }, anonB);
assert.match(isolated.reason, /PROCESS_ROUTE_REQUIRED/, 'anonymous sessions must not share one global in-memory key');

console.log('PASS: Pi runtime gates');
