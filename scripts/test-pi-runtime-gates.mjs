import assert from 'node:assert/strict';
import installSpecRailRuntimeGates, {
  PONYTAIL_PROVIDER,
  STATE_TYPE,
  bashMayMutate,
  decisionBlockers,
  excludedFingerprintPath,
  explicitRoute,
  ponytailModeFromEntries,
  repositoryFingerprint,
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
assert.equal(ponytailModeFromEntries([{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'ultra' } }]), 'ultra');
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
    if (command === 'git' && args[0] === 'rev-parse') return { code: 0, stdout: `${process.cwd()}\n`, stderr: '', killed: false };
    if (command === 'git' && args[0] === 'ls-files') return { code: 0, stdout: fingerprintFiles, stderr: '', killed: false };
    return { code: 0, stdout: 'ok\n', stderr: '', killed: false };
  },
};
installSpecRailRuntimeGates(pi);
for (const required of ['specrail_ponytail', 'specrail_decision_evidence', 'specrail_ponytail_review_result', 'specrail_mutation_gate', 'specrail_verify']) {
  assert(tools.has(required), `missing ${required}`);
}
for (const required of ['session_start', 'before_agent_start', 'tool_call', 'tool_execution_end', 'agent_end']) assert(handlers.has(required), `missing ${required}`);

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
const runtimeEntries = () => entries.filter((entry) => entry.customType === STATE_TYPE);
const latestRuntimeState = () => runtimeEntries().at(-1)?.data;

await before({ prompt: 'Directo + verificar: fix bug', systemPrompt: 'base' }, ctx);
assert.equal(latestRuntimeState()?.route, 'direct_verify', 'Direct + Verify route continuity is stored only as Pi session metadata');
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
assert.equal(latestRuntimeState()?.route, 'direct_verify');
const continuedPrompt = await before({ prompt: 'continua', systemPrompt: 'base' }, ctx);
assert.match(continuedPrompt.systemPrompt, /route=direct_verify/, 'Direct + Verify route must survive agent_end in the active runtime');

const restoredHandlers = new Map();
const restoredTools = new Map();
const restoredPi = {
  ...pi,
  on(name, fn) { if (!restoredHandlers.has(name)) restoredHandlers.set(name, []); restoredHandlers.get(name).push(fn); },
  registerTool(tool) { restoredTools.set(tool.name, tool); },
};
installSpecRailRuntimeGates(restoredPi);
await restoredHandlers.get('session_start')[0]({}, ctx);
const restoredPrompt = await restoredHandlers.get('before_agent_start')[0]({ prompt: 'continua', systemPrompt: 'base' }, ctx);
assert.match(restoredPrompt.systemPrompt, /route=direct_verify/, 'Direct + Verify route must restore from Pi session metadata');
const restoredMutation = await restoredHandlers.get('tool_call')[0]({ toolCallId: 'restored-write', toolName: 'write', input: { path: 'x' } }, ctx);
assert.match(restoredMutation.reason, /MUTATION_GATE_REQUIRED/, 'restoring a route must never restore one-use mutation authority');

const nestedCtx = { ...ctx, cwd: path.join(process.cwd(), 'src') };
fingerprintFiles = 'package.json\0';
const rootFingerprint = await repositoryFingerprint(pi, ctx);
const nestedFingerprint = await repositoryFingerprint(pi, nestedCtx);
assert.equal(nestedFingerprint, rootFingerprint, 'repository fingerprint must be rooted at Git top-level, not the caller subdirectory');
fingerprintFiles = '';

const noPonytailEntries = [];
const noPonytailHandlers = new Map();
const noPonytailTools = new Map();
const noPonytailPi = {
  on(name, fn) { if (!noPonytailHandlers.has(name)) noPonytailHandlers.set(name, []); noPonytailHandlers.get(name).push(fn); },
  registerTool(tool) { noPonytailTools.set(tool.name, tool); },
  appendEntry(customType, data) { noPonytailEntries.push({ type: 'custom', customType, data }); },
  async exec(command, args) {
    if (command === 'git' && args[0] === 'rev-parse') return { code: 0, stdout: `${process.cwd()}\n`, stderr: '', killed: false };
    if (command === 'git' && args[0] === 'ls-files') return { code: 0, stdout: '', stderr: '', killed: false };
    return { code: 0, stdout: 'ok\n', stderr: '', killed: false };
  },
};
installSpecRailRuntimeGates(noPonytailPi);
const noPonytailCtx = {
  cwd: process.cwd(),
  hasUI: false,
  sessionManager: { getSessionId() { return 'no-ponytail'; }, getBranch() { return noPonytailEntries; } },
};
await noPonytailHandlers.get('before_agent_start')[0]({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, noPonytailCtx);
assert.equal(noPonytailEntries.filter((entry) => entry.customType === STATE_TYPE).at(-1)?.data?.route, 'direct', 'Direct route may persist Pi session routing metadata without creating SpecRail workflow state');
await assert.rejects(
  noPonytailTools.get('specrail_ponytail').execute('missing', { action: 'load' }, undefined, undefined, noPonytailCtx),
  /PONYTAIL_REQUIRED/,
  'missing host Ponytail signal must fail closed',
);

const ultraEntries = [{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'ultra' } }];
const ultraHandlers = new Map();
const ultraTools = new Map();
const ultraPi = {
  ...noPonytailPi,
  on(name, fn) { if (!ultraHandlers.has(name)) ultraHandlers.set(name, []); ultraHandlers.get(name).push(fn); },
  registerTool(tool) { ultraTools.set(tool.name, tool); },
  appendEntry(customType, data) { ultraEntries.push({ type: 'custom', customType, data }); },
};
installSpecRailRuntimeGates(ultraPi);
const ultraCtx = {
  ...noPonytailCtx,
  sessionManager: { getSessionId() { return 'ultra'; }, getBranch() { return ultraEntries; } },
};
await ultraHandlers.get('before_agent_start')[0]({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, ultraCtx);
await assert.rejects(
  ultraTools.get('specrail_ponytail').execute('ultra', { action: 'load' }, undefined, undefined, ultraCtx),
  /PONYTAIL_REQUIRED/,
  'Ponytail ultra must not satisfy the literal full-mode requirement',
);

console.log('PASS: Pi runtime gates');
