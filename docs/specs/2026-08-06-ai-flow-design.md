# AI Flow for Codex — Design

## Goal

Provide a global, reusable Codex development team without MCP UI or per-project agent copies. Project work is stored as Markdown and evidence files in the repository. A small deterministic CLI enforces workflow rules; Codex agents provide judgment and use CodeGraph MCP plus Codex-native tools.

## Global installation

- `ai-flow` deterministic CLI, invoked internally by Codex.
- Automatic activation through the primary `ai-flow` skill plus a managed global Codex instruction.
- Global Codex skills:
  - ai-flow
  - product-specifier
  - ux-ui-designer
  - builder
  - technical-reviewer
  - qa-engineer
  - final-customer

## Project artifacts

- `.ai/config.json`
- `.ai/project/{product,users,architecture,design-system,runbook,learnings}.md`
- `.ai/tasks/<state>/TASK-XXXX-*.md`
- `.ai/evidence/TASK-XXXX/evidence.json`
- `.ai/decisions/`

No agent definitions are copied into repositories.

## Deterministic responsibilities

The CLI owns IDs, state transitions, questions, approvals, dependencies, evidence manifests, hashes, required evidence, worktrees, and resumption. Agents cannot skip gates by editing status fields manually; every transition is revalidated.

## Natural interaction

The user speaks normally and never needs to create tasks, mention a skill, remember a task ID, or run commands. Codex automatically initializes the repository, creates/resumes the Markdown task, and uses native option controls for material questions and approvals.

## Project Product Owner

The first task is deterministically blocked until Product Specifier generates concrete product, users, Product Owner, architecture, and runbook context. Every completed task must record a durable project learning before final approval.

## Agent responsibilities

Agents reason, inspect CodeGraph MCP, ask necessary questions, write specifications, design, implement, review, validate, and simulate customers. They use Codex-native browser, Computer Use, terminal, ImageGen, and other available tools to produce real evidence.

## CodeGraph

CodeGraph is used directly through the user's existing MCP server (`codegraph serve --mcp`). The package does not wrap or reimplement CodeGraph. Skills instruct agents to prefer CodeGraph MCP for symbol, dependency, impact, and test discovery.

## Approval policy

Every task requires explicit user approval through Codex native `request_user_input` of the refined specification before execution, including trivial tasks. Important decisions and any newly discovered ambiguity block execution and return to the user. Every task also requires final user approval.

## Adaptive workflow

One workflow with optional phases:

1. Product specification and questions.
2. UX/UI proposal when relevant.
3. Architecture/database proposal when relevant.
4. User specification approval.
5. Builder execution when implementation is required.
6. Technical review when relevant.
7. QA.
8. Final customer when user-facing value is relevant.
9. User final approval.

## Evidence policy

- Frontend: real before screenshot, visual proposal, real after screenshot; responsive variants when required.
- Backend: real request/response or observable command result plus tests.
- Architecture: editable diagram source plus rendered image.
- Database: ERD source/rendered image, migration plan, and post-implementation schema/migration evidence when implemented.
- CLI/jobs: real command, output, errors, and exit status.

Images and SVGs are embedded with relative Markdown paths. The CLI validates existence, non-empty files, allowed location, hashes, distinct before/proposal/after artifacts, and Markdown references. For frontend evidence it also enforces an exact UI target, focused capture scope, browser-rendered proposals, matching route/viewport/target, and structured browser measurements that reject overflow, clipped text, overlap, unreadable content, or an invisible target.

## Subagents

The orchestrator may use up to three read-only subagents for independent analysis, review, test discovery, architecture, or UX. Write-capable subagents require approved non-overlapping subtasks. The workflow does not depend on subagents being available.
