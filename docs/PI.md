# Pi host adapter

**Status:** First-class compatibility contract.

SpecRail keeps workflow state, hashes, gates, evidence, Scope Guard, revisions, autonomy, and task leases host-neutral. Pi maps only host-dependent interaction/transport edges.

## Install

### Pi-native package

```bash
pi install npm:@saulmarti/specrail@beta
```

The SpecRail Pi Package exposes its own extensions/skills **and loads the bundled official `@dietrichgebert/ponytail` Pi extension and skills**. Ponytail is a declared SpecRail runtime dependency; it is not a separate prerequisite the user must install first. No global SpecRail CLI is required inside Pi. Project-local install remains available with `pi install -l`.

### Managed Codex installation with optional Pi integration

```bash
npm install -g @saulmarti/specrail@beta
specrail install
```

In an interactive terminal, `specrail install` explicitly asks whether Pi should also be configured. The deterministic forms are:

```bash
specrail install --pi
specrail install --no-pi
```

`--pi` registers the managed `~/.ai-flow` package with Pi while preserving unrelated Pi settings. `--no-pi` does not modify `~/.pi`. In non-interactive installation, Pi is skipped unless `--pi` was explicitly supplied.

Both routes keep the shared SpecRail launchers/skills current and install the bundled official Ponytail runtime/skills. Re-running the installer is idempotent for the managed assets.

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

When the host exposes an attested richer `ask_user_question` capability (for example a compatible `@juicesharp/rpiv-ask-user-question` installation), SpecRail may prefer it. Otherwise the built-in Pi adapter uses `ctx.ui.select()` / `ctx.ui.input()` with the same semantics. The fallback is first-class; SpecRail does not silently install unrelated question packages.

## Ponytail contract

Every production-code mutation route—SpecRail, Direct, or Direct+Verify—requires the **official Ponytail** capability in literal `full` mode.

SpecRail declares and installs official `@dietrichgebert/ponytail` as part of its own runtime. Managed Codex installation copies the official Ponytail skills into the managed skill locations; the Pi Package loads the bundled official Ponytail extension and skill directory. If the host cannot attest Ponytail after installation, that is a broken/incomplete SpecRail installation: reload the host or repair/reinstall SpecRail. Do not tell the user to install a separate Ponytail prerequisite and do not substitute an imitation.

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
| Visual review | Decision Capsule in chat + required canonical inline evidence; Review Details on demand |
| Parallel subagents | `unattested` by default; deterministic serial fallback |

## Runtime safety

Pi can execute tool batches in parallel. `specrail_cli`, `specrail_entry_gate`, and `request_user_input` are sequential so workflow state and blocking human UI cannot race. Read-only helpers may remain parallel.

Killed/non-zero SpecRail or CodeGraph processes throw. A failed `next` is therefore a real blocker. The dispatcher is invoked through its Bash shebang, not `/bin/sh`, preserving macOS/Linux behavior.

Direct and Direct+Verify still receive the No-Assumption and Ponytail host policy, but they create no SpecRail task, CodeGraph preflight, gate, evidence state, or learning state.

## Human decisions

Core-governed interactions remain exact. For `interaction.tool === "request_user_input"`, the adapter preserves IDs, labels, descriptions, and free-text behavior; it never turns a recommendation into consent.

For approval interactions, the exact native question begins with the complete compact Decision Capsule and only then presents the decision selector. This ordering does not depend on the host rendering optional presentation metadata.

No interactive UI means no fabricated answer. Autonomous/Headless policy may mechanically advance only decisions already owned by that policy; unresolved human judgment remains blocked.

## Phase boundaries

SpecRail persists the boundary choice and ends the turn. The next turn/session enters the boundary before phase work:

- `current` → same Pi session after the required turn stop;
- `pause` → user may change Pi model/thinking;
- `fresh` → `/specrail-handoff TASK-####` or `/new` + `Continue TASK-####`.

The new session still enters the sealed SpecRail boundary before implementation/review.

## Compact approval review

Approval surfaces are decision-first:

1. concise Decision Capsule in chat;
2. mandatory canonical visual/behavior evidence when applicable;
3. native decision selector.

Specification, acceptance/NFR detail, files, evidence inventory, checks, trace, repair history, experiments, and amendments remain available through the Review Bundle / Review Details instead of being repeated by default.

**Review Cockpit is no longer part of the normal approval path.** SpecRail does not generate, open, offer, or require Cockpit for approval. The legacy manual command/artifact may remain for explicit manual use only.

## Taste / visuals / browser

Taste accepts Pi as a supported host. Codex `$visualize` and `codex://` links are never prerequisites for Pi. A compatible Pi visualization/browser provider counts only when its actual capability/result is truthfully attested; otherwise the canonical inline evidence contract applies.

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
- bundled official Ponytail and no-assumption host contracts;
- summary-first compact approval presentation with no normal Cockpit dependency;
- managed Pi opt-in and `--no-pi` non-mutation behavior.

`npm run release:check` remains the release-level validation gate.
