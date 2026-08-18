import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';

const PI_ACTIVATION_MARKER = 'AI-FLOW:PI-BEGIN';
const DELIVERY_REQUEST = /\b(?:create|change|modify|fix|repair|redesign|implement|execute|continue|resume|review|validate|finish|refactor|build|add|remove|update|crea|crear|cambia|cambiar|modifica|modificar|corrige|corregir|arregla|arreglar|rediseña|rediseñar|implementa|implementar|ejecuta|ejecutar|continúa|continuar|retoma|retomar|revisa|revisar|valida|validar|termina|terminar|finaliza|finalizar|refactoriza|refactorizar|añade|añadir|agrega|agregar|elimina|eliminar|actualiza|actualizar)\b/iu;
const TASK_CONTINUATION = /\b(?:continue|resume|retoma|contin[uú]a)\s+TASK-\d{4,}\b/iu;
const BYPASS = /^\s*(?:sin|no)\s+specrail\s*:/iu;
const FAST = /^\s*specrail\s+fast\s*:/iu;
const DIRECT_VERIFY = /^\s*(?:direct(?:o)?\s*\+\s*verif(?:y|icar)|direct\s*\+\s*verify)\s*:/iu;
const EXTENSION_PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANAGED_PACKAGE_ROOT = path.join(path.resolve(process.env.AI_FLOW_HOME || os.homedir()), '.ai-flow');
const PACKAGE_ROOT = existsSync(path.join(EXTENSION_PACKAGE_ROOT, 'scripts', 'specrail-fast.sh')) ? EXTENSION_PACKAGE_ROOT : MANAGED_PACKAGE_ROOT;
const DISPATCHER = path.join(PACKAGE_ROOT, 'scripts', 'specrail-fast.sh');
const WORKER_LAUNCHER = path.join(PACKAGE_ROOT, 'scripts', 'specrail-worker.mjs');
const SPEC_RAIL_SKILLS = new Set(['ai-flow','ai-flow-multi-agent','ai-flow-product-owner','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-target-audience','ai-flow-final-customer']);
const PROCESS_ROUTE_OPTIONS = [
  { label: 'SpecRail', description: 'Proceso gobernado, trazable y con gates.', route: 'specrail' },
  { label: 'Directo', description: 'Ejecutar el prompt sin workflow SpecRail.', route: 'direct' },
  { label: 'Directo + verificar', description: 'Ejecutar directo y validar el resultado al terminar.', route: 'direct_verify' }
];

function execFailure(label, result, stdout, stderr) {
  if (!result.killed && result.code === 0) return;
  const reason = stderr.trim() || stdout.trim() || (result.killed ? `${label} was killed` : `${label} exited with code ${String(result.code)}`);
  const error = new Error(reason);
  error.cause = { code: result.code, killed: Boolean(result.killed), stdout, stderr };
  throw error;
}

const PI_TURN_INSTRUCTIONS = [
  'SpecRail Pi adapter is active for this repository-delivery turn.',
  'For a NEW delivery work item, choose the process route before any SpecRail task, CodeGraph preflight, evidence state, or workflow mutation. If the prompt has no explicit route prefix and is not an explicit Continue/Resume/Retoma TASK-####, call `specrail_entry_gate` with the exact prompt. SpecRail, Directo, and Directo + verificar are distinct from micro/light/standard/rigorous, Guided/Autonomous/Headless, and Brain/Worker ownership. Never choose a route for the user.',
  '`SpecRail Fast:` is an explicit SpecRail route in fast mode. `Sin SpecRail:` / `No SpecRail:` is an explicit Direct route. `Directo + verificar:` / `Direct + Verify:` is an explicit Direct+Verify route. Direct routes create no SpecRail task/CodeGraph/gate/evidence/learning state.',
  'Only after the user selects SpecRail, call `specrail_skill` with exact name `ai-flow` and follow that packaged orchestrator contract. Read-only explanation/research stays outside the entry gate.',
  'The model selected in the current Pi chat is the Brain and remains selected. After `specrail next`, obey `next.intelligence`: `brain` means this chat owns the governed judgment, `worker` means call `specrail_worker` with the exact task/actor/action/recommendedSkill so the heavy work runs in a separate explicitly model-pinned lower-cost Pi process, and `none` means no model-owned work. Never perform Worker work in Brain merely to avoid delegation and never claim a Worker model without the returned attestation.',
  'For every code-writing route, require the official Ponytail capability in full mode before mutation. Do not imitate Ponytail and claim it is active, and never install third-party code silently. Missing bundled Ponytail is a broken SpecRail installation; repair/reinstall SpecRail rather than installing an unrelated substitute. Security, accessibility, data-loss protection, approved scope, and acceptance/evidence requirements outrank minimalism.',
  'Never fill a material unknown with model confidence. Resolve it from explicit user input, an approved decision, an authoritative repository contract, one unique established repository pattern, or current deterministic tool evidence. If still materially ambiguous, ask using 2–4 choices plus free text. Do not ask about facts the repository already resolves uniquely.',
  'On Pi, invoke SpecRail through the `specrail_cli` tool instead of assuming a global `specrail` executable. Pass argv as an array without a shell command string. When deterministic routing recommends a SpecRail specialist, load its packaged contract through `specrail_skill` rather than assuming a `.agents/skills` path.',
  'For structural repository context on Pi, use `specrail_codegraph`; it invokes CodeGraph `explore`, the documented CLI equivalent of `codegraph_explore`, without requiring Pi MCP configuration. Keep queries focused and trust returned graph/source unless CodeGraph reports staleness.',
  'Call `specrail_host_context` when a Brain-owned SpecRail command needs `--session`; use its exact Pi sessionId and never invent one. Worker processes receive their own isolated Worker session identity.',
  'When SpecRail returns `interaction.tool=request_user_input`, prefer an attested host `ask_user_question` capability when present; otherwise call this adapter`s `request_user_input` with the exact questions/options. Every clarification keeps 2–4 choices and Other/free text. Never print the menu instead.',
  'A fresh-session boundary uses `/specrail-handoff TASK-####` (or `/new` followed by `Continue TASK-####`) instead of any Codex-only deep link. Target Audience keeps its existing fresh-session isolation until Worker session independence is explicitly supported for that role.',
  'Codex Visualize is optional and host-specific. On Pi, use canonical inline evidence unless a compatible visualization capability is actually discovered.',
  'Do not attest generic Pi parallel-subagent capability merely because the Brain/Worker adapter can spawn an isolated process; feature-level concurrency remains separately attested.'
].join(' ');

function processRouteKind(prompt) {
  const text = String(prompt || '');
  if (FAST.test(text)) return { explicit: true, route: 'specrail', workflowMode: 'fast' };
  if (DIRECT_VERIFY.test(text)) return { explicit: true, route: 'direct_verify' };
  if (BYPASS.test(text)) return { explicit: true, route: 'direct' };
  if (TASK_CONTINUATION.test(text)) return { explicit: true, route: 'specrail', continuation: true };
  return { explicit: false, route: null };
}

function shouldActivate(prompt) {
  const text = String(prompt || '');
  if (!text.trim()) return false;
  return FAST.test(text) || BYPASS.test(text) || DIRECT_VERIFY.test(text) || TASK_CONTINUATION.test(text) || DELIVERY_REQUEST.test(text);
}

function hasManagedPiContext(event) {
  const files = event?.systemPromptOptions?.contextFiles;
  if (!Array.isArray(files)) return false;
  return files.some((entry) => {
    if (typeof entry === 'string') return entry.includes(PI_ACTIVATION_MARKER);
    if (!entry || typeof entry !== 'object') return false;
    return String(entry.content || entry.text || '').includes(PI_ACTIVATION_MARKER);
  });
}

function optionText(option, index) {
  const suffix = option.description ? ` — ${option.description}` : '';
  return `${index + 1}. ${option.label}${suffix}`;
}

export default function specrailPiExtension(pi) {
  pi.on('before_agent_start', async (event) => {
    if (!shouldActivate(event.prompt) || hasManagedPiContext(event)) return undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${PI_TURN_INSTRUCTIONS}` };
  });

  pi.registerTool({
    name: 'specrail_entry_gate',
    label: 'SpecRail Process Route',
    description: 'Ask the user which process route to use for a new delivery work item before creating any SpecRail state.',
    promptSnippet: 'Use once at the beginning of a new delivery work item unless an explicit route prefix or TASK continuation already resolves the route.',
    executionMode: 'sequential',
    parameters: Type.Object({ prompt: Type.String({ minLength: 1, maxLength: 20000 }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const explicit = processRouteKind(params.prompt);
      if (explicit.explicit) return { content: [{ type: 'text', text: JSON.stringify(explicit) }], details: explicit };
      if (!ctx.hasUI) throw new Error(`PROCESS_ROUTE_REQUIRED: interactive Pi UI is unavailable in ${ctx.mode}; no process route may be inferred.`);
      const rendered = PROCESS_ROUTE_OPTIONS.map(optionText);
      rendered.push('Other…');
      const selected = await ctx.ui.select('Ruta de trabajo: ¿Cómo quieres hacer esta tarea?', rendered);
      if (selected === undefined) return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, route: null }) }], details: { cancelled: true, route: null } };
      if (selected === 'Other…') {
        const value = await ctx.ui.input('¿Cómo quieres hacer esta tarea?', 'Escribe tu respuesta');
        const details = { cancelled: value === undefined, route: null, freeText: value ?? null, source: 'native-choice' };
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
      }
      const index = rendered.indexOf(selected);
      const route = PROCESS_ROUTE_OPTIONS[index]?.route;
      if (!route) throw new Error('Pi returned an unknown process-route selection');
      const details = { cancelled: false, route, source: 'native-choice' };
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    }
  });

  pi.registerTool({
    name: 'specrail_cli',
    label: 'SpecRail CLI',
    description: 'Run the deterministic SpecRail CLI bundled with this Pi package in the current repository. Arguments are passed directly; no shell command string is evaluated.',
    promptSnippet: 'Use specrail_cli for all SpecRail commands on Pi so the Pi package works without a global SpecRail executable.',
    promptGuidelines: [
      'Pass only the SpecRail argv tokens that would follow the `specrail` command, for example ["next", "TASK-0001", "--session", "..."] .',
      'Do not wrap arguments in a shell command or use this tool for non-SpecRail executables.'
    ],
    executionMode: 'sequential',
    parameters: Type.Object({ args: Type.Array(Type.String(), { minItems: 1, maxItems: 128 }), timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })) }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await pi.exec('env', [`SPEC_RAIL_HOST=pi`, `SPEC_RAIL_PACKAGE_ROOT=${PACKAGE_ROOT}`, DISPATCHER, ...params.args], { cwd: ctx.cwd, signal, timeout: params.timeoutMs ?? 120000 });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      execFailure('SpecRail', result, stdout, stderr);
      const summary = stdout.trim() || JSON.stringify({ code: result.code, killed: false });
      return { content: [{ type: 'text', text: summary }], details: { host: 'pi', argv: params.args, code: result.code, killed: Boolean(result.killed), stdout, stderr } };
    }
  });

  pi.registerTool({
    name: 'specrail_worker',
    label: 'SpecRail Worker',
    description: 'Execute one next.intelligence=worker step in a separate lower-cost model-pinned Pi process while the current chat remains the Brain.',
    promptSnippet: 'Call only when specrail next returns intelligence.tier=worker. Pass the exact task, actor, action, and recommendedSkill from next; do not reinterpret routing.',
    promptGuidelines: [
      'Do not use for intelligence.tier=brain or none.',
      'Worker failure/escalation is returned to the Brain as structured evidence; never rerun the same work in the Brain merely because the Worker failed.',
      'Luna/Terra selection and fallback policy are sealed by SpecRail; do not pass or invent a model name here.'
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      task: Type.String({ minLength: 5, maxLength: 256 }),
      actor: Type.String({ minLength: 1, maxLength: 128 }),
      action: Type.String({ minLength: 1, maxLength: 128 }),
      skill: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 1800000 }))
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!existsSync(WORKER_LAUNCHER)) throw new Error(`Packaged SpecRail Worker launcher is missing: ${WORKER_LAUNCHER}`);
      const args = [WORKER_LAUNCHER, '--task', params.task, '--actor', params.actor, '--action', params.action, '--host', 'pi', '--root', ctx.cwd];
      if (params.skill) args.push('--skill', params.skill);
      const result = await pi.exec(process.execPath, args, { cwd: ctx.cwd, signal, timeout: params.timeoutMs ?? 900000 });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      const summary = stdout.trim() || stderr.trim() || JSON.stringify({ code: result.code, killed: Boolean(result.killed) });
      return { content: [{ type: 'text', text: summary }], details: { host: 'pi', transport: 'specrail-worker', task: params.task, actor: params.actor, action: params.action, skill: params.skill ?? null, code: result.code, killed: Boolean(result.killed), stdout, stderr } };
    }
  });

  pi.registerTool({
    name: 'specrail_skill',
    label: 'SpecRail Skill',
    description: 'Load one packaged SpecRail specialist contract by exact skill name. This is the Pi-native equivalent of reading the managed .agents/skills copy.',
    promptSnippet: 'Use specrail_skill when SpecRail next recommends a specialist so native Pi package installs do not depend on Codex/global skill paths.',
    promptGuidelines: ['Pass only the exact recommended SpecRail skill name returned by deterministic routing.', 'Do not use this tool to read arbitrary files or non-SpecRail skills.'],
    parameters: Type.Object({ name: Type.String({ minLength: 1, maxLength: 128 }) }),
    async execute(_toolCallId, params) {
      const name = String(params.name || '').trim();
      if (!SPEC_RAIL_SKILLS.has(name)) throw new Error(`Unknown packaged SpecRail skill: ${name}`);
      const file = path.join(PACKAGE_ROOT, 'skills', name, 'SKILL.md');
      if (!existsSync(file)) throw new Error(`Packaged SpecRail skill is missing: ${file}`);
      const text = readFileSync(file, 'utf8');
      return { content: [{ type: 'text', text }], details: { host: 'pi', name, file, source: 'packaged-specrail-skill' } };
    }
  });

  pi.registerTool({
    name: 'specrail_codegraph',
    label: 'SpecRail CodeGraph',
    description: 'Get high-signal structural repository context through CodeGraph explore, the CLI equivalent of codegraph_explore. This avoids requiring Pi-specific MCP wiring.',
    promptSnippet: 'Use specrail_codegraph before grep/read loops for architecture, call flow, dependencies, impact, symbols, and targeted repository context.',
    promptGuidelines: ['Ask one focused structural question per call. Name the relevant file, symbol, flow, or feature when known.', 'Treat returned verbatim source, call paths, and blast radius as already inspected; do not repeat broad grep/read discovery unless CodeGraph reports missing/stale data or a concrete source detail still needs verification.'],
    parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 4000 }), timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })) }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const command = process.env.AI_FLOW_CODEGRAPH_COMMAND || 'codegraph';
      const result = await pi.exec(command, ['explore', params.query], { cwd: ctx.cwd, signal, timeout: params.timeoutMs ?? 120000 });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      execFailure('CodeGraph', result, stdout, stderr);
      const text = stdout.trim() || JSON.stringify({ code: result.code, killed: false });
      return { content: [{ type: 'text', text }], details: { host: 'pi', transport: 'codegraph-cli-explore', command, code: result.code, killed: Boolean(result.killed), stdout, stderr } };
    }
  });

  pi.registerTool({
    name: 'specrail_host_context',
    label: 'SpecRail Host Context',
    description: 'Return trusted Pi host/session context for SpecRail session-bound gates and phase ownership.',
    promptSnippet: 'Get the real Pi Brain session ID before invoking SpecRail commands that require --session.',
    promptGuidelines: ['Use specrail_host_context for Brain-owned SpecRail --session values; never fabricate or reuse another session ID. Worker processes receive their own Worker session.'],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const details = { host: 'pi', sessionId, mode: ctx.mode, hasUI: ctx.hasUI, cwd: ctx.cwd, modelSelection: 'host-owned', brainRole: 'selected-chat-model', workerTransport: existsSync(WORKER_LAUNCHER) ? 'specrail_worker' : 'unavailable', freshSessionCommand: '/specrail-handoff TASK-####', subagents: 'unattested', visualization: 'discover-or-fallback', structuredQuestions: 'specrail-native-fallback', ponytail: 'host-capability-required-full' };
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    }
  });

  pi.registerTool({
    name: 'request_user_input',
    label: 'SpecRail User Input',
    description: 'Present an exact SpecRail human decision through Pi native UI and return the selected labels without deciding for the user.',
    promptSnippet: 'Present SpecRail approval, ambiguity, scope, and delivery questions with Pi native UI.',
    promptGuidelines: ['Use request_user_input only for the exact questions returned by a SpecRail interaction with tool=request_user_input; preserve question IDs, labels, and option meaning.'],
    executionMode: 'sequential',
    parameters: Type.Object({
      questions: Type.Array(Type.Object({ id: Type.String(), header: Type.Optional(Type.String()), question: Type.String(), options: Type.Array(Type.Object({ label: Type.String(), description: Type.Optional(Type.String()) }), { minItems: 2, maxItems: 4 }), isOther: Type.Optional(Type.Boolean()) }), { minItems: 1, maxItems: 4 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error(`SpecRail human input requires an interactive Pi UI; current mode is ${ctx.mode}. Headless policy must stop or resolve the gate explicitly.`);
      const answers = [];
      for (const question of params.questions) {
        const options = question.options.map(optionText);
        const otherLabel = 'Other…';
        if (question.isOther) options.push(otherLabel);
        const title = question.header ? `${question.header}: ${question.question}` : question.question;
        const selected = await ctx.ui.select(title, options);
        if (selected === undefined) return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, answers }) }], details: { cancelled: true, answers } };
        if (question.isOther && selected === otherLabel) {
          const value = await ctx.ui.input(question.question, 'Type your answer');
          if (value === undefined) return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, answers }) }], details: { cancelled: true, answers } };
          answers.push({ id: question.id, label: 'Other', value });
          continue;
        }
        const index = options.indexOf(selected);
        const option = question.options[index];
        if (!option) throw new Error(`Pi returned an unknown selection for SpecRail question ${question.id}`);
        answers.push({ id: question.id, label: option.label });
      }
      return { content: [{ type: 'text', text: JSON.stringify({ cancelled: false, answers }) }], details: { cancelled: false, answers } };
    }
  });

  pi.registerCommand('specrail-handoff', {
    description: 'Start a fresh Pi session and continue a SpecRail TASK-#### boundary there.',
    handler: async (args, ctx) => {
      const match = String(args || '').match(/\bTASK-\d{4,}\b/iu);
      if (!match) { ctx.ui.notify('Usage: /specrail-handoff TASK-####', 'error'); return; }
      const taskId = match[0].toUpperCase();
      const parentSession = ctx.sessionManager.getSessionFile();
      const result = await ctx.newSession({ ...(parentSession ? { parentSession } : {}), withSession: async (freshCtx) => { await freshCtx.sendUserMessage(`Continue ${taskId}`); } });
      if (result.cancelled) ctx.ui.notify(`Fresh-session handoff for ${taskId} was cancelled.`, 'warning');
    }
  });
}

export { PI_TURN_INSTRUCTIONS, shouldActivate, processRouteKind, PROCESS_ROUTE_OPTIONS };
