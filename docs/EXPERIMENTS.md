# Experiment playbook

SpecRail replay experiments are for answering one question: **which delivery harness gives the best verified result for this kind of task, and what does that result cost in retries, time, context and tokens?**

They are not intended to execute every task three times. Use them periodically on representative work, then let the historical evidence guide future defaults.

## Token accounting

When the host or API exposes exact usage, record:

- `inputTokens`
- `cachedInputTokens`
- `outputTokens`
- optional `reasoningTokens`
- `model`
- `source`: `host-reported`, `api-response`, or `usage-export`

`cachedInputTokens` is a subset of input tokens. SpecRail therefore computes:

```text
uncached input = input - cached input
total tokens   = input + output
```

It never adds cached input a second time. It never estimates missing replay token usage. If the host does not expose per-run usage, the comparison reports `unavailable`.

Token counts can be compared as a cost tie-breaker only when both runs identify the same model. Different models can have different prices, capabilities and caching behavior.

Example replay result fragment:

```json
{
  "metrics": {
    "repairAttempts": 1,
    "contextFiles": 11,
    "contextExpansions": 1,
    "toolCalls": 27,
    "tokenUsage": {
      "source": "host-reported",
      "scope": "variant-total",
      "model": "<exact host model id>",
      "inputTokens": 18240,
      "cachedInputTokens": 7400,
      "outputTokens": 3180,
      "reasoningTokens": 1200
    }
  }
}
```

## Recommended starter experiments

List the built-in catalog:

```bash
specrail replay scenarios
```

### 1. Micro UI adjustment

**Prompt**

> Reduce the mobile heading hierarchy in one existing section without changing desktop layout, content, or surrounding cards.

Compare `fast` vs `standard`.

Measure:

- token overhead floor;
- elapsed time;
- visual rejection rate;
- repair attempts.

This establishes whether the normal workflow adds value to a tiny visual change.

### 2. Responsive overflow bug

**Prompt**

> Fix a card that overflows at 390 px while preserving its desktop layout and content.

Compare `fast`, `standard`, and optionally `rigorous`.

Measure visual QA returns, repairs, tokens and time. This is a good test of whether independent visual review pays for itself.

### 3. Backend validation contract

**Prompt**

> Reject an invalid API payload with the documented status and error body while preserving valid requests.

Compare `fast` vs `standard`; add `rigorous` after several runs.

This task is deterministic enough to make differences in reasoning and verification easy to measure.

### 4. Domain refactor with invariants

**Prompt**

> Refactor one domain calculation without changing observable behavior and add invariant/property coverage for edge cases.

Compare `standard` vs `rigorous`.

Measure property/mutation findings, repairs, changed lines and tokens.

### 5. Small vertical full-stack slice

**Prompt**

> Add one user-visible action that persists a small value and is observable after reload, with one happy path and one failure path.

Compare `standard` vs `rigorous`.

Measure context breadth, context expansions, retries, tokens and elapsed time.

### 6. Reversible data migration

**Prompt**

> Add one backward-compatible schema change with migration, rollback, and verification that existing data remains valid.

Compare `standard` vs `rigorous` only.

The important signal is not speed. Track acceptance, rollback evidence, repairs and missed-risk findings.

### 7. Performance regression

**Prompt**

> Reduce latency in one known slow path while preserving behavior and provide before/after operational evidence.

Compare `standard` vs `rigorous`.

Measure runtime improvement, quality of evidence, tokens, time and change size.

### 8. Cross-cutting architecture change

**Prompt**

> Change one shared contract used by multiple modules while preserving all callers and documenting affected boundaries.

Compare `standard` vs `rigorous`.

Measure context breadth, technical-review findings, repairs, tokens and missed dependencies.

## A useful first campaign

Do not infer policy from one task. A practical starter campaign is:

| Family | Runs | Harnesses |
| --- | ---: | --- |
| Micro UI | 3 | fast / standard |
| Responsive bug | 3 | fast / standard |
| Backend validation | 3 | fast / standard |
| Domain logic | 3 | standard / rigorous |
| Full-stack slice | 3 | standard / rigorous |
| Data migration | 3 | standard / rigorous |

That gives enough repeated observations to start seeing which profile is wasteful or underpowered for each cohort. SpecRail's adaptive recommendation still remains advisory.

## Fair-comparison rules

1. Freeze one approved specification and QA Mission.
2. Start every variant from the same Git commit.
3. Use isolated worktrees and fresh context.
4. Do not let one variant inspect another.
5. Require the same acceptance and QA verification.
6. Record real evidence artifacts.
7. Record exact model/token usage only when the host exposes it.
8. Do not change the taskset to rescue one harness.
9. Run enough repetitions to avoid choosing a policy from one lucky result.
10. Treat UI tasks separately from backend/data tasks when interpreting results.
