# Readiness and Why blocked

SpecRail exposes one deterministic readiness contract for the CLI, `next`, and Review Cockpit. It answers two different questions without an opaque AI confidence score:

1. **Can the workflow safely continue now?**
2. **If not, which exact gate blocks it and who owns the next action?**

```bash
specrail readiness TASK-0042
specrail why-blocked TASK-0042
```

The JSON result contains the milestone, every applicable gate, its status (`pass`, `pending`, `fail`, `stale`, `warning`, `not-applicable`), blocker owner (`user`, `agent`, `system`, `external`), the shortest safe next action, and a transparent pass/applicable ratio.

The score is not confidence and never overrides gate status. A stale approval hash, legacy approval-integrity seal, changed governed `.ai` project/policy context, corrupt trace, exhausted repair budget, unfinished dependency, invalid evidence, missing required QA mission, or incompatible CodeGraph contract is explained explicitly.

Review Cockpit consumes this same contract rather than maintaining a second readiness implementation.


### Hardened approval migration

Approvals created before the `0.8.0-beta.2` integrity seal expose an `approval-integrity` stale gate. `next` routes the task to an explicit user reapproval interaction rather than letting an agent continue. If the legacy base specification, QA Mission, Amendment set, and original Scope Guard seal are all intact, reapproval upgrades the hashes in place and preserves the task's current phase/status and original scope baseline. Otherwise the task must return to Product Specifier for a full review.

The `project-governance` gate independently becomes stale when governed project context or workflow policy changes after approval.
