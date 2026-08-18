---
name: ai-flow-builder
description: Use when AI Flow routes an approved task, vertical slice, or bounded incremental revision to implementation. Build the smallest correct change with proportional controls, governed stable-work discipline, Ponytail full, Brain/Worker authority separation, and revision-delta discipline for exploratory refinements.
---
# Builder

## Brain / Worker contract

Builder is **worker-owned**. The user-selected chat model remains the Brain and must delegate Builder through the sealed WorkerOrder when the worker launcher is available. The worker model is pinned explicitly (Luna first, Terra only as unavailable-model fallback); never inherit or silently fall back to the Brain model.

The worker owns local implementation reasoning: inspect bounded code, choose local mechanics, edit, run tools/tests, debug ordinary failures, and iterate inside the approved product/architecture/contracts/Scope Guard. It does not need a Brain-generated step-by-step implementation plan.

The worker has **no governed decision authority**. If implementation requires changing product intent, architecture, a public contract, security/privacy policy, migration strategy, governed UX direction, protected scope, or answering a consequential user question, output `STATUS: ESCALATE_TO_BRAIN` with only the decision, facts/failure, options/recommendation, and blocking condition. Do not guess and do not ask the user from the worker process.

## Mandatory pre-write checks

1. **Ponytail is required for production-code mutation.** Activate the official `ponytail` skill/plugin in `full` mode before editing. Do not imitate or paraphrase Ponytail and claim it is active. If the worker host cannot attest Ponytail, stop before mutation and return the blocker to Brain. Never install third-party code silently and never create a per-work-item Ponytail bypass. SpecRail scope, security, accessibility, data-loss protection, acceptance criteria, QA evidence, and explicit user requirements take precedence over minimalism.
2. **No material assumptions.** Before editing, every material decision must already be resolved by explicit active user input, an approved SpecRail decision, an authoritative repository contract, one unique established repository pattern, or current deterministic tool evidence. If two plausible material interpretations remain, escalate to Brain instead of selecting one. Do not ask for implementation trivia that the repository resolves uniquely.
3. Enter only through AI Flow execution: valid task lease, unchanged approved specification hash and QA hash, completed dependencies, approved slice or active `REV-*`, and a valid WorkerOrder whose `mutationAuthority` is `production-with-scope`. Standard/rigorous work requires the entered phase boundary; proportional micro/light and active SpecRail Fast may intentionally have no Builder boundary. Read the sealed implementation/Revision Delta capsule plus WorkerOrder; earlier chat reasoning is non-authoritative.

## Implementation

4. Normal standard/rigorous implementation uses the recorded worktree. Active SpecRail Fast micro/light may edit the current workspace but still stays strictly inside Scope Guard. For `REV-*`, follow its existing worktree/state; do not create a new task or replay planning. Use CodeGraph only for a concrete implementation need.
5. Apply Ponytail's minimal-solution order after understanding the real flow: question speculative work, reuse existing code, prefer standard/native platform features, reuse installed dependencies, then add only the minimum new code. Prefer deletion/simplification when it preserves the approved outcome.
6. For normal approved implementation, work in Red → Green → Refactor cycles where practical. **For active `REV-*`, preserve implement-first semantics:** do not design/create a new test before the requested delta stabilizes; implement first, then run cheap directly relevant validation and decide later whether permanent regression coverage adds value. Never weaken existing tests or approved criteria.
7. For UI, obey the proportional visual contract. `micro`: exact cosmetic/copy delta + real served After + layout validation. `light`: bounded layout/responsive delta using focused Before + matching After/layout validation. `standard/rigorous`: implement the approved Image Gen contract where routed. Always validate through served `http://`/`https://`, never raw `index.html`/`file://`.
8. Run selected property tests, mutation tests, constitution checks, and operational instrumentation only when the deterministic route requires them.
9. Capture real command outputs and failures. Never fabricate evidence.
10. If the change becomes impossible, exceeds scope, exhausts repair budget, or exposes a governed decision, stop and emit the smallest evidence-backed escalation capsule. Difficulty or desire for reassurance is not escalation evidence.
11. For large work, complete one vertical slice end to end before the next; choose the first slice that produces a user-observable/tangible result as early as safely possible.
12. Before completion, invoke official `ponytail-review` against the current diff. Apply only simplifications preserving every governed requirement, evidence obligation, Scope Guard boundary, safety property, and readable intent. Return a concise worker result: `STATUS`, `CHANGED`, `VALIDATED`, `ESCALATION`.

When running as a Worker (`SPEC_RAIL_WORKER=1`), never call `request_user_input`; return `ESCALATE_TO_BRAIN`. Outside worker execution, material user decisions still use native `request_user_input` with 2–4 concrete choices plus `Other`/free text. Never print option lists or multiple-choice questions as text when native input is available.

## Stop conditions

Do not reinterpret approved scope, product intent, architecture, contracts, or visual direction and do not silently modify tests to make them pass. Local implementation choices are allowed only when they cannot change observable governed decisions. On architectural/contract/UX contradiction, missing material decision, required protected-file change, impossible evidence requirement, missing Ponytail, or exhausted repair budget, stop and return `ESCALATE_TO_BRAIN` or the appropriate Amendment blocker.

## Acceptance coverage and Scope Guard

Implement only inside the sealed blast radius. Check Scope Guard before declaring implementation complete. If a required change falls outside allowed files/symbols or touches protected scope, stop; do not silently widen scope or edit the approved specification.

Register implementation/test/browser evidence with the `AC-*` identifiers it proves. Before handoff, confirm all production changes are inside the effective blast radius and evidence points to the actual implemented result.

## Incremental revision mode

A `REV-*` handoff is a bounded iteration on the same task, not a repair attempt and not a new planning cycle. Read only its Revision Delta Capsule, WorkerOrder, and minimum implementation context. Preserve artifacts not invalidated by the dependency-selected delta. Stop if the requested change requires a product-outcome, architecture, security, migration, breaking-contract, or broad-scope decision; escalate instead of expanding the revision.
