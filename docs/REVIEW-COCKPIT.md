# Review Cockpit — manual legacy review utility

Review Cockpit is a local, mobile-friendly, **read-only** snapshot generated from SpecRail task state, evidence, readiness, Scope Guard, metrics, and signed trace **only when explicitly requested**. It is not a second database, never owns approval, and is no longer part of the normal specification/final approval path.

## Default approval surface

The normal approval contract is chat-first and deliberately small:

1. **Decision Capsule in the exact native approval question** — outcome, scope, proof, risk/blocker, next action;
2. mandatory primary visual/behavior evidence surfaced inline for the current gate;
3. **Review Details** available on demand from the complete authoritative Review Bundle;
4. the exact host-native approval choices returned by SpecRail.

Embedding the Decision Capsule in the question itself prevents a host from exposing approval choices before the decision-critical specification/result summary even when it ignores secondary presentation metadata.

Supporting specification, acceptance/NFR detail, files, evidence inventory, checks, trace, repair history, product reviews, experiments, and amendments remain available through Review Details instead of being dumped into normal chat by default.

A severity override applies: security/privacy/data-loss risks, failed ACs, Scope Guard violations, stale/tampered evidence, or unresolved blockers are always visible even when that exceeds the normal concision budget.

## Generate a Cockpit manually

Normal approval **does not generate, open, offer, or require Cockpit HTML**. Users who explicitly want the historical local snapshot can still generate it through the compatibility commands:

```bash
specrail cockpit TASK-0042
specrail cockpit TASK-0042 --stage spec
specrail cockpit TASK-0042 --stage final
specrail review cockpit TASK-0042 --stage status
```

Task artifacts remain under `.ai/reviews/` only when one of those commands is invoked.

## Presentation integrity

At a visual gate, `next` first returns `interaction.tool=host_actions` and the host must:

- surface every `requiredVisible` canonical image in-conversation;
- record the actual `present-image` action outcome against the exact session and `presentationDigest`;
- call `next` again before any native approval question.

Changed evidence, another session, or stale/corrupt acknowledgment forces presentation again. A local path, filename, manually generated Cockpit, or HTML artifact never satisfies “shown to the user”.

There is **no normal Cockpit `open-url` action** and no approval dependency on Cockpit generation/opening. A manually generated Cockpit remains outside the presentation acknowledgment state machine.

The compact Decision Capsule replaces the old default full-bundle prose and the old automatic Cockpit path, **not** the evidence/integrity contract.

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

Static galleries or broken placeholders do not count. Visualize is supplementary; canonical inline evidence and the deterministic native interaction remain authoritative.

## Frontend evidence

At specification approval, routed frontend work requires the exact visual roles selected by the active Control Profile. At final approval, the matching real served After is required where the profile demands it.

Frontend runtime evidence uses exact `http://` or `https://` URLs. Raw `index.html`, `file://`, and filesystem paths are invalid as preview evidence. `presentation.previewUrl` is the explicit served target.

A manually generated Cockpit may embed registered PNG/JPEG/WebP/GIF/SVG evidence as data URIs for convenience. Canonical `present-image` host actions remain the authoritative proof that required images were actually surfaced in the normal approval flow.

## Backend / CLI evidence

The default chat view shows the smallest observable proof needed for the decision—for example an exact request/status/body or command/exit summary. Full command output stays in Review Details/evidence artifacts.

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

The native question and optional/manual HTML consume the same structured decision-capsule semantics so individual agents do not regenerate long narrative summaries.

## Decision model

The Cockpit never writes task state. HTML buttons remain explanatory only. Actual choices use the host-native `request_user_input` gate and the deterministic SpecRail transition.

This prevents stale HTML, browser extensions, or a local file from approving work.

## Responsive/accessibility contract

The normal Decision Capsule must be usable on a 390×844 mobile viewport without requiring the user to scroll through metadata before understanding the decision. Required visual evidence may naturally extend below it.

When manually generated, Cockpit keeps:

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

For manually generated Cockpit HTML:

- local/self-contained HTML;
- no authentication or separate database;
- project-provided text is HTML-escaped;
- only registered evidence is embedded;
- source digest covers authoritative inputs;
- Markdown/evidence hashes/trace remain authoritative;
- host approval remains authoritative.

## Validation

Release validation checks the chat-first Decision Capsule contract, absence of Cockpit from normal approval attachments/actions, canonical inline evidence, Review Details, presentation integrity, visual comparator behavior, Pi, acceptance, scope, packaging, and installed E2E suites. A separate compatibility test keeps the manual Cockpit command working without allowing it back into the normal gate.

Success means review becomes faster **without** weakening acceptance coverage, scope integrity, evidence visibility, or native human approval.