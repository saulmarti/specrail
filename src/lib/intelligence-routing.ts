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
  workerLaunch: null | {
    required: true;
    task: string;
    actor: string;
    action: string;
    recommendedSkill: string | null;
    codex: { command: 'specrail-worker'; args: string[] };
    pi: { tool: 'specrail_worker'; args: { task:string; actor:string; action:string; skill?:string } };
  };
  measurement: {
    requireWorkerModelAttestation: true;
    forbidSilentBrainFallback: true;
    trackBrainWorkerUsageSeparately: true;
  };
}

/** Compatibility entry point consumed by `next` and host adapters.
 * Brain/Workers keeps the current chat model as governed decision authority and
 * emits an exact launch capsule whenever heavy work belongs to a cheaper worker.
 */
export function intelligenceRecommendation(task: TaskDocument, input: IntelligenceRoutingInput): IntelligenceRecommendation {
  const recommendation=brainWorkerRecommendation(task,input);
  const skill=input.recommendedSkill ? String(input.recommendedSkill) : null;
  const common=['--task',task.meta.id,'--actor',input.actor,'--action',input.action];
  if(skill)common.push('--skill',skill);
  const workerLaunch=recommendation.owner==='worker'&&recommendation.worker?{
    required:true as const,
    task:task.meta.id,
    actor:input.actor,
    action:input.action,
    recommendedSkill:skill,
    codex:{command:'specrail-worker' as const,args:[...common,'--host','codex']},
    pi:{tool:'specrail_worker' as const,args:{task:task.meta.id,actor:input.actor,action:input.action,...(skill?{skill}:{})}}
  }:null;
  return {
    schemaVersion:2,
    tier:recommendation.owner,
    orchestration:'brain-workers',
    reason:recommendation.reason,
    controlProfile:recommendation.controlProfile,
    hostOwnsBrainModel:true,
    brain:recommendation.brain,
    worker:recommendation.worker,
    workerLaunch,
    measurement:{
      requireWorkerModelAttestation:true,
      forbidSilentBrainFallback:true,
      trackBrainWorkerUsageSeparately:true
    }
  };
}
