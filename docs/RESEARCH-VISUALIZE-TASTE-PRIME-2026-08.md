# Visualize, Taste Skills, and Prime Intellect research

Date: 2026-08-07

## Executive conclusions

### Visualize

The strongest public description of the Codex Visualize preview says that some ideas become clearer when users can **see and interact** with them, illustrated by a planet simulator with controls. Therefore AI Flow must not treat Visualize as a prettier Markdown card. A successful use should expose meaningful interaction such as:

- before / proposal / after switching;
- viewport or scenario selection;
- option and consequence comparison;
- workflow timeline exploration;
- request/response cases;
- architecture or migration layers;
- review tabs that preserve failed checks.

Because plugin availability can vary by Codex plan, role, workspace, surface, and included app permissions, AI Flow discovers the real capability per session and never assumes a stable tool name. Markdown and canonical evidence remain authoritative.

### Taste Skills

The official repository distinguishes install/frontmatter names from folder names and says each skill has one job. The correct names used by AI Flow are:

- `design-taste-frontend`: default v2, currently experimental;
- `gpt-taste`: stricter GPT/Codex variant;
- `redesign-existing-projects`: audit-first redesign of an existing product;
- `imagegen-frontend-web` / `imagegen-frontend-mobile`: image proposal skills;
- `image-to-code`: image-first analysis and implementation handoff.

The v2 workflow adds brief inference, design-language mapping, VARIANCE / MOTION / DENSITY controls, redesign audit, and a strict preflight. AI Flow now validates those actual frontmatter names and records absolute `SKILL.md` paths.

### Prime Intellect

The useful abstraction is to split an agent environment into:

- **Taskset — what:** data, tools, scoring, and success criteria.
- **Harness — how:** the agent program, tools, compaction, and subagents.
- **Runtime — where:** local process, worktree, container, or sandbox.
- **Trace — evidence of the rollout:** a typed, branchable message/event graph.

AI Flow maps these ideas without adopting another runtime:

- specification + immutable QA Mission = taskset;
- global role skills + deterministic gates = harness;
- repository/worktree = runtime;
- `.ai/runtime/traces` = branch-aware trace.

A new chat or subagent creates a branch while preserving the shared parent state. Metrics consume the same trace rather than reconstructing history from prose.

## Changes derived from the research

1. Visualize plans now require an interactive experience definition with views, controls, and a default view.
2. Visualize remains optional and source-bound; a plan object never counts as a rendered result.
3. Taste validation uses official install/frontmatter names and exact local skill files.
4. QA Mission is part of the approved taskset, not invented by QA after implementation.
5. Failures are converted into user-approved regression contracts.
6. Repair loops have finite deterministic limits.
7. Trace events identify taskset hashes, harness, runtime, parent event, and branch.
8. Large features are split into end-to-end demonstrable slices rather than horizontal technical layers.
9. Quality and operational verifiers require measurable evidence.

## Sources reviewed

- Prime Intellect, “verifiers v1: Decomposing Tasksets and Harnesses for Agentic RL & Evaluations”, 2026-07-10.
- Prime Intellect Verifiers documentation.
- Leonxlnx/taste-skill official README, skill files, and changelog.
- OpenAI plugin documentation for Codex availability and permissions.
- Public reposts of the Codex Visualize preview description and example.

## Limitations

The original X posts could not be reliably parsed directly in this build environment. Their claims were checked against indexed reposts, the official Taste repository, Prime Intellect’s primary article/docs, and OpenAI’s plugin documentation. The real Visualize tool name and renderer still require one physical test in the user’s Codex Desktop session.
