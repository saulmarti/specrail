# AGENTS.md — SpecRail repository rules

These instructions apply to every coding agent working anywhere in this repository.

## Mission

Build SpecRail as a reliable, local-first, human-approved delivery layer for coding agents. Optimize **time to accepted, trustworthy delivery**, not raw code-generation speed or feature count.

## Instruction priority

1. User request and explicit approvals.
2. This `AGENTS.md`.
3. Public product contract in `README.md` and `ROADMAP.md`.
4. Technical documentation and tests.
5. Existing implementation patterns.

When instructions conflict, stop and surface the conflict rather than silently choosing the easiest path.

## Before writing code

1. Read `README.md`, `ROADMAP.md`, `CHANGELOG.md`, and the relevant files under `docs/`.
2. Inspect the existing implementation and tests before proposing a new abstraction.
3. Identify whether the change is user-facing, schema-changing, release-related, or host-capability-dependent.
4. Prefer a small vertical slice with observable value over a horizontal framework rewrite.
5. Confirm that the feature belongs on the public roadmap. If it does not, add it or explain why it is intentionally excluded.

## Product invariants

- Markdown and repository artifacts remain the source of truth.
- No mandatory SpecRail cloud, account, database, or remote coordinator.
- No implementation before explicit specification approval.
- No final completion before real evidence, final approval, and deterministic delivery.
- Never assume a host tool, plugin, MCP, or command name exists. Discover and validate capabilities, and provide a non-blocking fallback where safe.
- Preserve existing `.ai/` projects and the `ai-flow` command alias unless a documented migration is approved.
- Do not turn SpecRail into a task board or duplicate GitHub/Jira/Azure DevOps.
- New agents, gates, or review passes require a measurable customer-value hypothesis.
- Review Cockpit is a derived read-only artifact; decisions must remain in deterministic CLI/native Codex gates.

## Engineering rules

- TypeScript must remain strict: no `@ts-nocheck`, broad `any` escapes, or disabled compiler guarantees without explicit justification.
- Deterministic state transitions belong in the CLI/library, not only in skill prose.
- External contracts such as CodeGraph must be probed and validated before use.
- Changes to persisted schemas require backward-compatible readers or an explicit migration with regression tests.
- File writes must be atomic where concurrent chats or processes can race.
- Repository and context paths must be canonicalized and prevented from escaping the repository boundary.
- Do not add network calls, telemetry, credentials, or remote storage without explicit product approval.
- Never log or commit passwords, npm tokens, OTPs, cookies, private keys, or personal access tokens.
- Avoid dependencies when the Node standard library is sufficient. Any new runtime dependency needs a clear benefit and security review.

## Documentation contract

Every user-facing behavior change must update the relevant documentation in the same change:

- `README.md` for installation, usage, commands, guarantees, or examples.
- `ROADMAP.md` for feature status, scope, exit criteria, and target sequence.
- `CHANGELOG.md` under the current release or `Unreleased` section.
- Relevant `docs/*.md` design or integration guide.
- CLI `--help` output when commands or flags change.

Do not mark a roadmap item **Shipped** until implementation, tests, docs, migration, clean install, and package validation are complete.


## Acceptance and scope governance rules

- Every observable acceptance criterion must have a stable `AC-*` ID before specification approval.
- Final approval requires canonical evidence for every effective criterion; do not use before/proposal artifacts as proof of an implemented result.
- Every implementation route must define the smallest credible CodeGraph-informed blast radius before approval.
- Treat unexpected files and protected changes as blockers, including new untracked files.
- Never edit the approved base specification or blast radius to make an implementation fit. Propose a bounded Specification Amendment and stop at the human gate.
- Approved amendments may extend criteria and scope while preserving the base approval history. A material route/risk/architecture/security/data change must return to full Product Specifier review instead of being hidden in a small amendment.
- Review Cockpit and Review Bundles must expose Acceptance Coverage, Scope Guard status, and amendment history from the same deterministic source.

## Experiment intelligence rules

- Replay token metrics must come from a real host/API/export usage record covering the entire Harness variant, including attributable repairs/subagents. Never estimate missing token usage or infer it from text length.
- Cached input tokens are a subset of input tokens; never double-count them in totals.
- Do not use token count as a cost tie-breaker across different or unknown model identities.
- Adaptive Harness recommendations are advisory only. Never modify a task's `execution_profile` without the normal user/specification governance.
- Do not infer workflow policy from one lucky replay. Preserve the configured minimum sample threshold and comparable cohort rules.
- Experiment scenarios must freeze the same specification, QA Mission, base commit, and verification policy across Harnesses.

## Testing and validation

Before declaring work complete:

```bash
npm run check
npm run release:check
```

Also verify as applicable:

- targeted unit/regression tests;
- clean install from the generated `.tgz` into an empty prefix and HOME;
- `specrail --version` and the backward-compatible `ai-flow --version`;
- `specrail install`, `specrail doctor`, and plan-first `specrail doctor --fix`;
- Readiness output agrees with Review Cockpit for the same task;
- replay variants preserve the same taskset/QA digests, stay isolated, exclude non-terminal samples, compare only after the experiment is terminal, and validate provenance-backed token accounting when usage is available;
- Acceptance Coverage is complete for final gates and Scope Guard includes untracked-file drift;
- `specrail harness recommend` stays advisory and reports insufficient data before the configured sample threshold;
- package and plugin versions match;
- `npm pack --dry-run` contains no secrets, fixtures, source-only types, or unnecessary files;
- README examples match the actual CLI;
- generated Review Cockpit HTML is self-contained, escaped, mobile-readable, and cannot mutate task state;
- migrations preserve previous `.ai/` projects.

A test that only verifies a file name exists is insufficient when the feature promises semantic validation or real evidence.

## Roadmap and release discipline

- Keep roadmap history; do not rewrite past shipped behavior to make current work look complete.
- Use prerelease versions and the `beta` npm tag until beta exit criteria are satisfied.
- Keep `package.json`, `plugin.json`, `CHANGELOG.md`, docs, and release workflow consistent.
- The intended repository is `https://github.com/saulmarti/specrail`.
- The primary npm package is `specrail`; `@saulmarti/specrail` is the documented fallback if the unscoped name cannot be published.
- Never run `npm publish`, create a GitHub repository/release, push commits, or configure trusted publishing without explicit user authorization in the current conversation.

## Pull request / change checklist

- [ ] Customer problem and success condition are clear.
- [ ] Change is represented correctly in `ROADMAP.md`.
- [ ] Implementation is the smallest coherent vertical slice.
- [ ] Persisted data remains compatible or is migrated.
- [ ] Tests cover success, failure, and regression paths.
- [ ] README, docs, CLI help, and changelog are synchronized.
- [ ] No host capability is assumed without discovery/fallback.
- [ ] `npm run check` passes.
- [ ] Generated tarball installs cleanly.
- [ ] No credentials or private data are present.
