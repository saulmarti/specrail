import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listEvidence, validateEvidence } from './evidence.js';
import { appendLog, findTask, getSection, loadTask, saveTask, setSection } from './task.js';
import { configuredProjectAudienceProfiles, initProject, loadProjectConfig } from './project.js';
import { scopeGuardStatus } from './scope-guard.js';
import { assertConcurrencyMutationAuthority, yieldConcurrencyTaskReservation } from './concurrency-state.js';
import { autonomyPolicy } from './autonomy-policy.js';
import { assertPhaseBoundaryEntered, invalidatePhaseBoundary, rememberTargetAudienceSourceSession } from './phase-boundary.js';
import type { AudienceSignal, AudienceVerdict, FinalProductOwnerReview, FinalProductOwnerVerdict, ProductOwnerReview, ProductOwnerVerdict, TargetAudienceProfile, TargetAudienceReview, TaskDocument } from './types.js';

function productIntelligencePolicy(root: string): Record<string, unknown> | null {
  const policy = loadProjectConfig(root).productIntelligence;
  return policy && typeof policy === 'object' && !Array.isArray(policy) ? policy as Record<string, unknown> : null;
}
export function setProductIntelligenceEnabled(root: string, enabled: boolean): Record<string, unknown> {
  initProject(root);
  const config = loadProjectConfig(root);
  const current = config.productIntelligence && typeof config.productIntelligence === 'object' && !Array.isArray(config.productIntelligence) ? config.productIntelligence as Record<string, unknown> : {};
  const policy = { requireProductOwner: true, requireFinalProductOwnerReview: true, requireTargetAudience: true, minPrimaryAudienceProfiles: 1, ...current, enabled };
  config.productIntelligence = policy;
  writeFileSync(path.join(path.resolve(root), '.ai', 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return policy;
}
export function productIntelligenceEnabled(root: string): boolean {
  const policy = productIntelligencePolicy(root);
  return Boolean(policy && policy.enabled !== false);
}
export function productOwnerRequired(root: string): boolean {
  const policy = productIntelligencePolicy(root);
  return Boolean(policy && policy.enabled !== false && policy.requireProductOwner !== false);
}
export function finalProductOwnerRequired(root: string): boolean {
  const policy = productIntelligencePolicy(root);
  return Boolean(policy && policy.enabled !== false && policy.requireProductOwner !== false && policy.requireFinalProductOwnerReview !== false);
}
export function targetAudienceRequired(root: string): boolean {
  const policy = productIntelligencePolicy(root);
  return Boolean(policy && policy.enabled !== false && policy.requireTargetAudience !== false);
}
export function minimumPrimaryAudienceProfiles(root: string): number {
  const policy = productIntelligencePolicy(root);
  if (!policy || policy.enabled === false || policy.requireTargetAudience === false) return 0;
  const value = Number(policy.minPrimaryAudienceProfiles ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function now(): string { return new Date().toISOString(); }
function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function stringList(value: readonly string[] | undefined): string[] { return [...new Set((value ?? []).map(item => String(item).trim()).filter(Boolean))]; }
function artifactDigest(value: object): string {
  const { artifactDigest: _ignored, ...payload } = value as Record<string, unknown>;
  return hash(payload);
}
function sealArtifact<T extends object>(value: T): T & { artifactDigest: string } {
  return { ...value, artifactDigest: artifactDigest(value) };
}
function projectFile(root: string, name: string): string {
  const file = path.join(path.resolve(root), '.ai', 'project', name);
  return existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : '';
}

const PRODUCT_CONTEXT_PLACEHOLDER = /(?:Describe the product purpose|Define the product mission|Describe primary and secondary target-audience)/i;
export function productIntelligenceContextStatus(root: string): { ready: boolean; files: Record<string, boolean>; errors: string[] } {
  const files: Record<string, boolean> = {};
  const errors: string[] = [];
  for (const name of ['product.md','product-owner.md','users.md']) {
    const content = projectFile(root, name);
    const ready = content.length >= 60 && !PRODUCT_CONTEXT_PLACEHOLDER.test(content);
    files[name] = ready;
    if (!ready) errors.push(`${name} is still a Product Intelligence placeholder`);
  }
  if (files['users.md']) {
    const required = minimumPrimaryAudienceProfiles(root);
    const available = configuredTargetAudienceProfiles(root).filter(profile => profile.primary).length;
    if (available < required) errors.push(`users.md defines ${available} primary Target Audience profile(s), but productIntelligence.minPrimaryAudienceProfiles requires ${required}`);
  }
  return { ready: errors.length === 0, files, errors };
}
function productOwnerFile(root: string, id: string): string { return path.join(path.resolve(root), '.ai', 'product-intelligence', 'product-owner', `${id}.json`); }
function finalProductOwnerFile(root: string, id: string): string { return path.join(path.resolve(root), '.ai', 'product-intelligence', 'product-owner-final', `${id}.json`); }
function audienceDir(root: string, id: string): string { return path.join(path.resolve(root), '.ai', 'product-intelligence', 'audience', id); }
function audienceFile(root: string, id: string, profileId: string): string { return path.join(audienceDir(root, id), `${profileId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'audience'}.json`); }
function profileSlug(value: string): string { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'audience'; }
export function configuredTargetAudienceProfiles(root: string): TargetAudienceProfile[] { return configuredProjectAudienceProfiles(root); }
function targetAudienceProfile(root: string, profileId: string): TargetAudienceProfile {
  const normalized = profileSlug(profileId);
  const profile = configuredTargetAudienceProfiles(root).find(item => item.id === normalized);
  if (!profile) {
    const available = configuredTargetAudienceProfiles(root).map(item => item.id).join(', ') || 'none';
    throw new Error(`Unknown Target Audience profile ${profileId}. Define it in .ai/project/users.md or use one of: ${available}`);
  }
  return profile;
}
function taskProductSource(task: TaskDocument): Record<string, unknown> {
  return {
    id: task.meta.id,
    title: task.meta.title,
    type: task.meta.type,
    size: task.meta.size,
    risk: task.meta.risk,
    surfaces: [...(task.meta.surfaces || [])].sort(),
    route: task.meta.route,
    deliveryStrategy: task.meta.delivery_strategy || null,
    need: getSection(task.body, 'Need').trim()
  };
}
export function productOwnerSourceDigest(root: string, id: string): string {
  const task = loadTask(findTask(root, id));
  return hash({
    task: taskProductSource(task),
    product: projectFile(root, 'product.md'),
    owner: projectFile(root, 'product-owner.md'),
    users: projectFile(root, 'users.md'),
    constitution: projectFile(root, 'constitution.md'),
    learnings: projectFile(root, 'learnings.md')
  });
}
function implementationSnapshot(root: string, task: TaskDocument): Record<string, unknown> {
  const scope = scopeGuardStatus(root, task.meta.id);
  const workspace = task.meta.worktree_path && existsSync(task.meta.worktree_path) ? task.meta.worktree_path : path.resolve(root);
  const files = [...scope.actualFiles].sort().map(file => {
    const absolute = path.join(workspace, file);
    if (!existsSync(absolute)) return { path: file, state: 'deleted' };
    try {
      return { path: file, sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') };
    } catch {
      return { path: file, state: 'unreadable' };
    }
  });
  return {
    applicable: scope.applicable,
    baselineCommit: scope.baselineCommit ?? task.meta.scope_baseline_commit ?? null,
    effectiveScopeDigest: 'effectiveDigest' in scope ? scope.effectiveDigest ?? null : null,
    files
  };
}
export function targetAudienceSourceDigest(root: string, id: string): string {
  const task = loadTask(findTask(root, id));
  const evidence = listEvidence(root, task.meta.id).map(item => ({ id: item.id, kind: item.kind, sha256: item.sha256 })).sort((a, b) => a.id.localeCompare(b.id));
  return hash({
    taskId: task.meta.id,
    specification: task.meta.spec_effective_hash || task.meta.spec_approval_hash || null,
    qaMission: task.meta.qa_mission_hash || null,
    product: projectFile(root, 'product.md'),
    users: projectFile(root, 'users.md'),
    implementation: implementationSnapshot(root, task),
    evidence
  });
}
function productOwnerMarkdown(review: ProductOwnerReview): string {
  const concerns = review.concerns.length ? review.concerns.map(item => `- ${item}`).join('\n') : '- None.';
  const questions = review.questions.length ? review.questions.map(item => `- ${item}`).join('\n') : '- None.';
  const decision = review.humanDecision ? `\n- Human decision: ${review.humanDecision}${review.humanDecisionNote ? ` — ${review.humanDecisionNote}` : ''}` : '';
  return `- Verdict: ${review.verdict}\n- Judgment required: ${review.judgmentRequired ? 'yes' : 'no'}${decision}\n- Summary: ${review.summary}\n- Product value: ${review.value}\n\n### Concerns\n\n${concerns}\n\n### Product questions\n\n${questions}`;
}
function audienceMarkdown(reviews: TargetAudienceReview[]): string {
  if (!reviews.length) return '';
  return [...reviews].sort((a, b) => Number(b.primary) - Number(a.primary) || a.profileId.localeCompare(b.profileId)).map(review => {
    const findings = review.findings.length ? review.findings.map(item => `- ${item}`).join('\n') : '- None.';
    const decision = review.humanDecision ? `\n- Human decision: ${review.humanDecision}${review.humanDecisionNote ? ` — ${review.humanDecisionNote}` : ''}` : '';
    return `### ${review.profileId}${review.primary ? ' (primary)' : ''}\n\n- Verdict: ${review.verdict}\n- Comprehension: ${review.comprehension}\n- Utility: ${review.utility}\n- Discoverability: ${review.discoverability}\n- Friction: ${review.friction}\n- Trust: ${review.trust}\n- Repeat value: ${review.repeatValue}\n- Product decision required: ${review.requiresProductDecision ? 'yes' : 'no'}${decision}\n\n#### Findings\n\n${findings}`;
  }).join('\n\n');
}
export function recordProductOwnerReview(root: string, id: string, input: {
  verdict: ProductOwnerVerdict;
  summary: string;
  value: string;
  concerns?: string[];
  questions?: string[];
  judgmentRequired?: boolean;
}, options: { sessionId?: string | null } = {}): ProductOwnerReview {
  assertConcurrencyMutationAuthority(root, id, options.sessionId);
  const task = loadTask(findTask(root, id));
  if (task.meta.phase !== 'product-specifier') throw new Error('Product Owner review can only be recorded while product specification is active');
  const context = productIntelligenceContextStatus(root);
  if (!context.ready) throw new Error(`Product Owner review requires concrete project product context: ${context.errors.join('; ')}`);
  if (!['build','revise','do-not-build'].includes(input.verdict)) throw new Error(`Invalid Product Owner verdict: ${input.verdict}`);
  const summary = String(input.summary || '').trim(), value = String(input.value || '').trim();
  if (summary.length < 12) throw new Error('Product Owner review requires a concrete summary');
  if (value.length < 12) throw new Error('Product Owner review requires a concrete product-value assessment');
  const stamp = now();
  const questions = stringList(input.questions);
  const review = sealArtifact({
    schemaVersion: 1,
    taskId: task.meta.id,
    verdict: input.verdict,
    summary,
    value,
    concerns: stringList(input.concerns),
    questions,
    judgmentRequired: input.judgmentRequired === true || input.verdict !== 'build' || questions.length > 0,
    humanDecision: null,
    humanDecisionNote: null,
    sourceDigest: productOwnerSourceDigest(root, task.meta.id),
    createdAt: stamp,
    updatedAt: stamp
  }) as ProductOwnerReview;
  mkdirSync(path.dirname(productOwnerFile(root, task.meta.id)), { recursive: true });
  atomicJson(productOwnerFile(root, task.meta.id), review);
  task.meta.product_owner_review_digest = review.artifactDigest;
  task.meta.waiting_for = review.judgmentRequired || autonomyPolicy(root).level === 'guided' ? 'user' : 'none';
  task.body = setSection(task.body, 'Product Owner Review', productOwnerMarkdown(review));
  appendLog(task, `Project Product Owner reviewed the task: ${review.verdict}.`);
  saveTask(task);
  // Product Owner is a distinct project role. A scheduler-owned Product Owner
  // lane yields after writing its opinion so the next role receives a fresh
  // reservation/session instead of inheriting product-judgment authority.
  yieldConcurrencyTaskReservation(root, task.meta.id, options.sessionId === undefined ? {} : { sessionId: options.sessionId });
  return review;
}
export function getProductOwnerReview(root: string, id: string): ProductOwnerReview | null {
  const file = productOwnerFile(root, id);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as ProductOwnerReview : null;
}
export function productOwnerReviewStatus(root: string, id: string): { valid: boolean; stale: boolean; integrityValid: boolean; needsHumanJudgment: boolean; review: ProductOwnerReview | null; detail: string } {
  const review = getProductOwnerReview(root, id);
  if (!review) return { valid: false, stale: false, integrityValid: false, needsHumanJudgment: false, review: null, detail: 'No Product Owner review has been recorded.' };
  const task = loadTask(findTask(root, id));
  const integrityValid = Boolean(review.artifactDigest) && review.artifactDigest === artifactDigest(review) && task.meta.product_owner_review_digest === review.artifactDigest && getSection(task.body, 'Product Owner Review').trim() === productOwnerMarkdown(review).trim();
  const current = productOwnerSourceDigest(root, id), stale = review.sourceDigest !== current;
  const terminalHumanDecision = review.humanDecision === 'reject' || review.humanDecision === 'rework';
  const unresolved = terminalHumanDecision || (review.judgmentRequired && review.humanDecision !== 'proceed');
  return {
    valid: integrityValid && !stale && !unresolved,
    stale,
    integrityValid,
    needsHumanJudgment: integrityValid && !stale && unresolved && review.humanDecision !== 'reject' && review.humanDecision !== 'rework',
    review,
    detail: !integrityValid ? 'Product Owner review integrity no longer matches the task artifact.' : stale ? 'Product inputs changed after the Product Owner review.' : terminalHumanDecision ? `Product Owner decision ${review.humanDecision} does not authorize specification work to proceed.` : unresolved ? `Product Owner verdict ${review.verdict} requires a product decision.` : 'Product Owner review is current and may proceed.'
  };
}
export function decideProductOwnerReview(root: string, id: string, decision: 'proceed' | 'rework' | 'reject', note = ''): ProductOwnerReview {
  if (!['proceed','rework','reject'].includes(String(decision))) throw new Error(`Invalid Product Owner decision: ${String(decision)}`);
  const review = getProductOwnerReview(root, id);
  if (!review) throw new Error('No Product Owner review exists');
  if (decision === 'rework') {
    const task = loadTask(findTask(root, id));
    task.meta.product_owner_review_digest = null;
    task.meta.waiting_for = 'none';
    task.body = setSection(task.body, 'Product Owner Review', '');
    appendLog(task, `User requested Product Owner rework. ${String(note || '').trim()}`.trim());
    saveTask(task);
    const file = productOwnerFile(root, id);
    if (existsSync(file)) rmSync(file, { force: true });
    // A Product Owner decision is human-owned. If a scheduler had prepared this
    // task-local lane before the host surfaced the interaction, relinquish that
    // agent reservation so the next role must be dispatched with fresh authority.
    yieldConcurrencyTaskReservation(root, id, { force: true });
    return sealArtifact({ ...review, artifactDigest: undefined, humanDecision: 'rework', humanDecisionNote: String(note || '').trim() || null, updatedAt: now() }) as ProductOwnerReview;
  }
  const status = productOwnerReviewStatus(root, id);
  if (!status.integrityValid) throw new Error('Product Owner review integrity is invalid; refresh or rework the review before deciding');
  if (status.stale) throw new Error('Product Owner review is stale; refresh it before deciding');
  const updated = sealArtifact({ ...review, artifactDigest: undefined, humanDecision: decision, humanDecisionNote: String(note || '').trim() || null, updatedAt: now() }) as ProductOwnerReview;
  atomicJson(productOwnerFile(root, id), updated);
  const task = loadTask(findTask(root, id));
  task.meta.product_owner_review_digest = updated.artifactDigest;
  task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Product Owner Review', productOwnerMarkdown(updated));
  appendLog(task, `User Product Owner decision: ${decision}. ${String(note || '').trim()}`.trim());
  saveTask(task);
  yieldConcurrencyTaskReservation(root, id, { force: true });
  return updated;
}

function finalProductOwnerMarkdown(review: FinalProductOwnerReview): string {
  const concerns = review.concerns.length ? review.concerns.map(item => `- ${item}`).join('\n') : '- None.';
  const questions = review.questions.length ? review.questions.map(item => `- ${item}`).join('\n') : '- None.';
  const decision = review.humanDecision ? `\n- Human decision: ${review.humanDecision}${review.humanDecisionNote ? ` — ${review.humanDecisionNote}` : ''}` : '';
  return `- Verdict: ${review.verdict}\n- Judgment required: ${review.judgmentRequired ? 'yes' : 'no'}${decision}\n- Summary: ${review.summary}\n- Product value after implementation: ${review.value}\n\n### Concerns\n\n${concerns}\n\n### Product questions\n\n${questions}`;
}
export function finalProductOwnerSourceDigest(root: string, id: string): string {
  const task = loadTask(findTask(root, id));
  const evidence = listEvidence(root, task.meta.id).map(item => ({ id: item.id, kind: item.kind, sha256: item.sha256 })).sort((a, b) => a.id.localeCompare(b.id));
  return hash({
    task: taskProductSource(task),
    approvedSpecification: task.meta.spec_effective_hash || task.meta.spec_approval_hash || null,
    preSpecificationProductOwner: task.meta.product_owner_review_digest || null,
    targetAudience: task.meta.target_audience_review_digest || null,
    product: projectFile(root, 'product.md'),
    owner: projectFile(root, 'product-owner.md'),
    users: projectFile(root, 'users.md'),
    implementation: implementationSnapshot(root, task),
    evidence
  });
}
export function recordFinalProductOwnerReview(root: string, id: string, input: {
  verdict: FinalProductOwnerVerdict;
  summary: string;
  value: string;
  concerns?: string[];
  questions?: string[];
  judgmentRequired?: boolean;
}, options: { sessionId?: string | null } = {}): FinalProductOwnerReview {
  assertConcurrencyMutationAuthority(root, id, options.sessionId);
  const task = loadTask(findTask(root, id));
  if (task.meta.phase !== 'final-approval') throw new Error('Final Product Owner review can only be recorded during final approval');
  if (task.meta.spec_approval !== 'approved' || !task.meta.spec_approval_hash) throw new Error('Final Product Owner review requires an approved specification');
  if (!['ship','revise','do-not-ship'].includes(input.verdict)) throw new Error(`Invalid Final Product Owner verdict: ${input.verdict}`);
  const finalEvidence = validateEvidence(root, id, 'final');
  if (!finalEvidence.valid) throw new Error(`Final Product Owner review requires valid final evidence: ${[...finalEvidence.missing, ...finalEvidence.errors].join(', ')}`);
  if (targetAudienceRequired(root) && (task.meta.route.target_audience || task.meta.route.final_customer)) {
    const audience = targetAudienceReviewStatus(root, id);
    if (!audience.valid) throw new Error(`Final Product Owner review requires completed Target Audience validation: ${audience.detail}`);
  }
  const summary = String(input.summary || '').trim(), value = String(input.value || '').trim();
  if (summary.length < 12) throw new Error('Final Product Owner review requires a concrete outcome summary');
  if (value.length < 12) throw new Error('Final Product Owner review requires a concrete product-value assessment');
  const questions = stringList(input.questions), stamp = now();
  const review = sealArtifact({
    schemaVersion: 1,
    taskId: task.meta.id,
    verdict: input.verdict,
    summary,
    value,
    concerns: stringList(input.concerns),
    questions,
    judgmentRequired: input.judgmentRequired === true || input.verdict !== 'ship' || questions.length > 0,
    humanDecision: null,
    humanDecisionNote: null,
    sourceDigest: finalProductOwnerSourceDigest(root, task.meta.id),
    createdAt: stamp,
    updatedAt: stamp
  }) as FinalProductOwnerReview;
  atomicJson(finalProductOwnerFile(root, task.meta.id), review);
  task.meta.product_owner_final_review_digest = review.artifactDigest;
  task.meta.waiting_for = review.judgmentRequired || autonomyPolicy(root).level === 'guided' ? 'user' : 'none';
  task.body = setSection(task.body, 'Product Owner Final Review', finalProductOwnerMarkdown(review));
  appendLog(task, `Project Product Owner reviewed the implemented result: ${review.verdict}.`);
  saveTask(task);
  yieldConcurrencyTaskReservation(root, task.meta.id, options.sessionId === undefined ? {} : { sessionId: options.sessionId });
  return review;
}
export function getFinalProductOwnerReview(root: string, id: string): FinalProductOwnerReview | null {
  const file = finalProductOwnerFile(root, id);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as FinalProductOwnerReview : null;
}
export function finalProductOwnerReviewStatus(root: string, id: string): { valid: boolean; stale: boolean; integrityValid: boolean; needsHumanJudgment: boolean; review: FinalProductOwnerReview | null; detail: string } {
  const review = getFinalProductOwnerReview(root, id);
  if (!review) return { valid: false, stale: false, integrityValid: false, needsHumanJudgment: false, review: null, detail: 'No final Product Owner review has been recorded.' };
  const task = loadTask(findTask(root, id));
  const integrityValid = Boolean(review.artifactDigest) && review.artifactDigest === artifactDigest(review) && task.meta.product_owner_final_review_digest === review.artifactDigest && getSection(task.body, 'Product Owner Final Review').trim() === finalProductOwnerMarkdown(review).trim();
  const sealedByFinalApproval = task.meta.final_approval === 'approved' || task.meta.phase === 'delivery' || task.meta.status === 'done';
  const stale = !sealedByFinalApproval && review.sourceDigest !== finalProductOwnerSourceDigest(root, id);
  const terminal = ['revise-implementation','revisit-product','reject'].includes(String(review.humanDecision || ''));
  const unresolved = terminal || (review.judgmentRequired && review.humanDecision !== 'proceed');
  return {
    valid: integrityValid && !stale && !unresolved,
    stale,
    integrityValid,
    needsHumanJudgment: integrityValid && !stale && unresolved && !terminal,
    review,
    detail: !integrityValid ? 'Final Product Owner review integrity no longer matches the task artifact.' : stale ? 'Implementation, audience, evidence, or product context changed after the final Product Owner review.' : terminal ? `Final Product Owner decision ${review.humanDecision} does not authorize final approval.` : unresolved ? `Final Product Owner verdict ${review.verdict} requires a product decision.` : 'Final Product Owner review is current and may proceed.'
  };
}
export function decideFinalProductOwnerReview(root: string, id: string, decision: 'proceed' | 'revise-implementation' | 'revisit-product' | 'reject', note = ''): FinalProductOwnerReview {
  if (!['proceed','revise-implementation','revisit-product','reject'].includes(String(decision))) throw new Error(`Invalid Final Product Owner decision: ${String(decision)}`);
  const review = getFinalProductOwnerReview(root, id);
  if (!review) throw new Error('No final Product Owner review exists');
  const status = finalProductOwnerReviewStatus(root, id);
  if (!status.integrityValid) throw new Error('Final Product Owner review integrity is invalid; refresh it before deciding');
  if (status.stale) throw new Error('Final Product Owner review is stale; refresh it before deciding');
  const updated = sealArtifact({ ...review, artifactDigest: undefined, humanDecision: decision, humanDecisionNote: String(note || '').trim() || null, updatedAt: now() }) as FinalProductOwnerReview;
  atomicJson(finalProductOwnerFile(root, id), updated);
  const task = loadTask(findTask(root, id));
  task.meta.product_owner_final_review_digest = updated.artifactDigest;
  task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Product Owner Final Review', finalProductOwnerMarkdown(updated));
  appendLog(task, `User Final Product Owner decision: ${decision}. ${String(note || '').trim()}`.trim());
  saveTask(task);
  yieldConcurrencyTaskReservation(root, id, { force: true });
  return updated;
}
export function resetFinalProductOwnerReview(root: string, id: string, options: { sessionId?: string | null; force?: boolean; reason?: string } = {}): void {
  if (!options.force) assertConcurrencyMutationAuthority(root, id, options.sessionId);
  const task = loadTask(findTask(root, id));
  const file = finalProductOwnerFile(root, task.meta.id);
  if (existsSync(file)) rmSync(file, { force: true });
  task.meta.product_owner_final_review_digest = null;
  if (task.meta.open_questions === 0) task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Product Owner Final Review', '');
  appendLog(task, `Final Product Owner review reset: ${String(options.reason || 'explicit reset').trim() || 'explicit reset'}.`);
  saveTask(task);
  yieldConcurrencyTaskReservation(root, task.meta.id, options.force ? { force: true } : (options.sessionId === undefined ? {} : { sessionId: options.sessionId }));
}
export function invalidateFinalProductOwnerReview(root: string, id: string, reason = 'Delivered outcome changed'): void {
  const task = loadTask(findTask(root, id));
  const file = finalProductOwnerFile(root, task.meta.id);
  if (existsSync(file)) rmSync(file, { force: true });
  task.meta.product_owner_final_review_digest = null;
  task.body = setSection(task.body, 'Product Owner Final Review', '');
  appendLog(task, `Final Product Owner review invalidated: ${reason}.`);
  saveTask(task);
}

function assertSignal(value: AudienceSignal): AudienceSignal { if (!['pass','warn','fail'].includes(value)) throw new Error(`Invalid audience signal: ${value}`); return value; }
function assertVerdict(value: AudienceVerdict): AudienceVerdict { if (!['pass','revise','reject'].includes(value)) throw new Error(`Invalid audience verdict: ${value}`); return value; }
function audienceAggregateDigest(reviews: TargetAudienceReview[]): string {
  return hash([...reviews].sort((a,b)=>a.profileId.localeCompare(b.profileId)).map(review=>({ profileId:review.profileId, artifactDigest:review.artifactDigest })));
}
export function listTargetAudienceReviews(root: string, id: string): TargetAudienceReview[] {
  const dir = audienceDir(root, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(file => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as TargetAudienceReview);
}
function storedAudienceIntegrity(root: string, id: string, reviews: TargetAudienceReview[]): boolean {
  if (!reviews.length) return true;
  const task = loadTask(findTask(root, id));
  const selfIntegrity = reviews.every(review => Boolean(review.artifactDigest) && review.artifactDigest === artifactDigest(review));
  return selfIntegrity && task.meta.target_audience_review_digest === audienceAggregateDigest(reviews) && getSection(task.body, 'Target Audience Review').trim() === audienceMarkdown(reviews).trim();
}

function clearTargetAudienceReviewBatch(root: string, id: string, reason: string): void {
  const task = loadTask(findTask(root, id));
  rmSync(audienceDir(root, task.meta.id), { recursive: true, force: true });
  task.meta.target_audience_review_digest = null;
  if (task.meta.open_questions === 0) task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Target Audience Review', '');
  appendLog(task, `Target Audience review batch reset: ${reason}.`);
  saveTask(task);
}

export function resetTargetAudienceReviews(root: string, id: string, options: { sessionId?: string | null; force?: boolean; reason?: string } = {}): void {
  if (options.force) {
    clearTargetAudienceReviewBatch(root, id, String(options.reason || 'forced recovery').trim() || 'forced recovery');
    yieldConcurrencyTaskReservation(root, id, { force: true });
    return;
  }
  assertConcurrencyMutationAuthority(root, id, options.sessionId);
  const reviews = listTargetAudienceReviews(root, id);
  if (reviews.length && !storedAudienceIntegrity(root, id, reviews)) {
    throw new Error('Target Audience review integrity is invalid; use an explicit forced reset to discard corrupted review artifacts');
  }
  clearTargetAudienceReviewBatch(root, id, String(options.reason || 'explicit reset').trim() || 'explicit reset');
  yieldConcurrencyTaskReservation(root, id, options.sessionId === undefined ? {} : { sessionId: options.sessionId });
}
export function recordTargetAudienceReview(root: string, id: string, input: {
  profileId: string;
  primary?: boolean;
  verdict: AudienceVerdict;
  comprehension: AudienceSignal;
  utility: AudienceSignal;
  discoverability: AudienceSignal;
  friction: AudienceSignal;
  trust: AudienceSignal;
  repeatValue: AudienceSignal;
  findings?: string[];
  requiresProductDecision?: boolean;
}, options: { sessionId?: string | null } = {}): TargetAudienceReview {
  assertConcurrencyMutationAuthority(root, id, options.sessionId);
  let task = loadTask(findTask(root, id));
  if (task.meta.phase !== 'final-customer') throw new Error('Target Audience review can only be recorded in the final-customer compatibility phase');
  assertPhaseBoundaryEntered(root, task.meta.id, 'final-customer', options.sessionId);
  const productContext = projectFile(root, 'product.md'), usersContext = projectFile(root, 'users.md');
  if (productContext.length < 60 || PRODUCT_CONTEXT_PLACEHOLDER.test(productContext) || usersContext.length < 60 || PRODUCT_CONTEXT_PLACEHOLDER.test(usersContext)) throw new Error('Target Audience review requires concrete product.md and users.md project context');
  const existingReviews = listTargetAudienceReviews(root, task.meta.id);
  const currentSourceDigest = targetAudienceSourceDigest(root, task.meta.id);
  const staleBatch = existingReviews.some(review => review.sourceDigest !== currentSourceDigest);
  if (staleBatch && !storedAudienceIntegrity(root, task.meta.id, existingReviews)) throw new Error('Target Audience review batch is stale and its stored integrity is invalid; perform an explicit forced reset before recording new reviews');
  const profileId = profileSlug(String(input.profileId || '').trim());
  if (!profileId) throw new Error('Target Audience review requires a profile id');
  const profile = targetAudienceProfile(root, profileId);
  if (input.primary !== undefined && input.primary !== profile.primary) throw new Error(`Target Audience profile ${profile.id} is configured as ${profile.primary ? 'primary' : 'secondary'}; the review cannot override that classification`);
  const verdict = assertVerdict(input.verdict);
  const comprehension = assertSignal(input.comprehension), utility = assertSignal(input.utility), discoverability = assertSignal(input.discoverability), friction = assertSignal(input.friction), trust = assertSignal(input.trust), repeatValue = assertSignal(input.repeatValue);
  const signals = [comprehension, utility, discoverability, friction, trust, repeatValue];
  if (verdict === 'pass' && signals.includes('fail')) throw new Error('Target Audience verdict pass cannot contain a failed audience dimension');
  if (verdict === 'pass' && input.requiresProductDecision === true) throw new Error('A Target Audience product trade-off must use revise or reject, not pass');
  const findings = stringList(input.findings);
  if ((verdict !== 'pass' || signals.some(signal => signal !== 'pass') || input.requiresProductDecision === true) && !findings.length) throw new Error('Target Audience warnings, failures, revisions, rejections, or product trade-offs require concrete findings');
  if (staleBatch) {
    clearTargetAudienceReviewBatch(root, task.meta.id, 'source inputs changed before a fresh audience simulation');
    task = loadTask(findTask(root, id));
  }
  const stamp = now(), review = sealArtifact({
    schemaVersion: 1,
    taskId: task.meta.id,
    profileId: profile.id,
    primary: profile.primary,
    verdict,
    comprehension,
    utility,
    discoverability,
    friction,
    trust,
    repeatValue,
    findings,
    requiresProductDecision: input.requiresProductDecision === true,
    humanDecision: null,
    humanDecisionNote: null,
    sourceDigest: currentSourceDigest,
    createdAt: stamp,
    updatedAt: stamp
  }) as TargetAudienceReview;
  mkdirSync(audienceDir(root, task.meta.id), { recursive: true });
  atomicJson(audienceFile(root, task.meta.id, profile.id), review);
  const reviews = listTargetAudienceReviews(root, task.meta.id);
  task.meta.target_audience_review_digest = audienceAggregateDigest(reviews);
  task.body = setSection(task.body, 'Target Audience Review', audienceMarkdown(reviews));
  appendLog(task, `Target Audience profile ${profile.id} reviewed the result: ${review.verdict}.`);
  saveTask(task);
  const status = targetAudienceReviewStatus(root, task.meta.id);
  const refreshed = loadTask(findTask(root, task.meta.id));
  refreshed.meta.waiting_for = status.requiresProductDecision ? 'user' : 'none';
  saveTask(refreshed);
  // Yield only when another audience persona must be dispatched or a human
  // product decision is required. The final persona keeps its reservation long
  // enough to complete the phase or route a normal usability failure to Builder.
  if (status.needsMorePrimaryProfiles) {
    rememberTargetAudienceSourceSession(root, task.meta.id, options.sessionId);
    invalidatePhaseBoundary(root, task.meta.id, 'final-customer');
  }
  if (status.requiresProductDecision || status.needsMorePrimaryProfiles) {
    yieldConcurrencyTaskReservation(root, task.meta.id, options.sessionId === undefined ? {} : { sessionId: options.sessionId });
  }
  return review;
}
export function targetAudienceReviewStatus(root: string, id: string): { valid: boolean; stale: boolean; integrityValid: boolean; configurationValid: boolean; requiresProductDecision: boolean; needsMorePrimaryProfiles: boolean; primaryReviews: number; availablePrimaryProfiles: number; reviews: TargetAudienceReview[]; detail: string } {
  const profiles = configuredTargetAudienceProfiles(root);
  const minimumPrimary = minimumPrimaryAudienceProfiles(root);
  const availablePrimaryProfiles = profiles.filter(profile => profile.primary).length;
  const configurationValid = availablePrimaryProfiles >= minimumPrimary;
  const reviews = listTargetAudienceReviews(root, id);
  if (!reviews.length) return { valid: false, stale: false, integrityValid: false, configurationValid, requiresProductDecision: false, needsMorePrimaryProfiles: minimumPrimary > 0, primaryReviews: 0, availablePrimaryProfiles, reviews, detail: !configurationValid ? `Target Audience configuration requires ${minimumPrimary} primary profile(s), but only ${availablePrimaryProfiles} are defined in users.md.` : 'No Target Audience review has been recorded.' };
  const integrityValid = storedAudienceIntegrity(root, id, reviews);
  const current = targetAudienceSourceDigest(root, id);
  const stale = reviews.some(review => review.sourceDigest !== current);
  const primaryReviews = reviews.filter(review => review.primary).length;
  const requiresProductDecision = reviews.some(review => review.requiresProductDecision && review.humanDecision !== 'accept');
  const failed = reviews.some(review => review.verdict !== 'pass' && !(review.requiresProductDecision && review.humanDecision === 'accept'));
  const needsMorePrimaryProfiles = primaryReviews < minimumPrimary;
  const valid = configurationValid && integrityValid && !stale && !needsMorePrimaryProfiles && !failed && !requiresProductDecision;
  return {
    valid,
    stale,
    integrityValid,
    configurationValid,
    requiresProductDecision: integrityValid && !stale && requiresProductDecision,
    needsMorePrimaryProfiles,
    primaryReviews,
    availablePrimaryProfiles,
    reviews,
    detail: !configurationValid ? `Target Audience configuration requires ${minimumPrimary} primary profile(s), but only ${availablePrimaryProfiles} are defined in users.md.` : !integrityValid ? 'Target Audience review integrity no longer matches the task artifact.' : stale ? 'Implementation/evidence changed after Target Audience review.' : needsMorePrimaryProfiles ? `At least ${minimumPrimary} primary audience profile(s) must review the result.` : requiresProductDecision ? 'Target Audience found a product trade-off that needs a product decision.' : failed ? 'Target Audience review found a result that should be revised before final approval.' : 'Primary Target Audience review passed.'
  };
}

export function decideTargetAudienceReview(root: string, id: string, decision: 'accept' | 'revise', note = ''): TargetAudienceReview[] {
  const reviews = listTargetAudienceReviews(root, id);
  if (!reviews.length) throw new Error('No Target Audience review exists');
  const status = targetAudienceReviewStatus(root, id);
  if (!status.integrityValid) throw new Error('Target Audience review integrity is invalid; refresh the review before deciding');
  if (status.stale) throw new Error('Target Audience review is stale; refresh it before deciding');
  const stamp = now(), text = String(note || '').trim() || null;
  if (decision === 'accept' && !reviews.some(review => review.requiresProductDecision && review.humanDecision !== 'accept')) throw new Error('No unresolved Target Audience product trade-off exists to accept');
  const updated = reviews.map(review => {
    if (decision === 'accept' && !review.requiresProductDecision) return review;
    return sealArtifact({ ...review, artifactDigest: undefined, humanDecision: decision, humanDecisionNote: text, updatedAt: stamp }) as TargetAudienceReview;
  });
  for (const review of updated) atomicJson(audienceFile(root, id, review.profileId), review);
  const task = loadTask(findTask(root, id));
  task.meta.target_audience_review_digest = audienceAggregateDigest(updated);
  task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Target Audience Review', audienceMarkdown(updated));
  appendLog(task, `User Target Audience decision: ${decision}. ${String(note || '').trim()}`.trim());
  saveTask(task);
  // Human product judgment terminates any speculative scheduler reservation
  // that may have been created while this task-local gate was being surfaced.
  yieldConcurrencyTaskReservation(root, id, { force: true });
  return updated;
}

export function resetProductOwnerReview(root: string, id: string, options: { sessionId?: string | null; force?: boolean; reason?: string } = {}): void {
  if (!options.force) assertConcurrencyMutationAuthority(root, id, options.sessionId);
  const task = loadTask(findTask(root, id));
  const file = productOwnerFile(root, task.meta.id);
  if (existsSync(file)) rmSync(file, { force: true });
  task.meta.product_owner_review_digest = null;
  if (task.meta.open_questions === 0) task.meta.waiting_for = 'none';
  task.body = setSection(task.body, 'Product Owner Review', '');
  appendLog(task, `Product Owner review reset: ${String(options.reason || 'explicit reset').trim() || 'explicit reset'}.`);
  saveTask(task);
  yieldConcurrencyTaskReservation(root, task.meta.id, options.force ? { force: true } : (options.sessionId === undefined ? {} : { sessionId: options.sessionId }));
}

export function invalidateProductOwnerReview(root: string, id: string, reason = 'Product intent changed'): void {
  const task = loadTask(findTask(root, id));
  const file = productOwnerFile(root, task.meta.id);
  if (existsSync(file)) rmSync(file, { force: true });
  task.meta.product_owner_review_digest = null;
  task.body = setSection(task.body, 'Product Owner Review', '');
  appendLog(task, `Product Owner review invalidated: ${reason}.`);
  saveTask(task);
}
