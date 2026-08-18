import type { IntelligenceTier } from './intelligence-routing.js';

export interface IntelligenceUsageRecord {
  source: 'host-reported';
  tier: Exclude<IntelligenceTier, 'none'>;
  phase: string;
  actor: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
}

export interface IntelligenceUsageSummary {
  calls: number;
  totalTokens: number;
  uncachedInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  executorTokens: number;
  frontierTokens: number;
  frontierTokenShare: number;
  executorCalls: number;
  frontierCalls: number;
  models: string[];
  byPhase: Record<string, { calls: number; totalTokens: number; executorTokens: number; frontierTokens: number }>;
}

function count(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

export function validateIntelligenceUsage(record: IntelligenceUsageRecord): IntelligenceUsageRecord {
  if (record.source !== 'host-reported') throw new Error('Sparse Intelligence accepts host-reported token usage only');
  if (!['executor', 'frontier'].includes(record.tier)) throw new Error(`Unknown intelligence tier: ${String(record.tier)}`);
  const inputTokens = count(record.inputTokens, 'inputTokens');
  const cachedInputTokens = count(record.cachedInputTokens, 'cachedInputTokens');
  const outputTokens = count(record.outputTokens, 'outputTokens');
  const reasoningTokens = count(record.reasoningTokens ?? 0, 'reasoningTokens');
  if (cachedInputTokens > inputTokens) throw new Error('cached input tokens cannot exceed input tokens');
  return {
    ...record,
    phase: String(record.phase || 'unknown').trim() || 'unknown',
    actor: String(record.actor || 'unknown').trim() || 'unknown',
    model: String(record.model || '').trim(),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens
  };
}

/**
 * Mirrors Replay accounting: cached input is a subset of input, and reasoning
 * tokens are reported for diagnosis but are not added again to total tokens.
 */
export function summarizeIntelligenceUsage(records: readonly IntelligenceUsageRecord[]): IntelligenceUsageSummary {
  const valid = records.map(validateIntelligenceUsage);
  let totalTokens = 0;
  let uncachedInputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let executorTokens = 0;
  let frontierTokens = 0;
  let executorCalls = 0;
  let frontierCalls = 0;
  const models = new Set<string>();
  const byPhase: IntelligenceUsageSummary['byPhase'] = {};

  for (const record of valid) {
    const callTokens = record.inputTokens + record.outputTokens;
    totalTokens += callTokens;
    uncachedInputTokens += record.inputTokens - record.cachedInputTokens;
    cachedInputTokens += record.cachedInputTokens;
    outputTokens += record.outputTokens;
    reasoningTokens += record.reasoningTokens ?? 0;
    if (record.model) models.add(record.model);
    if (record.tier === 'frontier') {
      frontierTokens += callTokens;
      frontierCalls++;
    } else {
      executorTokens += callTokens;
      executorCalls++;
    }
    const phase = record.phase || 'unknown';
    const current = byPhase[phase] ?? { calls: 0, totalTokens: 0, executorTokens: 0, frontierTokens: 0 };
    current.calls++;
    current.totalTokens += callTokens;
    if (record.tier === 'frontier') current.frontierTokens += callTokens;
    else current.executorTokens += callTokens;
    byPhase[phase] = current;
  }

  return {
    calls: valid.length,
    totalTokens,
    uncachedInputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    executorTokens,
    frontierTokens,
    frontierTokenShare: totalTokens ? frontierTokens / totalTokens : 0,
    executorCalls,
    frontierCalls,
    models: [...models].sort(),
    byPhase
  };
}
