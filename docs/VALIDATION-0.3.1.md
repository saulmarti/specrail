# AI Flow 0.3.1 validation

AI Flow 0.3.1 adds adaptive Codex Visualize presentation plans and hardens three deterministic controls found during the 0.3.0 implementation review.

## Visualize integration

- Project config enables the preview Visualize plugin in adaptive mode.
- Specification and final review presentations include one structured visualization plan.
- Material questions receive a decision-support visualization plan.
- Blockers receive a cause/impact/recovery visualization plan.
- `next` includes a workflow-status visualization for cross-chat explanations.
- Visualize remains read-only and supplementary; Markdown and real evidence are authoritative.
- When the plugin is unavailable, AI Flow falls back to Markdown and inline attachments without blocking.

## Hardening fixes

- Task lease writes are serialized with an atomic mutex and atomic rename.
- Context expansion rejects absolute paths and parent traversal outside the repository.
- Vague criteria are no longer accepted merely because they contain an arbitrary number.

## Verification

- Source suite: 80/80 passing.
- Package build and syntax check: passing.
- Clean installation: passing.
- Installed version: 0.3.1.
- Config schema migration: 5.
- Visualization plan present in installed CLI output.
- Installer instructions mention Visualize and its non-blocking fallback.
