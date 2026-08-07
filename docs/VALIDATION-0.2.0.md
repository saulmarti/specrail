# AI Flow 0.2.0 — Validation

## Scope completed

- Automatic natural-language activation through the primary global skill and managed `~/.codex/AGENTS.md` instructions.
- No user-facing task creation commands, task IDs, or explicit skill invocation required during normal use.
- Seven concise global role skills with explicit trigger descriptions and Codex UI metadata.
- Native `request_user_input` payloads for product questions, blockers, specification approval, and final approval.
- Deterministic Markdown state machine with mandatory specification and final approval.
- Project Product Owner/context bootstrap before the first specification can be approved.
- Durable project learning required before Done.
- Direct CodeGraph MCP instructions without adapters.
- Adaptive frontend, backend, architecture, database, design-only, and implementation routes.
- Real evidence manifests, SHA-256 hashes, portable Markdown embeds, source constraints, visual file validation, capture route/viewport, and command/exit-code metadata.
- Independent Technical Review, QA, and Final Customer reports enforced at their own gates.
- Questions, blockers, dependencies, subtasks, deterministic returns, worktrees, and limited subagent policy.

## Automated verification

`npm run check` executes the TypeScript build, all unit/integration/installed-package tests, and CLI syntax validation.

Covered scenarios include:

- natural request creates one reusable task;
- initial Product Owner context gate;
- native option payloads and no textual option contract;
- questions and execution blockers;
- mandatory specification approval;
- complete frontend before/proposal/after + review + QA + customer route;
- backend request/response + test + review + QA route;
- architecture and database evidence profiles;
- fake/truncated visual rejection and evidence metadata checks;
- dependencies and subtasks;
- worktree create/checkpoint/remove;
- clean installation into an empty HOME.

## Acceptance boundary

The package can prove its deterministic workflow and installed files in this environment. It cannot prove Codex Desktop's semantic auto-selection, native questionnaire rendering, CodeGraph MCP calls, Browser/Computer Use, or ImageGen execution because this build environment does not include the Codex or CodeGraph executables. Those require one acceptance run on the user's Mac.
