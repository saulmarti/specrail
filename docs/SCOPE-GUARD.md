# Scope Guard / Blast Radius

Scope Guard prevents an agent from turning a focused request into an unauthorized refactor.

## Before approval

Product Specifier uses CodeGraph and repository context to propose the smallest credible implementation boundary:

```bash
specrail scope set TASK-0042 \
  --allowed-files 'src/home/HomeSpotlight.tsx,src/styles/home.css' \
  --protected-files 'src/home/ArtistCard.tsx,src/api/**' \
  --symbols 'HomeSpotlight,HomeSpotlightTitle' \
  --reason 'Only the approved Home Spotlight heading hierarchy should change.'
```

The boundary appears in the specification and Review Cockpit before the user approves it.

## Sealing and integrity

Specification approval verifies that the blast-radius JSON digest matches its contents and that the artifact matches the `Blast Radius` section shown to the user. It then seals that digest and its original baseline. Git repositories use the approved commit as the baseline. A deterministic filesystem snapshot is used as a compatibility fallback when no Git commit exists.

The hardened approval also seals governed project context and workflow policy. Changes to `.ai/project/product.md`, `product-owner.md`, `users.md`, `architecture.md`, `design-system.md`, `runbook.md`, `constitution.md`, or policy-bearing `.ai/config.json` keys become a stale approval gate instead of being silently ignored.

`learnings.md` and runtime/history artifacts remain mutable by design and are not part of this project-governance seal.

## During implementation

```bash
specrail scope status TASK-0042
```

SpecRail compares the actual working tree with the approved boundary and reports:

- allowed files;
- actual changed files;
- unexpected files;
- protected changes;
- baseline and effective scope digests;
- blast-radius artifact integrity;
- governed project-context integrity.

New untracked files are included. Git comparisons disable rename collapsing so moving a protected source to an allowed destination still exposes the protected deletion. Filesystem fallback snapshots include regular-file content/mode and symlink targets.

SpecRail runtime directories such as `.ai/`, `.codegraph/`, and `.ai-flow-worktrees/` remain excluded from the **product-file diff**. This is not a blanket trust exemption for `.ai/`: governed project/policy files are checked independently by the approval-integrity seal.

## Scope expansion

After specification approval, the base blast radius cannot be edited directly. A legitimate new dependency must go through a Specification Amendment. Approved amendments can add allowed files or explicitly remove a protected boundary while preserving the original approval history.

Final approval requires a valid Scope Guard result.

## Upgrading an existing 0.8.0-beta.1 approval

An intact approval created before the hardened integrity seal is reported as `stale` rather than being silently trusted. `specrail next TASK` surfaces a user reapproval gate. After the current specification, blast radius, and project context are shown and the user explicitly approves, the normal `specrail spec approve TASK` transition upgrades the seal **in place**: the current workflow phase/status and the original Scope Guard baseline are preserved.

If the legacy specification, QA Mission, Amendment set, blast-radius artifact, or original scope seal no longer validates, SpecRail refuses in-place promotion. Return the task to Product Specifier and perform a full review instead of rebasing around already-modified work.
