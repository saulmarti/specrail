import { createHash } from 'node:crypto';
import { getSection } from './task.js';
import type { TaskDocument } from './types.js';

export function qaMissionText(task: TaskDocument): string {
  return getSection(task.body,'QA Mission').trim();
}
export function qaMissionHash(task: TaskDocument): string {
  return createHash('sha256').update(qaMissionText(task)).digest('hex');
}
export function validateQAMission(task: TaskDocument): string[] {
  const text=qaMissionText(task),errors:string[]=[];
  if(!text) return ['QA Mission is required'];
  for(const label of ['Persona','Starting point','Goal','Allowed interface','Success','Failure']) if(!new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${label}\\s*:`, 'i').test(text)) errors.push(`QA Mission must define ${label}`);
  if(text.length<120) errors.push('QA Mission is too short to be executable');
  return errors;
}
