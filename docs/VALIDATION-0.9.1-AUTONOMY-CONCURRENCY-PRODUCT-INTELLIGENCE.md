# Validation — Autonomy, Product Intelligence, and Multi-Agent Concurrency on 0.9.1

**Baseline:** `@saulmarti/specrail@0.9.1` source tree (`specrail-current(4).tgz`)
**Status:** clean-room validated
**Release state:** implemented in source and tracked under `Unreleased`; this document does not change the package version.

## Scope

This validation covers the integrated implementation of:

- Autonomy Levels: `guided`, `autonomous`, `headless`;
- Product Intelligence: project bootstrap, pre-spec Product Owner, Target Audience, final Product Owner outcome review;
- Multi-Agent Concurrency: dependency waves, project-wide parallel ceiling, lane sessions + task leases, worktrees, host capability contract, heartbeat/recovery, interprocess locks;
- cross-feature authority: Product Intelligence and approval gates remain authoritative inside concurrent/autonomous execution;
- compatibility with the 0.9.1 Phase Boundary and Review Bundle/presentation contracts.

## Clean-room procedure

The final patch was generated against the exact 0.9.1 baseline and then applied to another fresh extraction of the same source archive.

```text
git apply --check                              PASS
git apply                                      PASS
source-tree comparison                         312 / 312 byte-identical
npm test                                       346 / 346 PASS
npm run release:check                          PASS
npm pack --dry-run                             PASS
```

No test was skipped.

## High-value regression coverage

### Autonomy

- Guided preserves Product Owner acknowledgement and native human approval/delivery authority.
- Autonomous crosses only mechanically safe gates and does not ask for a normal phase-boundary choice when a stable session can enter deterministically.
- Headless stops rather than fabricating product/external judgment or an unsupported boundary choice.
- Autonomy policy participates in the approved governance digest.

### Product Intelligence

- New projects bootstrap concrete product, owner, and audience context before task-level Product Owner judgment.
- Existing projects do not silently acquire new Product Intelligence gates on update.
- Human rejection/rework overrides a clean Product Owner recommendation.
- Target Audience profile IDs must exist in project data; no synthetic primary persona fallback exists.
- Target Audience requires a fresh declared session after QA/review and another fresh session for each additional primary persona.
- Audience refresh is transactional and corrupted stale batches fail closed until explicit recovery.
- Final Product Owner review is required before final approval when configured, is freshness/integrity sealed, obeys autonomy policy, and appears in the Final Review Bundle.

### Multi-Agent Concurrency

- `subagents.maxParallel` is enforced across the project, not independently per parent.
- Two real Node processes cannot double-dispatch the same lane.
- Two real Node processes operating different parent plans cannot exceed the global parallel ceiling.
- Planned tasks reject unscheduled mutation; prepared lanes require the exact reservation session plus task lease.
- Safe writers use separate worktrees; overlapping/unknown scopes are serialized rather than guessed safe.
- Partial synchronous `prepare` failure rolls back leases, newly created worktrees, and task worktree metadata.
- Long-running lanes renew authority with `concurrency heartbeat`; lease expiry alone never authorizes silent redispatch.
- A corrupted scheduler plan fails closed and has an explicit force-recovery path.
- Parallel dispatch requires a valid host capability attestation; otherwise execution uses `serial-fallback`.

## Trust boundary

The validated contract is local-filesystem coordination with a trusted execution host. SpecRail verifies persisted session IDs, seals, leases, plans, boundaries, and attestations; it cannot introspect private model memory, force a host to spawn real subagents, or provide distributed consensus across machines. Unsupported capability is never reported as verified: the workflow falls back or stops explicitly.
