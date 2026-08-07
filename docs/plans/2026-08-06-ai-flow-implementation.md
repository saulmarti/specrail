# AI Flow Implementation Plan

## 1. Package and domain

- Create a dependency-light TypeScript package targeting Node 22+.
- Implement deterministic frontmatter parsing/serialization.
- Implement project discovery and initialization.
- Implement task creation, lookup, listing, and Markdown section helpers.
- Add tests before each implementation.

## 2. Workflow engine

- Encode one adaptive state machine.
- Validate legal transitions and broad task folders.
- Require specification approval for every route.
- Require final approval before Done.
- Add deterministic blocking/resumption.

## 3. Questions, decisions, dependencies, subtasks

- Add/answer structured questions in Markdown.
- Block while questions remain open.
- Add dependencies and prevent execution until Done.
- Create child tasks and support non-overlapping scopes for parallel work.

## 4. Evidence

- Register existing real artifacts only.
- Compute SHA-256 and persist metadata.
- Embed visual artifacts in Markdown with relative links.
- Validate evidence profiles by task surfaces and route.
- Reject missing, empty, external, temporary, duplicate, or broken artifacts.

## 5. Git worktrees

- Create isolated branch/worktree per task.
- Report deterministic paths.
- Checkpoint, cleanup, and protect dirty base branches.

## 6. Global Codex skills

- Primary AI Flow skill auto-activates from natural repository requests and calls the CLI for every state change.
- Six specialist skills define narrow contracts and evidence obligations.
- All skills use CodeGraph MCP directly.
- Include subagent rules and token-efficient handoffs.

## 7. Installer and diagnostics

- Install package to `~/.ai-flow`.
- Install wrapper to `~/.local/bin/ai-flow` using the detected absolute Node executable.
- Install real skill copies to both `~/.agents/skills` and `~/.codex/skills`.
- Install a managed automatic-activation block in `~/.codex/AGENTS.md`.
- Enable `default_mode_request_user_input` while preserving and backing up existing config.
- Provide `doctor` checks for Node, Git, CodeGraph command, `.codegraph`, and Codex config hints.

## 8. Acceptance

- Run unit/integration tests.
- Install into a temporary HOME.
- Initialize a temporary repository.
- Exercise frontend, backend, architecture, database, blocking, approvals, evidence, dependencies, and worktree flows.
- Package and verify the exact ZIP.
