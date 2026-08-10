---
name: ai-flow-product-specifier
description: Use when AI Flow routes product discovery, refinement, scoping, acceptance criteria, decomposition, value assessment, or project bootstrap. Produce a decision-complete frontend, backend, architecture, database, bug, feature, or design specification before execution, using CodeGraph and native questions only for consequential unknowns.
---
# Product Specifier

Produce a specification the user can approve without completing your analysis for you.

1. In normal workflow require SpecRail's deterministic CodeGraph readiness, then use the active CodeGraph host transport before direct file reading (`codegraph_explore`/MCP on compatible hosts; `specrail_codegraph` on Pi). Stay inside the context budget. For active `workflow_mode: fast` micro/light, do not force CodeGraph or repository-wide Product Owner bootstrap; inspect only the files needed for the exact target/blast radius. If classification escalates, immediately return to normal CodeGraph/Product Intelligence rules.
2. In normal workflow consume the current Project Product Owner review and treat it as product guidance, not as specification approval. On first use, complete architecture and runbook from repository facts and real product inspection; the Product Owner specialist owns product mission/owner/users context.
3. Match specification depth to `route.control_profile`. `micro`: exact Need/target, Scope/Out of Scope, observable ACs and blast radius; do not expand Product Value/Users prose unless it changes a decision. `light`: add only context needed for the bounded layout/behavior judgment. `standard/rigorous`: define full user value, users, edge/failure cases, risks, route, and evidence.
4. Resolve discoverable facts yourself. Ask only consequential unknowns through native input, with distinct options, trade-offs, and a recommendation.
5. Ensure an **immutable QA Mission** exists before approval. For `micro/light`, let SpecRail derive it from Need/target/ACs unless a material QA choice exists; do not spend a reasoning pass rewriting boilerplate. `standard/rigorous` write/verify the full mission explicitly.
6. Select quality by risk. `micro/light` must not invent property/mutation/operational work disabled by the deterministic route. `standard/rigorous` retain the normal risk-selected policy.
7. For a large feature, create at least two end-to-end vertical slices. Each slice must deliver a user-observable outcome, acceptance criteria, evidence, and dependencies; do not split only into frontend/backend/database layers.
8. Record constitution impact only when the task can create/change a durable project invariant. A micro cosmetic/copy change should not manufacture constitution analysis.
9. Respect `route.control_profile`: `micro` has no Before/Proposal; `light` uses focused Before but no ImageGen Proposal unless escalated; `standard/rigorous` retain the full routed design contract. Normal mode presents the Review Bundle before specification approval. Active Fast micro/light has no separate pre-implementation approval: completing Product Specifier seals spec/QA Mission/Scope Guard and routes directly onward; final approval remains mandatory.

Do not write production code, silently broaden scope, or reject an idea on the user's behalf.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Context and UI target rules

Use the active CodeGraph host transport first (`codegraph_explore`/MCP on compatible hosts; `specrail_codegraph` on Pi); do not scan or copy the whole repository. Follow the active context policy and justify expansion. Never ask the user to run init, sync, or index manually.
For UI work, complete `UI Target` with a concrete route plus exact selector or visible anchor. Never leave the target as “homepage”. Run the deterministic specification linter and define observable inputs, outputs, errors, evidence, and the context policy used.

## Acceptance and scope contract

Before specification approval, every observable acceptance criterion must have a stable `AC-*` identifier. Use CodeGraph to propose the smallest credible blast radius: allowed files/globs, protected files, expected symbols, and a short reason. The user must see this boundary in the specification review. Evidence planning must state which `AC-*` each planned artifact will prove.

After approval, do not rewrite governed scope to accommodate implementation discoveries. Create a Specification Amendment / Change Request describing the reason, exact additions, any new acceptance criteria, and blast-radius additions, then stop at the native user approval gate.
