# Changelog

## Unreleased

- Added `specrail update`, preserving the installed `beta`/`latest` channel by default, supporting explicit `--beta` / `--latest` switching and network-free `--dry-run`, and refreshing managed Codex assets with the newly installed CLI rather than an older managed copy.
- Made `package.json` the canonical release version and added deterministic synchronization/checks for `plugin.json` and both package-lock version fields before tests, packing, and publishing.
- Hardened frontend evidence around real served runtimes: new Before/After captures require an exact `http(s)` runtime URL, approval presentation exposes `presentation.previewUrl`, and raw `index.html`, `file://`, or filesystem-path previews are invalid.
- Reworked Review Bundle/Cockpit/`$visualize` evidence presentation so repository-local image links are never treated as visible review evidence; canonical images are embedded from verified bytes and stale/historical contexts are separated from the active review set.
- Added **Visual Comparator v2** with Side by side, Slider, and Overlay modes; exact case-sensitive route + target + viewport + capture-scope grouping; viewport/route-target/capture filters; explicit missing-role states; and canonical Before/Proposal/After source markers.
- Strengthened `$visualize` rendering so a successful comparator requires the real v2 interaction structure, exact canonical evidence metadata, matching embedded bytes/hashes/media types, visible non-hidden sources, a native `visualize...` content reference, and a regular external HTML artifact rather than a symlink or static gallery.
- Hardened UI Target/evidence matching for multiple targets and viewports, Spanish `Pantalla` ambiguity, stale proposal/layout-review freshness, exact capture scope, symlink-safe evidence roots, and canonical visual-evaluator digests.
- Removed SpecRail-owned model selection/configuration. Model and reasoning settings remain entirely user-owned in the Codex selector; legacy `modelRouting` project config is migrated away.
- Renamed the remaining internal model-routing modules/tests to phase-role/phase-handoff terminology so the source tree no longer implies that SpecRail chooses models.
- Added strong/flexible planning → Builder and Builder → Technical Review phase boundaries with deterministic implementation/reviewer capsules, explicit turn stops, same-chat or fresh-chat continuation, session-inferred boundary mode, integrity digests, lease-safe ownership transfer, Amendment invalidation, and model-independent raw context-savings estimates.
- Re-hardened phase boundaries so Builder and Technical Review cannot bypass entry through direct runtime calls, context expansion cannot re-arm an entered boundary, phase resets are not returned stale by `next`, blocked work cannot resume from another session without entry, and spec approval prepares the implementation boundary in the approval session.
- Reordered the public roadmap around the highest-value path exposed by real usage: implementation-capsule quality and conformance first, runtime/review reliability second, measured context efficiency third, then Specification Intelligence, lifecycle management, Review Inbox, and experiment automation.
- Added planned Capsule Quality Gate, Builder Comprehension Preflight, Decision Budget, Executable Acceptance Criteria, Contract Conformance Monitor, Preview Session Manager, runtime Doctor checks, real phase token telemetry, adaptive boundary recommendations, Capsule Delta, role-specific context cache, and implementation checkpoints.

## 0.8.0-beta.2 — 2026-08-07

- Hardened approval integrity, Amendment decision seals, Scope Guard protected-state coverage, Replay trace validation, token provenance `realpath` checks, and safe reapproval of intact legacy approvals.
- Added adversarial regression coverage for approval tampering, protected-file renames, governed `.ai/project` drift, external provenance symlinks, and malformed Replay active-agent intervals.
- Changed the canonical npm package name to **`@saulmarti/specrail`** because the unscoped `specrail` package belongs to another project; the executable remains `specrail` and `ai-flow` remains a compatibility alias.
- Updated the public roadmap with planned Requirement Source Ledger, adversarial Specification Critic, first-class NFR coverage, change/failure classification, contract compatibility + Impact Radius, Repository Blueprint domain vocabulary, and content-aware managed updates.
- Removed two cross-platform release-test flakes: repository-root assertions now canonicalize macOS `/var`/`/private/var` paths, and Replay anchors the initial `variant-started` trace event exactly to `startedAt`.
- Hardened release scripts so `release:check` runs before `npm version`, avoiding unnecessary version/tag bumps when the current tree is not publishable.

## 0.8.0-beta.1 — 2026-08-07

- Hardened Replay statistics so planned/running variants never enter historical policy samples and no winner is declared until every variant is terminal.
- Added semantic cohort signatures for Harness recommendations using task type, work class, risk, size, surfaces, and workflow-route profile.
- Added provenance-backed token usage artifacts, trace-derived repair/context/tool metrics, and separate wall-clock versus active-agent time.
- Added stable `AC-*` acceptance identifiers and the Acceptance Coverage Matrix; final approval now requires canonical evidence for every effective criterion.
- Added Scope Guard / Blast Radius with approved allowed/protected boundaries, Git or filesystem-snapshot baselines, untracked-file detection, and final scope-drift blocking.
- Added immutable Specification Amendments / Change Requests so bounded post-approval scope and acceptance changes preserve the original approval history.
- Pending Amendments now become a deterministic native Codex decision gate with the change, new `AC-*` criteria, blast-radius additions, and protection removals visible before approval/rejection.
- Added Acceptance, Scope Guard, and Amendment views to Review Cockpit and Review Bundles.
- Added explicit safe migration guidance for legacy approved tasks that predate sealed blast radii.
- Hardened first-install validation so `specrail plugin validate` falls back to the packaged Agent Plugin when no managed `~/.ai-flow` copy exists yet.
- Added CLI commands for acceptance coverage, scope status/set, amendments, and Replay trace events.
- Expanded regression coverage for tampered amendments, conceptual evidence misuse, untracked scope drift, incomplete Replay experiments, token provenance, trace-derived metrics, and semantic cohorts.

## 0.7.0-beta.1 — 2026-08-07

- Added exact variant-total Replay token accounting for input, cached input, output, optional reasoning tokens, model identity, uncached input, total tokens, cache ratio, and coverage; missing usage remains unavailable rather than estimated.
- Prevented cached-input double counting and prevented token cost from influencing Harness tie-breaks when compared runs use different or unknown model identities.
- Added `specrail replay scenarios` with representative UI, backend, full-stack, migration, performance, and architecture experiment families.
- Added advisory `specrail harness recommend TASK` using repeated comparable replay history, quality bands, repair counts, token coverage, elapsed time, and context breadth without silently changing task policy.
- Added risk-aware safeguards so high/critical work cannot receive `fast` as the historical default recommendation.
- Added Review Cockpit Harness experiments view with latest replay metrics, token provenance, and adaptive recommendation.
- Added public experiment and adaptive-policy documentation and project config schema v9.

## 0.6.0-beta.1 — 2026-08-07

- Added one deterministic **Readiness / Why blocked** contract shared by CLI, `next`, and Review Cockpit, with blocker ownership, stale/failed gate reasons, and the shortest safe next action.
- Added `specrail readiness` and `specrail why-blocked`; hardened required QA Mission, project context, CodeGraph, durable learning, trace, repair, context, evidence, approval, dependency, lease, and delivery gates.
- Added plan-first **`specrail doctor --fix`** with native approval before applying only local reversible repairs; external Node/Git/CodeGraph/MCP work remains explicit manual guidance.
- Made `specrail` the required launcher health check while keeping `ai-flow` optional compatibility; shared installer repair logic avoids self-deleting installed packages.
- Added **Replayable Tasksets** with immutable approved taskset digests, isolated Git worktrees, fresh built-in fast/standard/rigorous harnesses, real evidence hashing, and transparent multi-metric comparison without an opaque aggregate score.
- Added `.ai/replays`, config schema v8 migration, replay cleanup, and public documentation for readiness, doctor repair, and harness experiments.
- Refactored Review Cockpit to consume the shared readiness engine and removed duplicated installer governance prose and dead replay code.

## 0.5.0-beta.2 — 2026-08-07

- Updated the public maintainer email to `me@saulmarti.dev`.
- Implemented the local, self-contained Review Cockpit generated from real task Markdown, evidence, metrics, repair state, context budget, and signed traces.
- Added `specrail cockpit TASK` and `specrail review cockpit TASK`, with automatic Cockpit generation and first-attachment presentation at specification and final approval gates.
- Added stage-specific readiness checks, exact blocker explanations, before/proposal/after comparison, viewport filtering, evidence inventory, metrics, and trace history.
- Kept Cockpit decisions read-only and delegated all state transitions to native Codex prompts and the deterministic CLI.
- Moved GitHub Issue/PR/CI delivery and Signed Delivery Bundle to deferred roadmap items without a target release.
- Added Cockpit security and regression tests for HTML escaping, offline operation, attachment ordering, and clean package installation.

## 0.5.0-beta.1 — 2026-08-07

- Prepared the first public beta under npm user `saulmarti`, with MIT license, public author and intended GitHub repository metadata.
- Added the canonical public `ROADMAP.md` with Now / Next / Later priorities, exit criteria, customer metrics, and an explicit deferred status for Signed Delivery Bundles.
- Added repository-wide `AGENTS.md` rules requiring roadmap, changelog, documentation, tests, migrations, and package validation to stay synchronized.
- Added a detailed Review Cockpit product concept and interactive static prototype.
- Added the planned GitHub Issue → PR → CI → final review → merge integration guide.
- Added a branding direction document covering positioning, taglines, logo concepts, palettes, typography, and product naming.
- Changed beta installation and publication guidance to use the npm `beta` dist-tag and documented `@saulmarti/specrail` as a fallback rather than a duplicate default package.

## 0.4.1 — 2026-08-07

- Renamed the public product and npm package to **SpecRail**, retaining `ai-flow` as a compatible command alias and preserving existing `.ai/` projects.
- Added `npx specrail install`, dynamic single-source versioning, npm publication metadata, a reduced publication file set, and release documentation.
- Re-reviewed the Prime-inspired architecture and upgraded traces to signed schema v3 snapshots for taskset, harness, runtime, parent ancestry, branches, and tamper validation.
- Added trace integrity and current snapshot digests to Review Bundles and local metrics.
- Added npm package/install regression tests and a product roadmap focused on Review Cockpit, GitHub delivery, replayable harness comparisons, adaptive policy, and signed exports.
- Replaced the project README with a publication-ready guide, examples, architecture explanation, migration notes, privacy model, FAQ, and troubleshooting commands.

## 0.4.0 — 2026-08-07

- Corrected Visualize semantics: interactive experiences, host capability discovery, signed sources, real invocation references, fresh-context evaluation, and non-blocking fallback.
- Corrected official Taste Skill install/frontmatter names and v2 workflow selection.
- Added immutable QA missions bound to specification approval.
- Added configurable failure-to-eval candidates and active regression routing.
- Added finite repair budgets that stop on the configured Nth failed attempt.
- Added branch-aware local traces and richer delivery metrics.
- Added independently evaluated material UI proposals and final results.
- Added user-approved, mechanically enforced project constitution principles.
- Added risk-selected property/mutation evidence with measurable report metadata.
- Added risk-selected operational logs, traces, and metrics with real execution metadata.
- Added end-to-end vertical slice plans with validated dependency DAGs.
- Expanded Review Bundles with QA, quality, operational, slice, constitution, and active-eval context.
- Improved migration and compatibility for earlier tasks, visualization records, and constitution data.
