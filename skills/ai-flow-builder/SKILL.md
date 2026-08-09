---
name: ai-flow-builder
description: Use when AI Flow routes an approved task or vertical slice to implementation. Build the smallest correct frontend, backend, database, CLI, or full-stack change with tests-first discipline, CodeGraph impact analysis, worktree isolation, focused refactoring, operational evidence, and finite repair loops.
---
# Builder

1. Enter only through AI Flow execution: valid task lease, unchanged approved specification hash and QA mission hash, completed dependencies, approved slice, and an entered implementation phase boundary. If the boundary is still `required`, do not edit: end the prior turn or run the internal boundary-entry step on the user's continuation, then refresh `specrail next`. Read the deterministic implementation capsule completely before editing. Treat earlier chat reasoning as non-authoritative. Do not reload the entire canonical task by default; open only a specific canonical section when the capsule is truncated, a conflict needs source verification, or a concrete missing detail is required. For frontend work, inspect the canonical Before/Proposal evidence and UI target listed in the capsule before editing. CodeGraph supplies additional repository context only on demand.
2. Create the recorded worktree before code or migrations. Use CodeGraph MCP and the progressive context budget; justify expansions.
3. Work in Red → Green → Refactor cycles where practical. Do not weaken tests or alter approved criteria to make them pass.
4. For UI, implement the approved Image Gen contract with `image-to-code`; do not redesign it. Validate actual behavior in the browser against a served `http://` or `https://` URL from the task worktree. Never use a raw `index.html`/`file://` preview. Keep the preview server alive for downstream QA/review when the gate needs a live site.
5. Run selected property tests, mutation tests, constitution checks, and operational instrumentation only when the route requires them.
6. Capture real command outputs and failures. Never fabricate evidence.
7. If the plan becomes impossible, scope changes, or a material problem appears, block and ask. Do not loop: each returned attempt consumes the deterministic repair budget.
8. For large work, complete one vertical slice end to end before the next; keep slice file scopes independent when parallel subagents are used.
9. Write a concise handoff: behavior delivered, files, tests, operational changes, evidence, risks, and blockers.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Stop conditions

Do not reinterpret approved scope, product intent, architecture, contracts, or visual direction and do not silently modify tests to make them pass. Local implementation choices are allowed only when they cannot change observable behavior or governed decisions. On an architectural/contract/UX contradiction, missing material decision, required protected-file change, impossible evidence requirement, or exhausted repair budget, stop and return a structured blocker/Amendment instead of improvising.

## Acceptance coverage and Scope Guard

Implement only inside the sealed blast radius. Check Scope Guard before declaring implementation complete. If a required change falls outside allowed files/symbols or touches a protected area, stop and propose a Specification Amendment; do not silently widen scope or edit the approved specification.

Register implementation/test/browser evidence with the `AC-*` identifiers it proves. Before handoff, confirm all implementation changes are inside the effective blast radius and that evidence points to the actual implemented result, not a before/proposal artifact.
