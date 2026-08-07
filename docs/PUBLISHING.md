# Publishing SpecRail to npm

## Maintainer identity

- npm user: `saulmarti`
- GitHub user: `saulmarti`
- intended repository: `https://github.com/saulmarti/specrail`
- public author: Saúl Martí `<me@saulmarti.dev>`
- license: MIT
- current release version: read from `package.json` (do not hardcode it in this document)
- initial dist-tag: `beta`

Never send an npm password, OTP, recovery code, cookie, or long-lived access token to an agent.

## Package-name strategy

The canonical npm package is scoped to the maintainer:

```text
@saulmarti/specrail
```

The unscoped `specrail` package is owned by another project and is **not** an alias or publication target for this repository. Keep the CLI binary names `specrail` and `ai-flow`; npm package scope and executable name are intentionally different.

Before every publication, verify the scoped package identity:

```bash
npm view @saulmarti/specrail
```

Do not publish this code under the unscoped `specrail` name and do not publish a duplicate full package under a second name.

## Create the GitHub repository first

1. Create a public repository named `specrail` under `saulmarti`.
2. Push the reviewed source tree.
3. Confirm these URLs resolve:

```text
https://github.com/saulmarti/specrail
https://github.com/saulmarti/specrail/issues
```

The `repository.url` in `package.json` must match the real repository, especially before configuring npm trusted publishing.

## First beta publication from your machine

```bash
npm login
npm whoami
npm ci
npm run release:check
npm pack
```

Install and test the generated tarball in a clean location before publication.

Then publish explicitly under the beta tag:

```bash
npm publish --access public --tag beta
```

Because the version is a prerelease, never publish it as `latest`. Users install with:

```bash
npm install -g @saulmarti/specrail@beta
specrail install
```

For a one-shot install without a global npm package:

```bash
npx --package=@saulmarti/specrail@beta specrail install
```

## Later releases: trusted publishing

After the package and GitHub repository exist:

1. Configure an npm trusted publisher for the npm package `@saulmarti/specrail`, backed by the GitHub repository `saulmarti/specrail`, and the exact release workflow.
2. Keep GitHub Actions permissions at `contents: read` and `id-token: write`.
3. Publish with provenance from GitHub Actions rather than a stored npm token.
4. Continue using `beta` until the roadmap beta exit criteria are satisfied.

The included `.github/workflows/release.yml` runs on a published GitHub Release. Do not enable it until the npm trusted publisher is configured.

## Version synchronization

`package.json` is the canonical release version. Never update `plugin.json` or `package-lock.json` manually.

The npm `version` lifecycle runs `npm run version:sync`, which copies the new `package.json` version into `plugin.json` and both package-lock version fields before npm creates the version commit/tag. `npm run check`, `npm run release:check`, and `prepublishOnly` all execute `version:check`, so a drifted release is rejected before packing or publishing.

If a version command was interrupted after changing `package.json`, repair the metadata with:

```bash
npm run version:sync
npm run version:check
```

## Release checklist

- [ ] `ROADMAP.md` status and scope are current.
- [ ] `CHANGELOG.md` contains the release.
- [ ] `AGENTS.md`, README, docs, and CLI help match behavior.
- [ ] `npm run version:check` confirms `package.json`, `package-lock.json`, and `plugin.json` match.
- [ ] repository metadata is exact and public.
- [ ] `npm ci` succeeds.
- [ ] `npm run check` succeeds.
- [ ] `npm run release:check` succeeds.
- [ ] `npm pack --dry-run` contains no secrets or unnecessary files.
- [ ] generated `.tgz` installs in a clean prefix.
- [ ] `specrail --version` and `ai-flow --version` match the release.
- [ ] `specrail install` succeeds in an empty HOME.
- [ ] README examples match the current beta tag and CLI.
- [ ] Git tag and GitHub Release match the npm version.
- [ ] publication uses `--tag beta` for prereleases.
