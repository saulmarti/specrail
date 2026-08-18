# Sparse Intelligence

Status: implementation branch `feat/sparse-intelligence-routing`.

## Problem

SpecRail was intended to separate high-value judgment from faster implementation, but a workflow can lose that advantage if the strongest model expands the request into detailed specification, planning, tests, risk analysis, and implementation instructions before the executor starts. The executor then saves only the cheapest part of the work.

The optimization target is therefore not “use a small model for Builder”. It is **minimize strong-model work while preserving the decisions where its marginal quality gain matters**.

## Research basis

The design follows five converging findings:

1. **Anthropic, Harness design for long-running application development (2026-03-24):** their planner was deliberately constrained to product context and high-level technical design rather than granular implementation because wrong detail cascades downstream. Their updated run spent $0.46 on planning versus most cost in Builder, and they removed harness components as model capability made them unnecessary.
2. **RouteLLM (ICLR 2025):** learned routing between stronger/weaker models reduced cost by more than 2x on its evaluated settings without sacrificing response quality.
3. **RouteLMT (2026):** the useful routing signal is the expected *marginal gain* of the strong model over the weak one, not task difficulty by itself.
4. **Cluster, Route, Escalate (2026):** route cheaply first and escalate only low-quality/low-confidence cases; the evaluated cascade retained 97–99% of strongest-model accuracy on its datasets.
5. **ZEBRA (2026):** budget should be allocated across phases according to measured utility rather than uniformly or by an unconstrained LLM controller. On its APPS experiment, 50% budget retained 94.4% of unconstrained quality versus 88.1% for direct LLM allocation.

Context-efficiency work such as SWE-Pruner reinforces the same direction for coding agents: repository/tool context should be task-selected rather than accumulated globally.

These results are evidence for the architecture, not direct performance promises for SpecRail. SpecRail must validate the policy on its own Replay cohorts.

## Core rule

> Start with the cheapest capable executor. Spend frontier intelligence only when a stronger reasoning pass has a concrete expected marginal benefit, then return immediately to the executor.

`micro/light/standard/rigorous` remains a **governance/control profile**, not a model selector. `Guided/Autonomous/Headless` remains an **authority policy**, not a model selector. Sparse Intelligence is a third orthogonal dimension.

## Capability tiers

- `none`: deterministic or human-owned step; no model capability is required.
- `executor`: default tier. Owns local repository inspection, implementation reasoning, edits, tool use, ordinary debugging, and focused verification.
- `frontier`: scarce judgment tier. Owns only a bounded material decision where stronger reasoning is expected to change the quality of the result.

SpecRail does not name providers/models and does not claim to switch them. Codex/Pi/the host owns the actual selector. `next.intelligence` is the deterministic capability recommendation that adapters can implement when the host supports it.

## Decision-first, not plan-first

A frontier pass produces a compact decision capsule, not a long plan:

- exact decision;
- governed constraints;
- supporting repository/product facts;
- recommendation/options when applicable;
- stop/escalation condition.

Target size: <= 900 words and normally much less.

Forbidden frontier work:

- step-by-step Builder implementation plan;
- repository-wide restatement;
- full conversation replay;
- speculative implementation mechanics;
- boilerplate acceptance/test prose that deterministic code or the executor can derive.

The Product Owner can remain a frontier role because it answers **what/why**. Normal Product Specifier mechanics default to executor. Builder remains executor-owned even on high-risk work once the governed product/architecture decisions are sealed.

## Evidence-first escalation

Difficulty alone is not escalation evidence. Executor escalation requires at least one concrete trigger:

1. a material product/architecture/contract/security/migration/UX decision remains unsealed after authoritative repository lookup;
2. two materially different governed interpretations remain after approved decisions and repository facts are exhausted;
3. concrete failing tool/test/runtime evidence cannot be repaired inside existing authority;
4. independent review finds a high-impact uncertainty that stronger reasoning can resolve without inventing user intent.

An escalation capsule carries only the exact decision, constraints, observed facts/failures, executor recommendation/options, and stop condition. New frontier retries require new evidence rather than repeated reasoning over the same state.

## Tangible-first interaction

Sparse Intelligence and Tangible-First reinforce each other:

`decision -> executor -> first tangible slice -> feedback -> executor -> stabilize -> selected verification`

The strongest model should not consume a large token budget before the first observable diff/output unless the missing decision genuinely blocks safe implementation.

## Measurement

Only host-reported usage is accepted. Cached input is a subset of input; reasoning tokens are diagnostic metadata and are not added again to total tokens.

Track at minimum:

- executor tokens/calls;
- frontier tokens/calls;
- frontier token share;
- usage by phase;
- model identity;
- repair attempts and accepted outcome from Replay.

Later host instrumentation should add:

- tokens before first mutation/tangible output;
- time to first tangible output;
- frontier escalations with trigger/evidence;
- discarded implementation after user feedback.

Do **not** hard-code a target frontier percentage before Replay supplies an empirical quality/cost frontier. The desired invariant is qualitative first: frontier must be a minority resource whose use has an evidence-backed reason.

## Rollout

### Stage 1 — deterministic contract (current branch)

- `intelligence-routing.ts` exposes `none/executor/frontier` recommendations.
- `next` exposes the recommendation.
- Product Owner frontier output is bounded.
- Product Specifier defaults to executor for normal specification and stops pre-solving implementation.
- Builder is explicitly executor-owned and can create evidence-backed escalations.
- `intelligence-metrics.ts` computes exact host-reported frontier share without double counting.

### Stage 2 — host/runtime accounting

Persist per-call usage records with tier, phase, actor, model, and host-reported tokens. Surface them in Replay/Review Cockpit and compare only economically comparable cohorts.

### Stage 3 — escalation state

Add a sealed frontier-decision request/result artifact so an executor can stop on a concrete decision, hand only a compact capsule to a stronger tier, then resume without replaying planning context.

### Stage 4 — adaptive routing

Use Replay history to estimate whether frontier escalation improves accepted quality/rework for semantic cohorts. Recommendations remain conservative until sufficient comparable evidence exists. Never learn from estimated token counts or mix incomparable model identities/prices without an explicit normalization policy.

## Non-goals

- a second Fast workflow;
- automatic silent provider/model switching;
- replacing human-owned product decisions;
- weakening Scope Guard, security, acceptance, evidence, or final approval;
- making the executor deliberately incapable so frontier must rescue it.
