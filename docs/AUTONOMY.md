# Autonomy Levels

**Status:** Implemented on the 0.9.1 codebase; pending publication in the next package release.

SpecRail keeps one deterministic workflow and changes only who is authorized to cross safe gates.

## Guided

```text
○ Guided
  Review spec, plan/result gates, and delivery.
```

Guided is the default. Every current Project Product Owner opinion is presented for explicit acknowledgement both before specification and after QA/Target Audience; specification approval, final approval, and delivery also remain native human gates.

## Autonomous

```text
● Autonomous
  Interrupt only when judgment is required.
```

When every deterministic blocker is clear, SpecRail may advance specification and final approval without asking the user to click through a mechanical gate. A clean pre-spec Product Owner `build` or final Product Owner `ship` verdict may also continue without an acknowledgement click. It still interrupts for:

- material questions;
- pre-spec Product Owner `revise` / `do-not-build` and final Product Owner `revise` / `do-not-ship` recommendations;
- Target Audience product trade-offs;
- specification amendments;
- repair-budget recovery;
- lease conflicts;
- legacy integrity reapproval;
- eval activation;
- delivery unless local merge was explicitly authorized.

## Headless

```text
○ Headless
  Stop only when SpecRail cannot safely proceed.
```

Headless uses the same mechanical automatic transitions as Autonomous. If an explicit interaction **or any user/external-owned readiness blocker** requires human judgment, it returns `headless-stop` without fabricating an answer or presenting a fake approval. Agent/system-owned blockers remain ordinary blocked work and do not masquerade as human-judgment stops.


## Phase-boundary behavior

Autonomy also applies to the normal planning → Builder and Builder → Technical Review boundaries without changing the handoff contract:

| Level | Mechanically safe boundary | Missing stable session / unsupported entry |
|---|---|---|
| `Guided` | Present the native same-chat / model-change / fresh-chat choice | Remain at the user-owned boundary |
| `Autonomous` | Enter the deterministic same-session boundary automatically when a stable session is available | Return a system blocker asking the host to provide stable session authority; do not turn it into product judgment |
| `Headless` | Enter the same mechanically safe boundary automatically | Return `headless-stop`; never invent a boundary choice |

Target Audience is intentionally stricter: its independent-user boundary is always `fresh-chat-required` when Product Intelligence requires it, regardless of the general Builder/Reviewer recommendation.

## Delivery authorization

Autonomy does not imply permission to publish, push, deploy, or mutate external systems. The project policy supports only:

- `ask` — delivery remains a human decision (default);
- `merge-local` — Autonomous/Headless may perform SpecRail's deterministic local worktree merge.

External delivery still requires explicit confirmation.

Autonomy policy is part of the approved project-governance seal. Changing `guided` / `autonomous` / `headless` or delivery authority after specification approval invalidates that task's governance context and requires reapproval before execution can continue.

## Internal commands

Normal users can work in natural language. The orchestrator uses these deterministic commands internally:

```text
specrail autonomy status [TASK]
specrail autonomy set guided|autonomous|headless [--delivery ask|merge-local]
specrail autonomy advance TASK
```

`autonomy advance` never guesses. It only crosses a clean specification/final gate or an explicitly authorized local merge. Agent/system blockers return `blocked`; normal agent work returns `no-mechanical-gate`; only Headless human/external judgment returns `headless-stop`.
