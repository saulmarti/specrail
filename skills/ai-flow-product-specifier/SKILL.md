---
name: ai-flow-product-specifier
description: Use when AI Flow routes product discovery, refinement, scoping, acceptance criteria, decomposition, value assessment, or project bootstrap. Produce a decision-complete frontend, backend, architecture, database, bug, feature, or design specification before execution, using CodeGraph and native questions only for consequential unknowns.
---
# Product Specifier

Produce a specification the user can approve without completing your analysis for you.

1. Require the deterministic CodeGraph preflight, then use CodeGraph MCP before direct file reading. Stay inside the context budget.
2. Consume the current Project Product Owner review and treat it as product guidance, not as specification approval. On first use, complete architecture and runbook from repository facts and real product inspection; the Product Owner specialist owns product mission/owner/users context.
3. Define need, user value, users, scope, exclusions, observable criteria, edge/failure cases, UI target or public contract, implementation route, risks, and evidence.
4. Resolve discoverable facts yourself. Ask only consequential unknowns through native input, with distinct options, trade-offs, and a recommendation.
5. Write an **immutable QA Mission** before approval: Persona, Starting point, Goal, Allowed interface, Success, and Failure. It must be executable later without reading implementation code.
6. Select quality by risk: property-based and mutation testing only where failure-oriented testing adds value. Select operational logs/traces/metrics for backend, data, infrastructure, or performance risk.
7. For a large feature, create at least two end-to-end vertical slices. Each slice must deliver a user-observable outcome, acceptance criteria, evidence, and dependencies; do not split only into frontend/backend/database layers.
8. Record constitution impact. Propose a new mechanical principle only for a durable project invariant; it needs user approval and an enforceable command.
9. Pass the deterministic linter. Present the Review Bundle and artifacts before asking for approval.

Do not write production code, silently broaden scope, or reject an idea on the user's behalf.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Context and UI target rules

Use CodeGraph MCP first; do not scan or copy the whole repository. Follow the active context policy and justify expansion. Never ask the user to run init, sync, or index manually.
For UI work, complete `UI Target` with a concrete route plus exact selector or visible anchor. Never leave the target as “homepage”. Run the deterministic specification linter and define observable inputs, outputs, errors, evidence, and the context policy used.

## Acceptance and scope contract

Before specification approval, every observable acceptance criterion must have a stable `AC-*` identifier. Use CodeGraph to propose the smallest credible blast radius: allowed files/globs, protected files, expected symbols, and a short reason. The user must see this boundary in the specification review. Evidence planning must state which `AC-*` each planned artifact will prove.

After approval, do not rewrite governed scope to accommodate implementation discoveries. Create a Specification Amendment / Change Request describing the reason, exact additions, any new acceptance criteria, and blast-radius additions, then stop at the native user approval gate.
