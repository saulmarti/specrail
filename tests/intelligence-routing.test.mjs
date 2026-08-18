import test from 'node:test';
import assert from 'node:assert/strict';
import { intelligenceRecommendation } from '../dist/src/lib/intelligence-routing.js';
import { summarizeIntelligenceUsage, validateIntelligenceUsage } from '../dist/src/lib/intelligence-metrics.js';

function task({ phase = 'product-specifier', type = 'feature', risk = 'medium', profile = 'standard', architecture = false, database = false, workflowMode = 'standard' } = {}) {
  return {
    path: '/tmp/TASK-0001.md',
    body: '',
    meta: {
      id: 'TASK-0001', title: 'Sparse intelligence test', type, status: 'refining', phase,
      size: 'medium', risk, execution_profile: 'standard', workflow_mode: workflowMode,
      surfaces: ['backend'],
      route: {
        design: false, architecture, database, implementation: true,
        technical_review: profile === 'rigorous' ? 'full' : 'focused', qa: 'focused', target_audience: false,
        final_customer: false, mutation_testing: false, property_testing: 'none', observability: 'none',
        control_profile: profile
      },
      spec_approval: 'pending', spec_approval_hash: null, spec_approved_at: null, qa_mission_hash: null,
      delivery_strategy: 'single', slice_ids: [], final_approval: 'pending', waiting_for: 'none', open_questions: 0,
      learning_recorded: false, dependencies: [], resume_status: null, resume_phase: null, worktree_path: null,
      worktree_branch: null, worktree_base: null, delivery_status: 'pending', created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString()
    }
  };
}

test('normal specification defaults to executor instead of spending frontier tokens on planning', () => {
  const result = intelligenceRecommendation(task(), { actor: 'ai-flow-product-specifier', action: 'bootstrap-project-and-refine', recommendedSkill: 'ai-flow-product-specifier' });
  assert.equal(result.tier, 'executor');
  assert.equal(result.routingPrinciple, 'marginal-gain');
  assert.equal(result.hostOwnedSelection, true);
  assert.match(result.reason, /does not by itself justify frontier planning/i);
});

test('material architecture specification uses frontier only for the decision envelope', () => {
  const result = intelligenceRecommendation(task({ type: 'architecture', architecture: true }), { actor: 'ai-flow-product-specifier', action: 'continue', recommendedSkill: 'ai-flow-product-specifier' });
  assert.equal(result.tier, 'frontier');
  assert.equal(result.frontierOutput.mode, 'decision-only');
  assert.ok(result.frontierOutput.forbidden.includes('step-by-step implementation plan'));
});

test('builder stays executor-owned even for rigorous high-risk work', () => {
  const result = intelligenceRecommendation(task({ phase: 'builder', risk: 'high', profile: 'rigorous', architecture: true }), { actor: 'ai-flow-builder', action: 'continue', recommendedSkill: 'ai-flow-builder' });
  assert.equal(result.tier, 'executor');
  assert.equal(result.escalation.allowed, true);
  assert.ok(result.escalation.triggers.some(item => /architecture|contract|security/i.test(item)));
});

test('explicit Product Owner judgment is frontier while human/deterministic gates use no model tier', () => {
  const owner = intelligenceRecommendation(task(), { actor: 'ai-flow-product-owner', action: 'product-owner-review', recommendedSkill: 'ai-flow-product-owner' });
  assert.equal(owner.tier, 'frontier');
  const human = intelligenceRecommendation(task(), { actor: 'user', action: 'approve-or-refine-specification', recommendedSkill: null });
  assert.equal(human.tier, 'none');
});

test('token summary measures frontier share without double-counting cached or reasoning tokens', () => {
  const summary = summarizeIntelligenceUsage([
    { source: 'host-reported', tier: 'executor', phase: 'builder', actor: 'ai-flow-builder', model: 'fast-model', inputTokens: 8000, cachedInputTokens: 3000, outputTokens: 2000, reasoningTokens: 400 },
    { source: 'host-reported', tier: 'frontier', phase: 'product-specifier', actor: 'ai-flow-product-specifier', model: 'frontier-model', inputTokens: 1200, cachedInputTokens: 200, outputTokens: 300, reasoningTokens: 100 }
  ]);
  assert.equal(summary.totalTokens, 11500);
  assert.equal(summary.executorTokens, 10000);
  assert.equal(summary.frontierTokens, 1500);
  assert.equal(summary.uncachedInputTokens, 6000);
  assert.equal(summary.reasoningTokens, 500);
  assert.equal(summary.frontierTokenShare, 1500 / 11500);
  assert.equal(summary.frontierCalls, 1);
  assert.equal(summary.executorCalls, 1);
});

test('token accounting fails closed on unverifiable/inconsistent usage', () => {
  assert.throws(() => validateIntelligenceUsage({ source: 'host-reported', tier: 'executor', phase: 'builder', actor: 'builder', model: 'x', inputTokens: 100, cachedInputTokens: 101, outputTokens: 10 }), /cached input tokens cannot exceed input tokens/i);
  assert.throws(() => validateIntelligenceUsage({ source: 'estimated', tier: 'executor', phase: 'builder', actor: 'builder', model: 'x', inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 }), /host-reported token usage only/i);
});
