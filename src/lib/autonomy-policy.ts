import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadProjectConfig } from './project.js';

export type AutonomyLevel = 'guided' | 'autonomous' | 'headless';
export type AutonomousDeliveryPolicy = 'ask' | 'merge-local';

export interface AutonomyPolicy {
  level: AutonomyLevel;
  delivery: AutonomousDeliveryPolicy;
  description: string;
}

const DESCRIPTIONS: Record<AutonomyLevel,string> = {
  guided: 'Review specification, plan/result gates, and delivery with the user.',
  autonomous: 'Advance mechanically safe gates automatically; interrupt only for human judgment or an external delivery decision.',
  headless: 'Advance mechanically safe gates automatically and stop instead of asking when human judgment is required.'
};

function assertLevel(value: string): AutonomyLevel {
  if (!['guided','autonomous','headless'].includes(value)) throw new Error(`Invalid autonomy level: ${value}`);
  return value as AutonomyLevel;
}
function assertDelivery(value: string): AutonomousDeliveryPolicy {
  if (!['ask','merge-local'].includes(value)) throw new Error(`Invalid autonomous delivery policy: ${value}`);
  return value as AutonomousDeliveryPolicy;
}

export function autonomyPolicy(root: string): AutonomyPolicy {
  const config = loadProjectConfig(root);
  const raw = config.autonomy && typeof config.autonomy === 'object' && !Array.isArray(config.autonomy) ? config.autonomy as Record<string,unknown> : {};
  const level = assertLevel(typeof raw.level === 'string' ? raw.level : 'guided');
  const delivery = assertDelivery(typeof raw.delivery === 'string' ? raw.delivery : 'ask');
  return { level, delivery, description: DESCRIPTIONS[level] };
}

export function setAutonomyPolicy(root: string, levelInput: string, deliveryInput?: string): AutonomyPolicy {
  const level = assertLevel(levelInput);
  const current = loadProjectConfig(root);
  const existing = current.autonomy && typeof current.autonomy === 'object' && !Array.isArray(current.autonomy) ? current.autonomy as Record<string,unknown> : {};
  const delivery = deliveryInput === undefined ? assertDelivery(typeof existing.delivery === 'string' ? existing.delivery : 'ask') : assertDelivery(deliveryInput);
  const configPath = path.join(path.resolve(root), '.ai', 'config.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string,unknown>;
  raw.autonomy = { ...existing, level, delivery };
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
  return { level, delivery, description: DESCRIPTIONS[level] };
}
