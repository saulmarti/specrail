import assert from 'node:assert/strict';
import specrailPiExtension, { PROCESS_ROUTE_OPTIONS, processRouteKind } from '../extensions/specrail.js';

assert.equal(typeof specrailPiExtension, 'function');
assert.deepEqual(PROCESS_ROUTE_OPTIONS.map((x) => x.route), ['specrail', 'direct', 'direct_verify']);
assert.equal(processRouteKind('SpecRail Fast: implement').route, 'specrail');
assert.equal(processRouteKind('No SpecRail: implement').route, 'direct');
assert.equal(processRouteKind('Direct + Verify: implement').route, 'direct_verify');
assert.equal(processRouteKind('Continue TASK-1234').route, 'specrail');
assert.equal(processRouteKind('implement feature').explicit, false);

const handlers = new Map();
const tools = new Map();
const commands = new Map();
const pi = {
  on(name, fn) { handlers.set(name, fn); },
  registerTool(tool) { tools.set(tool.name, tool); },
  registerCommand(name, def) { commands.set(name, def); },
};
specrailPiExtension(pi);
assert(handlers.has('before_agent_start'));
assert(tools.has('specrail_entry_gate'));
assert(tools.has('request_user_input'));
assert(commands.has('specrail-handoff'));

const ctx = {
  hasUI: false,
  mode: 'json',
};
await assert.rejects(
  tools.get('specrail_entry_gate').execute('gate', { prompt: 'implement feature' }, undefined, undefined, ctx),
  /PROCESS_ROUTE_REQUIRED/,
);

console.log('PASS: Pi adapter');
