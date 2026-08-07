# AI Flow 0.3.0 implementation review

## Summary

The 0.3.0 architecture is sound: approval hashes, leases, specification linting, review bundles, and progressive context budgets are implemented in the deterministic CLI rather than as additional agent passes. This improves governance without adding model calls by default.

## Findings fixed in 0.3.1

### Concurrent lease race

The previous lease implementation used read-then-write without a cross-process critical section. Two chats starting at the same instant could theoretically both pass the initial check. 0.3.1 serializes acquisition and writes the lease through an atomic rename.

### Context boundary

Context expansion previously accepted arbitrary strings as file references. 0.3.1 requires repository-relative paths and rejects absolute paths or traversal outside the repository.

### Specification linter loophole

A vague criterion could avoid rejection merely by containing any number. 0.3.1 requires an observable behavior, contract, selector, status, or meaningful measurement.

## Visualize design decision

Visualize is integrated as a preview presentation layer, not as workflow state or evidence. AI Flow emits structured plans for decisions, blockers, UI comparisons, backend contracts, architecture/database reviews, status maps, and final reviews. The host uses the Visualize plugin when available. The workflow remains operational when it is absent.

## Remaining technical debt

- TypeScript files still use `@ts-nocheck`, so the strict `tsconfig` does not yet provide meaningful static guarantees.
- Visualize availability cannot be verified deterministically by the local CLI because it is a host/plugin capability.
- The CodeGraph command contract is covered by tests but remains an external dependency that may evolve.
- Visual quality still needs real Codex Desktop evals; structural tests cannot prove that every generated visualization is useful.
- The installer manages a block in global `~/.codex/AGENTS.md`; backups and idempotence reduce risk, but packaging AI Flow as a native plugin remains a cleaner future distribution path.

## Recommendation

Use 0.3.1 as the next beta. Measure whether Visualize reduces clarification cycles and review time before making it mandatory for more gates.
