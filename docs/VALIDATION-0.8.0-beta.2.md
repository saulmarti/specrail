# Validation — SpecRail 0.8.0-beta.2

Date: 2026-08-07

This release is an adversarial hardening pass over the `0.8.0-beta.1` delivery-governance contract.

## Corrected failure modes

- forged Amendment status changes without a valid decision seal;
- material architecture/data/security/risk changes smuggled through bounded Amendments;
- blast-radius artifact content changed while leaving the old digest field in place;
- governed `.ai/project` or policy context changed after specification approval;
- protected files renamed into an allowed destination;
- provenance artifacts escaping a Replay worktree through symlinks;
- malformed/unbalanced active-agent trace intervals;
- invalid Replay variants being restarted or completed again;
- legacy approvals becoming unusable after hardening without a safe migration path.
- macOS temporary-path aliases (`/var` vs `/private/var`) making repository-root regression checks flaky;
- Replay `variant-started` timestamps racing immediate trace events by a few milliseconds.

## Required validation

The release is complete only when all repository tests, TypeScript/CLI checks, package dry-run, clean tarball install, both CLI aliases, plugin validation, and an extracted-ZIP regression run pass. The final measured results are recorded after packaging.

## Repository verification

- `npm run check`: PASS.
- Full regression suite: 156 tests, 156 passed, 0 failed.
- TypeScript strict build and `node --check dist/src/cli.js`: PASS.


## Package identity verification

- canonical npm package: `@saulmarti/specrail`;
- primary executable: `specrail`;
- compatibility executable: `ai-flow`;
- the unscoped npm package `specrail` is not published or referenced as this project's install target;
- `npx --package=<packed scoped tarball> specrail --version`: `0.8.0-beta.2`.

## Distribution verification

A generated npm tarball was installed into an empty prefix and HOME:

- `specrail --version`: `0.8.0-beta.2`.
- `ai-flow --version`: `0.8.0-beta.2`.
- packaged Agent Plugin validation before managed install: PASS.
- `specrail install` into the empty HOME: PASS; both launchers, Codex activation/config, and managed plugin were created.
- managed Agent Plugin validation: PASS.
- `specrail doctor`: executed successfully and correctly reported the intentionally absent external CodeGraph command/MCP configuration in the clean environment.
- `specrail doctor --fix`: returned a native approval plan with only the repository-local CodeGraph preflight marked automatic; external installation/configuration remained manual.

## ZIP verification

A source ZIP was extracted into a clean directory and the complete regression suite passed there: 156 tests, 156 passed, 0 failed.
