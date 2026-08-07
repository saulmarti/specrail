# SpecRail 0.6.0-beta.1 — implementation re-review

Date: 2026-08-07

## Scope

This review started from the exact `0.5.0-beta.2` source package and re-reviewed the Review Cockpit release before implementing the next public roadmap phase: deterministic Readiness / Why blocked, plan-first `doctor --fix`, and Replayable Tasksets / Harness comparison.

## Findings from the re-review

### 1. Cockpit had its own readiness logic

The Cockpit was useful, but its stage checks could diverge from future CLI status output. The implementation now has one `taskReadiness()` contract consumed by the CLI, `next`, and Cockpit. This prevents a task from looking healthy in one surface and blocked in another.

### 2. Doctor treated the legacy launcher as if it were part of primary health

The product is SpecRail. `specrail` is now the required launcher health check; `ai-flow` is optional compatibility. Doctor also reads installed Taste Skill frontmatter directly instead of spawning helper Node processes repeatedly.

### 3. Repairing the installed package by re-running its own installer could self-delete

A naïve `doctor --fix` that invoked `~/.ai-flow/scripts/install.mjs` could remove the package directory containing the running installer. Managed restoration is now a shared library operation. The installer and Doctor both call that operation safely.

### 4. Old regression tests coupled governance to installer source text

The global Codex activation block was intentionally made compact in earlier versions, with the complete contract living in the main skill. Several old tests still required duplicated CodeGraph, lease, context, and visualization prose inside `scripts/install.mjs`. Those tests now validate compact delegation plus the actual skill contract instead of forcing context bloat back into the installer.

### 5. Required readiness gates needed stage-aware semantics

A missing project context, CodeGraph contract, QA Mission, or durable learning cannot remain a harmless `pending` state once the workflow reaches a gate that requires it. Readiness now turns those into explicit blockers at the relevant phase and returns the owner plus shortest safe action.

### 6. Replay contained dead instruction-generation code

The unused helper was removed. Replay now has one instruction contract for isolated variants.

### 7. A replay result could have relied only on a claimed test exit code

That was not strong enough for an evidence-backed product. An accepted replay now requires at least one real artifact inside the isolated worktree. Evidence is canonicalized and SHA-256 hashed. Test records remain useful metadata but cannot be the sole proof.

## Implemented next phase

### Readiness / Why blocked

- New `taskReadiness()` deterministic contract.
- `specrail readiness TASK` and `specrail why-blocked TASK`.
- Same result embedded in `next` and consumed by Review Cockpit.
- States: pass, pending, fail, stale, warning, not-applicable.
- Blocker ownership: user, agent, system, external.
- Explicit shortest safe next action.
- Transparent passed/applicable ratio; never an AI confidence score.
- Covers project context, CodeGraph, questions, dependencies, leases, trace integrity, repair/context budgets, spec lint, QA mission, evidence, approval drift, durable learning, final approval, and delivery.

### `specrail doctor --fix`

- `doctor --fix` produces a plan and native `request_user_input` gate first.
- `doctor --fix --apply safe` applies only approved automatic + reversible changes.
- Safe operations: restore managed SpecRail files/config and repair repository-local CodeGraph index.
- External/manual operations remain explicit: Node, Git, CodeGraph installation, host MCP schema/configuration.
- No silent plugin/system-package installation.

### Replayable Tasksets / Harness comparison

- Approved spec + immutable QA Mission are frozen into a taskset digest.
- Active eval IDs, risk-selected quality policy and operational policy are included.
- Built-in experimental harnesses: fast, standard, rigorous.
- Each variant receives an isolated Git worktree and fresh instructions.
- Variants may not inspect/copy another variant.
- Results must use exact taskset/harness/QA digests.
- Real evidence paths must remain inside the variant worktree and are hashed.
- Accepted variants must pass the same acceptance criteria and immutable QA Mission.
- Comparison has no opaque aggregate score. It exposes acceptance, QA, repairs, elapsed time, context, optional tool/token data, changed files and diff size.
- A recommendation is made only among equivalently verified accepted variants; tie-breaking uses fewer repairs, then elapsed/context cost.

## Product judgment

Readiness and Doctor have immediate user value: they reduce time lost understanding or repairing a blocked workflow. Replay is deliberately labelled experimental. Its value compounds only after enough real tasks exist to compare process choices; it should not become overhead on ordinary tasks.

## Remaining limitations

- Replay currently ships three built-in process profiles; it does not yet execute arbitrary third-party harness definitions.
- Token/tool-call metrics are recorded only when the host can provide them; they are not fabricated.
- SpecRail validates replay evidence files and hashes, but the replay framework does not independently re-execute arbitrary reported test commands. Same-taskset acceptance and QA evidence remain the controlling verification.
- `doctor --fix` deliberately does not guess how a future Codex host represents MCP/plugin configuration.
- Review Cockpit HTML rendering still depends on how the current Codex Desktop host presents local HTML attachments; Markdown/evidence fallback remains authoritative.

## Recommendation

Use `0.6.0-beta.1` on real repositories and collect delivery metrics before adding more process layers. The next high-value product work should be driven by observed review time, blocker frequency, Doctor failures, and replay experiments rather than expanding the number of agents.
