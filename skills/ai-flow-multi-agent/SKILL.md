---
name: ai-flow-multi-agent
description: Use when SpecRail deterministically routes a parent task to Multi-Agent Concurrency. Prepare and run only the scheduler-approved child lanes, preserving dependency order, task leases, reservation-specific lane sessions, isolated worktrees, and non-overlapping Scope Guard boundaries instead of spawning arbitrary parallel agents.
---
# Multi-Agent Concurrency

Run independent SpecRail child or vertical-slice tasks concurrently only when the deterministic scheduler proves they can safely advance.

1. Read the parent `next` result. Enter this skill for scheduler actions `prepare-concurrency-wave`, `prepare-concurrency-lane`, or `use-concurrency-session`; do not invent concurrency because several tasks merely look independent. `prepare-concurrency-lane` means the child is plan-owned but not currently reserved; refresh the parent plan and prepare it. `use-concurrency-session` means the child is already reserved and the host must continue only with the exact returned session rather than offering a generic lease takeover.
2. Before preparing more than one lane, declare the **current host session capability**. If this host can truly spawn independent subagents concurrently, persist that fact with `specrail capability host record --session <host-session> --host <name> --subagents true --parallel true --attestation <concrete-host-statement>` and pass `--host-session <host-session>` to `concurrency prepare`. Capability records are integrity-sealed and immutable per session. Without verified parallel capability, the default contract is `serial-fallback`: SpecRail reserves **one lane only** and must not be described as parallel execution.
3. Prepare the wave through SpecRail. The returned `dispatch.mode` is authoritative: `parallel` means host capability is attested; `serial-fallback` means execute one lane; `scheduler-only` is available only when the project explicitly disables host attestation and still must not be advertised as observed parallelism. The returned lanes are reservations, not suggestions. Never spawn a task that is absent from that wave.
4. Preserve each returned `sessionId` as the authoritative SpecRail session **and task-lease identity** for that reservation. A task in a persisted plan must not be mutated before `prepare`. Pass the exact `--session` on every agent-owned mutating SpecRail command against `controlRoot`; perform code edits in `worktreePath` when one is returned.
5. `task-local` lanes may perform isolated product/specification/review work without repository writes. `isolated-write` lanes may write only inside their approved Scope Guard boundary and only from their separate worktree.
6. `blocked-write`, `waiting`, `blocked`, `reserved`, and conflicting lanes are not new work. Never bypass their gate or duplicate an existing reservation.
7. For every lane, call the normal SpecRail `next`/phase-boundary workflow and load that task's returned specialist contract. Multi-Agent Concurrency changes scheduling, not quality, approval, evidence, lease, repair, or phase-boundary rules.
8. Launch multiple subagents **only** when `dispatch.mode` is `parallel`. For `serial-fallback`, execute only the single returned lane. For `scheduler-only`, preserve scheduler isolation but do not claim SpecRail verified actual host parallelism.
9. A successful phase/review transition yields the current lane automatically. Questions, Amendments, user-approved context expansion, explicit blockers, Product Owner judgment, and Target Audience product trade-offs also yield agent authority. A final Target Audience persona with no human trade-off keeps its current lane only through the immediate agent-owned complete/route transition; that transition then yields normally. After the human resolves such a gate, refresh the parent plan and `prepare` again before any agent mutation. Never let an old subagent continue with its previous session. If a lane cannot start or must be abandoned, release it with the exact returned `sessionId`. Use force release/cancel only for intentional administrative recovery; `cancel --force` is also the fail-closed recovery path when the persisted plan seal itself is corrupt.
10. After lanes progress, refresh the concurrency plan. Start another wave only from newly returned ready lanes; dependency completion and scope conflicts are recalculated from canonical task state.
11. Do not merge concurrent worktrees opportunistically. Each child must independently reach final approval/delivery, and parent progress remains blocked until its dependencies are complete.

## Safety invariants
- Long-running lanes must heartbeat their exact reservation session before lease expiry; stale reservations remain held and are never auto-redispatched.

- A parent plan needs at least two child/slice tasks and obeys the **project-wide** `subagents.maxParallel` ceiling across all active parent plans; a plan-local `--max` may only lower its own share.
- Parallel repository writes require approved specs, sealed current Scope Guard boundaries, separate worktrees, and no possible overlap between allowed-file patterns.
- Unknown or broad write scope is serialized/blocked rather than guessed safe.
- Lane reservations are integrity-sealed, globally de-duplicated across plans, and bound to the dispatch session. A matching active task lease keeps the reservation authoritative while the role is working.
- `prepare` acquires the normal task lease for **every** lane, including task-local work; reservation + lease jointly prove mutation authority. If a later lane fails during synchronous preparation, leases, newly created worktrees, and worktree metadata are rolled back before the plan is committed.
- Persisted plan membership is binding: unscheduled agent mutation is rejected until the lane is prepared or an administrator explicitly cancels the plan.
- Product Owner, Target Audience, amendments, and all human-owned gates keep their normal authority under the active Autonomy Level.

When a lane surfaces consequential ambiguity or judgment, use the exact SpecRail native `request_user_input` payload; never print option lists or multiple-choice questions as text.
