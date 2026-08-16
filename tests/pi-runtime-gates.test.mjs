import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();

function typeboxStub(root) {
  const dir = path.join(root, 'node_modules', 'typebox');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'typebox', version: '0.0.0-test', type: 'module', exports: './index.js' }));
  writeFileSync(path.join(dir, 'index.js'), `const schema=(type,extra={})=>({type,...extra});\nexport const Type={String:(o={})=>schema('string',o),Integer:(o={})=>schema('integer',o),Boolean:(o={})=>schema('boolean',o),Optional:(v)=>v,Array:(items,o={})=>schema('array',{items,...o}),Object:(properties,o={})=>schema('object',{properties,...o})};\n`);
}

async function loadRuntime({ entries = [] } = {}) {
  const pkgRoot = mkdtempSync(path.join(tmpdir(), 'specrail-pi-gates-'));
  mkdirSync(path.join(pkgRoot, 'extensions'), { recursive: true });
  cpSync(path.join(repoRoot, 'extensions', 'specrail-runtime-gates.js'), path.join(pkgRoot, 'extensions', 'specrail-runtime-gates.js'));
  cpSync(path.join(repoRoot, 'vendor'), path.join(pkgRoot, 'vendor'), { recursive: true });
  typeboxStub(pkgRoot);
  const tools = new Map();
  const events = new Map();
  const appended = [...entries];
  const messages = [];
  const pi = {
    on(name, handler) { events.set(name, handler); },
    registerTool(def) { tools.set(def.name, def); },
    appendEntry(customType, data) { appended.push({ type: 'custom', customType, data }); },
    sendMessage(message, options) { messages.push({ message, options }); },
    async exec(command, args, options = {}) {
      const result = spawnSync(command, args, { cwd: options.cwd || repoRoot, encoding: 'utf8', timeout: options.timeout });
      return { code: result.status, killed: Boolean(result.signal), stdout: String(result.stdout || ''), stderr: String(result.stderr || result.error?.message || '') };
    }
  };
  const mod = await import(`${pathToFileURL(path.join(pkgRoot, 'extensions', 'specrail-runtime-gates.js')).href}?t=${Date.now()}-${Math.random()}`);
  mod.installSpecRailRuntimeGates(pi);
  return { tools, events, appended, messages, mod };
}

function context(cwd, { sessionId = 'pi-gate-session', entries = [], hasUI = true, select } = {}) {
  return {
    cwd,
    hasUI,
    mode: hasUI ? 'tui' : 'print',
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => entries,
      getEntries: () => entries
    },
    ui: {
      select: select || (async (_title, options) => options[0]),
      input: async () => 'custom answer',
      notify: () => {}
    }
  };
}

async function explicitDirectVerify(events, ctx) {
  const before = events.get('before_agent_start');
  assert.ok(before);
  const result = await before({ prompt: 'Directo + verificar: corrige login', systemPrompt: 'base' }, ctx);
  assert.match(result.systemPrompt, /active route=direct_verify/);
}

test('Pi runtime blocks mutation until route, pinned Ponytail, and material decisions are resolved', async () => {
  const { tools, events } = await loadRuntime();
  const cwd = mkdtempSync(path.join(tmpdir(), 'specrail-pi-gate-cwd-'));
  const ctx = context(cwd);
  const toolCall = events.get('tool_call');

  const noRoute = await toolCall({ toolName: 'edit', toolCallId: 'edit-0', input: { path: 'a.ts' } }, ctx);
  assert.match(noRoute.reason, /PROCESS_ROUTE_REQUIRED/);

  await explicitDirectVerify(events, ctx);
  const noPolicy = await toolCall({ toolName: 'edit', toolCallId: 'edit-1', input: { path: 'a.ts' } }, ctx);
  assert.match(noPolicy.reason, /MUTATION_GATE_REQUIRED/);

  const ponytail = tools.get('specrail_ponytail');
  const loaded = await ponytail.execute('pony-1', { action: 'load' }, undefined, undefined, ctx);
  assert.match(loaded.content[0].text, /# Ponytail/);
  assert.equal(loaded.details.commit, '2ed6c52c9d7e5e56942508591085fd45dea277d3');

  const gate = tools.get('specrail_mutation_gate');
  await assert.rejects(() => gate.execute('gate-1', { decisions: [{ id: 'api-shape', material: true, status: 'unresolved' }] }, undefined, undefined, ctx), /UNRESOLVED_MATERIAL_DECISION/);
  await assert.rejects(() => gate.execute('gate-2', { decisions: [{ id: 'api-shape', material: true, status: 'resolved', source: 'model_guess', ref: 'thought' }] }, undefined, undefined, ctx), /invalid decision source/);
  const passed = await gate.execute('gate-3', { decisions: [{ id: 'api-shape', material: true, status: 'resolved', source: 'active_user', ref: 'current-user-message' }] }, undefined, undefined, ctx);
  assert.equal(passed.details.allowed, true);

  assert.equal(await toolCall({ toolName: 'edit', toolCallId: 'edit-2', input: { path: 'a.ts' } }, ctx), undefined);
});

test('Pi Direct + Verify records successful mutation, forces postconditions, and rejects mutating verification commands', async () => {
  const { tools, events, messages } = await loadRuntime();
  const cwd = mkdtempSync(path.join(tmpdir(), 'specrail-pi-verify-cwd-'));
  const ctx = context(cwd);
  await explicitDirectVerify(events, ctx);
  await tools.get('specrail_ponytail').execute('pony-load', { action: 'load' }, undefined, undefined, ctx);
  await tools.get('specrail_mutation_gate').execute('gate', { decisions: [] }, undefined, undefined, ctx);

  const toolCall = events.get('tool_call');
  assert.equal(await toolCall({ toolName: 'edit', toolCallId: 'edit-success', input: { path: 'a.ts' } }, ctx), undefined);
  await events.get('tool_execution_end')({ toolCallId: 'edit-success', toolName: 'edit', isError: false, result: {} }, ctx);
  await events.get('agent_end')({ messages: [] }, ctx);
  assert.equal(messages.length, 1);
  assert.match(messages[0].message.content, /specrail_verify/);
  assert.equal(messages[0].options.triggerTurn, true);

  const verify = tools.get('specrail_verify');
  await assert.rejects(() => verify.execute('verify-bad', { command: 'sh', args: ['-c', 'echo x > changed.txt'] }, undefined, undefined, ctx), /VERIFY_COMMAND_MUTATES/);
  const verified = await verify.execute('verify-ok', { command: process.execPath, args: ['-e', 'process.exit(0)'] }, undefined, undefined, ctx);
  assert.equal(verified.details.passed, true);

  const review = await tools.get('specrail_ponytail').execute('pony-review', { action: 'review' }, undefined, undefined, ctx);
  assert.match(review.content[0].text, /Review diffs for unnecessary complexity/);
  await events.get('agent_end')({ messages: [] }, ctx);
  assert.equal(messages.length, 1, 'no second enforcement follow-up after review and verification pass');
});

test('Pi runtime persists selected routes in session entries and explicit user override is required to disable Ponytail', async () => {
  const first = await loadRuntime();
  const cwd = mkdtempSync(path.join(tmpdir(), 'specrail-pi-persist-cwd-'));
  const ctx = context(cwd, { sessionId: 'persistent-session' });
  await first.events.get('tool_result')({ toolName: 'specrail_entry_gate', isError: false, details: { route: 'direct', source: 'native-choice' } }, ctx);
  assert.ok(first.appended.some(entry => entry.customType === 'specrail-runtime-state-v1' && entry.data.route === 'direct'));

  const second = await loadRuntime({ entries: first.appended });
  const restoredCtx = context(cwd, { sessionId: 'persistent-session', entries: first.appended });
  await second.events.get('session_start')({}, restoredCtx);
  const before = await second.events.get('before_agent_start')({ prompt: 'continúa con el ajuste', systemPrompt: 'base' }, restoredCtx);
  assert.match(before.systemPrompt, /active route=direct/);

  const override = second.tools.get('specrail_ponytail_override');
  await assert.rejects(() => override.execute('override-headless', { reason: 'not installed' }, undefined, undefined, context(cwd, { sessionId: 'persistent-session', entries: first.appended, hasUI: false })), /REQUIRES_USER/);
  const declined = await override.execute('override-decline', { reason: 'not installed' }, undefined, undefined, context(cwd, { sessionId: 'persistent-session', entries: first.appended, select: async () => 'Keep Ponytail' }));
  assert.equal(declined.details.disabled, false);
  const accepted = await override.execute('override-accept', { reason: 'user requested it' }, undefined, undefined, context(cwd, { sessionId: 'persistent-session', entries: first.appended, select: async () => 'Disable Ponytail' }));
  assert.equal(accepted.details.disabled, true);
});
