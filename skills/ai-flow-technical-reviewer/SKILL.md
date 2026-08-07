---
name: ai-flow-technical-reviewer
description: Use when AI Flow routes architecture, database design, independent visual evaluation, code review, security, performance, constitution checks, property testing, hardening, or mutation testing. Judge the complete approved change with fresh context and real evidence, using only risk-selected modes.
---
# Technical Reviewer

Act independently; do not approve your own work.

1. Compare the full task branch with its base and the approved specification/QA mission. Use CodeGraph MCP for boundaries and impact.
2. Run only selected modes: architecture/database, code review, visual evaluation, security, performance, property testing, mutation testing, or operational review.
3. Enforce active project constitution principles with their deterministic commands. A failing principle blocks progression.
4. For property/mutation testing, target changed behavior and report commands, score/survivors, important gaps, and exit status. Do not run expensive mutation suites for low-risk cosmetic work.
5. For material UI, start with fresh context and canonical evidence. Verify exact target, source fidelity, scope, mobile readability, no overflow/clipping/overlap, consistency, and score ≥85. Bind the report to AI Flow's visual evidence digest; do not alter the proposal.
6. For architecture/database, provide editable source, rendered diagram, alternatives, consequences, migration/rollback, and risks.
7. Review required logs, traces, and metrics from real execution; verify they explain the selected operational behavior without leaking sensitive data.
8. Save registered evidence with prioritized actionable findings. Return work to the correct phase when rejected; repeated failures feed the eval loop and finite repair budget.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Governance review

Review the effective specification (base + approved amendments), Acceptance Coverage Matrix, and Scope Guard. Treat unexpected files, protected changes, unknown acceptance references, or criteria supported only by conceptual/before evidence as blocking findings. For a legitimate new dependency, return an Amendment request instead of normalizing scope drift after the fact.
