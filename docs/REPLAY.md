# Replayable Tasksets and Harness comparison

Replay turns workflow design choices into controlled local experiments.

A replay freezes the **same approved taskset**—specification hash, immutable QA Mission, acceptance criteria, active evals, risk-selected quality policy, and operational evidence policy—then runs different harness profiles in isolated Git worktrees.

```bash
specrail replay create TASK-0042 --harness fast --compare standard,rigorous
specrail replay start REPLAY-... fast
specrail replay start REPLAY-... rigorous
```

Each variant receives fresh instructions and must not inspect another variant's implementation or result. The taskset cannot be weakened to make one harness look better.

When a variant finishes, the agent records a result using the exact taskset/harness digests and real evidence paths from that variant worktree. Accepted runs must pass the same acceptance criteria and immutable QA Mission **and include at least one real evidence artifact from the isolated worktree**. Test records are useful metrics, but a claimed exit code alone is not accepted as proof.

```bash
specrail replay complete REPLAY-... fast --result-file fast-result.json
specrail replay compare REPLAY-...
```

## Exact token usage

When the host or API exposes exact usage, a replay result can include:

```json
{
  "metrics": {
    "tokenUsage": {
      "source": "host-reported",
      "scope": "variant-total",
      "model": "<exact model id>",
      "inputTokens": 12000,
      "cachedInputTokens": 3000,
      "outputTokens": 2000,
      "reasoningTokens": 700
    }
  }
}
```

SpecRail computes `uncachedInputTokens = inputTokens - cachedInputTokens` and `totalTokens = inputTokens + outputTokens`. Cached input is a subset of input and is therefore not added twice.

The usage record must cover the **entire Harness variant**, including its repair loop and attributable subagent work. If that exact aggregate cannot be obtained, usage stays `unavailable`; SpecRail does not estimate replay tokens. Token count is used as a tie-breaker only when both variants identify the same model. It is still displayed when models differ, but not treated as an equivalent cost signal.

## Comparison order

Comparison deliberately avoids a single opaque score. It reports:

- acceptance and immutable QA Mission result;
- repair attempts;
- exact token usage and cache ratio when available;
- elapsed time;
- context files and expansions;
- tool calls;
- changed files, additions and deletions.

A winner is considered only among variants that passed the same verification. Tie-breaking favors fewer repairs, then lower exact token use when the model identity matches, then elapsed time and context.

Use replay to answer questions such as:

- Does `rigorous` reduce rejected deliveries enough to justify its token/time cost?
- Does a tighter context profile improve speed without lowering acceptance?
- Does an independent review policy actually prevent repairs in this repository?
- How much cached context is each harness reusing?

List representative experiments with:

```bash
specrail replay scenarios
```

See [`EXPERIMENTS.md`](EXPERIMENTS.md) for a starter campaign and fair-comparison rules.

## Historical recommendation

After enough comparable replays:

```bash
specrail harness recommend TASK-0042
```

returns an advisory `fast`, `standard`, or `rigorous` recommendation based on local repository history. It never changes the task automatically. See [`ADAPTIVE-POLICY.md`](ADAPTIVE-POLICY.md).

Replay is experimental in the beta. It requires a clean Git working tree and creates removable local worktrees. Clean them with:

```bash
specrail replay cleanup REPLAY-...
```
