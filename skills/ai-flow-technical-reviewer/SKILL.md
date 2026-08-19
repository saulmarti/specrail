---
name: ai-flow-technical-reviewer
description: Use when AI Flow routes architecture/database judgment or independent technical review. Material architecture/data choices stay Brain-owned; code/security/performance/visual/quality review analysis runs as an isolated worker and returns evidence-backed findings for governed decisions.
---
# Technical Reviewer

## Brain / Worker boundary

When phase is `technical-architecture`, the user-selected **Brain** owns the material architecture/database decision. Use compact repository facts/alternatives and seal the decision, constraints, consequences, migration/rollback, and stop conditions; do not pre-solve Builder.

When phase is `technical-reviewer`, review analysis is **worker-owned**. The worker independently inspects diff/evidence, executes routed checks, and returns prioritized findings. It may classify technical defects inside approved authority, but any requirement to change product intent, architecture, public contracts, security/privacy policy, migration strategy, governed UX, or Scope Guard returns `STATUS: ESCALATE_TO_BRAIN`.

Before independent review, require an entered review phase boundary. If `next.runtime.stopBeforePhaseWork` is true, do not review in that turn. On continuation enter the boundary, refresh `specrail next`, then use deterministic reviewer handoff/WorkerOrder. Builder chat reasoning is non-authoritative.

1. Compare the task branch with base and approved specification/QA Mission. Use deterministic review handoff as fresh starting context and active CodeGraph host transport for boundaries/impact. Do not replay Builder conversation.
2. Run only routed modes: architecture/database, code review, visual evaluation, security, performance, property testing, mutation testing, or operational review.
3. Enforce active project constitution principles with deterministic commands. A failing principle blocks progression.
4. For property/mutation testing, target changed behavior and report commands, scores/survivors, important gaps, and exit status. Do not run expensive mutation suites for low-risk cosmetic work.
5. For material UI, use fresh context and canonical evidence. Verify exact target, source fidelity, mobile readability, overflow/clipping/overlap, consistency, and routed visual score. Bind report to canonical visual evidence digest; do not alter approved proposal.
6. For Brain-owned architecture/database judgment, provide editable source/diagram where routed, alternatives, consequences, migration/rollback, and risks. A review worker may gather those facts but cannot choose the governed alternative.
7. Review required logs/traces/metrics from real execution; verify they explain selected operational behavior without leaking sensitive data.
8. Save registered evidence with prioritized actionable findings. Repeated failures feed the eval loop and finite repair budget.

When `SPEC_RAIL_WORKER=1`, never call `request_user_input`; return `ESCALATE_TO_BRAIN` for material decisions. Outside worker mode use native `request_user_input`. Never print option lists or multiple-choice questions as text when native input is available.

## Governance review

Review effective specification (base + approved amendments), Acceptance Coverage Matrix, and Scope Guard. Unexpected files, protected changes, unknown acceptance references, or criteria supported only by conceptual/before evidence are blocking findings. For a legitimate new dependency, return an Amendment request instead of normalizing scope drift.
