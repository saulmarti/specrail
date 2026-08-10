# SpecRail 0.10.3 — Pi compatibility validation

## Result

**Compatibility contract: 100/100.**

This score means there are no known SpecRail-side compatibility gaps for running the governed workflow through the current Pi extension/package contract. It does not claim that optional host features have identical implementations across Codex and Pi. Where Pi does not truthfully attest a capability (for example independent parallel subagents), SpecRail uses its deterministic safe fallback instead of fabricating parity.

## Scorecard

| Area | Score | Evidence |
|---|---:|---|
| Pi package metadata + native/managed installation | 15/15 | `pi.extensions`, `pi.skills`, `typebox` peer contract, local-package managed registration, idempotent settings preservation |
| Pi extension lifecycle/API contract | 15/15 | `before_agent_start`, tools, command registration, current execute signature |
| CLI transport + error + concurrency semantics | 20/20 | direct Bash-shebang dispatcher, non-zero/killed → throw, mutating CLI + human gates sequential |
| Session identity + human gates + fresh-session handoff | 15/15 | real `sessionManager.getSessionId()`, exact `ctx.ui` mapping, headless fail-closed, replacement-session `withSession` |
| Activation + packaged orchestrator/specialists | 10/10 | natural delivery/Fast/continuation activation, total bypass, `specrail_skill(ai-flow)` + specialist loading, no `.agents` dependency on native Pi |
| CodeGraph structural context | 10/10 | `codegraph explore` bridge, read-only parallelism, transport failures fail closed |
| Taste + visual/evidence compatibility | 10/10 | Pi accepted as Taste host/root; canonical evidence + Review Cockpit fallback when Codex Visualize is absent |
| Host-neutral safety/fallbacks | 5/5 | model/thinking host-owned; subagent concurrency remains serial until truthfully attested |
| **Total** | **100/100** | **No known SpecRail-side Pi compatibility blocker remains** |

## Regression evidence

The full release gate for this source tree passes:

- `npm run release:check` → exit `0`;
- full Node test tier → **397/397** tests passed;
- auxiliary full-tier executions → **7/7** passed;
- release version metadata synchronized at **0.10.3**;
- `npm pack --dry-run` → success, **255 files** before adding this validation record;
- packaged-tarball smoke → extension loads, all Pi tools/command register, automatic `ai-flow` activation is injected, `specrail_cli --version` returns `0.10.3`, a real failing SpecRail command rejects, and sequential tool declarations are preserved.

The Pi adapter runtime regression suite additionally executes the real bundled SpecRail dispatcher and verifies native UI answer mapping, exact Pi session bridging, fresh-session continuation, CodeGraph failure semantics, packaged skill loading, Fast/bypass/continuation activation, and managed-install idempotency.

## Current Pi contract checked

The implementation was re-reviewed against the current Pi package/extension documentation and Pi **0.84.1** release contract on 2026-08-10. The relevant current contract includes package-declared extensions/skills, `typebox` as a Pi core peer dependency, `before_agent_start`, `sessionManager.getSessionId()`, `ctx.ui`, `ctx.newSession(...withSession)`, thrown tool errors, and sequential tool execution.

A live Pi binary could not be downloaded inside the execution sandbox because outbound release-asset redirects are blocked. Therefore this validation distinguishes **100% SpecRail-side contract compatibility** from a separate live-host certification run. No code issue remains known from that limitation; the shipped adapter is covered by executable contract/runtime tests and a smoke test against the exact npm tarball bytes.

## Fixed from the previous 73% audit

1. Removed forced `/bin/sh` transport that broke the Bash dispatcher on Linux/dash.
2. Non-zero/killed SpecRail and CodeGraph calls now throw, so Pi marks tool failures correctly.
3. Mutating SpecRail and human-decision tools are sequential under Pi parallel tool batching.
4. Taste accepts Pi and Pi skill roots instead of requiring Codex.
5. Pi-native and managed installs load the packaged `ai-flow` orchestrator and specialists through `specrail_skill`.
6. Managed installs register `~/.ai-flow` as a local Pi Package instead of copying a dependency-fragile loose extension.
7. Fresh-session handoffs use Pi replacement-session `withSession` with the fresh context.
8. Codex-specific UI/browser/Visualize assumptions are capability-gated and have truthful Pi fallbacks.
9. Runtime regressions now execute the actual dispatcher instead of only regex-checking source text.
