import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpSync } from 'node:fs';

const repoRoot = process.cwd();

function typeboxStub(root) {
  const dir = path.join(root, 'node_modules', 'typebox');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'typebox', version: '0.0.0-test', type: 'module', exports: './index.js' }));
  writeFileSync(path.join(dir, 'index.js'), `const schema=(type,extra={})=>({type,...extra});\nexport const Type={String:(o={})=>schema('string',o),Integer:(o={})=>schema('integer',o),Boolean:(o={})=>schema('boolean',o),Optional:(v)=>v,Array:(items,o={})=>schema('array',{items,...o}),Object:(properties,o={})=>schema('object',{properties,...o})};\n`);
}

async function loadRuntime() {
  const pkgRoot = mkdtempSync(path.join(tmpdir(), 'specrail-pi-gates-'));
  mkdirSync(path.join(pkgRoot, 'extensions'), { recursive: true });
  cpSync(path.join(repoRoot, 'extensions', 'specrail-runtime-gates.js'), path.join(pkgRoot, 'extensions', 'specrail-runtime-gates.js'));
  typeboxStub(pkgRoot);
  const tools = new Map();
  const events = new Map();
  const appended = [];
  const pi = {
    on(name, handler) { events.set(name, handler); },
    registerTool(def) { tools.set(def.name, def); },
    appendEntry(customType, data) { appended.push({ type: 'custom', customType, data }); },
    sendMessage() {},
    async exec(command, args) {
      if (command === 'git' && args[0] === 'rev-parse') return { code: 0, killed: false, stdout: 'true\n', stderr: '' };
      if (command === 'git' && args[0] === 'ls-files') return { code: 0, killed: false, stdout: '', stderr: '' };
      return { code: 0, killed: false, stdout: 'ok\n', stderr: '' };
    },
  };
  const mod = await import(`${pathToFileURL(path.join(pkgRoot, 'extensions', 'specrail-runtime-gates.js')).href}?t=${Date.now()}-${Math.random()}`);
  mod.installSpecRailRuntimeGates(pi);
  return { tools, events, appended, mod };
}

function context({ sessionId = 'pi-gate-session', entries = [], hasUI = true } = {}) {
  return {
    cwd: repoRoot,
    hasUI,
    mode: hasUI ? 'tui' : 'print',
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: { notify() {} },
  };
}

const fullEntry = () => ({ type: 'custom', customType: 'ponytail-mode', data: { mode: 'full' } });

test('Pi runtime requires explicit route, native full Ponytail state, and an audited uncertainty gate', async () => {
  const { tools, events } = await loadRuntime();
  const entries = [fullEntry()];
  const ctx = context({ entries });
  const toolCall = events.get('tool_call');

  assert.match((await toolCall({ toolName: 'edit', toolCallId: 'edit-0', input: {} }, ctx)).reason, /PROCESS_ROUTE_REQUIRED/);
  const before = await events.get('before_agent_start')({ prompt: 'Directo + verificar: corrige login', systemPrompt: 'base' }, ctx);
  assert.match(before.systemPrompt, /route=direct_verify/);
  assert.doesNotMatch(before.systemPrompt, /full or ultra/i);
  const loaded = await tools.get('specrail_ponytail').execute('pony-1', { action: 'load' }, undefined, undefined, ctx);
  assert.equal(loaded.details.mode, 'full');
  assert.equal(loaded.details.source, 'pi-session:ponytail-mode');

  await assert.rejects(
    () => tools.get('specrail_mutation_gate').execute('gate-empty', { reviewed: true, decisions: [] }, undefined, undefined, ctx),
    /NO_ASSUMPTION_AUDIT_REQUIRED/,
  );
  await tools.get('specrail_mutation_gate').execute('gate-ok', {
    reviewed: true,
    decisions: [],
    noMaterialDecisionsReason: 'The requested edit is fully explicit.',
  }, undefined, undefined, ctx);
  assert.equal(await toolCall({ toolName: 'edit', toolCallId: 'edit-1', input: {} }, ctx), undefined);
});

test('Pi runtime fails closed when Ponytail is missing, lite, ultra, or turned off after attestation', async () => {
  const { tools, events } = await loadRuntime();
  const missing = context({ entries: [] });
  await events.get('before_agent_start')({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, missing);
  await assert.rejects(() => tools.get('specrail_ponytail').execute('missing', { action: 'load' }, undefined, undefined, missing), /PONYTAIL_REQUIRED/);

  const lite = context({ sessionId: 'lite', entries: [{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'lite' } }] });
  await events.get('before_agent_start')({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, lite);
  await assert.rejects(() => tools.get('specrail_ponytail').execute('lite', { action: 'load' }, undefined, undefined, lite), /PONYTAIL_REQUIRED/);

  const ultra = context({ sessionId: 'ultra', entries: [{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'ultra' } }] });
  await events.get('before_agent_start')({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, ultra);
  await assert.rejects(() => tools.get('specrail_ponytail').execute('ultra', { action: 'load' }, undefined, undefined, ultra), /PONYTAIL_REQUIRED/);

  const entries = [fullEntry()];
  const ctx = context({ sessionId: 'downgrade', entries });
  await events.get('before_agent_start')({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, ctx);
  await tools.get('specrail_ponytail').execute('full', { action: 'load' }, undefined, undefined, ctx);
  await tools.get('specrail_mutation_gate').execute('gate', { reviewed: true, decisions: [], noMaterialDecisionsReason: 'The requested edit is fully explicit.' }, undefined, undefined, ctx);
  entries.push({ type: 'custom', customType: 'ponytail-mode', data: { mode: 'off' } });
  assert.match((await events.get('tool_call')({ toolName: 'edit', toolCallId: 'edit-off', input: {} }, ctx)).reason, /PONYTAIL_REQUIRED/);
  assert.equal(tools.has('specrail_ponytail_override'), false, 'there is no internal Ponytail bypass tool');
});

test('Pi runtime fails closed on unknown custom tools while allowing explicit read-only tools', async () => {
  const { events } = await loadRuntime();
  const ctx = context({ entries: [fullEntry()] });
  const toolCall = events.get('tool_call');

  assert.equal(await toolCall({ toolName: 'read', toolCallId: 'read-1', input: { path: 'README.md' } }, ctx), undefined);
  assert.equal(await toolCall({ toolName: 'grep', toolCallId: 'grep-1', input: { pattern: 'SpecRail' } }, ctx), undefined);
  const blocked = await toolCall({ toolName: 'mystery_custom_tool', toolCallId: 'unknown-1', input: {} }, ctx);
  assert.match(blocked.reason, /UNATTESTED_TOOL_CAPABILITY/);
});

test('Direct routes keep governance state in memory while SpecRail routes may persist it', async () => {
  const direct = await loadRuntime();
  const directEntries = [fullEntry()];
  await direct.events.get('before_agent_start')({ prompt: 'Sin SpecRail: fix it', systemPrompt: 'base' }, context({ entries: directEntries }));
  assert.equal(direct.appended.length, 0);

  const directVerify = await loadRuntime();
  const directVerifyEntries = [fullEntry()];
  await directVerify.events.get('before_agent_start')({ prompt: 'Directo + verificar: fix it', systemPrompt: 'base' }, context({ sessionId: 'direct-verify', entries: directVerifyEntries }));
  assert.equal(directVerify.appended.length, 0);

  const governed = await loadRuntime();
  const governedEntries = [fullEntry()];
  const governedCtx = context({ sessionId: 'governed', entries: governedEntries });
  await governed.events.get('before_agent_start')({ prompt: 'SpecRail Fast: fix it', systemPrompt: 'base' }, governedCtx);
  assert.ok(governed.appended.some((entry) => entry.customType === governed.mod.STATE_TYPE));
});
