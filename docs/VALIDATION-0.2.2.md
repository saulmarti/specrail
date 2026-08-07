# AI Flow 0.2.2 — Deterministic CodeGraph preflight

## Scope

This release makes CodeGraph readiness a deterministic workflow gate before Product Owner context generation, refinement, task resumption, and execution.

## Required behavior

- Missing `.codegraph/`: run `codegraph init PROJECT --index`.
- Existing `.codegraph/`: run `codegraph sync PROJECT`.
- Failed sync or unhealthy synced index: run `codegraph index PROJECT --force --quiet`.
- Validate every successful maintenance action with `codegraph status PROJECT`.
- Keep the existing MCP connection as `codegraph serve --mcp`; no wrapper or duplicate MCP is introduced.
- Block the Markdown task in `product-specifier` when the command, initialization, indexing, or health validation fails.
- Resume the same blocked task automatically when a later natural request passes preflight.
- Do not ask the user to run CodeGraph maintenance manually.
- Do not replace a failed CodeGraph gate with broad grep/read exploration.

## Persistent state

Runtime state is stored in `.ai/runtime/codegraph.json`. `.codegraph/` and `.ai/runtime/` are added to the repository-local Git exclude file, while task Markdown and project knowledge under `.ai/` remain normal project artifacts.

## Automated coverage

The suite covers:

1. first-use initialization and indexing;
2. incremental synchronization of an existing index;
3. full-index fallback after sync failure;
4. blocking when the CodeGraph executable is unavailable;
5. natural task intake after successful initialization;
6. Product Owner context blocked without a successful preflight;
7. task resumption after the environment becomes ready;
8. CodeGraph local metadata not blocking worktree delivery;
9. global skill and Codex instruction contracts describing automatic maintenance;
10. existing workflow, evidence, approval, task resolution, installation, and delivery regressions.

## Result

- Source suite: 44/44 passing.
- TypeScript build: passing.
- CLI syntax check: passing.
- Clean install from packaged ZIP: passing.
- Exact packaged behavior: missing index initializes; a later task resolution synchronizes the existing index.
