# SpecRail 0.6.0-beta.1 — validation

Date: 2026-08-07

## Release identity

- package: `specrail`
- version: `0.6.0-beta.1`
- npm tag: `beta`
- author: Saúl Martí <me@saulmarti.dev>
- license: MIT
- project config schema: 8

## Source validation

```text
TypeScript strict build: PASS
Test suite:              129/129 PASS
CLI syntax check:        PASS
npm release:check:       PASS
Agent Plugin manifest:   PASS
```

No source file under `src/` uses `@ts-nocheck`.

## Re-reviewed regressions

- Review Cockpit and CLI share one readiness contract: PASS
- Stage-required QA Mission becomes a blocker if missing/corrupt: PASS
- `next.readiness` matches direct readiness gates: PASS
- `specrail` is primary launcher health; `ai-flow` optional compatibility: PASS
- managed repair does not self-delete the installed package: PASS
- Doctor plan separates safe reversible and external/manual fixes: PASS
- Replay rejects dirty source trees: PASS
- Replay rejects mismatched taskset/harness/QA digests: PASS
- Replay requires real worktree evidence for accepted results: PASS
- Replay worktrees remain isolated and removable: PASS

## Exact npm tarball

Artifact: `specrail-0.6.0-beta.1.tgz`

```text
package size:    ~161.7 kB
unpacked size:   ~751.4 kB
files:           145
```

The tarball contains the new public docs:

- `docs/READINESS.md`
- `docs/DOCTOR.md`
- `docs/REPLAY.md`

and excludes source tests/fixtures from the npm publication set.

## Exact tarball clean-install test

A fresh temporary prefix and HOME were used. The exact tarball was globally installed, then its own `specrail install` command configured a clean HOME.

Observed:

```json
{
  "version": "0.6.0-beta.1",
  "readiness": 100,
  "doctorSafe": ["managed-installation"],
  "replayWinner": "rigorous",
  "replayRows": 2
}
```

### Readiness

An approved backend task with a valid CodeGraph preflight produced execution readiness `100` and the agent-owned next action. The score represented passed/applicable deterministic gates, not confidence.

### Doctor repair

The clean test deliberately deleted `~/.local/bin/specrail`. `doctor --fix` returned a plan containing `managed-installation` plus a native decision payload. `doctor --fix --apply safe` restored the executable successfully. Missing host-specific CodeGraph MCP configuration remained a manual/external recommendation.

### Replay

The exact installed CLI:

1. created one immutable taskset;
2. created `fast` and `rigorous` isolated worktrees;
3. required exact taskset, harness and QA hashes;
4. hashed real evidence inside each worktree;
5. accepted both under the same acceptance/QA checks;
6. compared both without an aggregate score;
7. recommended `rigorous` because it had fewer repair attempts;
8. removed the replay worktrees through cleanup.

## Publication conclusion

The package is ready as a beta candidate. Remaining host-dependent behavior (Codex HTML rendering, Visualize/plugin discovery, and external CodeGraph MCP configuration) cannot be physically validated in this container and retains documented fallback/diagnostic behavior.
