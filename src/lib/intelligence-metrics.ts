export type UsageOwner = 'brain'|'worker';

export interface IntelligenceUsageRecord {
  source: 'host-reported';
  owner: UsageOwner;
  phase: string;
  actor: string;
  model: string;
  modelAttested?: boolean;
  modelAttestation?: string;
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
  brainTokens: number;
  workerTokens: number;
  brainTokenShare: number;
  workerTokenShare: number;
  brainCalls: number;
  workerCalls: number;
  workerAttestationCoverage: number;
  models: string[];
  byPhase: Record<string, { calls: number; totalTokens: number; brainTokens: number; workerTokens: number }>;
}

function count(value: unknown, label: string): number {
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||!Number.isInteger(number))throw new Error(`${label} must be a non-negative integer`);
  return number;
}

export function validateIntelligenceUsage(record: IntelligenceUsageRecord): IntelligenceUsageRecord {
  if(record.source!=='host-reported')throw new Error('Brain/Workers accepts host-reported token usage only');
  if(!['brain','worker'].includes(record.owner))throw new Error(`Unknown usage owner: ${String(record.owner)}`);
  const inputTokens=count(record.inputTokens,'inputTokens'),cachedInputTokens=count(record.cachedInputTokens,'cachedInputTokens'),outputTokens=count(record.outputTokens,'outputTokens'),reasoningTokens=count(record.reasoningTokens??0,'reasoningTokens');
  if(cachedInputTokens>inputTokens)throw new Error('cached input tokens cannot exceed input tokens');
  const model=String(record.model||'').trim();if(!model)throw new Error('usage model is required');
  if(record.owner==='worker'&&record.modelAttested!==true)throw new Error('worker token usage requires verified model attestation');
  return{...record,phase:String(record.phase||'unknown').trim()||'unknown',actor:String(record.actor||'unknown').trim()||'unknown',model,inputTokens,cachedInputTokens,outputTokens,reasoningTokens};
}

/** Cached input is a subset of input and reasoning is diagnostic output detail,
 * so neither is added a second time to totalTokens. Worker usage is accepted
 * only when the cheaper-model selection is attested by the isolated worker run.
 */
export function summarizeIntelligenceUsage(records:readonly IntelligenceUsageRecord[]):IntelligenceUsageSummary{
  const valid=records.map(validateIntelligenceUsage);let totalTokens=0,uncachedInputTokens=0,cachedInputTokens=0,outputTokens=0,reasoningTokens=0,brainTokens=0,workerTokens=0,brainCalls=0,workerCalls=0,attestedWorkers=0;const models=new Set<string>();const byPhase:IntelligenceUsageSummary['byPhase']={};
  for(const record of valid){const callTokens=record.inputTokens+record.outputTokens;totalTokens+=callTokens;uncachedInputTokens+=record.inputTokens-record.cachedInputTokens;cachedInputTokens+=record.cachedInputTokens;outputTokens+=record.outputTokens;reasoningTokens+=record.reasoningTokens??0;models.add(record.model);if(record.owner==='brain'){brainTokens+=callTokens;brainCalls++;}else{workerTokens+=callTokens;workerCalls++;if(record.modelAttested)attestedWorkers++;}const phase=record.phase||'unknown',current=byPhase[phase]??{calls:0,totalTokens:0,brainTokens:0,workerTokens:0};current.calls++;current.totalTokens+=callTokens;if(record.owner==='brain')current.brainTokens+=callTokens;else current.workerTokens+=callTokens;byPhase[phase]=current;}
  return{calls:valid.length,totalTokens,uncachedInputTokens,cachedInputTokens,outputTokens,reasoningTokens,brainTokens,workerTokens,brainTokenShare:totalTokens?brainTokens/totalTokens:0,workerTokenShare:totalTokens?workerTokens/totalTokens:0,brainCalls,workerCalls,workerAttestationCoverage:workerCalls?attestedWorkers/workerCalls:1,models:[...models].sort(),byPhase};
}
