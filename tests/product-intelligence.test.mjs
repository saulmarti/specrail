// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { completeProjectContext, initProject } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import {
  decideProductOwnerReview,
  finalProductOwnerRequired,
  finalProductOwnerReviewStatus,
  recordFinalProductOwnerReview,
  resetFinalProductOwnerReview,
  configuredTargetAudienceProfiles,
  decideTargetAudienceReview,
  productIntelligenceContextStatus,
  productIntelligenceEnabled,
  productOwnerRequired,
  productOwnerReviewStatus,
  recordProductOwnerReview,
  recordTargetAudienceReview,
  resetProductOwnerReview,
  resetTargetAudienceReviews,
  targetAudienceRequired,
  setProductIntelligenceEnabled,
  targetAudienceReviewStatus
} from '../dist/src/lib/product-intelligence.js';
import { completePhase, resolveFinalProductOwnerDecision, resolveTargetAudienceDecision, routeTargetAudienceRevision } from '../dist/src/lib/workflow.js';
import { nextAction } from '../dist/src/lib/next.js';
import { markCodeGraphReadyForTests } from '../dist/src/lib/codegraph.js';
import { setBlastRadius } from '../dist/src/lib/scope-guard.js';
import { recordTrace } from '../dist/src/lib/trace.js';
import { setAutonomyPolicy } from '../dist/src/lib/autonomy-policy.js';
import { writeReviewBundle } from '../dist/src/lib/review.js';
import { taskReadiness } from '../dist/src/lib/readiness.js';
import { projectGovernanceHash } from '../dist/src/lib/project-governance.js';
import { specificationHash } from '../dist/src/lib/specification.js';
import { enterPhaseBoundary } from '../dist/src/lib/phase-boundary.js';
import { runtimeRecommendation } from '../dist/src/lib/phase-handoff.js';

function root() { return mkdtempSync(path.join(tmpdir(), 'specrail-product-intelligence-')); }
let audienceSessionCounter=0;
function enterAudienceSession(projectRoot,id){
  let task=loadTask(findTask(projectRoot,id));
  if(task.meta.phase!=='final-customer') throw new Error(`Audience fixture requires final-customer phase, got ${task.meta.phase}`);
  if(!task.meta.target_audience_origin_session_id){
    task.meta.target_audience_origin_session_id=`QA-ORIGIN-${task.meta.id}`;
    saveTask(task);
  }
  const runtime=runtimeRecommendation(projectRoot,id,{sessionId:String(task.meta.target_audience_origin_session_id)});
  if(runtime.boundary?.status==='entered'&&runtime.boundary.enteredSessionId) return runtime.boundary.enteredSessionId;
  const session=`AUDIENCE-${task.meta.id}-${++audienceSessionCounter}`;
  enterPhaseBoundary(projectRoot,id,{sessionId:session,handoffDigest:runtime.handoffDigest,handoffContentDigest:runtime.handoffContentDigest,handoffWords:runtime.handoffWords});
  return session;
}
function recordAudience(projectRoot,id,input){
  const sessionId=enterAudienceSession(projectRoot,id);
  return recordTargetAudienceReview(projectRoot,id,input,{sessionId});
}
function readyProductIntelligenceContext(projectRoot) {
  writeFileSync(path.join(projectRoot, '.ai/project/product.md'), '# Product\n\nA concrete product that helps operators complete important workflows with predictable outcomes and low avoidable friction.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/product-owner.md'), '# Project Product Owner\n\nProtect user value, product coherence, bounded complexity, explicit consequential decisions, and understandable workflows.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows, understandable controls, and useful outcomes without internal implementation knowledge.\n');
}
function setNeed(projectRoot, id, text) {
  const task = loadTask(findTask(projectRoot, id));
  task.body = setSection(task.body, 'Need', text);
  saveTask(task);
}

test('new projects enable Product Intelligence and persist richer product/audience bootstrap docs', () => {
  const projectRoot = root();
  const config = initProject(projectRoot, { name: 'Product' });
  assert.equal(productIntelligenceEnabled(projectRoot), true);
  assert.equal(productOwnerRequired(projectRoot), true);
  assert.equal(targetAudienceRequired(projectRoot), true);
  assert.equal(config.productIntelligence.minPrimaryAudienceProfiles, 1);
  assert.equal(config.productIntelligence.requireFinalProductOwnerReview, true);
  assert.match(readFileSync(path.join(projectRoot, '.ai/project/product-owner.md'), 'utf8'), /priorities|anti-goals/i);
  assert.match(readFileSync(path.join(projectRoot, '.ai/project/users.md'), 'utf8'), /primary and secondary target-audience/i);
});



test('legacy project init preserves Product Intelligence opt-in while explicit enable activates it', () => {
  const projectRoot = root();
  mkdirSync(path.join(projectRoot, '.ai'), { recursive: true });
  writeFileSync(path.join(projectRoot, '.ai/config.json'), `${JSON.stringify({ version: 13, name: 'Legacy project', context: { status: 'pending' } }, null, 2)}\n`);
  const migrated = initProject(projectRoot);
  assert.equal(migrated.productIntelligence.enabled, false);
  assert.equal(productIntelligenceEnabled(projectRoot), false);
  const enabled = setProductIntelligenceEnabled(projectRoot, true);
  assert.equal(enabled.enabled, true);
  assert.equal(productIntelligenceEnabled(projectRoot), true);
});

test('new-project bootstrap defines persistent product intelligence before task-level Product Owner judgment', () => {
  const projectRoot = root(); initProject(projectRoot); markCodeGraphReadyForTests(projectRoot);
  const task = createTask(projectRoot, { title: 'First product feature', type: 'feature', surfaces: ['frontend'] });
  let next = nextAction(projectRoot, task.meta.id);
  assert.equal(productIntelligenceContextStatus(projectRoot).ready, false);
  assert.equal(next.action, 'bootstrap-product-intelligence-context');
  assert.equal(next.actor, 'ai-flow-product-owner');
  assert.equal(next.recommendedSkill, 'ai-flow-product-owner');

  writeFileSync(path.join(projectRoot, '.ai/project/product.md'), '# Product\n\nThis product helps operators complete a defined workflow reliably with less repeated manual coordination.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/product-owner.md'), '# Project Product Owner\n\nProtect operator value, bounded scope, predictable behavior, and explicit decisions over product complexity.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need understandable, predictable workflows that reduce repeated coordination.\n');
  next = nextAction(projectRoot, task.meta.id);
  assert.equal(productIntelligenceContextStatus(projectRoot).ready, true);
  assert.equal(next.action, 'bootstrap-project-and-refine');
  assert.equal(next.actor, 'ai-flow-product-specifier');

  writeFileSync(path.join(projectRoot, '.ai/project/architecture.md'), '# Architecture\n\nThe repository uses explicit application boundaries and public contracts discovered from the indexed source graph.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/runbook.md'), '# Runbook\n\nUse the repository build, test, launch, and validation commands before claiming a task is complete.\n');
  completeProjectContext(projectRoot, 'Bootstrap test context');
  next = nextAction(projectRoot, task.meta.id);
  assert.equal(next.action, 'product-owner-review');
  assert.equal(next.actor, 'ai-flow-product-owner');
  assert.equal(next.recommendedSkill, 'ai-flow-product-owner');
});



test('Guided autonomy always presents and requires acknowledgement of a current Product Owner opinion', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot); markCodeGraphReadyForTests(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/architecture.md'), '# Architecture\n\nConcrete repository boundaries and public contracts are documented for this project.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/runbook.md'), '# Runbook\n\nUse the documented build, test, and validation commands before delivery.\n');
  completeProjectContext(projectRoot, 'Guided PO acknowledgement test');
  const task = createTask(projectRoot, { title: 'Useful product improvement', type: 'feature', surfaces: ['frontend'] });
  setNeed(projectRoot, task.meta.id, 'Make the primary operator workflow easier to understand without expanding its scope.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The requested improvement directly supports the primary operator workflow and fits the documented product direction.',
    value: 'Operators should understand the existing workflow faster without learning a new product concept.',
    concerns: ['Keep the interaction model consistent with the existing product.']
  });

  const next = nextAction(projectRoot, task.meta.id);
  assert.equal(next.action, 'review-product-owner-opinion');
  assert.equal(next.actor, 'user');
  assert.equal(next.recommendedSkill, 'ai-flow-product-owner');
  assert.equal(next.interaction?.tool, 'request_user_input');
  assert.match(next.interaction?.presentation?.markdown || '', /requested improvement directly supports/i);
  const poGate = next.readiness.gates.find(gate => gate.id === 'product-owner-review');
  assert.equal(poGate?.status, 'fail');
  assert.equal(poGate?.owner, 'user');
  assert.throws(() => completePhase(projectRoot, task.meta.id), /Guided autonomy requires the user to review and acknowledge/i);

  decideProductOwnerReview(projectRoot, task.meta.id, 'proceed', 'Reviewed and accepted.');
  const acknowledged = nextAction(projectRoot, task.meta.id);
  assert.notEqual(acknowledged.action, 'review-product-owner-opinion');
  assert.notEqual(acknowledged.actor, 'user');
  assert.equal(acknowledged.readiness.gates.find(gate => gate.id === 'product-owner-review')?.status, 'pass');
});

test('Autonomous autonomy can continue after a clean Product Owner build verdict without human acknowledgement', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot); markCodeGraphReadyForTests(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/architecture.md'), '# Architecture\n\nConcrete repository boundaries and public contracts are documented for this project.\n');
  writeFileSync(path.join(projectRoot, '.ai/project/runbook.md'), '# Runbook\n\nUse the documented build, test, and validation commands before delivery.\n');
  completeProjectContext(projectRoot, 'Autonomous PO acknowledgement test');
  setAutonomyPolicy(projectRoot, 'autonomous');
  const task = createTask(projectRoot, { title: 'Safe product improvement', type: 'feature', surfaces: ['frontend'] });
  setNeed(projectRoot, task.meta.id, 'Improve an existing operator workflow without introducing a consequential product trade-off.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The feature fits the documented product direction and raises no consequential product decision.',
    value: 'Operators gain a clearer existing workflow without additional product concepts or permissions.'
  });

  const next = nextAction(projectRoot, task.meta.id);
  assert.notEqual(next.action, 'review-product-owner-opinion');
  assert.notEqual(next.actor, 'user');
  assert.equal(next.readiness.gates.find(gate => gate.id === 'product-owner-review')?.status, 'pass');
});

test('Project Product Owner review is deterministic, persistent, and requires human judgment for revision recommendations', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Collaborative folders', type: 'feature', surfaces: ['frontend'] });
  setNeed(projectRoot, task.meta.id, 'Let workspace members organize shared items together.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'revise',
    summary: 'The collaboration goal fits the product but ownership rules are unresolved.',
    value: 'Teams could organize shared work without duplicating content across workspaces.',
    concerns: ['Folder ownership may duplicate workspace permissions.'],
    questions: ['Who owns a shared folder?']
  });
  let status = productOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.needsHumanJudgment, true);
  assert.match(loadTask(findTask(projectRoot, task.meta.id)).body, /## Product Owner Review/);
  decideProductOwnerReview(projectRoot, task.meta.id, 'proceed', 'Accept the permission trade-off for specification.');
  status = productOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, true);
  assert.equal(status.needsHumanJudgment, false);
});

test('Product Owner review becomes stale when the product need changes', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Search', type: 'feature', surfaces: ['frontend'] });
  setNeed(projectRoot, task.meta.id, 'Help users find saved reports quickly.');
  recordProductOwnerReview(projectRoot, task.meta.id, { verdict: 'build', summary: 'Search directly addresses repeated navigation for saved reports.', value: 'Users can reach known reports with much less navigation effort.' });
  assert.equal(productOwnerReviewStatus(projectRoot, task.meta.id).valid, true);
  setNeed(projectRoot, task.meta.id, 'Help users discover reports they have never seen before.');
  const status = productOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.stale, true);
});

test('Target Audience requires a current primary profile and surfaces product trade-offs to the human', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: casual-user (primary)\n\nCasual users need obvious controls and low-friction saved workflows.\n');
  const created = createTask(projectRoot, { title: 'Saved filters', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation';
  task.meta.spec_effective_hash = 'approved-spec';
  saveTask(task);
  recordAudience(projectRoot, task.meta.id, {
    profileId: 'casual-user', primary: true, verdict: 'revise',
    comprehension: 'pass', utility: 'pass', discoverability: 'fail', friction: 'warn', trust: 'pass', repeatValue: 'pass',
    findings: ['The saved-filter action is useful once discovered but is visually hidden.'], requiresProductDecision: true
  });
  let status = targetAudienceReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.primaryReviews, 1);
  assert.equal(status.requiresProductDecision, true);
  const next = nextAction(projectRoot, task.meta.id);
  assert.equal(next.interaction?.tool, 'request_user_input');
  assert.match(next.interaction?.presentation?.markdown || '', /Target Audience Review/i);
  assert.match(next.interaction?.presentation?.markdown || '', /Discoverability/i);
  decideTargetAudienceReview(projectRoot, task.meta.id, 'accept', 'Accept discoverability trade-off for this release.');
  status = targetAudienceReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, true);
  assert.equal(status.requiresProductDecision, false);
});

test('Target Audience review is invalidated when audience definition changes', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: developer (primary)\n\nDevelopers need a concise CLI workflow with predictable behavior.\n');
  const created = createTask(projectRoot, { title: 'CLI search', type: 'feature', surfaces: ['cli'] });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation'; task.meta.spec_effective_hash = 'approved-spec'; saveTask(task);
  recordAudience(projectRoot, task.meta.id, {
    profileId: 'developer', primary: true, verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'pass', friction: 'pass', trust: 'pass', repeatValue: 'pass'
  });
  assert.equal(targetAudienceReviewStatus(projectRoot, task.meta.id).valid, true);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\nPrimary audience is now a non-technical operator.\n');
  const status = targetAudienceReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.stale, true);
});


test('Target Audience profiles require stable explicit users.md headings instead of inventing a fallback persona', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: Operator (primary)\n\nFast predictable workflows.\n\n## Persona: Auditor (secondary)\n\nTraceable decisions.\n');
  assert.deepEqual(configuredTargetAudienceProfiles(projectRoot), [
    { id: 'operator', label: 'Operator', primary: true, source: 'explicit' },
    { id: 'auditor', label: 'Auditor', primary: false, source: 'explicit' }
  ]);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\nA documented audience without an explicit stable profile heading, with enough prose to look superficially complete.\n');
  assert.deepEqual(configuredTargetAudienceProfiles(projectRoot), []);
  const status=productIntelligenceContextStatus(projectRoot);
  assert.equal(status.ready,false);
  assert.match(status.errors.join(' '),/defines 0 primary Target Audience profile/i);
});

test('Product Intelligence rejects artifact tampering instead of trusting editable JSON or Markdown', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Guarded product review', type: 'feature', surfaces: ['backend'] });
  setNeed(projectRoot, task.meta.id, 'Expose one product behavior without expanding the approved product scope.');
  recordProductOwnerReview(projectRoot, task.meta.id, { verdict: 'build', summary: 'The feature fits the documented product direction and can proceed safely.', value: 'It exposes a directly useful capability without adding a new product concept.' });
  assert.equal(productOwnerReviewStatus(projectRoot, task.meta.id).integrityValid, true);
  const reviewPath = path.join(projectRoot, '.ai/product-intelligence/product-owner', `${task.meta.id}.json`);
  const tampered = JSON.parse(readFileSync(reviewPath, 'utf8'));
  tampered.verdict = 'do-not-build';
  writeFileSync(reviewPath, `${JSON.stringify(tampered, null, 2)}\n`);
  const status = productOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.integrityValid, false);
  assert.throws(() => decideProductOwnerReview(projectRoot, task.meta.id, 'proceed', 'Do not reseal tampered input.'), /integrity is invalid/i);
});

test('Target Audience pass cannot conceal a failed dimension or an unknown project profile', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need obvious workflows.\n');
  const task = createTask(projectRoot, { title: 'Audience invariant', type: 'feature', surfaces: ['frontend'] });
  const doc = loadTask(findTask(projectRoot, task.meta.id));
  doc.meta.phase = 'final-customer'; doc.meta.status = 'customer_validation'; doc.meta.spec_effective_hash = 'approved'; saveTask(doc);
  assert.throws(() => recordAudience(projectRoot, task.meta.id, {
    profileId: 'operator', verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'fail', friction: 'pass', trust: 'pass', repeatValue: 'pass', findings: ['The feature is hidden.']
  }), /pass cannot contain a failed/i);
  assert.throws(() => recordAudience(projectRoot, task.meta.id, {
    profileId: 'invented-user', verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'pass', friction: 'pass', trust: 'pass', repeatValue: 'pass'
  }), /unknown target audience profile/i);
});

test('accepting one Target Audience trade-off never clears a separate failed audience review', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need obvious workflows.\n\n## Audience: auditor (secondary)\n\nAuditors need trustworthy traceability.\n');
  const task = createTask(projectRoot, { title: 'Mixed audience result', type: 'feature', surfaces: ['frontend'] });
  const doc = loadTask(findTask(projectRoot, task.meta.id)); doc.meta.phase = 'final-customer'; doc.meta.status = 'customer_validation'; doc.meta.spec_effective_hash = 'approved'; saveTask(doc);
  recordAudience(projectRoot, task.meta.id, {
    profileId: 'operator', verdict: 'revise', comprehension: 'pass', utility: 'pass', discoverability: 'warn', friction: 'pass', trust: 'pass', repeatValue: 'pass', findings: ['Discoverability is a conscious product trade-off.'], requiresProductDecision: true
  });
  recordAudience(projectRoot, task.meta.id, {
    profileId: 'auditor', verdict: 'reject', comprehension: 'pass', utility: 'fail', discoverability: 'pass', friction: 'pass', trust: 'fail', repeatValue: 'fail', findings: ['The result does not provide the traceability this audience requires.']
  });
  decideTargetAudienceReview(projectRoot, task.meta.id, 'accept', 'Accept only the operator discoverability trade-off.');
  const status = targetAudienceReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.requiresProductDecision, false);
  assert.equal(status.valid, false);
  assert.match(status.detail, /should be revised/i);
  assert.equal(status.reviews.find(review => review.profileId === 'auditor').humanDecision, null);
});

test('Target Audience decisions cannot reseal a tampered review as a valid human judgment', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need obvious workflows.\n');
  const task = createTask(projectRoot, { title: 'Audience integrity decision', type: 'feature', surfaces: ['frontend'] });
  const doc = loadTask(findTask(projectRoot, task.meta.id)); doc.meta.phase = 'final-customer'; doc.meta.status = 'customer_validation'; doc.meta.spec_effective_hash = 'approved'; saveTask(doc);
  recordAudience(projectRoot, task.meta.id, { profileId: 'operator', verdict: 'revise', comprehension: 'pass', utility: 'pass', discoverability: 'warn', friction: 'pass', trust: 'pass', repeatValue: 'pass', findings: ['A product trade-off needs a real decision.'], requiresProductDecision: true });
  const reviewPath = path.join(projectRoot, '.ai/product-intelligence/audience', task.meta.id, 'operator.json');
  const tampered = JSON.parse(readFileSync(reviewPath, 'utf8')); tampered.utility = 'fail'; writeFileSync(reviewPath, `${JSON.stringify(tampered, null, 2)}\n`);
  assert.equal(targetAudienceReviewStatus(projectRoot, task.meta.id).integrityValid, false);
  assert.throws(() => decideTargetAudienceReview(projectRoot, task.meta.id, 'accept', 'Do not legitimize tampering.'), /integrity is invalid/i);
});

test('Target Audience separates agent-owned implementation revision from human-owned product trade-offs', () => {
  const setup = (requiresProductDecision = false) => {
    const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
    writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need obvious workflows.\n');
    const created = createTask(projectRoot, { title: 'Audience routing', type: 'feature', surfaces: ['frontend'] });
    const task = loadTask(findTask(projectRoot, created.meta.id));
    task.body = setSection(task.body, 'Need', 'Make an existing workflow easier for operators to complete.');
    task.meta.phase = 'product-specifier'; task.meta.status = 'refining'; saveTask(task);
    recordProductOwnerReview(projectRoot, created.meta.id, { verdict: 'build', summary: 'The requested workflow improvement fits the product direction and user need.', value: 'Operators can complete the existing task with less confusion and repeated navigation.' });
    // restore final-customer because Product Owner review is intentionally a product-phase artifact fixture
    const finalTask = loadTask(findTask(projectRoot, created.meta.id)); finalTask.meta.phase = 'final-customer'; finalTask.meta.status = 'customer_validation'; finalTask.meta.spec_effective_hash = 'approved'; saveTask(finalTask);
    recordAudience(projectRoot, created.meta.id, { profileId: 'operator', verdict: 'revise', comprehension: 'pass', utility: 'pass', discoverability: 'fail', friction: 'warn', trust: 'pass', repeatValue: 'pass', findings: [requiresProductDecision ? 'The discoverability problem exposes a product-level navigation trade-off.' : 'The implementation is useful but hard to discover.'], requiresProductDecision });
    return { projectRoot, id: created.meta.id };
  };
  {
    const { projectRoot, id } = setup(false);
    assert.throws(() => resolveTargetAudienceDecision(projectRoot, id, 'revise-implementation', 'Pretend this was a human trade-off.'), /No unresolved Target Audience product trade-off/i);
    const result = routeTargetAudienceRevision(projectRoot, id, 'Improve discoverability.');
    assert.equal(result.task.meta.phase, 'builder');
    assert.equal(result.reviews[0].humanDecision, null);
  }
  {
    const { projectRoot, id } = setup(true);
    assert.throws(() => routeTargetAudienceRevision(projectRoot, id, 'Do not auto-route a product trade-off.'), /product trade-off/i);
    const result = resolveTargetAudienceDecision(projectRoot, id, 'revisit-product', 'Reconsider how this fits the product journey.');
    assert.equal(result.task.meta.phase, 'product-specifier');
    assert.equal(productOwnerReviewStatus(projectRoot, id).review, null);
  }
});


test('Target Audience freshness includes the implementation snapshot, not only evidence metadata', () => {
  const projectRoot = root();
  execFileSync('git', ['init'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.email', 'specrail@test.local'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'SpecRail Test'], { cwd: projectRoot });
  mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'src', 'feature.ts'), 'export const value = 1;\n');
  execFileSync('git', ['add', 'src/feature.ts'], { cwd: projectRoot });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: projectRoot });
  const baseline = String(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' })).trim();
  initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need predictable behavior they can understand without extra guidance.\n');
  const created = createTask(projectRoot, { title: 'Implementation freshness', type: 'feature', surfaces: ['cli'] });
  setBlastRadius(projectRoot, created.meta.id, { allowedFiles: ['src/feature.ts'], reason: 'Audience-visible behavior is implemented in this file.' });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.scope_baseline_commit = baseline;
  task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation'; task.meta.spec_effective_hash = 'approved-spec';
  saveTask(task);
  writeFileSync(path.join(projectRoot, 'src', 'feature.ts'), 'export const value = 2;\n');
  recordAudience(projectRoot, created.meta.id, {
    profileId: 'operator', verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'pass', friction: 'pass', trust: 'pass', repeatValue: 'pass'
  });
  assert.equal(targetAudienceReviewStatus(projectRoot, created.meta.id).valid, true);
  writeFileSync(path.join(projectRoot, 'src', 'feature.ts'), 'export const value = 3;\n');
  const status = targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.stale, true);
});

test('Target Audience configuration detects an impossible primary-profile minimum before asking for more reviews', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows with understandable controls.\n');
  const configPath = path.join(projectRoot, '.ai/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.productIntelligence.minPrimaryAudienceProfiles = 2;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const created = createTask(projectRoot, { title: 'Audience configuration', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation'; task.meta.spec_effective_hash = 'approved-spec'; saveTask(task);
  const status = targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(status.configurationValid, false);
  assert.equal(status.availablePrimaryProfiles, 1);
  const next = nextAction(projectRoot, created.meta.id);
  assert.equal(next.actor, 'user');
  assert.equal(next.action, 'resolve-target-audience-configuration');
  assert.match(next.readiness.blockers.find(item => item.id === 'target-audience-review')?.detail || '', /requires 2 primary profile/i);
});

test('final-customer compatibility phase emits Target Audience trace identity for new events', () => {
  const projectRoot = root(); initProject(projectRoot);
  const created = createTask(projectRoot, { title: 'Trace audience identity', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation'; saveTask(task);
  const event = recordTrace(projectRoot, task, 'audience-test');
  assert.equal(event.harness.actor, 'target-audience');
  assert.deepEqual(event.harness.skills, ['ai-flow-target-audience']);
});


test('explicit secondary audience profiles are never silently promoted to primary', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: auditor (secondary)\n\nAuditors inspect traceable decisions.\n\n## Audience: admin (secondary)\n\nAdmins configure the system.\n');
  const profiles = configuredTargetAudienceProfiles(projectRoot);
  assert.equal(profiles.length, 2);
  assert.equal(profiles.some(profile => profile.primary), false);
  assert.equal(productIntelligenceContextStatus(projectRoot).ready, false);
  assert.match(productIntelligenceContextStatus(projectRoot).errors.join(' '), /defines 0 primary Target Audience profile/i);
});


test('Product Owner and Target Audience commands reject placeholder product context when called out of sequence', () => {
  const projectRoot = root(); initProject(projectRoot);
  const po = createTask(projectRoot, { title: 'Premature PO review', type: 'feature', surfaces: ['frontend'] });
  assert.throws(() => recordProductOwnerReview(projectRoot, po.meta.id, { verdict: 'build', summary: 'This would otherwise be a concrete product review.', value: 'This would otherwise describe a concrete user value.' }), /requires concrete project product context/i);
  const audienceTask = loadTask(findTask(projectRoot, po.meta.id)); audienceTask.meta.phase = 'final-customer'; audienceTask.meta.status = 'customer_validation'; saveTask(audienceTask);
  assert.throws(() => recordAudience(projectRoot, po.meta.id, { profileId: 'primary-user', verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'pass', friction: 'pass', trust: 'pass', repeatValue: 'pass' }), /requires concrete product\.md and users\.md/i);
});

test('Target Audience review becomes stale when product context changes after the simulation', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title: 'Product context freshness', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id)); task.meta.phase = 'final-customer'; task.meta.status = 'customer_validation'; task.meta.spec_effective_hash = 'approved'; saveTask(task);
  recordAudience(projectRoot, created.meta.id, { profileId: 'operator', verdict: 'pass', comprehension: 'pass', utility: 'pass', discoverability: 'pass', friction: 'pass', trust: 'pass', repeatValue: 'pass' });
  assert.equal(targetAudienceReviewStatus(projectRoot, created.meta.id).valid, true);
  writeFileSync(path.join(projectRoot, '.ai/project/product.md'), '# Product\n\nThe product now serves a materially different workflow and value proposition that changes what useful success means.\n');
  assert.equal(targetAudienceReviewStatus(projectRoot, created.meta.id).stale, true);
});

test('Product Owner questions always require judgment even with a build verdict', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot); markCodeGraphReadyForTests(projectRoot);
  const task = createTask(projectRoot, { title: 'Questioned build', type: 'feature', surfaces: ['backend'] });
  setNeed(projectRoot, task.meta.id, 'Add a useful capability whose ownership rule still needs an explicit product decision.');
  const review = recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The capability fits the product direction but one consequential ownership rule remains unresolved.',
    value: 'Users gain a useful workflow once ownership behavior is defined consistently.',
    questions: ['Who owns an item after the original workspace owner leaves?']
  });
  assert.equal(review.judgmentRequired, true);
  setAutonomyPolicy(projectRoot, 'autonomous');
  const next = nextAction(projectRoot, task.meta.id);
  assert.equal(next.actor, 'user');
  assert.equal(next.action, 'resolve-product-owner-recommendation');
});

test('Product Owner freshness includes task risk/routing and durable project learning', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Durable product decision', type: 'feature', surfaces: ['backend'], risk: 'low' });
  setNeed(projectRoot, task.meta.id, 'Add a bounded workflow that should remain aligned with durable product constraints.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The bounded workflow matches the current product direction and has no unresolved trade-off.',
    value: 'It removes repeated user effort without adding a new product concept.'
  });
  let changed = loadTask(findTask(projectRoot, task.meta.id));
  changed.meta.risk = 'high';
  saveTask(changed);
  assert.equal(productOwnerReviewStatus(projectRoot, task.meta.id).stale, true);

  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The higher-risk workflow still matches the product direction after explicit reconsideration.',
    value: 'It removes repeated user effort while preserving the documented product boundary.'
  });
  writeFileSync(path.join(projectRoot, '.ai/project/learnings.md'), '# Learnings\n\nAvoid adding this workflow when the same outcome can be achieved through the existing primary action.\n');
  assert.equal(productOwnerReviewStatus(projectRoot, task.meta.id).stale, true);
});

test('durable learnings do not retroactively stale the Product Owner gate after specification approval', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Learning-safe approval', type: 'feature', surfaces: ['backend'] });
  setNeed(projectRoot, task.meta.id, 'Add a bounded operator workflow that is reviewed by the Product Owner before its specification is sealed.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The bounded workflow fits the documented product direction and has no unresolved product trade-off.',
    value: 'Operators gain a useful workflow without adding an unrelated product concept.'
  });
  decideProductOwnerReview(projectRoot, task.meta.id, 'proceed', 'Acknowledge the Product Owner opinion before approval.');
  let approved = loadTask(findTask(projectRoot, task.meta.id));
  approved.meta.spec_integrity_version = 2;
  approved.meta.project_governance_hash = projectGovernanceHash(projectRoot);
  approved.meta.spec_approval = 'approved';
  approved.meta.spec_approval_hash = specificationHash(approved);
  saveTask(approved);
  writeFileSync(path.join(projectRoot, '.ai/project/learnings.md'), '# Project Learnings\n\n## OTHER-TASK\n\nA later completed task discovered a durable product fact that should influence future Product Owner reviews.\n');
  assert.equal(productOwnerReviewStatus(projectRoot, task.meta.id).stale, true, 'the live PO source correctly notices that project learning changed');
  const gate = taskReadiness(projectRoot, task.meta.id).gates.find(item => item.id === 'product-owner-review');
  assert.equal(gate.status, 'pass');
  assert.equal(gate.owner, 'system');
  assert.match(gate.detail, /sealed into the approved specification/i);
});

test('Product Owner decisions reject invalid runtime values instead of trusting TypeScript callers', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Decision validation', type: 'feature', surfaces: ['backend'] });
  setNeed(projectRoot, task.meta.id, 'Add one explicit product behavior that can be reviewed before specification.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'revise',
    summary: 'The feature direction needs a consequential product choice before it can proceed safely.',
    value: 'A clarified direction could remove user friction without creating contradictory behavior.'
  });
  assert.throws(() => decideProductOwnerReview(projectRoot, task.meta.id, 'invented-decision'), /Invalid Product Owner decision/i);
});

test('legacy final-customer projects keep the legacy skill when Product Intelligence is disabled', () => {
  const projectRoot = root(); initProject(projectRoot); setProductIntelligenceEnabled(projectRoot, false);
  const task = createTask(projectRoot, { title: 'Legacy customer validation', type: 'feature', surfaces: ['frontend'] });
  const doc = loadTask(findTask(projectRoot, task.meta.id));
  doc.meta.phase = 'final-customer';
  doc.meta.status = 'customer_validation';
  doc.meta.route.final_customer = true;
  doc.meta.route.target_audience = false;
  saveTask(doc);
  const next = nextAction(projectRoot, task.meta.id);
  assert.equal(next.actor, 'ai-flow-final-customer');
  assert.equal(next.recommendedSkill, 'ai-flow-final-customer');
  assert.equal(next.runtime.role, 'reviewer');
  assert.equal(next.runtime.boundary, null);
  assert.equal(next.runtime.stopBeforePhaseWork, false);
});

test('stale Target Audience batches are atomically replaced when current profiles are re-simulated', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators need predictable workflows.\n\n## Audience: auditor (secondary)\n\nAuditors need traceable outcomes.\n');
  const created = createTask(projectRoot, { title: 'Audience batch refresh', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; saveTask(task);
  recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' });
  recordAudience(projectRoot, created.meta.id, { profileId:'auditor', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' });
  assert.equal(targetAudienceReviewStatus(projectRoot, created.meta.id).reviews.length,2);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators now need an even simpler and more discoverable workflow after a product-context revision.\n');
  assert.equal(targetAudienceReviewStatus(projectRoot, created.meta.id).stale,true);
  recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' });
  const refreshed=targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(refreshed.stale,false);
  assert.equal(refreshed.valid,true);
  assert.deepEqual(refreshed.reviews.map(review=>review.profileId),['operator']);
});


test('invalid fresh Target Audience input never destroys the previous stale batch', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title: 'Audience transactional refresh', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; saveTask(task);
  recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' });
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators now require a simpler workflow after a product-context change.\n');
  const stale = targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(stale.stale, true);
  assert.equal(stale.reviews.length, 1);
  assert.throws(() => recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'fail', friction:'pass', trust:'pass', repeatValue:'pass' }), /pass cannot contain a failed audience dimension/i);
  const after = targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(after.stale, true);
  assert.equal(after.reviews.length, 1);
  assert.equal(after.integrityValid, true);
});

test('corrupted stale Target Audience batches fail closed until an explicit forced reset', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title: 'Audience corruption recovery', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; saveTask(task);
  recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' });
  const reviewFile = path.join(projectRoot, '.ai/product-intelligence/audience', created.meta.id, 'operator.json');
  const tampered = JSON.parse(readFileSync(reviewFile, 'utf8'));
  tampered.findings = ['tampered outside the governed command'];
  writeFileSync(reviewFile, `${JSON.stringify(tampered, null, 2)}\n`);
  writeFileSync(path.join(projectRoot, '.ai/project/users.md'), '# Users\n\n## Audience: operator (primary)\n\nOperators now require a changed workflow after a product-context revision.\n');
  assert.throws(() => recordAudience(projectRoot, created.meta.id, { profileId:'operator', verdict:'pass', comprehension:'pass', utility:'pass', discoverability:'pass', friction:'pass', trust:'pass', repeatValue:'pass' }), /stale and its stored integrity is invalid/i);
  assert.throws(() => resetTargetAudienceReviews(projectRoot, created.meta.id), /integrity is invalid/i);
  resetTargetAudienceReviews(projectRoot, created.meta.id, { force: true, reason: 'operator recovery after integrity failure' });
  const reset = targetAudienceReviewStatus(projectRoot, created.meta.id);
  assert.equal(reset.reviews.length, 0);
  assert.equal(reset.valid, false);
});


test('forced Target Audience reset recovers even from malformed JSON artifacts', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title: 'Malformed audience recovery', type: 'feature', surfaces: ['frontend'] });
  const task = loadTask(findTask(projectRoot, created.meta.id)); task.meta.phase='final-customer'; task.meta.status='customer_validation'; task.meta.spec_effective_hash='approved'; saveTask(task);
  const dir=path.join(projectRoot,'.ai/product-intelligence/audience',created.meta.id); mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,'operator.json'),'{broken json');
  assert.throws(()=>targetAudienceReviewStatus(projectRoot,created.meta.id),/JSON/i);
  assert.doesNotThrow(()=>resetTargetAudienceReviews(projectRoot,created.meta.id,{force:true,reason:'recover malformed artifact'}));
  assert.equal(targetAudienceReviewStatus(projectRoot,created.meta.id).reviews.length,0);
});

test('forced Product Owner reset provides fail-closed recovery from malformed review artifacts', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title: 'Malformed PO recovery', type: 'feature', surfaces: ['backend'] });
  const dir=path.join(projectRoot,'.ai/product-intelligence/product-owner'); mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,`${created.meta.id}.json`),'{broken json');
  assert.throws(()=>productOwnerReviewStatus(projectRoot,created.meta.id),/JSON/i);
  assert.doesNotThrow(()=>resetProductOwnerReview(projectRoot,created.meta.id,{force:true,reason:'recover malformed artifact'}));
  assert.equal(productOwnerReviewStatus(projectRoot,created.meta.id).review,null);
});


test('a human Product Owner rejection can never be reinterpreted as a valid clean build review', () => {
  const projectRoot = root(); initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const task = createTask(projectRoot, { title: 'Reject clean PO recommendation', type: 'feature', surfaces: ['backend'] });
  setNeed(projectRoot, task.meta.id, 'Add a bounded operator capability whose product value is reviewed before specification.');
  recordProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'build',
    summary: 'The bounded capability fits the documented product and can be specified without introducing a conflicting concept.',
    value: 'Operators gain a useful workflow improvement with limited additional product complexity.'
  });
  decideProductOwnerReview(projectRoot, task.meta.id, 'reject', 'Do not build this feature despite the favorable recommendation.');
  const status = productOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.needsHumanJudgment, false);
  assert.match(status.detail, /does not authorize specification work/i);
});


function finalOwnerFixture(projectRoot, title = 'Final product outcome') {
  initProject(projectRoot); readyProductIntelligenceContext(projectRoot);
  const created = createTask(projectRoot, { title, type: 'design', surfaces: [] });
  const task = loadTask(findTask(projectRoot, created.meta.id));
  task.meta.phase = 'final-approval'; task.meta.status = 'awaiting_final_approval'; task.meta.waiting_for = 'none';
  task.meta.spec_approval = 'approved'; task.meta.spec_approval_hash = 'approved-spec'; task.meta.spec_effective_hash = 'approved-spec';
  task.meta.route = { ...task.meta.route, implementation: false, technical_review: 'none', qa: 'none', target_audience: false, final_customer: false };
  task.body = setSection(task.body, 'Need', 'Verify that the implemented product outcome still serves the intended user value before shipping.');
  saveTask(task);
  return task;
}

test('Final Product Owner is required by default when Product Intelligence is enabled', () => {
  const projectRoot = root(); initProject(projectRoot);
  assert.equal(finalProductOwnerRequired(projectRoot), true);
});

test('Final Product Owner review is integrity/freshness sealed and Guided requires explicit acknowledgement', () => {
  const projectRoot = root(); const task = finalOwnerFixture(projectRoot);
  const review = recordFinalProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'ship',
    summary: 'The delivered outcome matches the original product intent without introducing a new user-facing concept.',
    value: 'Users receive the intended outcome with the same bounded product model and no unnecessary complexity.'
  });
  assert.equal(review.verdict, 'ship');
  assert.equal(finalProductOwnerReviewStatus(projectRoot, task.meta.id).valid, true);
  const stored = loadTask(findTask(projectRoot, task.meta.id));
  assert.match(stored.body, /## Product Owner Final Review/);
  assert.ok(stored.meta.product_owner_final_review_digest);
  resolveFinalProductOwnerDecision(projectRoot, task.meta.id, 'proceed', 'Reviewed final product outcome in Guided mode.');
  assert.equal(finalProductOwnerReviewStatus(projectRoot, task.meta.id).review?.humanDecision, 'proceed');
  writeFileSync(path.join(projectRoot, '.ai/project/product.md'), '# Product\n\nA materially changed product direction that invalidates the prior final product judgment and requires a fresh review.\n');
  assert.equal(finalProductOwnerReviewStatus(projectRoot, task.meta.id).stale, true);
});

test('Final Product Owner revision decisions route back mechanically and cannot authorize final approval', () => {
  const projectRoot = root(); const task = finalOwnerFixture(projectRoot, 'Outcome needs revision');
  recordFinalProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'revise',
    summary: 'The implementation is functional but the resulting workflow adds avoidable friction compared with the intended product outcome.',
    value: 'The feature remains valuable only if the implementation returns to the simpler workflow promised by the specification.',
    concerns: ['The result adds an unnecessary interaction step.']
  });
  const status = finalProductOwnerReviewStatus(projectRoot, task.meta.id);
  assert.equal(status.valid, false);
  assert.equal(status.needsHumanJudgment, true);
  const routed = resolveFinalProductOwnerDecision(projectRoot, task.meta.id, 'revise-implementation', 'Reduce the avoidable interaction step.');
  assert.equal(routed.task.meta.phase, 'builder');
  assert.equal(finalProductOwnerReviewStatus(projectRoot, task.meta.id).review, null);
});

test('Final Product Owner forced reset recovers malformed artifacts fail closed', () => {
  const projectRoot = root(); const task = finalOwnerFixture(projectRoot, 'Corrupt final PO recovery');
  recordFinalProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'ship',
    summary: 'The implemented outcome remains aligned with the product intent and the intended user journey.',
    value: 'The user receives the approved value without additional product complexity or hidden trade-offs.'
  });
  const file = path.join(projectRoot, '.ai/product-intelligence/product-owner-final', `${task.meta.id}.json`);
  writeFileSync(file, '{ malformed');
  assert.throws(() => finalProductOwnerReviewStatus(projectRoot, task.meta.id));
  resetFinalProductOwnerReview(projectRoot, task.meta.id, { force: true, reason: 'recover malformed final Product Owner artifact' });
  assert.equal(finalProductOwnerReviewStatus(projectRoot, task.meta.id).review, null);
});


test('Final Review Bundle preserves the resolved final Product Owner outcome opinion for user audit', () => {
  const projectRoot = root(); const task = finalOwnerFixture(projectRoot, 'Final bundle product outcome');
  recordFinalProductOwnerReview(projectRoot, task.meta.id, {
    verdict: 'ship',
    summary: 'The delivered result preserves the approved product outcome and remains coherent with the intended workflow.',
    value: 'Operators receive the promised value without an additional product concept or avoidable interaction cost.'
  });
  resolveFinalProductOwnerDecision(projectRoot, task.meta.id, 'proceed', 'Outcome opinion accepted before final review.');
  const bundle = writeReviewBundle(projectRoot, task.meta.id, 'final');
  const markdown = readFileSync(bundle.path, 'utf8');
  assert.match(markdown, /## Product Owner Final Review/);
  assert.match(markdown, /Verdict:\s+ship/i);
  assert.match(markdown, /Outcome opinion accepted before final review/i);
});
