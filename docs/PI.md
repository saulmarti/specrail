# Pi host adapter

**Status:** First-class compatibility contract.

SpecRail keeps workflow state, hashes, gates, evidence, Scope Guard, revisions, autonomy, and task leases host-neutral. Pi maps only host-dependent interaction/transport edges.

## Install

### Pi-native package

```bash
pi install npm:@saulmarti/specrail@beta
```

The package exposes `./extensions/specrail.js` and `./skills`; no global SpecRail CLI is required inside Pi. Project-local install remains available with `pi install -l`.

### Managed Codex + Pi installation

```bash
npm install -g @saulmarti/specrail@beta
specrail install
```

The managed installer registers `~/.ai-flow` as a local Pi Package, preserves unrelated Pi settings, installs the managed activation block, and keeps the shared SpecRail skills/launchers current.

## Process route: always explicit for new delivery work

A new repository delivery request does **not** enter SpecRail silently. Before creating a task, CodeGraph preflight, gate, evidence, or learning state, Pi uses `specrail_entry_gate` and asks:

- **SpecRail** — governed/traced workflow;
- **Directo** — execute without SpecRail workflow state;
- **Directo + verificar** — direct execution plus the smallest meaningful final verification;
- **Other…** — free-text answer.

No option is auto-selected. The route decision is separate from `micro/light/standard/rigorous` and from Guided/Autonomous/Headless.

Explicit controls suppress only the redundant entry question:

- `Sin SpecRail:` / `No SpecRail:` → Direct;
- `Directo + verificar:` / `Direct + Verify:` → Direct+Verify;
- `SpecRail Fast:` → governed SpecRail Fast;
- `Continue/Resume/Retoma TASK-####` → continue the existing SpecRail task without asking again.

In non-interactive Pi modes, an unresolved route fails closed with `PROCESS_ROUTE_REQUIRED`; the adapter never chooses for the user.

## No-Assumption contract

Material decisions may be resolved only from:

1. explicit active user input;
2. an approved SpecRail decision;
3. an authoritative repository contract;
4. one unique established repository pattern;
5. current deterministic tool evidence.

Model confidence is never authority. If two plausible material interpretations remain, mutation stops and Pi asks. Facts that the repository resolves uniquely should not generate a question.

Every clarification uses 2–4 concrete choices, at most one recommendation, and `Other`/free text. Up to four independent questions may be batched. Dependent questions are asked sequentially.

When the host exposes an attested richer `ask_user_question` capability (for example a compatible `@juicesharp/rpiv-ask-user-question` installation), SpecRail may prefer it. Otherwise the built-in Pi adapter uses `ctx.ui.select()` / `ctx.ui.input()` with the same semantics. The fallback is first-class; SpecRail does not silently install a third-party question package.

## Ponytail contract

Every production-code mutation route—SpecRail, Direct, or Direct+Verify—requires the **official Ponytail** skill/plugin in `full` mode unless the user explicitly disables Ponytail for the current work item.

SpecRail does not copy or impersonate Ponytail and never installs third-party code silently. If the host cannot attest the required capability, mutation stops and asks the user to enable/install official Ponytail or explicitly continue without it.

Before a mutation phase is completed, the official `ponytail-review` semantics review the current diff for unnecessary code/abstractions. Minimalism never overrides explicit user requirements, security/privacy, accessibility, data-loss protection, approved scope, acceptance criteria, or evidence requirements.

## Host contract

| SpecRail need | Pi mapping |
| --- | --- |
| New-work process route | `specrail_entry_gate` → native selector + free text |
| Deterministic CLI | `specrail_cli` executes bundled `scripts/specrail-fast.sh` directly |
| Deterministic specialist | `specrail_skill` loads the exact packaged `recommendedSkill` |
| Structural code context | `specrail_codegraph` → `codegraph explore <query>` |
| Stable session token | `specrail_host_context` → `ctx.sessionManager.getSessionId()` |
| Human gate | richer attested question capability when available, otherwise `request_user_input` → `ctx.ui.select()` / `ctx.ui.input()` |
| Fresh-session phase boundary | `/specrail-handoff TASK-####` → `ctx.newSession({ withSession })` |
| Model/reasoning | Pi-owned; SpecRail never selects it |
| Visual review | canonical inline evidence + compact Review Cockpit/openUrl fallback |
| Parallel subagents | `unattested` by default; deterministic serial fallback |

## Runtime safety

Pi can execute tool batches in parallel. `specrail_cli`, `specrail_entry_gate`, and `request_user_input` are sequential so workflow state and blocking human UI cannot race. Read-only helpers may remain parallel.

Killed/non-zero SpecRail or CodeGraph processes throw. A failed `next` is therefore a real blocker. The dispatcher is invoked through its Bash shebang, not `/bin/sh`, preserving macOS/Linux behavior.

Direct and Direct+Verify still receive the No-Assumption and Ponytail host policy, but they create no SpecRail task, CodeGraph preflight, gate, evidence state, or learning state.

## Human decisions

Core-governed interactions remain exact. For `interaction.tool === "request_user_input"`, the adapter preserves IDs, labels, descriptions, and free-text behavior; it never turns a recommendation into consent.

No interactive UI means no fabricated answer. Autonomous/Headless policy may mechanically advance only decisions already owned by that policy; unresolved human judgment remains blocked.

## Phase boundaries

SpecRail persists the boundary choice and ends the turn. The next turn/session enters the boundary before phase work:

- `current` → same Pi session after the required turn stop;
- `pause` → user may change Pi model/thinking;
- `fresh` → `/specrail-handoff TASK-####` or `/new` + `Continue TASK-####`.

The new session still enters the sealed SpecRail boundary before implementation/review.

## Compact approval review

Approval surfaces are decision-first:

1. compact Decision Capsule;
2. mandatory primary visual/behavior evidence;
3. native decision prompt.

Specification, acceptance/NFR detail, files, evidence inventory, checks, trace, repair history, experiments, and amendments remain available under Review Details/tabs instead of being repeated by default. Review Cockpit remains read-only. A generated HTML file is not proof that Pi displayed it; canonical inline evidence and actual host-open outcomes remain authoritative.

## Taste / visuals / browser

Taste accepts Pi as a supported host. Codex `$visualize` and `codex://` links are never prerequisites for Pi. A compatible Pi visualization/browser provider counts only when its actual capability/result is truthfully attested; otherwise canonical evidence and the Cockpit fallback apply.

## Concurrency

Parallel Pi **tool calls** do not prove independent parallel **subagents**. Subagents remain `unattested` unless explicitly and truthfully recorded. The scheduler therefore has a supported serial fallback.

## Verification contract

Repository tests cover:

- packaged Bash dispatcher and error propagation;
- entry route choices, explicit prefixes, free text, and headless fail-closed behavior;
- exact native clarification mapping;
- session-ID bridging and fresh handoff;
- deterministic packaged specialist loading;
- CodeGraph failure semantics;
- Ponytail/no-assumption host contracts;
- compact approval presentation;
- managed Pi-package installation.

`npm run release:check` remains the release-level validation gate.
