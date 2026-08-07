# AI Flow 0.2.6 validation

Version 0.2.6 removes an invalid environmental dependency from CodeGraph and worktree setup.

## Fixed behavior

- CodeGraph readiness depends only on `--version`, deterministic `init`/`sync`/recovery `index`, and `status`.
- AI Flow never writes `.git/info/exclude` during CodeGraph preflight.
- Worktree creation no longer edits repository-local Git excludes.
- Existing tasks blocked by an older `CodeGraph ... EPERM ... .git/info/exclude` error are recognized and resumed automatically after a healthy preflight.
- `.codegraph/`, `.ai/runtime/`, and `.ai-flow-worktrees/` remain ignored by AI Flow's own dirty-tree validation without mutating user Git configuration.

## Regression coverage

The tests verify that CodeGraph reaches `ready` when `.git` is a protected indirection file, that user-owned `info/exclude` content is unchanged, and that an old EPERM-blocked task resumes automatically.
