# GitHub Issue → PR → CI → merge — deferred design note

**Status: Deferred. This integration has no current priority or target release.**

SpecRail currently focuses on reliable local delivery, Review Cockpit, readiness explanations, onboarding repair, and replayable tasksets. This document preserves the product direction without implying active implementation.

A possible future route is:

```text
GitHub Issue
→ approved SpecRail task
→ branch/worktree
→ Pull Request
→ CI evidence for a specific commit
→ final Review Cockpit
→ explicit human approval
→ merge
```

Core invariant if this is implemented later:

```text
CI passed
≠
The product outcome was approved
```

CI can prove that automated checks passed for a commit. SpecRail must still govern specification approval, evidence, QA mission, final product approval, and deterministic delivery.

The feature should only return to active planning when real users demonstrate that manual handoffs between SpecRail and GitHub are a larger problem than the current roadmap items.
