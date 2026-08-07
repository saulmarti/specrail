# SpecRail 0.5.0-beta.1 validation

Date: 2026-08-07

## Release identity

- npm package: `specrail`
- fallback package: `@saulmarti/specrail`
- version: `0.5.0-beta.1`
- dist-tag: `beta`
- author: Saúl Martí `<me@saulmarti.dev>`
- intended repository: `https://github.com/saulmarti/specrail`
- license: MIT

## Automated validation

- TypeScript strict build: PASS
- Node test suite: **119/119 PASS**
- CLI syntax check: PASS
- package/plugin version parity: PASS
- public metadata regression tests: PASS
- roadmap and agent-governance tests: PASS
- npm pack dry run: PASS
- actual npm tarball generation: PASS
- clean tarball installation: PASS
- installed `specrail --version`: `0.5.0-beta.1`
- installed legacy `ai-flow --version`: `0.5.0-beta.1`
- empty-HOME `specrail install`: PASS

## Tarball

- filename: `specrail-0.5.0-beta.1.tgz`
- compressed size: approximately 132.8 kB
- unpacked size: approximately 613.0 kB
- files: 130

Confirmed packaged public files include:

- `README.md`
- `ROADMAP.md`
- `AGENTS.md`
- `docs/PUBLISHING.md`
- `docs/REVIEW-COCKPIT.md`
- `docs/GITHUB-DELIVERY.md`
- `docs/BRANDING.md`
- `docs/prototypes/review-cockpit.html`

The tarball excludes source-only vendored types, tests, fixtures, and repository history.

## Publication safeguards

- `publishConfig.access` is `public`.
- `publishConfig.tag` is `beta`.
- `publishConfig.registry` is the public npm registry.
- README installation uses `npx specrail@beta install`.
- GitHub release workflow publishes with `--tag beta --provenance` and requires trusted publishing to be configured first.
- `AGENTS.md` forbids agents from publishing, pushing, creating releases, or configuring trusted publishing without explicit user authorization.
- `package-lock.json` pins TypeScript 5.8.3 using official npm registry metadata.

## Documentation validation

The public roadmap includes:

- Readiness / Why blocked;
- `specrail doctor --fix`;
- Review Cockpit;
- GitHub Issue → PR → CI → merge;
- Replayable Tasksets and Harness comparison;
- beta exit criteria and success metrics;
- Signed Delivery Bundle marked Deferred pending real demand.

The repository `AGENTS.md` requires every user-facing change to synchronize the roadmap, README, changelog, relevant docs, CLI help, tests, migrations, and package validation.

## Limitations before first publication

- The GitHub repository has not yet been created, so repository, issue, and homepage links will not resolve until `saulmarti/specrail` exists.
- Neither npm name is reserved until npm accepts the first publication. Search results currently show no public package page, but both names must be checked again immediately before publishing.
- This environment could not execute `npm ci` against the public registry because outbound npm resolution is restricted. The build/test suite ran with the exact globally available TypeScript 5.8.3, and the generated lockfile uses the official registry integrity metadata.
- No npm publish, GitHub repository creation, push, release, or trusted-publisher configuration was performed.
