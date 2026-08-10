# Multi-Agent Concurrency

**Status:** Implemented for the local-filesystem coordination contract on the 0.9.1 codebase; pending publication in the next package release.

SpecRail Multi-Agent Concurrency schedules independent child tasks or vertical slices in parallel without weakening the normal delivery contract. It is a deterministic scheduler over existing task dependencies, Scope Guard boundaries, task leases, phase boundaries, and Git worktrees; it is not an instruction to spawn arbitrary agents.

## Why it exists

Large features often contain work that is genuinely independent. Serial execution wastes time, while unconstrained subagents can edit the same files, duplicate work, race on task state, or merge incompatible implementations. SpecRail therefore answers two separate questions:

1. **Can these tasks safely advance at the same time?** — deterministic library/CLI decision.
2. **Can this host actually run agents in parallel?** — host capability. When it cannot, the same lanes run sequentially.

## Candidate tasks

A parent plan uses, in order:

1. materialized `slice_ids`;
2. direct child tasks;
3. the parent's task dependencies.

A plan needs at least two candidates. The project `subagents.maxParallel` value is a **project-wide** hard concurrency ceiling across all active parent plans; an explicit plan may only lower its local limit, never raise the global one. Nested concurrency is bounded by `subagents.maxDepth` (default `1`), so child-of-child orchestration cannot recurse indefinitely unless the project explicitly raises that depth.

## Lane access

Each child is classified independently:

| Access | Meaning |
|---|---|
| `task-local` | The current phase can proceed without repository implementation writes. |
| `isolated-write` | Builder has an approved specification, a **currently valid** Scope Guard (seal + governance + no detected violations), a bounded write scope, and may receive a dedicated worktree. |
| `blocked-write` | Builder is not safe for parallel writing yet. |
| `terminal` | The child is already done/rejected. |

Unknown/broad Builder scope is never guessed safe.

## Dependency and conflict scheduling

SpecRail builds topological waves from dependencies between candidate lanes, but runtime readiness checks **every** unfinished dependency on each child, including dependencies outside the current plan. Only `done` satisfies a dependency; a rejected prerequisite is not silently treated as completed. Independent write lanes are allowed in the same wave only when their approved Scope Guard patterns cannot overlap. Possible overlap is conservative: uncertain patterns serialize rather than racing.

The static waves explain the plan; the runtime scheduler recalculates what is actually runnable from current canonical task state before every dispatch.

## Reservations

`concurrency prepare` atomically reserves each returned lane before the host launches a subagent. Every reservation receives a session ID that is stable for that reservation and unique across re-dispatches:

```text
CONC-TASK-0042:TASK-0043:<reservation-uuid>
```

`prepare` acquires both the reservation **and the normal task lease** for every returned lane, including `task-local` Product Owner/specification/Target Audience work. A task that belongs to a persisted concurrency plan is scheduler-owned: an agent may not mutate it before the lane has been prepared, and every mutating SpecRail command must carry the exact returned `--session`. The persisted reservation remains held even if its independently persisted task lease expires: SpecRail then blocks that lane as `stale-reservation-recovery-required` instead of redispatching a possibly still-running agent onto the same worktree. A live lane renews authority with `concurrency heartbeat` using the same session; otherwise the exact session must release the lane (or an administrator must explicitly force recovery) before a new session can be dispatched.

## Worktrees and control root

`isolated-write` lanes receive separate Git worktrees. The returned payload distinguishes:

- `controlRoot`: repository containing canonical `.ai/` state;
- `worktreePath`: workspace where that child may edit implementation files;
- `sessionId`: stable SpecRail session/lease identity for the lane.

The host must run SpecRail control transitions against the control root, pass the exact reservation `--session` to every agent-owned mutation, and perform implementation edits in the returned worktree. When a role completes or yields to a human gate, SpecRail releases that reservation/lease. Target Audience is the deliberate exception inside one persona's immediate review→complete/route atomic workflow: the final required persona retains authority until that transition finishes so the next role is re-dispatched with a **new** session identity. Builder, Reviewer, Product Owner, Product Specifier, QA, and Target Audience therefore cannot silently inherit one another's lane authority.

## Deterministic routing

When a parent has no higher-priority local product/human gate, is waiting on multiple child/slice dependencies, and at least one safe lane can advance, `specrail next PARENT` returns:

```text
action: prepare-concurrency-wave
recommendedSkill: ai-flow-multi-agent
```

The specialist skill handles both parent wave dispatch and child authority recovery. A child `next` may return `prepare-concurrency-lane` before reservation or `use-concurrency-session` when a reservation already exists; these are scheduler actions, never invitations to take over a generic task lease. The specialist prepares exactly the scheduler-approved lanes. Multiple subagents may be launched only when the returned `dispatch.mode` is `parallel`; otherwise SpecRail falls back to the explicitly reported non-parallel mode. Concurrency changes scheduling only — it never bypasses Product Owner, Target Audience, Amendments, QA, evidence, final approval, Autonomy policy, or delivery.


## Host capability contract

A static wave with two runnable lanes is **not** proof that two agents are actually running. By default `subagents.requireParallelHostAttestation` is `true`. A host session must persist an integrity-sealed capability record before SpecRail can return `dispatch.mode: parallel`. Without it, `prepare` uses `serial-fallback` and reserves only one lane even when several lanes are structurally safe. Capability records are immutable for a stable host session; changed capabilities require a new session ID, and digest tampering removes parallel authority.

SpecRail supports `subagents.coordination: local-filesystem` in this release. That contract covers multiple local processes/chats coordinated by atomic filesystem locks, task leases, sealed scheduler plans, and isolated Git worktrees. Any other coordination mode is rejected explicitly. Multi-machine/distributed consensus is therefore **not claimed as a supported mode** rather than being silently approximated.

The host capability record is an attestation from the trusted execution host, not a claim that SpecRail can inspect the host's private scheduler. See [`TRUST-MODEL.md`](TRUST-MODEL.md).

## CLI

Commands are primarily an internal orchestration surface, but are available for diagnostics:

```bash
specrail concurrency plan TASK-0042
specrail concurrency plan TASK-0042 --tasks TASK-0043,TASK-0044 --max 2
specrail concurrency status TASK-0042
specrail concurrency next TASK-0042
specrail capability host record --session HOST-SESSION --host codex --subagents true --parallel true --attestation "Host creates independent parallel worker sessions"
specrail concurrency prepare TASK-0042 --host-session HOST-SESSION
specrail concurrency heartbeat TASK-0042 TASK-0043 --session "<reservation-session>" [--ttl MS]
specrail concurrency release TASK-0042 TASK-0043 --session "<reservation-session>"
specrail concurrency cancel TASK-0042 [--force]
```

`prepare` creates worktrees only for safe writing lanes, acquires their task leases, and returns the only sessions authorized to mutate those planned tasks. `heartbeat` renews a long-running lane with that exact session; expiry never authorizes automatic redispatch. Wave preparation is transactional for synchronous failures: if a later lane cannot acquire authority, SpecRail rolls back leases, newly created worktrees, and task worktree metadata before returning the error. `release` abandons one prepared lane with the exact session. `cancel` removes a persisted plan; it refuses active reservations unless `--force` is used for deliberate administrative recovery. When the plan itself has lost integrity, `cancel --force` does not trust its tampered task/reservation payload: it removes only task leases whose independently persisted owner session is namespaced to that `CONC-parent`, preserves worktrees, and then removes the unusable plan. A phase/role transition normally yields its lane automatically, so the next specialist must refresh/prepare and receive a new session rather than reusing the previous agent. Questions, Amendments, context-expansion approvals, explicit blockers, Product Owner judgment, Target Audience product trade-offs, and other human gates also yield agent authority; when the human resolves them, a planned task returns to the scheduler and must be prepared again before agent mutation.

## Autonomy interaction

Autonomy Levels and concurrency are orthogonal:

- **Guided:** concurrent lanes may work independently, but human-owned gates still pause normally.
- **Autonomous:** mechanically clean child gates may advance under the normal Autonomy policy; judgment still interrupts.
- **Headless:** safe work continues; unresolved human judgment produces `headless-stop` instead of an invented answer.

A concurrency plan never grants more authority than the active Autonomy Level. Parent-local gates take precedence: Product Owner review/decision, native approvals, amendments, lease conflicts, open questions, Target Audience decisions, and other governed interactions cannot be overwritten by a runnable concurrency wave.

Persisted scheduler plans are integrity-sealed. The global scheduler fails closed if any plan file loses structural or digest integrity, because it can no longer prove that the corrupted plan is not holding a live reservation.


## Crash and recovery behavior

The scheduler is deliberately fail-closed. Plan files are integrity-sealed; a corrupted persisted plan blocks new global dispatch because SpecRail can no longer prove that it holds no live reservation. Administrative `concurrency cancel PARENT --force` is the recovery path for a corrupt plan and derives releasable lease ownership independently from scheduler session prefixes rather than trusting the corrupt payload. Scheduler/plan locks record their owning PID so a slow but live process is not mistaken for a stale lock. Synchronous `prepare` failures are rolled back before the wave is committed. A process/OS crash in the middle of Git or filesystem work can still leave a lease, reservation, or worktree requiring explicit administrative recovery. **Lease expiry alone is not authority to redispatch:** a persisted reservation without its matching live lease is surfaced as `stale-reservation-recovery-required` and remains held until the owner heartbeats/reacquires authority or an administrator deliberately releases/cancels it. SpecRail prefers a visible blocked lane over redispatching work whose ownership cannot be proven.
