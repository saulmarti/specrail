import { createHash } from 'node:crypto';
import type { NativeInteraction } from './types.js';
import { structuredQuestionInteraction } from './structured-questions.js';

export type ProcessRoute = 'specrail' | 'direct' | 'direct_verify';
export type ProcessRouteSource = 'native-choice' | 'explicit-prefix';

export interface ExplicitProcessRoute {
  route: ProcessRoute;
  source: 'explicit-prefix';
  workflowMode?: 'fast';
}

export interface ProcessRouteDecision {
  route: ProcessRoute;
  source: ProcessRouteSource;
  requestDigest: string;
  sessionId: string | null;
  selectedAt: string;
}

const SPEC_FAST = /^\s*specrail\s+fast\s*:/iu;
const DIRECT = /^\s*(?:sin|no)\s+specrail\s*:/iu;
const DIRECT_VERIFY = /^\s*(?:direct(?:o)?\s*\+\s*verif(?:y|icar)|direct\s*\+\s*verify)\s*:/iu;
const TASK_CONTINUATION = /\b(?:continue|resume|retoma|contin[uú]a)\s+(TASK-\d{4,})\b/iu;

export function processRequestDigest(request: string): string {
  return createHash('sha256').update(String(request ?? '').trim()).digest('hex');
}

export function explicitProcessRoute(request: string): ExplicitProcessRoute | null {
  const text = String(request ?? '');
  if (SPEC_FAST.test(text)) return { route: 'specrail', source: 'explicit-prefix', workflowMode: 'fast' };
  if (DIRECT_VERIFY.test(text)) return { route: 'direct_verify', source: 'explicit-prefix' };
  if (DIRECT.test(text)) return { route: 'direct', source: 'explicit-prefix' };
  return null;
}

export function isExplicitTaskContinuation(request: string): boolean {
  return TASK_CONTINUATION.test(String(request ?? ''));
}

export function processRouteInteraction(recommendation?: ProcessRoute | null): NativeInteraction {
  const options = [
    { label: 'SpecRail', description: 'Proceso gobernado, trazable y con gates.', recommended: recommendation === 'specrail' },
    { label: 'Directo', description: 'Ejecutar el prompt sin workflow SpecRail.', recommended: recommendation === 'direct' },
    { label: 'Directo + verificar', description: 'Ejecutar directo y validar el resultado al terminar.', recommended: recommendation === 'direct_verify' }
  ];
  return structuredQuestionInteraction([{
    id: 'process-route',
    header: 'Ruta de trabajo',
    question: '¿Cómo quieres hacer esta tarea?',
    options,
    isOther: true
  }]);
}

export function processRouteFromAnswer(answer: string): ProcessRoute | null {
  const normalized = String(answer ?? '').trim().toLocaleLowerCase('es');
  if (normalized === 'specrail') return 'specrail';
  if (normalized === 'directo' || normalized === 'direct') return 'direct';
  if (normalized === 'directo + verificar' || normalized === 'direct + verify' || normalized === 'direct + verificar') return 'direct_verify';
  return null;
}

export function recordProcessRouteDecision(input: {
  request: string;
  route: ProcessRoute;
  source: ProcessRouteSource;
  sessionId?: string | null;
}): ProcessRouteDecision {
  return {
    route: input.route,
    source: input.source,
    requestDigest: processRequestDigest(input.request),
    sessionId: input.sessionId ? String(input.sessionId) : null,
    selectedAt: new Date().toISOString()
  };
}
