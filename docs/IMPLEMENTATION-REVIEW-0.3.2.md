# AI Flow 0.3.2 implementation review

## Scope

This review re-audited the 0.3.1 Visualize design and every technical-debt item recorded in the previous implementation review.

## Findings and fixes

### Visualize was a plan, not an integration

0.3.1 generated structured visualization JSON but could still be misread as proof that a tool named Visualize existed or had rendered successfully. 0.3.2 treats it as a session-scoped capability request:

- Codex must inspect the actual host tool/plugin list.
- Availability is recorded only with the exact exposed name.
- Every plan is persisted and signed with a plan digest and a digest of its canonical sources.
- A rendered outcome requires the matching digests, an actual host invocation reference, and a hashed non-trivial result summary.
- If source evidence changes after planning, the result is rejected as stale.
- UI, architecture, database, high-risk, and final-review views require a fresh-context evaluator; routine explanatory views may use a self-check.
- Markdown, review bundles, screenshots, diagrams, tests, and executable evidence remain authoritative and non-blocking fallback.

### TypeScript strictness was previously bypassed

All `@ts-nocheck` directives were removed from `src/`. The package now compiles with `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`, using vendored Node/Undici type declarations so installation does not require a network download.

### CodeGraph is an external evolving contract

The deterministic preflight now probes the actual CLI contract before use: version, `init --index`, `sync`, `index --force --quiet`, and `status`. An incompatible update blocks before Product Owner or Builder reasoning instead of silently running an unknown command shape. The exact contract fingerprint is persisted in `.ai/runtime/codegraph.json`.

### Structural tests could not prove visual usefulness

The visualization eval set now tests signed plans, fake availability, source freshness, exact provider matching, invocation references, fresh-context evaluation, mobile readability, source fidelity, overflow, clipping, and score thresholds. This does not replace physical Codex Desktop acceptance, but it prevents false success claims and stale-source rendering.

### Agent Plugin packaging was not validated

AI Flow now includes a deterministic Agent Plugins 1.0 validator. It checks the closed portable manifest, name constraints, immediate skill discovery, containment, and skill frontmatter. `ai-flow plugin validate` and `ai-flow doctor` run this validation.

### Global instructions duplicated the skill

The installer-managed `~/.codex/AGENTS.md` block was reduced to a compact activation rule. The complete workflow contract lives in the installed global `ai-flow` skill, reducing context overhead and preventing divergence between two large instruction copies.

## Remaining external acceptance

The local CLI cannot force Codex to expose a particular plugin or tool. Physical acceptance must confirm that the user's Codex session exposes Visualize, returns an invocation reference, and renders a useful mobile-readable result. If it does not, AI Flow correctly falls back to Markdown and attachments without blocking delivery.
