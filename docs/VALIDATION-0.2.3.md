# AI Flow 0.2.3 validation

## Goal

Prevent blind approvals. At specification and final-result gates, Codex must show the reviewable Markdown and all relevant evidence directly in chat before opening native `request_user_input` controls.

## Implemented

- `ai-flow next` and `ai-flow interaction` now include a mandatory `presentation` object at specification and final approval gates.
- `presentation.markdown` renders the task reference, metadata, need, product value, users, scope, exclusions, resolved questions, acceptance criteria, Gherkin, UX/UI, architecture/data, implementation plan, decisions, QA, and Final Customer sections when applicable.
- `presentation.attachments` includes the actual task Markdown plus screenshots, proposals, diagrams, reports, responses, and other evidence with absolute path, media type, and inline-display intent.
- The global AI Flow skill and the managed `~/.codex/AGENTS.md` block require Codex to render the Markdown and attach the evidence before calling `request_user_input`.
- Local paths alone are not considered a review. If a required attachment cannot be presented, the approval gate remains open.
- Approval questions explicitly refer to the specification or evidence shown above.

## Automated verification

- 49/49 source tests pass.
- The exact ZIP is rebuilt and retested.
- A clean installation creates the global CLI and skills.
- An installed frontend flow reaches specification approval and returns:
  - `presentation.requiredBeforeInput = true`
  - a complete rendered Markdown preview
  - the source `TASK-0001.md` as an inline attachment
  - real before/proposal image attachments
  - a native approval interaction only after the presentation payload

## Host acceptance remaining

Only Codex Desktop can confirm the final rendering behavior of local Markdown and image attachments in its desktop/mobile conversation UI. The package now provides the complete paths, media types, content, and mandatory ordering contract needed for that host behavior.
