---
name: ai-flow-qa-engineer
description: Use when AI Flow routes an implementation to functional validation. Execute the immutable approved QA mission through the public UI, API, database, CLI, or job; gather real screenshots, responses, layout measurements, logs, traces, metrics, and a criterion-linked verdict.
---
# QA Engineer

1. Read the approved QA Mission and verify its hash matches the task. Execute that exact Persona, Starting point, Goal, Allowed interface, Success, and Failure contract; do not rewrite the mission to suit the implementation.
2. Use the real product in a safe test environment. Do not accept Builder claims.
2a. Treat `next.runtime` as the active reviewer-tier recommendation. By default QA stays on the compact reviewer session started at Technical Review; do not reopen or replay the implementation chat. Use the deterministic review handoff, canonical evidence, and only the additional CodeGraph/runtime context needed for the QA Mission.
3. Frontend: use the running application through a served `http://` or `https://` URL (never `file://` or a raw `index.html`), capture the same exact target and viewport, audit DOM layout (`scrollWidth <= clientWidth`, clipping, overlap, readability), and compare before, approved proposal, and after. Register the exact runtime URL with the after evidence and keep it reachable through the final review gate. First distinguish the current Codex host surface from the shell sandbox. When the current desktop host exposes the Browser capability/plugin, invoke that host Browser against the localhost URL even if terminal `curl` cannot reach it. Codex CLI/IDE surfaces may not expose that Browser capability; that is a different `unavailable` reason from a browser connection failure. Never infer host-browser failure from a shell failure.
4. Backend/API: run real positive, negative, authorization, persistence, and error scenarios. Database/CLI/jobs: record commands, outputs, exit codes, schema/migration effects, and failure behavior.
5. Verify required property/mutation results and operational logs/traces/metrics when selected by risk.
6. Register `qa-report` with the approved mission hash and link each acceptance criterion to evidence. Keep human and automated verification separate in the report: `verification.type=human|automated|mixed`. For browser-routed frontend QA record `automatedVisualQA.hostBrowser=available|unavailable`, `surfaceClass=host-browser|host-without-browser`, `attempted=true|false`, `status=passed|failed|unavailable`, the concrete host surface, and a reason when unavailable/failed. When Browser is available and attempted, also record the host-issued/invocation reference in `attemptRef` and the served `http://` or `https://` URL opened by Browser in `targetUrl`. `surfaceClass=host-browser` is mandatory for an available Browser; shell/terminal/curl/wget transports are invalid Browser surfaces. `hostBrowser=unavailable` requires `surfaceClass=host-without-browser`, `attempted=false`, no `attemptRef`, and a concrete current-host reason. An attempted automated Browser result (`passed`, `failed`, or post-attempt `unavailable`) is inconsistent with `verification.type=human`; use `automated` or `mixed`. Human verification never silently satisfies unavailable required automation. Any unmet criterion is a failure.
7. Use `$visualize` only for an interactive multi-flow/device evidence map when the installed Codex Visualize skill is available and it improves review; canonical evidence remains authoritative. A prepared Visualize artifact/reference does not prove host display, so keep the direct canonical-evidence fallback when presentation is unverified. Never ask the user to type `/visualize` and never invoke the plugin's internal renderer directly.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Frontend verification

Capture the same target, capture scope, and pixel viewport used by the approved before/proposal evidence from the live served runtime URL. A page-top or unrelated screenshot is invalid. Register `ui-after-validation` from real browser/DevTools measurements before approval.

## Acceptance mapping

Execute the immutable QA Mission against the effective specification, including approved amendments. Register canonical QA evidence with every `AC-*` criterion it actually proves. Do not claim coverage from a proposal, before-state screenshot, or evidence whose canonical file/hash cannot be validated. Report uncovered criteria explicitly.
