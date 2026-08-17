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


## Current beta hardening

**Status: Beta**

The canonical release number lives in `package.json`; this section describes the behavior implemented in the current beta source tree. The current hardening extends the `0.8.x` governance line with explicit per-work-item process choice, runtime-backed No-Assumption/Ponytail mutation gates, concise approval presentation, visual evidence integrity, runtime previews, and phase-context boundaries. It does not turn SpecRail into a task board or move approval authority away from native user gates.

### Entry and mutation governance

**Status: Beta · Implemented in current `0.10.x` development tree**

A new repository-delivery work item now starts with an explicit **SpecRail / Directo / Directo + verificar / Other** route choice unless an explicit prefix or existing `TASK-####` continuation already resolves the route. Route choice is deliberately independent from the later `micro | light | standard | rigorous` Control Profile and from `Guided | Autonomous | Headless` authority.

Direct routes do not create repository-local SpecRail task/CodeGraph/evidence/trace/learning workflow state merely to remember the bypass. Pi may persist only safe route metadata for retry/compaction/session reconstruction; restoring that metadata resets mutation authorization, material-decision clearance, Ponytail attestation/review, and incomplete verification authority.

Production-code mutation requires an explicit material-uncertainty audit. Material decisions must bind to runtime-observed user input, exact repository contracts, unique established repository evidence, approved decisions, or trusted deterministic tool results; self-declared provenance cannot satisfy the gate. Clarifications use 2–4 choices plus free text/Other, while legacy generic open-answer questions remain compatible.

Every code-writing route requires official `@dietrichgebert/ponytail` in literal `full` mode and rechecks the current host state immediately before mutation. There is no internal bypass or vendored imitation. After the final mutation, the official Ponytail review is fingerprint-bound so later repository changes make it stale. Direct + Verify additionally runs only a fail-closed allowlisted read-only verifier over Git-visible tracked/non-ignored-untracked content; the snapshot is rooted at the Git repository, works before the first commit, hashes symlinks without following external targets, and rejects shell/interpreter wrappers.

**Success metric:** zero production-code writes without an explicit route, current Ponytail `full`, and an audited material-decision gate; zero Direct+Verify successes from a verifier that changed Git-visible repository content.

See [`docs/ENTRY-GOVERNANCE.md`](docs/ENTRY-GOVERNANCE.md).

### Review presentation contract

**Status: Beta · Introduced: `0.8.2-beta.0`**

Specification and final approval gates now carry one deterministic presentation contract from the CLI into the host:

- `presentation.markdown` is **Decision Capsule-first**: the decision-critical delta, proof, risk/blocker, and primary evidence stay concise instead of reconstructing the complete Review Bundle inline;
- the complete authoritative Review Bundle remains attached as **Review Details**, so details are available without forcing every approval turn to repeat full audit history;
- `phase complete` returns the newly reached `next.interaction` so the agent does not invent or paraphrase its own approval selector;
- the orchestrator must show the Decision Capsule plus required visible evidence and keep Review Details available before forwarding the exact native questions returned by SpecRail;
- generating Review Cockpit HTML never proves that the user has seen it; generated and host-visible states remain distinct;
- in Codex, the installed `visualize` skill is invoked explicitly as `$visualize` when an interactive review materially helps; SpecRail never invents a `visualize.render` tool, asks the user to type `/visualize`, or calls private plugin scripts directly;
- a Visualize `outcome: rendered` now means the task-owned HTML fragment and native `visualize...` reference were validated against the signed plan; it does not claim that the host UI displayed them; `artifactPrepared`, `referencePrepared`, `hostPresentation`, and `hostPresentationVerified` stay distinct;
- active canonical visual evidence is marked `requiredVisible` and maps to explicit blocking `present-image` conversation actions; visual gates first return `host_actions`, and a session/digest-bound acknowledgment must resolve those actions before SpecRail emits or accepts the native decision; local paths and generated HTML are audit metadata only, and inability to present a required image blocks approval instead of degrading to paths;
- the generated Review Cockpit exposes an exact `file://` `openUrl` and the fallback maps it to a non-blocking `open-url` browser action; `opened` is recorded only after a real open and `offered` only after the actionable URL is exposed, so “Cockpit generated” never ends as only `/tmp/...html` or `.ai/...` text;
- before/after frontend captures and the user-facing preview are tied to the served `http(s)` runtime that produced them; raw `index.html`, `file://`, and filesystem-path previews are invalid for approval, and the gate exposes the verified runtime as `presentation.previewUrl`;
- Markdown and evidence remain authoritative; the direct fallback is required whenever Visualize/Cockpit host presentation is unverified, not only when Visualize is unavailable.

**Success metric:** zero approval turns where SpecRail claims a review surface was displayed without host-visible evidence, while routine approval turns stay short enough to read without hiding governed details.

See [`docs/REVIEW-COCKPIT.md`](docs/REVIEW-COCKPIT.md).

### Visual Comparator v2

**Status: Beta · Introduced: `0.8.2-beta.0`**

Frontend approval surfaces use one deterministic comparator contract across the generated Cockpit and `$visualize`:

- Side by side keeps Before / Proposal / After simultaneously inspectable;
- Slider compares the strongest available canonical pair without hiding which roles are being compared;
- Overlay exposes alignment and visual drift with adjustable opacity;
- viewport, route/target, plus capture-scope filters and exact, case-sensitive route + target + viewport + capture-scope grouping prevent unrelated captures from being compared accidentally;
- the current `UI Target` is compiled as ordered `Route → Target → exact pixel Viewport(s) → Capture` contexts; stale historical contexts are excluded from active Comparator/Visualize/capsule sources and from the canonical visual-evaluator digest;
- route, target, viewport, capture scope, and comparison mode stay visible as review context;
- missing required roles are rendered as explicit error states rather than blank frames or broken thumbnails;
- `$visualize` must emit the v2 comparator structure, visible comparator-source/review-role markers, and route/target/viewport/capture-scope metadata in addition to embedding every canonical evidence ID; a static gallery or cross-context pair cannot be recorded as a successful comparator.

At specification approval the required frontend roles are Before + Proposal. At final approval they are Before + Proposal + After. The generated Cockpit remains a self-contained HTML fallback; native Visualize presentation still requires the real `visualize...` content reference.

**Success metric:** users can verify approved intent and implementation visually without opening evidence files manually, and zero successful Visualize records are static galleries masquerading as the required comparator.

See [`docs/REVIEW-COCKPIT.md`](docs/REVIEW-COCKPIT.md).

### Clean phase context handoffs

**Status: Beta · Introduced: `0.8.2-beta.0`**

SpecRail separates planning, implementation, and independent review **without storing model configuration**:

- the Codex model/reasoning selector is always user-owned; SpecRail never stores, recommends, or validates a model name;
- planning/refinement uses a bounded repository context so expensive reasoning does not absorb implementation-scale code context prematurely;
- when the specification reaches Builder, SpecRail compiles an executable implementation capsule and enforces a strong **turn boundary** before coding; `startExecution`/phase completion mechanically reject bypasses rather than trusting agent prose;
- `spec approve` exposes `approved`, `userInputRequired`, and the native boundary `interaction` at the top level; the explicit choices are current selector, pause to change model/reasoning, or fresh chat, and none may implement in the approval turn;
- in `Guided`, the boundary remains flexible: `same-chat-ok` for small low-risk work and `fresh-chat-recommended` for normal/risky/context-heavy work; the native choice is persisted first and only the next continuation may enter it; in `Autonomous`, a mechanically safe boundary may enter deterministically in the current stable session without human interruption; `Headless` stops if it cannot prove a safe supported entry;
- a same-chat entry performs a logical authority reset while a fresh-chat entry also removes prior-phase conversation from raw input context;
- the implementation capsule is optimized for execution by a less-capable model: authority, ordered steps, ACs, Scope Guard, QA Mission, UI proposal/evidence, CodeGraph seeds, Definition of Done, and stop/escalation conditions are explicit;
- implementation receives at least `standard` repository context and preserves `rigorous` when the approved execution profile requires it;
- Technical Review gets the same strong/flexible boundary and a separate compact handoff so review does not silently inherit Builder assumptions; Builder ownership is released before the review boundary and review entry acquires its own lease;
- phase preparation resets active CodeGraph context even when two adjacent phases share the same profile, while the sealed capsule remains stable during justified Builder context expansion;
- boundary state and capsule content are integrity-checked and governed changes/re-entry invalidate stale boundaries;
- boundary estimates report model-independent raw prior-phase carryover savings and optionally uncached input-cost savings without pretending to know Codex compaction, billing, or cache hits.

Automatic visible-thread creation may be added only when Codex exposes a stable thread contract. Even then, SpecRail must leave model selection to the user/host rather than introducing its own model mapping.

**Success metric:** planning context stays bounded, every planning→implementation and implementation→review transition stops at a deterministic boundary, less-capable Builders can execute the capsule without reconstructing planning, and fresh-chat handoffs materially reduce raw repeated input context while same-chat remains available for small work.

### First-class Pi host adapter

**Status: Implemented**

Ship the same deterministic SpecRail core as a native Pi package rather than maintaining a Pi-specific workflow. The npm manifest exposes both package extensions plus skills; Pi-native installs execute the bundled Bash dispatcher through `specrail_cli`, load deterministic roles through `specrail_skill`, query structural context through `specrail_codegraph`/CodeGraph `explore` without extra Pi MCP wiring, bind gates to Pi's real session identity, render exact human decisions with Pi UI, enforce runtime mutation/verification gates, and create fresh phase sessions with `/specrail-handoff TASK-####`. Mutating CLI calls and human gates are explicitly sequential under Pi's parallel tool runtime, subprocess failures become real Pi tool failures, Taste accepts Pi, and the managed/global installer registers `~/.ai-flow` as a local Pi Package while preserving unrelated host settings/instructions and removing the obsolete loose-extension copy. Runtime compatibility tests cover the adapter rather than checking source strings only.

**Guardrails:** model/thinking choice remains host-owned; no Codex-only deep-link or Visualize contract is assumed on Pi; canonical evidence + Review Cockpit is the visual fallback; unverified parallel-subagent support remains `serial-fallback`.

### Release metadata integrity

**Status: Beta · Introduced: `0.8.2-beta.0`**

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

### Incremental Revision Loop / Selective Revalidation

**Status: Beta · Implemented in current `0.10.x` development tree**

Bounded feedback discovered from the implemented result stays inside the same task as immutable `REV-*` records. The default loop is Builder delta → targeted post-implementation validation → Final Approval. Revision feedback does not consume repair budget, receives a compact Revision Delta Capsule instead of a regenerated full implementation capsule, and preserves Technical Review / QA Mission / Target Audience / Product Owner artifacts unless the change invalidates them.

Small revisions are explicitly **implement-first**: no new test plan or permanent regression test is required before the requested delta is visible and stable enough to judge. Existing tests may run afterwards when directly relevant and cheap; permanent coverage is decided after stabilization.

Builder completions create deterministic `GEN-*` implementation generations and affected evidence must prove the current generation. This permits safe reuse of unaffected evidence without allowing stale affected screenshots/tests/QA artifacts to pass. Material architecture, migration, security, new product-flow/capability, or breaking-contract changes fail closed into Amendments/full governed review.

The final incremental-governance hardening is implemented: `REV-*` v3 seals a revision-start workspace baseline, computes a provisional route from request/files/explicit semantic signals, then recomputes the authoritative route from the actual files changed by Builder. `classification` is now explanatory metadata only; new labels require no routing code. Material deltas discovered only after implementation fail closed before targeted validation. Revision routing remains backed by the declarative artifact dependency graph and can start from any post-approval execution/review point. User waivers are gate metadata (`waivable`) rather than a duplicated override target list, so future workflow gates inherit one consistent authority model.

**Success metric:** median bounded final-review iteration reaches the user again through one implementation pass plus only directly affected validation, without replaying product/architecture/reviewer context or increasing accepted stale-evidence risk.

See [`docs/REVISIONS.md`](docs/REVISIONS.md).

### User Governance Overrides / no-loop closure

**Status: Beta · Implemented in current `0.10.x` development tree**

Explicit user authority can terminate or waive workflow ceremony without making agents generally permissive. `OVR-*` records capture current-turn user-authorized `close` or named gate waivers. A close request is terminal and auditable; a skipped validation/review step is removed from subsequent routing/readiness so SpecRail does not repeatedly re-block on the same requirement. Normal agents and Autonomous/Headless execution cannot mint these overrides themselves.

**Success metric:** after one explicit user instruction to close anyway or skip a named gate, the same gate is surfaced as a blocker zero additional times; the task history still distinguishes verified completion from user-waived completion.

See [`docs/USER-GOVERNANCE-OVERRIDES.md`](docs/USER-GOVERNANCE-OVERRIDES.md).

## Accepted implementation order

Recent real usage changed the priority order. Reliability of the **think → executable capsule → implementation → evidence → review** path now outranks adding more management surfaces. The current sequence is:

1. **Implementation contract quality** — Capsule Quality Gate, Builder Comprehension Preflight, Decision Budget, Executable Acceptance Criteria, and Contract Conformance Monitor.
2. **Runtime + review reliability** — Preview Session Manager, Visual Comparator v2 hardening, and runtime-aware Doctor checks.
3. **Context efficiency with real measurement** — phase token telemetry, Adaptive Boundary Recommendation, Capsule Delta, role-specific context cache, and implementation checkpoints.
4. **Specification Intelligence** — Requirement Source Ledger, adversarial critic, first-class NFRs, failure/change classification, contract compatibility/Impact Radius, and Repository Blueprint/domain vocabulary.
5. **Safe lifecycle management** — content-aware managed updates plus explicit release/migration/rollback contracts.
6. **Human attention layer** — Review Inbox / “What needs me?” as a projection over deterministic Readiness and governance contracts, not a Kanban board.
7. **Experiment automation** — Automatic Experiment Runner only after the contracts being compared are stable enough to make the experiment meaningful.

This order may change again when production usage exposes a higher-value integrity or usability failure.

## Autonomous delivery — implemented

**Implementation status:** complete on the current 0.9.1 codebase and tracked under `Unreleased` until published in a subsequent package release. Clean-room verification: [`docs/VALIDATION-0.9.1-AUTONOMY-CONCURRENCY-PRODUCT-INTELLIGENCE.md`](docs/VALIDATION-0.9.1-AUTONOMY-CONCURRENCY-PRODUCT-INTELLIGENCE.md).


### Autonomy Levels

- `Guided`: explicit Product Owner acknowledgement plus human review at approval/delivery gates;
- `Autonomous`: cross only mechanically clean gates and interrupt for human judgment;
- `Headless`: use the same safe automation but stop instead of fabricating a human decision;
- autonomous local merge requires explicit project policy; external delivery remains human-authorized;
- normal Builder/Reviewer phase boundaries obey the autonomy policy: Guided preserves the user choice, Autonomous crosses a mechanically safe same-session boundary, and Headless fails closed when stable session authority is unavailable.

## Multi-agent delivery — implemented

### Dependency-aware concurrency

- schedule child tasks / vertical slices in topological waves under `subagents.maxParallel`;
- reserve lanes atomically so repeated orchestration cannot double-dispatch the same ready task;
- allow parallel planning/read-only task work without pretending it owns implementation files;
- require approved, current, bounded Scope Guard boundaries before Builder lanes can write concurrently;
- conservatively serialize possible write-scope overlaps and isolate safe writers in separate Git worktrees;
- bind every prepared lane to a reservation-specific session **and normal task lease**, reject unscheduled mutations of planned tasks, require heartbeat renewal for long-running owners, hold stale reservations fail-closed instead of redispatching on lease expiry, and yield/re-dispatch a fresh session at role boundaries so traces, phase boundaries, evidence, QA, Product Intelligence, and Autonomy remain authoritative without allowing a delayed prior dispatch to reclaim a lane;
- require an immutable integrity-checked host capability attestation before reporting `dispatch.mode: parallel`; otherwise reserve one lane through deterministic `serial-fallback`;
- support local-filesystem coordination explicitly and reject unsupported distributed coordination instead of approximating it.

**Contract status:** deterministic concurrency governance is complete for the declared local-filesystem trust model. Vendor-specific subagent launch mechanics live at the host adapter boundary and are represented through the host capability contract rather than guessed by the core.

## Product intelligence — implemented

### Project Product Owner

- persist product mission, priorities, anti-goals, and decision rules per project;
- bootstrap concrete product/owner/audience context first, then review value/overlap/conflicts before Product Specifier work;
- in Guided, present every current Product Owner opinion for acknowledgement; in Autonomous/Headless, escalate only material `revise` / `do-not-build` judgment instead of cancelling autonomously;
- seal the pre-spec review into specification governance;
- after QA/Target Audience, require a fresh integrity-sealed Product Owner outcome review (`ship` / `revise` / `do-not-ship`) before final approval, with Guided acknowledgement and Autonomous/Headless escalation only for material judgment.

### Target Audience validation

- simulate only project-defined primary/secondary audience profiles through the public product interface and reject incomplete primary-profile configuration;
- assess comprehension, utility, discoverability, friction, trust, and repeat value;
- require a fresh stable session after QA/review and another fresh session for each additional primary audience persona;
- compile an audience-only handoff that excludes code, diffs, implementation plans, architecture internals, tests, private technical handoffs, and QA conclusions;
- integrity-seal reviews, invalidate stale audience reviews after relevant implementation/evidence/product changes, replace valid stale batches transactionally, and fail closed on corrupted stale review artifacts until explicit recovery;
- surface genuine product trade-offs as human decisions before final approval.

## Execution reliability — highest priority

### Implementation Capsule Quality Gate

**Status: Planned · Priority: P0**

Compile and validate the Builder capsule before the implementation boundary can be entered. The gate should reject contradictory instructions, missing verification recipes, unresolved material decisions, stale visual targets, invalid evidence references, incomplete Scope Guard information, and missing Definition of Done / QA Mission content.

The output is diagnostic rather than an opaque score: for example `AC-003 has no verification recipe` or `approved UI proposal has no canonical target`.

**Success metric:** a less-capable Builder can execute the capsule without reconstructing planning or asking avoidable clarification questions.

### Builder Comprehension Preflight

**Status: Planned · Priority: P0**

Before editing, Builder emits a small structured execution map: **AC → files/symbols → intended action → verification**. SpecRail compares it mechanically with the capsule, Scope Guard, and canonical evidence. A matching preflight starts implementation automatically; a mismatch blocks before code drift begins.

**Success metric:** misunderstandings are caught before the first material edit rather than during Technical Review.

### Decision Budget

**Status: Planned · Priority: P0**

Classify implementation decisions as `FIXED`, `LOCAL`, or `ESCALATE`. Fixed decisions are governed and immutable, local decisions may be made by Builder without a human gate, and material decisions return to the narrowest specification/amendment path.

**Success metric:** cheaper implementation models spend fewer tokens deciding what authority they have and make fewer unauthorized product/architecture choices.

### Executable Acceptance Criteria

**Status: Planned · Priority: P0**

Extend each effective `AC-*` with a compact execution/verification contract: target, observable expectation, verification method, evidence kind, and failure condition. Text remains human-readable; the structured form lets Builder and QA traverse criteria deterministically.

**Success metric:** every required AC has a concrete implementation/verifiability path before Builder starts.

### Contract Conformance Monitor

**Status: Planned · Priority: P0**

Move important Builder rules from skill prose into runtime enforcement. Detect writes outside Scope Guard, protected-file edits, attempts to complete without required evidence, invalid frontend previews, stale proposals, unapproved material contract changes, and other observable drift while work is still in progress.

**Success metric:** fewer repair loops caused by violations SpecRail could have rejected at the moment they occurred.

## Runtime and review reliability

### Preview Session Manager

**Status: Planned · Priority: P1**

Add a deterministic frontend runtime manager for the task worktree: discover the approved dev/preview command, choose or validate a port, wait for HTTP + target DOM readiness, persist the verified runtime URL, health-check/restart it through the review gate, and stop it when the task no longer needs it.

`file://`, raw `index.html`, and stale/dead preview URLs remain invalid.

**Success metric:** zero frontend approval attempts fail because the user was shown a blank local file or a dead runtime.

### Runtime-aware `specrail doctor`

**Status: Planned · Priority: P1**

Extend Doctor with stale preview sessions, missing visual source files, broken proposal/render links, stale/corrupt boundaries, orphaned leases, handoff digest mismatches, disappeared worktrees, and other execution-runtime faults discovered during recent real usage.

Safe local fixes remain plan-first and approval-controlled.

### Visual Comparator v2 follow-up

**Status: Beta hardening · Priority: P1**

The v2 comparator is implemented in the current beta. Follow-up work is limited to measured usability improvements: keyboard accessibility, richer device grouping, optional pixel-diff/heatmap assistance when source dimensions are compatible, and review-time metrics. Canonical evidence always remains the authority; a visual diff never decides acceptance automatically.

## Context efficiency and measured cost

### Real phase token telemetry

**Status: Planned · Priority: P1**

When the host exposes trustworthy accounting, persist real input, cached-input, output, and model identity per planning / implementation / review phase. Never estimate missing billed usage as fact and never hard-code model prices into workflow state.

**Success metric:** same-chat versus fresh-chat recommendations can be evaluated from actual usage rather than synthetic carryover estimates.

### Adaptive Boundary Recommendation

**Status: Planned · Priority: P1**

Use measured prior-phase context, capsule size, task risk, expected implementation turns, and observed history to recommend `same-chat-ok` or `fresh-chat-recommended`. The user remains free to choose either path and all model selection stays in Codex.

### Capsule Delta after Amendments

**Status: Partially implemented · Priority: P1**

`REV-*` bounded refinements now use a compact, integrity-sensitive Revision Delta Capsule and selective evidence invalidation. The remaining work is to extend the same delta principle to approved Amendments that alter only part of the implementation contract, identifying changed ACs, scope additions/removals, decisions, evidence, and QA implications instead of forcing Builder to ingest a full regenerated capsule unless necessary.

### Role-specific Context Cache

**Status: Planned · Priority: P2**

Persist validated CodeGraph-derived facts/seeds by role and source digest—not prior chat prose—so Planner, Builder, and Reviewer can reuse still-valid repository knowledge without repeating broad discovery.

### Implementation Checkpoints

**Status: Planned · Priority: P2**

For sufficiently large work, run lightweight non-human checkpoints after coherent AC groups: Scope Guard, focused tests, capsule conformance, and evidence readiness. Passing checkpoints do not interrupt the user; drift stops early before it compounds.

## Specification intelligence — priority P2

These capabilities follow execution/runtime hardening because they strengthen the deterministic data consumed by Builder, QA, Cockpit, and the future Review Inbox. They extend existing specification, evidence, Scope Guard, Amendment, and Readiness contracts rather than creating a parallel workflow.

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


## Safe lifecycle management — priority P2

### Content-aware managed updates

**Status: Planned**

Improve SpecRail self-update/install behavior so managed assets are compared by content, unchanged files are left alone, customized files are identified before replacement, and recoverable backups are created before any managed overwrite. Existing `.ai/` project history remains untouched.

**Beta foundation:** `specrail update` preserves the installed `beta`/`latest` channel by default, updates the global npm package, and refreshes managed Codex + Pi assets from the newly installed package. Content-aware diffing and customized-file conflict handling remain planned here.

### Release, migration, and rollback contract

**Status: Planned**

Define an explicit compatibility and recovery contract for SpecRail upgrades and for governed delivery changes that require migration. Releases should declare relevant state/schema compatibility, required migrations, backup expectations, and the supported rollback path instead of treating rollback as an informal operational note.

For application changes classified as breaking, the same contract should connect affected consumers, migration/compatibility strategy, operational verification, and rollback evidence to the approved Impact Radius.

**Success metric:** upgrades and breaking deliveries can be reversed or recovered without guessing which SpecRail state or consumer contract is safe.

---


## Human attention layer — priority P3

### Review Inbox / What needs me?

**Status: In design**

Surface only tasks and decisions requiring human attention, without becoming a Kanban board. The Inbox should consume the deterministic contracts above so it can explain not merely that a task is blocked, but whether the user is resolving a requirement conflict, approving a breaking Amendment, reviewing missing NFR evidence, deciding a scope violation, or performing final approval.

The Inbox remains a read-only projection; native host gates and deterministic CLI transitions own decisions.

## Experiment automation — priority P4

### Automatic Experiment Runner

**Status: In design**

Orchestrate an approved `fast`/`standard`/`rigorous` comparison end-to-end without manual Replay command choreography. It remains secondary to implementation reliability, specification intelligence, and the human-attention layer.

## Product refinement — validate with real usage

### Review Cockpit evolution

**Status: Beta**

The local read-only MVP was implemented in `0.5.0-beta.2`; `0.8.2-beta.0` hardens how that review is actually presented inside Codex. Current behavior and future improvements are:

- **0.7.0-beta.1:** latest replay comparison, exact reported token metrics, and adaptive Harness recommendation are visible in the Cockpit experiment view;
- **Current beta:** Decision Capsule-first host presentation keeps the normal approval turn concise while the complete authoritative Review Bundle remains attached as Review Details; generated Cockpit HTML is never treated as proof of display; `$visualize` is the explicit Codex skill path for a native interactive review surface when useful, with the native content reference required as render evidence; frontend evidence avoids unresolved local Markdown image links and final UI review opens the served `presentation.previewUrl` rather than a raw worktree `index.html`;
- **0.8.2-beta.0 Visual Comparator v2:** Side by side / Slider / Overlay, viewport + route/target filters, explicit missing-role states, and structural validation that prevents a static `$visualize` gallery from masquerading as the comparator;
- richer backend, architecture, contract-impact, NFR, and database evidence explorers;
- clearer stale-evidence and requirement-provenance explanations;
- accessibility audits and keyboard-navigation evals;
- review-time metrics and qualitative rejection analysis;
- additional host adapters only when they expose a verifiable presentation result; no hard-coded fictional tool names or private host implementation paths.

The Cockpit remains read-only and derived from governed SpecRail state; native Codex gates own decisions. Visualize improves the review surface but never becomes a substitute for the complete Markdown/evidence contract.

See [`docs/REVIEW-COCKPIT.md`](docs/REVIEW-COCKPIT.md).

### Host-native model handoff automation

**Status: Research**

When Codex Desktop exposes a stable thread-creation contract with verifiable model, reasoning-effort, and working-directory selection, allow SpecRail to turn the existing deterministic planning → implementation → review handoffs into automatic visible-thread transitions while leaving model selection entirely to the Codex selector. The fallback remains the current main-session handoff. Do not adopt a host adapter that silently forks full chat history, chooses a model for the user, or cannot prove which model actually ran.

**Success metric:** switching execution roles becomes one-click/automatic without increasing context duplication, losing the task worktree, or weakening model provenance.

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