# Brain / Workers

Status: implementation in `feat/brain-workers`.

## Goal

Keep the model selected by the user in the current Codex/Pi chat as the **Brain**, while moving high-volume implementation work to cheaper isolated **Workers**. The Brain keeps all governed decision authority; Workers can reason locally but cannot change product intent or other sealed decisions.

This is not a model router that changes the main chat. The main-chat model stays selected for the whole conversation.

## Research basis

The implementation follows the manager/agents-as-tools pattern rather than conversational handoffs:

- OpenAI Agents SDK documents manager-style orchestration for cases where one agent must retain control of the conversation, combine specialist results, and apply common guardrails. Nested workers do not need the manager's full conversation/session.
- OpenAI's current model catalog positions GPT-5.6 Luna for high-volume/cost-sensitive workloads, with Terra as a stronger intermediate tier. Luna exposes the coding/tool surfaces needed by a SpecRail Worker.
- Pi's official subagent example runs each subagent as a separate `pi` process and explicitly passes `--model`, which gives us isolated model selection instead of prompt-level imitation.
- Codex supports explicit `--model` selection in `codex exec`. Native MultiAgent model overrides have had model-catalog/inheritance compatibility regressions around Luna/V1/V2 metadata, so v1 deliberately uses isolated `codex exec --model ... --ephemeral` workers instead of assuming native `spawn_agent` selected the requested cheaper model.

These sources justify the mechanism, not a promised SpecRail saving. Replay/real usage must measure the actual quality/cost frontier.

## Core invariant

> Brain decides. Workers do the bounded heavy work. Workers stop rather than acquire Brain authority.

### Brain owns

- user intent and consequential clarifications;
- Product Owner value/trade-off judgment;
- architecture and public-contract choices;
- security/privacy policy decisions;
- migration strategy;
- governed UX direction;
- approval/rejection of evidence-backed Worker escalations;
- final human-facing explanation and gates.

### Workers own

When routed:

- repository discovery and focused synthesis;
- project/product-context bootstrap from existing facts;
- specification materialization after decisions are known;
- bounded design support;
- production implementation;
- test/debug loops;
- QA execution and evidence collection;
- independent review analysis;
- log/output compression and other high-volume mechanical work.

Workers may reason locally about implementation mechanics. They are not dumb patch generators.

## Ownership is orthogonal to existing SpecRail controls

Three dimensions remain independent:

1. `micro | light | standard | rigorous` — governance/control depth.
2. `Guided | Autonomous | Headless` — human authority policy.
3. `none | brain | worker` — who should perform the next model-owned work.

A `rigorous` Builder can still be Worker-owned. Strong verification requirements do not imply that the expensive Brain should execute the code/test loop itself.

## Routing policy

Current v1 policy:

| Work | Owner |
|---|---|
| Human/deterministic gate | `none` |
| Product Intelligence bootstrap | `worker` |
| Product Owner review/final review | `brain` |
| Product Specifier materialization | `worker` |
| UX/design support | `worker`, material direction escalates |
| Technical architecture/data decision | `brain` |
| Builder implementation | `worker` |
| Technical Review analysis | `worker` |
| QA/test/debug/evidence | `worker` |
| Target Audience / Final Customer | `brain` temporarily; existing fresh-session isolation is preserved until Worker-session independence is explicitly attested |

The audience exception is deliberate. Token savings never weaken an existing independence boundary.

## Worker model policy

Default ordered candidates:

1. `gpt-5.6-luna`
2. `gpt-5.6-terra`

Rules:

- The Worker model is selected explicitly by the Worker launcher.
- Terra is attempted only when Luna is unavailable as a model, not because Luna produced a normal implementation/test failure.
- The Brain model is never an automatic Worker fallback.
- A Worker result records requested/effective model and attestation.
- Worker token usage is economically counted only when model selection is attested.

The candidate list is runtime policy, not a promise that every host/provider exposes every model.

## Deterministic launch capsule

`specrail next` returns `intelligence` for the immediate actor/action. When ownership is `worker`, `intelligence.workerLaunch` contains the exact host invocation parameters. Brain does not reconstruct routing or choose a Worker model.

Conceptually:

```json
{
  "tier": "worker",
  "workerLaunch": {
    "required": true,
    "task": "TASK-0001",
    "actor": "ai-flow-builder",
    "action": "continue",
    "recommendedSkill": "ai-flow-builder",
    "codex": {
      "command": "specrail-worker",
      "args": ["--task", "TASK-0001", "--actor", "ai-flow-builder", "--action", "continue", "--skill", "ai-flow-builder", "--host", "codex"]
    },
    "pi": {
      "tool": "specrail_worker",
      "args": {
        "task": "TASK-0001",
        "actor": "ai-flow-builder",
        "action": "continue",
        "skill": "ai-flow-builder"
      }
    }
  }
}
```

A Brain seeing `tier=worker` delegates rather than executing that phase itself when the packaged Worker transport is available.

## Host adapters

### Pi

Pi exposes a first-class `specrail_worker` tool. It takes only the exact task/actor/action/skill from `next`; model selection is intentionally not a tool argument.

The tool runs the packaged launcher, which uses:

```text
pi --mode json -p --no-session --model <worker-model> --thinking <effort> <worker-prompt>
```

The Worker is a separate Pi process with isolated conversational context. JSON assistant messages expose model/usage metadata where available. Worker failures are returned as structured evidence to Brain instead of being converted into a Brain execution.

### Codex

Managed installation provisions `~/.local/bin/specrail-worker`. Worker transport uses:

```text
codex exec \
  --model <worker-model> \
  --json \
  --ephemeral \
  -C <workspace> \
  --sandbox workspace-write \
  <worker-prompt>
```

Why not native `spawn_agent` for v1: native multi-agent model overrides have had real model-catalog/inheritance compatibility issues, especially for Luna. An isolated explicit process is easier to fail closed and never needs to inherit the Brain selector.

A future adapter may prefer native spawn only when the host can attest the exact effective child model reliably.

## WorkerOrder

Workers never receive the full conversation. `worker-orders.ts` creates an integrity-sealed capsule under:

```text
.ai/runtime/workers/TASK-####/WO-XXXXXXXXXXXX.json
```

A WorkerOrder contains only:

- task/phase/role identity;
- ordered explicit Worker model candidates;
- reasoning effort;
- mutation authority;
- approved specification/QA/Scope Guard hashes;
- compact sealed decisions;
- goal;
- scope/out-of-scope;
- acceptance criteria;
- allowed/protected files;
- bounded context file/symbol seeds;
- stop/escalation conditions.

It intentionally excludes chat history, discarded alternatives, prior chain-of-thought, broad repository dumps, and speculative implementation plans.

## Mutation authority

OS sandbox capability and SpecRail mutation authority are separate.

### `specrail-state-only`

Used by Workers that need to persist `.ai` state/evidence but must not modify production code. The launcher snapshots production state before/after, attributes only the Worker delta even when files were already dirty, detects Worker-created commits, and fails the result if the Worker changed production/repository files. Common generated dependency/build/cache directories are excluded from the production snapshot.

### `production-with-scope`

Used only by Builder. A Builder WorkerOrder is not created unless Scope Guard is valid, sealed, and integrity-valid. The launcher combines worktree/HEAD deltas and validates changed production paths directly against sealed allowed/protected globs; normal post-Builder Scope Guard validation still applies.

The launcher also hashes the WorkerOrder before execution and fails if the Worker tampers with its own authority capsule.

This allows Product Specifier/QA/Reviewer to persist their SpecRail artifacts without granting them Builder authority.

## Worker execution contract

Every Worker run is told:

- it is an isolated SpecRail Worker;
- the user-facing model is Brain and retains governed authority;
- it has a Worker session identity separate from the Brain session;
- no recursive Worker/subagent spawning;
- no user questions from Worker mode;
- no product/architecture/contract/security/migration/governed-UX decisions;
- local implementation reasoning is allowed inside sealed authority;
- deterministic repository/tool evidence comes before broad reading;
- final response is compact.

Normal completion shape:

```text
STATUS: COMPLETED
CHANGED: ...
VALIDATED: ...
ESCALATION: none
```

Governed uncertainty shape:

```text
STATUS: ESCALATE_TO_BRAIN
Decision: ...
Evidence: ...
Options: ...
Worker recommendation: ...
Blocked because: ...
```

Brain consumes the validated result capsule, not the complete Worker transcript, then refreshes deterministic `next` state.

## Worker result trust

`worker-results.ts` validates a result before Brain consumption:

- result digest must be valid;
- task/order identity must match the sealed WorkerOrder;
- Brain fallback must be false;
- WorkerOrder tampering fails;
- successful/escalated runs require requested model == effective model with attestation;
- effective model must belong to the sealed candidate list;
- mutation/scope violations cannot masquerade as success;
- usage counters must be non-negative and cached input cannot exceed input.

Only after those checks can a Worker result become an economic usage record.

## Failure policy

Never turn ordinary Worker failure into an automatic expensive-model run.

- Luna unavailable as a model -> Terra may be attempted.
- Luna executed but tests failed -> Luna/normal repair policy handles the failure.
- Repair budget exhausted -> return failure/escalation to Brain.
- Governed decision needed -> `ESCALATE_TO_BRAIN`.
- Worker model cannot be selected/attested -> fail Worker routing explicitly.
- No compatible Worker host/runtime -> report unavailable; do not pretend the Brain run was a cheap Worker.

## Metrics

Only host-reported/Worker-result usage with model provenance should drive economic decisions.

Track:

- Brain input/cached/output/reasoning tokens when the host can expose them;
- Worker input/cached/output/reasoning tokens;
- Brain token share;
- Worker token share;
- Worker calls;
- Brain calls;
- Worker model-attestation coverage;
- model identity by call/phase;
- repair attempts;
- tokens/time before first tangible output;
- accepted outcome and discarded rework.

Cached input is a subset of input. Reasoning tokens are diagnostic output detail and are not added again to total tokens.

Do not set a hard target such as “Brain <= 10%” until Replay provides enough comparable evidence. Optimize accepted-result cost, not token share in isolation.

## Relationship with Multi-Agent Concurrency

Brain/Workers and Multi-Agent Concurrency solve different problems.

- Brain/Workers decides **who performs one bounded unit of cognitive/execution work**.
- Multi-Agent Concurrency schedules **independent task lanes/worktrees**.

A Worker never recursively spawns Workers. Existing concurrency leases/reservations/non-overlapping scopes remain authoritative for parallel task execution.

## Security / trust properties

- WorkerOrder and Worker result are digest-sealed.
- Worker model is explicit and recorded.
- Brain fallback is forbidden.
- Builder requires sealed Scope Guard.
- Non-Builder production mutation is treated as a Worker authority violation.
- Builder production deltas are checked against allowed/protected scope in the launcher and again by normal Scope Guard.
- Workers cannot make consequential user decisions.
- Existing approval, evidence, amendment, bundled Ponytail, Scope Guard and final-delivery guarantees remain in force.

## Validation coverage

Quick-suite regressions cover:

- Brain vs Worker routing;
- exact Worker launch capsules;
- Luna-first/Terra-on-unavailable fallback;
- no Terra/Brain promotion for ordinary Worker failure;
- pre-existing dirty-file attribution;
- state-only production mutation failure;
- Builder allowed/protected scope enforcement;
- Worker result binding/model attestation;
- Brain/Worker token accounting;
- managed Worker launcher installation;
- Pi first-class Worker tool presence.

## Remaining hardening

1. Persist/aggregate Worker usage automatically into task metrics and Replay comparisons, and ingest Brain usage when the host exposes reliable per-turn usage.
2. Extend the Worker adapter to Target Audience only when its independent session identity can satisfy the existing fresh-session boundary mechanically.
3. Prefer native Codex subagent transport only if a future host version can attest exact effective child-model identity as reliably as the isolated process.
4. Benchmark real SpecRail tasks: current single-model flow vs Brain/Luna Workers with identical acceptance/QA outcomes.

## Success criterion

Brain/Workers is successful only if, on comparable accepted tasks:

- Brain work/tokens fall materially;
- quality/acceptance does not regress outside an agreed band;
- rework does not erase the savings;
- time to first tangible result improves or remains acceptable;
- no governance/independence guarantees are weakened.
