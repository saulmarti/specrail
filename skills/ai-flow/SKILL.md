---
name: ai-flow
description: Automatically use for repository delivery requests to create, change, fix, redesign, implement, execute, continue, review, or validate frontend, backend, architecture, database, bugs, features, refactors, and design—including Spanish crea, cambia, corrige, rediseña, implementa, ejecuta, continúa, retoma, revisa, or valida. Creates or resumes Markdown tasks naturally; do not use for read-only explanations or research.
---
# AI Flow

Do not require the user to mention AI Flow, a skill name, a task ID, or a CLI command. Use the global CLI internally and do not expose internal CLI instructions to the user.

## Deterministic control

1. Resolve existing work with `ai-flow resolve` by ID, exact title, or unique phrase. The task Markdown is the source of truth. When ambiguous, show the native task selector; never guess or create a duplicate.
2. Show references as `TASK-#### — Title`, which are easy to reference in another chat by ID, title, or descriptive phrase.
3. Run the deterministic CodeGraph preflight before agent reasoning: `codegraph init <repo> --index` when missing, otherwise `codegraph sync <repo>`, recover with `codegraph index <repo> --force --quiet`, then verify with `codegraph status <repo>`. Do not ask the user to initialize or sync it manually.
4. Read `next`; its `readiness` field is the same deterministic contract used by `specrail readiness`, `why-blocked`, and Review Cockpit. Explain failed/stale gates and the returned shortest safe next action rather than inventing a status. Then explicitly load `.agents/skills/<recommendedSkill>/SKILL.md`. Do not rely on automatic mid-turn skill reselection and do not keep unrelated skills in context.
   - If `next.action` is `reapprove-hardened-specification`, show the supplied specification review and use native user input. Only after explicit approval call the normal specification-approval transition; never rebase or recreate the legacy Scope Guard baseline.
5. Use a stable internal session token and obey `resolve-task-lease`; never let two chats write the same task concurrently.
6. Respect the approved specification hash, immutable QA mission hash, dependencies, repair budget, evidence gates, and `context.policy` progressive budget. Keep context small.
7. Open or render the first `review-cockpit` HTML attachment when the host supports it, then render `presentation.markdown` in chat and attach every `presentation.attachments` item before calling `request_user_input`. Do not ask for approval when required presentation or evidence cannot be shown.
8. Continue until the next human gate or genuine blocker.

## Environment repair and workflow experiments

- For setup failures, use `doctor --fix` as a plan first. Present its native decision; apply only the listed safe/reversible fixes after approval. Never silently install or change external Node, Git, CodeGraph, MCP, or host plugins.
- Replay is an experiment, not normal task execution. Create it only from an approved unchanged specification with sealed QA Mission. Each harness variant gets a fresh isolated worktree/context, must not inspect another variant, preserves identical verification, records real evidence, and is compared only after equal acceptance + QA checks. Record exact variant-total input/cached-input/output token usage only when the host exposes an aggregate covering the whole Harness run; never estimate missing usage and never compare token cost across different/unknown models. Never collapse replay trade-offs into an invented quality score.
- Historical Harness recommendations are advisory. Use `harness recommend` only after enough comparable replay data exists, explain its evidence/trade-offs, and never change `execution_profile` silently.

## Visualize

Visualize is optional and supplementary. Discover the exact capability from the current host tool/plugin list; never invent a tool name. Use it only when an interactive experience improves comprehension: option comparison, workflow timeline, before/proposal/after comparator, request/response explorer, architecture layer explorer, migration explorer, or final review tabs. Follow the signed plan and source digests, invoke at most once per gate, and record the real tool call or invocation reference. Evaluate high-impact output with fresh context. A static decorative summary is not successful. Markdown and evidence remain authoritative fallback.

## Human decisions

Use `request_user_input` for ambiguity, scope, architecture, data, security, privacy, migrations, important UX, eval activation, repair-limit recovery, specification approval, final approval, and delivery. Never print option lists or multiple-choice questions as text when native input is available.

## Workflow invariants

- Product Specifier refines until no material ambiguity remains, writes the immutable executable QA Mission, selects risk-based quality and operational evidence, and creates vertical slices for large features.
- The deterministic specification linter must pass. Approval hashes the governed specification; any governed change invalidates approval.
- Generate the read-only Review Cockpit plus authoritative `review-bundle`; show both before each approval.
- Failures and user rejections are classified. Repeated patterns become eval candidates, activated only after user approval. Load `activeEvals` returned by deterministic routing and run them as regression checks before completing the matching phase.
- Repair loops are finite. After the profile limit, stop and consult the user.
- Constitution principles require user approval and a deterministic enforcement command.
- Frontend before evidence must focus the exact task target. Proposals use the official installed Taste Skill workflow and Image Gen; final evidence uses the real app and browser/DevTools.
- High-risk or material UI work requires an independent Technical Reviewer with fresh context.
- Property testing, mutation testing, logs, traces, and metrics run only when selected by risk.
- Large features execute as small demonstrable vertical slices, not horizontal frontend/backend/database-only layers.
- Do not spawn subagents for trivial work. Use at most three read-only subagents for useful parallel analysis; writing subagents require approved non-overlapping slices.
- Code or migration work uses a task worktree. Done requires final approval and explicit delivery/merge; use `delivery merge` or externally confirmed delivery.
- Store structured traces and metrics locally only; no external telemetry.

For frontend work, the primary screenshot must focus the exact task target; page-top and full-page captures are context only.

## Acceptance, scope, and change requests

Before specification approval, require stable `AC-*` criteria and a CodeGraph-informed Blast Radius for implementation tasks. Final approval requires 100% canonical Acceptance Coverage and a clean Scope Guard. Evidence must declare the criteria it proves.

After approval, governed scope is immutable except through a Specification Amendment. Present every proposed amendment with reason, added acceptance criteria, blast-radius changes, and impact using the native `request_user_input` gate. Never self-approve an amendment or silently edit the approved base specification. Approved amendments extend the effective specification hash while preserving the original approval history.
