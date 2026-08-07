# SpecRail 0.5.0-beta.1 product and implementation review

## Product decision

The package is prepared as `specrail@0.5.0-beta.1`, published under the `beta` dist-tag. The unscoped package is the primary product. `@saulmarti/specrail` is retained as a fallback only; publishing two identical full packages by default would split adoption, documentation, downloads, ownership, and update paths.

## Review Cockpit

The cockpit is intentionally a future projection layer over existing signed artifacts, not another task database. Its first customer job is to reduce the time and cognitive effort needed to make a product decision from mobile or desktop.

The included concept shows:

- approved scope;
- readiness, CI, QA, and repair status;
- before/proposal/after and viewport controls;
- remaining risks;
- deterministic delivery choices.

The prototype is documentation, not a shipped state-changing UI. Any future cockpit action must delegate to SpecRail's deterministic CLI.

## GitHub PR and CI

The planned integration uses GitHub as a shared delivery boundary:

1. link a GitHub issue to a SpecRail task;
2. expose the approved specification and QA mission in the pull request;
3. import CI runs as commit-bound evidence;
4. attach or link the final Review Bundle;
5. require final product approval independently of green CI;
6. complete delivery only after merge or explicit external confirmation.

This is high-value because it removes manual handoffs while preserving human product authority.

## Signed Delivery Bundle decision

A signed archive is useful when a client, auditor, regulated environment, or second machine needs a portable answer to: “What was approved, what code produced it, and what evidence proved it?”

For normal solo development it adds little immediate value, so it is explicitly Deferred in the roadmap rather than treated as a near-term feature.

## Roadmap prioritization

Recommended order:

1. `0.6.x` — Readiness / Why blocked and `doctor --fix`.
2. `0.7.x` — Review Cockpit MVP.
3. `0.8.x` — GitHub Issue / PR / CI / merge integration.
4. `0.9.x` — Replayable Tasksets and Harness comparison.
5. `1.0` — only after beta exit criteria and real usage data.

This order first reduces adoption and diagnosis friction, then review friction, then team delivery friction, and finally enables data-driven harness optimization.

## Repository governance

A canonical root `AGENTS.md` now governs every coding agent. It requires:

- roadmap and changelog maintenance;
- strict TypeScript and deterministic state;
- migrations for persisted schemas;
- capability discovery and fallback;
- tests and clean tarball installation;
- no secret handling or unauthorized publication;
- vertical slices and measurable customer-value hypotheses.

## Branding recommendation

Recommended direction:

- name: SpecRail;
- icon: two parallel rails forming a minimal `S`, with one approval checkpoint dot;
- palette: Graphite + Signal Green;
- typography: Geist + Geist Mono;
- primary tagline: “Human-approved, evidence-backed software delivery for coding agents.”

Avoid robot, brain, sparkle, or generic AI-gradient imagery. The visual identity should communicate controlled movement, gates, evidence, and trust.
