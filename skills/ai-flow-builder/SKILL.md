---
name: ai-flow-builder
description: Use when AI Flow routes an approved task, vertical slice, or bounded incremental revision to implementation. Build the smallest correct change with proportional controls, governed stable-work discipline, Ponytail full, and revision-delta discipline for exploratory refinements.
---
# Builder

## Mandatory pre-write checks

1. **Ponytail is required for production-code mutation.** Activate the official `ponytail` skill/plugin in `full` mode before editing. SpecRail installation includes the official `@dietrichgebert/ponytail` package and skills, and Pi loads its bundled official extension when the Pi integration is selected. Do not imitate or paraphrase Ponytail and claim it is active. If the host cannot attest Ponytail, treat that as a broken/incomplete SpecRail installation: reload the host or repair/reinstall SpecRail instead of asking the user to install a separate prerequisite. If Ponytail was explicitly switched away from `full`, restore `full`. Never offer or accept a per-work-item Ponytail bypass. SpecRail scope, security, accessibility, data-loss protection, acceptance criteria, QA evidence, and explicit user requirements take precedence over minimalism.
2. **No material assumptions.** Before editing, every material decision must be resolved by one of: explicit active user input, an approved SpecRail decision, an authoritative repository contract, one unique established repository pattern, or current deterministic tool evidence. If two plausible material interpretations remain, stop and ask using 2–4 concrete choices plus free text. Never use model confidence as authority. Do not ask for implementation trivia that the repository already resolves uniquely.
3. Enter only through AI Flow execution: valid task lease, unchanged approved specification hash and QA hash, completed dependencies, and approved slice or active `REV-*`. Standard/rigorous work requires the entered phase boundary; proportional micro/light and active SpecRail Fast may intentionally have no Builder boundary. If a boundary is `required`, do not edit. Read the sealed implementation or Revision Delta Capsule before editing and treat earlier chat reasoning as non-authoritative. For frontend work obey the capsule control profile: micro has no required pre-visual, light uses focused Before, standard/rigorous use canonical Before + approved Proposal. CodeGraph is additional context on demand; a `REV-*` capsule remains authoritative for revision scope/routing.

## Implementation

4. Normal standard/rigorous implementation creates the recorded worktree before code or migrations. Active SpecRail Fast micro/light edits the current workspace directly and stays strictly inside Scope Guard. For `REV-*`, follow the revision capsule/worktree state already selected by SpecRail; do not create a new task or replay planning. Use CodeGraph only when the route requires it or Fast has escalated.
5. Apply Ponytail's minimal-solution order after understanding the real flow: question speculative work, reuse existing code, prefer the standard library, prefer native platform features, reuse installed dependencies, then add only the minimum new code. Prefer deletion/simplification when it preserves the approved outcome. Never code-golf away clarity or required safeguards.
6. For normal approved implementation, work in Red → Green → Refactor cycles where practical. **For an active `REV-*` capsule, preserve 0.10.1 implement-first semantics:** do not design/create a new test before the requested delta stabilizes; implement first, then run only cheap directly relevant validation and decide later whether permanent regression coverage adds value. Never weaken existing tests or approved criteria.
7. For UI, obey the proportional visual contract. `micro`: exact cosmetic/copy delta + real served After + layout validation. `light`: bounded layout/responsive delta using focused Before + matching After/layout validation, without Image Gen. `standard/rigorous`: implement the approved Image Gen contract with `image-to-code`. A `REV-*` uses only the evidence kinds selected by its dependency graph. Always validate through served `http://`/`https://`, never raw `index.html`/`file://`.
8. Run selected property tests, mutation tests, constitution checks, and operational instrumentation only when the route requires them.
9. Capture real command outputs and failures. Never fabricate evidence.
10. If the plan becomes impossible, scope changes, or a material problem appears, block and ask. Do not loop: each returned attempt consumes the deterministic repair budget.
11. For large work, complete one vertical slice end to end before the next; keep slice file scopes independent when parallel subagents are used.
12. Before mutation-phase completion, invoke the official `ponytail-review` skill against the current diff. Apply only simplifications that preserve every governed requirement, test/evidence obligation, Scope Guard boundary, safety property, and readable intent. Then write a concise handoff: behavior delivered, files, tests, operational changes, evidence, risks, and blockers.

Use `request_user_input` for material user decisions. Every clarification must provide 2–4 concrete choices, no more than one recommendation, and `Other`/free text. Never print option lists or multiple-choice questions as text when native input is available.

## Stop conditions

Do not reinterpret approved scope, product intent, architecture, contracts, or visual direction and do not silently modify tests to make them pass. Local implementation choices are allowed only when they cannot change observable behavior or governed decisions. On an architectural/contract/UX contradiction, missing material decision, required protected-file change, impossible evidence requirement, missing required Ponytail capability, or exhausted repair budget, stop and return a structured blocker/Amendment instead of improvising.

## Acceptance coverage and Scope Guard

Implement only inside the sealed blast radius. Check Scope Guard before declaring implementation complete. If a required change falls outside allowed files/symbols or touches a protected area, stop and propose a Specification Amendment; do not silently widen scope or edit the approved specification.

Register implementation/test/browser evidence with the `AC-*` identifiers it proves. Before handoff, confirm all implementation changes are inside the effective blast radius and that evidence points to the actual implemented result, not a before/proposal artifact.

## Incremental revision mode

A `REV-*` handoff is a bounded iteration on the same task, not a repair attempt and not a new planning cycle. Read only the Revision Delta Capsule plus the minimum implementation context needed. Preserve every artifact listed by the Revision Delta Capsule; do not infer invalidation from phase order. Treat the capsule’s dependency-selected `invalidatedArtifacts`/`requiredPhases` as the provisional minimum; after Builder, SpecRail recomputes them from the sealed revision baseline versus the actual changed files, and that post-Builder plan is authoritative. Stop if the requested change turns out to require a product-outcome, architecture, security, migration, breaking-contract, or broad-scope decision; escalate to Amendment/specification instead of expanding the revision.
