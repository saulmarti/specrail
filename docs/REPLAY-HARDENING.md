# Replay measurement hardening

SpecRail `0.8.0-beta.1` established completed/comparable/provenance-backed Experiment Intelligence. `0.8.0-beta.2` adds adversarial provenance and trace-state validation around that measurement model.

## Terminal samples only

`planned` and `running` variants never enter historical statistics. Replay comparison remains `provisional` and has no winner until every variant is terminal (`completed` or `failed`). A variant can start only from `planned`; an invalid completion becomes terminal `failed` and cannot be restarted or completed a second time.

## Semantic cohorts

Historical samples require a compatible cohort signature rather than merely sharing a surface. The signature considers task type, work class, risk, size, surfaces, and workflow-route profile. This prevents a micro CSS change from being treated as equivalent evidence for a broad frontend redesign.

## Metric provenance

Repair attempts, context files, context expansions, and tool calls are derived from the Replay trace. They are not accepted from agent self-report.

Token usage is accepted only when a real host/API/export JSON artifact exists inside the isolated variant worktree and its values match exactly. Both lexical containment and filesystem `realpath` containment must remain inside that worktree, so a symlink cannot redirect provenance to an external file. SpecRail records the artifact SHA-256. Missing usage stays unavailable.

Replay evidence paths use the same real-path containment rule.

## Trace integrity and time

Replay event timestamps must be valid, monotonic, no earlier than variant start, and not implausibly in the future. Events are accepted only while the variant is running.

Explicit `agent-active-start` / `agent-active-stop` intervals must be balanced and non-overlapping. A stop without a start, nested/overlapping start, or unfinished interval invalidates the variant instead of producing a misleading active-time metric.

Replay reports two separate concepts:

- **wall-clock time** — elapsed time from variant start to completion;
- **active-agent time** — duration of validated explicit active intervals.

They are never treated as equivalent. Human waits, idle runtime, or pauses can inflate wall time without increasing model work.
