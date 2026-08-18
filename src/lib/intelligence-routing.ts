import type { TaskDocument } from './types.js';
import { brainWorkerRecommendation, type WorkRoutingInput } from './brain-workers.js';

export const INTELLIGENCE_TIERS = ['none', 'brain', 'worker'] as const;
export type IntelligenceTier = typeof INTELLIGENCE_TIERS[number];
export type IntelligenceRoutingInput = WorkRoutingInput;

export interface IntelligenceRecommendation {
  schemaVersion: 2;
  tier: IntelligenceTier;
  orchestration: 'brain-workers';
  reason: string;
  controlProfile: string;
  hostOwnsBrainModel: true;
  brain: ReturnType<typeof brainWorkerRecommendation>['brain'];
  worker: ReturnType<typeof brainWorkerRecommendation>['worker'];
  measurement: {
    requireWorkerModelAttestation: true;
    forbidSilentBrainFallback: true;
    trackBrainWorkerUsageSeparately: true;
  };
}

/** Compatibility entry point consumed by `next` and existing host adapters.
 * The old executor/frontier recommendation has intentionally been replaced by
 * Brain/Workers: the current chat model keeps governed decision authority while
 * heavy work runs in an explicitly model-pinned isolated worker.
 */
export function intelligenceRecommendation(task: TaskDocument, input: IntelligenceRoutingInput): IntelligenceRecommendation {
  const recommendation=brainWorkerRecommendation(task,input);
  return {
    schemaVersion:2,
    tier:recommendation.owner,
    orchestration:'brain-workers',
    reason:recommendation.reason,
    controlProfile:recommendation.controlProfile,
    hostOwnsBrainModel:true,
    brain:recommendation.brain,
    worker:recommendation.worker,
    measurement:{
      requireWorkerModelAttestation:true,
      forbidSilentBrainFallback:true,
      trackBrainWorkerUsageSeparately:true
    }
  };
}
