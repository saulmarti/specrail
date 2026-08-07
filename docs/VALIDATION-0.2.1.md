# AI Flow 0.2.1 — Second acceptance audit

## Scope

This audit focuses on natural use across different Codex chats, deterministic task lookup, specialist continuity, native questions, concise global role contracts, and final delivery of worktree changes.

## Natural task references

Users may continue work using any of these forms:

- Stable ID: `Continúa con TASK-0007`.
- Exact title: `Implementa la tarea Rediseñar la homepage principal`.
- Unique phrase: `Retoma la tarea de la homepage`.
- Generic continuation: `Continúa con la tarea pendiente` when only one task remains open.

The repository Markdown is the source of truth. AI Flow resolves the reference, reloads the persisted state, and returns the exact next phase. If several tasks match, it emits a native `request_user_input` selector. It never silently chooses or creates a duplicate.

## Cross-chat workflow

A specification refined in one chat can be implemented in another. When its persisted phase is Builder, a natural implementation request resumes Builder directly. It does not repeat refinement or specification approval.

At every user gate Codex shows `TASK-ID — Title`, current phase, and reviewable artifacts. The ID is optional but remains the most exact reference.

## Role contracts

Seven global skills are installed. Specialist contracts contain 25–42 lines; the orchestrator contains 37 lines. The deterministic router returns the single specialist contract to load for the current phase, preventing all role prompts from occupying context simultaneously.

## Delivery invariant

Code and migration work records its task worktree. Final approval moves the task to an explicit delivery decision:

- merge locally into the recorded base branch;
- confirm a completed external PR/merge;
- preserve the worktree and keep the task open.

A task with an undelivered worktree cannot reach Done. Design-only and architecture-only tasks without a worktree can close after final approval.

## Automated verification

- 38 tests passed, 0 failed.
- Resolver tested with IDs, exact titles, accents, unique phrases, generic continuation, repeated titles, closed/open tasks, and ambiguity.
- Installed CLI tested from a clean HOME.
- Full installed backend flow tested through worktree creation, checkpoint, independent review, QA evidence, final approval, local merge, and worktree cleanup.
- Nested working directories resolve to the Git repository root.
- Native specification, blocker, final approval, delivery, and task-selection interactions are structured as `request_user_input` payloads.
- Skills are tested for trigger quality, brevity, CodeGraph-first context, subagent limits, and explicit specialist loading.

## Host acceptance still required

The deterministic engine and installed files are verified. The following depend on the user's actual Codex Desktop build and cannot be proven in the build container:

- semantic automatic activation from an ordinary natural-language request;
- actual rendering of `request_user_input` in Default mode;
- live CodeGraph MCP calls;
- browser, Computer Use, ImageGen, and application launch behavior;
- actual Codex subagent fan-out.
