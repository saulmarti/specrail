import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  VisualizationAvailability,
  VisualizationCapabilityRecord,
  VisualizationEvaluatorMode,
  VisualizationOutcome,
  VisualizationPlan,
  VisualizationQuality,
  VisualizationRunRecord,
  VisualizationSource
} from './types.js';

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('A non-empty identifier is required');
  return normalized.slice(0, 120);
}

function runtimeRoot(root: string): string {
  return path.join(path.resolve(root), '.ai', 'runtime');
}

function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; }
  catch { return null; }
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
  }
  return value;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function digestJson(value: unknown): string {
  return sha256(JSON.stringify(sorted(value)));
}

function resolveProjectFile(root: string, file: string): string {
  const project = path.resolve(root);
  const resolved = path.isAbsolute(file) ? path.resolve(file) : path.resolve(project, file);
  if (resolved !== project && !resolved.startsWith(`${project}${path.sep}`)) throw new Error(`Visualization source escapes project root: ${file}`);
  return resolved;
}

export function computeVisualizationSourceDigest(root: string, sources: readonly VisualizationSource[], payload: Record<string, unknown>): string {
  const files = sources.map(source => {
    const resolved = resolveProjectFile(root, source.path);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) return { ...source, currentSha256: null, missing: true };
    return { ...source, currentSha256: sha256(readFileSync(resolved)), missing: false };
  });
  return digestJson({ payload, files });
}

export function visualizationCapabilityPath(root: string, sessionId: string): string {
  return path.join(runtimeRoot(root), 'capabilities', `${safeSegment(sessionId)}.json`);
}

export function visualizationPlanPath(root: string, taskId: string, gate: string, sessionId: string): string {
  return path.join(runtimeRoot(root), 'visualizations', 'plans', `${safeSegment(taskId)}-${safeSegment(gate)}-${safeSegment(sessionId)}.json`);
}

export function visualizationRunPath(root: string, taskId: string, gate: string, sessionId: string): string {
  return path.join(runtimeRoot(root), 'visualizations', 'runs', `${safeSegment(taskId)}-${safeSegment(gate)}-${safeSegment(sessionId)}.json`);
}

export function getVisualizationCapability(root: string, sessionId?: string | null): VisualizationCapabilityRecord {
  const id = sessionId?.trim();
  if (!id) {
    return {
      schemaVersion: 3,
      capability: 'visualize',
      preferredCapabilityName: 'Visualize',
      preferredSkillName: 'visualize',
      skillInvocation: '$visualize',
      sessionId: 'unknown-session',
      availability: 'unknown',
      exactSkillName: null,
      reason: 'No Codex session identifier was supplied, so the current skill catalog has not been checked for $visualize.',
      checkedAt: new Date(0).toISOString()
    };
  }
  const stored = readJson<Record<string, unknown>>(visualizationCapabilityPath(root, id));
  const storedAvailability = stored?.availability;
  if (stored?.schemaVersion === 3 && stored.capability === 'visualize' && (storedAvailability === 'unknown' || storedAvailability === 'available' || storedAvailability === 'unavailable')) {
    return {
      schemaVersion: 3,
      capability: 'visualize',
      preferredCapabilityName: 'Visualize',
      preferredSkillName: 'visualize',
      skillInvocation: '$visualize',
      sessionId: typeof stored.sessionId === 'string' ? stored.sessionId : id,
      availability: storedAvailability,
      exactSkillName: typeof stored.exactSkillName === 'string' ? stored.exactSkillName : null,
      reason: typeof stored.reason === 'string' ? stored.reason : null,
      checkedAt: typeof stored.checkedAt === 'string' ? stored.checkedAt : new Date(0).toISOString()
    };
  }
  if (stored?.capability === 'visualize') {
    return {
      schemaVersion: 3,
      capability: 'visualize',
      preferredCapabilityName: 'Visualize',
      preferredSkillName: 'visualize',
      skillInvocation: '$visualize',
      sessionId: id,
      availability: 'unknown',
      exactSkillName: null,
      reason: 'Legacy Visualize capability data used host-tool discovery. Rediscover the installed Codex skill through the current skill catalog before claiming availability.',
      checkedAt: new Date(0).toISOString()
    };
  }
  return {
    schemaVersion: 3,
    capability: 'visualize',
    preferredCapabilityName: 'Visualize',
    preferredSkillName: 'visualize',
    skillInvocation: '$visualize',
    sessionId: id,
    availability: 'unknown',
    exactSkillName: null,
    reason: 'The current Codex skill catalog has not been checked for the explicit $visualize skill in this session.',
    checkedAt: new Date(0).toISOString()
  };
}

export interface RecordVisualizationCapabilityInput {
  sessionId: string;
  availability: VisualizationAvailability;
  exactSkillName?: string | null;
  reason?: string | null;
}

export function recordVisualizationCapability(root: string, input: RecordVisualizationCapabilityInput): VisualizationCapabilityRecord {
  const sessionId = safeSegment(input.sessionId);
  const rawSkillName = input.exactSkillName?.trim() || null;
  const exactSkillName = rawSkillName === '$visualize' ? 'visualize' : rawSkillName;
  if (input.availability === 'available' && exactSkillName !== 'visualize') throw new Error('An available Visualize capability must record the exact Codex skill name "visualize" (invoked as $visualize)');
  if (input.availability !== 'available' && exactSkillName) throw new Error('An unavailable or unknown visualization capability cannot record an exact skill name');
  const record: VisualizationCapabilityRecord = {
    schemaVersion: 3,
    capability: 'visualize',
    preferredCapabilityName: 'Visualize',
    preferredSkillName: 'visualize',
    skillInvocation: '$visualize',
    sessionId,
    availability: input.availability,
    exactSkillName,
    reason: input.reason?.trim() || null,
    checkedAt: new Date().toISOString()
  };
  atomicJson(visualizationCapabilityPath(root, sessionId), record);
  return record;
}

export function persistVisualizationPlan(root: string, taskId: string, gate: string, sessionId: string, plan: VisualizationPlan): VisualizationPlan {
  atomicJson(visualizationPlanPath(root, taskId, gate, sessionId), plan);
  return plan;
}

export function getVisualizationPlan(root: string, taskId: string, gate: string, sessionId?: string | null): VisualizationPlan | null {
  if (!sessionId?.trim()) return null;
  return readJson<VisualizationPlan>(visualizationPlanPath(root, taskId, gate, sessionId));
}

export function validateVisualizationQuality(quality: VisualizationQuality | null | undefined, requiredEvaluator: VisualizationEvaluatorMode = 'self-check'): string[] {
  if (!quality) return ['A rendered visualization requires a quality assessment'];
  const errors: string[] = [];
  if (requiredEvaluator === 'fresh-context' && quality.evaluator !== 'fresh-context') errors.push('Visualization requires a fresh-context evaluator');
  for (const field of ['clearPurpose','sourceFaithful','mobileReadable','noOverflow','noClipping','concise'] as const) {
    if (quality[field] !== true) errors.push(`Visualization quality check failed: ${field}`);
  }
  const threshold = requiredEvaluator === 'fresh-context' ? 85 : 80;
  if (!Number.isFinite(quality.score) || quality.score < threshold || quality.score > 100) errors.push(`Visualization quality score must be between ${threshold} and 100`);
  return errors;
}

function regexEscape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function markedImageTag(html: string, id: string): string | null {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (attributeValue(tag, 'data-specrail-evidence-id') === id) return tag;
  }
  return null;
}
function attributeValue(tag: string, name: string): string | null {
  const match=tag.match(new RegExp(`${regexEscape(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i'));
  return match?.[2] ?? null;
}
function embeddedImageBytes(tag: string): { mediaType:string; bytes:Buffer } | null {
  const src=attributeValue(tag,'src');
  if(!src) return null;
  const match=src.match(/^data:(image\/[^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
  if(!match) return null;
  try { const bytes=Buffer.from(match[2]!,'base64'); return bytes.length ? {mediaType:match[1]!.toLowerCase(),bytes} : null; } catch { return null; }
}
function validateEmbeddedSource(html:string,source:VisualizationSource):string[] {
  const errors:string[]=[];const tag=markedImageTag(html,source.id);
  if(!tag)return[`Rendered Visualize fragment is missing visible embedded canonical evidence for ${source.id}`];
  if(/\shidden(?:\s|=|>)/i.test(tag)||String(attributeValue(tag,'aria-hidden')||'').toLowerCase()==='true') errors.push(`Rendered Visualize fragment canonical evidence ${source.id} must not be hidden`);
  const inlineStyle=String(attributeValue(tag,'style')||'').replace(/\s+/g,'').toLowerCase();
  const hiddenStyle=/(?:^|;)display:none(?:!important)?(?:;|$)/.test(inlineStyle)||/(?:^|;)visibility:hidden(?:!important)?(?:;|$)/.test(inlineStyle)||/(?:^|;)opacity:0(?:\.0+)?(?:!important)?(?:;|$)/.test(inlineStyle)||/(?:^|;)(?:width|height):0(?:px|rem|em|%|vh|vw)?(?:!important)?(?:;|$)/.test(inlineStyle)||/(?:^|;)transform:scale\(0(?:\.0+)?\)(?:!important)?(?:;|$)/.test(inlineStyle);
  const zeroDimension=['width','height'].some(name=>/^0(?:\.0+)?(?:px|%)?$/i.test(String(attributeValue(tag,name)||'').trim()));
  if(hiddenStyle||zeroDimension) errors.push(`Rendered Visualize fragment canonical evidence ${source.id} must be directly visible`);
  const embedded=embeddedImageBytes(tag);
  if(!embedded)return[`Rendered Visualize fragment must embed ${source.id} directly as a base64 data:image source`];
  const expectedHash=String(source.sha256||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(expectedHash))errors.push(`Visualization source ${source.id} is missing its canonical SHA-256`);
  else if(sha256(embedded.bytes)!==expectedHash)errors.push(`Rendered Visualize fragment embedded bytes do not match canonical evidence ${source.id}`);
  if(source.mediaType&&embedded.mediaType!==String(source.mediaType).toLowerCase())errors.push(`Rendered Visualize fragment media type for ${source.id} does not match canonical evidence`);
  const declaredHash=attributeValue(tag,'data-specrail-source-sha256');
  if(declaredHash!==expectedHash)errors.push(`Rendered Visualize fragment source ${source.id} must declare data-specrail-source-sha256=${expectedHash}`);
  return errors;
}
function validateComparatorV2Artifact(html: string, plan: VisualizationPlan): string[] {
  if (plan.experience.pattern !== 'visual-comparator-v2') return [];
  const errors: string[] = [];
  if (!/<[a-z][^>]*data-specrail-comparator=["']v2["'][^>]*>/i.test(html)) errors.push('Visual Comparator v2 root marker is missing');
  for (const mode of ['side-by-side','slider','overlay']) if (!new RegExp(`<button\\b[^>]*data-mode=["']${mode}["'][^>]*>`, 'i').test(html)) errors.push(`Visual Comparator v2 is missing ${mode} mode`);
  if (!/<select\b[^>]*data-specrail-control=["']viewport["'][^>]*>/i.test(html)) errors.push('Visual Comparator v2 is missing viewport filtering');
  if (!/<select\b[^>]*data-specrail-control=["']route-target["'][^>]*>/i.test(html)) errors.push('Visual Comparator v2 is missing route/target filtering');
  if (!/<select\b[^>]*data-specrail-control=["']capture-scope["'][^>]*>/i.test(html)) errors.push('Visual Comparator v2 is missing capture-scope filtering');
  if (!/<input\b(?=[^>]*type=["']range["'])(?=[^>]*data-specrail-control=["']split["'])[^>]*>/i.test(html)) errors.push('Visual Comparator v2 is missing an interactive split range control');
  if (!/<input\b(?=[^>]*type=["']range["'])(?=[^>]*data-specrail-control=["']opacity["'])[^>]*>/i.test(html)) errors.push('Visual Comparator v2 is missing an interactive overlay opacity control');
  const runtime=html.match(/<script\b[^>]*data-specrail-comparator-runtime=["']v2["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? '';
  if(!runtime) errors.push('Visual Comparator v2 is missing its marked interactive runtime');
  else {
    if(!/(?:addEventListener|onchange|onclick)/i.test(runtime))errors.push('Visual Comparator v2 runtime does not bind interactive controls');
    if(!/(?:clipPath|clip-path|--split|style\.width)/i.test(runtime))errors.push('Visual Comparator v2 runtime does not implement slider state');
    if(!/(?:style\.opacity|--opacity)/i.test(runtime))errors.push('Visual Comparator v2 runtime does not implement overlay opacity');
    if(!/(?:viewport|route-target|routeTarget)/i.test(runtime)||!/(?:capture-scope|captureScope)/i.test(runtime))errors.push('Visual Comparator v2 runtime does not apply exact context filtering');
  }
  const requiredIds = Array.isArray(plan.requiredSourceIds) ? plan.requiredSourceIds : [];
  for (const source of plan.sources.filter(item => requiredIds.includes(item.id))) {
    const tag = markedImageTag(html, source.id);
    if (!tag) continue;
    const role = source.reviewRole ?? 'supporting';
    if (attributeValue(tag, 'data-specrail-comparator-source') !== 'v2') errors.push(`Visual Comparator v2 source ${source.id} is missing data-specrail-comparator-source=v2`);
    if (attributeValue(tag, 'data-specrail-review-role') !== role) errors.push(`Visual Comparator v2 source ${source.id} is missing review role ${role}`);
    for (const [attribute, value] of [['data-specrail-route', source.route], ['data-specrail-target', source.target], ['data-specrail-viewport', source.viewport], ['data-specrail-capture-scope', source.captureScope]] as const) {
      if (value && attributeValue(tag, attribute) !== value) errors.push(`Visual Comparator v2 source ${source.id} is missing ${attribute}=${value}`);
    }
  }
  return errors;
}

export interface RecordVisualizationRunInput {
  taskId: string;
  sessionId: string;
  gate: string;
  outcome: VisualizationOutcome;
  provider?: string | null;
  planDigest: string;
  sourceDigest: string;
  invocationRef?: string | null;
  resultText?: string | null;
  artifactPath?: string | null;
  quality?: VisualizationQuality | null;
}

export function recordVisualizationRun(root: string, input: RecordVisualizationRunInput): VisualizationRunRecord {
  const capability = getVisualizationCapability(root, input.sessionId);
  const plan = getVisualizationPlan(root, input.taskId, input.gate, input.sessionId);
  if (!plan) throw new Error('Cannot record a visualization outcome before AI Flow persists the exact visualization plan for this session and gate');
  const { planDigest: storedPlanDigest, ...planPayload } = plan;
  if (!storedPlanDigest || digestJson(planPayload) !== storedPlanDigest) throw new Error('Persisted visualization plan integrity check failed; regenerate the review before rendering');
  if (input.planDigest !== storedPlanDigest) throw new Error('Visualization plan digest does not match the current persisted plan');
  if (input.sourceDigest !== plan.sourceDigest) throw new Error('Visualization source digest does not match the current persisted plan');
  const currentSourceDigest = computeVisualizationSourceDigest(root, plan.sources, plan.payload);
  if (currentSourceDigest !== plan.sourceDigest) throw new Error('Visualization sources changed after the plan was created; regenerate the review before rendering');

  const provider = input.provider?.trim() || null;
  const invocationRef = input.invocationRef?.trim() || null;
  const resultText = input.resultText?.trim() || null;
  const resultDigest = resultText ? sha256(resultText) : null;
  const artifactPath = input.artifactPath?.trim() || null;
  const quality = input.quality ?? null;

  if (input.outcome === 'rendered') {
    if (capability.availability !== 'available' || capability.exactSkillName !== 'visualize') throw new Error('Cannot record a rendered visualization until the current Codex session confirms the Visualize skill is available');
    if (provider !== '$visualize') throw new Error('Rendered visualization provider must be the explicit Codex skill invocation $visualize');
    if (!artifactPath) throw new Error('Rendered Visualize output requires the absolute HTML fragment path used by the native content reference');
    if (!path.isAbsolute(artifactPath)) throw new Error('Rendered Visualize output must use an absolute executor-side HTML fragment path');
    if (!invocationRef) throw new Error('Rendered visualization requires the real native Visualize content reference');
    const contentRefMatch = invocationRef.match(/^visualize(\{[\s\S]*\})$/);
    if (!contentRefMatch) throw new Error('Rendered visualization invocationRef must be the exact native visualize content reference emitted by Codex');
    let contentRef: Record<string, unknown>;
    try { contentRef = JSON.parse(contentRefMatch[1]!); } catch { throw new Error('Rendered visualization content reference must contain valid JSON'); }
    if (typeof contentRef.path !== 'string' || !path.isAbsolute(contentRef.path)) throw new Error('Rendered visualization content reference must contain an absolute path');
    if (path.resolve(contentRef.path) !== path.resolve(artifactPath)) throw new Error('Rendered visualization content reference path must match artifactPath');
    if (!resultText || resultText.length < 20) throw new Error('Rendered visualization requires a non-trivial host result summary for audit hashing');
    const qualityErrors = validateVisualizationQuality(quality, plan.evaluatorMode);
    if (qualityErrors.length) throw new Error(qualityErrors.join('; '));
  } else if (quality) {
    throw new Error('Fallback or failed visualization outcomes must not claim a rendered quality assessment');
  }

  let displayedSourceIds: string[] = [];
  if (artifactPath) {
    const resolved = provider === '$visualize' && path.isAbsolute(artifactPath) ? path.resolve(artifactPath) : resolveProjectFile(root, artifactPath);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) throw new Error(`Visualization artifact does not exist: ${resolved}`);
    if (provider === '$visualize') {
      if(lstatSync(resolved).isSymbolicLink()) throw new Error('Visualize HTML fragments must be durable regular files, not symbolic links');
      const project = realpathSync(path.resolve(root));
      const realArtifact=realpathSync(resolved);
      if (realArtifact === project || realArtifact.startsWith(`${project}${path.sep}`)) throw new Error('Visualize HTML fragments must live outside the checked-out repository');
      if (path.extname(resolved).toLowerCase() !== '.html') throw new Error('Visualize artifacts must be HTML fragments referenced by the Codex visualization surface');
      if (statSync(resolved).size > 1024 * 1024) throw new Error('Visualize HTML fragments must stay under 1 MB');
      if (input.outcome === 'rendered') {
        const html=readFileSync(resolved,'utf8');
        const requiredIds=Array.isArray(plan.requiredSourceIds)?plan.requiredSourceIds:[];
        const requiredSources=plan.sources.filter(source=>requiredIds.includes(source.id));
        const sourceErrors=requiredSources.flatMap(source=>validateEmbeddedSource(html,source));
        if(sourceErrors.length) throw new Error(sourceErrors.join('; '));
        displayedSourceIds=requiredSources.map(source=>source.id);
        const comparatorErrors=validateComparatorV2Artifact(html,plan);
        if(comparatorErrors.length) throw new Error(comparatorErrors.join('; '));
      }
    }
  }

  const record: VisualizationRunRecord = {
    schemaVersion: 3,
    taskId: safeSegment(input.taskId),
    sessionId: safeSegment(input.sessionId),
    gate: safeSegment(input.gate),
    outcome: input.outcome,
    provider,
    planDigest: plan.planDigest,
    sourceDigest: plan.sourceDigest,
    invocationRef,
    resultDigest,
    artifactPath,
    displayedSourceIds,
    quality,
    recordedAt: new Date().toISOString()
  };
  atomicJson(visualizationRunPath(root, record.taskId, record.gate, record.sessionId), record);
  return record;
}

export function getVisualizationRun(root: string, taskId: string, gate: string, sessionId?: string | null): VisualizationRunRecord | null {
  if (!sessionId?.trim()) return null;
  const stored = readJson<Record<string, unknown>>(visualizationRunPath(root, taskId, gate, sessionId));
  if (!stored || typeof stored.taskId !== 'string' || typeof stored.sessionId !== 'string' || typeof stored.gate !== 'string') return null;
  const outcome = stored.outcome;
  if (outcome !== 'pending' && outcome !== 'rendered' && outcome !== 'fallback' && outcome !== 'failed') return null;
  return {
    schemaVersion: 3,
    taskId: stored.taskId,
    sessionId: stored.sessionId,
    gate: stored.gate,
    outcome,
    provider: typeof stored.provider === 'string' ? stored.provider : null,
    planDigest: typeof stored.planDigest === 'string' ? stored.planDigest : '',
    sourceDigest: typeof stored.sourceDigest === 'string' ? stored.sourceDigest : '',
    invocationRef: typeof stored.invocationRef === 'string' ? stored.invocationRef : null,
    resultDigest: typeof stored.resultDigest === 'string' ? stored.resultDigest : null,
    artifactPath: typeof stored.artifactPath === 'string' ? stored.artifactPath : null,
    displayedSourceIds: Array.isArray(stored.displayedSourceIds) ? stored.displayedSourceIds.filter((item): item is string => typeof item === 'string') : [],
    quality: stored.quality && typeof stored.quality === 'object' ? stored.quality as VisualizationQuality : null,
    recordedAt: typeof stored.recordedAt === 'string' ? stored.recordedAt : new Date(0).toISOString()
  };
}
