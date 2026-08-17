import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { Type } from 'typebox';

const STATE_TYPE = 'specrail-runtime-state-v4';
const STATE_VERSION = 4;
const PONYTAIL_PROVIDER = '@dietrichgebert/ponytail';
const PONYTAIL_MODE_TYPE = 'ponytail-mode';
const ALLOWED_DECISION_SOURCES = new Set(['active_user', 'approved_decision', 'repository_contract', 'established_pattern', 'tool_fact']);
const MUTATION_TOOL_NAMES = new Set(['write', 'edit', 'write_file', 'edit_file', 'create_file', 'delete_file', 'apply_patch', 'patch']);
const TRUSTED_TOOL_EVIDENCE = new Map([
  ['approved_decision', new Set(['specrail_cli'])],
  ['established_pattern', new Set(['specrail_codegraph'])],
  ['tool_fact', new Set(['specrail_cli', 'specrail_codegraph'])],
]);
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
  'Ponytail never authorizes guessing a material requirement. If a material decision lacks deterministic provenance, stop and ask with structured choices plus free text.',
].join(' ');

function emptyState(sessionId = null) {
  return {
    schemaVersion: STATE_VERSION,
    sessionId,
    route: null,
    routeSource: null,
    workflowMode: null,
    ponytailAttested: false,
    ponytailMode: null,
    materialDecisionsCleared: false,
    mutationAuthorized: false,
    mutated: false,
    ponytailReviewStarted: false,
    ponytailReviewPassed: false,
    ponytailReviewSummary: '',
    ponytailReviewFingerprint: null,
    trustedDecisionEvidence: {},
    verificationRequired: false,
    verificationPassed: false,
    verificationRuns: [],
    completionBlocked: false,
    enforcementFollowUps: 0,
    updatedAt: new Date().toISOString(),
  };
}

function entriesFor(ctx) {
  const branch = typeof ctx?.sessionManager?.getBranch === 'function'
    ? ctx.sessionManager.getBranch()
    : typeof ctx?.sessionManager?.getEntries === 'function'
      ? ctx.sessionManager.getEntries()
      : [];
  return Array.isArray(branch) ? branch : [];
}

function hostSessionId(ctx) {
  const id = String(ctx?.sessionManager?.getSessionId?.() || '').trim();
  if (id) return `id:${id}`;
  const file = String(ctx?.sessionManager?.getSessionFile?.() || '').trim();
  return file ? `file:${file}` : null;
}

function stateEntryData(entry) {
  return entry?.type === 'custom' && entry.customType === STATE_TYPE && entry.data && typeof entry.data === 'object' ? entry.data : null;
}

function cloneState(value, expectedSessionId) {
  if (!value || value.schemaVersion !== STATE_VERSION) return null;
  if (value.sessionId && expectedSessionId && value.sessionId !== expectedSessionId) return null;
  return { ...emptyState(expectedSessionId), ...value, sessionId: expectedSessionId || value.sessionId || null };
}

function restoreState(ctx, expectedSessionId) {
  if (!expectedSessionId) return emptyState(null);
  let restored = null;
  for (const entry of entriesFor(ctx)) {
    const data = stateEntryData(entry);
    if (data) restored = cloneState(data, expectedSessionId) || restored;
  }
  return restored || emptyState(expectedSessionId);
}

function ponytailModeFromEntries(entries) {
  for (let i = (Array.isArray(entries) ? entries.length : 0) - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== 'custom' || entry?.customType !== PONYTAIL_MODE_TYPE) continue;
    const mode = String(entry?.data?.mode || '').trim().toLowerCase();
    return ['off', 'lite', 'full', 'ultra'].includes(mode) ? mode : null;
  }
  return null;
}

function qualifyingPonytailMode(ctx) {
  const mode = ponytailModeFromEntries(entriesFor(ctx));
  return mode === 'full' ? mode : null;
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

function decisionBlockers(decisions, evidence = {}) {
  const blockers = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision?.material !== true) continue;
    const id = String(decision?.id || '').trim() || 'unnamed';
    const status = String(decision?.status || '').trim().toLowerCase();
    const source = String(decision?.source || '').trim();
    const ref = String(decision?.ref || '').trim();
    const trusted = evidence[id];
    if (status !== 'resolved') blockers.push(`${id}: unresolved`);
    else if (!ALLOWED_DECISION_SOURCES.has(source)) blockers.push(`${id}: invalid decision source`);
    else if (!ref) blockers.push(`${id}: missing evidence ref`);
    else if (!trusted || trusted.source !== source || trusted.ref !== ref) blockers.push(`${id}: untrusted or mismatched evidence`);
  }
  return blockers;
}

function verificationCommandAllowed(command, args) {
  const executable = String(command || '').trim();
  const argv = Array.isArray(args) ? args.map((value) => String(value)) : [];
  if (!executable || hasShellComposition([executable, ...argv].join(' '))) return false;
  if (/[\\/]/u.test(executable)) return false;
  if (executable === 'node') {
    if (argv.length === 1 && ['--version', '-v'].includes(argv[0])) return true;
    return argv.length === 2 && argv[0] === '--check' && argv[1] && !argv[1].startsWith('-');
  }
  if (executable !== 'git' || argv.length < 1) return false;
  const safeSubcommands = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files']);
  if (!safeSubcommands.has(argv[0])) return false;
  return !argv.slice(1).some((arg) => /^(?:--output(?:=|$)|-o(?:$|[^a-z])|--exec-path(?:=|$)|--config-env(?:=|$))/u.test(arg));
}

function excludedFingerprintPath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  return normalized === '.specrail' || normalized.startsWith('.specrail/');
}

function safeRepositoryFile(ctx, relativePath) {
  const requested = String(relativePath || '').trim();
  if (!requested || path.isAbsolute(requested)) throw new Error('DECISION_EVIDENCE_UNSAFE_PATH');
  const root = realpathSync(ctx.cwd);
  const absolute = path.resolve(root, requested);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('DECISION_EVIDENCE_UNSAFE_PATH');
  const real = realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error('DECISION_EVIDENCE_UNSAFE_PATH');
  return real;
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
  const files = await execChecked(pi, 'git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], ctx, signal);
  const hash = createHash('sha256');
  const names = [...new Set(String(files.stdout || '').split('\0').filter(Boolean))].sort();
  for (const name of names) {
    const absolute = path.resolve(ctx.cwd, name);
    const relative = path.relative(ctx.cwd, absolute);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('VERIFY_SNAPSHOT_UNSAFE_PATH');
    if (excludedFingerprintPath(relative)) continue;
    hash.update(`\0${relative}\0`);
    if (!existsSync(absolute)) {
      hash.update('missing');
      continue;
    }
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) hash.update(`symlink:${readlinkSync(absolute)}`);
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
  return { route, source: details.source || (details.explicit ? 'explicit-prefix' : 'native-choice'), workflowMode: details.workflowMode || null };
}

function resultText(event) {
  const details = event?.result?.details;
  if (typeof details?.stdout === 'string') return details.stdout;
  const chunks = Array.isArray(event?.result?.content) ? event.result.content : [];
  return chunks.filter((chunk) => chunk?.type === 'text').map((chunk) => String(chunk.text || '')).join('\n');
}

function evidenceRef(sessionKey, id, source, material) {
  return `evidence:${createHash('sha256').update(`${sessionKey}\0${id}\0${source}\0${material}`).digest('hex').slice(0, 24)}`;
}

export function installSpecRailRuntimeGates(pi) {
  const states = new Map();
  const pendingMutations = new Map();
  const trustedToolResults = new Map();
  const anonymousKeys = new WeakMap();
  let anonymousSequence = 0;

  function keyFor(ctx) {
    const host = hostSessionId(ctx);
    if (host) return host;
    const identity = ctx?.sessionManager && typeof ctx.sessionManager === 'object' ? ctx.sessionManager : ctx;
    if (identity && typeof identity === 'object') {
      if (!anonymousKeys.has(identity)) anonymousKeys.set(identity, `anon:${++anonymousSequence}`);
      return anonymousKeys.get(identity);
    }
    return 'anon:fallback';
  }

  function getState(ctx) {
    const key = keyFor(ctx);
    if (!states.has(key)) states.set(key, restoreState(ctx, key.startsWith('anon:') ? null : key));
    return states.get(key);
  }

  function persist(ctx, state, explicitKey = keyFor(ctx)) {
    const persistedSession = explicitKey.startsWith('anon:') ? null : explicitKey;
    const next = { ...state, sessionId: persistedSession, updatedAt: new Date().toISOString() };
    states.set(explicitKey, next);
    if (next.route === 'specrail' && explicitKey === keyFor(ctx) && typeof pi.appendEntry === 'function') pi.appendEntry(STATE_TYPE, next);
    return next;
  }

  function selectRoute(ctx, route, source, workflowMode = null) {
    return persist(ctx, {
      ...emptyState(keyFor(ctx).startsWith('anon:') ? null : keyFor(ctx)),
      route,
      routeSource: source,
      workflowMode,
      verificationRequired: route === 'direct_verify',
    });
  }

  function rememberToolResult(event, ctx) {
    if (event?.isError || !event?.toolCallId) return;
    const toolName = String(event.toolName || '');
    if (!['specrail_cli', 'specrail_codegraph'].includes(toolName)) return;
    trustedToolResults.set(`${keyFor(ctx)}:${event.toolCallId}`, { toolName, text: resultText(event) });
  }

  function rememberUserAnswers(event, ctx) {
    if (event?.toolName !== 'request_user_input' || event?.isError) return;
    const answers = event?.result?.details?.answers;
    if (!Array.isArray(answers) || answers.length === 0) return;
    const state = getState(ctx);
    const trustedDecisionEvidence = { ...state.trustedDecisionEvidence };
    for (const answer of answers) {
      const id = String(answer?.id || '').trim();
      const value = String(answer?.value ?? answer?.label ?? '').trim();
      if (!id || !value) continue;
      const ref = evidenceRef(keyFor(ctx), id, 'active_user', `user:${id}:${value}`);
      trustedDecisionEvidence[id] = { source: 'active_user', ref, value, observedAt: new Date().toISOString() };
    }
    persist(ctx, { ...state, trustedDecisionEvidence });
  }

  pi.on('session_start', async (_event, ctx) => {
    const key = keyFor(ctx);
    states.set(key, restoreState(ctx, key.startsWith('anon:') ? null : key));
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const resolved = explicitRoute(event?.prompt);
    if (resolved) selectRoute(ctx, resolved.route, resolved.source, resolved.workflowMode);
    const state = getState(ctx);
    if (!state.route) return undefined;
    const suffix = `\n\nSpecRail runtime gates are active for route=${state.route}${state.workflowMode ? `/${state.workflowMode}` : ''}. ${PRECEDENCE_NOTICE} Before production-code mutation: attest official Ponytail with specrail_ponytail(action=load), perform an explicit material-uncertainty assessment, obtain runtime-backed evidence for every resolved material decision, and pass specrail_mutation_gate. Ponytail must be full and remains rechecked at mutation time; if no native ponytail-mode entry exists, ask the user to run /ponytail full. After the final mutation, call specrail_ponytail(action=review), run the official /skill:ponytail-review capability, then record PASS with specrail_ponytail_review_result.${state.route === 'direct_verify' ? ' Direct + Verify additionally requires specrail_verify after the final mutation.' : ''}`;
    return { systemPrompt: `${event.systemPrompt || ''}${suffix}` };
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!isMutationCall(event)) return undefined;
    const state = getState(ctx);
    if (!state.route) return { block: true, reason: 'PROCESS_ROUTE_REQUIRED: choose SpecRail, Directo, or Directo + verificar before mutation.' };
    if (!state.mutationAuthorized || !state.materialDecisionsCleared) return { block: true, reason: 'MUTATION_GATE_REQUIRED: complete the audited No-Assumption gate immediately before mutation.' };
    const mode = qualifyingPonytailMode(ctx);
    if (!state.ponytailAttested || !mode) return { block: true, reason: 'PONYTAIL_REQUIRED: official Pi Ponytail must be attested in full mode. Run /ponytail full, then re-open the mutation gate.' };
    pendingMutations.set(`${keyFor(ctx)}:${event.toolCallId}`, true);
    return undefined;
  });

  pi.on('tool_execution_end', async (event, ctx) => {
    const selected = routeFromToolResult(event);
    if (selected) {
      selectRoute(ctx, selected.route, selected.source, selected.workflowMode);
      return;
    }
    rememberToolResult(event, ctx);
    rememberUserAnswers(event, ctx);
    const mutationKey = `${keyFor(ctx)}:${event?.toolCallId}`;
    if (!pendingMutations.has(mutationKey)) return;
    pendingMutations.delete(mutationKey);
    const state = getState(ctx);
    if (event.isError) {
      persist(ctx, { ...state, mutationAuthorized: false, materialDecisionsCleared: false });
      return;
    }
    persist(ctx, {
      ...state,
      mutated: true,
      mutationAuthorized: false,
      materialDecisionsCleared: false,
      ponytailReviewStarted: false,
      ponytailReviewPassed: false,
      ponytailReviewSummary: '',
      ponytailReviewFingerprint: null,
      verificationPassed: state.route === 'direct_verify' ? false : state.verificationPassed,
      completionBlocked: false,
      enforcementFollowUps: 0,
    });
  });

  pi.on('agent_end', async (_event, ctx) => {
    const state = getState(ctx);
    const blockers = [];
    if (state.mutated && !state.ponytailReviewPassed) blockers.push('run official /skill:ponytail-review and record PASS');
    if (state.mutated && state.route === 'direct_verify' && !state.verificationPassed) blockers.push('run a successful non-mutating specrail_verify');
    if (!blockers.length) {
      persist(ctx, { ...state, completionBlocked: false, enforcementFollowUps: 0 });
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
    label: 'SpecRail Ponytail Attestation',
    description: 'Attest the official Pi Ponytail session mode before mutation, or start the required official post-mutation review. SpecRail never bundles or imitates Ponytail.',
    promptSnippet: 'Use action=load before mutation and action=review after the final mutation.',
    executionMode: 'sequential',
    parameters: Type.Object({ action: Type.String({ minLength: 1, maxLength: 16 }) }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const action = String(params.action || '').trim().toLowerCase();
      if (action !== 'load' && action !== 'review') throw new Error('specrail_ponytail action must be load or review');
      const state = getState(ctx);
      if (!state.route) throw new Error('PROCESS_ROUTE_REQUIRED: choose a process route before Ponytail attestation.');
      const mode = qualifyingPonytailMode(ctx);
      if (!mode) throw new Error(`PONYTAIL_REQUIRED: ${PONYTAIL_PROVIDER} must be active in full mode. Run /ponytail full and retry; SpecRail will not install or imitate it.`);
      if (action === 'review' && !state.mutated) throw new Error('PONYTAIL_REVIEW_NOT_READY: no successful production-code mutation has been observed.');
      if (action === 'load') {
        const next = persist(ctx, { ...state, ponytailAttested: true, ponytailMode: mode });
        return {
          content: [{ type: 'text', text: `${PRECEDENCE_NOTICE}\n\nOfficial Pi Ponytail host state attested: ${mode}.` }],
          details: { action, provider: PONYTAIL_PROVIDER, source: 'pi-session:ponytail-mode', mode, state: next },
        };
      }
      const reviewFingerprint = await repositoryFingerprint(pi, ctx, signal);
      const next = persist(ctx, {
        ...state,
        ponytailReviewStarted: true,
        ponytailReviewPassed: false,
        ponytailReviewSummary: '',
        ponytailReviewFingerprint: reviewFingerprint,
        enforcementFollowUps: 0,
      });
      return {
        content: [{ type: 'text', text: 'Run the official /skill:ponytail-review now. It must review the current diff only for unnecessary complexity. Then record its actual outcome with specrail_ponytail_review_result.' }],
        details: { action, provider: PONYTAIL_PROVIDER, source: 'official-host-skill', mode: 'review', reviewFingerprint, state: next },
      };
    },
  });

  pi.registerTool({
    name: 'specrail_decision_evidence',
    label: 'SpecRail Decision Evidence',
    description: 'Resolve material-decision provenance only from runtime-observed user input, exact repository contract text, or trusted deterministic tool output.',
    promptSnippet: 'Use before specrail_mutation_gate for each resolved material decision. Arbitrary source/ref assertions are never trusted.',
    executionMode: 'sequential',
    parameters: Type.Object({
      id: Type.String({ minLength: 1, maxLength: 160 }),
      source: Type.String({ minLength: 1, maxLength: 64 }),
      ref: Type.Optional(Type.String({ maxLength: 1000 })),
      quote: Type.Optional(Type.String({ maxLength: 4000 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const id = String(params.id || '').trim();
      const source = String(params.source || '').trim();
      if (!ALLOWED_DECISION_SOURCES.has(source)) throw new Error('DECISION_EVIDENCE_SOURCE_INVALID');
      const state = getState(ctx);
      if (source === 'active_user') {
        const existing = state.trustedDecisionEvidence[id];
        if (!existing || existing.source !== 'active_user') throw new Error(`DECISION_EVIDENCE_NOT_FOUND: no runtime-observed user answer exists for ${id}.`);
        return { content: [{ type: 'text', text: JSON.stringify(existing) }], details: { id, ...existing } };
      }
      const quote = String(params.quote || '').trim();
      const ref = String(params.ref || '').trim();
      if (quote.length < 2 || !ref) throw new Error('DECISION_EVIDENCE_REQUIRED: exact ref and quote are required.');
      let material;
      if (source === 'repository_contract') {
        const file = safeRepositoryFile(ctx, ref);
        const text = readFileSync(file, 'utf8');
        if (!text.includes(quote)) throw new Error('DECISION_EVIDENCE_MISMATCH: quote is not present in the referenced repository contract.');
        material = `${file}:${createHash('sha256').update(quote).digest('hex')}`;
      } else {
        const observed = trustedToolResults.get(`${keyFor(ctx)}:${ref}`);
        const allowedTools = TRUSTED_TOOL_EVIDENCE.get(source);
        if (!observed || !allowedTools?.has(observed.toolName)) throw new Error('DECISION_EVIDENCE_UNTRUSTED_TOOL');
        if (!observed.text.includes(quote)) throw new Error('DECISION_EVIDENCE_MISMATCH: quote is not present in the trusted tool result.');
        material = `${observed.toolName}:${ref}:${createHash('sha256').update(quote).digest('hex')}`;
      }
      const trustedRef = evidenceRef(keyFor(ctx), id, source, material);
      const evidence = { source, ref: trustedRef, quoteHash: createHash('sha256').update(quote).digest('hex'), observedAt: new Date().toISOString() };
      const trustedDecisionEvidence = { ...state.trustedDecisionEvidence, [id]: evidence };
      const next = persist(ctx, { ...state, trustedDecisionEvidence });
      return { content: [{ type: 'text', text: JSON.stringify({ id, ...evidence }) }], details: { id, ...evidence, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_ponytail_review_result',
    label: 'SpecRail Ponytail Review Result',
    description: 'Record the actual outcome of the official Ponytail review; starting the review alone never satisfies completion.',
    promptSnippet: 'Record PASS only after the official /skill:ponytail-review ran and found no unresolved simplification finding.',
    executionMode: 'sequential',
    parameters: Type.Object({
      status: Type.String({ minLength: 4, maxLength: 8 }),
      summary: Type.String({ minLength: 8, maxLength: 1000 }),
      checks: Type.Array(Type.String({ minLength: 2, maxLength: 300 }), { minItems: 1, maxItems: 12 }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const state = getState(ctx);
      if (!state.mutated || !state.ponytailReviewStarted || !state.ponytailReviewFingerprint) throw new Error('PONYTAIL_REVIEW_REQUIRED: start and perform the official review before recording its result.');
      if (!qualifyingPonytailMode(ctx)) throw new Error('PONYTAIL_REQUIRED: Ponytail is no longer in full mode.');
      const status = String(params.status || '').trim().toLowerCase();
      if (status !== 'pass') throw new Error(`PONYTAIL_REVIEW_FAILED: ${String(params.summary || '').trim()}`);
      const currentFingerprint = await repositoryFingerprint(pi, ctx, signal);
      if (currentFingerprint !== state.ponytailReviewFingerprint) throw new Error('PONYTAIL_REVIEW_STALE: repository content changed after the review snapshot was started.');
      const next = persist(ctx, { ...state, ponytailReviewPassed: true, ponytailReviewSummary: String(params.summary).trim(), completionBlocked: false, enforcementFollowUps: 0 });
      return { content: [{ type: 'text', text: JSON.stringify({ passed: true, checks: params.checks.length, repositoryFingerprint: currentFingerprint }) }], details: { passed: true, repositoryFingerprint: currentFingerprint, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_mutation_gate',
    label: 'SpecRail Mutation Gate',
    description: 'Fail closed before production-code mutation unless route, official Ponytail host mode, and an explicit audited material-uncertainty assessment are valid.',
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
      const mode = qualifyingPonytailMode(ctx);
      if (!state.ponytailAttested || !mode) throw new Error('PONYTAIL_REQUIRED: attest official Pi Ponytail in full mode before mutation.');
      if (params.reviewed !== true) throw new Error('NO_ASSUMPTION_REVIEW_REQUIRED: material uncertainty review must be explicit.');
      const decisions = Array.isArray(params.decisions) ? params.decisions : [];
      const reason = String(params.noMaterialDecisionsReason || '').trim();
      if (decisions.length === 0 && reason.length < 8) throw new Error('NO_ASSUMPTION_AUDIT_REQUIRED: empty decisions require a concrete reason why no material decision exists.');
      const blockers = decisionBlockers(decisions, state.trustedDecisionEvidence);
      if (blockers.length) throw new Error(`UNRESOLVED_MATERIAL_DECISION: ${blockers.join('; ')}`);
      const next = persist(ctx, { ...state, ponytailMode: mode, materialDecisionsCleared: true, mutationAuthorized: true, completionBlocked: false });
      return { content: [{ type: 'text', text: JSON.stringify({ allowed: true, route: next.route, assessed: decisions.length, ponytail: mode }) }], details: { allowed: true, state: next } };
    },
  });

  pi.registerTool({
    name: 'specrail_verify',
    label: 'SpecRail Direct Verify',
    description: 'Execute one strictly read-only validation process for Direct + Verify and prove repository content remained unchanged.',
    promptSnippet: 'Required after final mutation on Direct + Verify. Only allowlisted read-only verifier invocations are accepted.',
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
      if (!verificationCommandAllowed(params.command, args)) throw new Error('VERIFY_COMMAND_UNSAFE: use an allowlisted read-only verifier invocation.');
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
export { PONYTAIL_MODE_TYPE, PONYTAIL_PROVIDER, STATE_TYPE, bashMayMutate, decisionBlockers, excludedFingerprintPath, explicitRoute, isMutationCall, ponytailModeFromEntries, repositoryFingerprint, routeFromToolResult, verificationCommandAllowed };
