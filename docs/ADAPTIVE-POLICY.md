# Adaptive workflow policy

`specrail harness recommend TASK-0001` uses local replay history to answer:

> Based on comparable, verified work in this repository, which built-in harness profile currently has the strongest quality/cost trade-off for this task?

It is advisory. It never changes `execution_profile` automatically.

## Minimum evidence

By default SpecRail needs at least **three comparable runs for at least two harness profiles**.

It first prefers an exact cohort:

- same risk;
- same task size;
- same surfaces.

If there are not enough exact runs, it can use a broader cohort with the same risk and overlapping surfaces. The response explicitly says which cohort was used.

## Decision order

Quality is always evaluated before cost.

For low/medium-risk work:

1. keep profiles inside the accepted/QA quality band;
2. prefer fewer median repair attempts;
3. if token coverage is sufficient **and the recorded model is the same**, prefer fewer median total tokens;
4. then prefer lower elapsed time;
5. then smaller context breadth.

For high/critical work:

- `fast` is not recommended as the historical default;
- acceptance/QA quality is not relaxed to save tokens;
- repair evidence stays ahead of cost.

There is no opaque aggregate quality score.

## Example

```bash
specrail harness recommend TASK-0042
```

Possible result:

```json
{
  "status": "recommendation",
  "currentProfile": "standard",
  "recommendedProfile": "standard",
  "appliesAutomatically": false,
  "cohort": {
    "mode": "exact",
    "sampledReplays": 6,
    "minSamplesPerHarness": 3
  },
  "profiles": {
    "fast": {
      "samples": 6,
      "acceptanceRate": 0.83,
      "medianRepairAttempts": 2,
      "medianTotalTokens": 10800
    },
    "standard": {
      "samples": 6,
      "acceptanceRate": 1,
      "medianRepairAttempts": 0,
      "medianTotalTokens": 14400
    }
  }
}
```

The recommendation may still be `standard` even though it consumes more tokens because accepted delivery and rework come first.

## Configuration

`.ai/config.json`:

```json
{
  "adaptivePolicy": {
    "enabled": true,
    "minSamplesPerHarness": 3,
    "lowRiskAcceptanceDelta": 0.05,
    "tokenCoverageThreshold": 0.6
  }
}
```

The policy should be considered experimental until a repository has enough real replay history. Do not interpret a recommendation as a universal benchmark across codebases.
