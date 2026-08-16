# Review Cockpit — decision-first review

Review Cockpit is a local, mobile-friendly, **read-only** decision surface generated from SpecRail task state, evidence, readiness, Scope Guard, metrics, and signed trace. It is not a second database and never owns approval.

## Default approval surface

SpecRail now uses **progressive disclosure**. The first view is deliberately small:

1. **Decision Capsule** — outcome, scope, proof, risk/blocker, next action;
2. the mandatory primary visual/behavior evidence for the current gate;
3. the native host approval selector.

The complete authoritative Review Bundle still exists and remains attached/available under **Review Details**. It is no longer dumped into normal chat by default. Supporting specification, acceptance/NFR detail, files, evidence inventory, checks, trace, repair history, product reviews, experiments, and amendments stay collapsed until requested.

A severity override applies: security/privacy/data-loss risks, failed ACs, Scope Guard violations, stale/tampered evidence, or unresolved blockers are always visible even when that exceeds the normal concision budget.

## Generate a Cockpit

Approval flow generates the compact Cockpit automatically. The underlying review artifact can also be generated through the existing CLI commands:

```bash
specrail cockpit TASK-0042
specrail cockpit TASK-0042 --stage spec
specrail cockpit TASK-0042 --stage final
specrail review cockpit TASK-0042 --stage status
```

Task artifacts remain under `.ai/reviews/`.

## Presentation integrity

Generating HTML is not proof of presentation. At a visual gate, `next` first returns `interaction.tool=host_actions` and the host must:

- surface every `requiredVisible` canonical image in-conversation;
- resolve the Cockpit `open-url` action;
- record the actual action outcome against the exact session and `presentationDigest`;
- call `next` again before any native approval question.

Changed evidence, another session, or stale/corrupt acknowledgment forces presentation again. A local path, filename, or HTML artifact never satisfies “shown to the user”.

The compact Decision Capsule replaces the old default full-bundle prose, **not** the evidence/integrity contract.

## `$visualize`

When the installed Codex skill catalog exposes `visualize` and the signed plan calls for interactive review, `$visualize` may prepare a validated fragment and native `visualize` content reference. Artifact/reference preparation is not proof of host display; SpecRail records `hostPresentation: unverified` until a trusted presentation signal exists.

Visual Comparator v2 requirements remain unchanged:

- Side by side / Slider / Overlay;
- exact route + target + pixel viewport + capture-scope grouping;
- explicit missing-role states;
- canonical evidence IDs and roles on embedded images;
- no `file://`, absolute-path, or repository-relative image sources;
- canonical bytes embedded as data URIs;
- marked split/opacity controls and v2 runtime.

Static galleries or broken placeholders do not count.

## Frontend evidence

At specification approval, routed frontend work requires the exact visual roles selected by the active Control Profile. At final approval, the matching real served After is required where the profile demands it.

Frontend runtime evidence uses exact `http://` or `https://` URLs. Raw `index.html`, `file://`, and filesystem paths are invalid as preview evidence. `presentation.previewUrl` is the explicit served target.

The Cockpit may embed registered PNG/JPEG/WebP/GIF/SVG evidence as data URIs. Canonical `present-image` host actions remain the authoritative proof that required images were actually surfaced.

## Backend / CLI evidence

The default view shows the smallest observable proof needed for the decision—for example an exact request/status/body or command/exit summary. Full command output stays in Review Details/evidence artifacts.

## Decision Capsule

Specification approval summarizes:

- proposed outcome;
- bounded scope;
- AC/readiness/scope state;
- risk/blocker;
- next decision.

Final approval summarizes:

- delivered outcome;
- changed scope;
- AC/NFR/test/scope proof;
- residual risk/blocker;
- approval action.

Chat and HTML consume the same structured decision-capsule semantics so individual agents do not regenerate long narrative summaries.

## Decision model

The Cockpit never writes task state. HTML buttons remain explanatory only. Actual choices use the host-native `request_user_input` gate and the deterministic SpecRail transition.

This prevents stale HTML, browser extensions, or a local file from approving work.

## Responsive/accessibility contract

The compact decision summary must be usable on a 390×844 mobile viewport without requiring the user to scroll through metadata before understanding the decision. Required visual evidence may naturally extend below it.

The Cockpit keeps:

- semantic headings/landmarks;
- keyboard-operable tabs/details/controls;
- visible focus;
- status text in addition to color;
- responsive single-column fallback;
- no remote scripts/styles/network dependency.

## What stays under Review Details

- full specification and QA Mission;
- Acceptance Coverage / NFR detail;
- Scope Guard and amendments;
- all registered evidence;
- deterministic checks;
- recent signed trace;
- repair/context metrics;
- Product Owner / Target Audience detail;
- Harness experiments and policy history.

Nothing is deleted; it is merely no longer the first thing the user must read.

## Security and portability

- local/self-contained HTML;
- no authentication or separate database;
- project-provided text is HTML-escaped;
- only registered evidence is embedded;
- source digest covers authoritative inputs;
- Markdown/evidence hashes/trace remain authoritative;
- host approval remains authoritative.

## Validation

Release validation now checks the compact decision-capsule contract together with existing presentation-integrity, visual comparator, Pi, acceptance, scope, packaging, and installed E2E suites.

Success means review becomes faster **without** weakening acceptance coverage, scope integrity, evidence visibility, or native human approval.
