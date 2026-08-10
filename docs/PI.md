# Pi host adapter

**Status:** First-class compatibility contract.

SpecRail keeps deterministic workflow state, hashes, gates, evidence, Scope Guard, revisions, autonomy policy, and task leases independent from the coding-agent host. The Pi adapter maps only host-dependent edges onto Pi primitives; it does not fork workflow semantics.

## Install

Choose one route.

### Pi-native package

```bash
pi install npm:@saulmarti/specrail@beta
```

The npm package declares:

```json
{
  "pi": {
    "extensions": ["./extensions/specrail.js"],
    "skills": ["./skills"]
  }
}
```

Pi loads the extension and skills directly from the package. `typebox` is declared as a Pi-core peer dependency, so the package follows Pi's distributed-package dependency contract. No global `specrail` executable is required for agent operation.

Use project-local Pi settings when desired:

```bash
pi install -l npm:@saulmarti/specrail@beta
```

### Managed Codex + Pi installation

```bash
npm install -g @saulmarti/specrail@beta
specrail install
```

The managed installer:

- installs the canonical SpecRail package under `~/.ai-flow`;
- registers the absolute `~/.ai-flow` directory in `~/.pi/agent/settings.json` as a **local Pi Package**;
- preserves unrelated Pi settings/packages and the existing `~/.pi/agent/AGENTS.md`;
- adds only a compact managed activation block to `~/.pi/agent/AGENTS.md`;
- removes the obsolete loose `~/.pi/agent/extensions/specrail.js` copy if one exists;
- installs shared Agent Skills under `~/.agents/skills/` and the terminal launchers under `~/.local/bin/`.

This deliberately uses Pi's package loader for both installation routes. Do not also install the npm Pi package into the same Pi scope, because duplicate resources are unnecessary.

## Host contract

| SpecRail need | Pi mapping |
| --- | --- |
| Deterministic CLI | `specrail_cli` executes bundled `scripts/specrail-fast.sh` directly through its Bash shebang |
| Deterministic specialist | `specrail_skill` loads the exact packaged `recommendedSkill`; no `.agents/skills` path assumption |
| Structural code context | `specrail_codegraph` → `codegraph explore <query>`; no Pi MCP bridge required |
| Stable session token | `specrail_host_context` → `ctx.sessionManager.getSessionId()` |
| Exact human gate | `request_user_input` → `ctx.ui.select()` / `ctx.ui.input()` |
| Fresh-session phase boundary | `/specrail-handoff TASK-####` → `ctx.newSession({ withSession })` + replacement-session `sendUserMessage()` |
| Model/reasoning ownership | Pi remains authoritative; SpecRail never sets model/thinking |
| Skill discovery | Pi Package `skills/` manifest plus deterministic `specrail_skill` bridge |
| Natural activation | compact `before_agent_start` system-prompt addition for repository delivery work |
| Visual review | canonical inline evidence + Review Cockpit/openUrl fallback; Codex `$visualize` is never assumed |
| Parallel subagents | `unattested` by default; safe serial fallback until independent workers are truthfully attested |

The adapter does not reimplement SpecRail decisions. `next`, interactions, readiness, approval integrity, autonomy, revisions, Scope Guard, and evidence remain owned by the TypeScript core.

## Runtime safety

Pi executes tool batches in parallel by default. SpecRail therefore marks `specrail_cli` and `request_user_input` with `executionMode: "sequential"`; state-mutating workflow transitions and blocking human UI cannot race another tool in the same batch. `specrail_codegraph`, `specrail_skill`, and `specrail_host_context` remain read-only and may stay parallel.

Pi marks a tool result as failed only when `execute()` throws. The adapter throws on every killed/non-zero SpecRail or CodeGraph process. A failed `specrail next` therefore remains a real runtime blocker instead of a successful-looking result containing an exit code.

The dispatcher is executed directly, not through `/bin/sh`. Its `#!/usr/bin/env bash` shebang is authoritative on both supported macOS and Linux hosts, avoiding the `dash`/Bash incompatibility common on Linux.

## Natural activation and specialist routing

For repository delivery requests, the Pi extension adds the minimum SpecRail host guidance before the agent starts. Read-only explanations/research remain outside SpecRail. Existing explicit controls keep the same meaning:

- `Sin SpecRail:` / `No SpecRail:` — total bypass for this request;
- `SpecRail Fast:` — governed low-overhead path, with deterministic escalation when risk/scope becomes material;
- `Continue TASK-####` — deterministic task continuation.

`ai-flow` remains the full workflow contract. After `next` chooses a role, native Pi installs call `specrail_skill` with the exact `recommendedSkill`. This prevents a native Pi Package installation from depending on Codex/global `.agents/skills/...` filesystem conventions.

## Human decisions

When core routing returns `interaction.tool === "request_user_input"`, Pi presents the exact supplied questions/options through the adapter. The adapter returns the selected labels and never chooses on the user's behalf.

In Pi modes without interactive UI, the adapter fails closed for a human-owned decision. Autonomous/Headless behavior remains determined by SpecRail policy; missing UI is never converted into implicit approval.

## Phase boundaries

SpecRail persists the boundary choice first and requires the next host turn/session to enter it. Pi-specific behavior is limited to transport:

- `current` continues in the same Pi session after the required turn stop;
- `pause` leaves model/thinking changes to Pi's own controls;
- `fresh` uses `/specrail-handoff TASK-####` or an equivalent `/new` + `Continue TASK-####`.

`/specrail-handoff` uses Pi's replacement-session `withSession` callback and calls `sendUserMessage()` only on the fresh context. It never reuses stale pre-switch `pi`/session objects. The new session must still enter the sealed SpecRail boundary before implementation/review work.

## Taste / UI work

Taste validation is host-neutral for supported hosts: a valid brief may target `agent: "codex"` or `agent: "pi"`, and Pi skill roots are accepted. Codex-only Visualize language remains explicitly conditional instead of becoming a Pi requirement.

## Visuals and browser capability

The Codex `$visualize` skill and `codex://` deep links are host-specific and are never prerequisites for Pi compatibility. Pi follows the canonical Review Bundle and evidence contract. A compatible third-party Pi visualization/browser extension may satisfy the same contract only when its actual capability is discovered and its result is recorded truthfully. Missing required presentation capability fails closed rather than fabricating evidence.

## Concurrency

Pi's parallel **tool execution** is not proof of independent parallel **subagents**. SpecRail therefore reports subagents as `unattested` by default. If the active Pi setup really provides independent workers, the normal SpecRail host-capability command may record a truthful session-specific attestation; otherwise the scheduler uses deterministic serial fallback. Serial fallback is a supported compatibility path, not a failure.

## Verification contract

The repository carries runtime tests that load the actual packaged adapter and verify:

- direct Bash-shebang CLI execution on Linux;
- non-zero/killed process → thrown Pi tool failure;
- sequential mutation/human-gate semantics;
- exact native UI answer mapping and headless fail-closed behavior;
- real session-ID bridging;
- fresh replacement-session handoff;
- natural activation, Fast/bypass/continuation rules;
- deterministic packaged `ai-flow` orchestrator + specialist loading without `.agents`;
- CodeGraph failure semantics;
- Pi Taste brief/skill-root acceptance;
- managed local-package registration while preserving unrelated Pi settings.

`npm run release:check` includes these tests plus the full SpecRail suite and package dry-run.

## Compatibility boundary

First-class Pi compatibility means SpecRail can complete its governed workflow through Pi while preserving every core safety invariant. It does **not** mean every optional Codex plugin has a one-for-one Pi equivalent. Optional host features may use a truthful fallback (for example serial subagent execution or canonical evidence instead of Codex Visualize) without reducing workflow compatibility.
