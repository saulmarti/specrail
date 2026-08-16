import assert from 'node:assert/strict';
import installSpecRailRuntimeGates, {
  PONYTAIL_PROVIDER,
  STATE_TYPE,
  bashMayMutate,
  decisionBlockers,
  excludedFingerprintPath,
  explicitRoute,
  ponytailModeFromEntries,
  routeFromToolResult,
  verificationCommandAllowed,
} from '../extensions/specrail-runtime-gates.js';

assert.equal(typeof installSpecRailRuntimeGates, 'function');
assert.equal(PONYTAIL_PROVIDER, '@dietrichgebert/ponytail');
assert.equal(STATE_TYPE, 'specrail-runtime-state-v4');
assert.deepEqual(explicitRoute('SpecRail Fast: fix it'), { route: 'specrail', source: 'explicit-prefix', workflowMode: 'fast' });
assert.equal(explicitRoute('Sin SpecRail: fix it').route, 'direct');
assert.equal(explicitRoute('Directo + verificar: fix it').route, 'direct_verify');
assert.equal(explicitRoute('Continue TASK-1234').route, 'specrail');
assert.equal(explicitRoute('fix it'), null);

assert.equal(ponytailModeFromEntries([{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'full' } }]), 'full');
assert.equal(ponytailModeFromEntries([{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'lite' } }]), 'lite');
assert.equal(ponytailModeFromEntries([]), null);
assert.equal(bashMayMutate('git status --short'), false);
assert.equal(bashMayMutate('rg TODO src'), false);
assert.equal(bashMayMutate('npm test'), true);
assert.equal(bashMayMutate('git status && rm -rf tmp'), true);
assert.equal(verificationCommandAllowed('npm', ['test']), false);
assert.equal(verificationCommandAllowed('node', ['--version']), true);
assert.equal(verificationCommandAllowed('node', ['--check', 'src/index.js']), true);
assert.equal(verificationCommandAllowed('git', ['status', '--short']), true);
assert.equal(verificationCommandAllowed('git', ['diff', '--output=owned.txt']), false);
assert.equal(excludedFingerprintPath('.specrail/runtime/state.json'), true);
assert.equal(excludedFingerprintPath('src/.specrail.js'), false);

assert.deepEqual(decisionBlockers([{ id: 'api', material: true, status: 'open' }]), ['api: unresolved']);
assert.deepEqual(decisionBlockers([{ id: 'api', material: true, status: 'resolved', source: 'model_guess', ref: 'x' }]), ['api: invalid decision source']);
assert.deepEqual(
  decisionBlockers([{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: 'invented' }]),
  ['api: untrusted or mismatched evidence'],
);

assert.equal(routeFromToolResult({
  toolName: 'specrail_entry_gate',
  isError: false,
  result: { details: { route: 'direct_verify', source: 'native-choice' } },
}).route, 'direct_verify');

const handlers = new Map();
const tools = new Map();
const entries = [{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'full' } }];
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
assert.equal(entries.filter((entry) => entry.customType === STATE_TYPE).length, 0, 'Direct routes must not persist SpecRail runtime state');
const attested = await tools.get('specrail_ponytail').execute('p1', { action: 'load' }, undefined, undefined, ctx);
assert.equal(attested.details.mode, 'full');
assert.equal(attested.details.source, 'pi-session:ponytail-mode');

await toolEnd({
  toolCallId: 'question-1',
  toolName: 'request_user_input',
  isError: false,
  result: { details: { cancelled: false, answers: [{ id: 'api', label: 'REST' }] } },
}, ctx);
const userEvidence = await tools.get('specrail_decision_evidence').execute('e1', { id: 'api', source: 'active_user' }, undefined, undefined, ctx);
const userRef = userEvidence.details.ref;
assert.match(userRef, /^evidence:/u);

await assert.rejects(
  tools.get('specrail_mutation_gate').execute('spoof', {
    reviewed: true,
    decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: 'invented' }],
  }, undefined, undefined, ctx),
  /untrusted or mismatched evidence/,
);
await assert.rejects(
  tools.get('specrail_mutation_gate').execute('empty', { reviewed: true, decisions: [] }, undefined, undefined, ctx),
  /NO_ASSUMPTION_AUDIT_REQUIRED/,
);

await tools.get('specrail_mutation_gate').execute('g1', {
  reviewed: true,
  decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: userRef }],
}, undefined, undefined, ctx);
entries.push({ type: 'custom', customType: 'ponytail-mode', data: { mode: 'off' } });
const downgraded = await toolCall({ toolCallId: 'blocked-off', toolName: 'write', input: { path: 'x' } }, ctx);
assert.match(downgraded.reason, /PONYTAIL_REQUIRED/, 'changing Ponytail to off after gate must still block mutation');
entries.push({ type: 'custom', customType: 'ponytail-mode', data: { mode: 'full' } });

assert.equal(await toolCall({ toolCallId: 'failed-write', toolName: 'write', input: { path: 'x' } }, ctx), undefined);
await toolEnd({ toolCallId: 'failed-write', toolName: 'write', isError: true, result: { content: [] } }, ctx);
const blockedAfterFailedMutation = await toolCall({ toolCallId: 'retry-without-gate', toolName: 'write', input: { path: 'x' } }, ctx);
assert.match(blockedAfterFailedMutation.reason, /MUTATION_GATE_REQUIRED/);

await tools.get('specrail_mutation_gate').execute('g2', {
  reviewed: true,
  decisions: [{ id: 'api', material: true, status: 'resolved', source: 'active_user', ref: userRef }],
}, undefined, undefined, ctx);
assert.equal(await toolCall({ toolCallId: 'w1', toolName: 'write', input: { path: 'x' } }, ctx), undefined);
await toolEnd({ toolCallId: 'w1', toolName: 'write', isError: false, result: { content: [] } }, ctx);
assert.match((await toolCall({ toolCallId: 'w2', toolName: 'write', input: { path: 'y' } }, ctx)).reason, /MUTATION_GATE_REQUIRED/);

const review = await tools.get('specrail_ponytail').execute('p2', { action: 'review' }, undefined, undefined, ctx);
assert.match(review.content[0].text, /official \/skill:ponytail-review/i);
await agentEnd({}, ctx);
assert.equal(followUps.length, 1, 'starting review alone must not satisfy completion');
fingerprintFiles = 'package.json\0';
await assert.rejects(
  tools.get('specrail_ponytail_review_result').execute('stale', { status: 'pass', summary: 'Lean already. Ship.', checks: ['simplification review'] }, undefined, undefined, ctx),
  /PONYTAIL_REVIEW_STALE/,
);
fingerprintFiles = '';
await tools.get('specrail_ponytail').execute('p3', { action: 'review' }, undefined, undefined, ctx);
await tools.get('specrail_ponytail_review_result').execute('pr', { status: 'pass', summary: 'Lean already. Ship.', checks: ['simplification review'] }, undefined, undefined, ctx);
await tools.get('specrail_verify').execute('v1', { command: 'node', args: ['--version'] }, undefined, undefined, ctx);
await agentEnd({}, ctx);
assert.equal(entries.filter((entry) => entry.customType === STATE_TYPE).length, 0, 'Direct + Verify must finish without persistent SpecRail state');

const noPonytailEntries = [];
const noPonytailCtx = {
  cwd: process.cwd(),
  hasUI: false,
  sessionManager: { getSessionId() { return 'no-ponytail'; }, getBranch() { return noPonytailEntries; } },
};
await before({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, noPonytailCtx);
await assert.rejects(
  tools.get('specrail_ponytail').execute('missing', { action: 'load' }, undefined, undefined, noPonytailCtx),
  /PONYTAIL_REQUIRED/,
  'missing host Ponytail signal must fail closed',
);

console.log('PASS: Pi runtime gates');
