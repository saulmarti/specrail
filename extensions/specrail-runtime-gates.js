import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';

const STATE_TYPE = 'specrail-runtime-state-v2';
const STATE_VERSION = 2;
const PONYTAIL_UPSTREAM = 'DietrichGebert/ponytail';
const PONYTAIL_COMMIT = '2ed6c52c9d7e5e56942508591085fd45dea277d3';
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PONYTAIL_ROOT = path.join(PACKAGE_ROOT, 'vendor', 'ponytail');
const PONYTAIL_MANIFEST = path.join(PONYTAIL_ROOT, 'UPSTREAM.json');
const PONYTAIL_SKILL = path.join(PONYTAIL_ROOT, 'skills', 'ponytail', 'SKILL.md');
const PONYTAIL_REVIEW_SKILL = path.join(PONYTAIL_ROOT, 'skills', 'ponytail-review', 'SKILL.md');
const ALLOWED_DECISION_SOURCES = new Set(['active_user', 'approved_decision', 'repository_contract', 'established_pattern', 'tool_fact']);
const MUTATION_TOOL_NAMES = new Set(['write', 'edit', 'write_file', 'edit_file', 'create_file', 'delete_file', 'apply_patch', 'patch']);
const FAST = /^\s*specrail\s+fast\s*:/iu;
const DIRECT = /^\s*(?:sin|no)\s+specrail\s*:/iu;
const DIRECT_VERIFY = /^\s*(?:direct(?:o)?\s*\+\s*verif(?:y|icar)|direct\s*\+\s*verify)\s*:/iu;
const TASK_CONTINUATION = /\b(?:continue|resume|retoma|contin[uú]a)\s+TASK-\d{4,}\b/iu;
const READ_ONLY_COMMANDS = [
  /^pwd(?:\s|$)/iu,
  /^ls(?:\s|$)/iu,
  /^cat(?:\s|$)/iu,
  /^head(?:\s|$)/iu,
  /^tail(?:\s|$)/iu,
  /^wc(?:\s|$)/iu,
  /^grep(?:\s|$)/iu,
  /^rg(?:\s|$)/iu,
  /^stat(?:\s|$)/iu,
  /^file(?:\s|$)/iu,
  /^which(?:\s|$)/iu,
  /^command\s+-v(?:\s|$)/iu,
  /^git\s+(?:status|diff|log|show|rev-parse|ls-files)(?:\s|$)/iu,
  /^git\s+branch\s+--show-current(?:\s|$)/iu,
];
const PRECEDENCE_NOTICE = [
  'SpecRail precedence: explicit user requirements; security/privacy/data-loss/accessibility; approved SpecRail decisions and scope; acceptance/evidence requirements; repository conventions; then Ponytail minimalism.',
  'Ponytail never authorizes guessing a material requirement. If a material decision lacks deterministic provenance, stop and ask the user with structured choices plus free text.'
].join(' ');

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
    ponytailReviewPassed: false,
    ponytailReviewSummary: '',
    verificationRequired: false,
    verificationPassed: false,
    verificationRuns: [],
    completionBlocked: false,
    enforcementFollowUps: 0,
    updatedAt: new Date().toISOString(),
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

function hasShellComposition(text) {
  return /(?:\r|\n|;|&&|\|\||\||`|\$\(|<\(|>\(|>{1,2}|<)/u.test(text);
}

function bashMayMutate(command) {
  const text = String(command || '').trim();
  if (!text) return false;
  if (hasShellComposition(text)) return true;
  return !READ_ONLY_COMMANDS.some((pattern) => pattern.test(text));
}

function isMutationCall(event) {
  const name = String(event?.toolName || '');
  if (MUTATION_TOOL_NAMES.has(name)) return true;
  return name === 'bash' && bashMayMutate(event?.input?.command ?? event?.args?.command);
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

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function verifyPinnedPonytail(file, relativePath) {
  const manifest = JSON.parse(readFileSync(PONYTAIL_MANIFEST, 'utf8'));
  if (manifest.repository !== PONYTAIL_UPSTREAM || manifest.commit !== PONYTAIL_COMMIT) {
    throw new Error('PONYTAIL_INTEGRITY_FAILED: upstream repository or commit does not match the pinned runtime contract.');
  }
  const expected = String(manifest.files?.[relativePath] || '').trim();
  if (!/^[0-9a-f]{40}$/u.test(expected)) throw new Error(`PONYTAIL_INTEGRITY_FAILED: no valid blob hash for ${relativePath}.`);
  const bytes = readFileSync(file);
  const actual = gitBlobSha(bytes);
  if (actual !== expected) throw new Error(`PONYTAIL_INTEGRITY_FAILED: ${relativePath} does not match pinned upstream blob ${expected}.`);
  return bytes.toString('utf8');
}

function verificationCommandAllowed(command, args) {
  const executable = String(command || '').trim();
  if (!executable || /[\\/]/u.test(executable) && !path.isAbsolute(executable)) return false;
  const joined = [executable, ...(Array.isArray(args) ? args : [])].join(' ');
  return !hasShellComposition(joined);
}

async function execChecked(pi, command, args, ctx, signal, timeout = 30000) {
  const result = await pi.exec(command, args, { cwd: ctx.cwd, signal, timeout });
  if (result.killed || result.code !== 0) {
    const message = String(result.stderr || result.stdout || '').trim() || `${command} exited with code ${String(result.code)}`;
    throw new Error(message);
  }
  return result;
}

async function repositoryFingerprint(pi, ctx, signal) {
  await execChecked(pi, 'git', ['rev-parse', '--is-inside-work-tree'], ctx, signal);
  const diff = await execChecked(pi, 'git', ['diff', '--binary', '--no-ext-diff', 'HEAD'], ctx, signal);
  const untracked = await execChecked(pi, 'git', ['ls-files', '--others', '--exclude-standard', '-z'], ctx, signal);
  const hash = createHash('sha256');
  hash.update(String(diff.stdout || ''));
  const names = String(untracked.stdout || '').split('\0').filter(Boolean).sort();
  for (const name of names) {
    const absolute = path.resolve(ctx.cwd, name);
    const relative = path.relative(ctx.cwd, absolute);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('VERIFY_SNAPSHOT_UNSAFE_PATH');
    hash.update(`\0${relative}\0`);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) hash.update(`symlink:${readFileSync(absolute, 'utf8')}`);
    else if (stat.isFile()) hash.update(readFileSync(absolute));
    else hash.update(`mode:${stat.mode}:size:${stat.size}`);
  }
  return hash.digest('hex');
}

function routeFromToolResult(event) {
  if (event?.toolName !== 'specrail_entry_gate' || event?.isError) return null;
  const details = event?.result?.details;
  const route = details?.route;
  if (!['specrail', 'direct', 'direct_verify'].includes(route)) return null;
  return {
    route,
    source: details.source || (details.explicit ? 'explicit-prefix' : 'native-choice'),
    workflowMode: details.workflowMode || null,
  };
}

export function installSpecRailRuntimeGates(pi) {
  const states = new Map();
  const pendingMutations = new Map();

  function keyFor(ctx) { return sessionId(ctx) || '__memory__'; }

  function getState(ctx) {
    const id = keyFor(ctx);
    if (!states.has(id)) states.set(id, restoreState(ctx));
    return states.get(id);
  }

  function persist(ctx, state, explicitKey = keyFor(ctx)) {
    const next = { ...state, sessionId: explicitKey === '__memory__' ? null : explicitKey, updatedAt: new Date().toISOString() };
    states.set(explicitKey, next);
    if (explicitKey === keyFor(ctx) && typeof pi.appendEntry === 'function') pi.appendEntry(STATE_TYPE, next);
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
      ponytailDisabled: current.ponytailDisabled,
    });
  }

  pi.on('session_start', async (_event, ctx) => {
    states.set(keyFor(ctx), restoreState(ctx));
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const resolved = explicitRoute(event?.prompt);
    if (resolved) selectRoute(ctx, resolved.route, resolved.source, resolved.workflowMode);
    const state = getState(ctx);
    if (!state.route) return undefined;
    const suffix = `\n\nSpecRail runtime gates are active for route=${state.route}${state.workflowMode ? `/${state.workflowMode}` : ''}. ${PRECEDENCE_NOTICE} Before production-code mutation: load specrail_ponytail(action=load) unless explicitly disabled, perform an explicit material-uncertainty assessment, and pass specrail_mutation_gate. After the final mutation, load specrail_ponytail(action=review), perform the review, then record PASS with specrail_ponytail_review_result.${state.route === 'direct_verify' ? ' Direct + Verify additionally requires specrail_verify after the final mutation.' : ''}`;
    return { systemPrompt: `${event.systemPrompt || ''}${suffix}` };
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!isMutationCall(event)) return undefined;
    const state = getState(ctx);
    if (!state.route) return { block: true, reason: 'PROCESS_ROUTE_REQUIRED: choose SpecRail, Directo, or Directo + verificar before mutation.' };
    if (!state.mutationAuthorized || !state.materialDecisionsCleared) return { block: true, reason: 'MUTATION_GATE_REQUIRED: complete the audited No-Assumption gate immediately before mutation.' };
    if (!state.ponytailLoaded && !state.ponytailDisabled) return { block: true, reason: 'PONYTAIL_REQUIRED: pinned official Ponytail rules are not loaded for this work item.' };
    pendingMutations.set(event.toolCallId, keyFor(ctx));
    return undefined;
  });

  pi.on('tool_execution_end', async (event, ctx) => {
    const selected = routeFromToolResult(event);
    if (selected) {
      selectRoute(ctx, selected.route, selected.source, selected.workflowMode);
      return;
    }
    const id = pendingMutations.get(event?.toolCallId);
    if (!id) return;
    pendingMutations.delete(event.toolCallId);
    if (event.isError) return;
    const state = states.get(id) || getState(ctx);
    persist(ctx, {
      ...state,
      mutated: true,
      mutationAuthorized: false,
      materialDecisionsCleared: false,
      ponytailReviewLoaded: false,
      ponytailReviewPassed: false,
      ponytailReviewSummary: '',
      verificationPassed: state.route === 'direct_verify' ? false : state.verificationPassed,
      completionBlocked: false,
      enforcementFollowUps: 0,
    }, id);
  });

  pi.on('agent_end', async (_event, ctx) => {
    const state = getState(ctx);
    const blockers = [];
    if (state.mutated && !state.ponytailDisabled && !state.ponytailReviewPassed) blockers.push('complete Ponytail review and record PASS');
    if (state.mutated && state.route === 'direct_verify' && !state.verificationPassed) blockers.push('run a successful non-mutating specrail_verify');
    if (!blockers.length) {
      if (state.route === 'direct' || state.route === 'direct_verify') persist(ctx, emptyState(sessionId(ctx)));
      return;
    }
    const message = `Completion blocked: ${blockers.join('; ')}. Do not report this work item as successfully complete.`;
    const blocked = persist(ctx, { ...state, completionBlocked: true });
    if (blocked.enforcementFollowUps < 1 && typeof pi.sendMessage === 'function') {
      persist(ctx, { ...blocked, enforcementFollowUps: blocked.enforcementFollowUps + 1 });
      pi.sendMessage({ customType: 'specrail-runtime-enforcement', content: message, display: false }, { triggerTurn: true, deliverAs: 'followUp' });
      return;
    }
    if (ctx.hasUI && typeof ctx?.ui?.notify === 'function') ctx.ui.notify(message, 'error');
  });

  pi.registerTool({
    name: 'specrail_ponytail',
    label: 'SpecRail Ponytail',
    description: 'Load integrity-verified official Ponytail full or post-mutation review rules pinned by SpecRail.',
    promptSnippet: 'Use action=load before mutation and action=review after the final mutation.',
    executionMode: 'sequential',
    parameters: Type.Object({ action: Type.String({ minLength: 1, maxLength: 16 }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action || '').trim().toLowerCase();
      if (action !== 'load' && action !== 'review') throw new Error('specrail_ponytail action must be load or review');
      const state = getState(ctx);
      if (!state.route) throw new Error('PROCESS_ROUTE_REQUIRED: choose a process route before loading mutation policy.');
      if (action === 'review' && !state.mutated) throw new Error('PONYTAIL_REVIEW_NOT_READY: no successful production-code mutation has been observed.');
      const relative = action === 'load' ? 'skills/ponytail/SKILL.md' : 'skills/ponytail-review/SKILL.md';
      const file = action === 'load' ? PONYTAIL_SKILL : PONYTAIL_REVIEW_SKILL;
      const text = verifyPinnedPonytail(file, relative);
      const next = action === 'load'
        ? persist(ctx, { ...state, ponytailLoaded: true, ponytailDisabled: false })
        : persist(ctx, { ...state, ponytailReviewLoaded: true, ponytailReviewPassed: false, ponytailReviewSummary: '', enforcementFollowUps: 0 });
      return {
        content: [{ type: 'text', text: `${PRECEDENCE_NOTICE}\n\n${text}` }],
        details: { action, upstream: PONYTAIL_UPSTREAM, commit: PONYTAIL_COMMIT, integrity: 'verified', mode: action === 'load' ? 'full' : 'review', state: next },
      };
    },
  });

  pi.registerTool({
    name: 'specrail_ponytail_review_result',
    label: 'SpecRail Ponytail Review Result',
    description: 'Record the result of an actually performed Ponytail review; loading review instructions alone never satisfies completion.',
    promptSnippet: 'After action=review, record PASS only when the review found no unresolved minimalism/root-cause issue.',
    executionMode: 'sequential',
    parameters: Type.Object({
      status: Type.String({ minLength: 4, maxLength: 8 }),
      summary: Type.String({ minLength: 8, maxLength: 1000 }),
      checks: Type.Array(Type.String({ minLength: 2, maxLength: 300 }), { minItems: 1, maxItems: 12 }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (!state.mutated || !state.ponytailReviewLoaded) throw new Error('PONYTAIL_REVIEW_REQUIRED: load and perform the review before recording its result.');
      const status = String(params.status || '').trim().toLowerCase();
      if (status !== 'pass') throw new Error(`PONYTAIL_REVIEW_FAILED: ${String(params.summary || '').trim()}`);
      const next = persist(ctx, { ...state, ponytailReviewPassed: true, ponytailReviewSummary: String(params.summary).trim(), completionBlocked: false, enforcementFollowUps: 0 });
      return { content: [{ type: 'text', text: JSON.stringify({ passed: true, checks: params.checks.length }) }], details: { passed: true, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_ponytail_override',
    label: 'SpecRail Ponytail Override',
    description: 'Ask the user explicitly whether Ponytail may be disabled for the current work item.',
    promptSnippet: 'Use only for an explicit user-directed exception; never infer it.',
    executionMode: 'sequential',
    parameters: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error('PONYTAIL_OVERRIDE_REQUIRES_USER: interactive Pi UI is unavailable.');
      const selected = await ctx.ui.select(`Disable Ponytail for this work item? ${String(params.reason || '').trim()}`, ['Keep Ponytail', 'Disable Ponytail']);
      if (selected !== 'Disable Ponytail') return { content: [{ type: 'text', text: JSON.stringify({ disabled: false }) }], details: { disabled: false } };
      const state = getState(ctx);
      const next = persist(ctx, { ...state, ponytailDisabled: true, ponytailLoaded: false, ponytailReviewLoaded: false, ponytailReviewPassed: false });
      return { content: [{ type: 'text', text: JSON.stringify({ disabled: true }) }], details: { disabled: true, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_mutation_gate',
    label: 'SpecRail Mutation Gate',
    description: 'Fail closed before production-code mutation unless route, Ponytail policy, and an explicit auditable material-uncertainty assessment are valid.',
    promptSnippet: 'Call immediately before each production-code mutation after reviewing all material uncertainty.',
    executionMode: 'sequential',
    parameters: Type.Object({
      reviewed: Type.Boolean(),
      decisions: Type.Array(Type.Object({
        id: Type.String({ minLength: 1, maxLength: 160 }),
        material: Type.Boolean(),
        status: Type.String({ minLength: 1, maxLength: 32 }),
        source: Type.Optional(Type.String({ maxLength: 64 })),
        ref: Type.Optional(Type.String({ maxLength: 1000 })),
      }), { maxItems: 32 }),
      noMaterialDecisionsReason: Type.Optional(Type.String({ maxLength: 1000 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (!state.route) throw new Error('PROCESS_ROUTE_REQUIRED: choose a process route before mutation.');
      if (!state.ponytailLoaded && !state.ponytailDisabled) throw new Error('PONYTAIL_REQUIRED: load pinned Ponytail or obtain explicit user override.');
      if (params.reviewed !== true) throw new Error('NO_ASSUMPTION_REVIEW_REQUIRED: material uncertainty review must be explicit.');
      const decisions = Array.isArray(params.decisions) ? params.decisions : [];
      const reason = String(params.noMaterialDecisionsReason || '').trim();
      if (decisions.length === 0 && reason.length < 8) throw new Error('NO_ASSUMPTION_AUDIT_REQUIRED: empty decisions require a concrete reason why no material decision exists.');
      const blockers = decisionBlockers(decisions);
      if (blockers.length) throw new Error(`UNRESOLVED_MATERIAL_DECISION: ${blockers.join('; ')}`);
      const next = persist(ctx, { ...state, materialDecisionsCleared: true, mutationAuthorized: true, completionBlocked: false });
      return { content: [{ type: 'text', text: JSON.stringify({ allowed: true, route: next.route, assessed: decisions.length, ponytail: next.ponytailDisabled ? 'explicitly-disabled' : 'pinned-full' }) }], details: { allowed: true, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_verify',
    label: 'SpecRail Direct Verify',
    description: 'Execute one validation process for Direct + Verify and prove that the verification itself did not alter repository state.',
    promptSnippet: 'Required after final mutation on Direct + Verify. The repository fingerprint must be unchanged by validation.',
    executionMode: 'sequential',
    parameters: Type.Object({
      command: Type.String({ minLength: 1, maxLength: 300 }),
      args: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 128 })),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (state.route !== 'direct_verify') throw new Error('DIRECT_VERIFY_ROUTE_REQUIRED: specrail_verify only satisfies Direct + Verify.');
      if (!state.mutated) throw new Error('DIRECT_VERIFY_NOT_READY: no successful production-code mutation has been observed.');
      const args = Array.isArray(params.args) ? params.args : [];
      if (!verificationCommandAllowed(params.command, args)) throw new Error('VERIFY_COMMAND_UNSAFE: validation must be a direct executable invocation, not shell composition.');
      const before = await repositoryFingerprint(pi, ctx, signal);
      const result = await pi.exec(params.command, args, { cwd: ctx.cwd, signal, timeout: params.timeoutMs ?? 120000 });
      const after = await repositoryFingerprint(pi, ctx, signal);
      if (before !== after) throw new Error('VERIFY_MUTATED_REPOSITORY: validation changed tracked or untracked repository content; verification is not accepted.');
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      if (result.killed || result.code !== 0) throw new Error(stderr.trim() || stdout.trim() || `Verification exited with code ${String(result.code)}`);
      const run = { command: params.command, args, code: result.code, repositoryFingerprint: after, at: new Date().toISOString() };
      const next = persist(ctx, { ...state, verificationPassed: true, verificationRuns: [...state.verificationRuns, run].slice(-8), completionBlocked: false, enforcementFollowUps: 0 });
      return { content: [{ type: 'text', text: stdout.trim() || 'Verification passed without repository mutation.' }], details: { passed: true, run, state: next } };
    },
  });
}

export default installSpecRailRuntimeGates;
export { PONYTAIL_COMMIT, PONYTAIL_UPSTREAM, STATE_TYPE, bashMayMutate, decisionBlockers, explicitRoute, gitBlobSha, isMutationCall, routeFromToolResult, verificationCommandAllowed, verifyPinnedPonytail };
