# AI Flow 0.3.0 validation

AI Flow 0.3.0 adds five deterministic controls without adding agent calls:

1. SHA-256 sealing of the approved specification, with automatic reapproval after governed changes.
2. Expiring per-task execution leases for cross-chat safety and native takeover decisions.
3. A type-aware specification linter that rejects incomplete and non-observable requirements.
4. Compact specification and final Review Bundles with evidence and independent verdicts.
5. Progressive CodeGraph-guided context budgets with justified expansion and handoff limits.

## Compatibility

- Existing `.ai/config.json` files are migrated to config version 4.
- Custom context profiles are preserved while required defaults are restored.
- Pre-0.3 approved tasks have no hash and therefore require one intentional reapproval before execution.
- Runtime leases and context manifests remain under `.ai/runtime/`.
- No new MCP server, agent role, network service, or database is introduced.

## Acceptance coverage

The test suite covers specification linting and hash invalidation, non-governed updates, final and specification Review Bundles, lease conflict/takeover/expiry, progressive context expansion, explicit write-capable context requests, upgrade migration, natural intake, CodeGraph preflight, native approvals, frontend/backend evidence, Taste Skill + Image Gen proposal quality, worktrees, QA, Final Customer, and deterministic delivery.
