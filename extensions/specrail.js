import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';

const PI_ACTIVATION_MARKER = 'AI-FLOW:PI-BEGIN';
const DELIVERY_REQUEST = /\b(?:create|change|modify|fix|repair|redesign|implement|execute|continue|resume|review|validate|finish|refactor|build|add|remove|update|crea|crear|cambia|cambiar|modifica|modificar|corrige|corregir|arregla|arreglar|rediseña|rediseñar|implementa|implementar|ejecuta|ejecutar|continúa|continuar|retoma|retomar|revisa|revisar|valida|validar|termina|terminar|finaliza|finalizar|refactoriza|refactorizar|añade|añadir|agrega|agregar|elimina|eliminar|actualiza|actualizar)\b/iu;
const TASK_CONTINUATION = /\bTASK-\d{4,}\b/iu;
const BYPASS = /^\s*(?:sin|no)\s+specrail\s*:/iu;
const FAST = /^\s*specrail\s+fast\s*:/iu;
const EXTENSION_PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANAGED_PACKAGE_ROOT = path.join(path.resolve(process.env.AI_FLOW_HOME || os.homedir()), '.ai-flow');
const PACKAGE_ROOT = existsSync(path.join(EXTENSION_PACKAGE_ROOT, 'scripts', 'specrail-fast.sh')) ? EXTENSION_PACKAGE_ROOT : MANAGED_PACKAGE_ROOT;
const DISPATCHER = path.join(PACKAGE_ROOT, 'scripts', 'specrail-fast.sh');
const SPEC_RAIL_SKILLS = new Set(['ai-flow','ai-flow-multi-agent','ai-flow-product-owner','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-target-audience','ai-flow-final-customer']);

function execFailure(label, result, stdout, stderr) {
  if (!result.killed && result.code === 0) return;
  const reason = stderr.trim() || stdout.trim() || (result.killed ? `${label} was killed` : `${label} exited with code ${String(result.code)}`);
  const error = new Error(reason);
  error.cause = { code: result.code, killed: Boolean(result.killed), stdout, stderr };
  throw error;
}

const PI_TURN_INSTRUCTIONS = [
  'SpecRail Pi adapter is active for this repository-delivery turn.',
  'Before mutating delivery state, call `specrail_skill` with exact name `ai-flow` and follow that packaged orchestrator contract. This makes native and managed Pi installs independent of filesystem skill discovery. Read-only explanation/research stays outside SpecRail, and `Sin SpecRail:` / `No SpecRail:` is a total bypass.',
  'On Pi, invoke SpecRail through the `specrail_cli` tool instead of assuming a global `specrail` executable. Pass argv as an array without a shell command string. When deterministic routing recommends a SpecRail specialist, load its packaged contract through `specrail_skill` rather than assuming a `.agents/skills` path.',
  'For structural repository context on Pi, use `specrail_codegraph`; it invokes CodeGraph `explore`, the documented CLI equivalent of `codegraph_explore`, without requiring Pi MCP configuration. Keep queries focused and trust returned graph/source unless CodeGraph reports staleness.',
  'Call `specrail_host_context` when a SpecRail command needs `--session`; use its exact Pi sessionId and never invent one.',
  'When SpecRail returns `interaction.tool=request_user_input`, call the Pi `request_user_input` tool with the exact questions/options instead of printing a multiple-choice list.',
  'Pi owns model/thinking selection. SpecRail must never change it. A fresh-session boundary uses `/specrail-handoff TASK-####` (or `/new` followed by `Continue TASK-####`) instead of any Codex-only deep link.',
  'Codex Visualize is optional and host-specific. On Pi, use canonical inline evidence plus the Review Cockpit/openUrl fallback unless a compatible visualization capability is actually discovered.',
  'Do not attest Pi subagent or parallel capability merely because extensions can spawn processes; keep serial fallback until the current host capability is explicitly and truthfully attested.'
].join(' ');

function shouldActivate(prompt) {
  const text = String(prompt || '');
  if (!text.trim() || BYPASS.test(text)) return false;
  return FAST.test(text) || TASK_CONTINUATION.test(text) || DELIVERY_REQUEST.test(text);
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
    name: 'specrail_cli',
    label: 'SpecRail CLI',
    description: 'Run the deterministic SpecRail CLI bundled with this Pi package in the current repository. Arguments are passed directly; no shell command string is evaluated.',
    promptSnippet: 'Use specrail_cli for all SpecRail commands on Pi so the Pi package works without a global SpecRail executable.',
    promptGuidelines: [
      'Pass only the SpecRail argv tokens that would follow the `specrail` command, for example ["next", "TASK-0001", "--session", "..."] .',
      'Do not wrap arguments in a shell command or use this tool for non-SpecRail executables.'
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      args: Type.Array(Type.String(), { minItems: 1, maxItems: 128 }),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 }))
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await pi.exec('env', [`SPEC_RAIL_HOST=pi`, `SPEC_RAIL_PACKAGE_ROOT=${PACKAGE_ROOT}`, DISPATCHER, ...params.args], {
        cwd: ctx.cwd,
        signal,
        timeout: params.timeoutMs ?? 120000
      });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      execFailure('SpecRail', result, stdout, stderr);
      const summary = stdout.trim() || JSON.stringify({ code: result.code, killed: false });
      return {
        content: [{ type: 'text', text: summary }],
        details: {
          host: 'pi',
          argv: params.args,
          code: result.code,
          killed: Boolean(result.killed),
          stdout,
          stderr
        }
      };
    }
  });


  pi.registerTool({
    name: 'specrail_skill',
    label: 'SpecRail Skill',
    description: 'Load one packaged SpecRail specialist contract by exact skill name. This is the Pi-native equivalent of reading the managed .agents/skills copy.',
    promptSnippet: 'Use specrail_skill when SpecRail next recommends a specialist so native Pi package installs do not depend on Codex/global skill paths.',
    promptGuidelines: [
      'Pass only the exact recommended SpecRail skill name returned by deterministic routing.',
      'Do not use this tool to read arbitrary files or non-SpecRail skills.'
    ],
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
    promptGuidelines: [
      'Ask one focused structural question per call. Name the relevant file, symbol, flow, or feature when known.',
      'Treat returned verbatim source, call paths, and blast radius as already inspected; do not repeat broad grep/read discovery unless CodeGraph reports missing/stale data or a concrete source detail still needs verification.'
    ],
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 4000 }),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 }))
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const command = process.env.AI_FLOW_CODEGRAPH_COMMAND || 'codegraph';
      const result = await pi.exec(command, ['explore', params.query], {
        cwd: ctx.cwd,
        signal,
        timeout: params.timeoutMs ?? 120000
      });
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      execFailure('CodeGraph', result, stdout, stderr);
      const text = stdout.trim() || JSON.stringify({ code: result.code, killed: false });
      return {
        content: [{ type: 'text', text }],
        details: {
          host: 'pi',
          transport: 'codegraph-cli-explore',
          command,
          code: result.code,
          killed: Boolean(result.killed),
          stdout,
          stderr
        }
      };
    }
  });

  pi.registerTool({
    name: 'specrail_host_context',
    label: 'SpecRail Host Context',
    description: 'Return trusted Pi host/session context for SpecRail session-bound gates and phase ownership.',
    promptSnippet: 'Get the real Pi session ID before invoking SpecRail commands that require --session.',
    promptGuidelines: [
      'Use specrail_host_context for SpecRail --session values; never fabricate or reuse a session ID from another Pi session.'
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const details = {
        host: 'pi',
        sessionId,
        mode: ctx.mode,
        hasUI: ctx.hasUI,
        cwd: ctx.cwd,
        modelSelection: 'host-owned',
        freshSessionCommand: '/specrail-handoff TASK-####',
        subagents: 'unattested',
        visualization: 'discover-or-fallback'
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(details) }],
        details
      };
    }
  });

  pi.registerTool({
    name: 'request_user_input',
    label: 'SpecRail User Input',
    description: 'Present an exact SpecRail human decision through Pi native UI and return the selected labels without deciding for the user.',
    promptSnippet: 'Present SpecRail approval, ambiguity, scope, and delivery questions with Pi native UI.',
    promptGuidelines: [
      'Use request_user_input only for the exact questions returned by a SpecRail interaction with tool=request_user_input; preserve question IDs, labels, and option meaning.'
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        id: Type.String(),
        header: Type.Optional(Type.String()),
        question: Type.String(),
        options: Type.Array(Type.Object({
          label: Type.String(),
          description: Type.Optional(Type.String())
        }), { minItems: 1 }),
        isOther: Type.Optional(Type.Boolean())
      }), { minItems: 1, maxItems: 8 })
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
        if (selected === undefined) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ cancelled: true, answers }) }],
            details: { cancelled: true, answers }
          };
        }
        if (question.isOther && selected === otherLabel) {
          const value = await ctx.ui.input(question.question, 'Type your answer');
          if (value === undefined) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ cancelled: true, answers }) }],
              details: { cancelled: true, answers }
            };
          }
          answers.push({ id: question.id, label: 'Other', value });
          continue;
        }
        const index = options.indexOf(selected);
        const option = question.options[index];
        if (!option) throw new Error(`Pi returned an unknown selection for SpecRail question ${question.id}`);
        answers.push({ id: question.id, label: option.label });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ cancelled: false, answers }) }],
        details: { cancelled: false, answers }
      };
    }
  });

  pi.registerCommand('specrail-handoff', {
    description: 'Start a fresh Pi session and continue a SpecRail TASK-#### boundary there.',
    handler: async (args, ctx) => {
      const match = String(args || '').match(/\bTASK-\d{4,}\b/iu);
      if (!match) {
        ctx.ui.notify('Usage: /specrail-handoff TASK-####', 'error');
        return;
      }
      const taskId = match[0].toUpperCase();
      const parentSession = ctx.sessionManager.getSessionFile();
      const result = await ctx.newSession({
        ...(parentSession ? { parentSession } : {}),
        withSession: async (freshCtx) => {
          await freshCtx.sendUserMessage(`Continue ${taskId}`);
        }
      });
      if (result.cancelled) ctx.ui.notify(`Fresh-session handoff for ${taskId} was cancelled.`, 'warning');
    }
  });
}

export { PI_TURN_INSTRUCTIONS, shouldActivate };
