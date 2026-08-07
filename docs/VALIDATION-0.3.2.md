# AI Flow 0.3.2 validation

## Results

- Strict TypeScript build: passing.
- Source test suite: 92/92 passing.
- No `@ts-nocheck` in `src/`.
- Agent Plugins manifest and seven immediate skills: valid.
- CodeGraph CLI contract probes and incompatible-contract regression: passing.
- Visualization capability migration from schema 1: passing.
- Signed visualization plan/source digests: passing.
- Missing plan, wrong provider, missing invocation reference, stale sources, low quality, and self-evaluated high-impact visuals: rejected.
- Unavailable host capability: non-blocking fallback recorded.
- Installer idempotence and compact global activation block: passing.

## Visualize contract

A plan is not proof of rendering. A successful record requires:

1. actual session tool/plugin discovery;
2. exact exposed tool name;
3. matching persisted plan and source digests;
4. unchanged canonical sources;
5. real host invocation reference;
6. hashed result summary;
7. risk-appropriate quality evaluation;
8. Markdown/evidence fallback retained.

## External limitation

This environment cannot run the user's Codex Desktop host or its installed Visualize capability. The package validates the integration contract and fallback behavior; physical rendering remains an acceptance check on the user's Mac.
