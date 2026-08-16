import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';

const STATE_TYPE = 'specrail-runtime-state-v1';
const STATE_VERSION = 1;
const PONYTAIL_UPSTREAM = 'DietrichGebert/ponytail';
const PONYTAIL_COMMIT = '2ed6c52c9d7e5e56942508591085fd45dea277d3';
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PONYTAIL_SKILL = path.join(PACKAGE_ROOT, 'vendor', 'ponytail', 'skills', 'ponytail', 'SKILL.md');
const PONYTAIL_REVIEW_SKILL = path.join(PACKAGE_ROOT, 'vendor', 'ponytail', 'skills', 'ponytail-review', 'SKILL.md');
const ALLOWED_DECISION_SOURCES = new Set(['active_user', 'approved_decision', 'repository_contract', 'established_pattern', 'tool_fact']);
const MUTATION_TOOL_NAMES = new Set(['write', 'edit', 'write_file', 'edit_file', 'create_file', 'delete_file', 'apply_patch', 'patch']);
const FAST = /^\s*specrail\s+fast\s*:/iu;
const DIRECT = /^\s*(?:sin|no)\s+specrail\s*:/iu;
const DIRECT_VERIFY = /^\s*(?:direct(?:o)?\s*\+\s*verif(?:y|icar)|direct\s*\+\s*verify)\s*:/iu;
const TASK_CONTINUATION = /\b(?:continue|resume|retoma|contin[uú]a)\s+TASK-\d{4,}\b/iu;

function emptyState(sessionId = null) {
  return {
    schemaVersion: STATE_VERSION,
    sessionId,
    route: null,
    routeSource: null,
    workflowMode: null,
    ponytailLoaded: false,
    ponytailDisabled: false,
    materialDecisionsCleared: false,
    mutationAuthorized: false,
    mutated: false,
    ponytailReviewLoaded: false,
    verificationRequired: false,
    verificationPassed: false,
    verificationRuns: [],
    enforcementFollowUps: 0,
    updatedAt: new Date().toISOString()
  };
}

function sessionId(ctx) {
  return String(ctx?.sessionManager?.getSessionId?.() || '').trim() || null;
}

function stateEntryData(entry) {
  return entry?.type === 'custom' && entry.customType === STATE_TYPE && entry.data && typeof entry.data === 'object' ? entry.data : null;
}

function cloneState(value, expectedSessionId) {
  if (!value || value.schemaVersion !== STATE_VERSION) return null;
  if (value.sessionId && expectedSessionId && value.sessionId !== expectedSessionId) return null;
  return { ...emptyState(expectedSessionId), ...value, sessionId: expectedSessionId || value.sessionId || null };
}

function restoreState(ctx) {
  const id = sessionId(ctx);
  const branch = typeof ctx?.sessionManager?.getBranch === 'function'
    ? ctx.sessionManager.getBranch()
    : typeof ctx?.sessionManager?.getEntries === 'function'
      ? ctx.sessionManager.getEntries()
      : [];
  let restored = null;
  for (const entry of Array.isArray(branch) ? branch : []) {
    const data = stateEntryData(entry);
    if (data) restored = cloneState(data, id) || restored;
  }
  return restored || emptyState(id);
}

function explicitRoute(prompt) {
  const text = String(prompt || '');
  if (FAST.test(text)) return { route: 'specrail', source: 'explicit-prefix', workflowMode: 'fast' };
  if (DIRECT_VERIFY.test(text)) return { route: 'direct_verify', source: 'explicit-prefix', workflowMode: null };
  if (DIRECT.test(text)) return { route: 'direct', source: 'explicit-prefix', workflowMode: null };
  if (TASK_CONTINUATION.test(text)) return { route: 'specrail', source: 'task-continuation', workflowMode: null };
  return null;
}

function bashMayMutate(command) {
  const text = String(command || '').trim();
  if (!text) return false;
  if (/(?:^|[;&|]\s*)(?:rm|mv|cp|mkdir|touch|truncate)\b/iu.test(text)) return true;
  if (/\b(?:apply_patch|git\s+apply|sed\s+-i|perl\s+-pi)\b/iu.test(text)) return true;
  if (/\b(?:git\s+(?:checkout|restore|reset|clean|add|commit|merge|rebase|cherry-pick))\b/iu.test(text)) return true;
  if (/(?:^|[^<])>{1,2}(?!>)/u.test(text) || /\btee\s+(?:-a\s+)?[^|]/iu.test(text)) return true;
  return false;
}

function isMutationCall(event) {
  const name = String(event?.toolName || '');
  if (MUTATION_TOOL_NAMES.has(name)) return true;
  return name === 'bash' && bashMayMutate(event?.input?.command);
}

function decisionBlockers(decisions) {
  const blockers = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision?.material !== true) continue;
    const id = String(decision?.id || '').trim() || 'unnamed';
    const status = String(decision?.status || '').trim().toLowerCase();
    const source = String(decision?.source || '').trim();
    const ref = String(decision?.ref || '').trim();
    if (status !== 'resolved') blockers.push(`${id}: unresolved`);
    else if (!ALLOWED_DECISION_SOURCES.has(source)) blockers.push(`${id}: invalid decision source`);
    else if (!ref) blockers.push(`${id}: missing evidence ref`);
  }
  return blockers;
}

function verificationCommandAllowed(command, args) {
  const joined = [command, ...(Array.isArray(args) ? args : [])].join(' ');
  return !bashMayMutate(joined);
}

export function installSpecRailRuntimeGates(pi) {
  const states = new Map();
  const pendingMutations = new Map();

  function getState(ctx) {
    const id = sessionId(ctx) || '__memory__';
    if (!states.has(id)) states.set(id, restoreState(ctx));
    return states.get(id);
  }

  function persist(ctx, state) {
    const id = sessionId(ctx) || '__memory__';
    const next = { ...state, sessionId: sessionId(ctx), updatedAt: new Date().toISOString() };
    states.set(id, next);
    if (typeof pi.appendEntry === 'function') pi.appendEntry(STATE_TYPE, next);
    return next;
  }

  function selectRoute(ctx, route, source, workflowMode = null) {
    const current = getState(ctx);
    return persist(ctx, {
      ...emptyState(sessionId(ctx)),
      route,
      routeSource: source,
      workflowMode,
      verificationRequired: route === 'direct_verify',
      ponytailLoaded: current.ponytailLoaded,
      ponytailDisabled: current.ponytailDisabled
    });
  }

  pi.on('session_start', async (_event, ctx) => {
    const id = sessionId(ctx) || '__memory__';
    states.set(id, restoreState(ctx));
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const resolved = explicitRoute(event?.prompt);
    if (resolved) selectRoute(ctx, resolved.route, resolved.source, resolved.workflowMode);
    const state = getState(ctx);
    if (!state.route) return undefined;
    const suffix = `\n\nSpecRail runtime gate state: active route=${state.route}${state.workflowMode ? `/${state.workflowMode}` : ''}. Before any production-code mutation, load the pinned Ponytail rules with specrail_ponytail(action=load), resolve all material decisions, then pass specrail_mutation_gate. Mutation tools are blocked until that gate passes.${state.route === 'direct_verify' ? ' Direct + Verify cannot finish silently: after the final mutation run specrail_verify and load specrail_ponytail(action=review).' : ' After the final mutation load specrail_ponytail(action=review).'}`;
    return { systemPrompt: `${event.systemPrompt}${suffix}` };
  });

  pi.on('tool_result', async (event, ctx) => {
    if (event?.toolName !== 'specrail_entry_gate' || event?.isError) return undefined;
    const details = event.details && typeof event.details === 'object' ? event.details : {};
    const route = details.route;
    if (route === 'specrail' || route === 'direct' || route === 'direct_verify') {
      selectRoute(ctx, route, details.source || (details.explicit ? 'explicit-prefix' : 'native-choice'), details.workflowMode || null);
    }
    return undefined;
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!isMutationCall(event)) return undefined;
    const state = getState(ctx);
    if (!state.route) return { block: true, reason: 'PROCESS_ROUTE_REQUIRED: choose SpecRail, Directo, or Directo + verificar before mutation.' };
    if (!state.mutationAuthorized) return { block: true, reason: 'MUTATION_GATE_REQUIRED: load Ponytail and pass specrail_mutation_gate before production-code mutation.' };
    if (!state.ponytailLoaded && !state.ponytailDisabled) return { block: true, reason: 'PONYTAIL_REQUIRED: the pinned official Ponytail rules have not been loaded for this work item.' };
    pendingMutations.set(event.toolCallId, sessionId(ctx) || '__memory__');
    return undefined;
  });

  pi.on('tool_execution_end', async (event, ctx) => {
    const id = pendingMutations.get(event?.toolCallId);
    if (!id) return;
    pendingMutations.delete(event.toolCallId);
    if (event.isError) return;
    const state = getState(ctx);
    persist(ctx, {
      ...state,
      mutated: true,
      ponytailReviewLoaded: false,
      verificationPassed: state.route === 'direct_verify' ? false : state.verificationPassed,
      enforcementFollowUps: 0
    });
  });

  pi.on('agent_end', async (_event, ctx) => {
    const state = getState(ctx);
    if (!state.mutated) return;
    const blockers = [];
    if (!state.ponytailReviewLoaded) blockers.push('load specrail_ponytail(action=review) and perform the minimalism review');
    if (state.route === 'direct_verify' && !state.verificationPassed) blockers.push('run specrail_verify with a real validation command');
    if (!blockers.length || state.enforcementFollowUps >= 1 || typeof pi.sendMessage !== 'function') return;
    persist(ctx, { ...state, enforcementFollowUps: state.enforcementFollowUps + 1 });
    pi.sendMessage({
      customType: 'specrail-runtime-enforcement',
      content: `Required completion gate still open: ${blockers.join('; ')}. Do not report the work item as successfully complete until these postconditions pass; if validation cannot pass, report the blocker explicitly.`,
      display: false
    }, { triggerTurn: true, deliverAs: 'followUp' });
  });

  pi.registerTool({
    name: 'specrail_ponytail',
    label: 'SpecRail Ponytail',
    description: 'Load the pinned official Ponytail full rules or the post-mutation Ponytail review rules bundled by SpecRail.',
    promptSnippet: 'Use action=load before mutation and action=review after the final mutation.',
    executionMode: 'sequential',
    parameters: Type.Object({ action: Type.String({ minLength: 1, maxLength: 16 }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action || '').trim().toLowerCase();
      if (action !== 'load' && action !== 'review') throw new Error('specrail_ponytail action must be load or review');
      const state = getState(ctx);
      if (!state.route) throw new Error('PROCESS_ROUTE_REQUIRED: choose a process route before loading mutation policy.');
      if (action === 'review' && !state.mutated) throw new Error('PONYTAIL_REVIEW_NOT_READY: no successful production-code mutation has been observed.');
      const file = action === 'load' ? PONYTAIL_SKILL : PONYTAIL_REVIEW_SKILL;
      const text = readFileSync(file, 'utf8');
      const next = action === 'load'
        ? persist(ctx, { ...state, ponytailLoaded: true, ponytailDisabled: false })
        : persist(ctx, { ...state, ponytailReviewLoaded: true, enforcementFollowUps: 0 });
      return {
        content: [{ type: 'text', text }],
        details: { action, upstream: PONYTAIL_UPSTREAM, commit: PONYTAIL_COMMIT, mode: action === 'load' ? 'full' : 'review', state: next }
      };
    }
  });

  pi.registerTool({
    name: 'specrail_ponytail_override',
    label: 'SpecRail Ponytail Override',
    description: 'Ask the user explicitly whether Ponytail may be disabled for the current work item.',
    promptSnippet: 'Use only when the user wants to proceed without Ponytail; never infer this override.',
    executionMode: 'sequential',
    parameters: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error('PONYTAIL_OVERRIDE_REQUIRES_USER: interactive Pi UI is unavailable.');
      const selected = await ctx.ui.select(`Disable Ponytail for this work item? ${String(params.reason || '').trim()}`, ['Keep Ponytail', 'Disable Ponytail']);
      if (selected !== 'Disable Ponytail') return { content: [{ type: 'text', text: JSON.stringify({ disabled: false }) }], details: { disabled: false } };
      const state = getState(ctx);
      const next = persist(ctx, { ...state, ponytailDisabled: true, ponytailLoaded: false, ponytailReviewLoaded: false });
      return { content: [{ type: 'text', text: JSON.stringify({ disabled: true }) }], details: { disabled: true, state: next } };
    }
  });

  pi.registerTool({
    name: 'specrail_mutation_gate',
    label: 'SpecRail Mutation Gate',
    description: 'Fail closed before production-code mutation unless the route, Ponytail policy, and all declared material decisions are resolved.',
    promptSnippet: 'Call immediately before the first production-code mutation in a work item or mutation phase.',
    executionMode: 'sequential',
    parameters: Type.Object({
      decisions: Type.Array(Type.Object({
        id: Type.String({ minLength: 1, maxLength: 160 }),
        material: Type.Boolean(),
        status: Type.String({ minLength: 1, maxLength: 32 }),
        source: Type.Optional(Type.String({ maxLength: 64 })),
        ref: Type.Optional(Type.String({ maxLength: 1000 }))
      }), { maxItems: 32 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (!state.route) throw new Error('PROCESS_ROUTE_REQUIRED: choose a process route before mutation.');
      if (!state.ponytailLoaded && !state.ponytailDisabled) throw new Error('PONYTAIL_REQUIRED: call specrail_ponytail(action=load), or obtain an explicit user override.');
      const blockers = decisionBlockers(params.decisions);
      if (blockers.length) throw new Error(`UNRESOLVED_MATERIAL_DECISION: ${blockers.join('; ')}`);
      const next = persist(ctx, { ...state, materialDecisionsCleared: true, mutationAuthorized: true });
      return { content: [{ type: 'text', text: JSON.stringify({ allowed: true, route: next.route, ponytail: next.ponytailDisabled ? 'explicitly-disabled' : 'pinned-full' }) }], details: { allowed: true, state: next } };
    }
  });

  pi.registerTool({
    name: 'specrail_verify',
    label: 'SpecRail Direct Verify',
    description: 'Execute a real non-mutating validation command and record its successful result for Direct + Verify.',
    promptSnippet: 'Required after the final mutation on Direct + Verify before reporting successful completion.',
    executionMode: 'sequential',
    parameters: Type.Object({
      command: Type.String({ minLength: 1, maxLength: 300 }),
      args: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 128 })),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 }))
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (state.route !== 'direct_verify') throw new Error('DIRECT_VERIFY_ROUTE_REQUIRED: specrail_verify only satisfies Direct + Verify.');
      const args = Array.isArray(params.args) ? params.args : [];
      if (!verificationCommandAllowed(params.command, args)) throw new Error('VERIFY_COMMAND_MUTATES: validation must not modify repository files.');
      const result = await pi.exec(params.command, args, { cwd: ctx.cwd, signal, timeout: params.timeoutMs ?? 120000 });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      if (result.killed || result.code !== 0) throw new Error(stderr.trim() || stdout.trim() || `Verification exited with code ${String(result.code)}`);
      const run = { command: params.command, args, code: result.code, at: new Date().toISOString() };
      const next = persist(ctx, { ...state, verificationPassed: true, verificationRuns: [...state.verificationRuns, run].slice(-8), enforcementFollowUps: 0 });
      return { content: [{ type: 'text', text: stdout.trim() || 'Verification passed.' }], details: { passed: true, run, state: next } };
    }
  });
}

export { PONYTAIL_COMMIT, PONYTAIL_UPSTREAM, STATE_TYPE, bashMayMutate, decisionBlockers, explicitRoute, isMutationCall };
