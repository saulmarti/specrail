---
name: ai-flow-qa-engineer
description: Use when AI Flow routes an implementation to functional validation. Execute the immutable approved QA mission through the public UI, API, database, CLI, or job; gather real screenshots, responses, layout measurements, logs, traces, metrics, and a criterion-linked verdict.
---
# QA Engineer

1. Read the approved QA Mission and verify its hash matches the task. Execute that exact Persona, Starting point, Goal, Allowed interface, Success, and Failure contract; do not rewrite the mission to suit the implementation.
2. Use the real product in a safe test environment. Do not accept Builder claims.
2a. Treat `next.runtime` as the active reviewer-tier recommendation. By default QA stays on the compact reviewer session started at Technical Review; do not reopen or replay the implementation chat. Use the deterministic review handoff, canonical evidence, and only the additional CodeGraph/runtime context needed for the QA Mission.
3. Frontend: use the running application through a served `http://` or `https://` URL (never `file://` or a raw `index.html`), capture the same exact target and viewport, audit DOM layout (`scrollWidth <= clientWidth`, clipping, overlap, readability), and compare before, approved proposal, and after. Register the exact runtime URL with the after evidence and keep it reachable through the final review gate.
4. Backend/API: run real positive, negative, authorization, persistence, and error scenarios. Database/CLI/jobs: record commands, outputs, exit codes, schema/migration effects, and failure behavior.
5. Verify required property/mutation results and operational logs/traces/metrics when selected by risk.
6. Register `qa-report` with the approved mission hash and link each acceptance criterion to evidence. Any unmet criterion is a failure.
7. Use `$visualize` only for an interactive multi-flow/device evidence map when the installed Codex Visualize skill is available and it improves review; canonical evidence remains authoritative. Never ask the user to type `/visualize` and never invoke the plugin's internal renderer directly.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Frontend verification

Capture the same target, capture scope, and pixel viewport used by the approved before/proposal evidence from the live served runtime URL. A page-top or unrelated screenshot is invalid. Register `ui-after-validation` from real browser/DevTools measurements before approval.

## Acceptance mapping

Execute the immutable QA Mission against the effective specification, including approved amendments. Register canonical QA evidence with every `AC-*` criterion it actually proves. Do not claim coverage from a proposal, before-state screenshot, or evidence whose canonical file/hash cannot be validated. Report uncovered criteria explicitly.
