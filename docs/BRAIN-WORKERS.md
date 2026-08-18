# Brain / Workers

Status: implementation in `feat/sparse-intelligence-routing`.

## Goal

Keep the model selected by the user in the current Codex/Pi chat as the **Brain**, while moving high-volume implementation work to cheaper isolated **Workers**. The Brain keeps all governed decision authority; Workers can reason locally but cannot change product intent or other sealed decisions.

This is not a model router that changes the main chat. The main-chat model stays selected for the whole conversation.

## Research basis

The implementation follows the manager/agents-as-tools pattern rather than conversational handoffs:

- OpenAI Agents SDK documents manager-style orchestration for cases where one agent must retain control of the conversation, combine specialist results, and apply common guardrails. Nested agents do not need the manager's full conversation/session.
- OpenAI's current model catalog positions GPT-5.6 Luna for cost-sensitive/high-volume workloads and Terra as the intermediate cost/intelligence tier. Luna supports the coding/tool surfaces needed by a SpecRail worker.
- Pi's official subagent example runs each subagent as a separate `pi` process and explicitly passes `--model`, which gives us genuine isolated model selection instead of prompt-level imitation.
- Codex supports explicit `--model` selection in `codex exec`. Native MultiAgent model overrides have had compatibility/inheritance regressions around Luna/V1/V2 metadata, so this implementation deliberately uses an isolated `codex exec --model ... --ephemeral` worker path instead of assuming native `spawn_agent` selected the requested cheaper model.

These sources justify the mechanism, not a promised SpecRail saving. Replay must measure the actual quality/cost frontier.

## Core invariant

> Brain decides. Workers do the bounded heavy work. Workers stop rather than acquire Brain authority.

### Brain owns

- user intent and consequential clarifications;
- Product Owner value/trade-off judgment;
- architecture and public-contract choices;
- security/privacy policy decisions;
- migration strategy;
- governed UX direction;
- approval/rejection of evidence-backed worker escalations;
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
| Target Audience / Final Customer | `brain` temporarily; existing fresh-session isolation is preserved until worker-session attestation is implemented |

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

The candidate list is runtime policy, not a promise that a host/provider exposes every model.

## Host adapters

### Pi

Worker transport:

```text
pi --mode json -p --no-session --model <worker-model> --thinking <effort> <worker-prompt>
```

The worker is a separate Pi process with isolated conversational context. JSON assistant messages expose model/usage metadata where available.

### Codex

Worker transport:

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

A future adapter may prefer native spawn only when the host can attest the exact effective child model.

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

Used by workers that need to persist `.ai` state/evidence but must not modify production code. The launcher compares Git status before/after and fails the Worker result if production/repository files changed.

### `production-with-scope`

Used only by Builder. A Builder WorkerOrder is not created unless Scope Guard is valid, sealed, and integrity-valid. Production changes remain bound to the sealed allowed/protected scope and normal post-Builder Scope Guard checks.

This allows Product Specifier/QA/Reviewer to persist their SpecRail artifacts without granting them Builder authority.

## Worker execution contract

Every Worker run is told:

- it is an isolated SpecRail Worker;
- the user-facing model is Brain and retains governed authority;
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

Brain consumes the result capsule, not the complete Worker transcript, then refreshes deterministic `next` state.

## Failure policy

Never turn ordinary Worker failure into an automatic expensive-model run.

- Luna unavailable as a model -> Terra may be attempted.
- Luna executed but tests failed -> Luna/normal repair policy handles the failure.
- Repair budget exhausted -> return failure/escalation to Brain.
- Governed decision needed -> `ESCALATE_TO_BRAIN`.
- Worker model cannot be selected/attested -> fail Worker routing explicitly.
- No compatible Worker host/runtime -> report unavailable; do not pretend the Brain run was a cheap Worker.

## Metrics

Only host-reported/worker-result usage with model provenance should drive economic decisions.

Track:

- Brain input/cached/output/reasoning tokens;
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

- WorkerOrder and result are digest-sealed.
- Worker model is explicit and recorded.
- Brain fallback is forbidden.
- Builder requires sealed Scope Guard.
- Non-Builder production mutation is treated as a Worker authority violation.
- Workers cannot make consequential user decisions.
- Existing approval, evidence, amendment, Ponytail, Scope Guard and final-delivery guarantees remain in force.

## Remaining hardening

1. Persist Worker results into task metrics/Replay automatically.
2. Add a host-attested Worker session identity usable by Target Audience fresh-session boundaries.
3. Add native Codex worker transport only if/when effective child-model identity can be attested reliably.
4. Validate WorkerOrder production-file globs directly in launcher in addition to normal Scope Guard validation.
5. Benchmark real SpecRail tasks: current single-model flow vs Brain/Luna Workers with identical acceptance/QA outcomes.

## Success criterion

Brain/Workers is successful only if, on comparable accepted tasks:

- Brain work/tokens fall materially;
- quality/acceptance does not regress outside an agreed band;
- rework does not erase the savings;
- time to first tangible result improves or remains acceptable;
- no governance/independence guarantees are weakened.
