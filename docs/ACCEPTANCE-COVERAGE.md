# Acceptance Coverage Matrix

SpecRail final approval is based on the requirements the user approved, not on a generic “tests pass” claim.

## Stable acceptance IDs

Before specification approval, every observable acceptance criterion receives a stable ID:

```markdown
## Acceptance Criteria

- AC-001: GET /health returns HTTP 200 when the service is ready.
- AC-002: The response body contains `status=ok`.
```

Approved amendments add their own immutable IDs, for example `AC-A001-01`.

## Evidence mapping

Canonical evidence declares exactly which criteria it proves:

```bash
specrail evidence add TASK-0042 \
  --kind qa-report \
  --path .tmp/qa.md \
  --source qa-validation \
  --proves AC-001,AC-002
```

Inspect coverage with:

```bash
specrail acceptance coverage TASK-0042
```

The matrix is also embedded in Review Cockpit and the Review Bundle.

## What counts as proof

SpecRail verifies that the registered evidence artifact still exists and matches its recorded SHA-256. For implementation tasks, conceptual artifacts such as `frontend-before`, `frontend-proposal`, design briefs, and proposal critiques cannot prove the final implemented outcome.

A criterion is complete only when at least one canonical, non-stale evidence artifact maps to it. Unknown `AC-*` references invalidate coverage.

## Final gate

Final approval requires 100% coverage of the **effective specification**: the approved base criteria plus criteria introduced by approved amendments.

This is intentionally stricter than a green test suite. Tests may cover implementation behavior without demonstrating every product requirement the user approved.
