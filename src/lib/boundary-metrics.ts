import { readFileSync } from 'node:fs';
import { findTask, loadTask } from './task.js';
import { writeRuntimeHandoff } from './phase-handoff.js';

export interface BoundaryCostScenario {
  historyTokens: number;
  implementationTurns: number;
  capsuleTokens: number;
  sameChatCarryoverTokens: number;
  freshChatCarryoverTokens: number;
  savedInputTokens: number;
  savingsPercent: number;
  uncachedInputCostSavings: number | null;
}

/**
 * Host tokenization is not exposed to SpecRail. This deliberately uses a
 * transparent UTF-8 chars/4 heuristic so the estimate is model-independent.
 */
export function approximateTokens(text: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

function scenario(capsuleTokens: number, historyTokens: number, implementationTurns: number, inputCostPerMillion?: number | null): BoundaryCostScenario {
  const turns = Math.max(1, Math.floor(implementationTurns));
  const history = Math.max(0, Math.floor(historyTokens));
  const same = history * turns;
  const fresh = capsuleTokens * turns;
  const saved = Math.max(0, same - fresh);
  return {
    historyTokens: history,
    implementationTurns: turns,
    capsuleTokens,
    sameChatCarryoverTokens: same,
    freshChatCarryoverTokens: fresh,
    savedInputTokens: saved,
    savingsPercent: same > 0 ? Number(((saved / same) * 100).toFixed(1)) : 0,
    uncachedInputCostSavings: inputCostPerMillion == null ? null : Number(((saved / 1_000_000) * inputCostPerMillion).toFixed(6))
  };
}

export function estimatePhaseBoundary(
  root: string,
  id: string,
  options: { historyTokens?: number | null; implementationTurns?: number | null; inputCostPerMillion?: number | null } = {}
) {
  const task = loadTask(findTask(root, id));
  const role = task.meta.phase === 'builder' ? 'implementer' : task.meta.phase === 'technical-reviewer' ? 'reviewer' : null;
  if (!role) throw new Error('Boundary token estimate requires builder or technical-reviewer phase');
  const handoff = writeRuntimeHandoff(root, id, role);
  const capsule = readFileSync(handoff.path, 'utf8');
  const capsuleTokens = approximateTokens(capsule);
  const turns = Number(options.implementationTurns || 6);
  const cost = options.inputCostPerMillion == null ? null : Number(options.inputCostPerMillion);
  const histories = options.historyTokens == null ? [10_000, 25_000, 50_000] : [Number(options.historyTokens)];
  return {
    taskId: id,
    role,
    phase: role === 'implementer' ? 'implementation' : 'review',
    tokenMethod: 'utf8-chars-divided-by-4',
    capsuleTokens,
    implementationTurns: turns,
    scenarios: histories.map(history => scenario(capsuleTokens, history, turns, cost)),
    sameChat: {
      tokenSavings: 'none-from-history',
      benefit: 'logical context reset and clearer execution authority only'
    },
    freshChat: {
      tokenSavings: 'removes prior-phase conversation from repeated implementation input context',
      caveat: 'This is a raw prior-phase carryover heuristic, not host billing telemetry. It assumes the prior phase or capsule remains in each measured turn; actual tokens and billed savings depend on Codex compaction/summarization, context-window behavior, prompt caching, and the selected model/provider.'
    }
  };
}
