---
name: ai-flow-builder
description: Use when AI Flow routes an approved task, vertical slice, or bounded incremental revision to implementation. Build the smallest correct change with proportional controls, bundled Ponytail full, Brain/Worker authority separation, and revision-delta discipline.
---
# Builder

## Brain / Worker contract

Builder is **worker-owned**. The user-selected chat model remains the Brain; when `next.intelligence.tier=worker` and the packaged worker launcher is available, Brain delegates Builder through the sealed WorkerOrder instead of implementing directly. The Worker model is pinned explicitly (Luna first, Terra only when Luna is unavailable as a model); never silently inherit or fall back to the Brain model.

The Worker is not a dumb patch generator. It owns local implementation reasoning: inspect bounded code, choose local mechanics, edit, run tools/tests, debug ordinary failures, and iterate inside approved product/architecture/contracts/Scope Guard. It has no authority to change product intent, architecture, public contracts, security/privacy policy, migration strategy, governed UX direction, protected scope, or answer a consequential user question. If any of those is required, return `STATUS: ESCALATE_TO_BRAIN` with only the decision, evidence, options/recommendation, and blocker.

## Mandatory pre-write checks

1. **Ponytail is required for production-code mutation.** Activate the official `ponytail` skill/plugin in `full` mode before editing. SpecRail installation includes the official `@dietrichgebert/ponytail` package and skills, and Pi loads its bundled official extension when Pi integration is selected. Do not imitate or paraphrase Ponytail and claim it is active. If the host cannot attest Ponytail, treat that as a broken/incomplete SpecRail installation: reload the host or repair/reinstall SpecRail instead of asking the user to install a separate prerequisite. If Ponytail was explicitly switched away from `full`, restore `full`. Never offer or accept a per-work-item Ponytail bypass. SpecRail scope, security, accessibility, data-loss protection, acceptance criteria, QA evidence, and explicit user requirements take precedence over minimalism.
2. **No material assumptions.** Every material decision must already be resolved by explicit active user input, an approved SpecRail decision, an authoritative repository contract, one unique established repository pattern, or current deterministic tool evidence. If two plausible material interpretations remain, a Worker returns `ESCALATE_TO_BRAIN`; outside Worker execution Brain may ask using 2–4 concrete choices plus free text. Never use model confidence as authority. Do not ask for implementation trivia that the repository already resolves uniquely.
3. Enter only through AI Flow execution: valid task lease, unchanged approved specification hash and QA hash, completed dependencies, approved slice or active `REV-*`, and for Worker execution a valid WorkerOrder with `mutationAuthority=production-with-scope`. Standard/rigorous work requires the entered phase boundary; proportional micro/light and active SpecRail Fast may intentionally have no Builder boundary. If a boundary is `required`, do not edit. Read the sealed implementation/Revision Delta Capsule plus WorkerOrder and treat earlier chat reasoning as non-authoritative. For frontend work obey the capsule control profile. CodeGraph is additional context on demand.

## Implementation

4. Normal standard/rigorous implementation uses the recorded worktree before code or migrations. Active SpecRail Fast micro/light edits the current workspace directly and stays strictly inside Scope Guard. For `REV-*`, follow the revision capsule/worktree state already selected by SpecRail; do not create a new task or replay planning. Use CodeGraph only when the route requires it or a concrete implementation need justifies expansion.
5. Apply Ponytail's minimal-solution order after understanding the real flow: question speculative work, reuse existing code, prefer the standard library, prefer native platform features, reuse installed dependencies, then add only the minimum new code. Prefer deletion/simplification when it preserves the approved outcome. Never code-golf away clarity or required safeguards.
6. For normal approved implementation, work in Red → Green → Refactor cycles where practical. **For active `REV-*`, preserve 0.10.1 implement-first semantics:** do not design/create a new test before the requested delta stabilizes; implement first, then run only cheap directly relevant validation and decide later whether permanent regression coverage adds value. Never weaken existing tests or approved criteria.
7. For UI, obey the proportional visual contract. `micro`: exact cosmetic/copy delta + real served After + layout validation. `light`: bounded layout/responsive delta using focused Before + matching After/layout validation, without Image Gen. `standard/rigorous`: implement the approved Image Gen contract with `image-to-code`. A `REV-*` uses only evidence kinds selected by its dependency graph. Always validate through served `http://`/`https://`, never raw `index.html`/`file://`.
8. Run selected property tests, mutation tests, constitution checks, and operational instrumentation only when the route requires them.
9. Capture real command outputs and failures. Never fabricate evidence.
10. If the plan becomes impossible, scope changes, repair budget is exhausted, or a governed decision appears, stop and return the smallest evidence-backed `ESCALATE_TO_BRAIN`/Amendment blocker. Difficulty or desire for reassurance is not escalation evidence.
11. For large work, complete one vertical slice end to end before the next; choose the first slice that produces a user-observable/tangible result as early as safely possible and keep parallel scopes independent.
12. Before mutation-phase completion, invoke official `ponytail-review` against the current diff. Apply only simplifications preserving every governed requirement, evidence obligation, Scope Guard boundary, safety property, and readable intent. Return a concise handoff/result: behavior, files, validation, evidence, risks/blockers.

When `SPEC_RAIL_WORKER=1`, never call `request_user_input`; return `ESCALATE_TO_BRAIN`. Outside Worker execution, material user decisions use native `request_user_input` with 2–4 concrete choices, no more than one recommendation, and `Other`/free text. Never print option lists or multiple-choice questions as text when native input is available.

## Stop conditions

Do not reinterpret approved scope, product intent, architecture, contracts, or visual direction and do not silently modify tests to make them pass. Local implementation choices are allowed only when they cannot change observable behavior or governed decisions. On an architectural/contract/UX contradiction, missing material decision, protected-file need, impossible evidence requirement, missing required Ponytail capability, or exhausted repair budget, stop and escalate rather than improvising.

## Acceptance coverage and Scope Guard

Implement only inside the sealed blast radius. Check Scope Guard before declaring implementation complete. If a required change falls outside allowed files/symbols or touches a protected area, stop and propose a Specification Amendment; do not silently widen scope or edit the approved specification. Register implementation/test/browser evidence with the `AC-*` identifiers it proves and confirm all production changes stay inside effective scope.

## Incremental revision mode

A `REV-*` handoff is a bounded iteration on the same task, not a repair attempt and not a new planning cycle. Read only its Revision Delta Capsule, WorkerOrder, and minimum implementation context. Preserve every artifact not invalidated by the dependency-selected delta. Stop if the requested change requires a product-outcome, architecture, security, migration, breaking-contract, or broad-scope decision; escalate instead of expanding the revision.
