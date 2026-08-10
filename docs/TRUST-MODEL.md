# SpecRail Trust Model

**Status:** Active contract for Autonomy, Product Intelligence, and local-filesystem Multi-Agent Concurrency.

SpecRail is a deterministic workflow governor for coding-agent hosts. It is not an OS sandbox, a remote attestation system, or a distributed consensus service. The supported guarantees below make that boundary explicit so a host-dependent capability cannot be mistaken for a core guarantee.

## SpecRail guarantees

Within the canonical project filesystem and supported CLI/skills contract, SpecRail verifies and persists:

- specification/governance/evidence integrity seals;
- Product Owner and Target Audience artifact freshness and integrity;
- mandatory phase-boundary entry and stable session identity;
- mandatory **fresh-session separation** for Target Audience from its prior QA/review session, including a fresh session for each additional required primary persona;
- task leases plus concurrency reservation/session authority;
- project-wide `maxParallel`, dependency/scope conflict scheduling, worktree isolation, rollback, and fail-closed recovery for local processes;
- host capability records that are immutable and integrity-sealed per host session;
- serial fallback when parallel subagent capability has not been attested.

## Trusted execution host

Codex, Pi, Claude Code, OpenCode, or another adapter is the trusted execution environment around SpecRail. The host is responsible for truthfully supplying stable session IDs and capability attestations and for launching the subagents it claims to support. SpecRail can reject reuse of the same declared session across the Target Audience boundary and can exclude implementation internals from its sealed audience packet; it cannot introspect private model memory or prove that a malicious host erased information it keeps outside the project.

Likewise, SpecRail CLI authorization is workflow authority, not an adversarial security boundary against a user/process with unrestricted filesystem access. An administrator who can rewrite project files or invoke force-recovery commands is trusted by definition; integrity checks make such divergence visible/fail-closed, not cryptographically impossible.


### Pi adapter trust mapping

For Pi, SpecRail treats `ctx.sessionManager.getSessionId()` as the host-supplied stable session identity and `ctx.ui.select` / `ctx.ui.input` as the native human-decision surface. State-mutating SpecRail tools and blocking human gates are sequential even though Pi tool batches are parallel by default, and killed/non-zero subprocesses are surfaced by throwing so Pi records a real tool failure. Fresh phase handoffs use Pi's replacement-session `withSession` context rather than stale pre-switch objects. Pi model and thinking selection are explicitly outside SpecRail state. The adapter does not attest parallel subagents by default; until a truthful capability record exists for the current Pi session, the deterministic scheduler remains on `serial-fallback`. Codex-only Visualize capability is likewise not inferred on Pi: canonical evidence and Review Cockpit remain the safe fallback.

## Concurrency scope

The supported coordination mode is:

```text
subagents.coordination = local-filesystem
```

It supports independent local processes/chats using atomic filesystem locks, leases, sealed plans, and Git worktrees. Distributed/multi-machine coordination is rejected rather than simulated. A future distributed coordinator would require an explicit separate contract.

## Meaning of `parallel`

`dispatch.mode: parallel` means both conditions are true:

1. SpecRail proved multiple lanes are structurally safe to dispatch concurrently.
2. The current trusted host session has an integrity-valid attestation that it supports independent parallel subagent spawning.

Without condition 2, SpecRail returns `serial-fallback` and reserves one lane only. This prevents scheduler parallelism from being presented as observed host parallelism.


## Explicit non-guarantees

SpecRail deliberately does **not** claim to:

- inspect or erase private model/chat memory held outside the project;
- prove that two truthful-looking session IDs came from physically independent conversations when the host lies;
- spawn subagents on a host that has not attested that capability;
- coordinate multiple machines with distributed consensus;
- defend the workflow against a trusted administrator intentionally rewriting files or using force-recovery commands.

These are trust-boundary exclusions, not silent fallback behavior. The core either verifies its supported local contract, falls back to serial execution, or fails closed.
