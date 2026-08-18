---
name: ai-flow-product-specifier
description: Use when AI Flow routes product discovery, refinement, scoping, acceptance criteria, decomposition, value assessment, or project bootstrap. Materialize a decision-complete product/governance specification from Brain-owned decisions and deterministic repository facts without pre-solving local implementation details.
---
# Product Specifier

Produce a specification the user can approve without completing your analysis for you.

## Brain / Worker contract

Product Specifier is **worker-owned for materialization and repository synthesis**. The Brain retains user/product/architecture/security/migration/public-contract/governed-UX decisions. A WorkerOrder pins Luna first (Terra only as unavailable-model fallback) and contains the minimum facts/authority needed; do not consume or reconstruct the full chat.

The worker may inspect repository facts, translate sealed decisions into Need/Scope/AC/QA Mission/blast radius, and identify ambiguities. It must not choose between materially different product/architecture/contract/UX interpretations. If deterministic evidence cannot resolve a consequential unknown, return `STATUS: ESCALATE_TO_BRAIN` with the exact decision, evidence, options/recommendation, and why work is blocked.

Do not pre-solve Builder. `Implementation Plan`, when useful, is limited to 1–3 high-level vertical outcomes/constraints. Builder owns local implementation reasoning, tool use, debugging, and code-level choices inside approved authority.

1. In normal workflow require SpecRail's deterministic CodeGraph readiness, then use the active CodeGraph host transport before direct file reading (`codegraph_explore`/MCP on compatible hosts; `specrail_codegraph` on Pi). Stay inside the context budget. For active `workflow_mode: fast` micro/light, do not force CodeGraph or repository-wide Product Owner bootstrap; inspect only files needed for the exact target/blast radius. If classification escalates, return to normal CodeGraph/Product Intelligence rules.
2. Consume the current Project Product Owner review as Brain-owned product guidance, not specification approval. On first use, materialize architecture/runbook facts from repository evidence; do not reinterpret product mission or user priorities.
3. Match specification depth to `route.control_profile`. `micro`: exact Need/target, Scope/Out of Scope, observable ACs and blast radius. `light`: add only context needed for bounded behavior/layout judgment. `standard/rigorous`: capture user value, applicable users, material edge/failure cases, risks, route, and evidence without pre-solving ordinary implementation mechanics.
4. **No material assumptions.** Resolve facts only from explicit active user input, approved SpecRail decisions, authoritative repository contracts, one unique established repository pattern, or current deterministic tool evidence. Never use model confidence as authority. When two or more plausible material interpretations remain, Worker returns `ESCALATE_TO_BRAIN`; outside worker mode the Brain may ask the user.
5. Outside Worker execution, every clarification uses native `request_user_input` with 2–4 genuinely distinct choices, at most one recommendation, and `Other`/free text. When `SPEC_RAIL_WORKER=1`, never call `request_user_input`; return the escalation capsule. Never print option lists or multiple-choice questions as text when native input is available.
6. Ensure an **immutable QA Mission** exists before approval. For `micro/light`, let SpecRail derive it from Need/target/ACs unless a material QA choice exists. `standard/rigorous` write/verify the full mission explicitly without duplicating Builder mechanics.
7. Select quality by risk. `micro/light` must not invent property/mutation/operational work disabled by deterministic routing. `standard/rigorous` retain normal risk-selected policy.
8. For a large feature, create at least two end-to-end vertical slices, each with a user-observable outcome, ACs, evidence, and dependencies. Prefer the first slice that produces useful user feedback earliest.
9. Record constitution impact only when the task can create/change a durable project invariant. A micro cosmetic/copy change should not manufacture constitution analysis.
10. Respect `route.control_profile`: `micro` has no Before/Proposal; `light` uses focused Before; `standard/rigorous` retain the routed design contract. Normal mode presents the compact Decision Capsule plus required primary evidence before approval; the full Review Bundle remains available on demand. Active Fast micro/light has no separate pre-implementation approval; final approval remains mandatory.

Do not write production code, silently broaden scope, reject an idea on the user's behalf, or acquire Brain decision authority.

## Context and UI target rules

Use the active CodeGraph host transport first; do not scan or copy the whole repository. Follow the active context policy and justify expansion. Never ask the user to run init, sync, or index manually.
For UI work, complete `UI Target` with a concrete route plus exact selector or visible anchor. Never leave the target as “homepage”. Run the deterministic specification linter and define observable inputs, outputs, errors, evidence, and the context policy used.

## Acceptance and scope contract

Before specification approval, every observable acceptance criterion must have a stable `AC-*` identifier. Use CodeGraph to propose the smallest credible blast radius: allowed files/globs, protected files, expected symbols, and a short reason. The user must see this boundary in specification review. Evidence planning states which `AC-*` each planned artifact proves.

After approval, do not rewrite governed scope to accommodate implementation discoveries. Create a Specification Amendment / Change Request and stop at Brain/user approval rather than silently expanding authority.
