# SpecRail public roadmap

SpecRail is building a **human-approved, evidence-backed delivery layer for coding agents**. This roadmap is public so users can understand what is being built, why it matters, and what is deliberately deferred.

> Roadmap items are intentions, not delivery promises. Priorities change when real usage exposes a higher-value problem.

## Product principles

1. **Accepted delivery over generated code.** Optimize the complete path from request to trusted result.
2. **Human authority at material gates.** No silent approvals or scope changes.
3. **Evidence over claims.** Real screenshots, responses, tests, logs, traces, and measurable reports.
4. **Local-first by default.** No mandatory SpecRail cloud, account, database, or task board.
5. **Adaptive rigor.** A CSS adjustment and a critical migration must not pay the same process cost.
6. **Deterministic governance.** State changes, hashes, leases, budgets, and delivery rules live in code rather than prompt prose.
7. **Portable agent execution.** Taskset, harness, runtime, and trace remain separable and inspectable.

## Status legend

- **Shipped** — available in a published stable release.
- **Beta** — implemented and usable, but APIs or behavior may still change.
- **In design** — product and technical design are being validated.
- **Planned** — accepted direction, implementation has not started.
- **Research** — value or approach still needs evidence.
- **Deferred** — valid use case, but intentionally has no current priority or target release.


## Current release line — `0.9.x beta`

**Status: Beta**

`0.9.x` consolidates the governance work introduced through `0.8.x` and hardens the human-review contract inside Codex. It does not turn SpecRail into a task board or move approval authority away from native user gates.

### Review presentation contract

**Status: Beta · Introduced: `0.9.0-beta.0`**

Specification and final approval gates now carry one deterministic presentation contract from the CLI into Codex:

- `presentation.markdown` contains the complete generated Review Bundle rather than a second shortened reconstruction;
- `phase complete` returns the newly reached `next.interaction` so the agent does not invent or paraphrase its own approval selector;
- the orchestrator must show the complete Review Bundle and supported evidence before forwarding the exact native questions returned by SpecRail;
- generating Review Cockpit HTML never proves that the user has seen it; generated and host-visible states remain distinct;
- in Codex, the installed `visualize` skill is invoked explicitly as `$visualize` when an interactive review materially helps; SpecRail never invents a `visualize.render` tool, asks the user to type `/visualize`, or calls private plugin scripts directly;
- a Visualize result counts as rendered only when a native `visualize...` content reference points at the actual task-owned HTML fragment outside the repository and the signed visualization/evaluation contract remains valid;
- Markdown and evidence remain the authoritative non-blocking fallback when Visualize is unavailable.

**Success metric:** zero approval turns where SpecRail claims a review surface was displayed without host-visible evidence, and fewer approvals made from summaries that omit governed requirements or evidence.

See [`docs/REVIEW-COCKPIT.md`](docs/REVIEW-COCKPIT.md).

### Release metadata integrity

**Status: Beta · Introduced: `0.9.0-beta.0`**

`package.json` is the canonical package version. Release tooling synchronizes and verifies the portable Agent Plugin manifest and lockfile metadata before tests, packing, or publishing, so `npm version` cannot silently leave package identities on different versions. Public-release tests validate version coherence instead of hard-coding one release number.

**Success metric:** no publish attempt reaches `npm publish` with divergent package, lockfile, or Agent Plugin versions.

## Foundation lineage — `0.5.x beta`

**Status: Beta**

- Natural-language activation in Codex.
- Markdown task state and cross-chat continuation.
- Specification linting, approval hashes, immutable QA missions, finite repair budgets, and atomic leases.
- Real evidence contracts for UI, backend, architecture, database, testing, and operations.
- Taste Skill and Image Gen routing for UI/UX work.
- Review Bundles, local metrics, failure-to-eval candidates, project constitution, and vertical slices.
- Signed taskset / harness / runtime / trace snapshots.
- **Review Cockpit MVP:** generated local HTML with overview, before/proposal/after evidence, deterministic checks, blockers, metrics, repair budget, context usage, and signed trace history.
- npm packaging, public documentation, and backward-compatible `ai-flow` command alias.

### Exit criteria for beta

- Successful installation from npm on clean macOS and Linux environments.
- At least 20 real tasks across multiple repositories.
- No unresolved corruption or silent-bypass bugs in approval, evidence, lease, or delivery gates.
- Measured review and delivery metrics from real usage.
- Stable migration path for `.ai/` project data.
- Measured evidence that Review Cockpit reduces review time without increasing final rejection rates.

---

## Delivery intelligence lineage — `0.6.x beta`

### Readiness / Why blocked

**Status: Beta · Introduced: `0.6.0-beta.1`**

One deterministic gate contract is shared by CLI, `next`, and Review Cockpit. It exposes passed, pending, failed, stale and non-applicable gates, blocker ownership, and the shortest safe next action.

**Success metric:** lower time-to-unblock and fewer clarification turns about task state.

See [`docs/READINESS.md`](docs/READINESS.md).

### `specrail doctor --fix`

**Status: Beta · Introduced: `0.6.0-beta.1`**

Doctor separates local reversible SpecRail repairs from external/manual dependencies. Safe changes are always shown first and require the native user gate before application.

**Success metric:** most supported clean installations recover from local configuration drift without manual file surgery.

See [`docs/DOCTOR.md`](docs/DOCTOR.md).

### Replayable Tasksets and Harness comparison

**Status: Beta / experimental · Pulled forward to `0.6.0-beta.1`**

Freeze the same approved taskset and QA Mission, execute built-in `fast`, `standard`, or `rigorous` harness profiles in isolated worktrees, and compare only equally verified outcomes. No opaque aggregate score is used.

**Success metric:** after enough real tasks, choose workflow policies from repeatable acceptance/rework/time/context evidence rather than intuition.

See [`docs/REPLAY.md`](docs/REPLAY.md).

---

## Experiment intelligence — `0.7.x beta`

### Exact token-aware Replay comparison

**Status: Beta · Introduced: `0.7.0-beta.1`**

Replay comparisons record exact host/API/export token usage when available: input, cached input, output and optional reasoning tokens. Missing usage remains unavailable. Cached input is not double-counted, and token cost is only a tie-breaker when compared runs identify the same model.

**Success metric:** enough token coverage to explain which Harnesses spend more context/output and whether that extra usage reduces repairs or rejection.

See [`docs/REPLAY.md`](docs/REPLAY.md) and [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md).

### Adaptive workflow policy

**Status: Beta / experimental · Introduced: `0.7.0-beta.1`**

`specrail harness recommend TASK` summarizes comparable local replay history and recommends `fast`, `standard`, or `rigorous` only after the configured sample threshold. Quality and repair evidence stays ahead of token/time cost. The recommendation is always advisory and never mutates a task automatically.

**Success metric:** historical recommendations reduce median repair/review cost without increasing rejected deliveries.

See [`docs/ADAPTIVE-POLICY.md`](docs/ADAPTIVE-POLICY.md).

### Public experiment playbook

**Status: Beta · Introduced: `0.7.0-beta.1`**

`specrail replay scenarios` exposes representative task families for measuring the overhead floor and the point where deeper Harnesses begin to pay off.

**Success metric:** users can collect comparable repository-specific data instead of benchmarking workflows on arbitrary one-off tasks.

See [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md).


## Delivery contract governance — `0.8.x beta`

### Replay measurement hardening

**Status: Beta · Introduced: `0.8.0-beta.1`**

Historical Harness policy now excludes incomplete variants, waits for complete experiments before naming a winner, uses semantic cohort signatures, verifies token provenance artifacts, derives work metrics from traces, and separates wall-clock from active-agent time.

See [`docs/REPLAY-HARDENING.md`](docs/REPLAY-HARDENING.md).

### Acceptance Coverage Matrix

**Status: Beta · Introduced: `0.8.0-beta.1`**

Every approved acceptance criterion has a stable `AC-*` identifier. Canonical evidence declares which criteria it proves, and final approval requires 100% coverage of the effective specification.

**Success metric:** lower final-review ambiguity and fewer accepted deliveries with an unproven product requirement.

See [`docs/ACCEPTANCE-COVERAGE.md`](docs/ACCEPTANCE-COVERAGE.md).

### Scope Guard / Blast Radius

**Status: Beta · Introduced: `0.8.0-beta.1`**

CodeGraph-informed implementation boundaries are reviewed before approval, sealed against a baseline, compared with the real diff, and block unauthorized or protected changes. New untracked files are included.

**Success metric:** reduce user rejections caused by agents changing unrelated files or broadening implementation scope.

See [`docs/SCOPE-GUARD.md`](docs/SCOPE-GUARD.md).

### Specification Amendments / Change Requests

**Status: Beta · Introduced: `0.8.0-beta.1`**

Bounded implementation discoveries can be proposed as immutable amendments with new `AC-*` criteria and blast-radius additions. The user approves the change without rewriting the original approved specification.

**Success metric:** less full-spec re-review while preserving human authority over material scope changes.

See [`docs/AMENDMENTS.md`](docs/AMENDMENTS.md).

## Specification intelligence — next accepted direction

These capabilities are accepted for the roadmap because they strengthen the deterministic data that later review surfaces consume. They should extend the existing specification, evidence, Scope Guard, Amendment, Readiness, and Cockpit contracts rather than create a parallel workflow.

### Requirement Source Ledger

**Status: Planned**

Preserve requirement provenance from intake through delivery. Every material requirement should have a stable `REQ-*` identity, one or more inspectable sources, and an explicit disposition into the effective specification, out-of-scope rationale, or an unresolved question. Acceptance Criteria continue to use stable `AC-*` IDs, producing an auditable chain from **source → requirement → acceptance criterion → implementation/evidence**.

**Guardrail:** inferred requirements must be labeled as inferred and must never silently outrank explicit user or repository sources. Contradictory authoritative sources become a human decision gate.

### Adversarial Specification Critic

**Status: Planned**

Add a read-only specification-critique pass that actively searches for contradictions, ambiguous terminology, missing failure paths, undefined authorization boundaries, invalid or missing state transitions, untestable criteria, and vague non-functional requirements.

Mechanically decidable checks belong in the typed SpecRail linter. Semantic critique may use an agent, but it cannot approve, rewrite, or silently resolve material ambiguity.

**Success metric:** fewer implementation returns caused by requirement defects that were already present before approval.

### Non-functional Requirement Coverage

**Status: Planned**

Promote measurable non-functional requirements to stable `NFR-*` contracts with an explicit verification method and canonical evidence. Acceptance Coverage should report functional `AC-*` coverage and applicable `NFR-*` coverage separately, and final approval should require all applicable mandatory NFRs to be evidenced.

Examples include performance budgets, accessibility requirements, reliability, security properties, privacy constraints, and operational behavior. Qualitative statements such as “fast” or “secure” are not sufficient without a measurable or mechanically reviewable verification contract.

### Change / Failure Classification

**Status: Planned**

Classify why work needs to move backward or request human intervention, at minimum distinguishing implementation defects, contract defects, specification defects, evidence defects, scope violations, and production regressions. `readiness`, `next`, Review Cockpit, and the future Review Inbox should expose this classification and route to the narrowest safe recovery path.

**Success metric:** fewer generic “blocked” states and fewer unnecessary full-specification restarts.

### Contract Compatibility and Impact Radius

**Status: Planned**

Extend Amendments and Scope Guard for contract-bearing changes. Classify compatible changes as `additive`, `breaking`, or `unknown`; treat `unknown` conservatively when material risk exists. Breaking changes must identify affected contracts/consumers and require migration, compatibility, and rollback considerations where applicable.

Use CodeGraph and repository evidence to derive consumers when possible rather than relying on agent self-report. This evolves the approved Blast Radius into an **Impact Radius** without replacing Scope Guard.

### Repository Blueprint + domain vocabulary

**Status: Planned**

Make `specrail init` discover run/test commands, architecture, design system, critical boundaries, constitution candidates, and canonical domain vocabulary for faster first value. Domain discovery should identify important entities, canonical terms, enums, and state transitions without forcing every repository to maintain a separate glossary document.

The Blueprint is advisory project context until explicitly accepted into governed project state.

### Content-aware managed updates

**Status: Planned**

Improve SpecRail self-update/install behavior so managed assets are compared by content, unchanged files are left alone, customized files are identified before replacement, and recoverable backups are created before any managed overwrite. Existing `.ai/` project history remains untouched.

### Release, migration, and rollback contract

**Status: Planned**

Define an explicit compatibility and recovery contract for SpecRail upgrades and for governed delivery changes that require migration. Releases should declare relevant state/schema compatibility, required migrations, backup expectations, and the supported rollback path instead of treating rollback as an informal operational note.

For application changes classified as breaking, the same contract should connect affected consumers, migration/compatibility strategy, operational verification, and rollback evidence to the approved Impact Radius.

**Success metric:** upgrades and breaking deliveries can be reversed or recovered without guessing which SpecRail state or consumer contract is safe.

---

## Accepted implementation order

The current priority sequence is:

1. **Specification Intelligence:** Requirement Source Ledger, adversarial critic, first-class NFRs, failure/change classification, contract compatibility/Impact Radius, and Repository Blueprint/domain vocabulary.
2. **Safe lifecycle management:** content-aware managed updates plus explicit release/migration/rollback contracts.
3. **Human attention layer:** Review Inbox / “What needs me?” built as a projection over deterministic Readiness and governance contracts, not as a Kanban board.
4. **Experiment automation:** Automatic Experiment Runner after the specification and human-review contracts are stable enough to compare workflow policies safely.

This order may change when real usage exposes a higher-value integrity or usability problem.

## Human attention layer — after specification intelligence

### Review Inbox / What needs me?

**Status: In design**

Surface only tasks and decisions requiring human attention, without becoming a Kanban board. The Inbox should consume the deterministic contracts above so it can explain not merely that a task is blocked, but whether the user is resolving a requirement conflict, approving a breaking Amendment, reviewing missing NFR evidence, deciding a scope violation, or performing final approval.

The Inbox remains a read-only projection; native Codex gates and deterministic CLI transitions own decisions.

### Automatic Experiment Runner

**Status: In design**

Orchestrate an approved `fast`/`standard`/`rigorous` comparison end-to-end without manual Replay command choreography. It remains secondary to specification intelligence and human-attention improvements.

## Product refinement — validate with real usage

### Review Cockpit evolution

**Status: Beta**

The local read-only MVP was implemented in `0.5.0-beta.2`; `0.9.0-beta.0` hardens how that review is actually presented inside Codex. Current behavior and future improvements are:

- **0.7.0-beta.1:** latest replay comparison, exact reported token metrics, and adaptive Harness recommendation are visible in the Cockpit experiment view;
- **0.9.0-beta.0:** complete Review Bundle presentation is mandatory before native approval input; generated Cockpit HTML is never treated as proof of display; `$visualize` is the explicit Codex skill path for a native interactive review surface when useful, with the native content reference required as render evidence;
- richer backend, architecture, contract-impact, NFR, and database evidence explorers;
- better comparison of multiple desktop/mobile captures;
- clearer stale-evidence and requirement-provenance explanations;
- accessibility audits and keyboard-navigation evals;
- review-time metrics and qualitative rejection analysis;
- additional host adapters only when they expose a verifiable presentation result; no hard-coded fictional tool names or private host implementation paths.

The Cockpit remains read-only and derived from governed SpecRail state; native Codex gates own decisions. Visualize improves the review surface but never becomes a substitute for the complete Markdown/evidence contract.

See [`docs/REVIEW-COCKPIT.md`](docs/REVIEW-COCKPIT.md).

### Semantic failure clustering

**Status: Research**

Group meaning-equivalent failures while preserving explicit human approval before activating any regression eval.

### Team coordination

**Status: Research**

Optional shared leases, approvals, and task state for teams. Solo local mode remains the default and must not require a server.

### Policy packs

**Status: Research**

Installable, mechanically enforceable constitutions and evidence profiles for accessibility, APIs, startups, performance, or regulated data.

### Integration capability registry

**Status: Research**

Discover host plugins and MCPs, map them to evidence capabilities, and explain which workflow routes they unlock without hard-coded tool names.

---

## Deferred — future ideas without current priority

### GitHub Issue → PR → CI → merge

**Status: Deferred · No target release**

The design remains documented because it can be useful for teams, but SpecRail will not prioritize it until solo local delivery, Cockpit review, readiness, doctor repair, and replayable tasksets demonstrate value in real usage.

If revisited, CI will remain evidence for a specific commit—not a replacement for specification or final product approval.

See [`docs/GITHUB-DELIVERY.md`](docs/GITHUB-DELIVERY.md).

### Signed Delivery Bundle

**Status: Deferred · No target release**

A portable tamper-evident archive may help client handoff, audits, regulated work, or machine-to-machine transfer. It is not a priority for ordinary solo development and will require demonstrated user demand before implementation.

---

## Explicitly not planned

- A mandatory cloud service or SpecRail account.
- A replacement for GitHub Issues, Jira, Azure DevOps, or a full task board.
- Silent implementation before specification approval.
- Automatic activation of permanent rules from one user rejection.
- Unlimited autonomous repair loops.
- A growing collection of permanent agents without measured value.

## How roadmap updates work

Every user-facing feature change must update this file in the same change set:

1. Move the item to its new status.
2. Update scope and exit criteria when implementation differs from the original plan.
3. Link relevant documentation, issue, or pull request when available.
4. Record shipped behavior in `CHANGELOG.md`.
5. Never mark an item **Shipped** or **Beta** until code, tests, documentation, migration, and package validation are complete.

Contribution and agent rules live in [`AGENTS.md`](AGENTS.md).
